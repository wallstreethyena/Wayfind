// lib/promoteThrottle.js — PURE adaptive batch-size logic for the promotion
// drain. NO network / clock / filesystem here, same discipline as
// lib/promoteIndex.js: app/api/cron/promote-index/route.js and
// scripts/promote-worker.mjs both do the Supabase read/write and pass plain
// numbers in, so every rule here is unit-tested (scripts/test-promote-throttle.mjs)
// rather than trusted, and there is exactly ONE clamp/step implementation for
// both call sites to share (scripts/check-promote-batch-clamp.mjs pins that).
//
// WHY THIS EXISTS (2026-09-01). The drain was a hardcoded 25/invocation,
// 4x/hour (~100/hour) — safe, but nowhere near the ~600/hour a 5-minute cron
// at the claim RPC's own 50-row cap could sustain, and raising the static
// number by hand is exactly the kind of manual lever this repo's cron infra
// keeps needing to grow past (see the promote-index route's own history).
// public.wf_promote_config (migration 20260901_wf_promote_config.sql) holds
// ONE row the cron reads and — only when auto=true — rewrites after every run,
// so throughput climbs on its own while the queue is healthy and retreats fast
// the moment it isn't. The bounds below are the hard wall: nothing here can
// push batch_limit outside [MIN_BATCH_LIMIT, MAX_BATCH_LIMIT] no matter what a
// bad config row or a bad stat says, and quality (decidePromotion, the ledger
// spend gate) is untouched — this only ever changes HOW MANY rows are claimed,
// never whether one is promoted.

export const DEFAULT_BATCH_LIMIT = 25; // the pre-2026-09-01 static value; also the config-read-failure fallback
export const MIN_BATCH_LIMIT = 1;      // a config row may not go below this — 0 would silently stop the drain
export const MAX_BATCH_LIMIT = 50;     // wf_promotion_claim's own server-side cap; clamping here is belt-and-braces
export const ADAPTIVE_FLOOR = 5;       // the auto-halve step will not go below this on its own — see nextBatchLimit

function clampWithinBounds(v) {
  return Math.max(MIN_BATCH_LIMIT, Math.min(MAX_BATCH_LIMIT, Math.round(v)));
}

// clampBatchLimit — THE ONE predicate both the route and the worker call.
// Missing/blank/non-finite -> `fallback` (DEFAULT_BATCH_LIMIT unless the
// caller names a different one), itself clamped so a bad fallback can't
// escape the bounds either. This is the single source of "what does a
// wf_promote_config row (or its absence) mean as a batch size" — a second,
// slightly-different clamp in the worker is exactly the parallel-path bug
// decidePromotion's own history already paid for once.
export function clampBatchLimit(n, fallback = DEFAULT_BATCH_LIMIT) {
  if (n === null || n === undefined || n === "") return clampWithinBounds(fallback);
  const v = Number(n);
  if (!Number.isFinite(v)) return clampWithinBounds(fallback);
  return clampWithinBounds(v);
}

// nextBatchLimit — the adaptive step. Pure function of (current, this run's
// stats) -> the batch_limit for the NEXT run. Only ever called when the
// config row says auto=true; the caller leaves batch_limit untouched
// otherwise (a manual pin).
//
//   attempted      rows claimed this run (0 = idle; nothing to learn from, no change)
//   errors         count of OPERATIONAL failures this run — transient/retry
//                  fetch failures and failed database writes. Deliberately
//                  NOT decidePromotion's data verdicts (unclassified, closed,
//                  out-of-bounds): those are correct, expected rejects, not
//                  distress signals, and must never throttle the drain.
//   ledgerDenials  count of spend-ledger refusals this run (lib/spendGate.js's
//                  wf_spend_take saying no). Since 2026-09-01 (second pass)
//                  the route and the worker BOTH ask spendAllowCapped() once
//                  per place before the Details call and report every refusal
//                  here — a batch that was mostly released halves the next
//                  claim, so an exhausted month costs a few claim/release
//                  round trips an hour, not fifty. Optional and 0 by default
//                  for callers that meter elsewhere.
//   sawRateLimit   true if any Google call this run came back 429 — forces a
//                  halve regardless of the error-rate math below.
//   queueNonEmpty  true if this run's claim looks like it did not drain the
//                  queue (a full-size claim is the caller's proxy — see
//                  route.js/promote-worker.mjs; a fresh COUNT query would be
//                  more precise and is deliberately not worth the extra
//                  Supabase round trip every run).
//
// Rule: > 20% combined error rate, or any 429, halves (floor ADAPTIVE_FLOOR).
// < 5% error rate on a non-empty queue raises 25% (ceil, cap MAX_BATCH_LIMIT).
// Between 5% and 20%, or an empty queue: unchanged. Ledger fail-closed and
// decidePromotion's own quality gates remain the actual spend/quality wall —
// this only ever throttles CLAIM VOLUME.
export function nextBatchLimit(current, opts = {}) {
  const cur = clampBatchLimit(current);
  const attempted = Math.max(0, Number(opts.attempted) || 0);
  if (attempted <= 0) return cur;

  const errors = Math.max(0, Number(opts.errors) || 0);
  const ledgerDenials = Math.max(0, Number(opts.ledgerDenials) || 0);
  const sawRateLimit = opts.sawRateLimit === true;
  const queueNonEmpty = opts.queueNonEmpty === true;

  const errorRate = (errors + ledgerDenials) / attempted;

  if (errorRate > 0.20 || sawRateLimit) {
    return Math.max(ADAPTIVE_FLOOR, Math.floor(cur / 2));
  }
  if (errorRate < 0.05 && queueNonEmpty) {
    return Math.min(MAX_BATCH_LIMIT, Math.ceil(cur * 1.25));
  }
  return cur;
}
