import fs from "node:fs";
import {
  TODAY_DISCOVERY_RAIL_DEFS,
  composeTodayDiscoveryRails,
  hasInstagramEvidence,
  isBestFood,
  isDestinationPark,
  isFloridaSpring,
  isGolfPlace,
  isNaturePlace,
  isPickleballPlace,
  isTopActivity,
  isWaterActivity,
} from "../lib/todayDiscoveryRails.js";
import { RAILS } from "../lib/rails.js";
import { wayfindScore } from "../lib/wayfindScore.js";

let pass = 0;
const fail = [];
const ok = (condition, message) => { if (condition) pass++; else fail.push(message); };
const place = (id, name, primaryType, types, extras = {}) => ({
  id, name, primaryType, types, rating: 4.8, reviews: 800, distMi: 5,
  photo: "https://images.example/" + id + ".jpg", ...extras,
});

const fixtures = [
  place("activity", "The Great Museum", "museum", ["museum", "tourist_attraction"]),
  place("instagram", "Catrina's Tacos", "mexican_restaurant", ["mexican_restaurant"], { distMi: 4 }),
  place("spring", "Rainbow Springs State Park", "state_park", ["state_park", "park"]),
  place("beach-good", "Coquina Beach", "beach", ["beach"], { water: { result: "good", sampled_at: new Date().toISOString() } }),
  place("food", "Best Bistro", "american_restaurant", ["american_restaurant"]),
  place("water", "Manatee Kayak Tours", "tour_agency", ["tour_agency", "kayaking"]),
  place("park", "Florida Adventure Theme Park", "theme_park", ["theme_park", "amusement_park"]),
  place("nature", "Myakka River State Park", "state_park", ["state_park", "nature_preserve"]),
  place("golf", "River Strand Golf Course", "golf_course", ["golf_course"]),
  place("pickleball", "Parrish Pickleball Club", "sports_club", ["sports_club", "athletic_field"]),
];

ok(TODAY_DISCOVERY_RAIL_DEFS.length === 10, "Today's Best Options has exactly ten approved rails");
ok(TODAY_DISCOVERY_RAIL_DEFS.map((rail) => rail.id).join(",") === "activities,instagram,springs,beaches,food,water,parks,nature,golf,pickleball", "the ten rails keep the founder-approved order");
ok(isTopActivity(fixtures[0]), "a high-scoring museum reaches Top Activities");
ok(hasInstagramEvidence(fixtures[1], "Tampa"), "a verified Instagram association reaches Instagram Places");
ok(isFloridaSpring(fixtures[2]), "a structured state-park spring reaches Florida Springs");
ok(isBestFood(fixtures[4]), "high-scoring restaurant evidence reaches Best Food");
ok(isWaterActivity(fixtures[5]), "kayaking evidence reaches Water Activities");
ok(isDestinationPark(fixtures[6]), "theme-park identity reaches Parks & Zoos");
ok(isNaturePlace(fixtures[7]), "a state park reaches Go Explore Nature");
ok(isGolfPlace(fixtures[8]), "a real golf course reaches Golf");
ok(isPickleballPlace(fixtures[9]), "specific pickleball evidence reaches Pickleball");

const rails = composeTodayDiscoveryRails(fixtures, { city: "Tampa" }).rails;
ok(rails.length === 10, "the composer returns all ten rails, including honest empty rails");
const expectedIds = {
  activities: ["activity"], instagram: ["instagram"], springs: ["spring"],
  beaches: ["beach-good"], food: ["instagram", "food"], water: ["water"],
  parks: ["park"], nature: ["nature"], golf: ["golf"], pickleball: ["pickleball"],
};
for (const [id, expected] of Object.entries(expectedIds)) {
  const actual = rails.find((rail) => rail.id === id)?.places.map((row) => row.id).sort() || [];
  ok(actual.join(",") === expected.slice().sort().join(","), `${id} contains only evidence-qualified fixtures`);
}
ok(rails.find((rail) => rail.id === "activities").places.every((row) => !["spring", "beach-good", "water", "park", "nature", "golf", "pickleball"].includes(row.id)), "specialized outdoor identities do not leak into Top Activities");

const ordered = composeTodayDiscoveryRails([
  place("low", "Lower Museum", "museum", ["museum"], { rating: 4.3, reviews: 300 }),
  place("high", "Higher Museum", "museum", ["museum"], { rating: 4.9, reviews: 300 }),
]).rails.find((rail) => rail.id === "activities").places;
ok(ordered.map((row) => row.id).join(",") === "high,low", "ordinary rails rank highest-to-lowest by canonical Wayfind Score");
ok(wayfindScore(ordered[0].rating, ordered[0].reviews) > wayfindScore(ordered[1].rating, ordered[1].reviews), "the asserted order is backed by the displayed score formula");

const beaches = composeTodayDiscoveryRails([
  place("excellent-poor", "Excellent Beach", "beach", ["beach"], { rating: 4.9, reviews: 2000, water: { result: "poor", sampled_at: new Date().toISOString() } }),
  place("good-water", "Good Water Beach", "beach", ["beach"], { rating: 4.5, reviews: 500, water: { result: "good", sampled_at: new Date().toISOString() } }),
]).rails.find((rail) => rail.id === "beaches").places;
ok(beaches.map((row) => row.id).join(",") === "good-water,excellent-poor", "current good water outranks a higher-score beach with poor water");

const leaks = [
  place("noisy-restaurant", "Kitchen and Cocktails", "restaurant", ["restaurant", "bar", "tourist_attraction"]),
  place("spring-hill-shop", "Spring Hill Golf Shop", "store", ["store", "sporting_goods_store"]),
  place("mini-golf", "Adventure Mini Golf", "miniature_golf_course", ["miniature_golf_course"]),
  place("marina-store", "Beach Marina Supply", "store", ["store"]),
  place("tennis", "Parrish Tennis Club", "sports_club", ["sports_club"]),
];
ok(!isTopActivity(leaks[0]), "a restaurant with a noisy tourist-attraction token cannot become Top Activities");
ok(!isFloridaSpring(leaks[1]), "Spring Hill retail cannot become a Florida spring");
ok(!isGolfPlace(leaks[2]), "miniature golf cannot become Golf");
ok(!isWaterActivity(leaks[3]), "a marina supply store cannot become a water activity");
ok(!isPickleballPlace(leaks[4]), "a generic sports club cannot become Pickleball without pickleball evidence");

const todayRail = RAILS.find((rail) => rail.id === "today");
ok(todayRail?.title === "Today's Best Options" && todayRail?.art === "today", "the combined poster replaces the guarded Today artwork slot");
ok(!RAILS.some((rail) => rail.id === "best" || rail.id === "gems"), "Best Around You and Places You'd Never Find are retired from the homepage poster registry");

const route = fs.readFileSync(new URL("../app/api/today-discovery/route.js", import.meta.url), "utf8");
ok(/fastCachedRail\(key/.test(route) && /serveFromInventory/.test(route) && !/searchPlaces|places\.googleapis/.test(route), "the endpoint is FastCache-backed, owned-inventory-only, and makes no Google search");
ok(/Promise\.all\(categories\.map/.test(route), "all six inventory categories load in parallel instead of a serial waterfall");
ok(/cityKey/.test(route) && /inventoryCategories\?\.includes\("beach"\)/.test(route), "cache identity includes creator city and duplicated beach inventory still receives water evidence");
const component = fs.readFileSync(new URL("../app/components/TodayDiscoveryRails.js", import.meta.url), "utf8");
ok(/fetch\("\/api\/today-discovery\?"/.test(component) && /payload\.rails\.map/.test(component), "the lazy drop fetches and renders the dedicated ten-rail answer");

if (fail.length) {
  console.error("test-today-discovery-rails: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`test-today-discovery-rails: OK — ${pass} assertions`);
