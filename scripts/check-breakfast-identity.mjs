#!/usr/bin/env node
/**
 * check-breakfast-identity — "Best Breakfast Picks" must be places whose
 * IDENTITY is breakfast, not places that happen to open in the morning.
 *
 * THE BUG THIS EXISTS FOR, live on gowayfind.com 2026-08-22 and screenshotted
 * by the owner: the Parrish breakfast rail served **Pizza Haven - NY Style** at
 * position 8. Its Google types are
 *
 *     ["pizza_restaurant", "diner", "meal_takeaway", "restaurant", …]
 *
 * `diner` is a BREAKFAST_TYPE, lib/breakfast.js tested every token in the array
 * as equal evidence, and a pizzeria became a breakfast pick. Nothing failed —
 * a wrong list is a perfectly valid list.
 *
 * THE DISCIPLINE THIS PINS: Google's `types` array is unordered EVIDENCE; the
 * primary type is the CLAIM. A secondary token may add, never outvote. Every
 * shape below is a real row from wf_inventory within 12 miles of Parrish (or,
 * for the diner cases, from the whole inventory) — not an invented fixture, so
 * a future rewrite is measured against what the data actually contains.
 */
import assert from "node:assert/strict";
import { isBreakfastPlace, BREAKFAST_NEAR_MI, NATIONAL_QUICK_RX } from "../lib/breakfast.js";
import { RAIL_SELECT } from "../lib/railSelect.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// name, primary_type, google_types, expected — every row measured 2026-08-22.
const MEASURED = [
  // ── the reported defect, and its family ───────────────────────────────────
  ["Pizza Haven - NY Style", "pizza_restaurant", ["pizza_restaurant", "diner", "meal_takeaway", "restaurant", "food"], false],
  ["Skyline Chili", "restaurant", ["restaurant", "diner"], false],
  ["Graze South Tampa", "american_restaurant", ["american_restaurant", "diner"], false],
  ["Mrs. Potato Restaurant", "brazilian_restaurant", ["brazilian_restaurant", "diner"], false],
  // ── other cuisines wearing a secondary breakfast token ────────────────────
  ["Food Hall Vietnamese Pho Japanese Hibachi Boba", "vietnamese_restaurant", ["vietnamese_restaurant", "breakfast_restaurant"], false],
  ["el bar de mexiperu Kitchen", "mexican_restaurant", ["mexican_restaurant", "breakfast_restaurant"], false],
  ["Gateway Subs", "sandwich_shop", ["sandwich_shop", "cafe", "coffee_shop"], false],
  // ── the vetoes that already worked, and must keep working ─────────────────
  ["McDonald's", "fast_food_restaurant", ["fast_food_restaurant", "breakfast_restaurant", "cafe", "coffee_shop"], false],
  ["Chick-fil-A", "fast_food_restaurant", ["fast_food_restaurant", "breakfast_restaurant"], false],
  ["Publix Super Market", "supermarket", ["supermarket", "grocery_store", "bakery"], false],
  ["Some Steakhouse", "steak_house", ["steak_house", "breakfast_restaurant"], false],
  // ── the breakfast institutions, which all carry `diner` too ───────────────
  ["Cracker Barrel Old Country Store", "american_restaurant", ["american_restaurant", "breakfast_restaurant", "diner"], true],
  ["IHOP", "breakfast_restaurant", ["breakfast_restaurant", "brunch_restaurant", "diner"], true],
  ["Keke's Breakfast Cafe", "breakfast_restaurant", ["breakfast_restaurant", "cafe", "brunch_restaurant", "diner"], true],
  ["Waffle House", "breakfast_restaurant", ["breakfast_restaurant", "diner"], true],
  ["Denny's Restaurant", "restaurant", ["restaurant", "breakfast_restaurant", "diner"], true],
  ["First Watch", "breakfast_restaurant", ["breakfast_restaurant", "brunch_restaurant"], true],
  // ── the local rooms the rail exists to surface ────────────────────────────
  ["The Granary Breakfast & Lunch Restaurant", "brunch_restaurant", ["brunch_restaurant", "breakfast_restaurant"], true],
  ["Robin's Downtown Cafe", "cafe", ["cafe", "breakfast_restaurant"], true],
  ["Ellenton Cafe", "american_restaurant", ["american_restaurant", "breakfast_restaurant"], true],
  ["Butterfields Family Restaurant", "family_restaurant", ["family_restaurant", "breakfast_restaurant"], true],
  ["Silverleaf Bread Co", "bakery", ["bakery"], true],
  ["Foxtail Coffee - North River Ranch", "coffee_shop", ["coffee_shop", "cafe"], true],
  ["Jeff's Bagel Run", "bagel_shop", ["bagel_shop", "breakfast_restaurant", "cafe", "coffee_shop", "bakery"], true],
  ["BURGER AND PANCAKE HOUSE", "restaurant", ["restaurant", "breakfast_restaurant", "diner"], true],
  // An Italian bakery-café is a real breakfast format, which is why
  // `italian_restaurant` is deliberately NOT a vetoed cuisine. This row is the
  // reason — kill it and the veto list has been drawn too wide.
  ["Arte Caffe", "italian_restaurant", ["italian_restaurant", "bakery"], true],
  // Rows that arrive with no `types` array at all (wf_best_picks shape).
  ["Lakewood Ranch Cafe", "cafe", [], true],
  ["Acme Holdings LLC", null, [], false],
];

for (const [name, primaryType, types, want] of MEASURED) {
  const got = isBreakfastPlace({ name, primaryType, types });
  ok(got === want, `${want ? "IS" : "is NOT"} breakfast: ${name} (${primaryType || "no primary"} · ${types.join(", ") || "no types"}) — got ${got}`);
}

// The same rows, arriving as raw inventory (snake_case, google_types) rather
// than as ranked rows. buildIdentityPool faces both shapes and they must agree.
for (const [name, primary_type, google_types, want] of MEASURED) {
  ok(isBreakfastPlace({ name, primary_type, google_types }) === want,
    `raw inventory shape agrees with the ranked shape: ${name}`);
}

// ORDERING, and the only CONSTRUCTED shapes in this file — labelled as such
// because no row like this exists in the inventory today, and the rule they pin
// is one I chose rather than one the data forced. The cuisine veto runs BEFORE
// the name rule, so a pizzeria cannot talk its way back onto the rail on the
// word "café". Reverse the two and this pair goes red while every measured row
// above still passes — which is exactly how the ordering would otherwise rot.
ok(isBreakfastPlace({ name: "Pizza Cafe", primaryType: "pizza_restaurant", types: ["pizza_restaurant"] }) === false,
  "constructed: a pizzeria named Café is still not breakfast (the cuisine veto runs before the name rule)");
ok(isBreakfastPlace({ name: "Sushi Coffee House", primaryType: "sushi_restaurant", types: ["sushi_restaurant", "cafe"] }) === false,
  "constructed: nor is a sushi room with `cafe` in its types and 'coffee' in its name");
// …and the name rule still rescues what it exists for: a genuine counter whose
// primary type is generic and whose types array says nothing useful.
ok(isBreakfastPlace({ name: "Sunrise Pancake House", primaryType: "restaurant", types: ["restaurant"] }) === true,
  "constructed: the name rule still admits a counter Google typed as nothing");

// A lone secondary `diner` is refused; the same row with its primary set to
// `diner` is admitted. Both halves, or the rule reads as "diner is banned".
ok(isBreakfastPlace({ name: "Counter Room", primaryType: "restaurant", types: ["restaurant", "diner"] }) === false,
  "a lone SECONDARY diner is not evidence");
ok(isBreakfastPlace({ name: "Counter Room", primaryType: "diner", types: ["diner", "restaurant"] }) === true,
  "…while a place whose primary type IS diner is admitted");

// Null/undefined safety — the pool builder calls this on every row it sees.
for (const bad of [null, undefined, {}, { name: null }, { types: null }]) {
  ok(isBreakfastPlace(bad) === false, "a malformed row is refused, never thrown on");
}

// The chain the rail actually runs: identity AND the morning radius.
ok(RAIL_SELECT.breakfast.pools.includes("breakfast"), "the rail reads the breakfast identity pool");
ok(RAIL_SELECT.breakfast.pick({ name: "Waffle House", primaryType: "breakfast_restaurant", types: ["breakfast_restaurant"], distMi: 2 }) === true,
  "the rail admits a breakfast room inside the morning radius");
ok(RAIL_SELECT.breakfast.pick({ name: "Waffle House", primaryType: "breakfast_restaurant", types: ["breakfast_restaurant"], distMi: BREAKFAST_NEAR_MI + 1 }) === false,
  "…and still refuses one past it — nobody drives 11 miles before coffee");
ok(RAIL_SELECT.breakfast.pick({ name: "Pizza Haven - NY Style", primaryType: "pizza_restaurant", types: ["pizza_restaurant", "diner"], distMi: 1 }) === false,
  "the reported defect cannot reach the rail even from next door");

ok(NATIONAL_QUICK_RX.test("Chick-fil-A") && !NATIONAL_QUICK_RX.test("Keke's Breakfast Cafe"),
  "the national quick-service list still spares the breakfast institutions");

console.log(`check-breakfast-identity: ${n} assertions OK — ${MEASURED.length} measured rows, `
  + `primary type beats a secondary token, lone diner refused, ${BREAKFAST_NEAR_MI}mi morning radius held`);
