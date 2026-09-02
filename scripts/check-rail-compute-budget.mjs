#!/usr/bin/env node
/**
 * scripts/check-rail-compute-budget.mjs — WO8 (2026-09-02), PRODUCTION PERF
 * REGRESSION. Asserts the numbers scripts/test-rail-compute-budget.mjs
 * measures for loadRailPlaces("bradenton", {origin: Lakewood Ranch}) against
 * a mocked fetch — a dense Florida cell, the worst case.
 *
 * MEASURED AFTER-STATE (2026-09-02, this PR): 54 wf_inventory/
 * wf_beach_water_geo reads, ~17.13MB. Thresholds below are that measurement
 * plus ~20% headroom, per the work order — this is a REGRESSION LOCK, not a
 * target: it catches a future change that quietly reintroduces the N+1 shape
 * (a new pool builder added as its own un-memoized read, or a bulk select
 * that puts `editorial` back), not a promise that these exact numbers are
 * optimal. See lib/railsData.js's own WO8 comments for what was changed:
 * lib/inventoryReadCache.js (per-compute memoization), skipEditorial on the
 * three bulk read sites (lib/inventoryServe.js, lib/nearbyPool.js,
 * lib/railsData.js's buildIdentityPool) plus ONE post-fillRails
 * hydrateEditorialFor read for the shipped set.
 */
import { runComputeHarness, FIXTURE_EDITORIAL_BYTES } from "./test-rail-compute-budget.mjs";

const MAX_CALLS = 65;   // 54 measured x 1.2 headroom
const MAX_BYTES = 20_600_000; // ~17.13MB measured x 1.2 headroom

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

const r = await runComputeHarness();
ok(r.ok, "the harness completed (loadRailPlaces did not throw)");
ok(r.restCallCount > 0, "CONTROL: the run actually made wf_inventory/wf_beach_water_geo calls — a 0 here would make every assertion below vacuous");

ok(r.restCallCount <= MAX_CALLS,
  `${r.restCallCount} wf_inventory/wf_beach_water_geo calls for one cold compute, budget is ${MAX_CALLS} (measured-after-state x 1.2 headroom). A rise here means a pool builder started re-reading a box it (or another builder) already read this compute — see lib/inventoryReadCache.js.`);
ok(r.restBytes <= MAX_BYTES,
  `${r.restBytes} bytes (${(r.restBytes / 1024 / 1024).toFixed(2)}MB) for one cold compute, budget is ${MAX_BYTES} (measured-after-state x 1.2 headroom). A rise here most likely means a bulk pool read started selecting \`editorial\` again — that is the single largest per-row field this pipeline reads.`);

// ── RED-PROVE: the bytes budget is not accidentally passing regardless of
// editorial. Compute the COUNTEREFFECTUAL — what restBytes would have been
// had every wf_inventory bulk-pool call (the ones that today pass
// skipEditorial, i.e. everything except the hydration reads, which
// legitimately select only place_id+editorial) still carried the FULL
// editorial column — using the exact fixture editorial string length, on the
// exact row counts this same run actually returned. If that counterfactual
// does NOT exceed the budget, this guard could not have caught the
// regression it exists for, and the byte assertion above is decoration. ─────
{
  const bulkCalls = r.restCalls.filter((c) => !/place_id=in\.\(/.test(c.url)); // exclude the hydration reads themselves
  const rowsThatWouldGainEditorial = bulkCalls.filter((c) => !c.editorial).reduce((s, c) => s + c.rows, 0);
  const counterfactualBytes = r.restBytes + rowsThatWouldGainEditorial * FIXTURE_EDITORIAL_BYTES;
  ok(rowsThatWouldGainEditorial > 0,
    "CONTROL: at least one bulk read in this run returned rows with editorial stripped — otherwise there is nothing for the counterfactual to add back");
  ok(counterfactualBytes > MAX_BYTES,
    `RED-PROVE FAILED: even with editorial added back onto every bulk pool row that lacks it (${rowsThatWouldGainEditorial} rows, +${(rowsThatWouldGainEditorial * FIXTURE_EDITORIAL_BYTES / 1024 / 1024).toFixed(2)}MB), the total (${(counterfactualBytes / 1024 / 1024).toFixed(2)}MB) would still fit the ${(MAX_BYTES / 1024 / 1024).toFixed(2)}MB budget — meaning the byte assertion above is not actually load-bearing on editorial being stripped, and this guard could not catch that regression. Tighten MAX_BYTES or widen the counterfactual.`);
}

if (fails) {
  console.error(`check-rail-compute-budget: ${fails} failure(s)`);
  process.exit(1);
}
console.log(`check-rail-compute-budget: OK — ${r.restCallCount} calls (budget ${MAX_CALLS}), ${(r.restBytes / 1024 / 1024).toFixed(2)}MB (budget ${(MAX_BYTES / 1024 / 1024).toFixed(2)}MB), red-prove confirms the bytes budget is load-bearing on editorial staying out of bulk reads`);
