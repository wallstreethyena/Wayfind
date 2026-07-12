// v5.50 audit remediation, Phase 2 — classification override table.
// Google's Places types are noisy: it auto-tags a full-service American
// seafood grill "vegan_restaurant" (because it lists vegan options), a Latin
// grill "breakfast_restaurant", etc. That's how the audit saw Seasons 52 as
// "Vegan" and Bocas Grill as "Breakfast". An override here ALWAYS wins over
// the inferred label. Keyed by normalized name (the app has no stable Google
// placeId at classification time on every surface). Seeded with the audit's
// known misfires; add more as they surface.
//
// scripts/test-classification.mjs validates this table's shape + the category
// whitelist, and fails CI on a violation.

// Canonical cuisine labels that are allowed as an override value (must match
// the CUISINE label vocabulary in lib/dining.js). Keeps overrides honest.
export const ALLOWED_CUISINES = new Set([
  "American", "Italian", "Mexican", "Latin", "Chinese", "Japanese", "Sushi",
  "Ramen", "Thai", "Vietnamese", "Korean", "Indian", "Mediterranean", "Greek",
  "Spanish", "French", "Seafood", "Steakhouse", "BBQ", "Pizza", "Burgers",
  "Breakfast", "Brunch", "Bakery", "Café", "Vegan", "Vegetarian", "Caribbean",
  "Cuban", "Southern", "Deli", "Dessert", "Tapas",
]);

function normName(s) {
  return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

// normalized-name -> override. `cuisine` sets the authoritative label;
// `suppressCuisine` blocks specific mislabels even if no positive cuisine is
// asserted; `category` pins the coarse bucket (Food/Nightlife/Activities/...).
//
// v5.75 (accuracy remediation): two new optional fields let an owner correct
// the "false water view" class of bug directly:
//   kind    — pins placeKind()'s return value (vocabulary: museum, wildlife,
//             entertainment, scenic, beach, nature, landmark, waterfront, bar,
//             cafe, restaurant, hotel, shopping, generic). Use "waterfront"
//             ONLY for a place that is genuinely on the water.
//   noWater — true forces every water/waterfront/beach assertion OFF for this
//             place (placeKind, venueLean, experienceBadges, isBeach), even if
//             its NAME contains bay/pier/marina/river/etc. This is the switch
//             for an inland place whose name merely sounds nautical.
export const PLACE_OVERRIDES = {
  // Seasons 52 — an American wine-country grill; Google's "vegan" tag is a
  // menu-feature artifact, not its identity.
  [normName("Seasons 52")]: { category: "Food", cuisine: "American", suppressCuisine: ["Vegan", "Vegetarian"] },
  // Bocas Grill — full-service Latin/Venezuelan; not a breakfast spot.
  [normName("Bocas Grill")]: { category: "Food", cuisine: "Latin", suppressCuisine: ["Breakfast"] },
  // Mochiry — genuinely ramen + coffee; both labels are fine, so no cuisine
  // override, but pin the category to Food and block a stray "Breakfast".
  [normName("Mochiry")]: { category: "Food", suppressCuisine: ["Breakfast"] },
  // The Oar & Iron — a bar & grill on US-301 in Parrish, inland, NOT on the
  // water. The nautical name was minting a false "water view" claim. Pin it to
  // bar and hard-disable every water assertion.
  [normName("The Oar & Iron")]: { category: "Food", kind: "bar", noWater: true },
  [normName("Oar & Iron")]: { category: "Food", kind: "bar", noWater: true },
};

export function overrideForName(name) {
  return PLACE_OVERRIDES[normName(name)] || null;
}

export function overrideFor(place) {
  return place && place.name ? overrideForName(place.name) : null;
}
