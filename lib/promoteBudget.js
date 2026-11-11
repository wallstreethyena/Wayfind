// lib/promoteBudget.js: the wall clock budget for /api/cron/promote-index. PURE and
// import free so scripts/test-promote-deadline.mjs can execute it with an injected clock.
//
// THE BUG (Vercel "Task timed out after 60 seconds", 7 times since August, last
// 2026-11-01): the route walks a claimed batch one place at a time, each place a
// metered Google Details call, and nothing bounded the total. A slow batch ran into
// maxDuration (60s) and the platform killed it BEFORE the queue was settled, the
// pulse was recorded or the next batch size was written. A killed run leaves no
// heartbeat, which is why job-watch reported "N consecutive runs failed to produce
// results" even though nothing was wrong with the queue.
//
// THE FIX: stop starting new places once PROMOTE_BUDGET_MS has elapsed, hand the
// untouched ones back (wf_promotion_release refunds the claim attempt), and still run
// the settle, pulse and config steps. The response reports stopped: "deadline".
// Quota (429) and ledger handling are unchanged: they live in the per place handler.

// The route's `export const maxDuration`. scripts/test-promote-deadline.mjs asserts
// this equals the route's real value, so the two cannot drift apart.
export const PROMOTE_MAX_DURATION_S = 60;
// 15s of headroom for what must still happen after the loop: split venue lookup,
// the inventory upsert, the queue settle RPCs, the pulse and the config write.
export const PROMOTE_BUDGET_MS = 45_000;

export function createBudget({ budgetMs = PROMOTE_BUDGET_MS, now = Date.now } = {}) {
  const start = now();
  return {
    budgetMs,
    elapsedMs: () => now() - start,
    remainingMs: () => Math.max(0, budgetMs - (now() - start)),
    expired: () => now() - start >= budgetMs,
  };
}

/**
 * Run `handler(item)` for each item in order until the budget is spent.
 * Returns { deferred, stopped }: the items never started, and "deadline" when the
 * budget (not the end of the list) is why the walk ended. An item already in flight
 * is allowed to finish; its own fetch carries a bounded signal.
 */
export async function runWithinBudget(items, handler, budget) {
  const deferred = [];
  let stopped = null;
  for (const item of items) {
    if (budget.expired()) {
      stopped = "deadline";
      deferred.push(item);
      continue;
    }
    await handler(item);
  }
  return { deferred, stopped };
}
