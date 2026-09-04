import { classifyCuisine } from "./cuisine.js";
import { wayfindScore } from "./wayfindScore.js";
import { byWayfindScore } from "./railRank.js";

const cuisineList = (value) => value.split(" ");
export const WORTH_EATING_SCORE_FLOOR = 80;

const NON_MEAL_FORMAT_TYPES = new Set(["acai_shop", "juice_shop", "smoothie_shop"]);
const PRIMARY_CUISINE_OVERRIDES = new Map([["tex_mex_restaurant", "mexican"]]);

export const WORTH_EATING_RAILS = Object.freeze([
  { id: "american-contemporary", title: "American & Contemporary", deck: "Modern American cooking worth the table.", cuisines: cuisineList("american") },
  { id: "mexican-latin", title: "Mexican & Latin American", deck: "Bold Latin flavors across distinct traditions.", cuisines: cuisineList("mexican latin-american colombian peruvian argentine brazilian venezuelan salvadoran") },
  { id: "italian-pizza", title: "Italian & Pizza", deck: "From handmade pasta to standout pizza.", cuisines: cuisineList("italian pizza") },
  { id: "seafood-coastal", title: "Seafood & Coastal Florida", deck: "Florida seafood worth ordering by the coast.", cuisines: cuisineList("seafood") },
  { id: "cuban", title: "Cuban", deck: "Island flavor with unmistakable Havana roots.", cuisines: cuisineList("cuban") },
  { id: "caribbean", title: "Caribbean", deck: "Island kitchens serving bold regional flavor.", cuisines: cuisineList("caribbean jamaican puerto-rican haitian dominican") },
  { id: "japanese", title: "Japanese", deck: "Precision-made sushi, ramen, and more.", cuisines: cuisineList("japanese sushi ramen") },
  { id: "pan-asian", title: "Chinese & Pan-Asian", deck: "Asia's best local flavors, thoughtfully ranked.", cuisines: cuisineList("chinese asian korean thai vietnamese filipino indonesian") },
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
