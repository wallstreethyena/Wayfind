// lib/cafeIdentity.js — what a CAFÉ / COFFEE list is allowed to contain.
//
// Owner, 2026-10-07: Food > Cafés and Food > Coffee (and every other
// café/coffee-labelled surface) show ONLY real cafés / coffee shops, globally.
// Tea houses, boba, bakeries, bagel/donut shops, delis, dessert/gelato,
// juice/smoothie/acai and restaurants are OUT. This is a pure identity
// predicate: it never reads or changes a score.
//
// It narrows lib/morningIdentity (which stays the broad morning classifier
// shared with Best Breakfast); it never widens it.

export const CAFE_PRIMARY = new Set([
  "coffee_shop", "cafe", "coffee_roastery", "coffee_stand", "espresso_bar", "cat_cafe",
]);
// Primary types that carry no identity of their own (matches morningIdentity).
export const GENERIC_PRIMARY = new Set(["", "restaurant", "food", "point_of_interest", "establishment"]);

// Words that make a name NOT a café. Word-bounded and applied to the
// normalised name (see normalizeName), so "tea" never matches "steak" and
// "deli" never matches "delight" / "delicious".
//
// HARD: the name wins even over a coffee word ("Coffee & Tea House" is a tea
// room, "Stork's Bakery & Cafe" is a bakery).
export const HARD_VETO_RX = /\b(teas?|teahouse|tea house|boba|bubble|bakery|bakeshop|bagels?|donuts?|doughnuts?|gelato|desserts?|ice cream|acai|juice|smoothies?|kava|kratom)\b/;
// SOFT: a restaurant-ish word that a real coffee word overrides
// ("Luka Restaurant and Coffee" stays IN; "Bistro Café" is OUT).
export const SOFT_VETO_RX = /\b(restaurant|grill|bistro|deli|delicatessen|pizza|pizzeria|tacos?|crepes?|creperie|cookies?|cupcakes?|creamery|patisserie)\b/;
// Real coffee evidence. Deliberately NOT cafe/caffe (every bistro says cafe).
export const RESCUE_RX = /\b(coffee|espresso|roasters?|roastery|roast\w*|latte|cappuccino|cafecito)\b/;
// A generic-primary row needs the café word itself in the name.
export const CAFE_WORD_RX = /\b(cafe|caffe|coffee|espresso|roast\w*)\b/;
export const CUISINE_PRIMARY_RX = /^[a-z_]+_restaurant$|^cafeteria$/;
export const TEA_TYPES = new Set(["tea_house", "bubble_tea_shop"]);

// `\b` after an accented letter is false in JS, so fold accents first:
// café -> cafe, caffè/caffé -> caffe, açaí -> acai.
export function normalizeName(name) {
  return String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function lower(v) { return String(v || "").trim().toLowerCase(); }
function typeList(v) {
  if (Array.isArray(v)) return v.map(lower).filter(Boolean);
  if (typeof v === "string") return v.split(/[\s,|]+/).map(lower).filter(Boolean);
  return [];
}

export function isCoffeeCafe(place) {
  if (!place || !place.name) return false;
  const name = normalizeName(place.name);
  const primary = lower(place.primaryType || place.primary_type);
  const types = new Set([...typeList(place.types), ...typeList(place.google_types), ...typeList(place.googleTypes)]);

  const hard = HARD_VETO_RX.test(name);
  const soft = SOFT_VETO_RX.test(name);
  const rescue = RESCUE_RX.test(name);

  if (hard) return false;
  // A tea room Google typed as a café ("Jade Tea House") is out unless the name
  // itself promises coffee.
  // A tea-typed room is out unless it is also typed a coffee shop (Myth &
  // Legend: cafe + tea_house + coffee_shop) or its name is coffee-forward.
  if ([...types].some((t) => TEA_TYPES.has(t)) && !types.has("coffee_shop") && !rescue) return false;

  if (CAFE_PRIMARY.has(primary)) return !soft || rescue;

  // A generic or cuisine-restaurant primary is a café only with a real
  // coffee_shop type AND a café/coffee name and no restaurant word (MERCI
  // CAFÉ is french_restaurant + coffee_shop + coffee_stand; Keik Restaurant
  // and a diner tagged `cafe` stay out).
  if (GENERIC_PRIMARY.has(primary) || CUISINE_PRIMARY_RX.test(primary)) {
    return types.has("coffee_shop") && CAFE_WORD_RX.test(name) && !soft;
  }
  // bakery, tea_house, bagel_shop, donut_shop, juice_shop, acai_shop, any
  // *_restaurant cuisine primary, ...
  return false;
}
