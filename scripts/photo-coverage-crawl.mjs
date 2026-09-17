#!/usr/bin/env node
// scripts/photo-coverage-crawl.mjs — WHAT EVERY VISIBLE SURFACE ACTUALLY
// SHOWS, MEASURED, NOT JUST /api/rails.
//
// THE INCIDENT THIS ANSWERS (2026-09-17). A one-off audit script filled 2,959
// of 4,448 missing rail photos by crawling ONLY /api/rails (22 LANDING_CITIES
// x 4 dayparts) and calling production /api/photo once per gap it found.
// app/api/theme-parks — "Florida's Biggest Parks", EPCOT included — was never
// in that crawl and sat blank the whole time. lib/photoSurfaces.js is now the
// single canonical list of every surface that can show a place photo; this
// script is what actually WALKS it, so the next missed surface cannot hide
// behind "the audit only knew to look at rails" ever again.
//
// SAME SAFETY PROPERTY AS scripts/photo-monitor.mjs: every probe carries
// `x-wayfind-photo-probe: 1`. lib/placePhotoServe.js's resolver never even
// calls authorizeSpend on that path, so this script cannot cause a paid
// Google call no matter how it is run. It also never imports lib/spendGate.js
// and never contains the literal string "places.googleapis.com"
// (scripts/test-photo-protection.mjs case 5, extended to name this file).
//
// NOT GUARD-SHAPED ON PURPOSE (a `photo-` prefix, not `check-`/`test-`), so it
// sits outside scripts/guards.txt and the guard registry by construction —
// same status as scripts/photo-monitor.mjs. It touches the live network; the
// hermetic prebuild suite must stay hermetic.
//
// SAME-ORIGIN NOTE. Three of the endpoints lib/photoSurfaces.js lists
// (/api/deals, /api/experiences, /api/partner/menu-offers) are anti-scraping
// same-origin-guarded by middleware.js. lib/apiGuard.js's isSameOrigin()
// explicitly documents a Referer/Origin fallback for clients that predate
// Sec-Fetch-Site — this script sends that header on every request (harmless
// on the routes that do not check it), via lib/photoSurfaces.js's own
// sameOriginHeaders() so the allowance is declared in one place, not
// reinvented here.
//
// USAGE
//   node scripts/photo-coverage-crawl.mjs [--base-url=https://www.gowayfind.com]
//     [--out=/tmp/photo-coverage.json] [--surfaces=a,b] [--cities=x,y] [--max=N]
//
// EXIT CODE. Non-zero ONLY on an operational failure (nothing could be
// crawled at all). A high empty rate is a FINDING, written to the output
// file, never a crash — same contract as scripts/photo-monitor.mjs.
import { writeFileSync } from "node:fs";
import { PHOTO_SURFACES, extractPlaces, photoRequestFor, landingCityList, sameOriginHeaders } from "../lib/photoSurfaces.js";

const RATE_PER_MINUTE = 85; // < lib/apiGuard.js's 120/min per-IP wall, with headroom — same reasoning as photo-monitor.mjs's 90.
const CONCURRENCY = 2;
const TIMEOUT_MS = 10000;
const RETRY_AFTER_DEFAULT_MS = 3000;
const USER_AGENT = "WayfindPhotoCoverageCrawl/1.0 (+https://www.gowayfind.com)";

// x-wayfind-photo-result values a probe can carry, per lib/placePhotoServe.js
// / app/api/photo/route.js's own contract (never spends on a probe).
const SERVED_RESULTS = new Set(["cache", "inventory", "inventory-ref-cache", "same-place-cache", "owned-free", "google"]);
const EMPTY_RESULTS = new Set(["probe-no-spend", "owned-miss", "quota-open", "spend-denied", "no-photo"]);

function parseArgs(argv) {
  const out = { baseUrl: "https://www.gowayfind.com", outPath: "/tmp/photo-coverage.json", surfaces: null, cities: null, max: Infinity };
  for (const a of argv) {
    if (a.startsWith("--base-url=")) out.baseUrl = a.slice(11).replace(/\/+$/, "");
    else if (a.startsWith("--out=")) out.outPath = a.slice(6);
    else if (a.startsWith("--surfaces=")) out.surfaces = new Set(a.slice(11).split(",").map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith("--cities=")) out.cities = new Set(a.slice(9).split(",").map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith("--max=")) out.max = Math.max(0, parseInt(a.slice(6), 10) || 0);
  }
  return out;
}

// Token-bucket pacing — identical shape to scripts/photo-monitor.mjs's
// createPacer, duplicated rather than imported so this script's runtime
// behavior never depends on the shape of an unrelated monitor changing.
function createPacer(ratePerMinute) {
  const intervalMs = 60000 / Math.max(1, ratePerMinute);
  let nextAt = 0;
  return {
    async wait() {
      const t = Date.now();
      const start = Math.max(t, nextAt);
      nextAt = start + intervalMs;
      const delay = start - t;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    },
  };
}
const pacer = createPacer(RATE_PER_MINUTE);

async function fetchOnce(url, headers) {
  try {
    const r = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      headers: { ...headers, "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: r.status, resultHeader: r.headers.get("x-wayfind-photo-result"), retryAfter: r.headers.get("retry-after") };
  } catch (e) {
    return { status: 0, resultHeader: null, retryAfter: null, error: String((e && e.message) || e) };
  }
}

/** GET with pacing + one retry on 429 (Retry-After if present, else 3s) — same contract as photo-monitor.mjs. */
async function fetchWithRetry(url, headers) {
  await pacer.wait();
  const first = await fetchOnce(url, headers);
  if (first.status !== 429) return first;
  const retryAfterSec = Number(first.retryAfter);
  const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : RETRY_AFTER_DEFAULT_MS;
  await new Promise((r) => setTimeout(r, waitMs));
  await pacer.wait();
  return fetchOnce(url, headers);
}

async function fetchEndpointBody(url, headers) {
  try {
    const r = await fetch(url, { cache: "no-store", headers: { ...headers, "user-agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, body: null };
    try { return { ok: true, status: r.status, body: JSON.parse(text) }; }
    catch { return { ok: true, status: r.status, body: text }; } // HTML page — extractPlaces() dispatches on typeof
  } catch (e) {
    return { ok: false, status: 0, body: null, error: String((e && e.message) || e) };
  }
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, run));
  return results;
}

function emptyStats() { return { visible: 0, served: 0, empty: 0, unsourceable: 0, inconclusive: 0 }; }
function bump(stats, key) { stats[key] = (stats[key] || 0) + 1; }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const headers = sameOriginHeaders(args.baseUrl);

  const surfaces = PHOTO_SURFACES.filter((s) => !args.surfaces || args.surfaces.has(s.id));
  if (!surfaces.length) {
    console.error("photo-coverage-crawl: FAIL — --surfaces matched zero entries in PHOTO_SURFACES.");
    process.exit(1);
  }
  let allCities = landingCityList();
  if (args.cities) allCities = allCities.filter((c) => args.cities.has(c.slug));
  if (!allCities.length) {
    console.error("photo-coverage-crawl: FAIL — --cities matched zero LANDING_CITIES entries.");
    process.exit(1);
  }

  const totals = emptyStats();
  const bySurface = {};
  const byCity = {};
  const emptyList = [];
  const errors = [];
  const probeCache = new Map(); // photo request URL -> classification, so a place shared across surfaces/cities is only fetched once
  let attempted = 0;
  let endpointFetches = 0;

  async function classify(url) {
    if (probeCache.has(url)) return probeCache.get(url);
    const res = await fetchWithRetry(url, headers);
    let cls;
    if (res.status === 429) cls = "inconclusive";
    else if (res.error || res.status === 0) cls = "inconclusive";
    else if (SERVED_RESULTS.has(res.resultHeader)) cls = "served";
    else if (EMPTY_RESULTS.has(res.resultHeader)) cls = "empty";
    else cls = "inconclusive";
    probeCache.set(url, cls);
    return cls;
  }

  outer:
  for (const surface of surfaces) {
    bySurface[surface.id] = emptyStats();
    const targets = surface.perCity ? allCities : [null];
    for (const city of targets) {
      const cityKey = city ? city.slug : "-";
      if (!byCity[cityKey]) byCity[cityKey] = emptyStats();
      const places = new Map(); // placeId||photoRef -> place, deduped per (surface, city)
      for (const endpoint of surface.endpoints || []) {
        if (attempted >= args.max) break outer;
        const pathValue = typeof endpoint.path === "function" ? endpoint.path(city) : endpoint.path;
        const qs = new URLSearchParams(endpoint.params ? endpoint.params(city) : {}).toString();
        const url = args.baseUrl + pathValue + (qs ? "?" + qs : "");
        endpointFetches++;
        const { ok, body, status, error } = await fetchEndpointBody(url, headers);
        if (!ok) { errors.push({ surface: surface.id, city: cityKey, path: pathValue, status, error: error || null }); continue; }
        let extracted = [];
        try { extracted = endpoint.extract ? endpoint.extract(body) : extractPlaces(body); }
        catch (e) { errors.push({ surface: surface.id, city: cityKey, path: pathValue, error: "extract() threw: " + ((e && e.message) || e) }); continue; }
        for (const p of extracted) {
          const key = p.placeId || p.photoRef || p.photo;
          if (key && !places.has(key)) places.set(key, p);
        }
      }

      const rows = [...places.values()];
      for (const place of rows) {
        if (attempted >= args.max) break outer;
        const url = photoRequestFor(place, 640);
        totals.visible++; bySurface[surface.id].visible++; byCity[cityKey].visible++;
        if (!url) {
          totals.unsourceable++; bySurface[surface.id].unsourceable++; byCity[cityKey].unsourceable++;
          emptyList.push({ surface: surface.id, city: cityKey, placeId: place.placeId || null, name: place.name || null, reason: "no-photo-field" });
          continue;
        }
        attempted++;
        const cls = await classify(args.baseUrl + url);
        bump(totals, cls); bump(bySurface[surface.id], cls); bump(byCity[cityKey], cls);
        if (cls === "empty") {
          emptyList.push({ surface: surface.id, city: cityKey, placeId: place.placeId || null, name: place.name || null, reason: "no-photo" });
        }
      }
    }
  }

  const report = {
    generatedAt, baseUrl: args.baseUrl,
    surfacesCrawled: surfaces.map((s) => s.id),
    citiesCrawled: allCities.map((c) => c.slug),
    totals, bySurface, byCity,
    empty: emptyList,
    errors,
    endpointFetches, probesAttempted: attempted, distinctPhotosProbed: probeCache.size,
  };
  writeFileSync(args.outPath, JSON.stringify(report, null, 2));

  // COUNTS ONLY. Never a placeId, a photoRef, or an /api/photo URL on stdout.
  console.log(`photo-coverage-crawl: ${surfaces.length} surface(s) x up to ${allCities.length} cit${allCities.length === 1 ? "y" : "ies"} — ${endpointFetches} endpoint fetch(es), ${attempted} photo probe(s)`);
  console.log(`  visible=${totals.visible} served=${totals.served} empty=${totals.empty} unsourceable=${totals.unsourceable} inconclusive=${totals.inconclusive}`);
  for (const s of surfaces) {
    const t = bySurface[s.id];
    console.log(`  ${s.id}: visible=${t.visible} served=${t.served} empty=${t.empty} unsourceable=${t.unsourceable} inconclusive=${t.inconclusive}`);
  }
  if (errors.length) console.log(`  ${errors.length} endpoint fetch error(s) — see ${args.outPath}`);
  console.log(`  full report written to ${args.outPath}`);

  if (attempted === 0 && emptyList.length === 0 && endpointFetches === 0) {
    console.error("photo-coverage-crawl: FAIL — nothing was crawled at all.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`photo-coverage-crawl: FAIL — ${(e && e.stack) || e}`);
  process.exit(1);
});
