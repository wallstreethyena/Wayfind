// lib/trendSources/blend.js — merge live signal observations into a topic's
// factor set BEFORE trendMomentumScore runs.
//
// DOCTRINE (same as lib/trendScore.js): missing data is ABSENCE, not zero.
// Signals FILL factors the CSV snapshot could not speak to and REFRESH the
// freshness factor; they never overwrite a factor the snapshot already
// measured — the licensed long-window data stays authoritative where present,
// and live feeds add the short-window and corroboration the CSV cannot.

import { normalizeGrowthPct, freshnessFactor } from "../trendScore.js";

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * factors: the trendFactors() output for the topic row (0..1 or null each).
 * signals: wf_trend_signals-shaped rows for the topic's concept.
 * Returns { factors, sourceCount } — sourceCount is DISTINCT external sources,
 * which is what corroboration means (two rows from one feed corroborate nothing).
 */
export function blendSignalFactors(baseFactors, signals, { nowMs = Date.now(), cadenceMs } = {}) {
  const f = { ...(baseFactors || {}) };
  const sig = (Array.isArray(signals) ? signals : []).filter(Boolean);
  const sources = new Set(sig.map((s) => s.source).filter(Boolean));
  if (!sig.length) return { factors: f, sourceCount: 0 };

  const maxOf = (k) => sig.reduce((a, s) => {
    const v = Number(s[k]);
    return finite(v) && (a == null || v > a) ? v : a;
  }, null);

  const yoy = maxOf("growth_yoy");
  const mom = maxOf("growth_mom");
  const dem = maxOf("demand_index");
  if (!finite(f.growth) && yoy != null) f.growth = normalizeGrowthPct(yoy);
  if (!finite(f.velocity) && mom != null) f.velocity = normalizeGrowthPct(mom);
  if (!finite(f.demand) && dem != null) f.demand = clamp01(dem);

  // Freshness: the freshest corroborated observation speaks for the topic.
  const latest = sig
    .map((s) => Date.parse(s.observed_at || s.observedAt || ""))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (latest) {
    const ff = freshnessFactor(latest, nowMs, cadenceMs);
    if (ff != null && (!finite(f.freshness) || ff > f.freshness)) f.freshness = ff;
  }

  // Corroboration: N independent sources observing the same concept IS
  // confidence evidence. Bounded, and never invented past 0.5 without the
  // snapshot's own stability data.
  if (sources.size > 0) {
    if (finite(f.confidence)) f.confidence = clamp01(f.confidence + Math.min(0.15, sources.size * 0.05));
    else f.confidence = clamp01(Math.min(0.5, 0.3 + sources.size * 0.1));
  }
  return { factors: f, sourceCount: sources.size };
}
