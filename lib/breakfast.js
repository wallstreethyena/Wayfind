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

/** @param {{types?: string[], name?: string}} p a ranked place row */
export function isBreakfastPlace(p) {
  if (!p) return false;
  const types = (Array.isArray(p.types) ? p.types : []).map((t) => String(t).toLowerCase());
  if (types.some((t) => EVENING_TYPES.has(t))) return false;
  if (types.some((t) => BREAKFAST_TYPES.has(t))) return true;
  return NAME_BREAKFAST.test(String(p.name || ""));
}
