// lib/fetchDeadline.js — every outbound call on a reader-facing path settles.
//
// THE BUG THIS EXISTS FOR, measured on production 2026-08-27 against
// www.gowayfind.com/api/rails, serially, one request at a time:
//
//     Orlando metro, pool already warm, six FRESH CDN cache cells:
//       cell 01  ->  50.0s  (timed out, no body)
//       cell 02  ->   2.5s  200
//       cell 03  ->   2.2s  200
//       cell 04  ->  50.0s  (timed out, no body)
//       cell 05  ->   5.3s  200
//
//     Same metro. Same warm pool. Same work. Two of five never came back.
//
// It is NOT slow computation — the successful runs did the identical work in
// about two seconds. It is a HANG, and it is the last unclosed half of the
// v8.73 empty-rail fix (#993): that PR bounded how much work the rail does and
// made the client wait 30s instead of 12s, but nothing on the SERVER was ever
// bounded, so a request that stalls upstream stalls forever.
//
// WHERE IT STALLS. /api/rails fans out, per request, to as many as forty
// upstream calls — five ranked categories x up to four pool towns, each of
// which may make a metered Google Places `searchText` POST, plus the Supabase
// cache reads and writes around it and the inventory / editorial / beach-signal
// joins. Not one of those seven fetch sites carried a signal or a timeout.
// Under a burst from a single lambda, some of them simply never answer.
//
// WHY IT NEVER SELF-HEALS, which is what made it look random to the owner: a
// request that never completes writes nothing to the CDN, so the next reader in
// that cell repeats the whole thing from scratch. And the client's deadline
// converts the hang into a sentence about the reader's town — "we couldn't
// reach the ranking service" — which is a claim we are making on the strength
// of our own stall.
//
// WHY THE FAIL-SOFT ALREADY WRITTEN EVERYWHERE NEVER RAN. Every one of those
// seven call sites is already wrapped in try/catch with a sensible degraded
// answer: searchOnce serves the stale cached row ("429/down: serve stale"), the
// editorial join returns {}, the inventory read skips the pool. All correct,
// all unreachable — because A HANG IS NOT AN EXCEPTION. Nothing throws, so
// nothing catches. This module's whole job is to turn the one failure mode
// those handlers cannot see into the ordinary one they already handle.
//
// It is lib/loadState.js's rule ("a rejection is not the only way to hang"),
// which this repo wrote for the client in August and never applied to the
// server the client is waiting on.
//
// PURE ON PURPOSE — no next/server, no framework import — so
// scripts/check-fetch-deadlines.mjs EXECUTES it against a never-settling
// fetch rather than grepping for the shape.

// Per-call ceiling for one upstream request. Chosen against the measurement
// above, from both ends: healthy runs complete the ENTIRE request (all ~40
// upstream calls, in parallel) in about 2 seconds, so 8s is four times the
// observed p100 of the whole fan-out and cannot fire on a working call; and
// the server and browser budgets are 9s and 10s, so one stalled dependency is
// aborted before either reader-facing deadline fires.
export const NET_DEADLINE_MS = 8000;

// Supabase cache-key reads and writes are our own database, on our own
// network, returning at most one small row. They get a tighter budget: a
// cache lookup that takes longer than this has already cost more than the
// call it was meant to save.
export const DB_DEADLINE_MS = 4000;

/**
 * An AbortSignal that fires after `ms`.
 * AbortSignal.timeout is Node 18+/modern-browser; the fallback keeps this
 * module usable anywhere, including in the guard's own harness.
 */
export function deadlineSignal(ms) {
  const t = Math.max(1, Number(ms) || NET_DEADLINE_MS);
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(t);
  }
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(new Error("deadline")), t);
  // Never hold a serverless function open on a timer that has done its job.
  if (timer && typeof timer.unref === "function") timer.unref();
  return c.signal;
}

/**
 * fetch, with a deadline. Drop-in for the bare `fetch` on any reader-facing
 * path.
 *
 * TWO PROPERTIES THIS MUST HAVE, both asserted by execution in the guard:
 *
 *   1. It REJECTS on the deadline — it does not resolve with a null-ish
 *      response. Every call site downstream already has a `catch` with the
 *      right degraded answer for its own surface; the one thing this module
 *      must not do is invent a different failure vocabulary for them to learn.
 *
 *   2. It does not disturb caching. Verified against the installed Next
 *      14.2.5 rather than assumed, because getting this wrong would silently
 *      re-bill every cached Google Places call:
 *        - server/lib/patch-fetch.js decides cacheability from
 *          `isCacheableRevalidate` (the `revalidate` number), NOT from the
 *          presence of a signal, and passes `signal` straight through
 *          (dropping it only during a background stale revalidate);
 *        - incremental-cache/index.js `fetchCacheKey` hashes
 *          [prefix, url, method, headers, mode, redirect, credentials,
 *          referrer, referrerPolicy, integrity, cache, body] — `signal` is
 *          not in it, so a fresh controller per call does not fragment the
 *          key.
 *      So `next: { revalidate }` keeps working exactly as before.
 *
 * The caller's `init` is never mutated: a caller that passes its own signal
 * keeps it, and we only supply one when there is none.
 */
export function fetchDeadline(input, init, ms) {
  const opts = init && typeof init === "object" ? init : {};
  const next = opts.signal ? opts : { ...opts, signal: deadlineSignal(ms) };
  return fetch(input, next);
}
