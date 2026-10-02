// scripts/test-taxonomy-identity.mjs — the 2026-10-01 taxonomy audit, locked.
//
// THE REPORT: another agent found a taco place under Food → Breakfast. The
// owner asked for the whole taxonomy to be audited. A live audit of every
// Wayfind submenu (8 cities, the production inventory, judged on PRIMARY
// type) and of the Breakfast home rails found the same disease in many
// places: a narrow chip or rail admitted a place on a SECONDARY Google tag or
// a word in its NAME while its primary identity said something else.
//
// Every LEAK fixture below is a live production row (name, primaryType and
// the types that decided it); most keepers are live rows too, and the rest
// (a plain creamery, gift shop, night club, resort spa) are representative
// controls of the class. All of them execute through the REAL gates — placeAllowed (the
// menu), morningDisplayIdentity / splitBreakfastRails (the Breakfast poster
// rails), isBreakfastPlace (the morning rail identity), selectFor (every home
// rail) and exclusionReason (the global veto). Each leak carries a keeper
// control from the same class, so the fix cannot be "ban the category".
import { placeAllowed } from "../lib/placeFilter.js";
import { morningDisplayIdentity } from "../lib/morningIdentity.js";
import { splitBreakfastRails } from "../lib/breakfastRails.js";
import { isBreakfastPlace } from "../lib/breakfast.js";
import { exclusionReason, isAdultVenue, EXCLUSION } from "../lib/placeCategory.js";
import { RAIL_SELECT, selectFor } from "../lib/railSelect.js";
import { composeNightOutRails } from "../lib/nightOutIntent.js";
import { composeBirthdayRails } from "../lib/birthdayIntent.js";

let total = 0;
let failed = 0;
const ok = (cond, msg) => { total++; if (!cond) { failed++; console.error("FAIL: " + msg); } };
const row = (name, primaryType, types) => ({ id: name.replace(/\W+/g, "-").toLowerCase(), name, primaryType, types });

// ── 1. Food → Breakfast (the reported taco place, and its whole class) ──────
const breakfastLeaks = [
  row("Fogata Street Tacos Ocoee Fl", "restaurant", ["restaurant", "breakfast_restaurant", "taco_restaurant", "food"]),
  row("El Genio del Shawarma", "shawarma_restaurant", ["shawarma_restaurant", "brunch_restaurant", "fast_food_restaurant", "mediterranean_restaurant", "hamburger_restaurant", "meal_delivery", "breakfast_restaurant"]),
  row("Nikki's Place", "soul_food_restaurant", ["soul_food_restaurant", "chicken_restaurant", "breakfast_restaurant", "seafood_restaurant"]),
  row("Taste of Punjab", "north_indian_restaurant", ["brunch_restaurant", "vegan_restaurant", "pakistani_restaurant", "breakfast_restaurant"]),
  row("Al Forno Lebanese Grill - UTC", "restaurant", ["restaurant", "vegan_restaurant", "lebanese_restaurant", "gyro_restaurant", "breakfast_restaurant"]),
  row("Island Tings", "restaurant", ["caribbean_restaurant", "chicken_restaurant", "catering_service", "breakfast_restaurant", "soul_food_restaurant"]),
  row("The Jerk Stop", "restaurant", ["catering_service", "halal_restaurant", "food_delivery", "breakfast_restaurant", "restaurant"]),
  row("Smoothie King", "food", ["breakfast_restaurant", "fast_food_restaurant", "meal_delivery", "acai_shop"]),
  row("Robeks Fresh Juice & Smoothies", "juice_shop", ["juice_shop", "vegetarian_restaurant", "acai_shop", "breakfast_restaurant"]),
  row("Noble Crust of St. Petersburg", "italian_restaurant", ["italian_restaurant", "brunch_restaurant", "american_restaurant", "restaurant"]),
  row("Sage Restaurant", "restaurant", ["restaurant", "fine_dining_restaurant", "brunch_restaurant", "wedding_venue"]),
];
for (const p of breakfastLeaks) {
  ok(placeAllowed("food", "breakfast", p) === false, `Food → Breakfast refuses ${p.name} (${p.primaryType})`);
  ok(morningDisplayIdentity(p) !== "breakfast", `the Best Breakfast poster rail refuses ${p.name}`);
}
const breakfastKeepers = [
  row("Eggs Up Grill", "restaurant", ["restaurant", "brunch_restaurant", "breakfast_restaurant", "food"]),
  row("Denny's Restaurant", "restaurant", ["restaurant", "breakfast_restaurant", "diner", "american_restaurant"]),
  row("Cracker Barrel Old Country Store", "american_restaurant", ["american_restaurant", "diner", "breakfast_restaurant", "family_restaurant"]),
  row("Butterfields Family Restaurant", "family_restaurant", ["family_restaurant", "breakfast_restaurant", "restaurant"]),
  row("Latin Corner Cafe", "cuban_restaurant", ["cuban_restaurant", "breakfast_restaurant", "restaurant"]),
  row("Toasted Mango Cafe", "american_restaurant", ["american_restaurant", "brunch_restaurant", "diner", "breakfast_restaurant", "cafe"]),
  row("Millie's", "american_restaurant", ["american_restaurant", "breakfast_restaurant", "cafe", "restaurant"]),
  row("Cortez Cafe", "restaurant", ["restaurant", "diner", "breakfast_restaurant", "cafe", "food"]),
  // review controls: a grill typed breakfast_restaurant, and a place NAME that
  // contains a nationality word, are not night-cuisine evidence.
  row("Sunrise Grill", "restaurant", ["restaurant", "breakfast_restaurant", "food"]),
  row("Indian Rocks Family Restaurant", "restaurant", ["restaurant", "breakfast_restaurant", "diner", "food"]),
];
for (const p of breakfastKeepers) {
  ok(placeAllowed("food", "breakfast", p) === true, `keeper: Food → Breakfast keeps ${p.name}`);
}

// ── 2. Food → Cafés / Coffee ────────────────────────────────────────────────
const cafeLeaks = [
  row("Golden Krust Caribbean Restaurant", "caribbean_restaurant", ["caribbean_restaurant", "chicken_restaurant", "fast_food_restaurant", "bakery"]),
  row("Jerk Hut South Tampa", "restaurant", ["cafe", "caribbean_restaurant", "restaurant", "food"]),
  row("Kadampa Meditation Center Florida", "health", ["buddhist_temple", "cafe", "place_of_worship", "school"]),
  row("Your Culinary Place L.L.C. - Shared Commercial Commissary Kitchens", "food", ["catering_service", "food_delivery", "bakery", "consultant"]),
  row("IT Italian Trattoria COLLINS", "italian_restaurant", ["italian_restaurant", "pizza_delivery", "coffee_shop", "cafe"]),
  row("Versailles Restaurant Cuban Cuisine", "cuban_restaurant", ["cuban_restaurant", "cafe", "restaurant"]),
  row("Tropical Smoothie Cafe", "juice_shop", ["juice_shop", "sandwich_shop", "cafe", "fast_food_restaurant", "breakfast_restaurant"]),
  row("Hard Rock Cafe", "restaurant", ["restaurant", "american_restaurant", "food"]),
  row("Cajun Cafe on the Bayou", "restaurant", ["restaurant", "cajun_restaurant", "american_restaurant"]),
  row("Ngọc Hà Vietnamese Restaurant", "restaurant", ["restaurant", "coffee_shop", "cafe", "food_store"]),
  row("Keys Jam - Rock Grill", "restaurant", ["cafe", "restaurant", "food"]),
];
for (const p of cafeLeaks) {
  ok(placeAllowed("food", "cafes", p) === false && placeAllowed("food", "coffee", p) === false, `Food → Cafés/Coffee refuse ${p.name}`);
  ok(morningDisplayIdentity(p) !== "cafe", `the Best Cafés poster rail refuses ${p.name}`);
}
const cafeKeepers = [
  row("Arte Caffè", "italian_restaurant", ["italian_restaurant", "bakery", "cafe", "food"]),
  row("MERCI CAFÉ", "french_restaurant", ["french_restaurant", "coffee_stand", "coffee_shop", "breakfast_restaurant", "cafe"]),
  row("Boûlan Wynwood", "bistro", ["bistro", "coffee_shop", "cafe", "bakery", "restaurant"]),
  row("CRAFT Coconut Grove", "restaurant", ["restaurant", "breakfast_restaurant", "brunch_restaurant", "coffee_shop", "cafe"]),
  row("Las Olas Cafe", "cuban_restaurant", ["cuban_restaurant", "breakfast_restaurant", "cafe", "latin_american_restaurant"]),
  row("JOE & THE JUICE", "juice_shop", ["juice_shop", "vegan_restaurant", "coffee_shop", "cafe", "sandwich_shop"]),
  row("Starlite Cafe", "restaurant", ["restaurant", "food"]),
  row("Buddy Brew Coffee", "coffee_shop", ["coffee_shop", "cafe", "food"]),
  // "Caffè" (accented) gets the same café-name rescue as "Cafe".
  row("Caffè Italia", "restaurant", ["restaurant", "pizza_restaurant", "cafe"]),
  row("Cafe Italia", "restaurant", ["restaurant", "pizza_restaurant", "cafe"]),
];
for (const p of cafeKeepers) {
  ok(placeAllowed("food", "cafes", p) === true && placeAllowed("food", "coffee", p) === true, `keeper: Food → Cafés/Coffee keep ${p.name}`);
}
// The menu and the poster rails answer from one classifier — prove it on
// the leak set as well as the keepers (an identity that only one surface
// enforces is the Adobe Kava bug).
{
  const all = [...breakfastLeaks, ...breakfastKeepers, ...cafeLeaks, ...cafeKeepers].map((p, i) => ({ ...p, id: "p" + i, rating: 4.6, reviews: 300 }));
  const [bk, cafes] = splitBreakfastRails(all);
  const bkIds = new Set(bk.places.map((p) => p.id));
  const cafeIds = new Set(cafes.places.map((p) => p.id));
  for (const p of all) {
    ok(bkIds.has(p.id) === placeAllowed("food", "breakfast", p), `Breakfast menu and poster agree for ${p.name}`);
    ok(cafeIds.has(p.id) === placeAllowed("food", "cafes", p), `Cafés menu and poster agree for ${p.name}`);
  }
}
ok(isBreakfastPlace(row("Fogata Street Tacos Ocoee Fl", "restaurant", ["restaurant", "breakfast_restaurant", "taco_restaurant"])) === false,
  "the morning rail identity (RAIL_SELECT.breakfast) refuses the taco place too");

// ── 3. Food → Desserts ──────────────────────────────────────────────────────
const dessertLeaks = [
  row("Culver's", "american_restaurant", ["american_restaurant", "fast_food_restaurant", "hamburger_restaurant", "ice_cream_shop", "dessert_shop"]),
  row("Joey D's Chicago Style Eatery & Pizzeria", "pizza_restaurant", ["pizza_restaurant", "ice_cream_shop", "dessert_shop", "confectionery"]),
  row("Juniors Hot Dogs", "hot_dog_restaurant", ["hot_dog_restaurant", "hamburger_restaurant", "ice_cream_shop", "dessert_shop"]),
  row("Talkin' Tacos Maitland", "taco_restaurant", ["taco_restaurant", "catering_service", "dessert_restaurant", "mexican_restaurant"]),
  row("Wawa", "fast_food_restaurant", ["fast_food_restaurant", "gas_station", "sandwich_shop", "candy_store"]),
  row("Shake Shack UTC Sarasota", "hamburger_restaurant", ["hamburger_restaurant", "sandwich_shop", "fast_food_restaurant", "dessert_restaurant"]),
];
for (const p of dessertLeaks) ok(placeAllowed("food", "dessert", p) === false, `Food → Desserts refuses ${p.name} (${p.primaryType})`);
const dessertKeepers = [
  row("Sweetberries Frozen Custard & Eatery", "sandwich_shop", ["sandwich_shop", "ice_cream_shop", "dessert_shop"]),
  row("Coco Joe's Italian Ice & Pizza", "pizza_restaurant", ["pizza_restaurant", "dessert_shop"]),
  row("The Cheesecake Factory", "american_restaurant", ["american_restaurant", "dessert_restaurant", "bakery"]),
  row("Dairy Queen Grill & Chill", "fast_food_restaurant", ["fast_food_restaurant", "ice_cream_shop", "dessert_shop"]),
  row("Two Scoops Creamery", "ice_cream_shop", ["ice_cream_shop", "dessert_shop"]),
  row("3Natives", "restaurant", ["juice_shop", "acai_shop", "brazilian_restaurant", "restaurant"]),
];
for (const p of dessertKeepers) ok(placeAllowed("food", "dessert", p) === true, `keeper: Food → Desserts keeps ${p.name}`);

// ── 4. Adult entertainment: never, anywhere ─────────────────────────────────
const adult = [
  row("Mons Venus World Famous Nude Strip Club Tampa", "bar", ["bar", "night_club"]),
  row("Emperors Gentlemen's Club Tampa", "adult_entertainment", ["night_club", "bar"]),
  row("Mermaids Gentleman's Club", "dance_hall", ["dance_hall", "night_club", "bar"]),
  row("2001 Odyssey", "adult_entertainment", ["night_club", "service"]),
];
for (const p of adult) {
  ok(isAdultVenue(p) && exclusionReason(p) === EXCLUSION.ADULT, `global exclusion names ${p.name} adult entertainment`);
  for (const sub of ["all", "bars", "clubs", "music"]) ok(placeAllowed("nightlife", sub, p) === false, `Night out → ${sub} refuses ${p.name}`);
}
for (const railId of ["tonight", "birthday"]) {
  const cfg = RAIL_SELECT[railId];
  const keeper = { id: "keeper", name: "The Gator Club", primaryType: "night_club", types: ["night_club", "bar"], rating: 4.5, reviews: 800, distMi: 2 };
  const pools = {};
  for (const c of cfg.pools) pools[c] = [...adult.map((p) => ({ ...p, rating: 4.9, reviews: 2000, distMi: 1 })), keeper];
  const out = selectFor(railId, pools, {}).map((p) => p.name);
  ok(!out.some((n) => adult.some((a) => a.name === n)), `the ${railId} home rail never serves a strip club (got: ${out.join(", ") || "none"})`);
}
ok(placeAllowed("nightlife", "clubs", row("The Gator Club", "night_club", ["night_club", "bar"])) === true, "keeper: a real night club stays under Clubs");
// Provider shapes: `types` may arrive as a comma string, and Google names use
// the curly apostrophe. Both must still be read as adult entertainment.
ok(isAdultVenue({ name: "2001 Odyssey", types: "adult_entertainment,night_club" }) === true
  && exclusionReason({ name: "2001 Odyssey", types: "adult_entertainment,night_club" }) === EXCLUSION.ADULT,
  "a string-typed adult_entertainment row is excluded (string `types` shape)");
ok(isAdultVenue({ name: "Emperors Gentlemen’s Club Tampa", primaryType: "night_club", types: ["night_club"] }) === true, "a curly-apostrophe gentlemen’s club is excluded");
// The Night out and Birthday DROPS (/api/night-out, /api/birthday and their
// client fallbacks) compose their own rails — the gap the 2026-10-02 review
// found: a night_club-typed strip club reached their Clubs rail.
{
  const at = (p) => ({ ...p, lat: 27.951, lng: -82.451, distMi: 0.1, rating: 4.9, reviews: 3000, wfScore: 99, priceLevel: 2 });
  const pool = [
    at(row("Mons Venus World Famous Nude Strip Club Tampa", "night_club", ["night_club", "bar"])),
    at(row("Emperors Gentlemen’s Club Tampa", "night_club", ["night_club", "bar"])), // U+2019 apostrophe
    at({ id: "string-types", name: "2001 Odyssey", primaryType: "", types: "adult_entertainment,night_club" }), // string-typed row
    at(row("The Gator Club", "night_club", ["night_club", "bar"])),
  ];
  const night = composeNightOutRails([], pool, { lat: 27.95, lng: -82.45 }).rails.flatMap((r) => r.places.map((p) => p.name));
  const bday = composeBirthdayRails(pool).rails.flatMap((r) => r.places.map((p) => p.name));
  for (const [label, names] of [["Night out drop", night], ["Birthday drop", bday]]) {
    ok(names.includes("The Gator Club"), `keeper: the ${label} still serves a real club (got ${names.join(", ")})`);
    ok(!names.some((n) => /Mons Venus|Gentlemen|2001 Odyssey/.test(n)), `the ${label} never serves an adult venue — curly apostrophe and string-typed rows included (got ${names.join(", ")})`);
  }
}
ok(!isAdultVenue(row("Haulover Beach", "beach", ["beach", "park", "tourist_attraction"])) && !isAdultVenue({ name: "Haulover Nude Beach", primaryType: "beach", types: ["beach"] }),
  "keeper: a clothing-optional public beach is not adult entertainment (the rule targets the trade, not the word)");

// ── 5. Activities (Spa, Theme parks, Museums, Arts, Landmarks, On the water) ─
const attrLeaks = [
  ["spa", row("Crunch Fitness - Parrish", "gym", ["gym", "tanning_studio", "yoga_studio", "fitness_center", "sauna", "spa"])],
  ["spa", row("Sarasota City YMCA Branch", "fitness_center", ["fitness_center", "community_center", "sauna", "gym", "spa"])],
  ["spa", row("HOTWORX - Bradenton, FL", "yoga_studio", ["yoga_studio", "sauna", "fitness_center", "spa"])],
  ["themeparks", row("Bayfront Park", "city_park", ["city_park", "tourist_attraction", "water_park", "amusement_park", "playground"])],
  ["themeparks", row("Sun Outdoors Sarasota", "rv_park", ["rv_park", "cottage", "camping_cabin", "resort_hotel", "water_park", "amusement_park"])],
  ["themeparks", row("Straight A Tours", "travel_agency", ["travel_agency", "tourist_information_center", "amusement_park", "tour_agency"])],
  ["museums", row("Heritage Harbour Park", "park", ["park", "point_of_interest", "establishment"])],
  ["museums", row("BODYBAR Heritage Harbour", "gym", ["gym", "sports_school", "sports_complex", "health"])],
  ["landmarks", row("BODYBAR Heritage Harbour", "gym", ["gym", "sports_school", "sports_complex", "health"])],
  ["arts", row("The Art of Pilates - Classical Pilates Studio", "gym", ["fitness_center", "sports_complex", "gym", "sports_school"])],
  ["arts", row("Doc's Golf Gallery", "sports_club", ["sports_club", "association_or_organization"])],
  ["marinas", row("Safety Harbor Waterfront Park", "park", ["park", "tourist_attraction", "point_of_interest"])],
  ["marinas", row("Hidden Harbor Park", "park", ["park", "point_of_interest", "establishment"])],
];
for (const [sub, p] of attrLeaks) ok(placeAllowed("attractions", sub, p) === false, `Activities → ${sub} refuses ${p.name} (${p.primaryType})`);
const attrKeepers = [
  ["spa", row("The Ritz-Carlton Spa", "spa", ["spa", "massage", "point_of_interest"])],
  ["spa", row("Hand & Stone Massage and Facial Spa", "massage", ["massage", "spa", "skin_care_clinic"])],
  ["themeparks", row("Busch Gardens Tampa Bay", "tourist_attraction", ["tourist_attraction", "amusement_park", "amusement_center"])],
  ["themeparks", row("Adventure Island", "water_park", ["water_park", "amusement_park", "tourist_attraction"])],
  ["themeparks", row("Weeki Wachee Springs State Park", "state_park", ["state_park", "water_park", "amusement_park", "tourist_attraction"])],
  ["museums", row("Ybor City Museum State Park", "state_park", ["state_park", "park", "point_of_interest"])],
  ["museums", row("The Dalí Museum", "art_museum", ["art_museum", "museum", "tourist_attraction"])],
  ["arts", row("Pérez Art Museum Miami", "art_museum", ["art_museum", "museum", "tourist_attraction"])],
  ["landmarks", row("Historic Asolo Theater (HAT) at The Ringling", "performing_arts_theater", ["performing_arts_theater", "event_venue"])],
  ["landmarks", row("De Soto National Memorial", "park", ["park", "point_of_interest", "establishment"])],
  ["marinas", row("Fort De Soto Boat Ramp", "park", ["dog_park", "tourist_attraction", "park"])],
  ["marinas", row("Get Up and Go Kayaking - Shell Key Preserve", "tour_agency", ["tour_agency", "travel_agency", "service"])],
];
for (const [sub, p] of attrKeepers) ok(placeAllowed("attractions", sub, p) === true, `keeper: Activities → ${sub} keeps ${p.name}`);

// ── 6. Hotels and Gift shops ────────────────────────────────────────────────
for (const p of [
  row("LeVisa Massage Spa & Wellness", "massage", ["hotel", "spa", "massage", "lodging"]),
  row("The Ritz-Carlton Members Golf Club", "sports_club", ["resort_hotel", "golf_course", "hotel", "sports_club"]),
]) ok(placeAllowed("hotels", "all", p) === false && placeAllowed("hotels", "luxury", p) === false, `Hotels refuse ${p.name} (${p.primaryType})`);
ok(placeAllowed("hotels", "all", row("The Ritz-Carlton, Sarasota", "resort_hotel", ["resort_hotel", "hotel", "lodging", "spa"])) === true,
  "keeper: a resort hotel with a spa stays in Hotels");
for (const p of [
  row("Innisbrook Golf Resort", "golf_course", ["golf_course", "resort_hotel", "hotel", "lodging"]),
  row("Safety Harbor Resort & Spa", "spa", ["spa", "resort_hotel", "hotel", "lodging"]),
]) ok(placeAllowed("hotels", "all", p) === true, `keeper: ${p.name} (a resort whose Google primary is its ${p.primaryType}) stays in Hotels`);
for (const p of [
  row("Total Wine & More", "liquor_store", ["liquor_store", "catering_service", "gift_shop", "store"]),
  row("Holmes Beach Ace Hardware", "hardware_store", ["hardware_store", "building_materials_store", "gift_shop"]),
]) ok(placeAllowed("shopping", "giftshops", p) === false, `Shopping → Gift shops refuses ${p.name}`);
ok(placeAllowed("shopping", "giftshops", row("Sea Shell Shoppe", "gift_shop", ["gift_shop", "store"])) === true,
  "keeper: a real gift shop stays under Gift shops");

console.log(`test-taxonomy-identity: ${total - failed}/${total} passed — breakfast/café/dessert identity, adult veto on menus + rails, spa/theme-park/museum/arts/landmark/water/hotel/gift-shop primaries (live 2026-10-01 audit rows, each with keepers)`);
if (failed) process.exit(1);
