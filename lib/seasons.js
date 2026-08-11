// lib/seasons.js — the Seasonal Picks hero (v6.52).
//
// Owner: talking to a friend (Cindy) about wanting a vineyard and apple
// picking in the fall, and wanting the app to surface that kind of thing
// automatically — "seasonal events... choices based on current season."
// Two asks, both scoped here:
//   1. A dedicated hero card that names the season and shows what fits it.
//   2. Ranking those results with a seasonal-fit boost ON TOP OF rating —
//      the same bounded-nudge pattern every other mood already uses
//      (see outdoors.boost in app/home.js: never replaces wfScore, only
//      reorders within it). This module owns that boost so it is pure and
//      unit-testable, same reasoning as lib/taste.js's affinityFor.
//
// Deliberately NOT wired into general Food/Nightlife/Things-to-do ranking —
// only the new Seasonal Picks experience uses this. That is a scope decision,
// not an oversight: nudging every rail in the app by season is a much bigger
// behavior change than what was asked for, and can be widened later on its
// own if wanted.
//
// Every Wayfind market is in the continental US, so seasons are fixed to the
// Northern Hemisphere. Meteorological (calendar-month) seasons are used
// instead of the astronomical equinox/solstice dates — matches how "fall
// picks" is understood colloquially and needs no date-math beyond the month.
import { siteAnchorDate } from "./siteTime.js";

export const SEASONS = ["winter", "spring", "summer", "fall"];

// heroImage: a real photo for the hero-rail slide + the opened sheet's header
// (see LocalPlanHeroCard / openExpSheet in app/home.js). Optional per season —
// only summer has one so far (owner-supplied stock photo); the others keep
// the gradient+icon fallback until real seasonal photography exists for them
// too. Never fabricate a photo for a season that doesn't have one.
export const SEASON_META = {
  winter: { label: "Winter", emoji: "❄️", color: "#7DD3FC" },
  spring: { label: "Spring", emoji: "🌸", color: "#86EFAC" },
  summer: { label: "Summer", emoji: "☀️", color: "#FBBF24", heroImage: "/cards/summer-seasonal-adobestock-62707647.jpeg" },
  fall: { label: "Fall", emoji: "🍂", color: "#F97316" },
};

export function currentSeason(d) {
  // v6.97: default to the ET-anchored calendar day (lib/siteTime.js), not the
  // runtime's local clock. On Vercel (UTC) the local read flipped the season a
  // few hours early at every boundary, and disagreed with nowContext's
  // ET-anchored season during that window — two answers to "what season is it"
  // on one screen. An explicitly-passed Date keeps its local-parts read.
  const m = (d instanceof Date ? d : siteAnchorDate()).getMonth(); // 0 = January
  if (m === 11 || m === 0 || m === 1) return "winter"; // Dec, Jan, Feb
  if (m >= 2 && m <= 4) return "spring"; // Mar, Apr, May
  if (m >= 5 && m <= 7) return "summer"; // Jun, Jul, Aug
  return "fall"; // Sep, Oct, Nov
}

// {cat, keyword} pairs — the exact shape every multi-query experience in
// app/home.js already uses (see EXPERIENCES.outdoors). Deliberately broad: a
// market with no apple orchard just returns nothing for that one query, which
// is honest — this codebase never fabricates a result to fill a thin list
// (same principle as the Atlas editorial gate and the curated-picks rule).
const SEASON_QUERIES = {
  fall: [
    { cat: "attractions", keyword: "pumpkin patch" },
    { cat: "attractions", keyword: "corn maze" },
    { cat: "attractions", keyword: "apple orchard u-pick" },
    { cat: "food", keyword: "vineyard winery" },
    { cat: "attractions", keyword: "fall festival harvest festival" },
    { cat: "food", keyword: "cider mill apple cider" },
  ],
  winter: [
    { cat: "attractions", keyword: "holiday lights christmas lights display" },
    { cat: "attractions", keyword: "ice skating rink" },
    { cat: "shopping", keyword: "holiday market christmas market" },
    { cat: "attractions", keyword: "winter festival" },
    { cat: "food", keyword: "hot chocolate cozy cafe" },
  ],
  spring: [
    { cat: "attractions", keyword: "botanical garden flower festival" },
    { cat: "attractions", keyword: "cherry blossom bloom" },
    { cat: "shopping", keyword: "farmers market spring market" },
    { cat: "attractions", keyword: "spring festival outdoor event" },
    { cat: "attractions", keyword: "nature trail wildflowers" },
  ],
  summer: [
    { cat: "beach", keyword: "" },
    { cat: "attractions", keyword: "water park splash pad" },
    { cat: "food", keyword: "ice cream shaved ice" },
    { cat: "attractions", keyword: "outdoor pool lake" },
    { cat: "attractions", keyword: "summer festival outdoor concert" },
  ],
};
export function seasonQueries(season = currentSeason()) {
  return SEASON_QUERIES[season] || SEASON_QUERIES.fall;
}

// Fit scoring is independent of which query surfaced a result — Google's text
// search is fuzzy enough that a "vineyard" query can return an unrelated
// restaurant that merely mentions wine on its menu. Matching the RESULT's own
// name/types is what keeps the boost honest per-place, not just per-query.
const SEASON_FIT_RX = {
  fall: /pumpkin|corn maze|orchard|apple.?pick|vineyard|winery|harvest|fall festival|\bcider\b/i,
  winter: /holiday light|christmas|ice.?skat|holiday market|winter festival|\bsanta\b/i,
  spring: /botanical|flower festival|cherry blossom|\bbloom\b|farmers market|wildflower/i,
  summer: /\bbeach\b|water park|splash pad|shaved ice|\bpool\b|\blake\b|summer festival/i,
};

// A bounded nudge — same spirit and same rough magnitude as every other
// exp.boost in app/home.js (Great Outdoors' weather boost tops out at 22):
// strong enough to lift a genuine seasonal match above a slightly
// higher-rated place with nothing to do with the season, never strong enough
// to bury a great pick that just isn't seasonal. This is ranking "on top of
// rating," never a replacement for it — wfScore is untouched.
export function seasonalFit(place, season = currentSeason()) {
  if (!place) return 0;
  const rx = SEASON_FIT_RX[season];
  if (!rx) return 0;
  const hay = ((place.name || "") + " " + (Array.isArray(place.types) ? place.types.join(" ") : "")).toLowerCase();
  return rx.test(hay) ? 20 : 0;
}
