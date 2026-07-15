// lib/score.js — Wayfind Score bands (v6.25). Pure logic, no JSX, so the
// prebuild gate (scripts/test-score-band.mjs) can execute it the way
// check-libs executes lib modules. The badge component (app/components/kit.js
// → WayfindScoreBadge) is a thin view over this.
//
// Scale note: the app stores wfScore on 0–100; every user-facing surface
// divides by 10 (see kit.js scoreLabel). These bands take the DISPLAY scale
// (0–10). Callers convert: toDisplayScore(p.wfScore).
//
// Gap-free inclusive bands (spec 2026-07-14, boundaries are exact):
//   excellent (green)  8.5–10
//   strong    (orange) 7.9–8.49…
//   fair      (yellow) 7.0–7.89…
//   low       (red)    below 7.0

export function getScoreBand(score) {
  if (score >= 8.5) return "excellent";
  if (score >= 7.9) return "strong";
  if (score >= 7.0) return "fair";
  return "low";
}

// Data-boundary validation: reject missing, nonnumeric, NaN, negative, ZERO,
// or >10 values — corrupted scores must never render as real ones, and a zero
// is never a real Wayfind Score (the Bayesian floor is ~3.5; a 0 only ever
// means "unrated", which rendered as a red 0.0/10 badge — v6.34). Callers show
// nothing (or "Score pending" where eligibility rules already say so).
export function isValidScore(score) {
  return typeof score === "number" && isFinite(score) && score > 0 && score <= 10;
}

/**
 * 0–100 wfScore → display score (0–10, one decimal as a NUMBER), or null.
 * Total function over untrusted data: accepts a number or a numeric string,
 * and returns null for null / undefined / NaN / Infinity / empty / non-numeric
 * / out-of-range. null is the single "no valid score" signal — callers render
 * "Score pending", never a fabricated 0. Never throws.
 */
export function toDisplayScore(wf) {
  let n = wf;
  if (typeof n === "string") {
    const t = n.trim();
    if (t === "") return null;
    n = Number(t); // "85" → 85, "8.5" → 8.5, "abc" → NaN
  }
  if (typeof n !== "number" || !isFinite(n)) return null;
  const s = Math.round((n / 10) * 10) / 10;
  return isValidScore(s) ? s : null;
}

// Design tokens (spec) — the four band colors + shared badge surfaces.
export const SCORE_TOKENS = {
  green: "#25C26E",
  orange: "#FF6B18",
  yellow: "#F2C94C",
  red: "#E5484D",
  bg: "#121A29",
  text: "#FFFFFF",
  muted: "#AEB8CA",
};

export const BAND_COLOR = {
  excellent: SCORE_TOKENS.green,
  strong: SCORE_TOKENS.orange,
  fair: SCORE_TOKENS.yellow,
  low: SCORE_TOKENS.red,
};

// Yellow needs a dark pin glyph for contrast; every other band uses white.
export function pinGlyphColor(band) {
  return band === "fair" ? SCORE_TOKENS.bg : "#FFFFFF";
}

// "Wayfind Pick" gate: never on fair/low (yellow/red). The stricter suggested
// gate (≥8.5 + high confidence + fresh data) belongs to the ranking-integrity
// track (WORK_ORDER Track 2) where confidence becomes a real field.
export function pickEligibleByScore(score) {
  if (!isValidScore(score)) return false;
  const band = getScoreBand(score);
  return band === "excellent" || band === "strong";
}
