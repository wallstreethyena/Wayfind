import { classifyCuisine } from "./cuisine.js";
import { wayfindScore } from "./wayfindScore.js";
import { byWayfindScore } from "./railRank.js";

const cuisineList = (value) => value.split(" ");
export const WORTH_EATING_SCORE_FLOOR = 80;

const NON_MEAL_FORMAT_TYPES = new Set(["acai_shop", "juice_shop", "smoothie_shop"]);
const PRIMARY_CUISINE_OVERRIDES = new Map([["tex_mex_restaurant", "mexican"]]);

export const WORTH_EATING_RAILS = Object.freeze([
  { id: "american-contemporary", title: "American & Contemporary", deck: "American restaurants, with specific seafood and Latin kitchens kept in their own rails.", cuisines: cuisineList("american") },
  { id: "mexican-latin", title: "Mexican & Latin American", deck: "Mexican cooking plus distinct Latin American traditions, without folding in Cuban or Caribbean kitchens.", cuisines: cuisineList("mexican latin-american colombian peruvian argentine brazilian venezuelan salvadoran") },
  { id: "italian-pizza", title: "Italian & Pizza", deck: "Italian dining and pizza specialists, ranked together without borrowing generic restaurants.", cuisines: cuisineList("italian pizza") },
  { id: "seafood-coastal", title: "Seafood & Coastal Florida", deck: "Seafood-first kitchens for the Florida coast — not every restaurant near the water.", cuisines: cuisineList("seafood") },
  { id: "cuban", title: "Cuban", deck: "Cuban kitchens with cuisine evidence, kept distinct from the wider Latin rail.", cuisines: cuisineList("cuban") },
  { id: "caribbean", title: "Caribbean", deck: "Caribbean, Jamaican, Puerto Rican, Haitian, and Dominican cooking in one island-focused rail.", cuisines: cuisineList("caribbean jamaican puerto-rican haitian dominican") },
  { id: "japanese", title: "Japanese", deck: "Japanese kitchens, sushi, and ramen — separated from the catch-all Asian rail.", cuisines: cuisineList("japanese sushi ramen") },
  { id: "pan-asian", title: "Chinese & Pan-Asian", deck: "Chinese, Korean, Thai, Vietnamese, Filipino, Indonesian, and broader Pan-Asian cooking.", cuisines: cuisineList("chinese asian korean thai vietnamese filipino indonesian") },
]);

// Assignment is most-specific first, display order is the founder's Florida
// popularity order above. Keeping those two concerns separate prevents a
// generic `latin-american` or `asian` token from stealing a Cuban/Japanese row.
const ASSIGNMENT_ORDER = ["cuban", "caribbean", "japanese", "pan-asian", "seafood-coastal", "italian-pizza", "mexican-latin", "american-contemporary"];
const BY_ID = new Map(WORTH_EATING_RAILS.map((rail) => [rail.id, rail]));

export function cuisinesForPlace(place) {
  const held = Array.isArray(place?.cuisines) ? place.cuisines.filter(Boolean).map(String) : [];
  const inferred = classifyCuisine({
    name: place?.name || "",
    google_types: place?.google_types || place?.types || [],
    primary_type: place?.primary_type || place?.primaryType || null,
    editorial: place?.editorial || "",
  }).cuisines;
  const primary = String(place?.primary_type || place?.primaryType || "").toLowerCase();
  const override = PRIMARY_CUISINE_OVERRIDES.get(primary);
  return [...new Set([...held, ...inferred, ...(override ? [override] : [])])];
}

export function isWorthEatingPlace(place) {
  if (!place) return false;
  const primary = String(place.primary_type || place.primaryType || "").toLowerCase();
  if (primary === "fast_food_restaurant") return false;
  const types = Array.isArray(place.types) ? place.types.map((type) => String(type).toLowerCase()) : [];
  if ((primary === "restaurant" || !primary) && types.some((type) => NON_MEAL_FORMAT_TYPES.has(type))) return false;
  const score = wayfindScore(place.rating, place.reviews);
  return score != null && score >= WORTH_EATING_SCORE_FLOOR;
}

export function composeWorthEatingRails(places) {
  const buckets = new Map(WORTH_EATING_RAILS.map((rail) => [rail.id, []]));
  for (const place of Array.isArray(places) ? places : []) {
    if (!isWorthEatingPlace(place)) continue;
    const signals = new Set(cuisinesForPlace(place));
    const railId = ASSIGNMENT_ORDER.find((id) => BY_ID.get(id).cuisines.some((cuisine) => signals.has(cuisine)));
    if (railId) buckets.get(railId).push(place);
  }
  // RANKING LAW (lib/railRank.js): Wayfind Score DESC, reviews DESC, distance
  // ASC, place_id ASC — distance is a tie-break only.
  return WORTH_EATING_RAILS.map((rail) => ({ ...rail, places: buckets.get(rail.id).sort(byWayfindScore) }));
}
