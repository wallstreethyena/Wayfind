#!/usr/bin/env node
/**
 * test-photo-repair-deadline — the photo-repair controller, EXECUTED.
 *
 * WHY THIS EXISTS. On 2026-09-10 the 04:20 production run of
 * /api/cron/photo-repair was killed by Vercel at exactly 60s after mutating
 * 109 queue rows and before recordPulse() could file: partial work, no
 * heartbeat. The repair introduced `runRepairWithinBudget`, a batching
 * controller that owns a 225s budget beneath a 300s platform ceiling.
 *
 * scripts/check-cron-honesty.mjs pins that contract STRUCTURALLY — it reads
 * the numbers and the wiring out of the source text. That is worth having and
 * it is not proof: a regex cannot tell whether the loop actually stops, and
 * CLAUDE.md is explicit that where a thing can be executed, you execute it and
 * assert the RESULT. The controller was built to be executed — `run` and `now`
 * are injectable precisely so no Supabase and no wall clock are needed — and
 * until this file existed nothing ever called it.
 *
 * So this guard imports the REAL route module (through
 * scripts/lib/nodeResolveHook.mjs, because app modules use bundler-style
 * extensionless imports) and drives the controller with a fake worker and a
 * fake clock. Every assertion below is a return value, never a substring.
 *
 * The contract numbers are PARSED from the route rather than hard-coded, so a
 * deliberate future change to BATCH_SIZE or the budget re-tunes this guard
 * instead of falsely failing it — while the RELATIONSHIPS it asserts (a batch
 * never exceeds BATCH_SIZE, no batch is started at or after the deadline, a
 * failed batch stops the run) stay locked.
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/nodeResolveHook.mjs", import.meta.url);

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

const ROUTE_URL = new URL("../app/api/cron/photo-repair/route.js", import.meta.url);
const routeSrc = readFileSync(ROUTE_URL, "utf8");
const num = (re) => {
  const m = re.exec(routeSrc);
  return m ? Number(m[1].replace(/_/g, "")) : null;
};
const MAX_SECONDS = num(/export\s+const\s+maxDuration\s*=\s*([\d_]+)/);
const WORK_BUDGET_MS = num(/const\s+WORK_BUDGET_MS\s*=\s*([\d_]+)/);
const BATCH_SIZE = num(/const\s+BATCH_SIZE\s*=\s*([\d_]+)/);

// PROBE. Everything below multiplies by these three numbers; if the parse
// silently returned null, every expectation would collapse to a vacuous truth.
const numbersParsed = Number.isFinite(MAX_SECONDS) && Number.isFinite(WORK_BUDGET_MS) && Number.isFinite(BATCH_SIZE) && BATCH_SIZE > 0;
ok(numbersParsed,
  `PROBE: the route's contract numbers parsed (maxDuration=${MAX_SECONDS}s, budget=${WORK_BUDGET_MS}ms, batch=${BATCH_SIZE}) — a null here would make every assertion below vacuous`);

// Imported the way every other executing guard in this repo does it, at top
// level: a module that cannot even be loaded should crash this guard loudly
// rather than be reported as a tidy assertion failure. A RENAMED export is the
// case that stays reportable, and the probe below is what catches it.
const { runRepairWithinBudget } = await import("../app/api/cron/photo-repair/route.js");
ok(typeof runRepairWithinBudget === "function",
  "PROBE: the real route module exported runRepairWithinBudget — this guard drives production code, not a copy of it");

// Both probes gate the scenarios: with an unreadable contract or an
// unimportable module every scenario below would throw rather than report, and
// a guard that crashes says less than one that names what it could not check.
// The single failure report at the END of this file is the only exit path.
if (numbersParsed && typeof runRepairWithinBudget === "function") {

/**
 * A fake worker that records the limit it was handed and the clock reading at
 * the moment it was called. `plan` supplies one result per batch; when it runs
 * out the queue is treated as exhausted (a short batch).
 */
function harness({ plan = [], budgetMs = WORK_BUDGET_MS, startedAt = 0 } = {}) {
  const calls = [];
  let clock = startedAt;
  const state = { clock: () => clock, advance: (ms) => { clock += ms; } };
  const run = async ({ limit }) => {
    calls.push({ limit, at: clock });
    const step = plan.shift();
    if (typeof step === "function") return step({ limit, advance: state.advance });
    if (step === undefined) return { ok: true, attempted: 0, recovered: 0, classified: 0, blocked: 0, released: 0, failed: 0 };
    return step;
  };
  return { calls, run, now: () => clock, advance: state.advance, deadlineAt: startedAt + budgetMs, startedAt };
}
const fullBatch = (advanceMs) => ({ advance }) => {
  advance(advanceMs);
  return { ok: true, attempted: BATCH_SIZE, recovered: BATCH_SIZE, classified: 0, blocked: 0, released: 0, failed: 0 };
};

// ── 1. POSITIVE CONTROL: a queue that drains inside the budget is NOT partial.
// Without this, every "it stopped early" assertion below is equally consistent
// with a controller that never runs anything at all.
{
  const limit = BATCH_SIZE * 3;
  const h = harness({ plan: [fullBatch(1000), fullBatch(1000), fullBatch(1000)] });
  const r = await runRepairWithinBudget({ limit, startedAt: h.startedAt, run: h.run, now: h.now });
  ok(r.ok === true && r.attempted === limit && r.batches === 3 && r.partial === false && r.stopReason == null,
    `a queue that drains inside the budget completes: ok, attempted=${r.attempted}/${limit}, batches=${r.batches}, partial=${r.partial}, stopReason=${r.stopReason}`);
  ok(h.calls.every((c) => c.limit <= BATCH_SIZE) && h.calls.length === 3,
    `no batch exceeds BATCH_SIZE=${BATCH_SIZE} (limits handed to the worker: ${JSON.stringify(h.calls.map((c) => c.limit))})`);
}

// ── 2. THE INCIDENT ITSELF: work must stop while platform time remains.
{
  const h = harness({ plan: [fullBatch(1000), fullBatch(1000), fullBatch(WORK_BUDGET_MS)] });
  const r = await runRepairWithinBudget({ limit: 500, startedAt: h.startedAt, run: h.run, now: h.now });
  ok(r.ok === true && r.stopReason === "deadline" && r.partial === true,
    `a run that reaches its own budget stops with stopReason=deadline and reports partial (got stopReason=${r.stopReason} partial=${r.partial})`);
  ok(r.attempted === BATCH_SIZE * 3 && r.batches === 3,
    `the work already done is COUNTED, not discarded — attempted=${r.attempted}, batches=${r.batches}`);
  // The whole point: nothing is STARTED at or after the deadline, so the
  // remaining platform seconds belong to the pulse.
  ok(h.calls.every((c) => c.at < h.deadlineAt),
    `no batch is started at or after the deadline (starts=${JSON.stringify(h.calls.map((c) => c.at))}, deadline=${h.deadlineAt})`);
  ok(h.now() - h.startedAt < MAX_SECONDS * 1000,
    `the controller returned with platform time to spare: used ${h.now() - h.startedAt}ms of ${MAX_SECONDS * 1000}ms`);
  ok(MAX_SECONDS * 1000 - WORK_BUDGET_MS >= 60_000,
    `at least 60s of platform headroom is left for the final batch and recordPulse (${MAX_SECONDS * 1000 - WORK_BUDGET_MS}ms)`);
}

// ── 3. A FAILED ROW IS NOT HAMMERED INSIDE ONE INVOCATION.
// lib/photoRepair.js deliberately leaves a failed row unpatched, so an
// immediate re-query would select the same row again.
{
  const h = harness({ plan: [
    fullBatch(1000),
    ({ advance }) => { advance(1000); return { ok: true, attempted: BATCH_SIZE, recovered: BATCH_SIZE - 1, classified: 0, blocked: 0, released: 0, failed: 1 }; },
    fullBatch(1000),
  ] });
  const r = await runRepairWithinBudget({ limit: 500, startedAt: h.startedAt, run: h.run, now: h.now });
  ok(r.stopReason === "row-failure" && r.partial === true && r.failed === 1,
    `a batch reporting a row failure stops the run (stopReason=${r.stopReason}, failed=${r.failed})`);
  ok(h.calls.length === 2,
    `the third batch is never started, so the unpatched row cannot be re-selected in the same run (batches started=${h.calls.length})`);
}

// ── 4. A SHORT BATCH MEANS THE DUE QUEUE IS EMPTY — that is success, not partial.
{
  const h = harness({ plan: [
    fullBatch(1000),
    ({ advance }) => { advance(1000); return { ok: true, attempted: 1, recovered: 1, classified: 0, blocked: 0, released: 0, failed: 0 }; },
  ] });
  const r = await runRepairWithinBudget({ limit: 500, startedAt: h.startedAt, run: h.run, now: h.now });
  ok(r.ok === true && r.stopReason == null && r.partial === false && r.attempted === BATCH_SIZE + 1,
    `an exhausted queue ends the run cleanly, never as PARTIAL (attempted=${r.attempted}, partial=${r.partial}, stopReason=${r.stopReason})`);
  ok(h.calls.length === 2, `no empty extra batch is issued after the queue runs dry (batches started=${h.calls.length})`);
}

// ── 5. THE WORKER'S OWN FAILURE MODES SURVIVE THE CONTROLLER.
{
  const h = harness({ plan: [{ ok: false, reason: "supabase unreachable" }] });
  const r = await runRepairWithinBudget({ limit: 500, startedAt: h.startedAt, run: h.run, now: h.now });
  ok(r.ok === false && r.stopReason === "worker-unavailable" && /supabase/.test(r.reason || ""),
    `a worker that cannot run is reported as NOT ok, with its reason preserved (ok=${r.ok}, reason=${r.reason})`);

  const h2 = harness({ plan: [{ ok: true, queueUnavailable: true, queueStatus: 404, attempted: 0 }] });
  const r2 = await runRepairWithinBudget({ limit: 500, startedAt: h2.startedAt, run: h2.run, now: h2.now });
  ok(r2.ok === true && r2.queueUnavailable === true && r2.queueStatus === 404 && r2.attempted === 0,
    `a missing queue table stays ok:true with queueUnavailable — it must pulse, not page (ok=${r2.ok}, queueUnavailable=${r2.queueUnavailable})`);

  // Partial work followed by a worker failure must still surface what landed.
  const h3 = harness({ plan: [fullBatch(1000), { ok: false, reason: "connection reset" }] });
  const r3 = await runRepairWithinBudget({ limit: 500, startedAt: h3.startedAt, run: h3.run, now: h3.now });
  ok(r3.ok === false && r3.partial === true && r3.attempted === BATCH_SIZE,
    `rows already mutated before a worker failure are still reported (attempted=${r3.attempted}, partial=${r3.partial})`);
}

// ── 6. THE LIMIT IS BOUNDED, AND THE LAST BATCH NEVER OVERSHOOTS IT.
{
  const h = harness({ plan: Array.from({ length: 40 }, () => fullBatch(1)) });
  const r = await runRepairWithinBudget({ limit: 10_000, startedAt: h.startedAt, run: h.run, now: h.now });
  ok(r.requested === 500, `an oversized limit is clamped to 500, never trusted from the query string (got ${r.requested})`);
  const total = h.calls.reduce((s, c) => s + c.limit, 0);
  ok(total <= 500 && h.calls.every((c) => c.limit <= BATCH_SIZE),
    `the worker is never asked for more than the clamped total (asked for ${total} across ${h.calls.length} batches)`);

  const h2 = harness({ plan: [fullBatch(1), fullBatch(1)] });
  const r2 = await runRepairWithinBudget({ limit: BATCH_SIZE + 3, startedAt: h2.startedAt, run: h2.run, now: h2.now });
  ok(h2.calls.length === 2 && h2.calls[1].limit === 3,
    `the final batch is trimmed to what is left rather than a full BATCH_SIZE (limits=${JSON.stringify(h2.calls.map((c) => c.limit))})`);
  ok(r2.requested === BATCH_SIZE + 3, `a caller-supplied limit under the ceiling is respected (got ${r2.requested})`);

  const h3 = harness({ plan: [fullBatch(1)] });
  const r3 = await runRepairWithinBudget({ limit: 0, startedAt: h3.startedAt, run: h3.run, now: h3.now });
  ok(r3.requested >= 1, `a zero or missing limit still runs at least one row rather than silently doing nothing (got ${r3.requested})`);
}

// ── 7. A BUDGET ALREADY SPENT STARTS NO WORK AT ALL.
// The degenerate case: if the platform is already late when the handler runs,
// the correct behaviour is to pulse immediately, not to begin a batch.
{
  const h = harness({ plan: [fullBatch(1)] });
  const r = await runRepairWithinBudget({ limit: 500, startedAt: h.startedAt - WORK_BUDGET_MS, run: h.run, now: h.now });
  ok(h.calls.length === 0 && r.ok === true && r.stopReason === "deadline" && r.attempted === 0,
    `a budget already spent starts zero batches and still returns a reportable result (batches=${h.calls.length}, stopReason=${r.stopReason})`);
}

}

if (fail.length) {
  console.error(`test-photo-repair-deadline: FAIL — ${fail.length} of ${pass + fail.length} assertions`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-photo-repair-deadline: OK — ${pass} assertions; the controller was EXECUTED against a fake worker and a fake clock (maxDuration=${MAX_SECONDS}s, budget=${WORK_BUDGET_MS / 1000}s, batch=${BATCH_SIZE}), proving it stops before the platform kill, counts the work it did, and never restarts a failed row inside one run`);
