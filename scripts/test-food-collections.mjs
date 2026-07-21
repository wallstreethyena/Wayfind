// scripts/test-food-collections.mjs — lock test for Food collections (lib/foodCollections.js).
import { buildFoodCollections, isFood, COLLECTIONS, RAW_CATEGORY_NAMES } from "../lib/foodCollections.js";
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

console.log(`test-food-collections: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
