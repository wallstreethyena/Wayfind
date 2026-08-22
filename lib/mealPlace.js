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
  if (NOT_A_MEAL_NAME_RX.test(String(p.name || ""))) return false;
  return types.some((t) => MEAL_PRIMARY_RX.test(t) || t === "food");
}
