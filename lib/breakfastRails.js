// One breakfast answer, two identities. These are intentionally exclusive:
// a café may serve breakfast, but it belongs in the café rail so the first
// rail remains a ranking of meal-first breakfast rooms.
import { rankRailPlaces } from "./railRank.js";

const CAFE_PRIMARY = new Set([
  "cafe", "coffee_shop", "tea_house", "bakery", "bagel_shop", "donut_shop",
]);
// `\b` after é is false in JavaScript (é is not an ASCII word character), so
// the accented spelling gets its own alternative instead of silently missing.
const CAFE_NAME = /\b(cafe|coffee|espresso|roaster(y)?|tea house|bakery|bakeshop)\b|café/i;
const MEAL_FIRST_NAME = /\b(breakfast|brunch|pancake(s)?|waffle(s)?|diner)\b/i;

export function isCafePlace(place) {
  const primary = String(place?.primaryType || place?.primary_type || "").toLowerCase();
  // A generic restaurant named for the meal (Keke's Breakfast Cafe in the
  // live Parrish preview) is meal-first even though “Cafe” is also present.
  // Put this before café identity: the actual preview row is primary `cafe`.
  if (MEAL_FIRST_NAME.test(String(place?.name || ""))) return false;
  if (CAFE_PRIMARY.has(primary)) return true;
  // Name evidence is only a fallback when the primary is generic. It cannot
  // demote a real breakfast_restaurant called “Breakfast Café”.
  if (primary && primary !== "restaurant" && primary !== "food") return false;
  return CAFE_NAME.test(String(place?.name || ""));
}

// RANKING LAW (lib/railRank.js): Wayfind Score DESC, reviews DESC, distance
// ASC, place_id ASC. This composer previously did not rank at all — it split
// into the two identities and returned each bucket in whatever order the
// caller's array happened to be in, while BreakfastRails.js renders an
// explicit 1/2/3 `rank` from that array position. Caught by
// scripts/check-rail-rank-law.mjs enumerating this file from the filesystem
// (lib/*Rails*.js) rather than from a hand-written composer list — exactly
// the class of unguarded rail this guard exists to end.
export function splitBreakfastRails(places) {
  const breakfast = [];
  const cafes = [];
  for (const place of Array.isArray(places) ? places : []) {
    (isCafePlace(place) ? cafes : breakfast).push(place);
  }
  return [
    { id: "breakfast-restaurants", title: "Best Breakfast", deck: "Meal-first morning spots, ranked from strongest pick down.", places: rankRailPlaces(breakfast) },
    { id: "breakfast-cafes", title: "Best Cafés", deck: "Coffee, pastries, and café-first mornings — kept separate from restaurants.", places: rankRailPlaces(cafes) },
  ];
}
