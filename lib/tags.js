// v2.0 trust layer: one primary identity per place, and a category
// compatibility map that hard-gates which badges may show. This sits ON TOP of
// the evidence gates in experienceBadges (v1.9): a tag must pass BOTH evidence
// and compatibility. Pure module, no dependencies, unit-tested by fixtures.

const T = (types) => (types || []).map((x) => String(x).toLowerCase());

// One clear primary identity. Precedence matters: explicit strong identities
// (hotel, theme park, museum, park) win over generic tourist_attraction, and a
// restaurant with a tourist_attraction tag stays dining (T-Rex Cafe).
export function resolveIdentity(types, isEvent) {
  if (isEvent) return "event";
  const t = T(types);
  const has = (...k) => k.some((x) => t.includes(x));
  const hasPart = (s) => t.some((x) => x.includes(s));
  if (has("lodging", "hotel", "motel", "resort_hotel", "bed_and_breakfast", "guest_house")) return "hotel";
  if (has("amusement_park", "theme_park", "water_park")) return "themePark";
  if (has("zoo", "aquarium")) return "attraction";
  if (has("museum", "art_gallery")) return "museum";
  if (has("park", "national_park", "state_park", "botanical_garden", "hiking_area", "campground", "natural_feature", "garden", "beach", "rv_park")) return "park";
  if (hasPart("_restaurant") || has("restaurant", "meal_takeaway", "meal_delivery", "food_court", "deli", "diner")) return "dining";
  if (has("cafe", "coffee_shop", "bakery", "ice_cream_shop", "tea_house", "juice_shop", "donut_shop", "dessert_shop")) return "dining";
  if (has("bar", "night_club", "pub", "wine_bar", "brewery", "brewpub", "cocktail_bar")) return "dining";
  if (has("tourist_attraction", "bowling_alley", "movie_theater", "casino", "performing_arts_theater", "stadium", "arena", "event_venue", "concert_hall")) return "attraction";
  if (has("shopping_mall", "market", "department_store", "store", "shopping_center") || hasPart("_store")) return "shopping";
  return "unknown";
}

// Which badge keys are compatible with each identity. Anything not listed is
// blocked for that identity regardless of evidence.
export const ALLOW = {
  dining: ["gem", "value", "localfav", "bestof", "waterfront", "rooftop", "romantic", "livemusic", "outdoor", "groups", "dog", "family", "instagram", "cocktails", "wine", "beer", "sports", "coffee", "breakfast", "pizza", "sushi", "steak", "seafood", "burgers", "mexican", "italian", "dessert", "entertainment"],
  themePark: ["family", "entertainment", "instagram", "waterfront", "localfav", "bestof"],
  attraction: ["family", "entertainment", "instagram", "outdoor", "waterfront", "gem", "value", "localfav", "bestof", "livemusic"],
  museum: ["museum", "family", "instagram", "gem", "value", "localfav", "bestof"],
  park: ["nature", "outdoor", "family", "instagram", "dog", "waterfront", "gem", "localfav", "bestof"],
  hotel: ["waterfront", "rooftop", "romantic", "instagram", "family", "gem", "value", "localfav", "bestof"],
  shopping: ["family", "instagram", "entertainment", "gem", "value", "localfav", "bestof"],
  event: ["livemusic", "family", "instagram"],
  unknown: ["gem", "value", "localfav", "bestof", "instagram", "waterfront"],
};

// Gate a candidate key list by identity. Returns what shows and what was
// blocked, each block with its deterministic reason (debug audit uses this).
export function filterAllowed(identity, keys) {
  const allow = new Set(ALLOW[identity] || ALLOW.unknown);
  const shown = [];
  const blocked = [];
  for (const k of keys || []) {
    if (allow.has(k)) shown.push(k);
    else blocked.push({ key: k, reason: "not compatible with " + identity });
  }
  return { shown, blocked };
}

// True park-admission cue: only actual theme/amusement/water parks. A
// restaurant at Disney Springs (dining) or the Springs itself (attraction with
// shopping types) never triggers it.
export function requiresParkAdmission(types) {
  const t = T(types);
  return ["amusement_park", "theme_park", "water_park"].some((x) => t.includes(x));
}

// Venue-appropriate label for the review-grounded highlights section.
export function sectionLabel(identity) {
  if (identity === "dining") return "What to order";
  if (identity === "park") return "What to see";
  if (identity === "event") return "Know before you go";
  return "Don't miss";
}
