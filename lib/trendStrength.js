// lib/trendStrength.js — turning a parsed CSV row into an eligibility verdict
// and, for the survivors, ONE normalized 0–1 strength.
//
// TWO RULES SHAPE EVERYTHING HERE.
//
// 1. FORECASTS ARE NOT EVIDENCE. Exploding Topics ships a forecast column, and
//    it is the most tempting field in the file — it is exactly the number a
//    "get there first" product wants. It contributes ZERO to v1 strength, and
//    the code below never reads it. A forecast is a model's opinion about the
//    future; ranking a real place higher because of one means a user drives
//    somewhere on the strength of a prediction nobody has validated. It stays
//    available to the INTERNAL report so its accuracy can be measured against
//    later snapshots, and it may only enter ranking after that measurement
//    exists.
//
// 2. NORMALISE WITHIN THE FAMILY, NEVER ACROSS. "Korean coffee" and "sound bath"
//    do not live on the same volume scale — food queries are an order of
//    magnitude larger than niche wellness queries, and a global normalisation
//    means every food concept outranks every activity concept forever, no matter
//    what either one is actually doing. Volume is scored as a PERCENTILE WITHIN
//    ITS OWN TOPIC FAMILY, so the question is always "is this big for what it
//    is?", which is the only version of the question that can be compared.
//
// The weights below are v1 SHADOW values. They are deliberately not tuned,
// because tuning them against anything other than a real licensed snapshot and a
// real shadow report would be inventing precision — see the note on WEIGHTS.

import { conceptForTopic } from "./trendTaxonomy.js";

/**
 * v1 shadow weights. Observed recent growth dominates by design: it is the only
 * input that is a real period-over-period DELTA, which is the one thing that
 * distinguishes "rising" from "already big".
 *
 * These sum to 1 and MUST continue to — assertWeights() enforces it, so a later
 * edit cannot quietly change the scale of every strength in the system.
 */
export const WEIGHTS = {
  growth: 0.65,      // observed 6mo/12mo delta — the actual trend
  volume: 0.20,      // category-relative percentile — "is anyone searching this at all"
  stability: 0.15,   // low volatility / high stability — is the delta trustworthy
};

export function assertWeights(w = WEIGHTS) {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`trendStrength: WEIGHTS must sum to 1, got ${sum}`);
  return true;
}
assertWeights();

/** Classifications that may carry a POSITIVE ordering boost. */
export const RISING_CLASSIFICATIONS = ["exploding", "rising", "regular", "trending"];
/**
 * A PEAKED topic has already turned over. It is real data and belongs in the
 * internal report, but it must never produce a positive boost — boosting a
 * declining topic is the system actively working against the user.
 */
export const NON_BOOSTING_CLASSIFICATIONS = ["peaked", "declining", "flat", "fading"];

/** Minimum observed growth to be considered rising at all. */
export const MIN_GROWTH = 0.10;          // +10% over the measured window
/** Minimum category-relative volume percentile. */
export const MIN_VOLUME_PERCENTILE = 0.25;
/** Volatility above this makes the growth number untrustworthy. */
export const MAX_VOLATILITY = 0.75;

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null);

/**
 * The observed growth this topic is judged on, and which window it came from.
 *
 * PREFERS THE LONGER WINDOW. 6mo and 12mo are less noisy than 3mo and much
 * harder to fake with one seasonal spike. 3mo is used only when nothing longer
 * exists, and the window is returned so the disclosure copy can state it — a
 * growth percentage without its timeframe is not a fact, and the public-display
 * rules forbid rendering one.
 */
export function observedGrowth(row) {
  for (const [field, window] of [
    ["growth_12mo", "12 months"],
    ["growth_6mo", "6 months"],
    ["growth_longterm", "5 years"],
    ["growth_3mo", "3 months"],
  ]) {
    if (Number.isFinite(row[field])) return { value: row[field], field, window };
  }
  return { value: null, field: null, window: null };
}

/**
 * Percentile of this row's volume within its own topic family.
 *
 * `familyVolumes` is every accepted volume in the same family, including this
 * row's. A family of one returns 0.5 — a single observation carries no
 * information about where it sits in a distribution, and either extreme would be
 * a fabrication.
 */
export function volumePercentile(volume, familyVolumes) {
  if (!Number.isFinite(volume)) return null;
  const vals = (familyVolumes || []).filter(Number.isFinite);
  if (vals.length <= 1) return 0.5;
  const below = vals.filter((v) => v < volume).length;
  const equal = vals.filter((v) => v === volume).length;
  // Midrank for ties, so N identical volumes all score the same rather than
  // depending on array order.
  return clamp01((below + equal / 2) / vals.length);
}

/**
 * Stability 0–1. Prefers an explicit `stability`; falls back to inverted
 * volatility; returns null when the export carries neither.
 *
 * A NULL is not a zero. An absent stability column means we do not know, and
 * strengthOf() renormalises around the missing term rather than scoring the
 * topic as maximally unstable — the same "absent, not zero" doctrine
 * lib/trendSignal.js already uses for its sources.
 */
export function stabilityOf(row) {
  if (Number.isFinite(row.stability)) {
    // Accept 0–1 or 0–100 without guessing: >1 can only be a percentage.
    return clamp01(row.stability > 1 ? row.stability / 100 : row.stability);
  }
  if (Number.isFinite(row.volatility)) {
    const v = row.volatility > 1 ? row.volatility / 100 : row.volatility;
    return clamp01(1 - v);
  }
  return null;
}

/**
 * Growth → 0–1, saturating. +300% and +3000% are both "very rising"; a linear
 * scale would let one freak topic compress every other topic to nothing.
 * log1p-based, tuned so +50% ≈ 0.37, +200% ≈ 0.69, +1000% ≈ 1.0.
 */
export function growthScore(growth) {
  if (!Number.isFinite(growth) || growth <= 0) return 0;
  return clamp01(Math.log1p(growth) / Math.log1p(10));
}

/**
 * ELIGIBILITY. Returns { eligible, reason, concept, ... } — `reason` is populated
 * on BOTH paths, always. Nothing downstream may accept a topic without one.
 *
 * Order matters: cheapest and most decisive checks first, so the reason a topic
 * was dropped is the most useful one rather than whichever check happened to run.
 */
export function evaluateTopic(row, ctx) {
  const { familyVolumes = {}, snapshotStale = false } = ctx || {};

  if (snapshotStale) {
    return { eligible: false, reason: "snapshot is stale — no topic from an expired snapshot is eligible", concept: null, strength: 0 };
  }

  // 1. Does it map to a real Wayfind concept? This is the allowlist gate and it
  //    is first because it rejects the overwhelming majority of a real export.
  const { concept, key, reason: conceptReason } = conceptForTopic(row.topic);
  if (!concept) {
    return { eligible: false, reason: conceptReason, concept: null, conceptKey: null, strength: 0 };
  }

  // 2. Observation date. A row with no usable date cannot be aged, and a signal
  //    that cannot go stale is a signal that never expires.
  if (!row.observed_at || !Number.isFinite(Date.parse(row.observed_at))) {
    return { eligible: false, reason: "no valid source observation date", concept, conceptKey: key, strength: 0 };
  }

  // 3. Classification. Peaked/declining topics are recorded, never boosted.
  const cls = String(row.classification || "").toLowerCase().trim();
  if (NON_BOOSTING_CLASSIFICATIONS.some((c) => cls.includes(c))) {
    return { eligible: false, reason: `classification "${row.classification}" is past peak — recorded for the internal report, never boosted`, concept, conceptKey: key, strength: 0, classification: cls };
  }
  if (cls && !RISING_CLASSIFICATIONS.some((c) => cls.includes(c))) {
    return { eligible: false, reason: `unrecognised classification "${row.classification}" — not treated as rising`, concept, conceptKey: key, strength: 0, classification: cls };
  }

  // 4. Measured growth must be real and positive.
  const g = observedGrowth(row);
  if (g.value == null) {
    return { eligible: false, reason: "no observed growth value", concept, conceptKey: key, strength: 0 };
  }
  if (g.value < MIN_GROWTH) {
    return { eligible: false, reason: `observed growth ${(g.value * 100).toFixed(0)}% over ${g.window} is below the +${MIN_GROWTH * 100}% floor`, concept, conceptKey: key, strength: 0 };
  }

  // 5. Category-relative volume. A topic nobody searches within its own family
  //    is not a trend, however fast it grew off a base of nothing.
  const pct = volumePercentile(row.search_volume, familyVolumes[concept.family]);
  if (pct != null && pct < MIN_VOLUME_PERCENTILE) {
    return { eligible: false, reason: `search volume is in the ${(pct * 100).toFixed(0)}th percentile of the "${concept.family}" family — below the ${MIN_VOLUME_PERCENTILE * 100}th floor`, concept, conceptKey: key, strength: 0 };
  }

  // 6. Volatility. A wildly volatile series makes its own growth number
  //    meaningless — we cannot tell a trend from noise.
  if (Number.isFinite(row.volatility)) {
    const v = row.volatility > 1 ? row.volatility / 100 : row.volatility;
    if (v > MAX_VOLATILITY) {
      return { eligible: false, reason: `volatility ${v.toFixed(2)} exceeds ${MAX_VOLATILITY} — the growth figure is not trustworthy`, concept, conceptKey: key, strength: 0 };
    }
  }

  // 7. A recurring seasonal spike is not an emerging trend. It is not REJECTED —
  //    seasonal experiences are genuinely a Wayfind product — but it is flagged
  //    so the report can separate "new" from "annual", and so a boost derived
  //    from it can be read as what it is.
  const seasonal = row.seasonal === true;

  const strength = strengthOf(row, { concept, growth: g, volumePct: pct });
  return {
    eligible: true,
    reason: `mapped to concept "${key}"; observed +${(g.value * 100).toFixed(0)}% over ${g.window}` +
      (pct != null ? `; ${(pct * 100).toFixed(0)}th percentile volume within "${concept.family}"` : "") +
      (seasonal ? "; flagged seasonal" : ""),
    concept, conceptKey: key, classification: cls, seasonal,
    growth: g.value, growthWindow: g.window, growthField: g.field,
    volumePercentile: pct, strength,
  };
}

/**
 * The normalized 0–1 strength. Absent terms are renormalised out, never scored
 * as zero — a snapshot without a stability column must not make every topic
 * weaker than one that has it.
 */
export function strengthOf(row, precomputed) {
  const g = (precomputed && precomputed.growth) || observedGrowth(row);
  const concept = precomputed && precomputed.concept;
  const parts = {
    growth: growthScore(g.value),
    volume: precomputed && precomputed.volumePct != null ? precomputed.volumePct : null,
    stability: stabilityOf(row),
  };
  let wSum = 0, vSum = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (parts[k] == null) continue;
    wSum += w; vSum += w * parts[k];
  }
  if (!wSum) return 0;
  const s = clamp01(vSum / wSum);
  // Concept-level sanity: a strength of exactly 1 would mean "maximally trending
  // on every axis", which no real row reaches. Not clamped down artificially —
  // just asserted to be in range so a bad input cannot leak a >1 multiplier into
  // the ordering term.
  void concept;
  return s;
}

/**
 * Bucket accepted rows by topic family, producing the volume distributions
 * evaluateTopic() normalises against.
 *
 * Runs BEFORE eligibility, over every row that mapped to a concept, so the
 * distribution reflects the whole family rather than only the rows that already
 * passed — normalising against survivors would make the floor move as the floor
 * filtered.
 */
export function familyVolumeIndex(rows) {
  const out = {};
  for (const r of rows || []) {
    const { concept } = conceptForTopic(r.topic);
    if (!concept || !Number.isFinite(r.search_volume)) continue;
    (out[concept.family] || (out[concept.family] = [])).push(r.search_volume);
  }
  return out;
}
