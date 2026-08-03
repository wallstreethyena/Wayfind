// lib/browseCommerceMap.js — WHICH bookable inventory belongs under WHICH browse
// chip, and what to ask for when the local catalogue has none.
//
// WHY THIS REPLACES SUB_TO_EXP (app/home.js). That map was chip -> ONE Viator
// catalogue key, and three separate defects fell out of that shape:
//
//   1. A chip with no entry fell through to "all" and served the generic
//      all-attractions feed under a specific label. That is the spa bug
//      (v6.99): kayak/manatee/dolphin tours under "Spa & wellness".
//   2. ONE key cannot describe a chip. "Outdoors" is nature AND adventure AND
//      kayaking; mapping it to `adventure` alone silently dropped the other
//      two catalogues — in Sarasota that is 35 nature + 37 kayaking products
//      the chip never showed.
//   3. The live-search fallback reused the CATALOGUE KEY as search text, so a
//      market with no theme-park inventory searched Viator for
//      "Sarasota theme". Each chip now carries its own honest query string.
//
// THE RULE THIS FILE EXISTS TO HOLD: a chip serves the FULL catalogue only when
// it says so out loud. `catalogs: null` is legal but requires
// `fullCatalogReason`, so "this chip shows everything" is always a reviewed
// decision and never a fallthrough. scripts/check-browse-commerce-map.mjs CALLS
// the resolver and fails the build if that invariant, or coverage of every
// SUBFILTERS.attractions chip, is broken.
//
// COVERAGE IS PER-MARKET, WHICH IS WHY NO STATIC MAP CAN BE RIGHT ON ITS OWN.
// Measured 2026-08-02 against wf_experiences: the `museums` catalogue holds 25
// products in New York, 9 in Orlando, 3 in St. Petersburg and ZERO in Sarasota
// and Clearwater. So the Museums chip is correct inventory in one market and an
// empty rail in another. The static part (below) says what BELONGS; the serve
// layer (lib/experiencesServe.js) decides what EXISTS here, and the caller
// falls back to this chip's `query` when the answer is nothing. Neither half
// works alone.

import { CATEGORY_BY_KEY } from "./experiencesData.js";

/**
 * chip id (SUBFILTERS.attractions) -> what may render beneath it.
 *
 * catalogs: null  — the whole catalogue; REQUIRES fullCatalogReason
 * catalogs: []    — nothing in our table belongs here; go straight to search
 * catalogs: [..]  — union of these lib/experiencesData CATEGORIES keys
 * query           — the phrase used against live Viator when the table is empty.
 *                   Written as a human would search, never a catalogue key.
 */
export const CHIP_COMMERCE = Object.freeze({
  all: Object.freeze({
    catalogs: null,
    fullCatalogReason: "The All chip IS the unfiltered browse surface — narrowing it would hide inventory the user explicitly asked to see all of.",
    query: "top attractions and experiences",
  }),
  outdoors: Object.freeze({
    catalogs: Object.freeze(["nature", "adventure", "kayaking"]),
    query: "outdoor and nature experiences",
  }),
  beaches: Object.freeze({
    catalogs: Object.freeze(["water", "parasailing"]),
    query: "beach water sports and boat trips",
  }),
  museums: Object.freeze({
    catalogs: Object.freeze(["museums"]),
    query: "museum and gallery tickets",
  }),
  family: Object.freeze({
    catalogs: Object.freeze(["theme"]),
    query: "family attractions and theme parks",
  }),
  tours: Object.freeze({
    catalogs: null,
    // Deliberate, not a fallthrough. Viator's entire catalogue IS guided tours
    // and experiences, so every product is a genuine match for this chip.
    // Narrowing it would hide real inventory to satisfy a symmetry the data
    // does not have.
    fullCatalogReason: "Every Viator product is a guided tour or experience, so the whole catalogue genuinely belongs under Tours.",
    query: "guided sightseeing tours",
  }),
  spa: Object.freeze({
    // Viator publishes no spa/wellness tag, so NOTHING in our table belongs
    // here. Empty (not null, not a near-miss catalogue) is the honest answer:
    // it sends the chip straight to a real "spa and wellness" search instead of
    // dressing water tours up as a massage.
    catalogs: Object.freeze([]),
    query: "spa and wellness",
  }),
  landmarks: Object.freeze({
    catalogs: Object.freeze(["historical"]),
    query: "landmarks and monuments",
  }),
  arts: Object.freeze({
    catalogs: Object.freeze(["museums"]),
    query: "art galleries and theater",
  }),
  marinas: Object.freeze({
    catalogs: Object.freeze(["water"]),
    query: "boat charters and marina tours",
  }),
});

const FALLBACK_CHIP = "all";

/**
 * Resolve a browse chip to its commerce plan.
 * @param {string} chip  a SUBFILTERS.attractions id
 * @returns {{chip:string, catalogs:string[]|null, catalogParam:string|null, query:string, fullCatalog:boolean, known:boolean}}
 *   catalogParam is what to send as /api/experiences?cat= — "all" for the full
 *   catalogue, a comma-joined key list otherwise, or NULL when the chip has no
 *   table inventory at all. A null catalogParam means DO NOT CALL the table;
 *   an empty string would be read as "all" by the route's `|| "all"` default,
 *   which is the exact silent-widening this module exists to prevent.
 */
export function chipCommerce(chip) {
  const key = String(chip || FALLBACK_CHIP) || FALLBACK_CHIP;
  const spec = CHIP_COMMERCE[key] || CHIP_COMMERCE[FALLBACK_CHIP];
  const known = Object.prototype.hasOwnProperty.call(CHIP_COMMERCE, key);
  if (spec.catalogs === null) {
    return { chip: key, catalogs: null, catalogParam: "all", query: spec.query, fullCatalog: true, known };
  }
  // Only keys that are real catalogues survive. A typo'd key would otherwise
  // filter to zero and read as "no local inventory", which is a lie the guard
  // cannot see from the outside.
  const valid = spec.catalogs.filter((k) => CATEGORY_BY_KEY[k]);
  return {
    chip: key,
    catalogs: valid,
    catalogParam: valid.length ? valid.join(",") : null,
    query: spec.query,
    fullCatalog: false,
    known,
  };
}

/** The live-Viator search text for a chip in a city. Never a catalogue key. */
export function chipSearchQuery(chip, city) {
  const q = chipCommerce(chip).query;
  return city ? `${city} ${q}` : q;
}
