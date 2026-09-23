#!/usr/bin/env node
/**
 * scripts/surface-parity-audit.mjs — reusable, LIVE place-card SURFACE PARITY
 * diagnostic. Drives scripts/lib/parity/eligibility.mjs (Wayfind's own read
 * -> chipIdentity -> rankInventory pipeline, called, never re-implemented)
 * and scripts/lib/parity/report.mjs (the row schema + root-cause classifier)
 * against either a live API endpoint or a live browser.
 *
 *   --level=api|browser        default: api
 *   --cities=slug,slug,...     default: every LANDING_CITIES entry with
 *                               state==="FL" (lib/landingCities.js)
 *   --keys=cat:sub,cat:sub,... default: every key in CHIP_IDENTITY
 *                               (lib/chipIdentity.js); "all" also includes
 *                               the SUB_ALLOW-only chips (food:coffee, ...)
 *   --radius=<meters>          default: 27359 (17mi — what the client sends;
 *                               app/api/places/search's route.js snaps this
 *                               server-side, and this script snaps the SAME
 *                               way before computing ground truth, so the
 *                               comparison is against the radius production
 *                               ACTUALLY used, never the raw input)
 *   --base=<origin>            default: https://www.gowayfind.com
 *   --concurrency=<n>          default: 3 (politeness cap on production)
 *   --out=<path w/o extension> required. Writes <out>.json and <out>.md.
 *   --label=<text>             optional, recorded in report meta only
 *   --maxPages=<n>             browser: "Wayfind 5 more spots" click cap
 *                               (default 200 — a runaway guard, not a cap on
 *                               real content)
 *   --lat=<deg> --lng=<deg>    OPTIONAL. When BOTH are given, they override
 *                               --cities entirely with a single synthetic
 *                               origin (name from --cityName, default
 *                               "Custom origin") instead of a LANDING_CITIES
 *                               slug. This exists because LANDING_CITIES'
 *                               table coordinates for a city are NOT always
 *                               the same point real users land on there --
 *                               e.g. Parrish's landing-page entry is
 *                               (27.5859,-82.4254) but lib/locationHonesty.js's
 *                               DEFAULT_CENTER (what a geolocation-denied or
 *                               not-yet-resolved visitor actually gets) is
 *                               (27.5689,-82.4393), ~1.4mi away -- close
 *                               enough that "Parrish" can look healthy at one
 *                               origin and broken at the other under the
 *                               SAME production bug, because the legacy read
 *                               caps at an arbitrary unordered heap slice
 *                               that a small coordinate shift can move a
 *                               place into or out of. Use this to audit the
 *                               EXACT origin a bug report named, not just
 *                               the nearest landing-page slug.
 *   --cityName=<text>          label for the synthetic origin above (report
 *                               display only)
 *   --sliderMi=<n>             default: 17 (DEFAULT_RADIUS_MI, lib/google.js)
 *                               -- the client's "Within X mi" display-radius
 *                               cut, applied (browser level only) via the
 *                               REAL app/home.js gate (clientGates.mjs) to
 *                               tell a legitimate outside_display_radius:<mi>
 *                               absence apart from a real omission.
 *   --checkCacheDrift          default: off. API level only. After the
 *                               normal exhaustive paged fetch across every
 *                               pair, waits --cacheDriftDelayMs once, then
 *                               re-fetches just page 0 of each pair's URL and
 *                               compares membership -- any place present in
 *                               one read and absent from the other gets
 *                               hint.cacheDrift (report.mjs's classifyRow
 *                               already reads this) instead of being reported
 *                               as a fresh eligibility_passed_api_omitted.
 *   --cacheDriftDelayMs=<ms>   default: 4000. Delay before the single
 *                               second-pass re-fetch above.
 *   --full                     also write COMPLETE row-level detail (every
 *                               classified row, unfiltered) to --fullOut --
 *                               never committed; the default report is the
 *                               compact summary + distinct-place listing.
 *   --fullOut=<path>           path (WITHOUT extension) OUTSIDE the repo for
 *                               --full's output (e.g. /tmp/...). Required
 *                               when --full is set; writeReport() throws if
 *                               it resolves inside the repo.
 *
 * ENV (command line / calling shell only — NEVER written into a repo file):
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_KEY — an anon /
 *   publishable key is enough (wf_inventory is anon-readable). Used ONLY to
 *   compute GROUND TRUTH via this repo's own (fixed) code; the live API/
 *   browser calls talk to production over plain HTTPS and need no credential.
 *
 * THE AFTER-RUN, once the fix is deployed, is this exact command with a new
 * --out and --label — see docs/audits/surface-parity/README (the command is
 * also printed at the end of every run of this script).
 */
import { LANDING_CITIES } from "../lib/landingCities.js";
import { chipIdentityKeys, subAllowOnlyKeys, computeEligibleSet, placeName, milesBetween } from "./lib/parity/eligibility.mjs";
import { makeRow, writeReport } from "./lib/parity/report.mjs";
// REAL client-side gates, called rather than restated (2026-09-23,
// orchestrator review): a place the API served but the browser did not
// render can be a real bug, OR a place the CLIENT itself legitimately drops
// before paint -- the display-radius cut and the same-brand dedupe are two
// such gates, and calling the actual functions (via clientGates.mjs, which
// itself imports lib/placeDedupe.js/lib/score.js/lib/wayfindScore.js
// VERBATIM) is the only way to tell them apart from a real omission without
// silently re-implementing (and possibly drifting from) app/home.js's rule.
import { classifyClientOmissions, SLIDER_MI_DEFAULT } from "./lib/parity/clientGates.mjs";

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(a);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith("--")) out[a.slice(2)] = true;
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

const LEVEL = String(args.level || "api");
const BASE = String(args.base || "https://www.gowayfind.com").replace(/\/+$/, "");
const CONCURRENCY = Math.max(1, Math.min(6, Number(args.concurrency) || 3));
const RAW_RADIUS_M = Number(args.radius) || 27359; // 17mi, app/home.js's request radius
const OUT = args.out;
const LABEL = args.label || null;
const MAX_PAGES = Math.max(1, Number(args.maxPages) || 200);
const SLIDER_MI = Number.isFinite(Number(args.sliderMi)) && args.sliderMi !== undefined ? Number(args.sliderMi) : SLIDER_MI_DEFAULT;
const CHECK_CACHE_DRIFT = !!args.checkCacheDrift;
const CACHE_DRIFT_DELAY_MS = Math.max(500, Number(args.cacheDriftDelayMs) || 4000);
const FULL = !!args.full;
const FULL_OUT = args.fullOut ? String(args.fullOut) : (FULL ? `/tmp/surface-parity-full-${Date.now()}` : null);
if (FULL && !FULL_OUT) {
  console.error("surface-parity-audit: --full requires --fullOut=<path outside the repo> (or a default under /tmp is used)");
  process.exit(2);
}

if (!OUT) {
  console.error("surface-parity-audit: --out=<path without extension> is required");
  process.exit(2);
}

// route.js's OWN radius ladder + snap, ported byte-for-byte (app/api/places/
// search/route.js) so ground truth is computed at the radius production
// ACTUALLY reads at, never the raw client value.
const RADIUS_LADDER = [2000, 8000, 16000, 32000, 50000];
function snapRadius(rawRadius) {
  return RADIUS_LADDER.reduce(
    (best, r) => (Math.abs(r - rawRadius) < Math.abs(best - rawRadius) ? r
      : (Math.abs(r - rawRadius) === Math.abs(best - rawRadius) ? Math.max(r, best) : best)),
    RADIUS_LADDER[0],
  );
}
const RADIUS_M = snapRadius(RAW_RADIUS_M);
const RADIUS_MI = RADIUS_M / 1609.34;

function fl(cities) {
  return Object.entries(cities).filter(([, c]) => c.state === "FL").map(([slug, c]) => ({ slug, ...c }));
}
const CUSTOM_LAT = args.lat !== undefined ? Number(args.lat) : null;
const CUSTOM_LNG = args.lng !== undefined ? Number(args.lng) : null;
const HAS_CUSTOM_ORIGIN = Number.isFinite(CUSTOM_LAT) && Number.isFinite(CUSTOM_LNG);

const CITY_LIST = HAS_CUSTOM_ORIGIN
  ? [{ slug: "custom", name: String(args.cityName || "Custom origin"), state: "FL", lat: CUSTOM_LAT, lng: CUSTOM_LNG }]
  : args.cities
  ? String(args.cities).split(",").map((s) => s.trim()).filter(Boolean).map((slug) => {
      const c = LANDING_CITIES[slug];
      if (!c) throw new Error(`unknown city slug: ${slug}`);
      return { slug, ...c };
    })
  : fl(LANDING_CITIES);

const KEY_LIST = args.keys
  ? (args.keys === "all" ? [...chipIdentityKeys(), ...subAllowOnlyKeys()] : String(args.keys).split(",").map((s) => s.trim()).filter(Boolean))
  : chipIdentityKeys();

// ── env (ground truth only; never written to a file) ───────────────────────
function envFromProcess() {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}
const SB_ENV = envFromProcess();
if (!SB_ENV) {
  console.error("surface-parity-audit: SUPABASE_URL and SUPABASE_KEY must be set in the calling shell's environment (never a repo file). Aborting.");
  process.exit(2);
}

// ── small async pool ────────────────────────────────────────────────────
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await worker(items[idx], idx); }
      catch (e) { results[idx] = { error: e && e.message ? e.message : String(e) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
async function fetchProdJSON(url) {
  const r = await fetch(url, {
    headers: { Referer: `${BASE}/`, Origin: BASE, "User-Agent": BROWSER_UA },
  });
  const cacheHeader = r.headers.get("x-vercel-cache");
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { status: r.status, ok: r.ok, json, cacheHeader };
}

function invUrl({ lat, lng, cat, sub, n, offset }) {
  const u = new URL(`${BASE}/api/places/search`);
  u.searchParams.set("q", "inventory");
  u.searchParams.set("lat", Number(lat).toFixed(4));
  u.searchParams.set("lng", Number(lng).toFixed(4));
  u.searchParams.set("radius", String(RAW_RADIUS_M));
  u.searchParams.set("n", String(n));
  u.searchParams.set("cat", cat);
  u.searchParams.set("inv", "1");
  if (sub && sub !== "all") u.searchParams.set("sub", sub);
  if (offset) u.searchParams.set("offset", String(offset));
  return u.toString();
}

/** Page a production inv=1 endpoint to exhaustion, honoring hasMore when the
 * server reports it (post-fix) and stopping after one page when it does not
 * (pre-fix production shape — the exact thing this audit exists to measure). */
async function fetchProdMembership({ lat, lng, cat, sub }) {
  const N = 400;
  const ids = [];
  const idSet = new Set();
  let page0Ids = new Set();
  let offset = 0;
  let page = 0;
  let lastJson = null;
  let cacheHeaders = [];
  let firstStatus = null;
  for (; page < MAX_PAGES; page++) {
    const r = await fetchProdJSON(invUrl({ lat, lng, cat, sub, n: N, offset }));
    if (page === 0) firstStatus = r.status;
    cacheHeaders.push(r.cacheHeader);
    if (!r.ok || !r.json || !Array.isArray(r.json.places)) break;
    lastJson = r.json;
    for (const p of r.json.places) {
      const id = p && (p.id || p.place_id);
      if (id && !idSet.has(id)) { idSet.add(id); ids.push(id); }
      if (page === 0 && id) page0Ids.add(id);
    }
    if (r.json.hasMore !== true) break;
    if (!r.json.places.length) break;
    offset += r.json.places.length;
  }
  return {
    ids, idSet, page0Ids, pages: page + 1, firstStatus,
    total: lastJson ? lastJson.total : null,
    hasMore: lastJson ? !!lastJson.hasMore : null,
    truncated: lastJson ? !!lastJson.truncated : null,
    source: lastJson ? lastJson.source : null,
    cacheHeaders,
    supportsPaging: lastJson ? Object.prototype.hasOwnProperty.call(lastJson, "hasMore") : false,
  };
}

/** ONE fetch of page 0 only (offset 0, same n=400 page size as the exhaustive
 * reader's first page) — used by the cache-drift re-check, which is about
 * whether the SAME URL returns the SAME membership on a second read, not
 * about paging further. */
async function fetchPage0({ lat, lng, cat, sub }) {
  const r = await fetchProdJSON(invUrl({ lat, lng, cat, sub, n: 400, offset: 0 }));
  const ids = new Set();
  if (r.ok && r.json && Array.isArray(r.json.places)) {
    for (const p of r.json.places) { const id = p && (p.id || p.place_id); if (id) ids.add(id); }
  }
  return { ids, cacheHeader: r.cacheHeader, status: r.status };
}

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

// ── API-LEVEL RUN ───────────────────────────────────────────────────────
async function runApiLevel() {
  const pairs = [];
  for (const city of CITY_LIST) for (const key of KEY_LIST) pairs.push({ city, key });

  console.log(`surface-parity-audit: API level — ${CITY_LIST.length} cities x ${KEY_LIST.length} keys = ${pairs.length} pairs, radius ${RAW_RADIUS_M}m -> snapped ${RADIUS_M}m (${RADIUS_MI.toFixed(1)}mi), concurrency ${CONCURRENCY}`);

  let totalChecked = 0;
  let totalEligible = 0;
  const failRows = [];
  const pairSummaries = [];
  let done = 0;
  // Cache-drift re-check bookkeeping (only populated when --checkCacheDrift):
  // one entry per pair carrying what a second, later read needs to compare
  // against, plus a lookup from (pair, place_id) -> the row a drift finding
  // should be stamped onto.
  const driftCandidates = [];
  const rowByPairPlace = new Map(); // `${city.slug}\u0000${key}\u0000${place_id}` -> row

  await pool(pairs, CONCURRENCY, async ({ city, key }) => {
    const [cat, sub] = key.split(":");
    let ground;
    try {
      ground = await computeEligibleSet({ cat, sub, lat: city.lat, lng: city.lng, radiusM: RADIUS_M, env: SB_ENV });
    } catch (e) {
      pairSummaries.push({ city: city.slug, key, error: `ground truth read failed: ${e.message}` });
      done++;
      return;
    }
    const prod = await fetchProdMembership({ lat: city.lat, lng: city.lng, cat, sub });

    totalChecked += ground.places.length;
    totalEligible += ground.places.length;

    const missing = [];
    ground.places.forEach((p, rank) => {
      const present = prod.idSet.has(p.id);
      if (present) return;
      missing.push({ p, rank });
    });

    const PAGE_N = 400;
    for (const { p, rank } of missing) {
      // rank >= PAGE_N means this place sits BEYOND the first page BY
      // CONSTRUCTION (there are simply more eligible places than the page
      // size) -- legitimate only when the surface actually exposes hasMore
      // and a client can page forward to reach it. rank < PAGE_N means it
      // should have been on the very FIRST page and still is not there --
      // that can never be a legitimate cap, it is the capped/unordered-read
      // symptom this whole audit exists to catch.
      const beyondFirstPage = rank >= PAGE_N;
      const pageReachable = prod.supportsPaging && prod.hasMore === true;
      const suppressionReason = beyondFirstPage ? `rank_cap:${PAGE_N}` : null;
      const row = makeRow({
        placeId: p.id, name: placeName(p), city: city.name, key, cat, sub,
        sourcePresent: true, apiPresent: false, rendered: null, mapPresent: null,
        rank, page: Math.floor(rank / PAGE_N), offset: null, n: PAGE_N,
        hasMore: prod.hasMore, pageReachable,
        apiTotal: prod.total, eligibleTotal: ground.eligible,
        cacheHeader: Array.isArray(prod.cacheHeaders) ? prod.cacheHeaders.join(",") : prod.cacheHeaders,
        suppressionReason,
        notes: prod.supportsPaging ? null : "production response carries no total/hasMore/truncated fields (pre-fix shape)",
      });
      failRows.push(row);
      if (!beyondFirstPage) rowByPairPlace.set(`${city.slug}\u0000${key}\u0000${p.id}`, row);
    }

    const pairSummary = {
      city: city.slug, cityName: city.name, key,
      eligible: ground.eligible, groundTruncated: ground.truncated,
      apiFirstStatus: prod.firstStatus, apiPages: prod.pages, apiTotal: prod.total,
      apiReturned: prod.ids.length, apiHasMore: prod.hasMore, apiSupportsPaging: prod.supportsPaging,
      apiSource: prod.source, apiCache: prod.cacheHeaders[0] || null,
      missing: missing.length,
    };
    pairSummaries.push(pairSummary);
    if (CHECK_CACHE_DRIFT) driftCandidates.push({ city, key, cat, sub, page0Ids: prod.page0Ids, pairSummary });

    done++;
    if (done % 20 === 0 || done === pairs.length) console.log(`  ${done}/${pairs.length} pairs done`);
  });

  // ── cache-drift re-check: ONE delayed second pass over every pair's page 0,
  // not a per-pair delay -- keeps a statewide sweep's wall clock bounded while
  // still proving (or disproving) that the SAME URL returns the SAME
  // membership on a second read. Pre-fix, this is the exact symptom the
  // job's before-report already observed once by hand (134 without Ryan's vs
  // 152 with Ryan's, same URL, both x-vercel-cache: HIT) -- the unordered,
  // no-order= read cached for ~24h at the CDN edge, so which arbitrary heap
  // slice got cached (and served as a HIT to every request since) was
  // itself nondeterministic across cache-fill events. Post-fix, reads are
  // deterministic (ordered, exhaustive), so this becomes a plain regression
  // check that should find ZERO drift going forward.
  if (CHECK_CACHE_DRIFT && driftCandidates.length) {
    console.log(`surface-parity-audit: cache-drift re-check — waiting ${CACHE_DRIFT_DELAY_MS}ms, then re-fetching page 0 of ${driftCandidates.length} pairs`);
    await sleep(CACHE_DRIFT_DELAY_MS);
    let driftPairs = 0, driftRows = 0;
    await pool(driftCandidates, CONCURRENCY, async ({ city, key, cat, sub, page0Ids, pairSummary }) => {
      const second = await fetchPage0({ lat: city.lat, lng: city.lng, cat, sub });
      const added = [...second.ids].filter((id) => !page0Ids.has(id));
      const removed = [...page0Ids].filter((id) => !second.ids.has(id));
      pairSummary.cacheDriftChecked = true;
      pairSummary.cacheDriftSecondCache = second.cacheHeader;
      if (added.length || removed.length) {
        pairSummary.cacheDrift = true;
        pairSummary.cacheDriftAdded = added.length;
        pairSummary.cacheDriftRemoved = removed.length;
        driftPairs++;
        // Stamp hint.cacheDrift onto any already-built row for a place that
        // FLIPPED from absent (first read) to present (second read) -- that
        // is a place this audit was about to report as a stable
        // eligibility_passed_api_omitted, when what actually happened is the
        // read itself is nondeterministic. Removed (present->absent) ids
        // have no row to stamp (they were not "missing" on the first pass);
        // they still count toward cacheDriftRemoved above for visibility.
        for (const id of added) {
          const row = rowByPairPlace.get(`${city.slug}\u0000${key}\u0000${id}`);
          if (row) { row.hint.cacheDrift = true; driftRows++; }
        }
      } else {
        pairSummary.cacheDrift = false;
      }
    });
    console.log(`surface-parity-audit: cache-drift re-check done — ${driftPairs}/${driftCandidates.length} pairs drifted, ${driftRows} row(s) reclassified as cache_drift`);
  }

  const meta = {
    level: "api", base: BASE, label: LABEL,
    cities: CITY_LIST.map((c) => c.slug), keys: KEY_LIST,
    radiusRequestedM: RAW_RADIUS_M, radiusSnappedM: RADIUS_M, radiusMi: Number(RADIUS_MI.toFixed(2)),
    subAllowOnlyKeysAvailable: subAllowOnlyKeys(),
    checkCacheDrift: CHECK_CACHE_DRIFT, cacheDriftDelayMs: CHECK_CACHE_DRIFT ? CACHE_DRIFT_DELAY_MS : null,
  };
  const { jsonPath, mdPath, summary, fullPaths } = writeReport(OUT, {
    title: `Surface parity audit (API level)${LABEL ? " — " + LABEL : ""}`,
    meta, rows: failRows, totalChecked, totalEligible, pairSummaries,
    full: FULL, fullOut: FULL_OUT,
  });
  console.log(`surface-parity-audit: wrote ${jsonPath} and ${mdPath}`);
  if (fullPaths) console.log(`surface-parity-audit: wrote FULL detail (not committed) to ${fullPaths.jsonPath} and ${fullPaths.mdPath}`);
  console.log(`surface-parity-audit: eligible pairs checked=${totalChecked} FAIL=${summary.totalFail} distinct places=${summary.distinctPlacesAffected}`);
  console.log("  by class:", JSON.stringify(summary.byClass));
  return { jsonPath, mdPath, summary, pairSummaries, fullPaths };
}

// ── BROWSER-LEVEL RUN ────────────────────────────────────────────────────
// Chip-menu labels the real UI renders (lib/categories.js CATEGORY_TILES,
// lib/google.js SUBFILTERS) — recorded here as DATA the click sequence
// drives, not a second copy of identity. Only the combinations this audit
// actually clicks through need an entry; the rest of CHIP_IDENTITY's keys
// are covered at the API level, where every key is reachable without a UI
// path (inv=1 accepts any cat/sub whether or not the client menu offers a
// button for it).
const CHIP_UI_LABELS = {
  "food:cafes": { catLabel: "Food", subLabel: "Cafés" },
};

async function runBrowserLevel() {
  const { chromium } = await import("playwright");
  const keys = KEY_LIST.filter((k) => CHIP_UI_LABELS[k]);
  if (!keys.length) {
    console.error(`surface-parity-audit: --level=browser has no UI path for any of [${KEY_LIST.join(", ")}] — add it to CHIP_UI_LABELS or audit that key at --level=api`);
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const rows = [];
  let totalChecked = 0;
  let totalEligible = 0;
  const pairSummaries = [];

  try {
    for (const city of CITY_LIST) {
      for (const key of keys) {
        const [cat, sub] = key.split(":");
        const ui = CHIP_UI_LABELS[key];
        console.log(`surface-parity-audit: browser — ${city.slug} ${key}`);

        const ground = await computeEligibleSet({ cat, sub, lat: city.lat, lng: city.lng, radiusM: RADIUS_M, env: SB_ENV });
        totalChecked += ground.places.length;
        totalEligible += ground.places.length;
        const eligibleIds = new Set(ground.places.map((p) => p.id));
        const eligibleById = new Map(ground.places.map((p, i) => [p.id, { p, rank: i }]));

        const context = await browser.newContext({
          geolocation: { latitude: city.lat, longitude: city.lng },
          permissions: ["geolocation"],
          userAgent: BROWSER_UA,
          viewport: { width: 390, height: 844 },
        });
        const page = await context.newPage();

        // Capture not just the URL but the ACTUAL response body's place-id
        // set for the request matching this pair's `sub` -- this is the
        // real browser-observed API membership, not an assumption. Without
        // this, every eligible-but-not-rendered place was being labeled
        // api_included_ui_omitted (API served it, UI dropped it) when the
        // true, more common story at this level is the inventory endpoint's
        // own response simply not containing it (eligibility_passed_api_
        // omitted) -- these are different bugs with different fixes, and
        // conflating them was caught live (2026-09-23) comparing this
        // capture against a direct same-URL fetch that returned a
        // DIFFERENT membership set (see cache_drift finding in the report).
        const captured = [];
        let matchingBody = null; // { ids: Set, count, cacheHeader } for the sub-filter's own inv=1 response
        page.on("response", (resp) => {
          try {
            const u = new URL(resp.url());
            if (u.pathname === "/api/places/search" && u.searchParams.get("inv") === "1") {
              const gotSub = u.searchParams.get("sub") || "all";
              const cacheHeader = resp.headers()["x-vercel-cache"] || null;
              captured.push({ url: resp.url(), status: resp.status(), cacheHeader });
              if (gotSub === sub) {
                resp.json().then((json) => {
                  const places = Array.isArray(json && json.places) ? json.places : [];
                  matchingBody = {
                    ids: new Set(places.map((p) => p && (p.id || p.place_id)).filter(Boolean)),
                    count: places.length, cacheHeader,
                    hasMore: json ? !!json.hasMore : null,
                    total: json ? json.total : null,
                    supportsPaging: json ? Object.prototype.hasOwnProperty.call(json, "hasMore") : false,
                  };
                }).catch(() => {});
              }
            }
          } catch { /* ignore */ }
        });

        await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(1500); // let first-paint geolocation settle before we tap the chip

        // Open the chip: Food tab, then the Cafés sub-chip. The live site
        // renders CategoryMenu's `nav` branch here (.wf-navtab / .wf-navsub),
        // not the .wf-cattile/.wf-subchip markup that branch's sibling
        // (home's separate "browse-in-place" row) uses -- confirmed live via
        // a DOM dump (2026-09-23): exactly one role="group" aria-label=
        // "Browse categories" on the home page, and it is .wf-navtabs. Both
        // class pairs are tried so this script keeps working if that ever
        // changes back or the other call site is what's under test.
        const catBtn = page.getByRole("group", { name: "Browse categories" }).getByRole("button", { name: ui.catLabel, exact: true });
        await catBtn.click({ timeout: 15000 }).catch(async () => {
          await page.locator(".wf-cattile, .wf-navtab", { hasText: ui.catLabel }).first().click({ timeout: 15000 });
        });
        // Let whatever inv=1 fetch the CATEGORY tap itself triggers (e.g. a
        // default food:all near-me read) land and drain BEFORE we click the
        // sub-chip -- otherwise the waitForResponse below can catch that
        // unrelated, already-in-flight response instead of the one the
        // sub-chip click causes (caught live 2026-09-23: capturedUrl came
        // back with no `sub` param at all, i.e. the category-open fetch, not
        // the Cafés one). The predicate ALSO requires the exact `sub` value
        // as a second, independent guard against the same race.
        await page.waitForTimeout(1200);
        const subBtn = page.locator(".wf-subchip, .wf-navsub", { hasText: ui.subLabel }).first();
        const [invResp] = await Promise.all([
          page.waitForResponse((r) => {
            try {
              const u = new URL(r.url());
              if (u.pathname !== "/api/places/search" || u.searchParams.get("inv") !== "1") return false;
              const gotSub = u.searchParams.get("sub") || "all";
              return gotSub === sub;
            } catch { return false; }
          }, { timeout: 20000 }).catch(() => null),
          subBtn.click({ timeout: 15000 }),
        ]);

        // SAME-ORIGIN PROOF — the captured request's lat/lng must equal the
        // GRANTED geolocation (toFixed(4)), never the fixture we asked for.
        let capturedUrl = invResp ? invResp.url() : (captured.length ? captured[captured.length - 1].url : null);
        let sameOriginOk = false;
        let capturedLat = null, capturedLng = null, capturedRadius = null;
        if (capturedUrl) {
          const u = new URL(capturedUrl);
          capturedLat = Number(u.searchParams.get("lat"));
          capturedLng = Number(u.searchParams.get("lng"));
          capturedRadius = Number(u.searchParams.get("radius"));
          sameOriginOk = Number.isFinite(capturedLat) && Number.isFinite(capturedLng)
            && Number(capturedLat.toFixed(4)) === Number(city.lat.toFixed(4))
            && Number(capturedLng.toFixed(4)) === Number(city.lng.toFixed(4));
        }

        // Recompute the EXPECTED set from the CAPTURED lat/lng/radius, never
        // from the fixture — a mismatch there is exactly location_origin_mismatch.
        // Diagnostic only: every eligible fixture-based place below is voided
        // and reported as location_origin_mismatch regardless (classifyRow's
        // same_origin_ok===false branch fires ahead of API/rendered checks),
        // but recomputing here proves the mismatch is real and shows what the
        // surface SHOULD have expected at the origin it actually used.
        let capturedEligibleCount = null;
        if (sameOriginOk === false && Number.isFinite(capturedLat) && Number.isFinite(capturedLng)) {
          const capturedRadiusM = Number.isFinite(capturedRadius) ? snapRadius(capturedRadius) : RADIUS_M;
          try {
            const capturedGround = await computeEligibleSet({ cat, sub, lat: capturedLat, lng: capturedLng, radiusM: capturedRadiusM, env: SB_ENV });
            capturedEligibleCount = capturedGround.eligible;
          } catch { /* diagnostic only — the FAIL below does not depend on this */ }
        }

        // Give React time to commit the response into rendered cards and run
        // the "jump to results" scroll (app/home.js v8.11) before we look for
        // any card or the load-more control -- the inv=1 response landing is
        // not the same instant as the DOM reflecting it.
        await page.waitForTimeout(2000);

        // Click "Wayfind 5 more spots" until it disappears (or the runaway cap).
        let clicks = 0;
        while (clicks < MAX_PAGES) {
          const more = page.getByRole("button", { name: /Wayfind 5 more spots/ });
          const visible = await more.first().isVisible().catch(() => false);
          if (!visible) break;
          await more.first().click({ timeout: 10000 }).catch(() => { clicks = MAX_PAGES; });
          clicks++;
          await page.waitForTimeout(350);
        }

        const renderedIds = await page.evaluate(() => {
          return Array.from(document.querySelectorAll("[data-wf-position-key]"))
            .map((el) => el.getAttribute("data-wf-position-key"))
            .filter(Boolean)
            .map((k) => k.replace(/^place-/, ""));
        });
        const renderedSet = new Set(renderedIds);

        // Open the map and read window.__wfMapPins. The bottom nav only
        // renders while screen==="map" (app/home.js v8.3, "exactly one nav
        // per screen") -- everywhere else, including the feed we just
        // filtered, "Map" is a link in the TOP `.wf-dests` destinations row
        // (aria-label="Destinations") instead. Confirmed live (2026-09-23).
        let mapIds = [];
        let mapHookPresent = false;
        try {
          const mapLink = page.getByRole("link", { name: "Map" }).first();
          await mapLink.click({ timeout: 10000 });
          await page.waitForTimeout(2500);
          const mapState = await page.evaluate(() => ({
            present: typeof window.__wfMapPins !== "undefined" && window.__wfMapPins !== null,
            ids: (window.__wfMapPins && Array.isArray(window.__wfMapPins.ids)) ? window.__wfMapPins.ids : [],
          }));
          mapHookPresent = mapState.present;
          mapIds = mapState.ids;
        } catch (e) { mapIds = []; console.error(`  [map capture failed] ${e && e.message ? e.message.split("\n")[0] : e}`); }
        // BEFORE-audit reality check: window.__wfMapPins is a diagnostic hook
        // this same fix branch ADDS (app/components/MapView.js) -- it does
        // not exist on unfixed production yet. Without it, "map_present" is
        // NOT MEASURABLE, and reporting it as false would fabricate a
        // map_list_mismatch verdict for every single row. NULL means "not
        // evaluated at this level", exactly like the API-level rows already
        // leave `rendered`/`map_present` null -- classifyRow's map check only
        // fires on a strict `=== false`, so null is silently skipped, and the
        // md/json meta records which case this run hit.
        if (!mapHookPresent) {
          console.log(`  [note] window.__wfMapPins not present on this deployment -- map_present left unmeasured (null) for every row this pair produces`);
        }
        const mapSet = new Set(mapIds);
        // matchingBody is filled asynchronously by the response listener;
        // it was awaited implicitly by the >=2s of waitForTimeout calls
        // since the sub-chip click, but resp.json() is itself async, so
        // give it one more explicit beat before treating it as final.
        await page.waitForTimeout(200);

        // REAL client-render gates (2026-09-23, WS2 follow-up): for any
        // eligible place the API DID serve (apiPresent !== false) but that
        // did not render, decide whether app/home.js's own display-radius
        // cut or brand-collapse dedupe legitimately explains the absence --
        // by actually RUNNING those gates over the full eligible pool
        // (clientGates.mjs, which imports the REAL lib/placeDedupe.js/
        // lib/score.js/lib/wayfindScore.js), never by asserting a reason.
        // Computed from the CAPTURED origin (what the browser actually
        // sent), falling back to the fixture only when no capture landed --
        // a same_origin_ok===false row is voided by classifyRow regardless
        // of any suppression_reason computed here, so this stays accurate
        // without needing a branch for that case.
        const gateOriginLat = Number.isFinite(capturedLat) ? capturedLat : city.lat;
        const gateOriginLng = Number.isFinite(capturedLng) ? capturedLng : city.lng;
        const clientOmissions = classifyClientOmissions(ground.places, { originLat: gateOriginLat, originLng: gateOriginLng, sliderMi: SLIDER_MI });
        let legitDisplayRadius = 0, legitBrandCollapse = 0, unexpectedCardIncomplete = 0;

        const missing = [];
        for (const [id, { p, rank }] of eligibleById) {
          // Real per-place API membership from the CAPTURED response body
          // when we have one; null (not measured) only if the listener
          // never resolved a matching body at all (e.g. it 404'd).
          const apiPresent = matchingBody ? matchingBody.ids.has(id) : null;
          const rendered = renderedSet.has(id);
          const mapPresent = mapHookPresent ? mapSet.has(id) : null;
          if (sameOriginOk === false) {
            missing.push({ id, p, rank, rendered, mapPresent, apiPresent: false, suppressionReason: null });
            continue;
          }
          if (apiPresent === false || !rendered || mapPresent === false) {
            let suppressionReason = null;
            // Only a genuine render omission (API served it, client did not
            // render it) can be explained by the display-radius/dedupe
            // gates -- a place the API itself never served, or one absent
            // only from the map, is a different failure class these client
            // render-time gates say nothing about.
            if (apiPresent !== false && !rendered) {
              const co = clientOmissions.get(id);
              if (co && co.reason) {
                suppressionReason = co.reason;
                if (co.reason.startsWith("outside_display_radius:")) legitDisplayRadius++;
                else if (co.reason.startsWith("brand_collapse:")) legitBrandCollapse++;
              } else if (co && co.cardIncomplete) {
                // Should be unreachable (ground truth's rating>0 gate is
                // strictly stronger than cardComplete's rating>0 OR
                // reviews>0) -- surfaced loudly rather than silently
                // absorbed into a manufactured "legitimate" reason.
                unexpectedCardIncomplete++;
                console.warn(`  [unexpected] ${placeName(p)} (${id}) is eligible under ground truth but fails the real cardComplete() -- left unexplained, not treated as legitimate`);
              }
            }
            missing.push({ id, p, rank, rendered, mapPresent, apiPresent, suppressionReason });
          }
        }

        for (const m of missing) {
          const row = makeRow({
            placeId: m.id, name: placeName(m.p), city: city.name, key, cat, sub,
            sourcePresent: true, apiPresent: m.apiPresent,
            rendered: m.rendered, mapPresent: m.mapPresent,
            rank: m.rank, page: null,
            hasMore: matchingBody ? matchingBody.hasMore : null,
            pageReachable: matchingBody ? (matchingBody.supportsPaging && matchingBody.hasMore === true) : null,
            n: matchingBody ? matchingBody.count : null,
            apiTotal: matchingBody ? matchingBody.total : null,
            eligibleTotal: ground.eligible,
            cacheHeader: matchingBody ? matchingBody.cacheHeader : null,
            sameOriginOk,
            suppressionReason: m.suppressionReason || null,
          });
          rows.push(row);
        }

        pairSummaries.push({
          city: city.slug, key, eligible: ground.eligible,
          grantedLat: city.lat, grantedLng: city.lng,
          capturedLat, capturedLng, capturedUrl, sameOriginOk, capturedEligibleCount,
          apiResponseCount: matchingBody ? matchingBody.count : null,
          apiResponseCacheHeader: matchingBody ? matchingBody.cacheHeader : null,
          apiResponseHasMore: matchingBody ? matchingBody.hasMore : null,
          rendered: renderedIds.length, mapHookPresent, mapPins: mapIds.length,
          loadMoreClicks: clicks, missing: missing.length,
          sliderMi: SLIDER_MI, legitDisplayRadius, legitBrandCollapse, unexpectedCardIncomplete,
        });

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const meta = {
    level: "browser", base: BASE, label: LABEL,
    cities: CITY_LIST.map((c) => c.slug), keys,
    radiusRequestedM: RAW_RADIUS_M, radiusSnappedM: RADIUS_M, sliderMi: SLIDER_MI,
  };
  const { jsonPath, mdPath, summary, fullPaths } = writeReport(OUT, {
    title: `Surface parity audit (browser level)${LABEL ? " — " + LABEL : ""}`,
    meta, rows, totalChecked, totalEligible, pairSummaries,
    full: FULL, fullOut: FULL_OUT,
  });
  console.log(`surface-parity-audit: wrote ${jsonPath} and ${mdPath}`);
  if (fullPaths) console.log(`surface-parity-audit: wrote FULL detail (not committed) to ${fullPaths.jsonPath} and ${fullPaths.mdPath}`);
  console.log(`surface-parity-audit: eligible pairs checked=${totalChecked} FAIL=${summary.totalFail} distinct places=${summary.distinctPlacesAffected}`);
  return { jsonPath, mdPath, summary, pairSummaries, fullPaths };
}

// ── main ─────────────────────────────────────────────────────────────────
(async () => {
  if (LEVEL === "api") await runApiLevel();
  else if (LEVEL === "browser") await runBrowserLevel();
  else { console.error(`surface-parity-audit: unknown --level=${LEVEL} (want api|browser)`); process.exit(2); }
})().catch((e) => { console.error("surface-parity-audit: FAILED —", e && e.stack || e); process.exit(1); });
