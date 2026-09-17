// lib/photoWarm.js — THE SELF-HEALING WORKER behind app/api/cron/photo-warm.
//
// WHY THIS EXISTS (2026-09-17). Today 2,959 of 4,448 visible rail places had
// no photo, and the fix was a MANUAL, one-off script that called production
// /api/photo once per missing place. Production must now do this itself,
// hourly, forever — this is that job's pure, injectable core. The route
// (app/api/cron/photo-warm/route.js) is a THIN CALLER, same shape as
// lib/photoRepair.js + app/api/cron/photo-repair/route.js: auth, the
// VERCEL_ENV=production gate and the pulse write live in the route; every
// decision about WHAT to warm and WHEN TO STOP lives here, so
// scripts/test-photo-warm.mjs can prove the whole contract with an injected
// fetch and clock, never a live network call.
//
// THE ONE GATED PATH, REUSED, NOT REBUILT. This file never imports
// lib/spendGate.js and never contains the literal string
// "places.googleapis.com" (scripts/test-photo-protection.mjs case 5, extended
// to name this file and the route). It does not decide whether a photo may be
// bought — it only decides WHICH places to ask, by calling this site's OWN
// `${origin}/api/photo?ref=...&w=640` exactly the way a real card would, so
// every existing safety property (the ledger, the daily quota breaker,
// fresh-name-first, the negative cache, refunds) applies automatically. A
// PROBE request (`x-wayfind-photo-probe: 1`) first checks whether a place is
// already served — never spends — and only a place that probes empty gets the
// REAL request, with no probe header, that can actually take a ledger grant.
//
// STOP CONDITIONS, IN THE ORDER THEY ARE CHECKED:
//   1. the caller's own time budget (`workBudgetMs`, owned INSIDE the route's
//      `maxDuration`, same "worker budget < platform ceiling" pattern as
//      lib/photoRepair.js's WORK_BUDGET_MS) — stopReason "deadline".
//   2. `max` real (non-probe) attempts reached — stopReason "max". This is
//      PHOTO_WARM_MAX (env, default DEFAULT_PHOTO_WARM_MAX): a bound on PAID
//      attempts, never on probe checks, which are free.
//   3. a real request answers with a PAUSE reason (quota-open / spend-denied
//      / gate-shut / unconfigured) — the run stops IMMEDIATELY, mid-list,
//      because every one of those means "nothing further will succeed right
//      now either" (an exhausted daily quota, a shut gate, a missing key, or
//      the ledger itself refusing). `paused: true` is what the route's pulse
//      note reads as "paused until reset" rather than as a normal, bounded
//      stop.
//
// ROTATION. `offsetHour` shifts which (surface, city) pair the run STARTS on,
// so a backlog larger than one run's budget/max drains fairly across
// successive hourly runs instead of the same head-of-list surfaces winning
// every single time (the exact "the audit only ever looked at /api/rails"
// shape this whole lane exists to end, reproduced hour after hour instead of
// audit after audit).
import { PHOTO_SURFACES, extractPlaces, photoRequestFor, landingCityList } from "./photoSurfaces.js";
import { cgetMany } from "./serverCache.js";
import { photoCacheKey } from "./placePhotoServe.js";

// BATCHED "ALREADY SERVED" CHECK (2026-09-17, integrator review). Probing
// every visible place over HTTP each hour would be ~5,000 self-requests into
// lib/apiGuard.js's 120/min per-IP limit. Instead, one batched read of the
// exact canonical cache rows (photo|<ref>|640, the width every card now
// shares) settles most places in a handful of round trips; only the
// remainder is probed over HTTP (which still sees same-place recovery and
// the free licensed lane), and those requests are paced.
const WARM_CHECK_WIDTH = 640;
// URL BUDGET (2026-09-17, measured in production). A Google photo name is
// about 700 characters and cgetMany sends every key inside one PostgREST
// `k=in.(...)` query string. The first production run used chunks of 150
// (over 100 KB of URL), every read was refused, the check silently settled
// nothing, and the run reported 2,033 of 2,107 visible places as empty when
// most were served. Chunks are now sized by URL length, not key count.
export const WARM_CHECK_URL_BUDGET = 6000;
export function chunkKeysForUrl(keys, budget = WARM_CHECK_URL_BUDGET) {
  const chunks = [];
  let cur = [], len = 0;
  for (const k of keys) {
    const cost = encodeURIComponent('"' + String(k).replace(/"/g, '""') + '"').length + 3;
    if (cur.length && len + cost > budget) { chunks.push(cur); cur = []; len = 0; }
    cur.push(k); len += cost;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
const WARM_CHECK_PARALLEL = 6;
async function defaultCachedServed(refs) {
  const out = new Set();
  if (!refs.length) return out;
  const chunks = chunkKeysForUrl(refs.map((r) => photoCacheKey(r, WARM_CHECK_WIDTH)));
  for (let i = 0; i < chunks.length; i += WARM_CHECK_PARALLEL) {
    const batch = chunks.slice(i, i + WARM_CHECK_PARALLEL);
    const maps = await Promise.all(batch.map((keys) => cgetMany(keys).catch(() => new Map())));
    maps.forEach((hits, j) => {
      for (const k of batch[j]) {
        const h = hits.get(k);
        if (h && !h.stale) out.add(k.slice(PHOTO_KEY_PREFIX_LEN, k.length - WIDTH_SUFFIX_LEN));
      }
    });
  }
  return out;
}
const PHOTO_KEY_PREFIX_LEN = "photo|".length;
const WIDTH_SUFFIX_LEN = ("|" + WARM_CHECK_WIDTH).length;
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export const DEFAULT_PHOTO_WARM_MAX = 150;
const DEFAULT_WORK_BUDGET_MS = 270_000;

// x-wayfind-photo-result values, per lib/placePhotoServe.js / app/api/photo's
// own documented contract (see this repo's CONTEXT header) — SERVED_RESULTS
// mirrors scripts/photo-coverage-crawl.mjs's identical set so "served" means
// the same thing whether it is measured or warmed.
export const SERVED_RESULTS = new Set(["cache", "inventory", "inventory-ref-cache", "same-place-cache", "owned-free", "google"]);
export const PAUSE_REASONS = new Set(["quota-open", "spend-denied", "gate-shut", "unconfigured"]);

function rotate(list, offset) {
  if (!list.length) return list;
  const n = ((Number(offset) || 0) % list.length + list.length) % list.length;
  return list.slice(n).concat(list.slice(0, n));
}

function buildWorkUnits(surfaces, cities) {
  const units = [];
  for (const surface of surfaces) {
    if (surface.perCity) for (const city of cities) units.push({ surface, city });
    else units.push({ surface, city: null });
  }
  return units;
}

async function fetchEndpointBody(fetchImpl, url, headers) {
  const r = await fetchImpl(url, { headers, redirect: "follow" });
  if (!r || !r.ok) return null;
  const text = typeof r.text === "function" ? await r.text() : "";
  try { return JSON.parse(text); } catch { return text; }
}

// One request to our own /api/photo. `probe: true` sends the header that
// lib/placePhotoServe.js's resolver treats as "never call authorizeSpend" —
// used ONLY to check whether a place is already served. `probe: false` sends
// NO such header, ever — that is the one request in this whole file that can
// take a real ledger grant, and it is made at most `max` times per run.
async function fetchPhotoResult(fetchImpl, url, probe) {
  const headers = probe ? { "x-wayfind-photo-probe": "1" } : {};
  const r = await fetchImpl(url, { headers, redirect: "manual" });
  const get = (k) => (r && r.headers && typeof r.headers.get === "function" ? r.headers.get(k) : null);
  return { status: r ? r.status : 0, resultHeader: get("x-wayfind-photo-result") };
}

/**
 * Run one bounded warm pass. Every I/O dependency is injectable so this is
 * fully hermetic under test: `fetchImpl` replaces the network, `now`/`startedAt`
 * replace the wall clock.
 *
 * @returns {{visible:number, alreadyServed:number, attempted:number, filled:number,
 *   free:number, stillEmpty:number, unsourceable:number, paused:boolean,
 *   pausedReason:string|null, stopReason:string|null, max:number}}
 */
export async function runPhotoWarm({
  origin,
  max = DEFAULT_PHOTO_WARM_MAX,
  startedAt = Date.now(),
  now = Date.now,
  fetchImpl = fetch,
  surfaces = PHOTO_SURFACES,
  cities = landingCityList(),
  offsetHour = new Date().getUTCHours(), // one-clock-ok: default rotation index (round-robin over work units) when a caller does not inject one; never a content daypart decision
  endpointHeaders = {},
  workBudgetMs = DEFAULT_WORK_BUDGET_MS,
  cachedServed = defaultCachedServed,
  paceMs = 0,
  collectShare = 0.45,
} = {}) {
  if (!origin) throw new Error("runPhotoWarm requires an origin");
  const deadlineAt = startedAt + Math.max(0, Number(workBudgetMs) || 0);
  const safeMax = Math.max(0, Number(max) || 0);
  const units = rotate(buildWorkUnits(surfaces, cities), offsetHour);
  const seen = new Set();

  let visible = 0, alreadyServed = 0, attempted = 0, filled = 0, free = 0, stillEmpty = 0, unsourceable = 0;
  let paused = false, pausedReason = null, stopReason = null;

  // PHASE 1: collect the visible places (deduped) within a share of the budget.
  const collectDeadline = startedAt + Math.max(0, Number(workBudgetMs) || 0) * collectShare;
  const collected = [];
  unitLoop:
  for (const { surface, city } of units) {
    if (now() >= collectDeadline) { stopReason = "collect-deadline"; break; }
    for (const endpoint of surface.endpoints || []) {
      if (now() >= collectDeadline) { stopReason = "collect-deadline"; break unitLoop; }
      const pathValue = typeof endpoint.path === "function" ? endpoint.path(city) : endpoint.path;
      const qs = new URLSearchParams(endpoint.params ? endpoint.params(city) : {}).toString();
      const endpointUrl = origin + pathValue + (qs ? "?" + qs : "");
      let body = null;
      try { body = await fetchEndpointBody(fetchImpl, endpointUrl, endpointHeaders); } catch { body = null; }
      if (body == null) continue;
      let places = [];
      try { places = endpoint.extract ? endpoint.extract(body) : extractPlaces(body); } catch { places = []; }
      for (const place of places) {
        const key = place.placeId || place.photoRef || place.photo;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        visible++;
        const photoPath = photoRequestFor(place, WARM_CHECK_WIDTH);
        if (!photoPath) { unsourceable++; continue; }
        // A card that renders a direct owned https URL (not /api/photo) is
        // already showing its own image: nothing to warm.
        if (!photoPath.startsWith("/api/photo")) { alreadyServed++; continue; }
        collected.push({ place, photoPath });
      }
    }
  }

  // PHASE 2: one batched cache read settles every place whose canonical row is fresh.
  const refs = collected.map((c) => c.place.photoRef).filter((r) => typeof r === "string" && r.startsWith("places/"));
  let served = new Set();
  try { served = await cachedServed(refs); } catch { served = new Set(); }
  const pending = [];
  for (const c of collected) {
    if (c.place.photoRef && served.has(c.place.photoRef)) alreadyServed++;
    else pending.push(c);
  }

  // PHASE 3: probe the rest (free lanes included), then ONE real request for a true miss.
  workLoop:
  for (const { photoPath } of pending) {
    if (now() >= deadlineAt) { stopReason = stopReason || "deadline"; break; }
    const photoUrl = origin + photoPath;
    let checkRes;
    try { checkRes = await fetchPhotoResult(fetchImpl, photoUrl, true); } catch { checkRes = { status: 0, resultHeader: null }; }
    await sleep(paceMs);
    if (SERVED_RESULTS.has(checkRes.resultHeader)) { alreadyServed++; continue; }
    if (attempted >= safeMax) { stopReason = "max"; break workLoop; }
    if (now() >= deadlineAt) { stopReason = "deadline"; break workLoop; }
    attempted++;
    let realRes;
    try { realRes = await fetchPhotoResult(fetchImpl, photoUrl, false); } catch { realRes = { status: 0, resultHeader: null }; }
    await sleep(paceMs);
    if (PAUSE_REASONS.has(realRes.resultHeader)) {
      paused = true; pausedReason = realRes.resultHeader; stopReason = "paused";
      break workLoop;
    }
    if (realRes.resultHeader === "google") filled++;
    else if (SERVED_RESULTS.has(realRes.resultHeader)) free++;
    else stillEmpty++;
  }

  const unchecked = Math.max(0, visible - alreadyServed - attempted - unsourceable);
  return {
    visible, alreadyServed, empty: attempted - filled - free + unsourceable, unchecked,
    attempted, filled, free, stillEmpty, unsourceable,
    paused, pausedReason, stopReason, max: safeMax,
  };
}
