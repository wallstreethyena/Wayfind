#!/usr/bin/env node
// test-browse-library — the HOME MENU must show the owned library.
//
// Owner, 2026-08-25, Parrish, live on gowayfind.com:
//   Food → Cafés  "That's all 1 food spot near Parrish."  (Keke's only)
//   Food → Lunch  two cards, #1 Keke's Breakfast Cafe tagged BREAKFAST.
//
// test-sparse-category.mjs already locks the honest "That's all N" line. That
// is NOT this bug. Honesty about a 1-card list is how a pool-cap hides the
// library and still looks finished.
//
// THE MECHANISM, executed here against a fixture built to reproduce it:
//   · 60 high-review restaurants win any unfiltered food top-20 / top-50
//   · 12 cafés never crack that top-N (the v8.49 measurement: 0 of the top
//     50 food rows near Parrish were cafés, of 111 admissible)
//   · Keke's is a breakfast_restaurant with a HIGHER score than anything else
//   · 8 named lunch rooms sit under the restaurant noise
//
// A browse that still filters a Google/food top-N then applies the chip
// returns 0–1 cafés and leads Lunch with Keke's. A browse that runs the
// identity over the whole library returns every café and leads Lunch with a
// lunch room.
//
// Radius is DEFAULT_RADIUS_MI (17), the documented browse start — not a guess.

import { readFileSync } from "node:fs";
import { rankInventory } from "../lib/inventoryServe.js";
import { placeAllowed, SUB_ALLOW } from "../lib/placeFilter.js";
import { isLunchPlace } from "../lib/mealPlace.js";
import { isBreakfastPlace } from "../lib/breakfast.js";
import {
  browseChipUsesInventory,
  mergeBrowseSources,
  BROWSE_INVENTORY_N,
} from "../lib/browseInventory.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const GOOGLE_SRC = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
ok(/(?:export const)\s+DEFAULT_RADIUS_MI\s*=\s*17\b/.test(GOOGLE_SRC),
  "documented browse radius is the DEFAULT_RADIUS_MI = 17 declaration in lib/google.js");
const DEFAULT_RADIUS_MI = 17;
const PARRISH = { lat: 27.5859, lng: -82.4254 };
const RADIUS_M = DEFAULT_RADIUS_MI * 1609.34;
const near = (i) => ({ lat: PARRISH.lat + i * 0.0009, lng: PARRISH.lng });

const restaurants = Array.from({ length: 60 }, (_, i) => ({
  place_id: `r${i}`, name: `Steakhouse ${i}`, category: "food",
  google_types: ["restaurant", "american_restaurant"], primary_type: "restaurant",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.8, reviews: 4000 - i },
}));
const cafes = Array.from({ length: 12 }, (_, i) => ({
  place_id: `c${i}`, name: `Roaster ${i}`, category: "food",
  google_types: ["coffee_shop", "cafe"], primary_type: "coffee_shop",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.6, reviews: 120 },
}));
const lunchRooms = Array.from({ length: 8 }, (_, i) => ({
  place_id: `l${i}`, name: `Burger Room ${i}`, category: "food",
  google_types: ["hamburger_restaurant"], primary_type: "hamburger_restaurant",
  ...near(i + 20), status: "OPERATIONAL", signals: { rating: 4.5, reviews: 200 },
}));
const kekes = {
  place_id: "kekes", name: "Keke's Breakfast Cafe", category: "food",
  google_types: ["breakfast_restaurant", "cafe", "brunch_restaurant", "diner"],
  primary_type: "breakfast_restaurant",
  ...near(0), status: "OPERATIONAL", signals: { rating: 4.9, reviews: 9000 },
};
const desserts = Array.from({ length: 4 }, (_, i) => ({
  place_id: `d${i}`, name: `Froyo ${i}`, category: "food",
  google_types: ["dessert_shop"], primary_type: "dessert_shop",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.9, reviews: 800 },
}));
const library = [...restaurants, ...cafes, ...lunchRooms, kekes, ...desserts];

const asPlace = (row) => ({
  name: row.name,
  types: row.google_types,
  primary_type: row.primary_type,
  primaryType: row.primary_type,
  category: row.category,
});

function identityRows(cat, sub) {
  return library.filter((row) => placeAllowed(cat, sub, asPlace(row)));
}

function browseFromLibrary(cat, sub, n = BROWSE_INVENTORY_N) {
  // THE FIX, executed: identity over the whole library, THEN rank. This is
  // what serveFromInventory does when `sub` is forwarded, and what _fetchAt
  // must call for an identity chip. A top-N-then-filter is the bug.
  return rankInventory(identityRows(cat, sub), PARRISH.lat, PARRISH.lng, RADIUS_M, n);
}

// ── 1. Cafés: identity count === browse count ───────────────────────────────
const cafeIdentity = identityRows("food", "cafes");
const cafeBrowse = browseFromLibrary("food", "cafes");
ok(cafeIdentity.length === 12 + 1,
  `Cafés identity over the fixture is the 12 roasters + Keke's (cafe in types) — got ${cafeIdentity.length}`);
ok(cafeBrowse.length === cafeIdentity.length,
  `Cafés browse returns the identity count (${cafeIdentity.length}), not a top-N slice (got ${cafeBrowse.length})`);

// The OLD order, reproduced: rank the whole category first, then filter.
const rankedFirstCafes = rankInventory(library, PARRISH.lat, PARRISH.lng, RADIUS_M, 20)
  .filter((p) => placeAllowed("food", "cafes", p));
ok(rankedFirstCafes.length < cafeIdentity.length,
  `the OLD order (rank 20, then filter) hides cafés — got ${rankedFirstCafes.length} vs identity ${cafeIdentity.length}`);

// ── 2. Lunch: identity count === browse count, and not "any food" ───────────
const lunchIdentity = identityRows("food", "lunch");
const lunchBrowse = browseFromLibrary("food", "lunch");
ok(lunchIdentity.length === 60 + 8,
  `Lunch identity is the 60 restaurants + 8 burger rooms, not desserts/cafés/Keke's — got ${lunchIdentity.length}`);
ok(lunchBrowse.length === lunchIdentity.length,
  `Lunch browse returns the identity count (${lunchIdentity.length}), not a top-N slice (got ${lunchBrowse.length})`);
ok(!lunchIdentity.some((r) => r.place_id === "kekes"),
  "Keke's is NOT in the Lunch identity — breakfast-only primary");
ok(!lunchIdentity.some((r) => String(r.primary_type).startsWith("dessert") || r.primary_type === "coffee_shop"),
  "Lunch is not any food — dessert counters and coffee shops stay out");

// ── 3. Lunch #1 is not a breakfast-only room ────────────────────────────────
ok(isBreakfastPlace(asPlace(kekes)) === true, "control: Keke's IS breakfast");
ok(isLunchPlace(asPlace(kekes)) === false, "control: Keke's is NOT lunch");
ok(isLunchPlace(asPlace(lunchRooms[0])) === true, "control: a burger room IS lunch");
ok(isLunchPlace(asPlace(cafes[0])) === false, "control: a coffee shop is NOT lunch");

const lunchLead = lunchBrowse[0];
ok(!!lunchLead, "Lunch browse produced a lead card");
ok(lunchLead && lunchLead.id !== "kekes",
  `Lunch #1 must not be Keke's when lunch library exists (got ${lunchLead && lunchLead.id})`);
ok(lunchLead && lunchLead.primaryType !== "breakfast_restaurant",
  `Lunch #1 must not be a breakfast-only primary (got ${lunchLead && lunchLead.primaryType})`);
ok(isLunchPlace({
  name: lunchLead && lunchLead.displayName && lunchLead.displayName.text,
  primaryType: lunchLead && lunchLead.primaryType,
  types: lunchLead && lunchLead.types,
}) === true, "Lunch #1 itself passes isLunchPlace");

// Unfiltered food rank WOULD lead with Keke's — that is the bug, reproduced.
const foodLead = rankInventory(library, PARRISH.lat, PARRISH.lng, RADIUS_M, 20)[0];
ok(foodLead && foodLead.id === "kekes",
  "control: unfiltered food rank leads with Keke's (highest reviews) — so a missing lunch identity is how the live bug happened");

// ── 4. Helpers, executed ────────────────────────────────────────────────────
ok(browseChipUsesInventory("food", "cafes") === true, "Cafés chip uses owned inventory");
ok(browseChipUsesInventory("food", "lunch") === true, "Lunch chip uses owned inventory");
ok(browseChipUsesInventory("food", "breakfast") === true, "Breakfast chip uses owned inventory (it has a contract)");
ok(browseChipUsesInventory("food", "dessert") === false,
  "Desserts stays named debt — no contract, so we must not dump unfiltered food into it");
ok(browseChipUsesInventory("food", "all") === false, "'All' is the existing union path, not this helper");
ok(!!SUB_ALLOW["food:lunch"], "food:lunch has a SUB_ALLOW contract — no longer CATEGORY_WIDE");
ok(BROWSE_INVENTORY_N === 400, `BROWSE_INVENTORY_N is the 400 cost bound (got ${BROWSE_INVENTORY_N})`);

const merged = mergeBrowseSources(
  cafeBrowse.map((p) => ({ id: p.id, name: p.displayName.text, _wfInventory: true })),
  [{ id: "google-only", name: "A Google Café" }, { id: cafeBrowse[0].id, name: "lean twin" }],
);
ok(merged.length === cafeBrowse.length + 1,
  "merge keeps every inventory café plus a Google-only row");
ok(merged[0]._wfInventory === true, "inventory rows win the merge (first writer)");
ok(merged.find((p) => p.id === cafeBrowse[0].id)._wfInventory === true,
  "a Google twin does not replace the library row");

// ── 5. THE WIRE in home.js — the CALL, not the name ─────────────────────────
const HOME = readFileSync(new URL("../app/home.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
ok(/if\s*\(\s*browseChipUsesInventory\(\s*cat,\s*sub\s*\)\s*\)/.test(HOME),
  "home _fetchAt CALLS if (browseChipUsesInventory(cat, sub)) — a `false &&` mention is the v8.49 false green");
ok(/mergeBrowseSources\(/.test(HOME),
  "home _fetchAt CALLS mergeBrowseSources(");
ok(new RegExp(`n=\\$\\{BROWSE_INVENTORY_N\\}`).test(HOME) || HOME.includes(`n=\${BROWSE_INVENTORY_N}`),
  "the inv=1 serve asks for BROWSE_INVENTORY_N, not a merchandising 40");
ok(/primaryType:\s*x\.primaryType/.test(HOME),
  "inventory rows keep primaryType so lunch identity can see breakfast_restaurant");

const FETCH = HOME.slice(HOME.indexOf("const _fetchAt"), HOME.indexOf("const _startM"));
ok(FETCH.includes("browseChipUsesInventory"),
  "_fetchAt itself (not some other helper) is where the inventory widen lives");
ok(!/return await searchPlaces\(cat, sub/.test(FETCH.split("browseChipUsesInventory")[0]),
  "the searchPlaces-only return must sit AFTER the inventory widen, not be the only path");

// ── 6. serveFromInventory still filters before rank (edit the ORDER, fail) ──
const SRC = readFileSync(new URL("../lib/inventoryServe.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
ok(SRC.indexOf("placeAllowed(physical, subId,") < SRC.indexOf("return rankInventory("),
  "serveFromInventory still applies placeAllowed BEFORE rankInventory");
ok(!/slice\(\s*0\s*,\s*Math\.min\([^)]*,\s*50\)/.test(SRC),
  "rankInventory must not hide a merchandising 50 inside Math.min — that was the leftover cap");

if (fail.length) {
  console.error(`test-browse-library: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`test-browse-library: OK (${pass} assertions) — Cafés ${cafeBrowse.length}/${cafeIdentity.length}, Lunch ${lunchBrowse.length}/${lunchIdentity.length}, lead=${lunchLead && lunchLead.displayName.text}`);
