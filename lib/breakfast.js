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

/** @param {{types?: string[], name?: string}} p a ranked place row */
export function isBreakfastPlace(p) {
  if (!p) return false;
  const types = (Array.isArray(p.types) ? p.types : []).map((t) => String(t).toLowerCase());
  if (types.some((t) => EVENING_TYPES.has(t))) return false;
  if (types.some((t) => RETAIL_TYPES.has(t))) return false;
  // A national burger/taco counter with a breakfast_restaurant type is still
  // not "best breakfast near me" (v6.44's rule, now shared — see
  // NATIONAL_QUICK_RX above). Executed against live Parrish inventory: this
  // is what keeps two McDonald's and a Taco Bell off the widened rail.
  if (NATIONAL_QUICK_RX.test(String(p.name || ""))) return false;
  if (types.some((t) => BREAKFAST_TYPES.has(t))) return true;
  return NAME_BREAKFAST.test(String(p.name || ""));
}
