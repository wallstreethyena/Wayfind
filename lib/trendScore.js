// lib/trendScore.js — THE TREND MOMENTUM SCORE (0–100), one configurable model.
//
// This is the Trend Intelligence Engine's scoring module (brief of 2026-08-11).
// It scores TOPICS, never places, and it lives on the ORDER-ONLY side of the
// score boundary lib/trendOrder.js documents: nothing here may feed
// lib/wayfindScore.js, lib/rankPlaces.js or any displayed place score. A topic
// score selects and orders trend MODULES; the governed Wayfind Score still
// ranks the places inside them. scripts/check-trend-score.mjs asserts the
// boundary by import graph, not by intention.
//
// NAMING. The brief calls this "the Wayfind Score". Wayfind already shows users
// a Wayfind Score — the governed /10 place score with its own law and guards.
// Internally this is therefore always the Trend Momentum Score; the ONLY
// user-facing output of this module is PUBLIC_LABELS, which speak Wayfind
// language and never name a provider.
//
// ONE MODEL, CONFIGURABLE, NOT SCATTERED. DEFAULT_WEIGHTS below mirrors the
// seeded active row of wf_trend_score_config (the guard asserts byte-parity of
// values). Serving layers pass the DB row's weights when they have one;
// everything else — tests, guards, offline scoring — runs on the defaults. No
// other file may declare its own copy of these numbers.
//
// MISSING DATA IS ABSENCE, NOT ZERO. A topic with no bookability evidence is
// not "unbookable" — the factor's weight is redistributed across the factors
// that ARE present (the same doctrine trendSignal.js uses for its sources).
// A factor that is present but poor scores low; only absence redistributes.

export const TREND_SCORE_MODEL_VERSION = "tms-v1";

export const DEFAULT_WEIGHTS = Object.freeze({
  growth: 0.12,       // observed long-window search growth (6/12mo delta)
  demand: 0.15,       // absolute demand — category-relative volume percentile
  velocity: 0.13,     // short-window acceleration (3mo delta)
  localIntent: 0.16,  // "near me"-shaped demand, the strongest buy signal
  bookability: 0.12,  // verified matched inventory that can take an action
  quality: 0.12,      // governed quality of the matched places
  freshness: 0.10,    // how recently the signal was observed
  confidence: 0.10,   // stability/volatility + corroboration
});

export const MOMENTUM_THRESHOLDS = Object.freeze({ exploding: 85, rising: 75, building: 65 });

// Wayfind language ONLY. Provider names never appear here, and every label is
// TOPIC-honest: lib/trendDisclosure.js bans "trending near you"-shaped claims
// because topic momentum is not a measurement of any venue or city — the brief's
// recommended "Trending near you" is deliberately NOT used (deviation noted in
// the PR). The guard sweeps these against BOTH ban lists.
export const PUBLIC_LABELS = Object.freeze({
  exploding: "Taking off",
  rising: "On the rise",
  building: "Getting noticed",
  watch: "Worth watching",
});

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function assertTrendWeights(w = DEFAULT_WEIGHTS) {
  const vals = Object.values(w);
  if (!vals.length) throw new Error("trendScore: weights are empty");
  const sum = vals.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`trendScore: weights must sum to 1, got ${sum}`);
  for (const [k, v] of Object.entries(w)) {
    if (!finite(v) || v < 0) throw new Error(`trendScore: weight ${k} is not a non-negative number`);
    if (!(k in DEFAULT_WEIGHTS)) throw new Error(`trendScore: unknown factor "${k}" — extend DEFAULT_WEIGHTS first`);
  }
  return true;
}
assertTrendWeights();

// Growth normalisation: a log curve so +100% ≈ 0.30, +650% ≈ 0.85, +1000%+ → 1.
// The point is ORDER preservation with diminishing returns, not calibration —
// v1 is a shadow model until first-party feedback (Phase 9) tunes it.
export function normalizeGrowthPct(pct) {
  if (!finite(pct)) return null;
  if (pct <= 0) return 0;
  return clamp01(Math.log10(1 + pct / 100) / Math.log10(11));
}

// Freshness: full credit inside the expected cadence, exponential decay after
// (half-life = one cadence). Mirrors trendRights' staleness posture: old data
// degrades toward zero rather than lying about being current.
export function freshnessFactor(observedAtMs, nowMs, cadenceMs) {
  if (!finite(observedAtMs) || !finite(nowMs)) return null;
  const cad = finite(cadenceMs) && cadenceMs > 0 ? cadenceMs : 7 * 24 * 3600 * 1000;
  const age = Math.max(0, nowMs - observedAtMs);
  if (age <= cad) return 1;
  return clamp01(Math.pow(0.5, (age - cad) / cad));
}

/**
 * Extract the eight factors (each 0..1 or null = absent) from a
 * wf_trend_topics-shaped row plus optional match context.
 * Nothing is invented: a field the row does not carry yields null, never 0.
 */
export function trendFactors(topic, ctx = {}) {
  const t = topic || {};
  const growth = normalizeGrowthPct(finite(t.growth_longterm) ? t.growth_longterm : t.growth12m);
  const velocity = normalizeGrowthPct(finite(t.growth_short) ? t.growth_short : t.growth3m);
  const demand = finite(t.volume_percentile) ? clamp01(t.volume_percentile) : null;
  const localIntent = normalizeGrowthPct(finite(t.near_me_growth) ? t.near_me_growth : ctx.nearMeGrowthPct);
  // Bookability/quality come from MATCHED, VERIFIED inventory only — the
  // caller passes what wf_trend_place_matches proved. Never guessed here.
  const bookability = finite(ctx.bookableShare) ? clamp01(ctx.bookableShare) : null;
  const quality = finite(ctx.matchedQuality) ? clamp01(ctx.matchedQuality / 100) : null;
  const freshness = freshnessFactor(
    finite(t.observedAtMs) ? t.observedAtMs : Date.parse(t.observed_at || ""),
    finite(ctx.nowMs) ? ctx.nowMs : Date.now(),
    ctx.cadenceMs
  );
  let confidence = null;
  const stab = finite(t.stability) ? clamp01(t.stability) : null;
  const vol = finite(t.volatility) ? clamp01(1 - t.volatility) : null;
  if (stab != null || vol != null) confidence = clamp01(((stab != null ? stab : vol) + (vol != null ? vol : stab)) / 2);
  if (confidence != null && finite(ctx.sourceCount) && ctx.sourceCount > 1) {
    confidence = clamp01(confidence + Math.min(0.15, (ctx.sourceCount - 1) * 0.05)); // corroboration, bounded
  }
  return { growth, demand, velocity, localIntent, bookability, quality, freshness, confidence };
}

/**
 * The one formula. factors: 0..1 or null (absent → weight redistributed).
 * Returns { score 0..100, momentum, publicLabel, components, coverage,
 * modelVersion }. With NO factors present at all, the answer is null — a
 * score from nothing would be the fabrication this system exists to prevent.
 */
export function trendMomentumScore(factors, weights = DEFAULT_WEIGHTS, thresholds = MOMENTUM_THRESHOLDS, labels = PUBLIC_LABELS) {
  assertTrendWeights(weights);
  const f = factors || {};
  let presentWeight = 0;
  for (const k of Object.keys(weights)) if (finite(f[k])) presentWeight += weights[k];
  if (presentWeight <= 0) return null;
  let acc = 0;
  const components = {};
  for (const k of Object.keys(weights)) {
    if (!finite(f[k])) continue;
    const v = clamp01(f[k]);
    const w = weights[k] / presentWeight;   // redistribution: present factors share the whole scale
    components[k] = { value: v, effectiveWeight: w };
    acc += v * w;
  }
  const score = Math.round(clamp01(acc) * 100);
  const momentum = score >= thresholds.exploding ? "exploding"
    : score >= thresholds.rising ? "rising"
    : score >= thresholds.building ? "building"
    : "watch";
  return {
    score,
    momentum,
    publicLabel: labels[momentum] || PUBLIC_LABELS.watch,
    components,
    coverage: presentWeight,               // how much of the model the data could speak to
    modelVersion: TREND_SCORE_MODEL_VERSION,
  };
}

/** Convenience: row + context -> scored result (or null when nothing is known). */
export function scoreTrendTopic(topic, ctx = {}, config = {}) {
  return trendMomentumScore(
    trendFactors(topic, ctx),
    config.weights || DEFAULT_WEIGHTS,
    config.thresholds || MOMENTUM_THRESHOLDS,
    config.labels || PUBLIC_LABELS
  );
}
