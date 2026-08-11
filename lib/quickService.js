// lib/quickService.js — the quick-service IDENTITY test behind
// "The 30-Minute Break".
//
// THE PROBLEM THIS SOLVES (owner, 2026-08-11): text queries cannot separate
// "quick" from "good restaurant" — searched for "quick lunch", Google happily
// returns the same sit-down places every other food list already shows, and
// the 30-Minute Break converges with Actually Worth Eating. So the list's
// promise is enforced on the PLACE DATA, not the search phrasing.
//
// THE RULE (same identity-protected shape as lib/placeFilter.placeAllowed):
//   1. SLOW-FORMAT VETO first, absolute: a fine-dining / steakhouse / buffet
//      identity contradicts "quick" even when a quick type is also present.
//   2. A STRONG quick-service TYPE admits (Google's own taxonomy:
//      fast_food_restaurant, sandwich_shop, deli, meal_takeaway, ...).
//   3. Whole-word NAME evidence admits the counter-serve shapes Google types
//      miss (taqueria, pizzeria, drive-thru, food truck, poke bowls, ...).
//   4. Everything else is REFUSED. A generic `restaurant` with no quick
//      evidence is exactly what belongs on the other food lists — refusing it
//      is what keeps this list from being Actually Worth Eating again.
//
// DELIBERATE CALLS, so nobody "fixes" them:
//   · "burger"/"grill" are NOT name evidence: Red Robin Gourmet Burgers and
//     Bonefish Grill are table service. Counter burger spots (Five Guys,
//     Shake Shack, local smash counters) carry fast_food_restaurant /
//     hamburger_restaurant+takeaway types and are admitted on TYPE.
//   · price is NOT a signal here: a $$ poke bowl is quick; a $ diner is not.
//   · `bar` is not vetoed (a fast-casual with a beer license stays eligible)
//     but grants nothing — without quick evidence it fails rule 4 anyway.
//
// Chains are neither banned nor favored anywhere in this file: McDonald's
// passes the identity test exactly like a local taqueria does, and the
// governed Wayfind Score then decides who earns a card. That is the whole
// product answer to "good fast food, not necessarily McDonald's".

const SLOW_TYPES = new Set([
  "fine_dining_restaurant", "steak_house", "buffet_restaurant", "night_club",
]);

const QUICK_TYPES = new Set([
  "fast_food_restaurant", "sandwich_shop", "deli", "meal_takeaway",
  "food_court", "bagel_shop", "donut_shop", "dessert_shop", "ice_cream_shop",
  "juice_shop", "acai_shop", "coffee_shop", "cafe", "cafeteria", "bakery",
]);

// Whole-word, per the taxonomy's boundary law (parking must not match park).
const NAME_SLOW = /\b(steak ?house|chop ?house|fine dining|omakase|tasting menu|supper club|hibachi|churrascaria|brazilian steakhouse)\b/i;
const NAME_QUICK = /\b(express|drive[\s-]?thr(u|ough)|drive[\s-]?in|to[\s-]?go|takeout|take[\s-]?away|counter|shack|stand|truck|cart|walk[\s-]?up|window|deli|taqueria|pizzeria|slice|bagels?|donuts?|doughnuts?|juice|smoothie|bowls?|poke|wings|subs|hoagie|cheesesteak|gyros?|shawarma|falafel|burritos?|tacos?|hot ?dogs?)\b/i;

const typeList = (r) => {
  const out = [];
  if (r && Array.isArray(r.types)) for (const t of r.types) out.push(String(t || "").toLowerCase());
  if (r && r.primaryType) out.push(String(r.primaryType).toLowerCase());
  if (r && r.primary_type) out.push(String(r.primary_type).toLowerCase());
  return out;
};

/** PURE. Is this place quick-service by identity? (See the rule above.) */
export function isQuickService(r) {
  if (!r) return false;
  const types = typeList(r);
  const name = String((r.name || "")).toLowerCase();
  if (types.some((t) => SLOW_TYPES.has(t))) return false;   // 1. veto, absolute
  if (NAME_SLOW.test(name)) return false;
  if (types.some((t) => QUICK_TYPES.has(t))) return true;   // 2. type admits
  if (NAME_QUICK.test(name)) return true;                   // 3. name admits
  return false;                                             // 4. no evidence, no seat
}
