// lib/cardChips.js — which chips a place card wears, and in what order. Pure.
//
// 2026-10-06 (richer place cards). The browse card used to show up to 3 engine
// badges that relied on Google attribute labels inventory rows never carry, so Food
// cards were chipless. The cap is now 4 and the order is DETERMINISTIC, highest value
// first, so the same place always wears the same chips:
//
//   1. ranking disclosures (creator video, featured)   — the score law needs them visible
//   2. the cuisine                                     — "Thai" beats everything descriptive
//   3. the meal (breakfast / lunch / dinner / quick bite / dessert), from inventory tags
//   4. other earned engine tags (waterfront, live music, ...)
//   5. value ("Great value")
//   6. reputation (best of / local favorite / hidden gem)
//
// Nothing here mints a claim: every input is evidence the caller already resolved
// (engine keys passed the lib/tags.js identity gate; cuisine and tags come from the
// inventory row). Price is NOT a chip — it lives in the meta row (PriceMeter).
export const CARD_CHIP_CAP = 4;

// Meal tags, in display priority. Only ONE meal chip is ever shown.
export const MEAL_ORDER = ["breakfast", "lunch", "dinner", "quickbites", "dessert"];
// Cuisine-specific engine keys: redundant once the cuisine chip is present.
const CUISINE_KEYS = new Set(["pizza", "sushi", "steak", "seafood", "burgers", "mexican", "italian"]);
const VALUE_KEYS = ["value"];
const REPUTATION_KEYS = ["bestof", "localfav", "gem"];

/** The one meal key a place's inventory tags earn, or null. `allowed` is the identity gate. */
export function mealKeyFromTags(tags, allowed) {
  const t = new Set((Array.isArray(tags) ? tags : []).map((x) => String(x).toLowerCase()));
  for (const k of MEAL_ORDER) if (t.has(k) && (!allowed || allowed(k))) return k;
  return null;
}

/**
 * @param {object} a
 * @param {string[]} a.disclosures  ranking-disclosure keys, already decided (e.g. ["creatorvideo"])
 * @param {string|null} a.cuisine   display label, or null
 * @param {string|null} a.meal      one meal key, or null
 * @param {string[]} a.engineKeys   identity-gated experience keys, engine order
 * @param {string|null} a.selectedKey the opened collection's key; shown right after the disclosures, only if earned
 * @returns {{kind:string,key:string}[]} at most CARD_CHIP_CAP descriptors
 */
export function arrangeChips({ disclosures = [], cuisine = null, meal = null, engineKeys = [], selectedKey = null, cap = CARD_CHIP_CAP }) {
  const out = [];
  const seen = new Set();
  const push = (kind, key) => { const id = kind + ":" + key; if (!seen.has(id)) { seen.add(id); out.push({ kind, key }); } };
  for (const k of disclosures) push("key", k);
  if (selectedKey && engineKeys.includes(selectedKey)) push("key", selectedKey);
  if (cuisine) push("cuisine", "cuisine");
  const mealSet = new Set(MEAL_ORDER);
  // A meal the engine earned from the name/types (e.g. a bakery's "dessert") counts when no tag says otherwise.
  if (!meal) meal = MEAL_ORDER.find((k) => engineKeys.includes(k)) || null;
  if (meal) push("key", meal);
  const rest = engineKeys.filter((k) => !mealSet.has(k) && !VALUE_KEYS.includes(k) && !REPUTATION_KEYS.includes(k) && !(cuisine && CUISINE_KEYS.has(k)));
  for (const k of rest) push("key", k);
  for (const k of VALUE_KEYS) if (engineKeys.includes(k)) push("key", k);
  for (const k of REPUTATION_KEYS) if (engineKeys.includes(k)) push("key", k);
  return out.slice(0, cap);
}
