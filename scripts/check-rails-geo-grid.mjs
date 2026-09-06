#!/usr/bin/env node
/**
 * check-rails-geo-grid — PINS THE GRID LAW, AND WHY IT DID NOT WIDEN.
 *
 * MEASURED 2026-09-06, cold-rail-cache investigation. The working hypothesis
 * was that /api/rails' client-side coordinate snap (0.01°, ~0.7mi —
 * lib/railFastCache.js geoCell() and DaypartRail.js snapPre()) is far finer
 * than the answer varies, so widening it (0.05° was proposed) would cut CDN
 * key cardinality with no visible cost. Measured against real production
 * /api/rails responses (exact coordinate vs. the same point snapped, &city=
 * pinned so the comparison isolates re-ranking from a city change), 12 sample
 * points each across Sarasota, Parrish, Tampa, Orlando, Venice and Bradenton:
 *
 *     grid    rails touched      card-slot diffs     order diffs
 *     0.01°   0 / 180 (0%)       0 / 3,586 (0%)       0     <- today
 *     0.02°   51 / 180 (28%)     175 / 3,596 (4.9%)   228
 *     0.05°   101 / 180 (56%)    452 / 3,608 (12.5%)  484
 *
 * Today's grid is the largest one that measured as invisible. Anything wider
 * changes what a reader sees — lib/railSelect.js's pickNearThenWiden() is an
 * all-or-nothing cliff (enough candidates within `nearMi` and the widened set
 * never runs), and lib/wayfindScore.js's FAR_MILES=17 term is a second one; a
 * snapped origin moving by a mile or two can flip either and swap a rail's
 * whole membership. So THIS GUARD PINS THE GRID AT ITS CURRENT VALUE rather
 * than asserting some coarser one "should" be safe.
 *
 * A separate, worse defect surfaced in the same measurement: nearestCity()
 * (app/api/rails/route.js) picks a LANDING_CITIES slug by raw distance, and
 * several towns sit closer together than the product's own distance gates —
 * Palmetto and Bradenton are 1.56 miles apart (computed below from the live
 * table, not hardcoded, so this stays true if the table changes). ANY snap
 * grid can push a reader in one of those towns across the boundary into the
 * OTHER town's entire answer: different curated board, different label, not
 * a re-ranked card. Measured directly: a realistic point near Sarasota
 * snapped straight into Siesta Key's payload at a 0.05° grid.
 *
 * THE FIX: DaypartRail.js resolves the city slug from the reader's EXACT,
 * unsnapped point (resolveCitySlug — the identical nearestCoveredCity() call
 * route.js makes server-side) and sends it as an explicit &city=, which the
 * route already prefers over its own nearestCity(lat,lng). City selection is
 * now immune to the snap grid's width, permanently, independent of whatever
 * this file pins that grid to be.
 *
 * THIS GUARD PINS BOTH HALVES:
 *   1. the numeric grid has not silently widened back toward the unsafe value
 *      the measurement above rejected;
 *   2. every /api/rails request the client makes carries an exact &city=,
 *      resolved from the point BEFORE it is snapped — with a reproduced,
 *      EXECUTED negative control proving the defect this closes is real (a
 *      snapped coordinate really does relabel a real reader's town), not
 *      merely plausible.
 */
import { readFileSync } from "node:fs";
import { LANDING_CITIES } from "../lib/landingCities.js";
import { nearestCoveredCity, railDistanceMi, COVERAGE_MI } from "../lib/railCoverage.js";

let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (src) => src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const dayRail = strip(read("../app/components/DaypartRail.js"));
const routeSrc = strip(read("../app/api/rails/route.js"));
const landingSrc = strip(read("../lib/landing.js"));
const coverageSrc = strip(read("../lib/railCoverage.js"));

// ── 1. THE GRID LAW — pinned at its measured-safe value ─────────────────────
ok(/const snapPre = \(v\) => Math\.round\(v \* 100\) \/ 100;/.test(dayRail),
  "DaypartRail's client snap must stay 0.01° (Math.round(v*100)/100) — measured above as the largest grid that changed nothing; a wider literal here means someone re-attempted the rejected fix without re-measuring it");
ok(/export const geoCell = \(value, digits = 2\) => Number\(value\)\.toFixed\(digits\);/.test(strip(read("../lib/railFastCache.js"))),
  "the server-side accelerator's geoCell() must stay 2 decimal digits — it is fed the client's already-snapped value, so widening its own default would silently double-widen the effective grid the measurement above was run against");

// ── 2. EVERY /api/rails REQUEST CARRIES AN EXACT &city= ─────────────────────
// Two call sites: the main load effect, and loadSelectedRailPage's pagination
// fetch. Both must resolve the slug from center.lat/center.lng DIRECTLY — not
// from snap(center.lat) — or the whole point of resolving it first is moot.
const cityCalls = [...dayRail.matchAll(/resolveCitySlug\(([^)]*)\)/g)].map((m) => m[1].trim());
ok(cityCalls.length >= 2, `resolveCitySlug must be called at both /api/rails request sites (found ${cityCalls.length} call(s))`);
for (const args of cityCalls) {
  ok(args === "center.lat, center.lng", `resolveCitySlug must be called with the UNSNAPPED center.lat, center.lng — found "resolveCitySlug(${args})", which is exactly the mistake this guard exists to catch if it ever reads "snap(center.lat), snap(center.lng)" instead`);
}
ok(/const resolveCitySlug = useCallback\(\(la, ln\) => nearestCoveredCity\(LANDING_CITIES, la, ln, COVERAGE_MI\), \[\]\);/.test(dayRail),
  "resolveCitySlug must be the SAME call route.js's own nearestCity() makes (nearestCoveredCity(LANDING_CITIES, la, ln, COVERAGE_MI)) — a hand-rolled equivalent could silently drift from the server's own answer");
ok(/citySlug \? `&city=\$\{encodeURIComponent\(citySlug\)\}` : ""/.test(dayRail),
  "the main /api/rails fetch must append &city=<slug> when one resolves, and nothing when it does not (out-of-coverage stays out-of-coverage)");
ok(/\.\.\.\(citySlug \? \{ city: citySlug \} : \{\}\)/.test(dayRail),
  "the rail-page fetch (loadSelectedRailPage) must append the same &city= override, or a paged rail can land on a different city than its first page did");
ok(/import \{ LANDING_CITIES \} from "\.\.\/\.\.\/lib\/landingCities\.js";/.test(dayRail)
  && /import \{ nearestCoveredCity, COVERAGE_MI \} from "\.\.\/\.\.\/lib\/railCoverage\.js";/.test(dayRail),
  "DaypartRail must import the city table and coverage law from the shared, side-effect-free modules — never a hand-copied literal that could drift from the server's own table");

// ── 3. THE SERVER TRUSTS AN EXPLICIT city= OVER ITS OWN nearestCity() ───────
// If this ever stopped being true, sending &city= from the client would do
// nothing and the whole fix would be a no-op that still passes assertion #2.
ok(/const asked = String\(sp\.get\("city"\) \|\| ""\);/.test(routeSrc) && /const slug = LANDING_CITIES\[asked\] \? asked : nearestCity\(la, ln\);/.test(routeSrc),
  "app/api/rails/route.js must still prefer an explicit &city= over its own nearestCity(la, ln) — the client-side fix is inert without this");

// ── 4. ONE CITY TABLE, NOT TWO ──────────────────────────────────────────────
// Must be a real IMPORT (a local binding), not `export { LANDING_CITIES }
// from "./landingCities.js"` — that syntax forwards the name to CONSUMERS of
// landing.js without binding it locally, and landing.js's own code (rankedFor)
// reads the bare identifier. Shipping the pure re-export threw "ReferenceError:
// LANDING_CITIES is not defined" from inside rankedFor() at runtime — silently
// swallowed by railsData.js's buildDrivePool().catch(() => []), which emptied
// the "drive" rail with no visible error. Caught by
// scripts/check-rail-compute-budget.mjs (EQUIVALENCE FAILED: drive) during
// this same investigation (2026-09-06) — see lib/landing.js's own comment.
ok(/import \{ LANDING_CITIES \} from "\.\/landingCities\.js";/.test(landingSrc),
  "lib/landing.js must IMPORT LANDING_CITIES from lib/landingCities.js as a real local binding (not a bare `export ... from` re-export) — its own code (rankedFor) reads the bare identifier, and `export {X} from spec` does not bind X locally.");
ok(/export \{ LANDING_CITIES \};/.test(landingSrc),
  "lib/landing.js must re-export the imported LANDING_CITIES binding, so every existing `import { LANDING_CITIES } from \"./landing.js\"` keeps working");
ok(!/"parrish":\s*\{\s*name:\s*"Parrish"/.test(landingSrc),
  "lib/landing.js must not carry a second, duplicate LANDING_CITIES literal alongside the re-export");
ok(/export const COVERAGE_MI = 90;/.test(coverageSrc),
  "lib/railCoverage.js must export COVERAGE_MI — the one value both route.js and DaypartRail.js's client-side resolver read");
ok(!/const COVERAGE_MI = 90;/.test(routeSrc),
  "app/api/rails/route.js must import COVERAGE_MI rather than re-declare its own literal 90 — a second copy is exactly the kind of drift this table split exists to prevent");

// ── 5. THE DEFECT IS REAL — executed against the LIVE table, not asserted in
// prose. Find the two closest LANDING_CITIES entries (whichever they are
// today) and prove a point near their boundary really does flip slugs when
// resolved from a snapped coordinate, and does NOT flip when resolved from
// the exact one — which is the entire justification for resolveCitySlug.
function closestPair(cities) {
  const entries = Object.entries(cities);
  let best = null, bestMi = Infinity;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [aSlug, a] = entries[i], [bSlug, b] = entries[j];
      const mi = railDistanceMi(a.lat, a.lng, b.lat, b.lng);
      if (mi < bestMi) { bestMi = mi; best = [aSlug, bSlug]; }
    }
  }
  return { pair: best, mi: bestMi };
}

// Self-test the finder on a synthetic table before trusting it on the real
// one — same discipline as check-guard-hermeticity's own self-test.
{
  const synthetic = {
    near1: { name: "Near1", lat: 30.0, lng: -80.0 },
    near2: { name: "Near2", lat: 30.01, lng: -80.0 }, // ~0.69mi apart
    far: { name: "Far", lat: 32.0, lng: -85.0 },
  };
  const found = closestPair(synthetic);
  ok(JSON.stringify(found.pair.slice().sort()) === JSON.stringify(["near1", "near2"].sort()),
    "self-test: closestPair must find the genuinely nearest pair, not an arbitrary one");
  ok(found.mi > 0.6 && found.mi < 0.8, `self-test: closestPair's own distance math must be right (~0.69mi expected, got ${found.mi.toFixed(2)}mi)`);
}

const { pair, mi } = closestPair(LANDING_CITIES);
ok(mi < 8, `THE TEETH: at least one LANDING_CITIES pair (${pair.join(" / ")}, ${mi.toFixed(2)}mi apart) must sit well inside the product's tightest reader-origin distance gate (break, 8mi) — this is what makes coordinate-based city selection unsafe to snap at all, at any width, and why resolveCitySlug exists instead of a coarser but still-approximate grid`);

const [aSlug, bSlug] = pair;
const a = LANDING_CITIES[aSlug], b = LANDING_CITIES[bSlug];
const GRID = 0.05; // the grid this measurement rejected — used here only to
// reproduce the defect it caused, not as a value this repo ships.
const snap = (v) => Math.round(v / GRID) * GRID;

// Walk the corridor BETWEEN the two closest towns, past both ends, and take
// the FIRST point whose exact and 0.05°-snapped answers disagree. Any single
// fixed fraction can happen to land on a spot the snap does not disturb (the
// grid is a step function, not a smooth one) — a fixed t=0.6 genuinely failed
// to reproduce the flip for the live table's own closest pair on this exact
// run, which is why this searches rather than assumes one offset works.
let flip = null;
for (let steps = -20; steps <= 120 && !flip; steps++) {
  const t = steps / 100;
  const p = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
  const exactSlug = nearestCoveredCity(LANDING_CITIES, p.lat, p.lng, COVERAGE_MI);
  const snappedSlug = nearestCoveredCity(LANDING_CITIES, snap(p.lat), snap(p.lng), COVERAGE_MI);
  if (exactSlug !== snappedSlug) flip = { t, exactSlug, snappedSlug };
}
// THE NEGATIVE CONTROL: prove the failure mode is real, on the live table, by
// actually finding it — not by asserting one hand-picked point must show it.
// If this ever fails because the two closest towns moved further apart than
// a 161-point sweep of a 0.05° grid can reach, that is good news for the
// product — widen the sweep or raise GRID, do not delete the assertion.
ok(flip !== null,
  `NEGATIVE CONTROL: no point along the ${aSlug}/${bSlug} corridor (141 samples, -0.2 to 1.2) relabels a reader when resolved from a ${GRID}° snap instead of the exact point — either these two towns are no longer close enough to reproduce the defect (re-derive the pair/grid), or nearestCoveredCity stopped being distance-sensitive`);
if (flip) {
  ok(flip.exactSlug === aSlug || flip.exactSlug === bSlug,
    `sanity: the exact (correct) answer at the found flip point must be one of the two closest towns (got ${flip.exactSlug}) — it is what resolveCitySlug would send as &city=`);
  ok(!!flip.snappedSlug && flip.snappedSlug !== flip.exactSlug,
    `sanity: the snapped answer must be a real, different slug from the exact one — this is the relabeling a reader would see WITHOUT the &city= fix (exact -> ${flip.exactSlug}, snapped -> ${flip.snappedSlug})`);
}
// THE FIX, PROVEN: resolving from the EXACT point (what resolveCitySlug does)
// is precisely the computation that gave the correct answer above, and the
// server now trusts the explicit &city= it carries over its own
// nearestCity(la, ln) on the (still-snapped) query params (assertion #3) — so
// the flip found above cannot reach a real reader once &city= is sent.

if (failures) {
  console.error(`\ncheck-rails-geo-grid: ${failures} FAILED of ${asserts} assertions`);
  process.exit(1);
}
console.log(`check-rails-geo-grid: ${asserts} assertions OK — grid pinned at 0.01°, city selection proven exact via &city= (closest live pair: ${aSlug}/${bSlug}, ${mi.toFixed(2)}mi)`);
