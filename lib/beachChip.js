// lib/beachChip.js — one-line beach-rail chip bits.
//
// Water QUALITY comes from wf_beach_water (FL Healthy Beaches): result
// Good/Moderate/Poor, advisory, sampled_at. Waves are a marine observation
// and must not stand in for quality. No row → no quality AND no waves.
// Stale >7d may show "last known", matching app/best-beaches/[metro]/parts.js.
// Never invent a score. Never call EPA.

const QUALITY = new Set(["Good", "Moderate", "Poor"]);
const STALE_MS = 7 * 86400000;

export function waterQualityBit(water, now = Date.now()) {
  if (!water || typeof water !== "object") return null;
  let label = null;
  if (water.advisory) label = "Advisory";
  else if (QUALITY.has(water.result)) label = water.result;
  if (!label) return null;
  if (water.sampled_at) {
    const t = new Date(water.sampled_at).getTime();
    if (Number.isFinite(t) && now - t > STALE_MS) return label + " (last known)";
  }
  return label;
}

/** Marine temp/wind plus mapped quality. Waves are never included. */
export function formatBeachChipBits(marine, water, now = Date.now()) {
  const c = marine && typeof marine === "object" ? marine : {};
  const bits = [];
  if (c.waterTempF != null && Number.isFinite(Number(c.waterTempF))) {
    bits.push("water " + Math.round(Number(c.waterTempF)) + "°");
  }
  const q = waterQualityBit(water, now);
  if (q) bits.push(q);
  if (c.windMph != null && Number.isFinite(Number(c.windMph))) {
    bits.push("wind " + c.windMph + " mph" + (c.windDir ? " " + c.windDir : ""));
  }
  return bits;
}
