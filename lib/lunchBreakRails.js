import { cuisinesForPlace } from "./worthEatingRails.js";
import { wayfindScore } from "./wayfindScore.js";

export const LUNCH_BREAK_RAILS = Object.freeze([
  { id: "deli-sandwiches", title: "American Deli & Sandwiches", deck: "Subs, deli stacks, cheesesteaks, and sandwiches built for a real lunch break." },
  { id: "chicken", title: "Chicken Favorites", deck: "Chicken sandwiches, tenders, nuggets, and wings — ranked by the same Wayfind Score as every card." },
  { id: "cuban-caribbean", title: "Cuban & Caribbean", deck: "Cuban and Caribbean counters with real cuisine evidence, not a generic sandwich look-alike." },
  { id: "mexican", title: "Mexican Bowls, Burritos & Tacos", deck: "Tacos, burritos, and fast Mexican bowls that fit the middle of the day." },
  { id: "pizza-italian", title: "Pizza by the Slice & Quick Italian", deck: "Slices, pizzerias, and quick Italian kitchens — without pulling in a formal dinner room." },
  { id: "burgers", title: "Smash Burgers & Burgers", deck: "Smash burgers, hamburgers, and dedicated burger counters." },
  { id: "healthy-fast", title: "Healthy Fast Options", deck: "Salads, grain and protein bowls, poke, açaí, smoothies, and other lighter fast choices." },
]);

const CHICKEN_PRIMARY = new Set(["chicken_restaurant", "chicken_wings_restaurant"]);
const HEALTHY_PRIMARY = new Set(["acai_shop", "juice_shop", "smoothie_shop", "salad_shop", "poke_restaurant", "health_food_restaurant"]);
// This is a fixed rail contract, not the dynamic Food cuisine-chip menu.
const CUBAN_CARIBBEAN = new Set("cuban caribbean jamaican puerto-rican haitian dominican".split(" "));

const primaryOf = (place) => String(place?.primaryType || place?.primary_type || "").toLowerCase();
const typesOf = (place) => new Set((Array.isArray(place?.types) ? place.types : []).map((type) => String(type).toLowerCase()));
const nameOf = (place) => String(place?.name || "").toLowerCase();
const wordsOf = (place) => `${nameOf(place)} ${String(place?.editorial || "").toLowerCase()}`;

function membership(place) {
  const primary = primaryOf(place);
  const types = typesOf(place);
  const name = nameOf(place);
  const words = wordsOf(place);
  const cuisines = new Set(cuisinesForPlace(place));

  // Specific format/cuisine evidence wins before the generic sandwich rail.
  // That is what keeps Chicken Salad Chick in Chicken and a Cuban sandwich
  // counter in Cuban & Caribbean instead of duplicating either one.
  if (CHICKEN_PRIMARY.has(primary) || /\b(chicken|tenders?|nuggets?|winghouse|wingstop)\b/.test(name)) return "chicken";
  if ([...CUBAN_CARIBBEAN].some((cuisine) => cuisines.has(cuisine))) return "cuban-caribbean";
  if (primary === "mexican_restaurant" || primary === "tex_mex_restaurant" || /\b(taqueria|tacos?|burritos?|birria|mexican)\b/.test(name)) return "mexican";
  if (primary === "pizza_restaurant" || cuisines.has("pizza") || /\b(pizza|pizzeria|slices?)\b/.test(name)) return "pizza-italian";
  if (cuisines.has("italian") && (primary === "fast_food_restaurant" || primary === "sandwich_shop" || /\b(cafe|deli|subs?|pasta counter)\b/.test(name))) return "pizza-italian";
  if (primary === "hamburger_restaurant" || /\b(smash\s*burgers?|hamburgers?|burgers?)\b/.test(name) || (primary === "fast_food_restaurant" && types.has("hamburger_restaurant"))) return "burgers";
  if (HEALTHY_PRIMARY.has(primary) || /\b(salads?|grain bowls?|protein bowls?|poke|a[cç]a[ií]|smoothies?|juice bar|healthy bowls?)\b/.test(words)) return "healthy-fast";
  if (primary === "sandwich_shop" || primary === "deli" || types.has("sandwich_shop") || types.has("deli") || /\b(deli|sandwiches?|subs?|hoagies?|cheesesteaks?)\b/.test(name)) return "deli-sandwiches";
  return null;
}

const rank = (a, b) => {
  const scoreA = wayfindScore(a?.rating, a?.reviews);
  const scoreB = wayfindScore(b?.rating, b?.reviews);
  return (scoreB ?? -1) - (scoreA ?? -1) || ((a?.distMi ?? 99) - (b?.distMi ?? 99));
};

export function composeLunchBreakRails(places) {
  const buckets = new Map(LUNCH_BREAK_RAILS.map((rail) => [rail.id, []]));
  const seen = new Set();
  for (const place of Array.isArray(places) ? places : []) {
    if (!place?.id || seen.has(place.id)) continue;
    const railId = membership(place);
    if (!railId) continue;
    seen.add(place.id);
    buckets.get(railId).push(place);
  }
  return LUNCH_BREAK_RAILS.map((rail) => ({ ...rail, places: buckets.get(rail.id).sort(rank) }));
}
