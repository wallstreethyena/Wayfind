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
import { createHash } from "node:crypto";
import { cgetMany, cset } from "./serverCache.js";
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
// WARM MARKERS (v8.56.28). Only fresh `photo|<ref>|640` rows were settled in
// phase 2, so every card served by same-place recovery, the free licensed
// lane, or place-only discovery (no ref at all) was re-probed over HTTP on
// EVERY run, paced, and the run ran out of time after ~14 real fills. A short
// hashed marker per photo path now remembers "this card was served" (12h) or
// "a real request came back definitively empty" (6h), so the next runs skip
// straight to places that still need work. Markers only SKIP work; they never
// make a card look served to a user, and they expire on their own.
export const WARM_OK_TTL_MS = 12 * 3600_000;
export const WARM_MISS_TTL_MS = 6 * 3600_000;
// A real request that answered one of these is a settled "no image right now",
// not a transient failure worth retrying within the hour.
export const DEFINITIVE_EMPTY = new Set(["no-photo", "negative-cached", "owned-miss"]);
export function warmMarkerKey(kind, photoPath) {
  const h = createHash("sha1").update(String(photoPath)).digest("hex").slice(0, 20);
  return `photowarm|${kind}|${h}`;
}
async function defaultReadMarkers(paths) {
  const ok = new Set(), miss = new Set();
  if (!paths.length) return { ok, miss };
  const byKey = new Map();
  for (const p of paths) { byKey.set(warmMarkerKey("ok", p), ["ok", p]); byKey.set(warmMarkerKey("miss", p), ["miss", p]); }
  const chunks = chunkKeysForUrl([...byKey.keys()]);
  for (let i = 0; i < chunks.length; i += WARM_CHECK_PARALLEL) {
    const batch = chunks.slice(i, i + WARM_CHECK_PARALLEL);
    const maps = await Promise.all(batch.map((keys) => cgetMany(keys).catch(() => new Map())));
    maps.forEach((hits, j) => {
      for (const k of batch[j]) {
        const h = hits.get(k);
        if (!h || h.stale) continue;
        const [kind, p] = byKey.get(k);
        (kind === "ok" ? ok : miss).add(p);
      }
    });
  }
  return { ok, miss };
}
async function defaultWriteMarker(kind, photoPath) {
  try { await cset(warmMarkerKey(kind, photoPath), 1, kind === "ok" ? WARM_OK_TTL_MS : WARM_MISS_TTL_MS); } catch { /* best effort */ }
}

// One start-spacing gate shared by every self-request in a run, so parallel
// collection stays under lib/apiGuard.js's 120/min per-IP window.
function makeGate(spacingMs, sleepFn) {
  let next = 0;
  return async () => {
    if (!(spacingMs > 0)) return;
    const t = Date.now();
    const at = Math.max(t, next);
    next = at + spacingMs;
    if (at > t) await sleepFn(at - t);
  };
}
export const WARM_COLLECT_CONCURRENCY = 4;
export const WARM_ROTATION_RUNS = 6;

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
  readMarkers = defaultReadMarkers,
  writeMarker = defaultWriteMarker,
  collectConcurrency = WARM_COLLECT_CONCURRENCY,
  // Endpoint collection is lighter than a photo probe and the old serial loop
  // ran faster than one start per paceMs without tripping the per-IP limit;
  // a full paceMs gate here cut a run's coverage from ~2,100 to 541 cards
  // (08:25 UTC, 2026-09-17). 0.8 x 650 ms = at most ~115 starts per minute,
  // under lib/apiGuard.js RL_LIMIT (120/min per IP).
  collectSpacingMs = paceMs > 0 ? Math.round(paceMs * 0.8) : 0,
} = {}) {
  if (!origin) throw new Error("runPhotoWarm requires an origin");
  const deadlineAt = startedAt + Math.max(0, Number(workBudgetMs) || 0);
  const safeMax = Math.max(0, Number(max) || 0);
  // ROTATION STRIDE (v8.56.32). One run collects roughly a quarter of the
  // 360 work units before its collection budget ends. Rotating by ONE unit
  // per run (the old step) meant every run re-read the same head units and
  // never reached date-night or today-discovery (09:27 and 09:42 UTC runs:
  // 620 visible, all served, while a crawl found 389 blank places). Each run
  // now starts a sixth of the list further on, so the whole list is covered
  // about every six runs (90 minutes at the quarter-hour cadence).
  const allUnits = buildWorkUnits(surfaces, cities);
  const stride = Math.max(1, Math.ceil(allUnits.length / WARM_ROTATION_RUNS));
  const units = rotate(allUnits, (Number(offsetHour) || 0) * stride);
  const seen = new Set();

  const gate = makeGate(paceMs, sleep);
  const collectGate = makeGate(collectSpacingMs, sleep);
  let knownEmpty = 0;
  let visible = 0, alreadyServed = 0, attempted = 0, filled = 0, free = 0, stillEmpty = 0, unsourceable = 0;
  let paused = false, pausedReason = null, stopReason = null;

  // PHASE 1: collect the visible places (deduped) within a share of the budget.
  const collectDeadline = startedAt + Math.max(0, Number(workBudgetMs) || 0) * collectShare;
  const collected = [];
  const jobs = [];
  for (const { surface, city } of units) for (const endpoint of surface.endpoints || []) jobs.push({ endpoint, city });
  let nextJob = 0;
  const bodies = new Array(jobs.length).fill(null);
  const worker = async () => {
    while (nextJob < jobs.length) {
      if (now() >= collectDeadline) { stopReason = "collect-deadline"; return; }
      const idx = nextJob++;
      const { endpoint, city } = jobs[idx];
      const pathValue = typeof endpoint.path === "function" ? endpoint.path(city) : endpoint.path;
      const qs = new URLSearchParams(endpoint.params ? endpoint.params(city) : {}).toString();
      const endpointUrl = origin + pathValue + (qs ? "?" + qs : "");
      await collectGate();
      let body = null;
      try { body = await fetchEndpointBody(fetchImpl, endpointUrl, endpointHeaders); } catch { body = null; }
      bodies[idx] = body;
    }
  };
  const nWorkers = Math.max(1, Math.min(Number(collectConcurrency) || 1, jobs.length || 1));
  await Promise.all(Array.from({ length: nWorkers }, worker));
  // Process in the rotated job order, so dedupe and counts stay deterministic.
  for (let idx = 0; idx < jobs.length; idx++) {
    const body = bodies[idx];
    if (body == null) continue;
    const { endpoint } = jobs[idx];
    let places = [];
    try { places = endpoint.extract ? endpoint.extract(body) : extractPlaces(body); } catch { places = []; }
    for (const place of places) {
      // cardKey: a card with no id and no photo (an owned hotel with no
      // Google place id) still counts, as unsourceable.
      const key = place.placeId || place.photoRef || place.photo || place.cardKey;
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

  // PHASE 2: one batched cache read settles every place whose canonical row is fresh.
  const refs = collected.map((c) => c.place.photoRef).filter((r) => typeof r === "string" && r.startsWith("places/"));
  let served = new Set();
  try { served = await cachedServed(refs); } catch { served = new Set(); }
  const unsettled = [];
  for (const c of collected) {
    if (c.place.photoRef && served.has(c.place.photoRef)) alreadyServed++;
    else unsettled.push(c);
  }
  let marks = { ok: new Set(), miss: new Set() };
  try { marks = await readMarkers(unsettled.map((c) => c.photoPath)); } catch { /* treat as unmarked */ }
  const pending = [];
  for (const c of unsettled) {
    if (marks.ok && marks.ok.has(c.photoPath)) alreadyServed++;
    else if (marks.miss && marks.miss.has(c.photoPath)) knownEmpty++;
    else pending.push(c);
  }

  // PHASE 3: probe the rest (free lanes included), then ONE real request for a true miss.
  workLoop:
  for (const { photoPath } of pending) {
    if (now() >= deadlineAt) { stopReason = stopReason || "deadline"; break; }
    const photoUrl = origin + photoPath;
    let checkRes;
    await gate();
    try { checkRes = await fetchPhotoResult(fetchImpl, photoUrl, true); } catch { checkRes = { status: 0, resultHeader: null }; }
    if (SERVED_RESULTS.has(checkRes.resultHeader)) { alreadyServed++; await writeMarker("ok", photoPath); continue; }
    if (attempted >= safeMax) { stopReason = "max"; break workLoop; }
    if (now() >= deadlineAt) { stopReason = "deadline"; break workLoop; }
    attempted++;
    let realRes;
    await gate();
    try { realRes = await fetchPhotoResult(fetchImpl, photoUrl, false); } catch { realRes = { status: 0, resultHeader: null }; }
    if (PAUSE_REASONS.has(realRes.resultHeader)) {
      paused = true; pausedReason = realRes.resultHeader; stopReason = "paused";
      break workLoop;
    }
    if (realRes.resultHeader === "google") { filled++; await writeMarker("ok", photoPath); }
    else if (SERVED_RESULTS.has(realRes.resultHeader)) { free++; await writeMarker("ok", photoPath); }
    else {
      stillEmpty++;
      if (DEFINITIVE_EMPTY.has(realRes.resultHeader)) await writeMarker("miss", photoPath);
    }
  }

  const unchecked = Math.max(0, visible - alreadyServed - attempted - unsourceable - knownEmpty);
  return {
    visible, alreadyServed, empty: attempted - filled - free + unsourceable + knownEmpty, unchecked, knownEmpty,
    attempted, filled, free, stillEmpty, unsourceable,
    paused, pausedReason, stopReason, max: safeMax,
  };
}
