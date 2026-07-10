// The Wayfind Compass — Wayfind's own score identity. One blended number
// (0-10, one decimal) built from every platform we actually have data for,
// and a tier the icon color announces before anyone reads the number:
//
//   gold    "True North"  9.3+, 500+ total reviews, 2+ platforms agreeing —
//                         the certification that can't be faked. Scarce by
//                         design: only True North gets its name on the card.
//   emerald "Standout"    8.6 – 9.2
//   slate   "Solid"       7.6 – 8.5
//   (below 7.6 the score shows plain — no tier, no color, no spin)
//
// HONESTY CONTRACT: every input is a real platform rating with its real
// review count; the blend is review-weighted consensus with the same
// Bayesian small-sample shrink the ranking engine uses (a 5.0 from eight
// people can never outrank — or out-tier — a proven 4.7 from thousands).
// The receipts sheet shows each platform's native rating as plain text.

export const COMPASS_TIERS = {
  truenorth: { name: "True North", color: "#E8B84B", bg: "rgba(232,184,75,.16)" },
  standout: { name: "Standout", color: "#34D399", bg: "rgba(16,185,129,.14)" },
  solid: { name: "Solid", color: "#A8B3C5", bg: "rgba(139,149,168,.15)" },
};

// Calibration knobs (see scripts/check-compass.mjs and the live calibration
// report): if more than ~10% of rated places ever earn gold, GOLD_MIN goes up.
export const GOLD_MIN = 9.3;
export const GOLD_MIN_REVIEWS = 500;
export const GOLD_MIN_PLATFORMS = 2;

// Every platform reading we hold for this place, normalized for the blend but
// carrying its native display form for the receipts sheet. `ta` is the cached
// Tripadvisor enrichment ({rating, reviews}) when the detail sheet has it.
export function compassSources(p, ta) {
  if (!p) return [];
  const src = [];
  const fsqOnly = /^fsq:/.test(String(p.id || ""));
  if (p.rating != null) {
    src.push(fsqOnly
      ? { key: "fsq", label: "Foursquare", r5: p.rating, reviews: p.reviews || 0, native: (p.rating * 2).toFixed(1) + " / 10" }
      : { key: "google", label: "Google", r5: p.rating, reviews: p.reviews || 0, native: "★ " + p.rating });
  }
  if (!fsqOnly && p.fsqRating != null) src.push({ key: "fsq", label: "Foursquare", r5: p.fsqRating, reviews: p.fsqReviews || 0, native: (p.fsqRating * 2).toFixed(1) + " / 10" });
  if (ta && ta.rating != null && !ta.none) src.push({ key: "ta", label: "Tripadvisor", r5: ta.rating, reviews: ta.reviews || 0, native: "● " + ta.rating });
  return src;
}

// Blend → { s10, tier, platforms, reviews, sources } or null when unrated.
// Consensus is weighted by evidence (sqrt of raters, capped so one giant
// platform can't fully silence the others), then shrunk toward the global
// mean exactly like wayfindScore so thin samples stay humble.
export function compassScore(p, ta) {
  const src = compassSources(p, ta);
  if (!src.length) return null;
  let wsum = 0, rsum = 0, n = 0;
  for (const s of src) {
    const w = Math.sqrt(Math.min(Math.max(s.reviews || 0, 25), 5000));
    wsum += w; rsum += s.r5 * w; n += s.reviews || 0;
  }
  if (!wsum) return null;
  const r = rsum / wsum;
  const m = 60, C = 3.9;
  const bayes = (n / (n + m)) * r + (m / (n + m)) * C;
  const s10 = Math.round(bayes * 20) / 10;
  const platforms = new Set(src.map((s) => s.key)).size;
  // "2+ platforms AGREEING" means agreeing: a platform only counts toward
  // certification if it independently reads excellent (4.4+/5) on a real
  // sample (25+ raters). A 4.8 Google next to a 4.3 Tripadvisor is a
  // disagreement — Standout, not True North.
  const agreeing = new Set(src.filter((s) => s.r5 >= 4.4 && (s.reviews || 0) >= 25).map((s) => s.key)).size;
  let tier = null;
  if (s10 >= GOLD_MIN && n >= GOLD_MIN_REVIEWS && agreeing >= GOLD_MIN_PLATFORMS) tier = "truenorth";
  else if (s10 >= 8.6) tier = "standout";
  else if (s10 >= 7.6) tier = "solid";
  return { s10, tier, platforms, reviews: n, sources: src };
}
