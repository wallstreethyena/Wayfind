// lib/beachDecision.js — today's beach decision, water quality first.
// Current FL Healthy Beaches evidence decides the band; the governed Wayfind
// Score orders beaches only inside the same band. Missing evidence is never
// treated as good or bad, and samples older than 14 days are non-decisional.

const DECISION_FRESH_MS = 14 * 86400000;

function sampleIsCurrent(water, now) {
  const t = water && water.sampled_at ? new Date(water.sampled_at).getTime() : NaN;
  return Number.isFinite(t) && t <= now + 86400000 && now - t <= DECISION_FRESH_MS;
}

export function beachWaterBand(water, now = Date.now()) {
  if (!water || typeof water !== "object" || !sampleIsCurrent(water, now)) return "unknown";
  if (water.advisory === true) return "advisory";
  const result = String(water.result || "").toLowerCase();
  return result === "good" || result === "moderate" || result === "poor" ? result : "unknown";
}

const BAND_RANK = { good: 4, moderate: 3, unknown: 2, poor: 1, advisory: 0 };

function scoreOf(row) {
  const n = Number(row && (row.governed_score ?? row.wfScore ?? row.wf));
  return Number.isFinite(n) ? n : -1;
}

export function rankBeachesForToday(rows, now = Date.now()) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const water = BAND_RANK[beachWaterBand(b.row && b.row.water, now)] - BAND_RANK[beachWaterBand(a.row && a.row.water, now)];
      if (water) return water;
      const score = scoreOf(b.row) - scoreOf(a.row);
      if (score) return score;
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

export function beachDecisionReason(water, now = Date.now()) {
  const band = beachWaterBand(water, now);
  if (band === "good") return "Top choice today: current water sample is good.";
  if (band === "moderate") return "Current water sample is moderate; higher-quality water was not available nearby.";
  if (band === "poor") return "Current water sample is poor; consider staying out of the water.";
  if (band === "advisory") return "Health advisory: do not swim today.";
  return null;
}
