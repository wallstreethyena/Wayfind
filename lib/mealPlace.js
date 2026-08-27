// lib/mealPlace.js — THE MEAL, for the "Actually Worth Eating" rail.
//
// THE DEFECT, measured 2026-08-22 against live inventory the moment v8.31's
// reader-first retrieval started surfacing local places:
//
//   PARRISH, top of the eat rail
//     1. Pomegranate Frozen Yogurt          dessert_shop
//     3. Ryan's Coffee House                coffee_shop
//     6. American Honey Creamery            ice_cream_shop
//     8. Vampire Penguin                    dessert_shop (shaved ice)
//   LAKEWOOD RANCH
//    10. Crumbl                             bakery (cookies)
//    12. Gofruit Juice Bar                  juice_shop
//     8. Twin Peaks                         sports_bar
//     9. Good Liquid Brewing Company        brewpub
//   SARASOTA
//     8. Hashtag Café                       coffee_shop
//    11. Gelateria Degli Angeli             ice_cream_shop
//
// The rail's tile says "Skip the bad meal" and "Ranked on the food, not the
// noise". The single best answer it had for someone in Parrish asking where to
// eat was a frozen yogurt counter.
//
// WHY IT HAPPENED. `eat` was the one rail with no identity at all — its pick
// only ever asked whether a row was summer-sourced, so every food-categorised
// place in the pool qualified and the governed score alone decided. A dessert
// counter with 608 reviews and a 4.9 rating scores extremely well, because the
// score measures QUALITY and was never asked whether the thing is a meal.
//
// It did not show before v8.31 because the old city-search retrieval returned
// regional dinner anchors and the small counters never cracked a top-15. The
// retrieval fix did not create this defect; it revealed it. That is worth
// stating plainly — the same is true of anywhere else a rail leans on the
// score to do a job an identity should be doing.
//
// Same discipline as lib/breakfast.js (v8.30.1) and lib/beaches.js (v8.31):
// the PRIMARY type is what a place IS, a token or a word in the name is only
// evidence, and the rule is measured against real rows rather than imagined.
import { existingTypeSignals } from "./placeCategory.js";

// Not a meal. Dessert and drink counters, rooms whose identity is the bar, and
// the retail/delivery shapes that are not a place to eat at all.
//
// `breakfast_restaurant` and `brunch_restaurant` are DELIBERATELY ABSENT:
// breakfast is a meal, and Keke's leading Lakewood Ranch's eat rail is a good
// answer, not a leak. They have their own rail because the morning is its own
// question, not because they are not food.
//
// `sandwich_shop` is absent for the same reason — a sandwich is a meal. Note
// lib/breakfast.js vetoes it, correctly: a sub shop is not breakfast. Two
// rails, two questions, two answers.
const NOT_A_MEAL_PRIMARY = new Set([
  // dessert and drink counters
  "dessert_shop", "ice_cream_shop", "frozen_yogurt_shop", "candy_store",
  "chocolate_shop", "bakery", "donut_shop", "juice_shop", "smoothie_shop",
  "bubble_tea_store", "tea_house", "coffee_shop", "cafe",
  // the room is the bar — that is `tonight` and `datenight`, not the meal
  "bar", "sports_bar", "wine_bar", "cocktail_bar", "pub", "brewpub", "brewery",
  "distillery", "night_club", "liquor_store",
  // not a place you eat at
  "grocery_store", "supermarket", "convenience_store", "gas_station",
  "meal_delivery", "catering_service", "banquet_hall",
]);

// Explicit meal rooms, for the rows whose primary is one of these — they admit
// before anything else looks at the name.
const MEAL_PRIMARY_RX = /_restaurant$|^restaurant$|^steak_house$|^sandwich_shop$|^pizza_restaurant$|^diner$|^food_court$|^buffet_restaurant$|^fine_dining_restaurant$|^fast_food_restaurant$|^meal_takeaway$/;

// For a row whose primary type is GENERIC (`restaurant`, `food`, or missing),
// the name is the only evidence left. Whole words, the same boundary rule
// breakfast and quickService use.
const NOT_A_MEAL_NAME_RX = /\b(frozen yogurt|froyo|creamery|ice ?cream|gelato|gelateria|cookie|cookies|cupcake|candy|chocolatier|donut|doughnut|juice bar|smoothie|boba|bubble tea|shaved ice|patisserie|p[aâ]tisserie)\b/i;

/**
 * PURE. Is this a place to eat A MEAL?
 *
 * @param {{primaryType?:string, primary_type?:string, types?:string[], name?:string}} p
 */
// ── A DISTRICT IS NOT A RESTAURANT (v8.78) ──────────────────────────────────
//
// Owner, 2026-08-27, with a screenshot of the eat rail: "Saint Armand Circle is
// a destination, not a restaurant. We should be recommending a specific place,
// not the destination."
//
// He is right, and the row shows exactly how it got in. St. Armands Circle
// carries NO primary type at all, and its type array is:
//
//   ["shopping_mall", "business_center", "historical_landmark",
//    "historical_place", "beauty_salon", "park", "service", "restaurant"]
//
// Google lists what a place IS first and what it CONTAINS after. `restaurant`
// sits in position EIGHT — it is there because the circle is full of
// restaurants, which is the opposite of being one. With no primary type, rule 3
// below fell through to "does any type look like a meal", and that trailing
// token admitted a shopping district to a rail whose tile says "Skip the bad
// meal".
//
// WHY NOT JUST READ types[0]. Measured against live Bradenton inventory before
// choosing: a leading-type rule would have dropped ELEVEN rows from the eat
// rail, and TEN of them are real meals — Jersey Mike's, Firehouse Subs, South
// Philly Cheesesteaks, Capriotti's and a Jamaican restaurant all lead with
// `sandwich_shop` or `catering_service`. Position alone is not identity.
//
// WHAT ACTUALLY SEPARATES THEM is whether a DESTINATION identity comes before
// any meal identity. Measured across every rail in one live payload, seven rows
// carry both kinds of token, and the rule splits them exactly right:
//
//   REFUSED  St. Armands Circle   shopping_mall(0)      before restaurant(7)
//   REFUSED  Waterside Place      shopping_mall(0)      before restaurant(4)
//   KEPT     Arte Caffe           italian_restaurant(0) before market(1)
//   KEPT     Tide Tables          seafood_restaurant(0) before marina(1)
//   KEPT     Lobster Pound        seafood_restaurant(0) before market(1)
//   KEPT     Stroke's Seafood     seafood_restaurant(0) before market(3)
//   KEPT     Loaded Cannon        cocktail_bar(0)       — never on eat anyway
//
// Two of 190 removed from the eat rail, and both are districts. A restaurant
// inside a mall still leads with its own room and is untouched.
//
// AND THEY ARE NOT DELETED — they are RE-HOMED. The owner's own framing: "we
// gotta be able to appropriately place these categories in the categories that
// it fits them." This function only answers "is this a meal". St. Armands stays
// eligible for every other pool it qualifies for, which is where a destination
// belongs.
const DESTINATION_TYPES = new Set([
  "shopping_mall", "shopping_center", "plaza", "town_square", "neighborhood",
  "tourist_attraction", "historical_landmark", "historical_place",
  "national_park", "state_park", "park", "amusement_park", "zoo", "museum",
  "beach", "marina", "stadium", "airport", "market",
]);

/**
 * Does a DESTINATION identity lead this row's types, ahead of any meal token?
 * Pure and exported so scripts/check-district-not-a-meal.mjs can run it against
 * the real rows above rather than trusting the table in this comment.
 */
export function districtLeads(types) {
  const t = (Array.isArray(types) ? types : []).map((x) => String(x).toLowerCase());
  const d = t.findIndex((x) => DESTINATION_TYPES.has(x));
  if (d === -1) return false;
  const m = t.findIndex((x) => MEAL_PRIMARY_RX.test(x) || x === "food");
  // A destination token with no meal token at all is not this rule's business —
  // rule 3 will refuse it anyway. This rule exists only for the rows that carry
  // BOTH, where the ORDER is the whole signal.
  return m === -1 ? false : d < m;
}

export function isMealPlace(p) {
  if (!p) return false;
  const primary = String((p.primaryType || p.primary_type) || "").toLowerCase();
  const types = existingTypeSignals(p).map((t) => String(t).toLowerCase());

  // 1. WHAT IT IS NOT. A dessert counter's primary type is the strongest
  //    evidence there is, and it outranks a five-star rating.
  if (NOT_A_MEAL_PRIMARY.has(primary)) return false;
  // 2. WHAT IT IS. An explicit meal room admits — including breakfast and
  //    brunch rooms, which reach here through the `_restaurant$` tail.
  if (MEAL_PRIMARY_RX.test(primary)) {
    // …unless the row ALSO carries a bar identity and nothing else. A place
    // typed `restaurant` + `night_club` is a night out, not dinner.
    if (types.some((t) => t === "night_club")) return false;
    return true;
  }
  // 3. No usable primary. Fall back to the type array, then refuse the names
  //    that give a dessert counter away.
  if (types.some((t) => NOT_A_MEAL_PRIMARY.has(t))) return false;
  // …and refuse a DESTINATION that merely contains restaurants. See the note
  // above districtLeads: this is the rule that keeps St. Armands Circle off a
  // rail promising a specific meal, without touching the ten sandwich shops a
  // cruder position rule would have taken with it.
  if (districtLeads(types)) return false;
  if (NOT_A_MEAL_NAME_RX.test(String(p.name || ""))) return false;
  return types.some((t) => MEAL_PRIMARY_RX.test(t) || t === "food");
}

// Breakfast-only rooms. They are meals (isMealPlace keeps them — Keke's leading
// the eat rail is correct) and they are the WRONG #1 for the Lunch chip.
// A diner or a restaurant that also serves breakfast is not in this set: its
// primary is the room, not the morning sitting.
const BREAKFAST_ONLY_PRIMARY = new Set([
  "breakfast_restaurant",
  "brunch_restaurant",
]);

/**
 * PURE. Is this a LUNCH meal — a place to eat at midday, not a breakfast-only
 * room, not a dessert counter, not a coffee shop?
 *
 * Lunch is a TIME of day with a venue promise: the room serves a midday meal.
 * It is not "any food" (v8.49 named that debt) and it is not Breakfast wearing
 * a different chip. Owner, 2026-08-25, Parrish: Food → Lunch led with Keke's
 * Breakfast Cafe tagged BREAKFAST because the chip had no identity and the
 * score alone decided.
 */
export function isLunchPlace(p) {
  if (!isMealPlace(p)) return false;
  const types = existingTypeSignals(p).map((t) => String(t).toLowerCase());
  const primary = String(
    (p && (p.primaryType || p.primary_type)) || types[0] || "",
  ).toLowerCase();
  if (BREAKFAST_ONLY_PRIMARY.has(primary)) return false;
  return true;
}
