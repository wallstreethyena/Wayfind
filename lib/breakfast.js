// lib/breakfast.js — THE breakfast identity, for the Best Breakfast Picks
// rail (owner, 2026-08-18: "provide the list for the best breakfast places
// near the user … based on the user's current location, which is the exact
// pinpoint from the maps function").
//
// Same discipline as lib/quickService.js (the one quick-service identity):
// evidence the row actually carries — Google types first, whole-word name
// evidence second — and a hard veto for rooms that are open in the morning
// without BEING breakfast (a hotel restaurant, a 24h diner-adjacent bar).
// Nothing infers a pancake from a vibe.
//
// DISTANCE: breakfast is the most local meal of the day — nobody drives 25
// miles before coffee. BREAKFAST_NEAR_MI caps the rail at a morning-real
// radius, measured from the reader's exact point (the same origin every
// distance on the page uses — v8.7's "exact user location" rule).
import { existingTypeSignals } from "./placeCategory.js";

export const BREAKFAST_NEAR_MI = 10;

const BREAKFAST_TYPES = new Set([
  "breakfast_restaurant", "brunch_restaurant", "cafe", "coffee_shop",
  "bakery", "bagel_shop", "donut_shop", "diner",
]);

// Whole-word name evidence, for the counters Google types miss. Same
// word-boundary rule quickService uses — "pancake" must be a word, so
// "Pancake House" qualifies and nothing substring-leaks.
const NAME_BREAKFAST = /\b(breakfast|brunch|pancake(s)?|waffle(s)?|bagel(s)?|donut(s)?|doughnut(s)?|biscuit(s)?|omelet(te)?s?|griddle|diner|caf[eé]|coffee|espresso|juice(ry)?|smoothie)\b/i;

// The veto: rooms whose identity is the EVENING, whatever their opening
// hours claim. A steakhouse that serves eggs on Sunday is not the answer to
// "best breakfast near me".
const EVENING_TYPES = new Set(["bar", "night_club", "wine_bar", "pub", "steak_house", "cocktail_bar"]);

// v8.18 — the RETAIL veto, learned by executing the identity against the live
// inventory near Parrish before the widened pool shipped: two Publix Super
// Markets qualified as breakfast (a supermarket carries `bakery` in its
// Google types) and an ice-cream emporium rode in on `cafe`. A grocery
// store's identity IS food and it is still not a place to eat breakfast —
// the same owner rule placeFilter's crossVeto encodes for the Food tab. Type
// evidence only, same as everything else in this file.
const RETAIL_TYPES = new Set([
  "grocery_store", "supermarket", "convenience_store", "gas_station",
  "department_store", "warehouse_store", "ice_cream_shop", "candy_store", "dessert_shop",
]);

// v8.18 — THE NATIONAL QUICK-SERVICE VETO, the same brand list (and the same
// reasoning) as placeFilter's v6.44 browse-Breakfast rule: these chains can
// serve a morning menu and are still not what anyone means by "best breakfast
// near me" — they stay findable in Quick bites and Food·All. ONE list, now
// exported from here; lib/placeFilter.js imports it so the rail and the
// browse tab cannot drift. Deliberately excludes the breakfast INSTITUTIONS
// (Cracker Barrel, IHOP, Waffle House, First Watch, Keke's) — v6.44's
// explicit carve-out: capping a genuine breakfast brand would be the
// classifier claiming something the data does not support.
export const NATIONAL_QUICK_RX = /\b(chick[\s'-]*fil[\s'-]*a|mcdonald'?s?|burger king|wendy'?s|taco bell|subway|kfc|popeyes|sonic drive[\s-]*in|arby'?s|jack in the box|whataburger|white castle|checkers|rally'?s|culver'?s|five guys|raising cane'?s|zaxby'?s|bojangles)\b/i;

// v8.30.1 — THE PRIMARY TYPE, WHICH THIS FILE COULD NOT SEE.
//
// THE DEFECT, live on gowayfind.com and screenshotted by the owner: "Best
// Breakfast Picks near Parrish" served **Pizza Haven - NY Style** at #8.
// Its Google types are
//   ["pizza_restaurant", "diner", "meal_takeaway", "restaurant", …]
// and `diner` is a BREAKFAST_TYPE, so `types.some(BREAKFAST_TYPES.has)` was
// true and a pizzeria became a breakfast pick.
//
// The root cause is not the `diner` token. It is that Google's `types` array
// is UNORDERED EVIDENCE, and this file was treating every entry in it as
// equally load-bearing — so one secondary token could outvote what the place
// actually IS. existingTypeSignals() makes that worse by design: it returns
// `types` INSTEAD of the primary type whenever `types` is non-empty, which is
// always, on a ranked row. Until now nothing here could tell a pizzeria that
// also serves eggs from a room whose whole identity is breakfast.
//
// Same disease and same cure as v8.19's events rail, where a pub rode a
// secondary `event_venue` token onto a ticketed-rooms list: read the PRIMARY
// type, and let it veto.
const primaryOf = (p) => String((p && (p.primaryType || p.primary_type)) || "").toLowerCase();

// Primary types that name a DIFFERENT cuisine or format. A breakfast token in
// the secondary array does not outvote one of these.
//
// `italian_restaurant` is DELIBERATELY ABSENT. An Italian bakery-café is a
// real breakfast format — cornetto and espresso — and Bradenton's Arte Caffè
// (primary italian_restaurant, `bakery` in its types) is exactly that. Vetoing
// the cuisine to kill one pizzeria would have taken a genuine answer with it.
// Same reasoning keeps `juice_shop` and `tea_house` out: a smoothie counter in
// the morning is a defensible pick, and NAME_BREAKFAST already names them.
const OTHER_CUISINE_PRIMARY = new Set([
  "pizza_restaurant", "pizza_delivery",
  "mexican_restaurant", "chinese_restaurant", "japanese_restaurant",
  "sushi_restaurant", "ramen_restaurant", "thai_restaurant",
  "vietnamese_restaurant", "korean_restaurant", "indian_restaurant",
  "brazilian_restaurant", "greek_restaurant", "mediterranean_restaurant",
  "middle_eastern_restaurant", "turkish_restaurant", "lebanese_restaurant",
  "afghani_restaurant", "african_restaurant", "asian_restaurant",
  "seafood_restaurant", "steak_house", "barbecue_restaurant",
  "hamburger_restaurant", "chicken_wings_restaurant", "chicken_restaurant",
  "sandwich_shop", "fast_food_restaurant", "meal_takeaway", "meal_delivery",
  "buffet_restaurant", "fine_dining_restaurant",
]);

/** @param {{types?: string[], primaryType?: string, name?: string}} p a ranked place row */
export function isBreakfastPlace(p) {
  if (!p) return false;
  const types = existingTypeSignals(p).map((t) => String(t).toLowerCase());
  if (types.some((t) => EVENING_TYPES.has(t))) return false;
  if (types.some((t) => RETAIL_TYPES.has(t))) return false;
  // A national burger/taco counter with a breakfast_restaurant type is still
  // not "best breakfast near me" (v6.44's rule, now shared — see
  // NATIONAL_QUICK_RX above). Executed against live Parrish inventory: this
  // is what keeps two McDonald's and a Taco Bell off the widened rail.
  if (NATIONAL_QUICK_RX.test(String(p.name || ""))) return false;

  const primary = primaryOf(p);
  // 1. WHAT IT IS. A breakfast primary is the strongest evidence there is.
  if (BREAKFAST_TYPES.has(primary)) return true;
  // 2. …and a primary that names another cuisine is the strongest evidence
  //    against, ahead of the name rule so a "Pizza Café" cannot talk its way
  //    back in on the word "café".
  if (OTHER_CUISINE_PRIMARY.has(primary)) return false;
  // 3. The owner's carve-out for the counters Google mistypes.
  if (NAME_BREAKFAST.test(String(p.name || ""))) return true;
  // 4. A LONE SECONDARY `diner` IS NOT EVIDENCE. Google hangs `diner` on
  //    counter-service rooms of any cuisine, so on its own it says "you can
  //    sit at a counter", not "this is breakfast". MEASURED across the whole
  //    inventory, every place whose only breakfast token is a secondary
  //    `diner` is something else — Pizza Haven, Skyline Chili, Graze South
  //    Tampa, Mrs. Potato, Pickford's Sundries — and every genuine breakfast
  //    institution that carries `diner` (Cracker Barrel, IHOP, Keke's, Waffle
  //    House, Denny's) carries `breakfast_restaurant` beside it. A place whose
  //    primary type IS `diner` was already admitted at rule 1.
  const breakfastTokens = types.filter((t) => BREAKFAST_TYPES.has(t));
  if (breakfastTokens.length === 1 && breakfastTokens[0] === "diner") return false;
  // 5. Secondary breakfast evidence, now that the primary has had its say.
  return breakfastTokens.length > 0;
}
