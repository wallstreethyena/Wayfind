// lib/trendOrder.js — THE ONE ordering term Exploding Topics is allowed to
// contribute. There is exactly one formula and exactly one export, and every
// surface that reorders on trend data calls this and nothing else.
//
// ── WHY THIS IS NOT WIRED INTO lib/trendSignal.js ──────────────────────────
//
// The obvious home for this was trendSignal.js's `topic` source, which has sat
// unwired since 2026-08-07 with the comment "Google Trends topic momentum
// (optional; absent until wired)" and a weight of 0.15. It is the wrong home,
// and the reason is load-bearing:
//
//     trendSignal.computeTrendSignal() → { trending: true }
//       → lib/wayfindScore.js TRENDING_BONUS (+6 internal, +0.6 shown)
//       → THE WAYFIND SCORE THE USER SEES ON THE CARD
//
// trendSignal is a SCORE-FEEDING signal. Its inputs are real demand data about
// THE VENUE — Foursquare foot traffic at that address, a major event two blocks
// away, live busyness. Those are facts about the place, so letting them move the
// place's score is defensible.
//
// Exploding Topics measures a TOPIC. "Korean coffee is up 190%" is not a
// measurement of this cafe, this street, or this city. Feeding it into
// TRENDING_BONUS would raise a specific venue's displayed merit score on the
// strength of global search interest in a category — and the card would then
// disclose "🔥 Popular with locals" or "Interest is rising" as if we had measured
// something local. We would be printing a number we did not earn.
//
// AGENTS.md §8: "Affinity may reorder results. It must NEVER feed a displayed
// Wayfind Score." This term is on the affinity side of that line, so it lives in
// its own module with its own arithmetic, and scripts/check-trend-integrity.mjs
// asserts that neither wayfindScore.js nor trendSignal.js can reach it.
//
// ── THE BOUND ──────────────────────────────────────────────────────────────
//
// MAX_BOOST is 4.0 on lib/rankPlaces.js's 0–100 internal scale — deliberately
// smaller than every editorial term it sits beside (CURATED_BONUS is 15,
// FAVE_TIER_WEIGHT is 4/step, TRENDING_BONUS is 6). At full strength it moves a
// place about 0.4 of a displayed point's worth of ordering, which reorders
// near-ties and cannot rescue a weak place from a strong one. That is the entire
// intended power: surface the rising thing AMONG comparable options, never
// instead of a better one.
//
// Shadow mode remains available for comparing baseline and adjusted order before
// a snapshot is published. It is an evaluation tool, not a permissions gate.

import { snapshotFreshness } from "./trendRights.js";

/** Maximum ordering contribution, on lib/rankPlaces.js's 0–100 internal scale. */
export const MAX_BOOST = 4.0;

/** Below this match confidence the boost is zero, not merely small. */
export const MIN_CONFIDENCE = 0.6;

/**
 * The formula.
 *
 *   boost = MAX_BOOST × strength × confidence × freshness
 *
 * Multiplicative, so ANY factor at zero zeroes the whole term. That is the
 * design: a stale snapshot, an unconfident match, or a dead topic must not leave
 * a residual nudge behind. An additive blend would let two weak factors sum into
 * a real boost, which is exactly the shape that makes a bad reorder hard to
 * explain afterwards.
 *
 * Returns the full derivation, not just a number, so the shadow report and the
 * internal explanation can show WHY a place moved. A boost nobody can decompose
 * is a boost nobody can defend.
 */
export function trendOrderBoost(input) {
  const {
    normalizedTrendStrength, semanticConfidence,
    observedAtMs, nowMs = Date.now(), cadenceCfg,
    shadow = false, manualState = null,
  } = input || {};

  const zero = (reason) => ({
    boost: 0, applied: false, reason,
    factors: { strength: null, confidence: null, freshness: null }, maxBoost: MAX_BOOST, shadow,
  });

  // 1. Manual override. An owner denial outranks every computed factor.
  if (manualState === "deny") return zero("manually denied by the owner");

  // 2. FRESHNESS. Stale ⇒ zero boost AND (elsewhere) no label. One fact.
  const fresh = snapshotFreshness(observedAtMs, nowMs, cadenceCfg);
  if (fresh.stale) return zero(`snapshot stale: ${fresh.reason}`);

  // 3. Confidence floor.
  const conf = Number(semanticConfidence);
  if (!Number.isFinite(conf) || conf < MIN_CONFIDENCE) {
    return zero(`match confidence ${Number.isFinite(conf) ? conf.toFixed(2) : "n/a"} is below the ${MIN_CONFIDENCE} floor`);
  }

  // 4. Strength must be a real 0–1. Out-of-range is a BUG upstream, and clamping
  //    it silently would hide a strength function that had started returning 3.
  const s = Number(normalizedTrendStrength);
  if (!Number.isFinite(s) || s < 0 || s > 1) {
    return zero(`normalizedTrendStrength ${normalizedTrendStrength} is not in 0..1 — refusing to apply an out-of-range multiplier`);
  }
  if (s === 0) return zero("trend strength is zero");

  const factors = { strength: s, confidence: Math.min(1, conf), freshness: fresh.freshnessFactor };
  const boost = MAX_BOOST * factors.strength * factors.confidence * factors.freshness;

  return {
    boost, applied: boost > 0, shadow, maxBoost: MAX_BOOST, factors,
    ageDays: fresh.ageDays,
    reason:
      `${MAX_BOOST} × strength ${factors.strength.toFixed(3)} × confidence ${factors.confidence.toFixed(3)} ` +
      `× freshness ${factors.freshness.toFixed(3)} = ${boost.toFixed(3)}` + (shadow ? " (SHADOW — not applied to what the reader sees)" : ""),
  };
}

/**
 * Apply the term to a ranked list and return a BASELINE-vs-ADJUSTED comparison.
 *
 * Never mutates the caller's rows and never touches any score field — it returns
 * a new ordering plus the movement report. The displayed Wayfind Score is not an
 * input to this function and is not an output of it.
 *
 * `baseScoreOf(row)` is the surface's EXISTING ordering value (whatever
 * lib/rankPlaces.js / lib/lawfulOrder.js already produced). This function is
 * strictly a post-pass over an order that has already survived every product
 * gate — it cannot add a row, remove a row, or override an eligibility rule,
 * because it only ever sees rows that are already in the list.
 */
export function applyTrendOrdering(rows, baseScoreOf, boostFor) {
  const list = Array.isArray(rows) ? rows : [];
  const baseline = list
    .map((row, i) => ({ row, i, base: Number(baseScoreOf(row)) || 0 }))
    .sort((a, b) => b.base - a.base || a.i - b.i);
  const baselineRank = new Map(baseline.map((e, r) => [e.row, r + 1]));

  const adjusted = baseline
    .map((e) => {
      const b = boostFor(e.row) || { boost: 0, applied: false, reason: "no trend match" };
      return { ...e, boostInfo: b, adjusted: e.base + (Number(b.boost) || 0) };
    })
    .sort((a, b) => b.adjusted - a.adjusted || a.i - b.i);

  return {
    order: adjusted.map((e) => e.row),
    report: adjusted.map((e, r) => ({
      place_id: e.row.place_id || e.row.id || null,
      name: e.row.name || null,
      baselineRank: baselineRank.get(e.row),
      adjustedRank: r + 1,
      movement: baselineRank.get(e.row) - (r + 1),
      baseScore: e.base,
      adjustedScore: e.adjusted,
      boost: e.boostInfo.boost,
      boostReason: e.boostInfo.reason,
      topic: e.boostInfo.topic || null,
      confidence: e.boostInfo.factors ? e.boostInfo.factors.confidence : null,
      strength: e.boostInfo.factors ? e.boostInfo.factors.strength : null,
    })),
  };
}
