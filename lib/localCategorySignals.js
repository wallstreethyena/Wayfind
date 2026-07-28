// lib/localCategorySignals.js — destination ARCHETYPES that a city is known for.
//
// WHY THIS IS NOT PAID PLACEMENT
// ------------------------------
// Wayfind's promise is that nobody can buy a rank. This layer never names a
// business and never boosts one. It boosts a KIND of destination that published
// local guides consistently say defines a city — springs, airboat rides, a
// performing-arts centre, a museum cluster, a lakefront park. Every venue of
// that kind gets the same nudge, and merit (rating x review volume) still does
// the ranking. The boost is capped low enough that it can reorder near-ties and
// nothing else.
//
// WHY IT EXISTS
// -------------
// Google's text search for "top tourist attractions Orlando" returns the theme
// parks and then a long tail of whatever carries tourist_attraction. It does
// not know that Orlando's springs, its airboat wetlands and Loch Haven's museum
// cluster are what people who live there send visitors to. Encoding that as
// archetypes — rather than as a list of favourite businesses — keeps the
// ranking honest and generalises to the next city.
//
// SOURCES (Orlando set, retrieved 2026-07-28)
//   thetopvillas.com/destination/orlando/things-to-do-in-orlando-besides-theme-parks
//   civitatis.com/blog/en/orlando-more-than-just-amusement-parks
//   mywanderlustylife.com/things-to-do-orlando-besides-theme-parks
//   wekivaisland.com/outdoor-activities-orlando-guide-2026
// Recurring across all four: natural springs, airboat/wetland wildlife, the
// Loch Haven museum cluster, Dr. Phillips performing arts, Lake Eola, Winter
// Park, food tours. Those are the archetypes below.

// Hard ceiling on the internal 0-100 score. Deliberately small: enough to break
// a tie between two similarly-rated places, never enough to lift a weak venue
// over a strong one. Ten points is roughly the gap between a 4.4 and a 4.6.
export const MAX_LOCAL_BOOST = 8;

/**
 * @typedef {{key:string, boost:number, why:string, rx:RegExp}} Archetype
 */

/** Archetypes that hold anywhere in Central Florida. */
export const ARCHETYPES = [
  { key: "spring", boost: 8, why: "Florida spring — natural swimming",
    rx: /\bsprings?\b|blue spring|rock springs|kelly park|wekiwa|silver glen|\bspring run\b/i },
  { key: "airboat", boost: 7, why: "Airboat & wetland wildlife",
    rx: /airboat|air boat|everglades tour|swamp tour|wetland tour|gator (park|tour)/i },
  { key: "museum_cluster", boost: 6, why: "Museum & science",
    rx: /\bmuseum\b|science center|planetarium|art_gallery|\bgallery\b/i },
  { key: "performing_arts", boost: 6, why: "Live performance",
    rx: /performing arts|performing_arts_theater|\bopera\b|philharmonic|symphony|\btheatre\b|\btheater\b|amphitheater/i },
  { key: "lakefront_park", boost: 5, why: "Lakefront park",
    rx: /lake .*park|park .*lake|\blakefront\b|swan boat|paddle ?boat|botanical|arboretum/i },
  { key: "scenic_water", boost: 5, why: "On the water",
    rx: /scenic boat|boat tour|kayak|paddleboard|canoe|river cruise|glass.?bottom/i },
  { key: "nature_trail", boost: 4, why: "Trails & nature",
    rx: /state park|nature preserve|wildlife refuge|conservation area|hiking|\btrail\b|boardwalk|\bpreserve\b/i },
  { key: "food_tour", boost: 4, why: "Food & drink experience",
    rx: /food tour|brewery tour|\bbrewery\b|distillery|winery|farmers market|food hall/i },
  { key: "observation", boost: 4, why: "Views over the city",
    rx: /observation wheel|observation deck|\bskyline\b|hot air balloon|helicopter tour/i },
];

const _txt = (p) => (String((p && p.name) || "") + " " + (((p && p.types) || []).join(" "))).toLowerCase();

/**
 * The single best-matching archetype for a place, or null.
 * One archetype only — boosts never stack, or a place matching three loose
 * patterns would outrank a genuinely better venue.
 */
export function archetypeFor(place) {
  if (!place || !place.name) return null;
  const t = _txt(place);
  let best = null;
  for (const a of ARCHETYPES) {
    if (!a.rx.test(t)) continue;
    if (!best || a.boost > best.boost) best = a;
  }
  return best;
}

/**
 * Bounded additive boost for the ranking layer.
 * @returns {number} 0..MAX_LOCAL_BOOST
 */
export function localCategoryBoost(place) {
  const a = archetypeFor(place);
  if (!a) return 0;
  return Math.max(0, Math.min(MAX_LOCAL_BOOST, a.boost));
}

/**
 * Human-readable reason, for the card's "why this" line. Returns null when
 * nothing matched — we never invent a reason.
 */
export function localCategoryReason(place) {
  const a = archetypeFor(place);
  return a ? a.why : null;
}
