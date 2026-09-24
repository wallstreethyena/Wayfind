#!/usr/bin/env node
/**
 * scripts/surface-parity-audit.mjs — reusable, LIVE place-card SURFACE PARITY
 * diagnostic. Drives scripts/lib/parity/eligibility.mjs (Wayfind's own read
 * -> chipIdentity -> rankInventory pipeline, called, never re-implemented)
 * and scripts/lib/parity/report.mjs (the row schema + root-cause classifier)
 * against either a live API endpoint or a live browser.
 *
 *   --level=api|browser|seo|creator|rails   default: api
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
 * --level=seo (2026-09-23, PR #1495 fix round). For every LANDING_INV_SPEC
 *   route (lib/landingInventory.js: things-to-do/restaurants/beaches/
 *   nightlife) x city in --cities, fetches the LIVE rendered
 *   /{catSlug}/{citySlug} HTML, extracts place ids from the same crawlable
 *   `/p/<id>?action=save` anchor every IconicPlaceCard always renders, and
 *   compares that set to the TRUE top-level ranking the page's own code would
 *   produce right now -- computed by loading lib/landing.js for real (the
 *   jsxLoad.mjs loader other guards in this repo already use to run a real
 *   JSX module under plain node) and calling its actual rankedFor(), then
 *   lib/venueContainment.js's real groupByContainment() to know which ranked
 *   places are top-level cards (their own /p/<id> link) versus rendered only
 *   as a nested chip inside a parent's card (no independent link at all) --
 *   never a re-implementation of either.
 * --level=creator. Every creator-linked (creator handle, place id) pair from
 *   lib/creatorVideos.js's allCreators() that is OPERATIONAL in inventory is
 *   checked two ways: (1) the REAL creatorVideosFor() resolver, called
 *   against the place shaped from its live inventory row, must still resolve
 *   to that creator (proves the surface machinery every place card/detail
 *   sheet uses would actually attribute it); (2) for creators who clear
 *   CREATOR_PAGE_MIN_SPOTS (their own indexable /creators/<handle> page
 *   exists), the LIVE rendered page HTML must actually carry that place.
 * --level=rails. lib/railSelect.js's RAIL_SELECT is each rail's own,
 *   already-written contract: an `identity` function is a real, callable
 *   category/identity predicate; a rail with none but a `waiver` string is
 *   curated/cross-category by the file's own admission and is recorded OUT
 *   OF SCOPE with that waiver, never forced through a manufactured category.
 *   For each identity-bearing rail, a live /api/rails response (v=1 -- the
 *   full, unwindowed shape; this surface caps nothing, "no max on anything")
 *   is compared against the eligible set the SAME identity function admits
 *   over a live inventory box read at that rail's own radius.
 *
 * ENV (command line / calling shell only — NEVER written into a repo file):
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_KEY — an anon /
 *   publishable key is enough (wf_inventory is anon-readable). Used ONLY to
 *   compute GROUND TRUTH via this repo's own (fixed) code; the live API/
 *   browser calls talk to production over plain HTTPS and need no credential.
 *
 * THE AFTER-RUN, once the fix is deployed, is ONE command per level with a
 * new --out and --label — see docs/audits/surface-parity/README.md, whose
 * "Post-deploy AFTER run" section carries the exact five commands (the api
 * one is also printed at the end of every run of this script).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LANDING_CITIES } from "../lib/landingCities.js";
import { chipIdentityKeys, subAllowOnlyKeys, computeEligibleSet, placeName, milesBetween } from "./lib/parity/eligibility.mjs";
import { makeRow, writeReport, writeGenericReport } from "./lib/parity/report.mjs";
// REAL client-side gates, called rather than restated (2026-09-23,
// orchestrator review): a place the API served but the browser did not
// render can be a real bug, OR a place the CLIENT itself legitimately drops
// before paint -- the display-radius cut and the same-brand dedupe are two
// such gates, and calling the actual functions (via clientGates.mjs, which
// itself imports lib/placeDedupe.js/lib/score.js/lib/wayfindScore.js
// VERBATIM) is the only way to tell them apart from a real omission without
// silently re-implementing (and possibly drifting from) app/home.js's rule.
import { classifyClientOmissions, SLIDER_MI_DEFAULT } from "./lib/parity/clientGates.mjs";
// The exhaustive offset-page walk's own honesty bookkeeping (item 1/6, PR
// #1495 fix round) -- factored out so scripts/check-surface-parity-
// hermetic.mjs can drive the SAME walk against a fake server, never a
// re-implementation of it.
import { walkPagesToExhaustion, computeApiNextPageReachable } from "./lib/parity/pagingProof.mjs";
// The real browse-surface chip menu (item 2, PR #1495 fix round): read, never
// hand-copied, so CHIP_UI_LABELS below can never silently drift from what
// app/home.js's CategoryMenu actually renders. lib/categories.js is a plain,
// self-contained module (zero imports) and loads directly; lib/google.js
// uses Next's extensionless local imports internally (`from "./businessStatus"`)
// that plain node cannot resolve, so it -- like lib/landing.js/lib/railSelect.js
// below -- goes through jsxLoad.mjs (the same repo-standard loader other
// guards already use to run a real production module under plain node),
// loaded lazily inside runBrowserLevel so an --level=api run never pays for it.
import { CATEGORY_TILES } from "../lib/categories.js";
// --level=browser/seo/creator/rails call further real production modules;
// imported lazily inside each level's own function (below) so `--level=api`
// never pays for loading lib/google.js, lib/landing.js's whole JSX dependency
// graph, or lib/railSelect.js's rail registry.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

/** Same request as fetchProdJSON, but for a page that returns HTML
 * (--level=seo's rendered landing pages, --level=creator's /creators/<handle>
 * pages) rather than JSON. */
async function fetchProdHTML(url) {
  const r = await fetch(url, {
    headers: { Referer: `${BASE}/`, Origin: BASE, "User-Agent": BROWSER_UA },
  });
  let text = null;
  try { text = await r.text(); } catch { text = null; }
  return { status: r.status, ok: r.ok, text };
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
 * (pre-fix production shape — the exact thing this audit exists to measure).
 *
 * HONEST REACHABILITY (2026-09-23, PR #1495 fix round, item 1). This walk
 * already goes to exhaustion, which is exactly the proof `api_next_page_
 * reachable` needs -- the missing piece was distinguishing WHY the walk
 * stopped. `exhaustedCleanly` is true only when the loop ended because the
 * server's own hasMore genuinely went false or a short/empty page arrived --
 * never because we merely stopped asking. Two things leave it false, and both
 * mean "unproven", not "proven absent": hitting --maxPages while hasMore was
 * still true (our own cap cut the walk off), or an offset-page fetch failing
 * mid-walk (a "missing offset page" -- exactly the case the job's fix round
 * names for the hermetic guard). The caller (runApiLevel) uses this, together
 * with a coverage check against ground truth, to set api_next_page_reachable
 * -- and NEVER the old `supportsPaging && hasMore === true`, which reads a
 * flag the server can misreport and proves nothing about what continuing
 * would actually return. */
async function fetchProdMembership({ lat, lng, cat, sub }) {
  const N = 400;
  let firstStatus = null;
  const cacheHeaders = [];
  const walk = await walkPagesToExhaustion({
    maxPages: MAX_PAGES,
    fetchPage: async (offset, page) => {
      const r = await fetchProdJSON(invUrl({ lat, lng, cat, sub, n: N, offset }));
      if (page === 0) firstStatus = r.status;
      cacheHeaders.push(r.cacheHeader);
      return { ok: r.ok, json: r.json };
    },
  });
  return { ...walk, firstStatus, cacheHeaders };
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
    // HONEST REACHABILITY (item 1, PR #1495 fix round). `rank >= PAGE_N`
    // still means "this place sits beyond the first observed page, so a
    // rank_cap claim is at least PLAUSIBLE" -- what changed is how that claim
    // is PROVEN: api_next_page_reachable is true only when the exhaustive
    // offset-page walk above (a) terminated CLEANLY (server hasMore genuinely
    // went false / a short page arrived, never merely "we stopped asking")
    // AND (b) its id union covers every ground-truth eligible id -- i.e.
    // paging genuinely delivered everything there was to deliver. The OLD
    // `prod.supportsPaging && prod.hasMore === true` read a single flag the
    // server can misreport (or that a walk WE cut off ourselves happened to
    // still carry) and never checked whether continuing actually returned
    // anything -- which is nearly always vacuous the moment the walk is
    // already exhaustive: if paging genuinely worked, the "missing" place
    // would already have been found during the walk and never reach this
    // code path at all. classifyRow's rank_cap: branch uses this exact field
    // to decide pass vs pagination_invisibility; a rank < PAGE_N place (which
    // should already have been on the very first, unpaged fetch) carries no
    // suppression_reason at all and is a plain eligibility_passed_api_omitted
    // regardless of this walk's later-page behavior -- unchanged from before.
    const apiNextPageReachable = computeApiNextPageReachable(prod, ground.places.map((p) => p.id));
    for (const { p, rank } of missing) {
      const beyondFirstPage = rank >= PAGE_N;
      const suppressionReason = beyondFirstPage ? `rank_cap:${PAGE_N}` : null;
      const row = makeRow({
        placeId: p.id, name: placeName(p), city: city.name, key, cat, sub,
        sourcePresent: true, apiPresent: false, rendered: null, mapPresent: null,
        rank, page: Math.floor(rank / PAGE_N), offset: null, n: PAGE_N,
        hasMore: prod.hasMore, pageReachable: apiNextPageReachable,
        apiNextPageReachable,
        apiTotal: prod.total, eligibleTotal: ground.eligible,
        cacheHeader: Array.isArray(prod.cacheHeaders) ? prod.cacheHeaders.join(",") : prod.cacheHeaders,
        suppressionReason,
        notes: [
          prod.supportsPaging ? null : "production response carries no total/hasMore/truncated fields (pre-fix shape)",
          prod.cutOffByMaxPages ? "offset-page walk was cut off by --maxPages while hasMore was still true -- reachability NOT proven" : null,
          prod.stoppedByFailedFetch ? "an offset-page fetch failed mid-walk -- reachability NOT proven" : null,
        ].filter(Boolean).join("; ") || null,
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
      apiWalkExhaustedCleanly: prod.exhaustedCleanly,
      apiWalkCutOffByMaxPages: prod.cutOffByMaxPages,
      apiWalkStoppedByFailedFetch: prod.stoppedByFailedFetch,
      apiNextPageReachable,
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
// Chip-menu labels the real UI renders — DERIVED, not hand-listed (item 2,
// PR #1495 fix round: "derive labels from the real SUBFILTERS/CategoryMenu
// definitions, not a hand list if avoidable"). app/home.js's nav tabs render
// `Cats.CATEGORY_TILES` verbatim for the category row and `SUBFILTERS[cat]`
// verbatim for that category's sub-chip tray (confirmed live, 2026-09-23:
// `{Cats.CATEGORY_TILES.map((m) => ... {m.label} ...)}` /
// `{navSubs.map((sf) => ... {sf.label} ...)}`, navSubs = SUBFILTERS[navOpenCat]).
// Every (cat, sub) pair CATEGORY_TILES x SUBFILTERS[cat] -- including each
// category's own "All" sub -- is therefore a REAL, clickable path from the
// main browse surface and gets an entry; a key with no CATEGORY_TILES entry
// at all (e.g. `beach:beaches` -- the standalone Beach tab was retired in
// favor of Things To Do -> Outdoors/Beaches, lib/google.js's CATEGORIES
// comment: "kept for back-compat/deep links") has NO UI path and is
// correctly left out here, same as before -- it is covered at the API level,
// where inv=1 accepts any cat/sub whether or not the client menu offers a
// button for it.
async function deriveChipUiLabels() {
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const { SUBFILTERS } = await loadComponent(join(ROOT, "lib/google.js"), ROOT);
  const out = {};
  for (const tile of CATEGORY_TILES) {
    const subs = SUBFILTERS[tile.id] || [];
    for (const sf of subs) {
      out[`${tile.id}:${sf.id}`] = { catLabel: tile.label, subLabel: sf.label };
    }
  }
  return out;
}

async function runBrowserLevel() {
  const { chromium } = await import("playwright");
  const CHIP_UI_LABELS = await deriveChipUiLabels();
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
        // `continuationExhausted` (item 1, PR #1495 fix round) is the honest
        // half of this proof: true ONLY when the control genuinely
        // disappeared (including trivially, when it was never visible at all
        // because the category has too few eligible places to need one) --
        // never when we merely stopped clicking because --maxPages was hit,
        // or a click itself failed. The other half (coverage) is computed
        // just below, once renderedIds exists.
        let clicks = 0;
        let continuationExhausted = false;
        while (clicks < MAX_PAGES) {
          const more = page.getByRole("button", { name: /Wayfind 5 more spots/ });
          const visible = await more.first().isVisible().catch(() => false);
          if (!visible) { continuationExhausted = true; break; }
          const clicked = await more.first().click({ timeout: 10000 }).then(() => true).catch(() => false);
          if (!clicked) break; // a failed click is NOT exhaustion -- unproven, same as hitting --maxPages
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

        // HONEST browser-level reachability (item 1, PR #1495 fix round):
        // "reachable" means the continuation control was clicked to genuine
        // exhaustion AND the resulting rendered-id union covers every place
        // this surface OWES a card -- a legitimately-suppressed place
        // (display-radius cut, real brand collapse) is not "UI-eligible" and
        // does not count against coverage. Never inferred from the API's own
        // hasMore, which says nothing about whether the CLIENT actually
        // surfaced the rest -- that was the exact gap the old per-row
        // `pageReachable: matchingBody.supportsPaging && matchingBody.hasMore
        // === true` left open.
        const uiEligibleIds = [...eligibleIds].filter((id) => {
          const co = clientOmissions.get(id);
          return !(co && co.reason);
        });
        const browserNextPageReachable = continuationExhausted && uiEligibleIds.every((id) => renderedSet.has(id));

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
            pageReachable: browserNextPageReachable,
            browserNextPageReachable,
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
          continuationExhausted, uiEligible: uiEligibleIds.length, browserNextPageReachable,
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

// ── SEO-LEVEL RUN (item 3, PR #1495 fix round) ──────────────────────────
/** Every place-card's crawlable, ALWAYS-rendered save action
 * (app/components/IconicPlaceCard.js: `actionHref = (action) => "/p/" +
 * encodeURIComponent(place.id) + "?action=" + action`, and "Save still has a
 * crawlable fallback for callers that have not wired onSave" -- true of every
 * landing-page render, which never wires onSave). This is the one place-id
 * signal EVERY top-level card's rendered HTML carries, in display order. A
 * place rendered only as a grouped CHILD (lib/venueContainment.js) carries no
 * such link -- it is a plain `<span>{c.name}</span>` with no id anywhere in
 * the markup -- which is exactly why the true-top-N comparison below groups
 * the live ranking the same way before comparing, instead of expecting every
 * ranked id to have its own link. */
function extractSavedPlaceIds(html) {
  const ids = [];
  const seen = new Set();
  const re = /\/p\/([A-Za-z0-9_%.-]{6,255})\?action=save/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    let id;
    try { id = decodeURIComponent(m[1]); } catch { id = m[1]; }
    if (id && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

async function runSeoLevel() {
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const { serveFromInventory } = await import("../lib/inventoryServe.js");
  const { groupByContainment } = await import("../lib/venueContainment.js");
  // The four SEO/local landing routes and the exact (cat, sub) each one
  // reads -- imported from the real lib/landingInventory.js, never restated:
  // things-to-do/attractions:all, restaurants/food:all, beaches/beach:beaches,
  // nightlife/nightlife:all. Their pages live at app/{catSlug}/[city]/page.js,
  // all four binding the same lib/landing.js LandingPage/rankedFor for every
  // LANDING_CITIES slug (generateStaticParams returns
  // Object.keys(LANDING_CITIES) unconditionally).
  const { LANDING_INV_SPEC } = await import("../lib/landingInventory.js");

  console.log("surface-parity-audit: SEO level — loading lib/landing.js for real (jsxLoad.mjs)...");
  // The REAL ranking module, run for real -- never a copy of rankLandingPool.
  // serveFromInventory is injected at the ONE seam lib/landingInventory.js's
  // fetchLandingInventory already exposes for exactly this purpose (a
  // dependency override for hermetic/alternate-credential callers), pinned to
  // OUR anon/publishable SB_ENV rather than lib/serverCache.js's own sbEnv()
  // (which reads SUPABASE_SERVICE_ROLE_KEY -- a credential this audit is
  // explicitly never given). Same pattern eligibility.mjs's computeEligibleSet
  // uses for the exact same reason.
  const landingMod = await loadComponent(join(ROOT, "lib/landing.js"), ROOT);
  const serveWithEnv = (cat, lat, lng, radiusM, n, sub, serveOpts) =>
    serveFromInventory(cat, lat, lng, radiusM, n, sub, { ...serveOpts, env: SB_ENV });

  const catSlugs = Object.keys(LANDING_INV_SPEC);
  console.log(`surface-parity-audit: SEO level — ${catSlugs.length} landing routes x ${CITY_LIST.length} cities`);

  const sections = [];
  let totalChecked = 0, totalMissing = 0, totalPagesWithList = 0;
  for (const catSlug of catSlugs) {
    const rows = [];
    for (const city of CITY_LIST) {
      let list;
      try {
        list = await landingMod.rankedFor(catSlug, city.slug, { serveFromInventory: serveWithEnv });
      } catch (e) {
        rows.push({ city: city.slug, error: `rankedFor threw: ${e.message}` });
        continue;
      }
      if (!Array.isArray(list) || !list.length) {
        rows.push({ city: city.slug, note: list === null ? "rankedFor returned null (no key/upstream down at this read)" : "thin market -- rankedFor returned []", expected: 0, rendered: 0, missing: 0 });
        continue;
      }
      totalPagesWithList++;
      // The TRUE top-level ids -- grouped exactly as LandingPage groups them,
      // via the REAL groupByContainment, so a legitimately-nested child (a
      // ride inside its park) is never counted as "missing" for lacking its
      // own /p/<id> link.
      const expectedIds = groupByContainment(list).groups.map((g) => g.place && g.place.id).filter(Boolean);
      totalChecked += expectedIds.length;

      const url = `${BASE}/${catSlug}/${city.slug}`;
      const html = await fetchProdHTML(url);
      if (!html.ok || !html.text) {
        rows.push({ city: city.slug, error: `fetch ${url} -> status ${html.status}`, expected: expectedIds.length });
        continue;
      }
      const renderedIds = extractSavedPlaceIds(html.text);
      const renderedSet = new Set(renderedIds);
      const missing = expectedIds.filter((id) => !renderedSet.has(id));
      totalMissing += missing.length;
      rows.push({
        city: city.slug, url, expected: expectedIds.length, rendered: renderedIds.length,
        missing: missing.length, missingIds: missing.slice(0, 15).join(", ") || "",
      });
    }
    sections.push({
      heading: `${catSlug} (${LANDING_INV_SPEC[catSlug].cat}:${LANDING_INV_SPEC[catSlug].sub})`,
      columns: ["city", "expected", "rendered", "missing", "missingIds", "note", "error"],
      rows,
    });
  }

  const meta = { level: "seo", base: BASE, label: LABEL, cities: CITY_LIST.map((c) => c.slug), routes: catSlugs };
  const summaryLines = [
    `${totalPagesWithList}/${catSlugs.length * CITY_LIST.length} (route, city) pages had a non-empty ranked list`,
    `${totalChecked} true top-level places checked across every route/city`,
    `${totalMissing} missing from their rendered landing page (expected on the page, per the page's own live ranking, but no matching /p/<id>?action=save link found)`,
  ];
  const { jsonPath, mdPath } = writeGenericReport(OUT, {
    title: `Surface parity audit (SEO landing level)${LABEL ? " — " + LABEL : ""}`,
    meta, summary: { totalChecked, totalMissing, pagesWithList: totalPagesWithList }, summaryLines, sections,
  });
  console.log(`surface-parity-audit: wrote ${jsonPath} and ${mdPath}`);
  console.log(`surface-parity-audit: SEO level — checked=${totalChecked} missing=${totalMissing}`);
  return { jsonPath, mdPath };
}

// ── CREATOR-LEVEL RUN (item 4, PR #1495 fix round) ──────────────────────
async function runCreatorLevel() {
  const { allCreators, hasCreatorPage, creatorVideosFor } = await import("../lib/creatorVideos.js");
  const { creators } = allCreators();

  // Every (creator, place) pair with a real placeId -- distinct by (handle,
  // spot key) so two posts about the same venue by the same creator count
  // once, matching the coordinator-referenced reuse figure (89 creators, 318
  // ids) exactly.
  const pairs = [];
  const seenPair = new Set();
  for (const c of creators) {
    for (const s of c.spots || []) {
      if (!s.placeId) continue;
      const k = `${c.handle}\u0000${s.key}`;
      if (seenPair.has(k)) continue;
      seenPair.add(k);
      pairs.push({ handle: c.handle, placeId: s.placeId, name: s.name, city: s.city, hasPage: hasCreatorPage(c.handle) });
    }
  }
  console.log(`surface-parity-audit: creator level — ${creators.length} creators, ${pairs.length} distinct (creator, place-id) pairs; checking OPERATIONAL status + the real resolver + (page-eligible creators) their live page`);

  // OPERATIONAL status, read directly off wf_inventory -- a plain status
  // check, not an eligibility computation (family/rating/radius gates do not
  // apply here; the job's rule is simply "OPERATIONAL in inventory").
  const idList = [...new Set(pairs.map((p) => p.placeId))];
  const statusById = new Map();
  const BATCH = 100;
  for (let i = 0; i < idList.length; i += BATCH) {
    const batch = idList.slice(i, i + BATCH);
    const url = `${SB_ENV.url}/rest/v1/wf_inventory?select=place_id,name,status,lat,lng,google_types,primary_type,category&place_id=in.(${batch.map(encodeURIComponent).join(",")})`;
    const r = await fetch(url, { headers: { apikey: SB_ENV.key, Authorization: `Bearer ${SB_ENV.key}` } });
    if (!r.ok) throw new Error(`surface-parity-audit: creator level — wf_inventory batch read failed (${r.status})`);
    const rows = await r.json();
    for (const row of rows) if (row && row.place_id) statusById.set(row.place_id, row);
  }

  const rows = [];
  let operationalCount = 0, resolverFail = 0, pageFail = 0;
  // /creators/<handle> pages are few (CREATOR_PAGE_MIN_SPOTS gates most of the
  // 89 down to a small page-eligible set) -- fetched once per handle, not per
  // pair, and cached across pairs sharing a creator.
  const pageHtmlByHandle = new Map();
  for (const pair of pairs) {
    const invRow = statusById.get(pair.placeId);
    const operational = !!invRow && String(invRow.status || "").toUpperCase() === "OPERATIONAL";
    if (!operational) {
      rows.push({ handle: pair.handle, placeId: pair.placeId, name: pair.name, operational: false, note: invRow ? `status=${invRow.status}` : "not in wf_inventory", outOfScope: true });
      continue;
    }
    operationalCount++;
    // The real resolver, called against the place as its live inventory row
    // shapes it -- proves the actual JOIN mechanism (placeId, or the name+
    // city fallback) still attributes this exact row to this creator, the
    // same machinery every place card / detail sheet relies on.
    const shaped = {
      id: invRow.place_id, name: invRow.name,
      types: Array.isArray(invRow.google_types) ? invRow.google_types : [],
      primaryType: invRow.primary_type || null,
    };
    let resolverOk = false;
    try {
      resolverOk = creatorVideosFor(shaped, pair.city).some((v) => v && v.creator && String(v.creator).toLowerCase() === pair.handle.toLowerCase());
    } catch { resolverOk = false; }
    if (!resolverOk) resolverFail++;

    let pageOk = null;
    if (pair.hasPage) {
      let html = pageHtmlByHandle.get(pair.handle);
      if (html === undefined) {
        const res = await fetchProdHTML(`${BASE}/creators/${encodeURIComponent(pair.handle)}`);
        html = res.ok ? res.text : null;
        pageHtmlByHandle.set(pair.handle, html);
      }
      pageOk = !!html && (html.includes(pair.placeId) || html.includes(invRow.name));
      if (!pageOk) pageFail++;
    }

    rows.push({
      handle: pair.handle, placeId: pair.placeId, name: invRow.name, operational: true,
      resolverOk, hasPage: pair.hasPage, pageOk,
    });
  }

  const failing = rows.filter((r) => r.operational && (r.resolverOk === false || r.pageOk === false));
  const meta = { level: "creator", base: BASE, label: LABEL, creators: creators.length, pairsChecked: pairs.length };
  const summaryLines = [
    `${creators.length} creators, ${pairs.length} distinct (creator, place-id) pairs`,
    `${operationalCount} OPERATIONAL in inventory (the rest are out of scope: not operational / not in inventory)`,
    `${resolverFail} fail the real creatorVideosFor() resolver against their live inventory row`,
    `${pageFail} are missing from their creator's own live /creators/<handle> page (page-eligible creators only)`,
  ];
  const { jsonPath, mdPath } = writeGenericReport(OUT, {
    title: `Surface parity audit (creator level)${LABEL ? " — " + LABEL : ""}`,
    meta, summary: { creators: creators.length, pairsChecked: pairs.length, operationalCount, resolverFail, pageFail }, summaryLines,
    sections: [
      { heading: "Failing pairs (resolver and/or creator page)", columns: ["handle", "placeId", "name", "resolverOk", "hasPage", "pageOk"], rows: failing },
      { heading: "All checked pairs", note: "Full detail for every OPERATIONAL (creator, place) pair, plus out-of-scope (non-operational) ones.", columns: ["handle", "placeId", "name", "operational", "resolverOk", "hasPage", "pageOk", "note"], rows },
    ],
  });
  console.log(`surface-parity-audit: wrote ${jsonPath} and ${mdPath}`);
  console.log(`surface-parity-audit: creator level — pairs=${pairs.length} operational=${operationalCount} resolverFail=${resolverFail} pageFail=${pageFail}`);
  return { jsonPath, mdPath };
}

// ── RAILS-LEVEL RUN (item 5, PR #1495 fix round) ────────────────────────
async function runRailsLevel() {
  const { RAIL_SELECT } = await import("../lib/railSelect.js");
  const { FAMILY_NEAR_MI } = await import("../lib/familyPlace.js");
  const { EVENTS_NEAR_MI } = await import("../lib/eventVenue.js");
  const { BREAKFAST_NEAR_MI } = await import("../lib/breakfast.js");
  const { BIRTHDAY_NEAR_MI } = await import("../lib/birthdayPlace.js");
  const { NEAR_RADIUS_MI } = await import("../lib/todaysBest.js");

  // Radius per identity-bearing rail, read from the SAME constants
  // lib/railsData.js imports for the SAME rail (never re-guessed) where one
  // is exported; `break` (quick eats) has none exported -- lib/railsData.js's
  // buildMorningIdentityPools applies `p.distMi <= 8` inline, ported here
  // literally with this citation rather than invented independently. Any
  // identity-bearing rail with neither (eat/beach/tonight/datenight) falls
  // back to NEAR_RADIUS_MI, the general radius fillRails applies to every
  // non-drive rail -- noted per-row, never silently assumed to be exact.
  const RAIL_RADIUS_MI = { family: FAMILY_NEAR_MI, events: EVENTS_NEAR_MI, breakfast: BREAKFAST_NEAR_MI, birthday: BIRTHDAY_NEAR_MI, break: 8 };
  const RAIL_SOURCE_CAT = { family: "attractions", events: "attractions", breakfast: "food", birthday: "attractions", break: "food", eat: "food", beach: "beach", tonight: "nightlife", datenight: "food" };

  const outOfScope = [];
  const checked = [];
  for (const [railId, def] of Object.entries(RAIL_SELECT)) {
    if (!def || typeof def.identity !== "function") {
      outOfScope.push({ rail: railId, reason: (def && def.waiver) || "no identity function and no recorded waiver in lib/railSelect.js" });
    } else {
      checked.push(railId);
    }
  }
  console.log(`surface-parity-audit: rails level — ${checked.length} identity-bearing rails (${checked.join(", ")}), ${outOfScope.length} curated rails out of scope`);

  // Same box-query shape lib/railsData.js's buildIdentityPool uses for these
  // exact rails (status=eq.OPERATIONAL within a lat/lng box) -- ported here
  // (byte-similar, cited) because buildIdentityPool itself is not callable in
  // isolation from a raw box; it requires the full multi-category `pools`
  // object loadPools() builds. The identity FUNCTION itself is never
  // restated -- it is called straight off RAIL_SELECT.
  async function fetchOperationalBox({ lat, lng, radiusMi }) {
    const dLat = radiusMi / 69 + 0.02;
    const dLng = radiusMi / (69 * Math.cos((lat * Math.PI) / 180)) + 0.02;
    const q = `lat=gte.${(lat - dLat).toFixed(4)}&lat=lte.${(lat + dLat).toFixed(4)}&lng=gte.${(lng - dLng).toFixed(4)}&lng=lte.${(lng + dLng).toFixed(4)}`;
    const url = `${SB_ENV.url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,google_types,primary_type,category,cuisines,signals&status=eq.OPERATIONAL&${q}&limit=1000`;
    const r = await fetch(url, { headers: { apikey: SB_ENV.key, Authorization: `Bearer ${SB_ENV.key}` } });
    if (!r.ok) throw new Error(`wf_inventory box read failed (${r.status})`);
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const s = row.signals || {};
      const d = milesBetween(lat, lng, row.lat, row.lng);
      return {
        id: row.place_id, name: row.name,
        rating: typeof s.rating === "number" ? s.rating : null,
        reviews: typeof s.reviews === "number" ? s.reviews : 0,
        primaryType: row.primary_type || null, primary_type: row.primary_type || null,
        types: Array.isArray(row.google_types) ? row.google_types : [],
        cuisines: Array.isArray(row.cuisines) ? row.cuisines.filter(Boolean) : [],
        category: row.category || null,
        lat: row.lat, lng: row.lng, distMi: d,
      };
    }).filter((p) => Number.isFinite(p.distMi) && p.distMi <= radiusMi);
  }

  const rows = [];
  let totalEligible = 0, totalMissing = 0;
  for (const city of CITY_LIST) {
    const railsUrl = `${BASE}/api/rails?lat=${city.lat.toFixed(4)}&lng=${city.lng.toFixed(4)}&city=${encodeURIComponent(city.slug)}`;
    const r = await fetchProdJSON(railsUrl);
    const servedPlaces = (r.ok && r.json && r.json.covered && r.json.data && r.json.data.places) || {};

    for (const railId of checked) {
      const radiusMi = RAIL_RADIUS_MI[railId] || NEAR_RADIUS_MI;
      const cat = RAIL_SOURCE_CAT[railId] || "attractions";
      let groundRows;
      try {
        groundRows = await fetchOperationalBox({ lat: city.lat, lng: city.lng, radiusMi });
      } catch (e) {
        rows.push({ rail: railId, city: city.slug, error: `ground read failed: ${e.message}` });
        continue;
      }
      const identityFn = RAIL_SELECT[railId].identity;
      const eligible = groundRows.filter((p) => { try { return !!identityFn(p); } catch { return false; } });
      const eligibleIds = eligible.map((p) => p.id);
      totalEligible += eligibleIds.length;
      const served = Array.isArray(servedPlaces[railId]) ? servedPlaces[railId] : [];
      const servedIds = new Set(served.map((p) => p && p.id).filter(Boolean));
      const missing = eligibleIds.filter((id) => !servedIds.has(id));
      totalMissing += missing.length;
      rows.push({
        rail: railId, city: city.slug, sourceCat: cat, radiusMi,
        eligible: eligibleIds.length, served: served.length, missing: missing.length,
        missingIds: missing.slice(0, 15).join(", ") || "",
        railsCovered: !!(r.ok && r.json && r.json.covered),
      });
    }
  }

  const meta = { level: "rails", base: BASE, label: LABEL, cities: CITY_LIST.map((c) => c.slug), railsChecked: checked, railsOutOfScope: outOfScope.map((o) => o.rail) };
  const summaryLines = [
    `${checked.length} identity-bearing rails checked (${checked.join(", ")}) across ${CITY_LIST.length} cities`,
    `${outOfScope.length} curated rails recorded OUT OF SCOPE with their own waiver (no forced category)`,
    `${totalEligible} total eligible (rail, city) place observations; ${totalMissing} missing from the rail's own served set`,
  ];
  const { jsonPath, mdPath } = writeGenericReport(OUT, {
    title: `Surface parity audit (rails level)${LABEL ? " — " + LABEL : ""}`,
    meta, summary: { totalEligible, totalMissing, railsChecked: checked.length, railsOutOfScope: outOfScope.length }, summaryLines,
    sections: [
      { heading: "Out of scope (curated, no category contract)", columns: ["rail", "reason"], rows: outOfScope },
      { heading: "Checked rails — per (rail, city)", columns: ["rail", "city", "sourceCat", "radiusMi", "eligible", "served", "missing", "missingIds", "railsCovered", "error"], rows },
    ],
  });
  console.log(`surface-parity-audit: wrote ${jsonPath} and ${mdPath}`);
  console.log(`surface-parity-audit: rails level — eligible=${totalEligible} missing=${totalMissing} outOfScope=${outOfScope.length}`);
  return { jsonPath, mdPath };
}

// ── main ─────────────────────────────────────────────────────────────────
(async () => {
  if (LEVEL === "api") await runApiLevel();
  else if (LEVEL === "browser") await runBrowserLevel();
  else if (LEVEL === "seo") await runSeoLevel();
  else if (LEVEL === "creator") await runCreatorLevel();
  else if (LEVEL === "rails") await runRailsLevel();
  else { console.error(`surface-parity-audit: unknown --level=${LEVEL} (want api|browser|seo|creator|rails)`); process.exit(2); }
})().catch((e) => { console.error("surface-parity-audit: FAILED —", e && e.stack || e); process.exit(1); });
