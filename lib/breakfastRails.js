// One breakfast answer, two identities. These are intentionally exclusive:
// a café may serve breakfast, but it belongs in the café rail so the first
// rail remains a ranking of meal-first breakfast rooms.
const CAFE_PRIMARY = new Set([
  "cafe", "coffee_shop", "tea_house", "bakery", "bagel_shop", "donut_shop",
]);
// `\b` after é is false in JavaScript (é is not an ASCII word character), so
// the accented spelling gets its own alternative instead of silently missing.
const CAFE_NAME = /\b(cafe|coffee|espresso|roaster(y)?|tea house|bakery|bakeshop)\b|café/i;

export function isCafePlace(place) {
  const primary = String(place?.primaryType || place?.primary_type || "").toLowerCase();
  if (CAFE_PRIMARY.has(primary)) return true;
  // Name evidence is only a fallback when the primary is generic. It cannot
  // demote a real breakfast_restaurant called “Breakfast Café”.
  if (primary && primary !== "restaurant" && primary !== "food") return false;
  return CAFE_NAME.test(String(place?.name || ""));
}

export function splitBreakfastRails(places) {
  const breakfast = [];
  const cafes = [];
  for (const place of Array.isArray(places) ? places : []) {
    (isCafePlace(place) ? cafes : breakfast).push(place);
  }
  return [
    { id: "breakfast-restaurants", title: "Best Breakfast", deck: "Meal-first morning spots, ranked from strongest pick down.", places: breakfast },
    { id: "breakfast-cafes", title: "Best Cafés", deck: "Coffee, pastries, and café-first mornings — kept separate from restaurants.", places: cafes },
  ];
}
