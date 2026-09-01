import { composeLunchBreakRails, LUNCH_BREAK_RAILS } from "../lib/lunchBreakRails.js";
import { wayfindScore } from "../lib/wayfindScore.js";
import fs from "node:fs";

let pass = 0;
const fail = [];
const ok = (condition, message) => { if (condition) pass++; else fail.push(message); };
const place = (id, name, primaryType, types = [], cuisines = [], rating = 4.6, reviews = 500) => ({ id, name, primaryType, types, cuisines, rating, reviews });

const fixtures = [
  place("deli", "Main Street Deli", "sandwich_shop", ["sandwich_shop"]),
  place("chicken", "Chicken Salad Chick", "sandwich_shop", ["sandwich_shop"]),
  place("cuban", "Cuban Sandwich Counter", "sandwich_shop", ["sandwich_shop", "cuban_restaurant"], ["cuban"]),
  place("mexican", "Fast Taco", "mexican_restaurant", ["mexican_restaurant"], ["mexican"]),
  place("pizza", "Parrish Pizzeria", "pizza_restaurant", ["pizza_restaurant"], ["pizza"]),
  place("burger", "Local Smash Burgers", "hamburger_restaurant", ["hamburger_restaurant"], ["burgers"]),
  place("healthy", "Green Protein Bowls", "restaurant", ["restaurant", "poke_restaurant"]),
];

const rails = composeLunchBreakRails(fixtures);
ok(rails.length === 7, "Lunch Break has exactly seven rails");
ok(rails.map((rail) => rail.id).join(",") === LUNCH_BREAK_RAILS.map((rail) => rail.id).join(","), "the seven rails keep the founder's requested display order");
ok(rails.every((rail) => rail.places.length === 1), "every requested lunch format receives its fixture");
ok(rails.find((rail) => rail.id === "chicken").places[0].id === "chicken", "chicken evidence beats generic sandwich identity");
ok(rails.find((rail) => rail.id === "cuban-caribbean").places[0].id === "cuban", "Cuban evidence beats generic sandwich identity");
ok(rails.find((rail) => rail.id === "healthy-fast").places[0].id === "healthy", "poke/protein bowl evidence reaches Healthy Fast");
ok(new Set(rails.flatMap((rail) => rail.places.map((row) => row.id))).size === fixtures.length, "no place leaks into two Lunch Break rails");

const ordered = composeLunchBreakRails([
  place("lower", "Lower Deli", "sandwich_shop", [], [], 4.3, 300),
  place("higher", "Higher Deli", "sandwich_shop", [], [], 4.9, 300),
]).find((rail) => rail.id === "deli-sandwiches").places;
ok(ordered.map((row) => row.id).join(",") === "higher,lower", "each rail ranks highest-to-lowest by canonical Wayfind Score");
ok(wayfindScore(ordered[0].rating, ordered[0].reviews) > wayfindScore(ordered[1].rating, ordered[1].reviews), "the asserted display order is backed by the canonical score formula");

const duplicated = composeLunchBreakRails([fixtures[0], { ...fixtures[0] }]);
ok(duplicated.find((rail) => rail.id === "deli-sandwiches").places.length === 1, "duplicate inventory rows become one card");

const daypartSource = fs.readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
ok(/\["break", "eat", "breakfast"\]\.flatMap/.test(daypartSource) && /places=\{lunchBreakPlaces\}/.test(daypartSource), "Lunch Break consumes the broad owned meal inventory instead of inheriting one empty legacy selector");

if (fail.length) {
  console.error("test-lunch-break-rails: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`test-lunch-break-rails: OK — ${pass} assertions`);
