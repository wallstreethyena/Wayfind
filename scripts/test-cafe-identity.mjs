// scripts/test-cafe-identity.mjs — Food > Cafés / Food > Coffee are real coffee shops only.
// Owner, 2026-10-07: tea houses, boba, bakeries, bagel/donut shops, delis, dessert/gelato,
// juice/smoothie/acai and restaurants are OUT, globally. Scores are never touched.
// Import + invoke: asserts on the predicate's RETURN and on placeAllowed()'s RETURN.
import { isCoffeeCafe, HARD_VETO_RX, SOFT_VETO_RX, CAFE_PRIMARY } from "../lib/cafeIdentity.js";
import { placeAllowed } from "../lib/placeFilter.js";
import { isCafePlace, splitBreakfastRails } from "../lib/breakfastRails.js";

let pass = 0;
const bad = [];
const ok = (c, m) => { if (c) pass++; else bad.push(m); };
const P = (name, primaryType, types = [primaryType]) => ({ place_id: "t-" + name, name, primaryType, types, rating: 4.5, reviews: 100 });

const keepers = [
  P("No Limits Coffee Shop", "restaurant", ["restaurant", "breakfast_restaurant", "diner", "coffee_shop"]),
  P("30A Coffee Company", "restaurant", ["restaurant", "coffee_shop", "cafe"]),
  P("Cafe` YOU", "restaurant", ["restaurant", "australian_restaurant", "coffee_shop", "cafe"]),
  P("Ryan's Coffee House", "coffee_shop"),
  P("Hashtag Café", "coffee_shop", ["coffee_shop", "cafe"]),
  P("Café Soleil", "cafe", ["cafe", "brunch_restaurant", "deli", "breakfast_restaurant", "coffee_shop"]),
  P("Black Crow Coffee Co", "coffee_roastery"),
  P("Luka Restaurant and Coffee", "cafe"),
  P("MERCI CAFÉ", "cafe"),
  // 2026-10-07 live shapes: a French café typed french_restaurant + coffee
  // stand/shop, and a café also tagged tea_house but typed coffee_shop.
  P("MERCI CAFÉ Sarasota", "french_restaurant", ["french_restaurant", "coffee_stand", "coffee_shop", "breakfast_restaurant", "cafe"]),
  P("Myth & Legend", "cafe", ["cafe", "tea_house", "coffee_shop", "food_store"]),
  P("Steak & Coffee", "coffee_shop"),
];
const droppers = [
  P("Green Cup Café", "cafe", ["cafe", "vegan_restaurant", "tea_house", "vegetarian_restaurant", "restaurant"]),
  P("Wake Up Cafe North", "american_restaurant", ["american_restaurant", "cafe", "restaurant"]),
  P("Luka Restaurant and Coffee - Plantation", "restaurant", ["restaurant", "food"]),
  P("Tealicious Cafe", "tea_house"),
  P("Oou Cha", "tea_house"),
  P("TeBella Tea St. Pete", "cafe"),
  P("Jade Tea House", "cafe"),
  P("Boba N Chill", "cafe"),
  P("All About Boba Café", "cafe"),
  P("ofKors BAKERY", "cafe"),
  P("Stork's Bakery & Cafe", "cafe"),
  P("K-dessert Cafe", "cafe"),
  P("Armetta's Gelato & Caffè", "coffee_shop"),
  P("Acai Blossom", "coffee_shop"),
  P("Bistro Café", "cafe"),
  P("Heirloom Café & Tea House", "coffee_shop"),
  P("Pulp & Press - Cafe, Restaurant, Bookstore", "cafe"),
  P("Tiki Bagel", "restaurant", ["restaurant", "bagel_shop", "bakery"]),
  P("Jersey Bagels", "bagel_shop"),
  P("St. Pete Bakery Café", "bakery"),
  P("Keik Restaurant", "cafe"),
  P("Mitch's Downtown", "restaurant", ["restaurant", "deli"]),
  // type-level: a café-typed tea room whose name says nothing
  P("Lotus Room", "cafe", ["cafe", "tea_house"]),
];

// lib/morningIdentity.js CAFE_TYPES (deliberately untouched) has no coffee_roastery, so a
// roastery whose ONLY type is coffee_roastery is not a morning "cafe" identity at the menu
// layer; the predicate itself keeps it. Real Google rows carry coffee_shop alongside.
const PREDICATE_ONLY = new Set(["Black Crow Coffee Co"]);
for (const p of keepers) {
  ok(isCoffeeCafe(p) === true, `isCoffeeCafe keeps "${p.name}"`);
  if (PREDICATE_ONLY.has(p.name)) {
    const q = { ...p, types: [...p.types, "coffee_shop"] };
    for (const sub of ["cafes", "coffee"]) ok(placeAllowed("food", sub, q) === true, `placeAllowed(food,${sub}) keeps roastery "${p.name}" typed with coffee_shop`);
    continue;
  }
  for (const sub of ["cafes", "coffee"]) ok(placeAllowed("food", sub, p) === true, `placeAllowed(food,${sub}) keeps "${p.name}"`);
  ok(isCafePlace(p) === true, `breakfastRails.isCafePlace keeps "${p.name}"`);
}
for (const p of droppers) {
  ok(isCoffeeCafe(p) === false, `isCoffeeCafe drops "${p.name}"`);
  for (const sub of ["cafes", "coffee"]) ok(placeAllowed("food", sub, p) === false, `placeAllowed(food,${sub}) drops "${p.name}"`);
  ok(isCafePlace(p) === false, `breakfastRails.isCafePlace drops "${p.name}"`);
}
// cafes and coffee are exact aliases on every fixture
for (const p of [...keepers, ...droppers]) {
  ok(placeAllowed("food", "cafes", p) === placeAllowed("food", "coffee", p), `food:cafes and food:coffee agree on "${p.name}"`);
}

// Café rail: droppers never reach it; keepers that morningIdentity calls "cafe" do.
{
  const rails = splitBreakfastRails([...keepers, ...droppers]);
  const cafeRail = rails.find((r) => r.id === "breakfast-cafes").places.map((x) => x.name);
  for (const d of droppers) ok(!cafeRail.includes(d.name), `café rail excludes "${d.name}"`);
  ok(cafeRail.includes("Ryan's Coffee House") && cafeRail.includes("MERCI CAFÉ"), "café rail still carries real cafés");
}

// Word boundaries: no substring vetoes.
ok(!HARD_VETO_RX.test("steak & coffee") && isCoffeeCafe(P("Steak & Coffee", "coffee_shop")), "tea does not match inside steak");
ok(!SOFT_VETO_RX.test("delight coffee") && isCoffeeCafe(P("Delight Coffee", "coffee_shop")), "deli does not match inside delight");
ok(isCoffeeCafe(P("Delicious Cafe", "cafe")) === true, "deli does not match inside delicious");
ok(isCoffeeCafe(P("Stream Coffee", "coffee_shop")) === true, "tea does not match inside stream/instead words");
// accent folding
ok(isCoffeeCafe({ name: "Açaí Café", primaryType: "cafe" }) === false, "açaí folds to acai and is vetoed");
ok(isCoffeeCafe({ name: "Caffè Nero", primary_type: "cafe" }) === true, "caffè folds to caffe (snake_case primary_type accepted)");
// type aliases are unioned
ok(isCoffeeCafe({ name: "Bean There", primaryType: "restaurant", google_types: ["coffee_shop"] }) === false, "generic primary needs a café word in the name");
ok(isCoffeeCafe({ name: "Bean There Cafe", primaryType: "restaurant", googleTypes: ["coffee_shop"] }) === true, "googleTypes alias counts as coffee_shop evidence");
ok(CAFE_PRIMARY.size === 6, "six café primaries");
ok(isCoffeeCafe(null) === false && isCoffeeCafe({}) === false, "null / nameless are out");

if (bad.length) { console.error("test-cafe-identity: FAIL\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`test-cafe-identity: OK — ${pass} assertions (${keepers.length} keepers, ${droppers.length} droppers across isCoffeeCafe, placeAllowed food:cafes+food:coffee, café rail; word-boundary + accent folding)`);
