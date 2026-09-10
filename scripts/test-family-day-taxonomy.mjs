import assert from "node:assert/strict";
import { mock } from "node:test";
import { FAMILY_DAY_RAILS, familyRailMatches, matchesFamilyFilters } from "../lib/familyDayTaxonomy.js";

// Exercise the reviewed evidence window without depending on the wall clock.
mock.method(Date, "now", () => Date.parse("2026-09-10T12:00:00Z"));

assert.deepEqual(FAMILY_DAY_RAILS.map((rail) => rail.id), [
  "beach", "attractions", "water", "animals", "outdoors",
  "indoor", "space", "active", "culture", "food",
]);
assert.ok(FAMILY_DAY_RAILS.every((rail) => rail.cats.every((cat) => ["beach", "attractions", "food", "shopping"].includes(cat))),
  "cats are physical wf_inventory categories");

const p = (name, primaryType, types = [], extra = {}) => ({ name, primaryType, types, ...extra });
assert.equal(familyRailMatches(p("Siesta Beach", "beach"), "beach"), true);
assert.equal(familyRailMatches(p("Theme Park", "amusement_park"), "attractions"), true);
assert.equal(familyRailMatches(p("The Florida Aquarium", "aquarium"), "animals"), true);
assert.equal(familyRailMatches(p("City Museum", "museum"), "indoor"), true);
assert.equal(familyRailMatches(p("Kennedy Space Center", "museum"), "space"), true,
  "narrow space identity refines a generic museum primary");
assert.equal(familyRailMatches(p("Beach House Grill", "restaurant", ["beach"]), "beach"), false,
  "a specific restaurant primary vetoes an incidental beach type and name");
assert.equal(familyRailMatches(p("Museum Hotel", "hotel", ["museum"]), "indoor"), false,
  "a hotel cannot enter through an incidental museum type");
assert.equal(familyRailMatches(p("Neighborhood Restaurant", "family_restaurant"), "food"), false,
  "ordinary restaurant dining is not automatically an outing");
assert.equal(familyRailMatches(p("Local Food Hall", "food_court"), "food"), true);
assert.equal(familyRailMatches(p("Saturday Market", "farmers_market"), "food"), true);
assert.equal(familyRailMatches(p("Sweet Stop", "ice_cream_shop"), "food"), true);
assert.equal(familyRailMatches(p("Sky Zone Trampoline Park", "amusement_park"), "active"), true,
  "a strongly named active venue specializes a broad amusement primary");
for (const adult of [
  p("Haulover Nude Beach", "beach"),
  p("Lake Baldwin Dog Park", "dog_park", ["park"]),
  p("Axe Habits - Axe Throwing", "amusement_center"),
  p("Bananas' Axe Cabana", "amusement_center"),
]) assert.equal(FAMILY_DAY_RAILS.some((rail) => familyRailMatches(adult, rail.id)), false,
  `${adult.name} needs positive exact-ID family evidence`);

const wonderWorks = { id: "ChIJRdxzRk1-54gRJvqlZQbtpE4", name: "WonderWorks Orlando", primaryType: "tourist_attraction" };
assert.equal(familyRailMatches(wonderWorks, "attractions"), true);
assert.equal(familyRailMatches(wonderWorks, "indoor"), true, "verified exact-ID evidence may add a second rail");
assert.equal(matchesFamilyFilters(wonderWorks, { ages: "kid", weather: "indoor", cost: "ticketed" }), true,
  "verified all-ages evidence admits a specific requested age");
assert.equal(matchesFamilyFilters(wonderWorks, { logistics: ["parking", "stroller", "height"] }), true);
assert.equal(matchesFamilyFilters(wonderWorks, { logistics: "changing" }), false,
  "unknown evidence fails a selected filter");
assert.equal(matchesFamilyFilters(wonderWorks, { duration: "quick" }), false);
assert.equal(matchesFamilyFilters({ id: "unknown" }, {}), true, "no filters need no planning evidence");
assert.equal(matchesFamilyFilters({ id: "unknown" }, { ages: "kid" }), false,
  "a venue type or name never invents an age fact");

console.log("test-family-day-taxonomy: OK");
