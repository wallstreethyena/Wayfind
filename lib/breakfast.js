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
  // 2026-10-01 taxonomy audit (live, 8 cities): each of these primaries put a
  // dinner/lunch room on a morning surface through a secondary breakfast or
  // café token — El Genio del Shawarma, Nikki's Place (soul food), Taste of
  // Punjab, Talkin' Tacos. Caribbean/Cuban/Latin are deliberately ABSENT: a
  // Cuban ventanita or a Caribbean bakery is a real morning format.
  "taco_restaurant", "burrito_restaurant", "tex_mex_restaurant",
  "shawarma_restaurant", "gyro_restaurant", "falafel_restaurant", "kebab_restaurant",
  "soul_food_restaurant", "hot_dog_restaurant", "hot_dog_stand",
  "north_indian_restaurant", "south_indian_restaurant", "pakistani_restaurant",
  "tapas_restaurant", "noodle_shop", "poke_restaurant", "hot_pot_restaurant",
  "korean_barbecue_restaurant", "bar_and_grill", "gastropub", "sports_bar",
]);

// 2026-10-01 — THE TACO PLACE ON THE BREAKFAST MENU. "Fogata Street Tacos"
// arrives with a GENERIC primary (`restaurant`) and types
// [restaurant, breakfast_restaurant, taco_restaurant]. Rule 2 above cannot see
// it (the primary names no cuisine) and rule 5 admits it on the secondary
// breakfast token. Same shape: Al Forno Lebanese Grill, Island Tings
// (caribbean/chicken), The Jerk Stop, Smoothie King (fast_food), Jerk Hut on
// Best Cafés. When the primary is generic, the SECONDARY cuisine and the NAME
// are the only identity evidence left — and a taco/shawarma/jerk/pizza token
// outvotes a breakfast tag unless the name itself makes a morning promise.
const GENERIC_PRIMARY = new Set(["", "restaurant", "food", "point_of_interest", "establishment", "meal_takeaway", "meal_delivery"]);
const SECONDARY_NON_MORNING = new Set([
  "taco_restaurant", "mexican_restaurant", "burrito_restaurant", "tex_mex_restaurant",
  "pizza_restaurant", "pizza_delivery", "sushi_restaurant", "japanese_restaurant",
  "ramen_restaurant", "chinese_restaurant", "thai_restaurant", "vietnamese_restaurant",
  "korean_restaurant", "indian_restaurant", "shawarma_restaurant", "gyro_restaurant",
  "lebanese_restaurant", "middle_eastern_restaurant", "mediterranean_restaurant",
  "caribbean_restaurant", "jamaican_restaurant", "chicken_restaurant",
  "chicken_wings_restaurant", "barbecue_restaurant", "hamburger_restaurant",
  "hot_dog_restaurant", "steak_house", "seafood_restaurant", "fast_food_restaurant",
  "soul_food_restaurant", "cajun_restaurant",
]);
// A name that says what the room serves at night (tacos, shawarma, jerk…).
// Dish words are unambiguous; a NATIONALITY word counts only when it names
// the restaurant ("Vietnamese Restaurant"), never a place name ("Indian Rocks").
const NAME_NON_MORNING = /\b(tacos?|taqueria|burritos?|pizz(a|eria)|sushi|shawarma|gyros?|kebabs?|falafel|jerk|bbq|barbecue|wings|burgers?|hibachi|ramen|pho|teriyaki|trattoria|steak ?house|smokehouse)\b|\b(vietnamese|thai|chinese|mexican|indian|lebanese|caribbean|jamaican)\s+(restaurant|cuisine|kitchen|grill|food|eatery)\b/i;
// "Grill" is a night word only on a row Google does NOT type breakfast_restaurant
// (Keys Jam - Rock Grill out; Sunrise Grill and Eggs Up Grill stay).
const NAME_GRILL = /\bgrill\b/i;
// A name that makes a MORNING promise strong enough to outvote that. Note:
// juice/smoothie are deliberately not here — Smoothie King is not breakfast.
const NAME_MORNING_STRONG = /\b(breakfast|brunch|pancake(s)?|waffle(s)?|bagel(s)?|donut(s)?|doughnut(s)?|biscuit(s)?|omelet(te)?s?|eggs?|griddle|diner|caf[eé]|caff[eè]|coffee|espresso|bakery)\b|café|\bcaffè/i;
// Rooms that are not a place to sit down for breakfast at all.
const NON_DESTINATION_NAME = /\bcommissary\b|\bghost kitchens?\b|\bmeal prep\b/i;
// A primary that is not a food/drink identity (Kadampa Meditation Center:
// primary `health`, types buddhist_temple + cafe) never becomes a morning pick.
const FOOD_PRIMARY_RX = /restaurant|cafe|coffee|bakery|bagel|donut|diner|tea_house|juice|acai|deli|bistro|^food$|food_|cafeteria|dessert|pastry|snack|sandwich|confection|creperie|brunch|breakfast|market|cake|chocolate|ice_cream|meal_|catering|point_of_interest|establishment|brewery/;

// v9.0 (audit of the live Cortez rail, 2026-09-07) — TWO LEAKS, ONE RULE EACH.
//
// 1. "BAYSHORE NUTRITION - Herbalife Nutrition Smoothie Bar" ranked in Best
//    Cafés. Herbalife "nutrition clubs" are a supplement franchise that Google
//    types as cafe/coffee_shop/tea_house; nobody asking for the best café
//    means one. Name veto, whole-word, same shape as NATIONAL_QUICK_RX.
// 2. "Pane e Amore Italian Cafe" (primary italian_restaurant, types
//    [italian_restaurant, restaurant, food] — NOT ONE breakfast token) ranked
//    in Best Breakfast on the word "Cafe" alone. The Arte Caffè carve-out that
//    keeps italian_restaurant out of OTHER_CUISINE_PRIMARY is right — but Arte
//    Caffè carries `bakery` in its types. A café/coffee WORD is weak evidence:
//    it may admit a row whose primary is generic (restaurant/food/none) or
//    that carries at least one breakfast type; it may not, on its own, turn a
//    cuisine restaurant into a breakfast pick. The MEAL words (breakfast,
//    brunch, pancake…) stay strong — a "Pancake House" is what it says.
const NUTRITION_CLUB_RX = /\bherbalife\b|\bnutrition\b/i;
const NAME_MEAL_FIRST = /\b(breakfast|brunch|pancake(s)?|waffle(s)?|bagel(s)?|donut(s)?|doughnut(s)?|biscuit(s)?|omelet(te)?s?|griddle|diner)\b/i;
const CUISINE_PRIMARY_RX = /_restaurant$/;

/** @param {{types?: string[], primaryType?: string, name?: string}} p a ranked place row */
export function isBreakfastPlace(p) {
  if (!p) return false;
  const types = existingTypeSignals(p).map((t) => String(t).toLowerCase());
  if (types.some((t) => EVENING_TYPES.has(t))) return false;
  if (types.some((t) => RETAIL_TYPES.has(t))) return false;
  if (NUTRITION_CLUB_RX.test(String(p.name || ""))) return false;
  // A national burger/taco counter with a breakfast_restaurant type is still
  // not "best breakfast near me" (v6.44's rule, now shared — see
  // NATIONAL_QUICK_RX above). Executed against live Parrish inventory: this
  // is what keeps two McDonald's and a Taco Bell off the widened rail.
  if (NATIONAL_QUICK_RX.test(String(p.name || ""))) return false;

  const primary = primaryOf(p);
  if (NON_DESTINATION_NAME.test(String(p.name || ""))) return false;
  // 1. WHAT IT IS. A breakfast primary is the strongest evidence there is.
  if (BREAKFAST_TYPES.has(primary)) return true;
  // 2. …and a primary that names another cuisine is the strongest evidence
  //    against, ahead of the name rule so a "Pizza Café" cannot talk its way
  //    back in on the word "café".
  if (OTHER_CUISINE_PRIMARY.has(primary)) return false;
  // 2b. A primary that is not food at all (a temple, a clinic) is not a
  //     breakfast or café destination whatever amenity tag it carries. A
  //     catering company keeps a vote only through a café/coffee name.
  if (primary && !FOOD_PRIMARY_RX.test(primary)) return false;
  if (primary === "catering_service" && !NAME_MORNING_STRONG.test(String(p.name || ""))) return false;
  // 2c. Generic primary: the secondary cuisine and the name decide (the
  //     Fogata Street Tacos rule above). A real coffee_shop type keeps a
  //     generic all-day café (CRAFT) whose types also list pizza; a name that
  //     announces the night cuisine does not get that rescue.
  if (GENERIC_PRIMARY.has(primary) && !NAME_MORNING_STRONG.test(String(p.name || ""))) {
    if (NAME_NON_MORNING.test(String(p.name || ""))) return false;
    if (NAME_GRILL.test(String(p.name || "")) && !types.includes("breakfast_restaurant")) return false;
    if (types.some((t) => SECONDARY_NON_MORNING.has(t)) && !types.includes("coffee_shop")) return false;
  }
  // 3. The owner's carve-out for the counters Google mistypes. A MEAL word
  //    is strong on its own; a café/coffee/juice word is weak and needs the
  //    row to be either generically typed or to carry a breakfast token —
  //    see the v9.0 note above (Pane e Amore Italian Cafe).
  const name = String(p.name || "");
  if (NAME_MEAL_FIRST.test(name)) return true;
  if (NAME_BREAKFAST.test(name)) {
    const cuisinePrimary = CUISINE_PRIMARY_RX.test(primary) && primary !== "breakfast_restaurant" && primary !== "brunch_restaurant";
    if (!cuisinePrimary || types.some((t) => BREAKFAST_TYPES.has(t))) return true;
    return false;
  }
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
