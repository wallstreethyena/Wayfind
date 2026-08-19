// lib/beachChip.js — one-line beach-rail chip bits.
//
// Water QUALITY comes from wf_beach_water (FL Healthy Beaches): result
// Good/Moderate/Poor, advisory, sampled_at. Waves are a marine observation
// and must not stand in for quality. No row → no quality AND no waves.
// Stale >7d may show "last known", matching app/best-beaches/[metro]/parts.js.
// Never invent a score. Never call EPA.

const QUALITY = new Set(["Good", "Moderate", "Poor"]);
const STALE_MS = 7 * 86400000;

// v8.19 — PLAIN LANGUAGE (owner: "what does Moderate mean in comparison to a
// clear? We need to be able to tell the user that is looking at this for the
// first time: this is great water quality, this is not so great"). The bare
// lab words (Good/Moderate/Poor — FL Healthy Beaches Enterococcus bands)
// meant nothing to a first-time reader, and "Moderate" collided with the
// price word on the same card. Each band now SAYS what it means for a swim.
// The DB vocabulary is untouched — this is a display mapping, one place.
export const WATER_PLAIN = {
  Good: "Clear — great for swimming",
  Moderate: "Fair — fine for a swim",
  Poor: "Poor — skip the swim",
  Advisory: "Advisory — no swimming today",
};
// Severity → chip color, exported so every water chip shades the same way
// (green is a claim, amber is a caution, red is a warning).
export const WATER_TONE = { Good: "#4ADE80", Moderate: "#FBBF24", Poor: "#F87171", Advisory: "#F87171" };

/** The severity KEY (Good/Moderate/Poor/Advisory) or null — for color. */
export function waterQualityKey(water) {
  if (!water || typeof water !== "object") return null;
  if (water.advisory) return "Advisory";
  return QUALITY.has(water.result) ? water.result : null;
}

export function waterQualityBit(water, now = Date.now()) {
  const key = waterQualityKey(water);
  if (!key) return null;
  const label = WATER_PLAIN[key];
  if (water.sampled_at) {
    const t = new Date(water.sampled_at).getTime();
    if (Number.isFinite(t) && now - t > STALE_MS) return label + " (last known)";
  }
  return label;
}

/** Mapped quality first (the claim), then temp and wind. Waves never. */
export function formatBeachChipBits(marine, water, now = Date.now()) {
  const c = marine && typeof marine === "object" ? marine : {};
  const bits = [];
  const q = waterQualityBit(water, now);
  if (q) bits.push(q);
  if (c.waterTempF != null && Number.isFinite(Number(c.waterTempF))) {
    bits.push("water " + Math.round(Number(c.waterTempF)) + "°");
  }
  if (c.windMph != null && Number.isFinite(Number(c.windMph))) {
    bits.push("wind " + c.windMph + " mph" + (c.windDir ? " " + c.windDir : ""));
  }
  return bits;
}
