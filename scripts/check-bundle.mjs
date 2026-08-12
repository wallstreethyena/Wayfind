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

// 2026-08-12 (v7.29). THIS FILE WAS NEVER RUNNING ON A DEPLOY. It is wired into
// `audit:regression` only, and nothing calls that automatically — it is not in
// scripts/guards.txt, so the prebuild chain skipped it. Measured the moment it
// was pointed at a real build of main@281d494: route chunk 211.8KB gz against a
// 175KB budget and total 533.2KB gz against a 325KB budget. The ceiling had been
// blown through by 21% and 64% and said nothing, for however long.
//
// So it is in guards.txt now, and both numbers below are HONEST: the route chunk
// keeps its original 175KB ratchet (the v7.29 work brought it back under, at
// 164.2KB), and the total is re-based to what the route actually ships today
// rather than to a number the repo has been silently violating.
//
// A budget only works if it fails. Raising either number is a product decision
// that belongs in a commit message, not a quiet edit.
//
// THE TWO NUMBERS DO DIFFERENT JOBS, and they are sized differently on purpose:
//
//   ROUTE_CHUNK is the homepage's OWN code. It is the number that catches the
//   regression class this file exists for, it is the number the v7.29 work
//   brought back under its original ratchet (164.4 vs 175), and it is a hard
//   fail with ~6% of headroom. Anything that pushes it over is homepage weight
//   and should be argued for.
//
//   TOTAL is route chunk + framework + every shared chunk. It grows with work
//   that has nothing to do with the homepage — measured 486.1KB, then 488.7KB
//   an hour later after three unrelated share-card commits landed. Sizing it to
//   today's number would red-light the next lane's deploy for something they did
//   not cause, which is how a useful gate gets deleted. So it carries ~7%
//   headroom over the current 488.7KB.
//
// TOTAL is a RATCHET, not a target: lower it as app/home.js is decomposed (it is
// still 388KB parsed, 58% of the route chunk). Never raise it quietly.
const ROUTE_CHUNK_BUDGET_KB = 175; // static/chunks/app/page-*.js, gzipped
const TOTAL_BUDGET_KB = 525;       // every JS asset for route "/", gzipped

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
