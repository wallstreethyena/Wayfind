// lib/promoteEnqueue.js — PURE decision for the cheap in-box backfill.
//
// THE GAP. wf_place_ids_enqueue_trg() only fires on an index INSERT/UPDATE.
// Historical in-box rows that were never touched after the queue shipped are
// therefore never queued, even though they sit inside PROMOTE_METROS. SQL
// already has public.wf_promotion_backfill() for exactly that set (in-box,
// not inventory, not already queued). Nobody should run it by accident.
//
// THE SWITCH (OFF BY DEFAULT — do not turn this on in this PR):
//
//   WAYFIND_PROMOTE_BACKFILL          must be the exact string "on"
//   WAYFIND_PROMOTE_BACKFILL_LIMIT    max rows to enqueue this run (default 0)
//   WAYFIND_PROMOTE_BACKFILL_MAX_USD  optional cap on COMMITTED Place Details
//                                     spend (limit × $0.017) once the existing
//                                     promote-index worker drains the queue
//
// Enqueue itself is free and calls NO Google. Turning the switch on commits
// the already-scheduled /api/cron/promote-index worker to Details spend for
// each new queue row. That is why both the switch AND a positive limit are
// required: an unset/typo'd value, or "on" with limit 0, enqueues nothing.
//
// Geo policy is unchanged — backfill uses wf_bucket_metro / PROMOTE_METROS.
// Out-of-box index rows stay unqueued.

export const PROMOTE_BACKFILL_ENV = "WAYFIND_PROMOTE_BACKFILL";
export const PROMOTE_BACKFILL_LIMIT_ENV = "WAYFIND_PROMOTE_BACKFILL_LIMIT";
export const PROMOTE_BACKFILL_MAX_USD_ENV = "WAYFIND_PROMOTE_BACKFILL_MAX_USD";
export const PROMOTE_BACKFILL_ON = "on";
export const PROMOTE_BACKFILL_COST_PER_RECORD = 0.017; // Place Details (New) ~$17/1k
export const PROMOTE_BACKFILL_RPC = "wf_promotion_backfill";

export function backfillSwitchOn(env = process.env) {
  return String((env && env[PROMOTE_BACKFILL_ENV]) || "") === PROMOTE_BACKFILL_ON;
}

// planBackfillEnqueue — what a run WOULD enqueue. Pure: pass `env` so tests
// never read the process environment. willEnqueue is 0 unless the switch is
// exactly "on" AND a positive limit survives the spend cap.
export function planBackfillEnqueue(env = process.env, opts = {}) {
  const perRec = Number(opts.costPerRecord) > 0 ? Number(opts.costPerRecord) : PROMOTE_BACKFILL_COST_PER_RECORD;
  const enabled = backfillSwitchOn(env);
  const rawLimit = env && env[PROMOTE_BACKFILL_LIMIT_ENV];
  const parsedLimit = rawLimit == null || rawLimit === "" ? 0 : Number(rawLimit);
  const recordLimit = Number.isFinite(parsedLimit) ? Math.max(0, Math.floor(parsedLimit)) : 0;

  const rawUsd = env && env[PROMOTE_BACKFILL_MAX_USD_ENV];
  const parsedUsd = rawUsd == null || rawUsd === "" ? null : Number(rawUsd);
  const spendCap = parsedUsd == null || !Number.isFinite(parsedUsd) ? null : Math.max(0, parsedUsd);
  const affordable = spendCap == null ? recordLimit : (perRec > 0 ? Math.floor(spendCap / perRec) : 0);
  const willEnqueue = enabled ? Math.max(0, Math.min(recordLimit, affordable)) : 0;

  let reason;
  if (!enabled) {
    reason = `${PROMOTE_BACKFILL_ENV} is off (default). Set it to exactly "${PROMOTE_BACKFILL_ON}" to enqueue in-box index rows that were never queued.`;
  } else if (willEnqueue === 0) {
    reason = `${PROMOTE_BACKFILL_LIMIT_ENV} is 0 or spend-capped to 0 — nothing will enqueue.`;
  } else {
    reason = `would enqueue up to ${willEnqueue} in-box never-queued index rows via ${PROMOTE_BACKFILL_RPC} (no Google call).`;
  }

  return {
    enabled,
    willEnqueue,
    recordLimit,
    spendCapUSD: spendCap,
    costPerRecord: perRec,
    estimateUSD: Math.round(willEnqueue * perRec * 100) / 100,
    reason,
    envName: PROMOTE_BACKFILL_ENV,
    rpc: PROMOTE_BACKFILL_RPC,
  };
}
