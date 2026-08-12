// lib/loadState.js — a lazily-loaded section must always reach a state a
// reader can act on. Never an indefinite skeleton.
//
// THE BUG THIS EXISTS FOR (owner, 2026-08-12, with a screenshot of "What Should
// We Do Today?" expanded over an empty grey box): the rail sat on a loading
// skeleton forever. Not slow — STUCK, permanently, with no way back.
//
// The mechanism, in BestNearby and again in TodaysBest:
//
//   1. ensureLoaded claims the slot:            rows[id] = "loading"
//   2. the work runs in a bare async IIFE:      (async () => { await load(id) })()
//      — with no .catch() anywhere on it
//   3. load(id) rejects, or simply never settles
//   4. the rejection is unhandled, so rows[id] is still "loading"
//   5. and the claim guard `if (r[id]) return r` now means NOTHING can retry it:
//      not the IntersectionObserver, not the 2.5s backstop, not re-opening the
//      section. The idempotence that exists to prevent double-fetching is what
//      makes the stuck state permanent.
//   6. the render for "loading" is a height-reserved skeleton — the grey box.
//
// So the failure is silent, permanent, un-retryable, and looks exactly like a
// slow network. That combination is why it survived: nobody could tell it apart
// from "still loading".
//
// THE RULE THIS MODULE ENFORCES: a pending state is a PROMISE THAT SOMETHING
// ELSE WILL BE WRITTEN. Anything that writes LOAD_PENDING must route its work
// through settleLoad, which cannot reject and cannot hang — so the slot is
// always overwritten with either data or LOAD_FAILED, and LOAD_FAILED is
// re-claimable so a retry can actually run.
//
// Pure and framework-free on purpose: scripts/check-no-stuck-loading.mjs
// EXECUTES it against a rejecting thunk and a never-settling thunk rather than
// grepping for the shape.

export const LOAD_PENDING = "loading";
export const LOAD_FAILED = "error";

export const isPending = (v) => v === LOAD_PENDING;
export const isFailed = (v) => v === LOAD_FAILED;

// A slot may be re-claimed when it is empty OR when the last attempt failed.
// "loading" is NOT re-claimable — that is the double-fetch guard, and it stays.
export const canClaim = (v) => v == null || v === LOAD_FAILED;

// WHY 12s AND NOT "no timeout". A rejection is not the only way to hang: a
// fetch against a black-holed connection, a promise nothing ever resolves, or a
// device that slept mid-request all leave the await pending forever, and the
// reader sees the identical grey box. 12s is well past the p99 of these rails
// (they read our own Supabase RPCs) and well short of the ~30s at which a
// person has already decided the site is broken.
export const LOAD_TIMEOUT_MS = 12000;

/**
 * Run `work` and ALWAYS settle.
 *
 * @param {() => Promise<any>} work  a thunk, not a promise, so a retry re-runs it
 * @returns {Promise<{ok: true, data: any} | {ok: false, reason: "error"|"timeout"}>}
 *
 * This function must never reject and must never hang. Both are asserted by
 * executing it, so a future edit that adds an un-awaited throw inside it fails
 * the build rather than re-creating the grey box.
 */
export function settleLoad(work, opts) {
  const timeoutMs = opts && isFinite(opts.timeoutMs) ? opts.timeoutMs : LOAD_TIMEOUT_MS;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    // The timer is armed BEFORE the work starts, so a thunk that throws
    // synchronously and a thunk that never settles are handled by the same path.
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs);
    try {
      Promise.resolve(work()).then(
        (data) => finish({ ok: true, data }),
        () => finish({ ok: false, reason: "error" })
      );
    } catch (e) {
      finish({ ok: false, reason: "error" });
    }
  });
}
