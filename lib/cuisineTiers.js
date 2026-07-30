// lib/cuisineTiers.js — who gets a featured card, and who goes in the index.
//
// This lives in lib/ rather than inside the JSX component for the same reason
// lib/commerceProviders.js does: a guard cannot `import()` a file containing JSX
// under plain node, so logic buried in a component can only ever be GREPPED. The
// rule this repo keeps relearning is to assert on the CALL — so the decision that
// picks the six featured cuisines lives where it can be invoked with real inputs.
//
// DERIVED, NEVER LISTED. The featured six are the top six by high-confidence place
// count for the metro being viewed, taken from the same wf_cuisine_chips result
// that feeds everything else. That is why Tampa features Cuban and Orlando
// features Breakfast with no per-metro branching anywhere.

/** How many cuisines get a featured card. Two rows of three. */
export const FEATURED_COUNT = 6;

/**
 * Split the derived chip list into the two display tiers.
 *
 * `chips` arrives already ordered by places desc — the RPC's own ORDER BY — so
 * this SLICES rather than re-sorts. Re-sorting here would make the page a second
 * ordering authority that can silently disagree with the SQL.
 *
 * Fewer than six cuisines yields fewer cards and an empty index; it never pads,
 * because a padded grid would imply coverage the metro does not have.
 *
 * @param {Array<{cuisine:string, places:number}>} chips
 * @returns {{featured:Array, index:Array}}
 */
export function splitTiers(chips) {
  const all = Array.isArray(chips) ? chips.filter(Boolean) : [];
  return { featured: all.slice(0, FEATURED_COUNT), index: all.slice(FEATURED_COUNT) };
}
