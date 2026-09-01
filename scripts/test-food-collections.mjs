// scripts/test-food-collections.mjs — lock test for Food collections (lib/foodCollections.js).
import { buildFoodCollections, isFood, COLLECTIONS, RAW_CATEGORY_NAMES } from "../lib/foodCollections.js";
import { composeWorthEatingRails, WORTH_EATING_RAILS } from "../lib/worthEatingRails.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };

ok(COLLECTIONS.every((c) => !RAW_CATEGORY_NAMES.includes(c.label)), "labels are never raw category names");
ok(isFood({ types: ["restaurant"] }) === true, "restaurant is food");
ok(isFood({ name: "Owen's Fish Camp", types: ["point_of_interest"] }) === false || isFood({ name: "Owen's Fish Camp" }) , "name heuristic");
ok(isFood({ types: ["museum"], name: "Art Museum" }) === false, "museum is not food");

const center = { lat: 27.34, lng: -82.53 };
const p = (id, o) => ({ place_id: id, name: id, types: ["restaurant"], lat: 27.34, lng: -82.53, ...o });
const places = [
  p("dn1", { rating: 4.7, priceLevel: 4, reviewCount: 800 }),
  p("dn2", { rating: 4.8, priceLevel: 3, reviewCount: 400 }),
  p("dn3", { rating: 4.9, priceLevel: 3, reviewCount: 250 }),
  p("lo1", { rating: 4.7, priceLevel: 2, reviewCount: 1500 }),
  p("lo2", { rating: 4.6, priceLevel: 2, reviewCount: 900 }),
  p("lo3", { rating: 4.8, priceLevel: 2, reviewCount: 2000 }),
  p("dr1", { rating: 4.7, priceLevel: 2, reviewCount: 400, lat: 27.57, lng: -82.72 }),
  p("dr2", { rating: 4.8, priceLevel: 2, reviewCount: 350, lat: 27.6, lng: -82.75 }),
  p("dr3", { rating: 4.6, priceLevel: 2, reviewCount: 420, lat: 27.58, lng: -82.71 }),
  p("m1", { rating: 4.5, priceLevel: 1, reviewCount: 120 }),
  p("m2", { rating: 4.6, priceLevel: 1, reviewCount: 90 }),
  p("m3", { rating: 4.5, priceLevel: 1, reviewCount: 200 }),
  p("t1", { rating: 4.4, priceLevel: 2, reviewCount: 300 }),
  p("t2", { rating: 4.4, priceLevel: 2, reviewCount: 310 }),
  p("t3", { rating: 4.4, priceLevel: 2, reviewCount: 320 }),
  p("nofood", { rating: 4.9, reviewCount: 999, types: ["museum"], name: "Museum" }),
];
const cols = buildFoodCollections(places, { center });

ok(cols.length >= 3 && cols.length <= 5, "3–5 food collections: " + cols.length);
ok(cols.every((c) => c.places.length >= 3), "every collection has >=3 places");
// dinner filters to food types: non-food never appears
ok(!cols.some((c) => c.places.some((pl) => pl.place_id === "nofood")), "non-food excluded from all collections");
// dedupe
const seen = new Set(); let dup = false;
for (const c of cols) for (const pl of c.places) { if (seen.has(pl.place_id)) dup = true; seen.add(pl.place_id); }
ok(!dup, "no place in two collections");
// date night respects priceLevel when present
const dn = cols.find((c) => c.id === "date-night");
if (dn) ok(dn.places.every((pl) => pl.priceLevel == null || pl.priceLevel >= 3), "date night is upscale (priceLevel>=3)");
// locals require many reviews
const lo = cols.find((c) => c.id === "locals-love");
if (lo) ok(lo.places.every((pl) => pl.reviewCount >= 500), "locals are high-review");

const cuisinePlaces = [
  { id: "american", name: "American Room", cuisines: ["american"], rating: 4.6, reviews: 900 },
  { id: "latin", name: "Latin Room", cuisines: ["latin-american"], rating: 4.5, reviews: 900 },
  { id: "italian", name: "Italian Room", cuisines: ["italian"], rating: 4.6, reviews: 800 },
  { id: "seafood", name: "Coastal Room", cuisines: ["american", "seafood"], rating: 4.7, reviews: 700 },
  { id: "cuban", name: "Cuban Room", cuisines: ["latin-american", "cuban"], rating: 4.7, reviews: 600 },
  { id: "caribbean", name: "Island Room", cuisines: ["caribbean"], rating: 4.8, reviews: 500 },
  { id: "japanese", name: "Japanese Room", cuisines: ["asian", "japanese"], rating: 4.8, reviews: 400 },
  { id: "asian", name: "Thai Room", cuisines: ["asian", "thai"], rating: 4.9, reviews: 300 },
];
const cuisineRails = composeWorthEatingRails(cuisinePlaces);
ok(cuisineRails.length === 8 && cuisineRails.map((r) => r.id).join(",") === WORTH_EATING_RAILS.map((r) => r.id).join(","), "Actually Worth Eating has the founder's exact eight-rail order");
ok(cuisineRails.every((rail) => rail.places.length === 1), "all eight cuisine rails receive their proven fixture");
ok(cuisineRails.find((r) => r.id === "cuban").places[0].id === "cuban", "specific Cuban evidence beats generic Latin American");
ok(cuisineRails.find((r) => r.id === "japanese").places[0].id === "japanese", "specific Japanese evidence beats generic Asian");
ok(cuisineRails.find((r) => r.id === "seafood-coastal").places[0].id === "seafood", "seafood evidence beats generic American");
ok(new Set(cuisineRails.flatMap((rail) => rail.places.map((pl) => pl.id))).size === cuisinePlaces.length, "no restaurant leaks into two cuisine rails");
const guarded = composeWorthEatingRails([
  { id: "great", name: "Great Room", cuisines: ["american"], rating: 4.8, reviews: 500 },
  { id: "weak", name: "Weak Room", cuisines: ["american"], rating: 3.8, reviews: 500 },
  { id: "fast", name: "Fast Chain", cuisines: ["american"], primaryType: "fast_food_restaurant", rating: 4.8, reviews: 500 },
  { id: "smoothie", name: "Brazil Bowls", cuisines: ["brazilian"], primaryType: "restaurant", types: ["restaurant", "acai_shop"], rating: 4.8, reviews: 500 },
]);
ok(guarded.flatMap((rail) => rail.places).map((place) => place.id).join(",") === "great", "the answer refuses low-score, fast-food, and smoothie-counter look-alikes");
const orderedAmerican = composeWorthEatingRails([
  { id: "lower", name: "Lower", cuisines: ["american"], rating: 4.4, reviews: 500 },
  { id: "higher", name: "Higher", cuisines: ["american"], rating: 4.9, reviews: 500 },
]).find((rail) => rail.id === "american-contemporary");
ok(orderedAmerican.places.map((place) => place.id).join(",") === "higher,lower", "each cuisine rail is explicitly ranked highest Wayfind Score to lowest");

console.log(`test-food-collections: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
