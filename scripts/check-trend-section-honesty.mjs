#!/usr/bin/env node
/**
 * check-trend-section-honesty — the Exploding Trends section may not
 * ship its own error message as a headline.
 *
 * WHAT SHIPPED (removed 2026-08-16, owner: "FIX IT OR REMOVE IT"): the
 * homepage's FIRST section, opened BY DEFAULT, read
 *
 *     🔥 Exploding Trends Near You
 *     Everyone's searching these. Wayfind found where to try them near you.
 *     Trend recommendations are temporarily unavailable.  [Try again]
 *
 * for every visitor in every metro. Measured that day:
 *   EXPLODING_TOPICS_IMPORT_CADENCE  set in NO environment (local/preview/prod)
 *   wf_trend_snapshots / wf_trend_topics / wf_trend_place_matches   0 rows each
 * so /api/trends/nearby answered 503 trend_configuration_error every time.
 *
 * v8.12 remounted the module inside the trending drop (DaypartRail) over the
 * owner-licensed EXPLODING_NEARBY_UNIVERSE. The snapshot flag is no longer
 * the mount gate — the owner list is the floor. What this guard now forbids
 * is the sentence coming back as the 502/503 happy path while that list
 * exists. The executable law lives in check-exploding-nearby-floor.mjs;
 * this file pins the mount sites and the snapshot declaration so a future
 * restore of the SNAPSHOT basis still has a human-flipped flag.
 */
import { readFileSync } from "node:fs";
import { EXPLODING_NEARBY_UNIVERSE } from "../lib/trendTaxonomy.js";
import { explodingUiStatus, UNAVAILABLE_COPY } from "../lib/explodingNearbyServe.js";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
const read = (p) => readFileSync(p, "utf8");

const BEST = "app/components/BestNearby.js";
const DPR = "app/components/DaypartRail.js";
const best = strip(read(BEST));
const dpr = strip(read(DPR));
const mountedBest = /<ExplodingNearby[\s/>]/.test(best);
const mountedDrop = /<ExplodingNearby[\s/>]/.test(dpr);

const rights = strip(read("lib/trendRights.js"));
const m = rights.match(/export const TREND_SNAPSHOT_IMPORTED\s*=\s*(true|false)\s*;/);
if (!m) {
  console.error("check-trend-section-honesty: FAILED");
  console.error("  \u2717 lib/trendRights.js no longer declares TREND_SNAPSHOT_IMPORTED as a literal true/false.");
  process.exit(1);
}
const snapshotImported = m[1] === "true";

if (mountedBest && !snapshotImported) {
  console.error("check-trend-section-honesty: FAILED");
  console.error(`  \u2717 ${BEST} remounts the default-open accordion <ExplodingNearby> while TREND_SNAPSHOT_IMPORTED is false.`);
  console.error("    That slot is the 2026-08-16 outage. The trending DROP (DaypartRail) is the lawful mount.");
  process.exit(1);
}

if (mountedDrop && !EXPLODING_NEARBY_UNIVERSE.length) {
  console.error("check-trend-section-honesty: FAILED");
  console.error(`  \u2717 ${DPR} mounts <ExplodingNearby>, but EXPLODING_NEARBY_UNIVERSE is empty.`);
  console.error("    The drop would have nothing to fail-soft to, so it can only paint");
  console.error(`    \"${UNAVAILABLE_COPY}\".`);
  process.exit(1);
}

if (mountedDrop) {
  const painted = explodingUiStatus({
    status: "trend_data_error",
    error: UNAVAILABLE_COPY,
    trends: [],
  });
  if (painted.status !== "no_verified_inventory" || painted.error) {
    console.error("check-trend-section-honesty: FAILED");
    console.error("  \u2717 explodingUiStatus still lets the unavailable sentence through while the owner list exists.");
    process.exit(1);
  }
}

const def = (best.match(/export const DEFAULT_SECTION = ([^;]+);/) || [])[1];
if (!def) {
  console.error("check-trend-section-honesty: FAILED\n  ✗ DEFAULT_SECTION is gone from " + BEST);
  process.exit(1);
}
if (/["']exploding["']/.test(def) && !mountedBest) {
  console.error("check-trend-section-honesty: FAILED");
  console.error('  ✗ DEFAULT_SECTION points at "exploding", which is not mounted — the panel opens onto nothing.');
  process.exit(1);
}

console.log(
  mountedDrop
    ? `check-trend-section-honesty: OK — DaypartRail mounts <ExplodingNearby> over the owner-list floor (${EXPLODING_NEARBY_UNIVERSE.length} topics); BestNearby accordion ${mountedBest ? "is mounted (snapshot flag " + snapshotImported + ")" : "stays unmounted"}; DEFAULT_SECTION = ${def.trim()}`
    : `check-trend-section-honesty: OK — <ExplodingNearby> is not mounted in the trending drop, and DEFAULT_SECTION = ${def.trim()} points at a section that renders`
);
