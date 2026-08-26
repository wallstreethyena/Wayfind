// lib/score.js — Wayfind Score bands (v6.25). Pure logic, no JSX, so the
// prebuild gate (scripts/test-score-band.mjs) can execute it the way
// check-libs executes lib modules. The badge component (app/components/kit.js
// → WayfindScoreBadge) is a thin view over this.
//
// Scale note: the app stores wfScore on 0–100; every user-facing surface
// divides by 10 (see kit.js scoreLabel). These bands take the DISPLAY scale
// (0–10). Callers convert: toDisplayScore(p.wfScore).
//
// Gap-free inclusive bands (owner spec 2026-07-25, boundaries are exact):
//   excellent (green)  9.0–10
//   strong    (orange) 8.0–8.99…
//   fair      (yellow) 7.0–7.99…
//   low       (red)    below 7.0

export function getScoreBand(score) {
  if (score >= 9.0) return "excellent";
  if (score >= 8.0) return "strong";
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

// ── v6.39: the GLOBAL card-completeness guardrail (owner directive) ─────────
// A card that cannot say what it is has no business rendering, anywhere.
// PlaceCard calls this before painting; scripts/test-card-gate.mjs locks the
// contract so no future data source (inventory unions, new APIs, imports) can
// leak ghost cards again. Pure + leaf-importable by design.
// v8.48 — THE QUALITY-SIGNAL RULE, extracted so the SERVER can apply the same
// test the card applies. FREE MODE (2026-08-25) shipped a Text Search Pro mask
// that omits rating/userRatingCount because they are Enterprise-billed, on the
// stated assumption that "rating absent => the score chip hides". That is not
// what the law below does: a row with no rating signal does not lose its chip,
// it loses its whole CARD. So every lean row Google returned was counted by the
// feed and rendered by nothing — "That's all 21 spots" over an empty list, on
// every category, site-wide. A predicate that lives in one place cannot drift
// between the tier that produces rows and the tier that refuses them.
//
// Shape-agnostic on purpose: app-shaped rows carry `reviews`, raw Google (New)
// rows carry `userRatingCount`, and both are legitimate callers.
export function hasScoreSignal(p) {
  if (!p) return false;
  const rating = Number(p.rating);
  const reviews = Number(p.reviews != null ? p.reviews : p.userRatingCount);
  return (isFinite(rating) && rating > 0) || (isFinite(reviews) && reviews > 0);
}

export function cardComplete(p) {
  if (!p || !p.id) return false;
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (!name) return false;
  // v6.40 (owner directive): every rendered card carries the Wayfind Score.
  // A photo alone no longer qualifies — a named card with no rating signals
  // renders Score-less ("makes the user second-guess"), so it does not render
  // at all. Rating/review volume is what the Score is computed from; either
  // field name (app-shaped `reviews` or raw Google `userRatingCount`) counts.
  return hasScoreSignal(p);
}

// v8.62 — THE ADAPTIVE-RADIUS LADDER MUST COUNT WHAT THE FEED CAN SHOW.
//
// Live incident (owner, Parrish > Activities > Beaches, 2026-08-26): the
// inventory serve returned 32 real beaches, the page rendered ONE, and the
// auto-widen ladder never ran. The serve's distance gate is radius*1.15
// (rankInventory) on a server radius that itself snaps UP the cost ladder —
// so rows arrive from ~23 miles out — but the browse view admits only
// `distMi <= sliderMi` (17 by default), and every real Gulf beach near
// inland Parrish sits at 17.5–20 miles. The ladder compared ADAPT_MIN
// against the RAW fetch (32 ≥ 8) and declared the feed full while the view
// drew one card. Same defect class as v8.48's law: a count and its list
// must come from ONE array — here the adequacy count and the rendered list
// disagreed about which rows exist.
//
// This is that one array's admission rule, shared: what the browse view
// renders is cardComplete rows within the display radius (with the ≥60mi
// slider escape the view has always had). The ladder breaks on THIS number,
// so a chip whose visible shelf is thin actually widens — which is the whole
// reason the ladder exists.
export function displayableAt(list, radiusM) {
  const mi = Math.round((Number(radiusM) || 0) / 1609.34);
  return (list || []).filter(
    (p) => p && cardComplete(p) && (mi >= 60 || p.distMi == null || p.distMi <= mi)
  ).length;
}
