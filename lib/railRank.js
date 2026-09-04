// lib/railRank.js — THE ONE ranking law for every poster rail. One
// comparator, one export set, every rail composer converts to it.
//
// THE OWNER'S COMPLAINT (2026-09-03, third time asking). Night Out → Clubs &
// Dancing near Parrish:
//
//   1. Joyland  8.5/10  16.8 mi
//   2. La Jaula 7.7/10  14.9 mi
//   3. Enigma   9.0/10  18 mi
//
// A 9.0 sat below a 7.7. ROOT CAUSE: lib/nightOutIntent.js rankedPlaces()
// (and lib/fallIntentRails.js rankCards(), the identical shape) sorted by a
// DISTANCE RING *before* the score:
//
//   const ring = (a.distMi > NEAR_MI) - (b.distMi > NEAR_MI);
//   return ring || (scoreOf(b) - scoreOf(a)) || (a.distMi - b.distMi);
//
// Joyland (16.8) and La Jaula (14.9) were both inside the ring (ring 0), so
// they sorted by score against each other; Enigma at 18mi was ring 1 and was
// exiled below BOTH of them regardless of its 9.0. The code was behaving
// exactly as written — the writing itself is what the owner rejected, three
// times.
//
// WHY THE EXISTING GUARD DID NOT CATCH IT: scripts/test-rail-score-order.mjs
// exists for this exact complaint (its header quotes the owner, 2026-08-05),
// but every assertion targets `rankExperiences()` in lib/experiencesData.js —
// the Experiences rails only. It asserted nothing about nightOut / fall /
// dateNight / birthday / todayDiscovery / lunchBreak, and it was scoped BY
// NAME to one composer, so every rail composer written since was born
// unguarded. scripts/check-rail-rank-law.mjs is the fix for the CLASS: it
// enumerates composers from the filesystem instead of a hand-written list.
//
// THE LAW (also exported as RAIL_RANK_LAW, a one-line string the guard and
// the docs both quote):
export const RAIL_RANK_LAW =
  "Wayfind Score DESC, then reviews DESC, then distance ASC, then place_id ASC for stability — distance is a TIE-BREAK ONLY and may never pre-empt the score.";

import { wayfindScore } from "./wayfindScore.js";

/**
 * The score a rail sorts on: an explicit `wfScore` when the row carries one
 * (already-governed 0-100, or a caller-normalized value — see
 * lib/fallIntentRails.js for the event-vs-place normalization), otherwise the
 * canonical Bayesian blend off rating/reviews.
 *
 * CLAUDE.md's score law: a null/unrated score is a DIFFERENT FACT from a
 * mediocre one and must never be coerced to 0 — it sorts LAST, explicitly,
 * never via a magic sentinel that could collide with a real value.
 *
 * @returns {number|null}
 */
export function railScoreOf(row) {
  const raw = row?.wfScore ?? wayfindScore(row?.rating, row?.reviews);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * THE comparator. Score DESC; a null score sorts last regardless of every
 * other field. Ties break on reviews DESC (depth beats a thin sample at the
 * same displayed score), then distance ASC (closer wins an exact tie), then
 * place_id ASC so two rows tied on everything above still render in a
 * deterministic order instead of shuffling between requests.
 *
 * Distance NEVER appears before the score term — that is the entire bug this
 * file exists to end. scripts/check-rail-rank-law.mjs red-proves this by
 * reinserting a ring ahead of the score in a scratch copy and asserting the
 * guard goes red.
 */
export function byWayfindScore(a, b) {
  const sa = railScoreOf(a);
  const sb = railScoreOf(b);
  if (sa == null && sb != null) return 1;
  if (sb == null && sa != null) return -1;
  if (sa != null && sb != null && sa !== sb) return sb - sa;

  const ra = Number(a?.reviews ?? a?.userRatingCount ?? 0) || 0;
  const rb = Number(b?.reviews ?? b?.userRatingCount ?? 0) || 0;
  if (ra !== rb) return rb - ra;

  const da = Number.isFinite(a?.distMi) ? Number(a.distMi) : Infinity;
  const db = Number.isFinite(b?.distMi) ? Number(b.distMi) : Infinity;
  if (da !== db) return da - db;

  const ida = String(a?.place_id ?? a?.id ?? "");
  const idb = String(b?.place_id ?? b?.id ?? "");
  if (ida < idb) return -1;
  if (ida > idb) return 1;
  return 0;
}

/**
 * Sort a rail's rows by the law, then apply the name-dedupe shape shared by
 * every composer that had it inline (nightOutIntent.rankedPlaces,
 * birthdayIntent.uniqueRankedPlaces — byte-identical logic in both places
 * before this file existed): first name wins AFTER ranking, so the surviving
 * duplicate is always the highest-scoring one, never whichever happened to
 * appear first in the input array.
 *
 * A composer with its own richer dedupe (id + name + event-series, radius
 * filters, cross-rail `used` sets) keeps that logic and calls
 * `byWayfindScore` directly instead — this helper is for the common case,
 * not a mandate to replace bespoke dedupe.
 */
export function rankRailPlaces(rows) {
  const seen = new Set();
  return (Array.isArray(rows) ? rows : []).slice().sort(byWayfindScore).filter((row) => {
    const key = String(row?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
