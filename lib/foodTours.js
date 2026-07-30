// lib/foodTours.js — which cached Viator products are FOOD tours, and which
// markets a cuisine sheet may draw them from.
//
// PURE. No fetch, no query construction — the same discipline as lib/cuisine.js.
// This module classifies rows we already hold. The caller does the reading.
//
// WHY A TITLE MATCHER AND NOT A CATEGORY
// Viator's category taxonomy as harvested (lib/experiencesData CATEGORIES) has
// eleven keys — kayaking, parasailing, private, historical, water, walking, theme,
// museums, adventure, airboat, nature — and NO food category. The 54 food tours in
// wf_experiences are therefore invisible to every category filter we have; the
// only signal on the row is the title. Adding a food tag to the harvest cron is
// the better long-term fix and is NOT this module's job.
//
// THE MATCHER WAS TUNED AGAINST THE REAL CORPUS, NOT IMAGINED.
// Run over all 1,234 rows it selects 54. Two lessons are baked into the tokens:
//   • plurals are not optional — an earlier draft matched "winery" and "wine" but
//     missed "VIP Full Day WINERIES Tour", so every stem carries its plural form
//   • "eats" and "feast" must be present — "Alt Eats Tour" and "St. Pete Street
//     Feast" are real food tours that a food|culinary|tasting matcher misses
// Word boundaries are load-bearing: an unanchored /eat/ matches "great",
// "theater" and "seat", which is how a food rail fills up with airboat rides.
//
// KNOWN BORDERLINE, STATED RATHER THAN HIDDEN: a sightseeing product that merely
// ends with a drink ("Bosphorus Sunset Cruise on a Yacht with Wine") matches. All
// such cases sit outside the three metros that ship a sheet, and every one of the
// 20 matches inside those metros is a genuine food or drink tour. If the rail ever
// opens to more markets, re-run the corpus check before trusting this.

/** Food/drink tour titles. Tuned against all 1,234 wf_experiences rows. */
export const FOOD_TOUR_RX =
  /\b(food|foods|foodie|foodies|culinary|gastronomy|gastronomic|tast(?:e|es|ing|ings)|eats|feast|dining|dine|chef|chefs|brewer(?:y|ies)|distiller(?:y|ies)|winer(?:y|ies)|wines?)\b/i;

/**
 * Which Viator dest ids a cuisine sheet may draw from, per METRO slug used by
 * app/eat/[metro]. These mirror the labels that page already shows a user:
 * "Tampa Bay" legitimately covers St. Petersburg and Clearwater, "Sarasota &
 * Bradenton" does not. Drawing wider than the label would put a St. Pete tour on
 * a Sarasota page, which is the geo/entity mismatch class that shipped the
 * Dalí→Barcelona bug.
 */
export const METRO_DESTS = Object.freeze({
  orlando: ["663"],
  tampa: ["666", "5403", "22457"],
  "manatee-sarasota": ["25738"],
});

/** True when a product title reads as a food or drink tour. */
export function isFoodTour(title) {
  return FOOD_TOUR_RX.test(String(title || ""));
}

/**
 * Pick the food tours for a metro, best first.
 *
 * Ordering is REVIEW-WEIGHTED, not price and not commission: a 4.7 with 220
 * reviews outranks a 5.0 with 1. Commission is not an input here and must never
 * become one — lib/commerce.js rule 1 and AGENTS.md §8. This function receives no
 * commission field, so it cannot rank on one even by accident.
 *
 * @param {Array} rows  wf_experiences rows (already read by the caller)
 * @param {{metro:string, limit?:number}} opts
 */
export function pickFoodTours(rows, { metro, limit = 4 } = {}) {
  const allowed = METRO_DESTS[metro];
  if (!allowed || !Array.isArray(rows)) return [];
  const seen = new Set();
  return rows
    .filter((r) => r && allowed.includes(String(r.dest_id)))
    .filter((r) => isFoodTour(r.title))
    // A product with no working link is not an offer. link_ok === false is a
    // known-dead link; null/undefined means never checked, which we allow.
    .filter((r) => r.link_ok !== false && r.product_url)
    .filter((r) => {
      const k = String(r.product_code || r.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => {
      // Wilson-ish: reviews carry the weight, rating breaks ties. A 5.0/1review
      // leading the rail is how a money surface loses trust on first click.
      const rv = (x) => Number(x.reviews) || 0;
      const rt = (x) => Number(x.rating) || 0;
      return (rv(b) - rv(a)) || (rt(b) - rt(a));
    })
    .slice(0, limit);
}
