// lib/nightlifeRail.js — eligibility + ordering for the "top rated" nightlife rail.
//
// Pure and node-testable. scripts/test-nightlife-ranking.mjs locks every rule here.
//
// WHY THIS IS NOT "ORDER BY STARS"
// Ordering by rating alone reproduces the bug PR #390 fixed. wayfindScore is a
// Bayesian average, and a Bayesian prior can only pull LOW-volume places DOWN
// toward the mean — it can never lift a 4.6 with 251,175 reviews above a 5.0
// with 26. Orlando ordered by displayed score once returned an escape room, a
// day spa and a 273-review bar above Magic Kingdom.
//
// So the rail has two independent gates and one ordering:
//   1. railFloorFor()   — a MARKET-RELATIVE eligibility floor (noise removal)
//   2. isNightlifeVenue — is this actually a nightlife venue, or a restaurant
//      that happens to hold a liquor licence
//   3. railProminence   — quality x reach, not stars

// ── 1. the floor ──────────────────────────────────────────────────────────
// DERIVED, not chosen. Orlando nightlife candidate pool (195 operational venues,
// Google Places, 2026-07-29): p10 233, p25 505, median 1,270, max 38,105.
// 250 sits just above the market's 10th percentile and just below Timucua Arts
// Foundation (292), the least-reviewed venue on the owner's coverage seed — so
// it removes the noise floor without removing anything hand-named.
//
// This number is ORLANDO-CALIBRATED. A floor derived from this market's review
// density will behave differently in a thin market, and the rail will not tell
// you when it does. Re-derive per market before reusing it.
//
// It coincidentally equals REL_FLOOR_MAX in lib/marketFloor.js. That is a
// COINCIDENCE, not a shared meaning — marketFloor's is the upper bound of a
// clamp for a different job. Importing it would couple this rail to a constant
// someone will tune for market-floor reasons and the rail would move silently.
// Reuse the number, never the identifier.
// RAIL_FLOOR_CAP — no market gets a floor stricter than Orlando's.
// RAIL_FLOOR_MIN — BREAK 3 in #412 proved this bound must exist: with the floor
// at 20 a 30-review speakeasy reached the rail. A thin market gets a low floor,
// never no floor.
export const RAIL_FLOOR_CAP = 250;
export const RAIL_FLOOR_MIN = 60;
export const RAIL_FLOOR_PERCENTILE = 0.10;

/**
 * MARKET-RELATIVE floor. Derived from the market's OWN nightlife pool, the way
 * marketReviewFloor already is — not a constant, and not a per-city table
 * somebody has to maintain.
 *
 * A flat 250 was calibrated on Orlando (p10 233, p25 505, median 1,270). Applied
 * to a thin market it silently guts the rail, and the rail does not report that
 * it did. One constant, two bounds, no configuration.
 *
 *   Orlando  p10 233 -> 233   (lands where the old flat 250 effectively sat)
 *   thin     p10  40 ->  60   (clamped up: the speakeasy still stays out)
 *   dense    p10 900 -> 250   (clamped down: no market is stricter than Orlando)
 */
export function railFloorFor(pool) {
  const counts = (pool || [])
    .map((p) => (p && p.reviews != null ? p.reviews : (p && p.userRatingCount) || 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (counts.length < 5) return RAIL_FLOOR_MIN; // too thin to infer a bar
  const p10 = counts[Math.floor(counts.length * RAIL_FLOOR_PERCENTILE)];
  return Math.max(RAIL_FLOOR_MIN, Math.min(RAIL_FLOOR_CAP, p10));
}


// ── 2. is it actually nightlife ───────────────────────────────────────────
// Google attaches `wine_bar`, `cocktail_bar`, `sports_bar` and `pub` to
// restaurants as AMENITY tags. Olive Garden carries `wine_bar`; Maggiano's
// carries `wine_bar`; Topgolf carries `sports_bar`. Gating on those in types[]
// put Olive Garden and Dave & Buster's in a nightlife rail.
//
// Gating on primaryType instead LOST House of Blues, which Places types
// `american_restaurant` — as it types Hard Rock Cafe `cafe` and The Beacham
// `event_venue`. So neither field alone works.
//
// These eight are never attached as amenities. If a place carries one, it is a
// nightlife venue whatever Google calls its primary type.
export const VENUE_TYPES = Object.freeze([
  "night_club", "live_music_venue", "concert_hall", "comedy_club",
  "dance_hall", "dive_bar", "hookah_bar", "karaoke",
]);

// ...and these count only as a PRIMARY type — i.e. the bar is the venue's
// identity, not a room inside a restaurant.
//
// `bar_and_grill` is deliberately ABSENT. It is a restaurant format, and
// admitting it re-opened the exact door this module closes: it carried NBC
// Sports Grill & Brew and Jock Lindsey's Hangar Bar into the rail. Removing it
// costs nothing real — Mathers (cocktail_bar), Alfie's (bar), GB's (bar) and
// Will's Pub (pub + live_music_venue) all survive on their own identity.
export const BAR_PRIMARY_TYPES = Object.freeze([
  "bar", "cocktail_bar", "wine_bar", "sports_bar", "pub", "irish_pub",
  "brewery", "brewpub", "beer_garden", "gastropub", "lounge_bar",
]);

export function isNightlifeVenue(place) {
  if (!place) return false;
  const types = Array.isArray(place.types) ? place.types : [];
  if (types.some((t) => VENUE_TYPES.includes(t))) return true;
  return BAR_PRIMARY_TYPES.includes(place.primaryType);
}

// ── 3. ordering ───────────────────────────────────────────────────────────
// Same shape as prominenceScore() shipped in #390: quality leads at 0.6 so a big
// mediocre room cannot buy the top slot, volume at 0.4 over six log decades so a
// 700-review cocktail bar cannot outrank a 7,546-review music hall.
const bayesQuality = (rating, reviews) => {
  const m = 60, C = 3.9, v = reviews || 0;
  return (((v / (v + m)) * rating + (m / (v + m)) * C) / 5);
};

export function railProminence(rating, reviews) {
  if (!rating) return null;                       // null in, null out — never a fabricated 0
  const quality = bayesQuality(rating, reviews);                    // 0..1
  const volume = Math.min(1, Math.log10(1 + (reviews || 0)) / 6);   // 1M reviews ~= 1
  return Math.round(100 * (0.6 * quality + 0.4 * volume));
}

/** Business status is an ALLOWLIST: anything that is not OPERATIONAL is out. */
export const isOperational = (place) =>
  !(place && place.businessStatus && place.businessStatus !== "OPERATIONAL");

export function rankNightlife(places, floorOverride) {
  const floor = floorOverride != null ? floorOverride : railFloorFor(places);
  return (places || [])
    .filter((p) => p && p.rating && (p.reviews || 0) >= floor)
    .filter(isOperational)
    .filter(isNightlifeVenue)
    .map((p) => ({ ...p, prominence: railProminence(p.rating, p.reviews) }))
    .sort((a, b) => b.prominence - a.prominence || (b.reviews || 0) - (a.reviews || 0));
}

// ── 4. AGENTS.md §7 — officialWebsite host rule ───────────────────────────
// A RULE, applied on every write path, not a hand-curated list of the venues we
// happened to look at. Disney Springs is a Disney-owned district full of venues
// that are NOT Disney-operated, and their hosts differ per venue:
//
//   House of Blues     locations.houseofblues.com   (Live Nation)   -> kept
//   The Edison         theedisonfla.com                             -> kept
//   Paradiso 37        paradiso37.com                               -> kept
//   Splitsville        splitsvillelanes.com                         -> kept
//   Jock Lindsey's     disneysprings.com                            -> OMITTED
//
// Blanket-omitting the district would have stripped four legitimate fields.
// Reading the host STRING that Places returns is Places data and is permitted;
// FETCHING the page is the §7 violation and is what caused the incident on
// feat/orlando-activities-cards.
const DENIED_HOST_SUFFIXES = Object.freeze([
  "disney.com", "disney.go.com", "disneyworld.com", "disneyland.com",
  "disneysprings.com", "mydisneyexperience.com", "shopdisney.com",
]);

export function hostOfUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  return u.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** Entity-level, matching scripts/check-no-disney-sources.mjs. */
export function isDeniedHost(host) {
  if (!host) return false;
  if (DENIED_HOST_SUFFIXES.some((d) => host === d || host.endsWith("." + d))) return true;
  return host.split(".").some((label) => label.includes("disney"));
}

/**
 * The website we may publish for a venue — null when the host is denied.
 * Apply this to EVERY venue on EVERY path. A venue that arrives through
 * discovery gets the same gate as one from the curated seed.
 */
export function publishableWebsite(websiteUri) {
  const host = hostOfUrl(websiteUri);
  if (!host || isDeniedHost(host)) return null;
  return websiteUri;
}
