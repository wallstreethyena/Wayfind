#!/usr/bin/env node
// scripts/test-chip-contracts.mjs — chip identity is EXECUTED, on the rows
// that actually leaked.
//
// Live audit (owner, Parrish, 2026-08-26), every serve replayed through the
// real placeAllowed against the real inventory:
//   Arts (157 rows) led with Crunch Fitness and three fishing charters —
//     the SUB_ALLOW tokens `art` and `studio` were bare substrings, and
//     `fishing_charter` contains ART (ch-ART-er) while a gym's
//     `tanning_studio`/`yoga_studio` types contain STUDIO.
//   Desserts (400 rows) led with a BBQ smokehouse and a sandwich shop —
//     food:dessert had NO contract at all and fell through to
//     CAT_ALLOW.food. v8.49 named this gap and deliberately left it; v8.63
//     closes it with measured Google types only.
// After the fix, measured on the same pool: Arts 85 rows led by Manatee
// Performing Arts Center / Firehouse Cultural Center; Desserts 202 led by
// creameries and juice bars.
//
// Every assertion CALLS placeAllowed — the doctrine's "assert on the call,
// not the string". Fixture rows are the real leakers'/keepers' type arrays.
import { placeAllowed, SUB_ALLOW } from "../lib/placeFilter.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const p = (name, types, primary) => ({ name, types, primary_type: primary || types[0], primaryType: primary || types[0] });

// ── Arts refuses the substring accidents (real rows, real types) ───────────
ok(!placeAllowed("attractions", "arts", p("Tampa Fishing Charters, Inc.", ["fishing_charter", "tour_agency", "point_of_interest"])),
  "a fishing charter is not Arts — `fishing_charter` must not match on the ART inside chARTer");
ok(!placeAllowed("attractions", "arts", p("Crunch Fitness - Parrish", ["gym", "tanning_studio", "yoga_studio", "fitness_center", "sauna", "spa"], "gym")),
  "a gym is not Arts — tanning_studio/yoga_studio must not match on STUDIO");
ok(!placeAllowed("attractions", "arts", p("Dragon Martial Arts Academy", ["martial_arts_school", "sports_school"], "martial_arts_school")),
  "a martial-arts school is not Arts — underscores are word chars, \\barts\\b must not fire inside martial_arts_school");

// ── Arts keeps the real venues (the rows that lead the fixed serve) ────────
ok(placeAllowed("attractions", "arts", p("Manatee Performing Arts Center", ["performing_arts_theater", "event_venue", "point_of_interest"])),
  "a performing-arts theater IS Arts");
ok(placeAllowed("attractions", "arts", p("Firehouse Cultural Center", ["cultural_center", "art_gallery", "point_of_interest"])),
  "a cultural center / gallery IS Arts");
ok(placeAllowed("attractions", "arts", p("Ruskin Family Drive-In Theatre", ["movie_theater", "drive_in_theater", "point_of_interest"], "movie_theater")),
  "a movie theater IS Arts");
ok(placeAllowed("attractions", "arts", p("Village of the Arts", ["tourist_attraction", "point_of_interest"], "tourist_attraction")),
  "\\barts\\b keeps the NAME vote for a venue literally named for the arts (types carry no signal)");

// ── Desserts has a contract and it means dessert ───────────────────────────
ok(!!SUB_ALLOW["food:dessert"], "food:dessert HAS a SUB_ALLOW contract — the v8.49 fall-through to CAT_ALLOW.food is closed");
ok(!placeAllowed("food", "dessert", p("C & K Smokehouse BBQ", ["barbecue_restaurant", "restaurant", "food"], "barbecue_restaurant")),
  "a BBQ smokehouse is not Desserts — the exact live leaker");
ok(!placeAllowed("food", "dessert", p("P J's Sandwich Shop", ["sandwich_shop", "restaurant", "food"], "sandwich_shop")),
  "a sandwich shop is not Desserts");
ok(!placeAllowed("food", "dessert", p("Keke's Breakfast Cafe", ["breakfast_restaurant", "brunch_restaurant", "restaurant"], "breakfast_restaurant")),
  "a pancake/breakfast diner is not Desserts — `pancake` must not leak through \\bcakes?\\b");
ok(placeAllowed("food", "dessert", p("Pomegranate Frozen Yogurt", ["frozen_yogurt_shop", "dessert_shop", "ice_cream_shop", "food"], "frozen_yogurt_shop")),
  "a frozen-yogurt / dessert shop IS Desserts (the row that now leads the serve)");
ok(placeAllowed("food", "dessert", p("American Honey Creamery and Coffee Co.", ["ice_cream_shop", "dessert_shop", "cafe", "food"], "ice_cream_shop")),
  "an ice-cream creamery IS Desserts");
ok(placeAllowed("food", "dessert", p("Publix Bakery", ["bakery", "food", "store"], "bakery")),
  "a bakery IS Desserts (bakery: 516 rows measured in inventory)");
ok(placeAllowed("food", "dessert", p("3Natives", ["acai_shop", "juice_shop", "health_food_restaurant"], "acai_shop")),
  "an acai/juice bar IS Desserts (acai_shop 74 / juice_shop 99 rows measured)");

// ── Breakfast refuses dinner rooms riding a secondary brunch tag ───────────
// Live leaker (owner screenshot, 2026-08-26): Fleming's Prime Steakhouse
// ranked #4 under Food → Breakfast. Its inventory row really carries a
// SECONDARY `brunch_restaurant` type from Google (Sunday brunch), and the
// allow reads the full type string. Primary identity decides.
ok(!placeAllowed("food", "breakfast", p("Fleming’s Prime Steakhouse & Wine Bar",
  ["steak_house", "bar_and_grill", "wine_bar", "fine_dining_restaurant", "brunch_restaurant", "bar", "restaurant", "food"], "steak_house")),
  "a steakhouse with a secondary brunch tag is NOT Breakfast — the exact live Fleming's row");
ok(placeAllowed("food", "breakfast", p("First Watch", ["breakfast_restaurant", "brunch_restaurant", "cafe", "restaurant"], "breakfast_restaurant")),
  "a real breakfast restaurant IS Breakfast (First Watch, the row that leads the serve)");
ok(placeAllowed("food", "breakfast", p("Keke's Breakfast Cafe", ["breakfast_restaurant", "brunch_restaurant", "restaurant"], "breakfast_restaurant")),
  "Keke's stays Breakfast");
ok(placeAllowed("food", "dinner", p("Fleming’s Prime Steakhouse & Wine Bar",
  ["steak_house", "bar_and_grill", "wine_bar", "fine_dining_restaurant", "brunch_restaurant", "bar", "restaurant", "food"], "steak_house")),
  "…and Fleming's keeps its real home under Dinner");

// ── The other chips the leakers legitimately belong to stay intact ─────────
ok(placeAllowed("attractions", "tours", p("Tampa Fishing Charters, Inc.", ["fishing_charter", "tour_agency", "point_of_interest"])),
  "the charter still belongs to Tours — narrowing Arts must not orphan it");
ok(placeAllowed("attractions", "marinas", p("Tampa Fishing Charters, Inc.", ["fishing_charter", "tour_agency", "point_of_interest"])),
  "…and to On the water");
ok(placeAllowed("food", "breakfast", p("Keke's Breakfast Cafe", ["breakfast_restaurant", "brunch_restaurant", "restaurant"], "breakfast_restaurant")),
  "Keke's still belongs to Breakfast");

console.log(`\ntest-chip-contracts: ${fail ? "FAIL" : "OK"} — ${pass} executed placeAllowed verdicts; Arts refuses charters/gyms and keeps theaters, Desserts refuses BBQ and keeps creameries`);
process.exit(fail ? 1 : 0);
