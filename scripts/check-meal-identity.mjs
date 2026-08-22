#!/usr/bin/env node
/**
 * check-meal-identity — "Actually Worth Eating" must be a MEAL.
 *
 * THE DEFECT, measured 2026-08-22 against live inventory: `eat` was the only
 * rail in the app with no identity. Its pick asked whether a row was
 * summer-sourced and nothing else, so every food-categorised place qualified
 * and the governed score alone decided the order. The score measures QUALITY —
 * it was never asked whether the thing is a meal — and a dessert counter with
 * 608 reviews and a 4.9 rating scores extremely well. So:
 *
 *   PARRISH        1. Pomegranate Frozen Yogurt   3. Ryan's Coffee House
 *                  6. American Honey Creamery     8. Vampire Penguin
 *   LAKEWOOD RANCH 8. Twin Peaks (sports bar)     9. Good Liquid (brewpub)
 *                 10. Crumbl (cookies)           12. Gofruit Juice Bar
 *   SARASOTA       8. Hashtag Café               11. Gelateria Degli Angeli
 *
 * The tile reads "Skip the bad meal" and "Ranked on the food, not the noise".
 * The best answer it had for someone in Parrish was frozen yogurt.
 *
 * WORTH RECORDING: v8.31's reader-first retrieval did not create this. The old
 * city search returned regional dinner anchors and those counters never cracked
 * a top-15, so the missing identity was invisible. Local retrieval exposed it —
 * and it will expose the same thing anywhere else a rail leans on the score to
 * do a job an identity should be doing.
 *
 * Every row below is a real wf_inventory row from that measurement.
 */
import assert from "node:assert/strict";
import { isMealPlace } from "../lib/mealPlace.js";
import { RAIL_SELECT, MIN_CARDS } from "../lib/railSelect.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// name, primary_type, google_types, expected — measured 2026-08-22.
const MEASURED = [
  // ── the reported leaks ────────────────────────────────────────────────────
  ["Pomegranate Frozen Yogurt", "dessert_shop", ["dessert_shop"], false],
  ["Vampire Penguin", "dessert_shop", ["dessert_shop"], false],
  ["American Honey Creamery and Coffee Co.", "ice_cream_shop", ["ice_cream_shop"], false],
  ["Gelateria Degli Angeli", "ice_cream_shop", ["ice_cream_shop"], false],
  ["Ryan's Coffee House", "coffee_shop", ["coffee_shop"], false],
  ["Hashtag Café", "coffee_shop", ["coffee_shop", "cafe"], false],
  ["Crumbl", "bakery", ["bakery"], false],
  ["Gofruit Juice Bar", "juice_shop", ["juice_shop"], false],
  // the room is the bar — that is tonight and datenight, not the meal
  ["Twin Peaks", "sports_bar", ["sports_bar", "restaurant"], false],
  ["Good Liquid Brewing Company", "brewpub", ["brewpub", "bar"], false],
  // not a place you eat at
  ["Publix Super Market", "supermarket", ["supermarket", "grocery_store"], false],
  // ── the meals, which must all survive ─────────────────────────────────────
  ["Le Mans Kitchen", "restaurant", ["restaurant", "food"], true],
  ["Turmeric Indian Bar & Grill", "indian_restaurant", ["indian_restaurant"], true],
  ["Empanadas Valrico, Sarasota", "colombian_restaurant", ["colombian_restaurant"], true],
  ["RomanSQ | artisan pizza", "pizza_restaurant", ["pizza_restaurant"], true],
  ["Aji Ceviche Bar Sarasota – Peruvian Restaurant", "peruvian_restaurant", ["peruvian_restaurant"], true],
  ["Siegfried's Restaurant and German Biergarten", "restaurant", ["restaurant"], true],
  ["P J's Sandwich Shop", "sandwich_shop", ["sandwich_shop"], true],
  ["C & K Smokehouse BBQ", "american_restaurant", ["american_restaurant"], true],
  ["Restaurant iDalia", "italian_restaurant", ["italian_restaurant"], true],
  ["Aqua Tequila", "restaurant", ["restaurant"], true],
  ["Butterfields Family Restaurant", "family_restaurant", ["family_restaurant"], true],
  ["Oar & Iron", "restaurant", ["restaurant"], true],
  ["Fleming's Prime Steakhouse & Wine Bar", "steak_house", ["steak_house"], true],
  ["Thai Spice & Sushi", "thai_restaurant", ["thai_restaurant"], true],
  ["Agave Bandido", "mexican_restaurant", ["mexican_restaurant"], true],
  ["Rodizio Grill Brazilian Steakhouse Sarasota", "brazilian_restaurant", ["brazilian_restaurant"], true],
  // BREAKFAST IS A MEAL. These have their own rail because the morning is its
  // own question, not because they are not food — and Keke's leading Lakewood
  // Ranch's eat rail is a good answer, not a leak. Note the name carries
  // "Cafe": the name rule must not reach a row with a real primary type.
  ["First Watch", "breakfast_restaurant", ["breakfast_restaurant"], true],
  ["Keke's Breakfast Cafe", "breakfast_restaurant", ["breakfast_restaurant", "cafe"], true],
];

for (const [name, primaryType, types, want] of MEASURED) {
  ok(isMealPlace({ name, primaryType, types }) === want,
    `${want ? "IS" : "is NOT"} a meal: ${name} (${primaryType})`);
  // The raw-inventory shape must agree with the ranked shape.
  ok(isMealPlace({ name, primary_type: primaryType, google_types: types }) === want,
    `raw inventory shape agrees: ${name}`);
}

// A sandwich shop is a meal and is NOT breakfast; lib/breakfast.js vetoes the
// same primary type. Two rails, two questions, two answers — asserted so a
// future tidy-up does not "unify" them into one wrong list.
ok(isMealPlace({ name: "P J's Sandwich Shop", primaryType: "sandwich_shop", types: ["sandwich_shop"] }) === true,
  "sandwich_shop is a meal here…");
const { isBreakfastPlace } = await import("../lib/breakfast.js");
ok(isBreakfastPlace({ name: "P J's Sandwich Shop", primaryType: "sandwich_shop", types: ["sandwich_shop", "cafe"] }) === false,
  "…and still not breakfast there");

// RULE ISOLATION — two shapes that exist because a mutation run showed the
// measured rows above were passing for the RIGHT answer via the WRONG rule, so
// deleting either rule went unnoticed.
//
// 1. A dessert counter that ALSO carries a `restaurant` token. Every measured
//    dessert row above has only its own type, so rule 3's "is there positive
//    meal evidence" happened to refuse them even with the veto deleted. This
//    one has meal evidence, so ONLY the veto can refuse it.
ok(isMealPlace({ name: "Sweet Spot", primaryType: "dessert_shop", types: ["dessert_shop", "restaurant", "food"] }) === false,
  "a dessert counter that also carries a `restaurant` token is still not a meal — this is the row the veto set exists for");
ok(isMealPlace({ name: "Cone Zone", primaryType: "ice_cream_shop", types: ["ice_cream_shop", "restaurant"] }) === false,
  "…and so is an ice cream shop that carries one");
// 2. CONSTRUCTED, and labelled as such: no row like this exists in inventory
//    today. The ORDER matters — the name rule must run only when the primary
//    type is unusable, or a real restaurant loses its place to a word in its
//    own name. Reverse the two and this goes red while every measured row above
//    still passes.
ok(isMealPlace({ name: "The Creamery Kitchen", primaryType: "american_restaurant", types: ["american_restaurant"] }) === true,
  "constructed: a restaurant named 'Creamery' is still a meal (the name rule must not reach a row with a real primary type)");
ok(isMealPlace({ name: "Cookie Jar Diner", primaryType: "diner", types: ["diner"] }) === true,
  "constructed: nor does a diner lose its place to the word 'Cookie'");

// No usable primary type: the name is the only evidence left.
ok(isMealPlace({ name: "Sunrise Cookie Co", primaryType: null, types: ["food"] }) === false,
  "no primary type: a cookie shop is refused on the name");
ok(isMealPlace({ name: "Corner Gelato Cart", primaryType: null, types: ["food"] }) === false,
  "no primary type: a gelato cart is refused on the name");
ok(isMealPlace({ name: "Corner Kitchen", primaryType: null, types: ["restaurant"] }) === true,
  "no primary type: a restaurant token still admits");

// Malformed rows are refused, never thrown on — the rail runs this over every
// row in the pool.
for (const bad of [null, undefined, {}, { name: null }, { types: null }]) {
  ok(isMealPlace(bad) === false, "a malformed row is refused, never thrown on");
}

// THE RAIL, executed. Membership only — the identity must never reorder, and it
// must not disturb the summer-registry path.
// v8.31.2 — `identity` and `pick` are separate keys now and selectFor runs both
// (scripts/check-rail-identity.mjs). Ask what the rail ADMITS, then pin which
// half does the refusing, so the identity cannot be quietly dropped later while
// a distance gate keeps the headline assertion green.
const admits = (place) => {
  const cfg = RAIL_SELECT.eat;
  return (!cfg.identity || cfg.identity(place, {})) && (!cfg.pick || cfg.pick(place, {}));
};
ok(RAIL_SELECT.eat.identity === isMealPlace,
  "the eat rail's declared identity IS isMealPlace — one rule, imported, never restated");
ok(admits({ id: "x", name: "Pomegranate Frozen Yogurt", primaryType: "dessert_shop", types: ["dessert_shop"], distMi: 1 }) === false,
  "the eat rail refuses the frozen yogurt counter that used to lead it");
ok(RAIL_SELECT.eat.identity({ id: "x", name: "Pomegranate Frozen Yogurt", primaryType: "dessert_shop", types: ["dessert_shop"], distMi: 1 }, {}) === false,
  "…and it is the IDENTITY that refuses it, which is the whole fix");
ok(admits({ id: "x", name: "Le Mans Kitchen", primaryType: "restaurant", types: ["restaurant"], distMi: 1 }) === true,
  "…and admits the restaurant that should");
ok(admits({ id: "x", name: "Far Summer Cuban", primaryType: "restaurant", types: ["restaurant"], distMi: 200, _summerSourced: true, _summerRails: ["eat"] }) === false,
  "the summer registry's own distance rule still applies on this rail");
ok(MIN_CARDS >= 3, "MIN_CARDS is still the honest-empty floor");

console.log(`check-meal-identity: ${n} assertions OK — ${MEASURED.length} measured rows, `
  + `dessert and drink counters and bar rooms refused, breakfast rooms kept`);
