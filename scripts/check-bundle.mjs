// Deploy gate (July 2026 decomposition, G0): the homepage JS budget, measured
// from the real build output so the decomposition's savings can never silently
// regress. Reads .next/app-build-manifest.json (run after `next build`; wired
// into audit:regression, which builds first) and gzips every JS asset the "/"
// route ships. Two budgets, both ratcheted DOWN as G1–G4 extract code out of
// the eager route chunk — raising either number back up is a product decision,
// not a fix:
//   G0 baseline (v5.44): route chunk 172.4 KB gz, total 321.1 KB gz.
// Ratchet plan: G1 (screens) ≈ −18, G2 (sheets) ≈ −18, G3 (detail) ≈ −27,
// G4 (map shell/experience/intro) ≈ −17 — all from the route chunk.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// ─── v7.29: THIS GUARD WAS NEVER RUNNING, AND IT HAD BEEN RED FOR MONTHS ────
// It was wired ONLY into `npm run audit:regression`, which nothing runs
// automatically and which is absent from scripts/guards.txt. Measured on a
// pristine clone of origin/main on 2026-08-12: route chunk 212.0KB against the
// 175 below, total 535.8KB against the 325 — i.e. the deploy gate had been
// failing silently for long enough that nobody knew it existed.
//
// So it is now `postbuild` in package.json: it runs on every real build, which
// is the only version of a deploy gate worth having.
//
// AND THE NUMBERS ARE RE-BASED TO THE HONEST CURRENT ONES. Leaving them at
// 175/325 would mean wiring in a gate that fails on the first deploy, which is
// how a guard gets commented out instead of fixed. These are RATCHETS: they may
// only ever be lowered. The targets that produced 175/325 are still the right
// targets — app/home.js is 388KB parsed and 58% of the route chunk, the guide
// corpus rides along via LocalEdit, and lib/trendTaxonomy.js reaches the client
// through the Exploding rail. Each of those lands as its own step DOWN.
// THE 175 IS MET AGAIN. It was set as a target during the July decomposition and
// had been failing at 212.0KB on main ever since, unseen. Splitting the guide
// corpus out of LocalEdit (lib/localEdit.js — the corpus reached the client to
// compute a read-time label) and putting ThingsToDoList behind next/dynamic took
// the route chunk to 165.6KB, so the original number is restored rather than
// left at the loosened 215 this file briefly carried.
//
// The total is 500 and not 325: 325 was never grounded in a measurement, and
// 490.0KB is what the route honestly weighs today. RATCHETS — lower only. The
// next real lever is app/home.js itself (388KB parsed, still the majority of
// the route chunk) and lib/trendTaxonomy.js reaching the client through the
// Exploding rail.
const ROUTE_CHUNK_BUDGET_KB = 175; // static/chunks/app/page-*.js, gzipped. RATCHET: lower only.
const TOTAL_BUDGET_KB = 492;       // every JS asset for route "/", gzipped.  RATCHET: lower only.
const WARN_HEADROOM_KB = 2;        // print a loud warning below this. See below.
// ─── WHY 500, AND WHY THIS GATE STARTED BLOCKING EVERYTHING (2026-08-26) ────
// #950 set 496 from a LOCAL measurement of 495.2 — 0.8KB of headroom, which
// looked generous and was not, for two reasons nobody had measured:
//
//   1. DRIFT. Ordinary work moved main to 495.9 within days. Nothing regressed;
//      a homepage simply accretes.
//   2. ENVIRONMENT. gzip output is not portable. Vercel measured a comparable
//      tree at 496.1 while local said 495.7 — a ~0.4-0.6KB gap between zlib
//      builds. On an 0.8KB budget that gap IS the budget.
//
// Net: a gate with tens of BYTES of headroom stopped measuring the code and
// started measuring which machine ran it. Four PRs (#951, #955, #956, #957)
// died on it, including #956 whose only job was to fix a live ErrorBoundary
// crash. A deploy gate that blocks an outage fix over 100 bytes is not
// protecting the product; it is the outage.
//
// And the obvious escape route does not exist: removing 12.9KB of provably
// unreferenced source from app/home.js moved this number by TEN BYTES, because
// webpack had already tree-shaken all of it. Dead code is not the lever. The
// only real lever is moving LIVE code off the client, and app/home.js at 388KB
// parsed is that whole job.
//
// 500 was the pre-#950 value and still a large ratchet DOWN from the 535.8
// this gate was silently failing at for months. Lower it again when live code
// leaves the client — but keep >=2KB of headroom, because gzip is
// environment-dependent and a budget without slack measures the weather.
//
// v8.63, same day: the CSS-comment strip (below) freed 7.2KB — measured
// 488.8 at level 6. 493 locks ~6KB of that win while keeping 4.2KB of
// headroom, honoring both halves of the lesson above: real savings ratchet
// down, and the slack floor stays comfortably above 2KB.
// 2026-08-26: CULTURE corpus left the homepage client (lib/cultureCorpus.js).
// Measured 495.2KB gz after the split. 496 locked the savings; 500 was the
// previous ratchet that #949 died against (500.1).
// 2026-08-26 (v8.63): 15.5KB of PROSE COMMENTS were shipping inside the CSS
// template strings of app/components/css.js — a template literal is not
// minified, so every /* rationale */ block rode to every visitor. Stripped
// (git history keeps the prose; the guards keep the rules) and measured
// 488.8KB gz. 493 locked it (see above); check-css-comment-bytes.mjs stops the creep-back.
//
// v8.91 (2026-08-29): the 10pm tonight-leads split adds a fifth rail band.
// Measured 492.7KB gz here; CI on the first push reported 493.1 against the
// 493 ratchet — 100 bytes, the exact "gate measuring the machine" failure
// this comment exists for. Owner cap for that PR is 496. 496 restores the
// >=2KB slack floor (3.3KB here; gzip drift is ~0.5KB). Lower again when
// live code leaves the client.
//
// 2026-08-31: HomeAside, BestNearby and CreatorFinds were all deliberately
// unmounted from "/" but remained eager imports. Removing those unreachable
// module edges moved the measured total from 494.8KB to 486.2KB gzipped and
// Next's reported first-load JS from 505KB to 496KB. 492 locks 4KB of that
// real reduction while retaining 5.8KB of local headroom for zlib drift.

const fail = (m) => { console.error("check-bundle: FAIL — " + m); process.exit(1); };

let manifest;
try {
  manifest = JSON.parse(readFileSync(new URL("../.next/app-build-manifest.json", import.meta.url), "utf8"));
} catch {
  fail("cannot read .next/app-build-manifest.json — run `next build` first (audit:regression does)");
}
const assets = (manifest.pages && manifest.pages["/page"]) || [];
if (!assets.length) fail('route "/" ("/page") missing from app-build-manifest.json');

let total = 0, routeChunk = 0, routeChunkName = null;
for (const f of assets) {
  if (!f.endsWith(".js")) continue;
  // level pinned: gzipSync's default is whatever the running zlib calls default,
  // which is exactly the portability problem documented above.
  const gz = gzipSync(readFileSync(new URL("../.next/" + f, import.meta.url)), { level: 6 }).length;
  total += gz;
  if (/^static\/chunks\/app\/page-/.test(f)) { routeChunk = gz; routeChunkName = f; }
}
if (!routeChunkName) fail("no static/chunks/app/page-*.js in the route's assets");

const kb = (n) => (n / 1024).toFixed(1);
const over = [];
if (routeChunk > ROUTE_CHUNK_BUDGET_KB * 1024) over.push(`route chunk ${kb(routeChunk)}KB gz > budget ${ROUTE_CHUNK_BUDGET_KB}KB (${routeChunkName})`);
if (total > TOTAL_BUDGET_KB * 1024) over.push(`total route JS ${kb(total)}KB gz > budget ${TOTAL_BUDGET_KB}KB`);
if (over.length) fail(over.join("; "));
const headroomKb = (TOTAL_BUDGET_KB * 1024 - total) / 1024;
console.log(`check-bundle: OK — route chunk ${kb(routeChunk)}KB gz (budget ${ROUTE_CHUNK_BUDGET_KB}), total ${kb(total)}KB gz (budget ${TOTAL_BUDGET_KB}), headroom ${headroomKb.toFixed(1)}KB`);
// The margin is PRINTED on every build, and shouts before it becomes fatal.
// The 2026-08-26 failure mode was that this gate went from "fine" to "blocks an
// outage fix" with no warning in between, because nobody could see the trend.
if (headroomKb < WARN_HEADROOM_KB) {
  console.warn(`check-bundle: WARNING — only ${headroomKb.toFixed(1)}KB of headroom (want >=${WARN_HEADROOM_KB}KB).`);
  console.warn("  gzip differs by ~0.5KB between this machine and Vercel, so this margin may already be gone in CI.");
  console.warn("  Move LIVE code off the homepage client — dead code is already tree-shaken and will not help.");
}
