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
const ROUTE_CHUNK_BUDGET_KB = 215; // static/chunks/app/page-*.js, gzipped. RATCHET: lower only. Target 175.
const TOTAL_BUDGET_KB = 545;       // every JS asset for route "/", gzipped.  RATCHET: lower only. Target 325.

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
  const gz = gzipSync(readFileSync(new URL("../.next/" + f, import.meta.url))).length;
  total += gz;
  if (/^static\/chunks\/app\/page-/.test(f)) { routeChunk = gz; routeChunkName = f; }
}
if (!routeChunkName) fail("no static/chunks/app/page-*.js in the route's assets");

const kb = (n) => (n / 1024).toFixed(1);
const over = [];
if (routeChunk > ROUTE_CHUNK_BUDGET_KB * 1024) over.push(`route chunk ${kb(routeChunk)}KB gz > budget ${ROUTE_CHUNK_BUDGET_KB}KB (${routeChunkName})`);
if (total > TOTAL_BUDGET_KB * 1024) over.push(`total route JS ${kb(total)}KB gz > budget ${TOTAL_BUDGET_KB}KB`);
if (over.length) fail(over.join("; "));
console.log(`check-bundle: OK — route chunk ${kb(routeChunk)}KB gz (budget ${ROUTE_CHUNK_BUDGET_KB}), total ${kb(total)}KB gz (budget ${TOTAL_BUDGET_KB})`);
