// Regression contract for the shared breakfast/café identity decision.
// These cases cover the provider aliases seen in inventory and the two
// outward-facing surfaces: Food menu chips and the Breakfast poster rails.
import { placeAllowed } from "../lib/placeFilter.js";
import { isMorningCandidate, morningDisplayIdentity } from "../lib/morningIdentity.js";
import { splitBreakfastRails } from "../lib/breakfastRails.js";
import { isBreakfastPlace } from "../lib/breakfast.js";

let total = 0;
let failed = 0;
const ok = (condition, message) => {
  total++;
  if (!condition) {
    failed++;
    console.error(`FAIL: ${message}`);
  }
};

const menu = (subId, place) => placeAllowed("food", subId, place);
const aliasesAgree = (place) => menu("cafes", place) === menu("coffee", place);

const keke = {
  name: "Keke's Breakfast Cafe",
  primary_type: "breakfast_restaurant",
  types: ["breakfast_restaurant", "cafe", "restaurant", "food"],
};
const coffeeShop = {
  name: "Buddy Brew Coffee",
  primaryType: "coffee_shop",
  types: ["coffee_shop", "cafe", "food"],
};
const bakeryCafe = {
  name: "Pineapple Bakery Cafe",
  primaryType: "bakery",
  types: ["bakery", "cafe", "food"],
};
const arte = {
  name: "Arte Caffè",
  primaryType: "italian_restaurant",
  types: ["italian_restaurant", "bakery", "cafe", "food"],
};
const adobeKava = {
  name: "Adobe Kava",
  primaryType: "cafe",
  types: ["cafe", "coffee_shop", "tea_house", "food"],
};
const neutralPrimaryCoffee = { name: "Neutral Room", primaryType: "coffee_shop", types: [] };
const bagels = { name: "Bagels and More", primaryType: "bagel_shop", types: [] };
const crackerBarrel = {
  name: "Cracker Barrel Old Country Store",
  primaryType: "american_restaurant",
  types: ["american_restaurant", "breakfast_restaurant", "restaurant", "food"],
};
const namedItalian = { name: "Italian Coffee Boulevard", primaryType: "italian_restaurant", types: ["italian_restaurant", "food"] };
const southernComfort = {
  name: "Southern Comfort Bed and Breakfast",
  primaryType: "lodging",
  types: ["lodging", "bed_and_breakfast"],
};
const campfired = { name: "Campfired", types: ["breakfast_restaurant", "cafe", "food"] };
const jimmyDean = { name: "Jimmy Dean Bed and Breakfast", types: [] };
const pizzaHaven = { name: "Pizza Haven - NY Style", primaryType: "pizza_restaurant", types: ["pizza_restaurant", "diner", "meal_takeaway", "restaurant", "food"] };
const bayshoreNutrition = { name: "BAYSHORE NUTRITION - Herbalife Nutrition Smoothie Bar", primaryType: "restaurant", types: ["acai_shop", "brazilian_restaurant", "tea_house", "coffee_shop", "cafe", "food_store"] };
const herbalifeCafe = { name: "Herbalife Nutrition Cafe", primaryType: "restaurant", types: ["cafe", "coffee_shop", "food"] };
const mcdonaldsCoffee = { name: "McDonald's Coffee", primaryType: "restaurant", types: ["cafe", "coffee_shop", "food"] };
const googleTypesCafe = { name: "Neutral GoogleTypes Room", googleTypes: ["cafe", "food"] };

// Precision: a meal-first room cannot leak into either café alias, and a
// coffee-forward room cannot leak into Best Breakfast.
ok(morningDisplayIdentity(keke) === "breakfast", "meal-first primary_type resolves to breakfast");
ok(menu("breakfast", keke) === true, "Keke remains a Best Breakfast result");
ok(menu("cafes", keke) === false && menu("coffee", keke) === false, "Keke cannot pass Cafés or Coffee");
ok(morningDisplayIdentity(coffeeShop) === "cafe", "coffee_shop primaryType resolves to café");
ok(menu("breakfast", coffeeShop) === false, "pure coffee shop cannot pass Breakfast");
ok(menu("cafes", coffeeShop) === true && menu("coffee", coffeeShop) === true, "pure coffee shop passes both café aliases");

// Recall: bakery cafés are still useful coffee/morning results; meal-first
// breakfast rooms still survive even when their name includes Café.
ok(morningDisplayIdentity(bakeryCafe) === "cafe", "bakery café remains a café identity");
ok(menu("cafes", bakeryCafe) === true && menu("coffee", bakeryCafe) === true, "bakery café remains in both café aliases");
ok(menu("breakfast", bakeryCafe) === false, "bakery café does not become a breakfast restaurant");
ok(morningDisplayIdentity(arte) === "cafe" && menu("cafes", arte) === true && menu("coffee", arte) === true,
  "Arte Caffè keeps its real bakery/café identity despite an Italian primary");
ok(morningDisplayIdentity(neutralPrimaryCoffee) === "cafe" && menu("cafes", neutralPrimaryCoffee) === true && menu("coffee", neutralPrimaryCoffee) === true,
  "primary coffee_shop remains visible even with an empty types array");
ok(morningDisplayIdentity(bagels) === "cafe" && menu("cafes", bagels) === true && menu("coffee", bagels) === true,
  "primary bagel_shop remains visible even with an empty types array");
ok(morningDisplayIdentity(crackerBarrel) === "breakfast" && menu("breakfast", crackerBarrel) === true,
  "Cracker Barrel keeps breakfast from its explicit secondary breakfast type");
ok(morningDisplayIdentity(adobeKava) === null && menu("breakfast", adobeKava) === false && menu("cafes", adobeKava) === false && menu("coffee", adobeKava) === false,
  "Adobe Kava is excluded from every morning surface, not just the menu");
ok(morningDisplayIdentity(namedItalian) === null && menu("cafes", namedItalian) === false,
  "a cuisine-primary restaurant needs explicit café type evidence, not just a coffee name");
ok(morningDisplayIdentity(southernComfort) === null && menu("breakfast", southernComfort) === false && menu("cafes", southernComfort) === false && menu("coffee", southernComfort) === false,
  "Southern Comfort Bed and Breakfast is lodging, never a morning discovery card");
ok(morningDisplayIdentity(campfired) === "cafe" && menu("breakfast", campfired) === false && menu("cafes", campfired) === true && menu("coffee", campfired) === true,
  "Campfired missing-primary dual service follows the café-safe tie policy");
ok(morningDisplayIdentity(jimmyDean) === null && menu("breakfast", jimmyDean) === false && menu("cafes", jimmyDean) === false && menu("coffee", jimmyDean) === false,
  "Jimmy Dean Bed and Breakfast is rejected even when the provider sends no types");
ok(isBreakfastPlace(pizzaHaven) === false && morningDisplayIdentity(pizzaHaven) === null && menu("breakfast", pizzaHaven) === false && menu("cafes", pizzaHaven) === false,
  "Pizza Haven inherits the rail's cuisine-primary veto on every morning surface");
ok(isBreakfastPlace(bayshoreNutrition) === false && morningDisplayIdentity(bayshoreNutrition) === null && menu("breakfast", bayshoreNutrition) === false && menu("cafes", bayshoreNutrition) === false && menu("coffee", bayshoreNutrition) === false,
  "Bayshore Nutrition inherits the rail's nutrition-club veto on every morning surface");
ok(morningDisplayIdentity(herbalifeCafe) === null && menu("cafes", herbalifeCafe) === false && menu("coffee", herbalifeCafe) === false,
  "a generic Herbalife Nutrition Cafe cannot bypass the canonical nutrition veto by name");
ok(morningDisplayIdentity(mcdonaldsCoffee) === null && menu("cafes", mcdonaldsCoffee) === false && menu("coffee", mcdonaldsCoffee) === false,
  "McDonald's Coffee cannot bypass the canonical national quick-service veto by name");
ok(morningDisplayIdentity(googleTypesCafe) === "cafe" && menu("cafes", googleTypesCafe) === true && menu("coffee", googleTypesCafe) === true,
  "googleTypes-only café is normalized before canonical eligibility and remains visible");

// Provider completeness varies.  Missing explicit primary must use type
// evidence, and type array order must never alter the answer.
const noPrimaryCafe = { name: "Neutral Morning Room", types: ["cafe", "food"] };
const dualA = { name: "Neutral Dual Service", google_types: ["breakfast_restaurant", "cafe", "food"] };
const dualB = { name: "Neutral Dual Service", google_types: ["food", "cafe", "breakfast_restaurant"] };
ok(isMorningCandidate(noPrimaryCafe) === true && morningDisplayIdentity(noPrimaryCafe) === "cafe", "missing primary uses café type evidence");
ok(menu("breakfast", noPrimaryCafe) === false, "neutral café with no primary cannot fall into Breakfast");
ok(menu("cafes", noPrimaryCafe) === true, "neutral café with no primary remains visible in Cafés");
ok(morningDisplayIdentity(dualA) === "cafe" && morningDisplayIdentity(dualB) === "cafe", "dual-service type order is invariant and café-safe");
ok(menu("cafes", dualA) === menu("cafes", dualB) && menu("coffee", dualA) === menu("coffee", dualB), "google_types order cannot split menu aliases");
ok(menu("cafes", dualA) === true && menu("coffee", dualA) === true, "google_types-only café is visible through both menu aliases");

// The two labels are contractual aliases for every representative identity,
// including an excluded meal-first venue and a specific non-morning venue.
for (const place of [keke, coffeeShop, bakeryCafe, arte, adobeKava, neutralPrimaryCoffee, bagels, noPrimaryCafe, { name: "Dinner Place", primaryType: "italian_restaurant", types: ["italian_restaurant", "food"] }]) {
  ok(aliasesAgree(place), `Cafés and Coffee agree for ${place.name}`);
}

// The poster receives broad Food candidates, not just a breakfast query.  It
// must display only the resolved identities, exactly once each.
const poster = splitBreakfastRails([
  { ...keke, id: "keke", rating: 4.7, reviews: 500 },
  { ...coffeeShop, id: "coffee", rating: 4.8, reviews: 200 },
  { ...noPrimaryCafe, id: "missing-primary", rating: 4.6, reviews: 120 },
  { ...arte, id: "arte", rating: 4.5, reviews: 90 },
  { ...adobeKava, id: "adobe-kava", rating: 4.9, reviews: 600 },
  { ...neutralPrimaryCoffee, id: "neutral-primary", rating: 4.4, reviews: 80 },
  { ...bagels, id: "bagels", rating: 4.3, reviews: 70 },
  { ...crackerBarrel, id: "cracker", rating: 4.2, reviews: 1000 },
  { ...southernComfort, id: "southern-comfort", rating: 4.9, reviews: 700 },
  { ...campfired, id: "campfired", rating: 4.5, reviews: 90 },
  { ...jimmyDean, id: "jimmy-dean", rating: 4.9, reviews: 900 },
  { ...pizzaHaven, id: "pizza-haven", rating: 4.9, reviews: 900 },
  { ...bayshoreNutrition, id: "bayshore-nutrition", rating: 4.9, reviews: 900 },
  { ...herbalifeCafe, id: "herbalife-cafe", rating: 4.9, reviews: 900 },
  { ...mcdonaldsCoffee, id: "mcdonalds-coffee", rating: 4.9, reviews: 900 },
  { ...googleTypesCafe, id: "google-types-cafe", rating: 4.35, reviews: 75 },
  { id: "dinner", name: "Dinner Place", primaryType: "italian_restaurant", types: ["italian_restaurant", "food"], rating: 4.9, reviews: 999 },
]);
ok(poster[0].places.map((place) => place.id).join(",") === "keke,cracker", "poster keeps meal-first and secondary-breakfast rooms in Best Breakfast");
ok(poster[1].places.map((place) => place.id).join(",") === "coffee,missing-primary,arte,campfired,neutral-primary,google-types-cafe,bagels", "poster keeps every café identity and excludes Kava/lodging/canonical vetoes");
ok(new Set(poster.flatMap((rail) => rail.places.map((place) => place.id))).size === 9, "poster excludes non-morning/Kava/lodging/rail-veto candidates and never duplicates a card");

// Exact surface parity: every shared fixture has one answer in the menu and
// the same answer in the two poster rails.  This catches either kind of drift:
// a menu-only veto (the Adobe Kava bug) or a SUB_ALLOW false negative (the
// empty-types coffee/bagel bugs).
const breakfastIds = new Set(poster[0].places.map((place) => place.id));
const cafeIds = new Set(poster[1].places.map((place) => place.id));
for (const [id, place] of [
  ["keke", keke], ["coffee", coffeeShop], ["missing-primary", noPrimaryCafe],
  ["arte", arte], ["adobe-kava", adobeKava], ["neutral-primary", neutralPrimaryCoffee],
  ["bagels", bagels], ["cracker", crackerBarrel],
  ["southern-comfort", southernComfort], ["campfired", campfired],
  ["jimmy-dean", jimmyDean], ["pizza-haven", pizzaHaven], ["bayshore-nutrition", bayshoreNutrition],
  ["herbalife-cafe", herbalifeCafe], ["mcdonalds-coffee", mcdonaldsCoffee], ["google-types-cafe", googleTypesCafe],
]) {
  ok(menu("breakfast", place) === breakfastIds.has(id), `Breakfast menu and poster agree for ${place.name}`);
  ok(menu("cafes", place) === cafeIds.has(id) && menu("coffee", place) === cafeIds.has(id), `Café aliases and poster agree for ${place.name}`);
}

console.log(`test-morning-identity: ${total - failed}/${total} passed`);
if (failed) process.exit(1);
