#!/usr/bin/env node
/**
 * check-trend-section-honesty — the Exploding Trends section may not render
 * until a snapshot actually exists.
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
 * The failure was not the error handling — that was correct and honest. The
 * failure was MOUNTING A SURFACE WHOSE DATA SOURCE HAS NEVER BEEN POPULATED,
 * and giving it the most valuable slot on the page. A section that can only
 * ever render its own error state is worse than no section.
 *
 * This does not forbid bringing it back. It forbids bringing it back BLIND:
 * restore the block and this guard tells you to set the cadence variable
 * first, which is the step whose absence is the whole bug.
 */
import { readFileSync } from "node:fs";

const P = "app/components/BestNearby.js";
const raw = readFileSync(P, "utf8");
// Strip comments first — this file's own removal note names the component and
// the headline, and a guard that fires on its rationale is a guard someone
// deletes. (Repo lesson, five occurrences on 2026-07-30.)
const src = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");

const mounted = /<ExplodingNearby[\s/>]/.test(src);

// HERMETIC BY CONSTRUCTION. An earlier draft of this guard read
// process.env.EXPLODING_TOPICS_IMPORT_CADENCE — and check-guard-hermeticity
// rejected it, correctly: a guard whose verdict depends on the shell says OK
// in any terminal that happens to have the var exported, which is precisely
// the false green it exists to prevent. So the gate is a COMMITTED flag a
// human flips in a reviewable diff. See lib/trendRights.js.
const rights = readFileSync("lib/trendRights.js", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
const m = rights.match(/export const TREND_SNAPSHOT_IMPORTED\s*=\s*(true|false)\s*;/);
if (!m) {
  console.error("check-trend-section-honesty: FAILED");
  console.error("  \u2717 lib/trendRights.js no longer declares TREND_SNAPSHOT_IMPORTED as a literal true/false.");
  console.error("    That flag is the only thing standing between this section and shipping its own");
  console.error("    error message as the first headline on the homepage. Restore it.");
  process.exit(1);
}
const snapshotImported = m[1] === "true";

if (mounted && !snapshotImported) {
  console.error("check-trend-section-honesty: FAILED");
  console.error(`  \u2717 ${P} mounts <ExplodingNearby>, but lib/trendRights.js declares TREND_SNAPSHOT_IMPORTED = false.`);
  console.error("    With no snapshot, /api/trends/nearby throws TrendConfigError before it reads");
  console.error("    anything, so the section can ONLY render \"Trend recommendations are temporarily");
  console.error("    unavailable\" \u2014 which is exactly what shipped to every visitor, in the first slot.");
  console.error("    Import a snapshot and set the cadence in all three envs, then flip the flag.");
  process.exit(1);
}

// The removal must also not have left the default-open pointer aimed at a
// section that no longer exists — that would open the panel onto nothing.
const def = (src.match(/export const DEFAULT_SECTION = ([^;]+);/) || [])[1];
if (!def) {
  console.error("check-trend-section-honesty: FAILED\n  ✗ DEFAULT_SECTION is gone from " + P);
  process.exit(1);
}
if (/["']exploding["']/.test(def) && !mounted) {
  console.error("check-trend-section-honesty: FAILED");
  console.error('  ✗ DEFAULT_SECTION points at "exploding", which is not mounted — the panel opens onto nothing.');
  process.exit(1);
}

console.log(
  mounted
    ? `check-trend-section-honesty: OK \u2014 <ExplodingNearby> is mounted and TREND_SNAPSHOT_IMPORTED is declared true, so a snapshot exists for it to select from; DEFAULT_SECTION = ${def.trim()}`
    : `check-trend-section-honesty: OK \u2014 <ExplodingNearby> is not mounted (no snapshot has ever been imported), and DEFAULT_SECTION = ${def.trim()} points at a section that renders`
);
