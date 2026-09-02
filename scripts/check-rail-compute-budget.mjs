#!/usr/bin/env node
/**
 * scripts/check-rail-compute-budget.mjs — WO8 + WO8b (2026-09-02), PRODUCTION
 * PERF REGRESSION. Asserts the numbers scripts/test-rail-compute-budget.mjs
 * measures for loadRailPlaces("bradenton", {origin: Lakewood Ranch}) against
 * a mocked fetch — a dense Florida cell, the worst case.
 *
 * WO8 cut BYTES (editorial off the bulk pool reads). WO8b's own parent
 * re-measured WO8's result in production against a TRUE offline baseline
 * (this harness, run on WO8's own committed code, before any of WO8b's
 * changes): 50 calls / 24.9MB -> 54 calls / 16.7MB. Bytes improved ~33%;
 * ROUND TRIPS did not, because WO8's memo cache only collapses an EXACT
 * repeated box, and loadPools' cats x cities loop and buildDrivePool's
 * neighbour-city fan-out almost never repeat one — they ask for many
 * different, often-overlapping ones. Round trips are the clock (~200-500ms
 * each in production), so WO8b added lib/inventoryBoxBatch.js: it groups
 * overlapping-box jobs into one consolidated read and reproduces each city's
 * own result from it, unchanged, via a cache-priming trick that never touches
 * rankedFor/rankLandingPool's own ranking logic.
 *
 * MEASURED AFTER-STATE (2026-09-02, this PR, WO8b's own fixture — see that
 * file's header for why the world had to become deterministic and
 * position-addressable rather than a per-call random scatter): 19
 * wf_inventory/wf_beach_water_geo reads, ~4.22MB. Thresholds below are that
 * measurement plus ~20% headroom — this is a REGRESSION LOCK, not a target:
 * it catches a future change that quietly reintroduces the N+1 shape (a new
 * pool builder added as its own un-batched read, or a bulk select that puts
 * `editorial` back), not a promise that these exact numbers are optimal.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { runComputeHarness, FIXTURE_EDITORIAL_BYTES, EQUIVALENCE_SCENARIOS, EQUIVALENCE_SNAPSHOT_PATH, snapshotRails } from "./test-rail-compute-budget.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAILS_DATA_PATH = join(ROOT, "lib/railsData.js");

const MAX_CALLS = 23;          // 19 measured x 1.2 headroom (rounded up)
const MAX_BYTES = 5_100_000;   // ~4.22MB measured x 1.2 headroom

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

const r = await runComputeHarness();
ok(r.ok, "the harness completed (loadRailPlaces did not throw)");
ok(r.restCallCount > 0, "CONTROL: the run actually made wf_inventory/wf_beach_water_geo calls — a 0 here would make every assertion below vacuous");

ok(r.restCallCount <= MAX_CALLS,
  `${r.restCallCount} wf_inventory/wf_beach_water_geo calls for one cold compute, budget is ${MAX_CALLS} (measured-after-state x 1.2 headroom). A rise here means a pool builder started re-reading a box it (or another builder) already read this compute, or a new un-batched fan-out was added — see lib/inventoryReadCache.js and lib/inventoryBoxBatch.js.`);
ok(r.restBytes <= MAX_BYTES,
  `${r.restBytes} bytes (${(r.restBytes / 1024 / 1024).toFixed(2)}MB) for one cold compute, budget is ${MAX_BYTES} (measured-after-state x 1.2 headroom). A rise here most likely means a bulk pool read started selecting \`editorial\` again — that is the single largest per-row field this pipeline reads.`);

// ── RED-PROVE #1: the bytes budget is not accidentally passing regardless of
// editorial. Compute the COUNTERFACTUAL — what restBytes would have been had
// every wf_inventory bulk-pool call (the ones that today pass skipEditorial,
// i.e. everything except the hydration reads, which legitimately select only
// place_id+editorial) still carried the FULL editorial column — using the
// exact fixture editorial string length, on the exact row counts this same
// run actually returned. If that counterfactual does NOT exceed the budget,
// this guard could not have caught the regression it exists for. ───────────
{
  const bulkCalls = r.restCalls.filter((c) => !/place_id=in\.\(/.test(c.url)); // exclude the hydration reads themselves
  const rowsThatWouldGainEditorial = bulkCalls.filter((c) => !c.editorial).reduce((s, c) => s + c.rows, 0);
  const counterfactualBytes = r.restBytes + rowsThatWouldGainEditorial * FIXTURE_EDITORIAL_BYTES;
  ok(rowsThatWouldGainEditorial > 0,
    "CONTROL: at least one bulk read in this run returned rows with editorial stripped — otherwise there is nothing for the counterfactual to add back");
  ok(counterfactualBytes > MAX_BYTES,
    `RED-PROVE FAILED (editorial): even with editorial added back onto every bulk pool row that lacks it (${rowsThatWouldGainEditorial} rows, +${(rowsThatWouldGainEditorial * FIXTURE_EDITORIAL_BYTES / 1024 / 1024).toFixed(2)}MB), the total (${(counterfactualBytes / 1024 / 1024).toFixed(2)}MB) would still fit the ${(MAX_BYTES / 1024 / 1024).toFixed(2)}MB budget — meaning the byte assertion above is not load-bearing on editorial being stripped.`);
}

// ── RED-PROVE #2 (WO8b): the calls budget is not accidentally passing
// regardless of buildDrivePool's box consolidation. Per the work order: prove
// it by REVERTING the consolidation, not by reasoning about it — a real
// mutation, not a guess about what it would do. This writes a scratch copy of
// lib/railsData.js with ONLY the drive-pool's priming call deleted (the exact
// block is asserted to exist, verbatim, exactly once first — a sed/replace
// that silently matches nothing is indistinguishable from a passing guard),
// runs the SAME harness against that scratch entry file, and asserts the
// resulting call count exceeds the budget. The file is real, on disk, for the
// duration of one loadComponent() call, and removed in a finally either way —
// lib/railsData.js itself is never touched. ─────────────────────────────────
{
  const original = readFileSync(RAILS_DATA_PATH, "utf8");
  const DRIVE_POOL_PRIME_BLOCK = `  // WO8b (2026-09-02) — THIS is the fan-out WO8's own follow-up flagged as
  // the largest remaining round-trip cost: every OTHER landing city within
  // DRIVE_REACH_MI, x2 categories, each its own read. Prime overlapping
  // clusters into ONE read the same way loadPools does; extra's cities are
  // usually close enough together (that is why they are all inside one
  // reader's 27mi reach) to cluster into a small number of consolidated
  // reads rather than one per city.
  if (readCache) {
    await primeConsolidatedInventoryReads(
      jobs.map(({ cat, city }) => ({ catSlug: cat, city: LANDING_CITIES[city] })),
      readCache
    ).catch(() => {});
  }
`;
  const occurrences = original.split(DRIVE_POOL_PRIME_BLOCK).length - 1;
  ok(occurrences === 1,
    `CONTROL: expected the drive-pool priming block to appear exactly once in lib/railsData.js for the red-prove to target unambiguously; found ${occurrences}. The block's text drifted from this guard — update either the source comment or this literal to match.`);
  if (occurrences === 1) {
    const mutated = original.replace(DRIVE_POOL_PRIME_BLOCK, "");
    ok(mutated.length === original.length - DRIVE_POOL_PRIME_BLOCK.length,
      "CONTROL: the mutation removed exactly the target block's length — a partial match would silently prove nothing");
    const scratchPath = join(ROOT, "lib/.redprove-drivepool-reverted.js");
    writeFileSync(scratchPath, mutated);
    try {
      const reverted = await runComputeHarness({ entryPath: scratchPath });
      ok(reverted.ok, "the reverted (drive-pool-unconsolidated) scratch copy ran without throwing");
      ok(reverted.restCallCount > MAX_CALLS,
        `RED-PROVE FAILED (drive-pool consolidation): with buildDrivePool's priming call removed, the run still made only ${reverted.restCallCount} calls (budget ${MAX_CALLS}) — meaning the calls assertion above is not load-bearing on that consolidation existing.`);
      ok(reverted.restCallCount > r.restCallCount,
        `CONTROL: the reverted run (${reverted.restCallCount} calls) should make strictly MORE calls than the consolidated one (${r.restCallCount}) — if not, the mutation did not change the code path this guard thinks it changed.`);
    } finally {
      if (existsSync(scratchPath)) unlinkSync(scratchPath);
    }
  }
}

// ── EQUIVALENCE (WO8b): pool semantics, radii, predicates and ranking must
// be BYTE-IDENTICAL to the snapshot the pre-consolidation code produced —
// scripts/fixtures/rail-compute-equivalence-snapshot.json, committed from a
// run of this same harness before lib/inventoryBoxBatch.js existed. Two
// scenarios (Lakewood Ranch's own metro and Parrish's, a different pool) so
// this is not proven on only the production regression's own reader. ───────
{
  ok(existsSync(EQUIVALENCE_SNAPSHOT_PATH), `CONTROL: ${EQUIVALENCE_SNAPSHOT_PATH} must exist — it is the committed proof, not something this guard can regenerate for itself`);
  if (existsSync(EQUIVALENCE_SNAPSHOT_PATH)) {
    const expected = JSON.parse(readFileSync(EQUIVALENCE_SNAPSHOT_PATH, "utf8"));
    for (const [key, scenario] of Object.entries(EQUIVALENCE_SCENARIOS)) {
      const live = await runComputeHarness(scenario);
      ok(live.ok, `equivalence scenario "${key}" ran without throwing`);
      const liveSnap = live.snapshot || snapshotRails(live);
      const expectedRails = Object.keys(expected[key] || {});
      const liveRails = Object.keys(liveSnap);
      ok(expectedRails.length > 0, `CONTROL: the committed snapshot for "${key}" has at least one rail key`);
      ok(JSON.stringify(liveRails.sort()) === JSON.stringify(expectedRails.sort()),
        `EQUIVALENCE FAILED (${key}): rail keys differ from the committed snapshot — expected [${expectedRails.sort().join(",")}], got [${liveRails.sort().join(",")}]`);
      for (const railId of expectedRails) {
        const exp = JSON.stringify((expected[key] || {})[railId] || []);
        const got = JSON.stringify(liveSnap[railId] || []);
        ok(exp === got,
          `EQUIVALENCE FAILED (${key} / ${railId}): the consolidated read path shipped a DIFFERENT set or order of place ids than the pre-consolidation snapshot. expected ${((expected[key] || {})[railId] || []).length} ids, got ${(liveSnap[railId] || []).length}. Run "node scripts/test-rail-compute-budget.mjs --write-snapshot" ONLY after confirming the difference is an intentional, reviewed change — never to silence this failure.`);
      }
    }
  }
}

if (fails) {
  console.error(`check-rail-compute-budget: ${fails} failure(s)`);
  process.exit(1);
}
console.log(`check-rail-compute-budget: OK — ${r.restCallCount} calls (budget ${MAX_CALLS}), ${(r.restBytes / 1024 / 1024).toFixed(2)}MB (budget ${(MAX_BYTES / 1024 / 1024).toFixed(2)}MB); both red-proves confirm the budgets are load-bearing (editorial-stripping, drive-pool consolidation); equivalence snapshot byte-identical across ${Object.keys(EQUIVALENCE_SCENARIOS).length} scenarios`);
