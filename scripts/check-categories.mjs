// THE ROBOT (fixtures layer) — executes the REAL classifier (lib/placeCategory)
// and the REAL junk gate (lib/placeFilter) against every confirmed
// miscategorization the owner caught, plus the tricky edge cases, so the whole
// "wrong thing in the wrong list" CLASS can never regress. A live sampled sweep
// (scripts/audit-categories.mjs) complements this in the field.
import { primaryCategory, isServicePlace, isOutdoorNature } from "../lib/placeCategory.js";
import { placeAllowed } from "../lib/placeFilter.js";

let failed = 0;
const fail = (m) => { failed++; console.error("check-categories: FAIL — " + m); };
const P = (types, name = "Test Place", extra = {}) => ({ name, types, rating: 4.6, reviews: 500, status: "OPERATIONAL", ...extra });

// ---- classifier: identity resolves correctly (the confirmed live cases) ----
const cls = (types, want, msg) => { const got = primaryCategory(P(types)); if (got !== want) fail(`${msg}: got ${got}, want ${want} [${types.join(",")}]`); };
cls(["bagel_shop", "deli", "bakery", "cafe", "food_store", "food", "point_of_interest", "store"], "Food", "Jersey Bagels");
cls(["coffee_shop", "tea_house", "cafe", "food_store", "food"], "Food", "Orange Blossom Coffee");
cls(["grocery_store", "butcher_shop", "market", "deli", "food_store", "food", "restaurant"], "Food", "Detwiler's grocery");
cls(["sandwich_shop", "store", "food"], "Food", "sandwich shop");
cls(["donut_shop", "store"], "Food", "donut shop");
cls(["flea_market", "shopping_mall", "market"], "Shopping", "Red Barn flea market");
cls(["shopping_mall", "clothing_store", "restaurant", "food"], "Shopping", "mall w/ food court stays Shopping");
cls(["clothing_store", "store"], "Shopping", "clothing store");
cls(["live_music_venue", "nature_preserve", "event_venue", "park"], "Activities", "Habitat House (outdoor)");
cls(["night_club", "bar"], "Nightlife", "night club");
cls(["lodging", "hotel"], "Hotels", "hotel");

// ---- service businesses are nothing (no discovery section) ----
if (primaryCategory(P(["auto_parts_store", "car_repair", "service", "store"])) !== null) fail("auto shop must classify as null (service)");
if (!isServicePlace(P(["car_repair", "store"], "The Shop"))) fail("car_repair place must be flagged service");
if (isServicePlace(P(["shopping_mall"]))) fail("a mall must NOT be flagged service");

// ---- the GATE: cross-category contamination is blocked ----
const gateBlocked = (cat, p, msg) => { if (placeAllowed(cat, "all", p)) fail(`${msg}: should NOT pass ${cat}`); };
const gatePass = (cat, p, msg) => { if (!placeAllowed(cat, "all", p)) fail(`${msg}: SHOULD pass ${cat}`); };
gateBlocked("shopping", P(["coffee_shop", "cafe", "food_store", "food", "store"], "Orange Blossom Coffee"), "cafe in Shopping");
gateBlocked("shopping", P(["bagel_shop", "deli", "bakery", "food_store", "store"], "Jersey Bagels"), "bagel shop in Shopping");
gateBlocked("shopping", P(["auto_parts_store", "car_repair", "service", "store"], "The Shop"), "auto shop in Shopping");
gateBlocked("shopping", P(["grocery_store", "food_store", "market", "deli", "food"], "Detwiler's"), "grocery in Shopping");
gateBlocked("nightlife", P(["live_music_venue", "nature_preserve", "event_venue", "park"], "Habitat House Concerts"), "outdoor nature in Nightlife");
gatePass("shopping", P(["flea_market", "shopping_mall", "market"], "Red Barn Flea Market", { rating: 4.3, reviews: 7797 }), "Red Barn in Shopping");
gatePass("shopping", P(["department_store", "clothing_store", "store"], "Macy's"), "department store in Shopping");
gatePass("shopping", P(["shopping_mall", "clothing_store", "restaurant", "food"], "UTC Mall"), "mall in Shopping (food court ok)");
gatePass("food", P(["coffee_shop", "cafe", "food"], "Orange Blossom Coffee"), "cafe in Food");
gatePass("nightlife", P(["night_club", "bar"], "The Club"), "real nightclub in Nightlife");

// ---- Shopping "Markets" sub-tab: farm/grocery markets belong HERE, not in All ----
const detwilers = P(["grocery_store", "butcher_shop", "market", "deli", "food_store", "food"], "Detwiler's Farm Market");
if (placeAllowed("shopping", "all", detwilers)) fail("Detwiler's (grocery) must NOT pass Shopping All");
if (!placeAllowed("shopping", "markets", detwilers)) fail("Detwiler's (grocery) SHOULD pass the Shopping Markets sub-tab");
const redbarn = P(["flea_market", "shopping_mall", "market"], "Red Barn Flea Market", { rating: 4.3, reviews: 7797 });
if (!placeAllowed("shopping", "all", redbarn)) fail("Red Barn (flea market) SHOULD pass Shopping All");
if (!placeAllowed("shopping", "markets", redbarn)) fail("Red Barn (flea market) SHOULD pass Shopping Markets");

// ---- v6.28: FAMILY tab — age-targeted, safe, on-theme ----
const trampoline = P(["amusement_center"], "Elev8 Trampoline Park");
if (!placeAllowed("family", "kids", trampoline)) fail("a trampoline park SHOULD pass Family > Kids");
if (placeAllowed("family", "toddlers", trampoline)) fail("a trampoline park must NOT pass Family > Toddlers (unsafe for 1–3)");
const playground = P(["playground", "park"], "Sunshine Splash Pad & Playground");
if (!placeAllowed("family", "toddlers", playground)) fail("a playground/splash pad SHOULD pass Family > Toddlers");
const candy = P(["candy_store", "store"], "Sweet Tooth Candy Shop");
if (!placeAllowed("family", "kids", candy)) fail("a candy store SHOULD pass Family > Kids");
const famDiner = P(["restaurant", "family_restaurant", "food"], "The Granary Family Restaurant");
if (!placeAllowed("family", "adults", famDiner)) fail("a family restaurant SHOULD pass Family > Grown-ups");
const club = P(["night_club", "bar"], "Pulse Nightclub");
if (placeAllowed("family", "all", club)) fail("a nightclub must NOT appear in the Family tab");
if (placeAllowed("family", "kids", club)) fail("a nightclub must NOT appear in Family > Kids");
if (!placeAllowed("family", "all", P(["zoo"], "Sarasota Jungle Gardens"))) fail("a zoo SHOULD pass Family > All");
if (!placeAllowed("attractions", "outdoors", P(["beach"], "Coquina Beach"))) fail("a beach SHOULD pass Things to do > Outdoors");

if (failed) process.exit(1);
console.log("check-categories: OK — classifier + gate agree; no food/service/outdoor leaks across sections (11 classifier + 10 gate fixtures)");
