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
  browseChipLibraryCat,
  mergeBrowseSources,
  BROWSE_INVENTORY_N,
} from "../lib/browseInventory.js";
import { CHIP_IDENTITY, chipIdentity, isRainyDayPlace, isSitOnSandPlace } from "../lib/chipIdentity.js";

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
  types: row.google_types || row.types,
  primary_type: row.primary_type || row.primaryType,
  primaryType: row.primaryType || row.primary_type,
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
  "Desserts stays named debt — no SUB_ALLOW, so we must not dump unfiltered food into it");
ok(browseChipUsesInventory("food", "dinner") === false, "Dinner stays named debt on the client — CHIP_IDENTITY is server-side so the 496KB ratchet holds");
ok(browseChipUsesInventory("food", "quickbites") === false,
  "Quick bites stays named debt — no contract, so we must not dump unfiltered food into it");
ok(browseChipUsesInventory("food", "delivery") === false,
  "Delivery stays named debt — no contract, so we must not dump unfiltered food into it");
ok(browseChipUsesInventory("hotels", "luxury") === false, "Stays chips stay named debt on the client — CHIP_IDENTITY is server-side so the 496KB ratchet holds");
ok(browseChipUsesInventory("family", "rainy") === true, "Family → Rainy day uses owned inventory");
ok(browseChipUsesInventory("attractions", "beaches") === true, "Activities → Beaches uses owned inventory");
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
ok(/if\s*\(\s*sub\s*&&\s*sub\s*!==\s*"all"\s*&&\s*SUB_ALLOW\[/.test(HOME),
  "home _fetchAt widens when SUB_ALLOW[cat:sub] exists — a `false &&` mention is the v8.49 false green");
ok(/const\s+inv\s*=\s*await\s+_invAll\(m\)/.test(HOME),
  "an identity chip CALLS _invAll(m) — Google searchPlaces alone is the v8.49 bug");
ok(/if\s*\(\s*inv\.length\s*\)\s*return\s+inv/.test(HOME),
  "a filled library is returned as-is; Google is only the empty-library fallback");
ok(/n=400&cat=/.test(HOME),
  "the inv=1 serve asks for 400 (the cost bound), not a merchandising 40");
ok(/primaryType:\s*x\.primaryType/.test(HOME),
  "inventory rows keep primaryType so lunch identity can see breakfast_restaurant");

const FETCH = HOME.slice(HOME.indexOf("const _fetchAt"), HOME.indexOf("const _startM"));
ok(FETCH.includes("SUB_ALLOW["),
  "_fetchAt itself (not some other helper) is where the inventory widen lives");
ok(!/return await searchPlaces\(cat, sub/.test(FETCH.split("SUB_ALLOW[")[0]),
  "the searchPlaces-only return must sit AFTER the inventory widen, not be the only path");

// ── 6. serveFromInventory still filters before rank (edit the ORDER, fail) ──
const SRC = readFileSync(new URL("../lib/inventoryServe.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
ok(SRC.indexOf("chipIdentity(cat, subId") < SRC.indexOf("return rankInventory("),
  "serveFromInventory applies chipIdentity(cat, subId) BEFORE rankInventory — Family → Rainy is family:rainy, not attractions:rainy");
ok(!/slice\(\s*0\s*,\s*Math\.min\([^)]*,\s*50\)/.test(SRC),
  "rankInventory must not hide a merchandising 50 inside Math.min — that was the leftover cap");

// ── 7. Full-taxonomy identity: Family / Beaches / named CHIP_IDENTITY ────────
// Parse SUBFILTERS from source — do not import lib/google.js (client Loader).
const gSrc = GOOGLE_SRC.slice(GOOGLE_SRC.indexOf("export const SUBFILTERS"), GOOGLE_SRC.indexOf("export function queryFor"));
let curCat = null;
const subChips = [];
for (const line of gSrc.split("\n")) {
  const c = line.match(/^\s{2}([a-z]+):\s*\[/);
  if (c) { curCat = c[1]; continue; }
  const i = line.match(/\{\s*id:\s*"([a-z]+)"/);
  if (i && curCat) subChips.push(`${curCat}:${i[1]}`);
}
ok(subChips.length > 20, `parsed SUBFILTERS chips (got ${subChips.length})`);

const cadzan = { name: "Ca' d'Zan", types: ["museum", "tourist_attraction"], primaryType: "museum", category: "attractions" };
const tibbals = { name: "Tibbals Learning Center & Circus Museum at The Ringling", types: ["museum"], primaryType: "museum" };
const riverWalk = { name: "River Walk", types: ["park", "tourist_attraction"], primaryType: "park" };
const siesta = { name: "Siesta Key Beach", types: ["beach"], primaryType: "beach" };
const bishop = { name: "Bishop Museum of Science and Nature", types: ["museum", "science_museum"], primaryType: "museum" };
const intense = { name: "Intense Escape", types: ["amusement_center"], primaryType: "amusement_center" };
const kidsEmpire = { name: "Kids Empire", types: ["amusement_center", "entertainment"], primaryType: "amusement_center" };
const tennis = { name: "Siesta Key Tennis Club", types: ["tennis_court"], primaryType: "tennis_court" };
const fortDeSoto = { name: "Fort De Soto Park", types: ["park", "beach"], primaryType: "park" };

ok(chipIdentity("family", "rainy", cadzan) === false, "Rainy day refuses Ca' d'Zan");
ok(isRainyDayPlace(cadzan) === false, "isRainyDayPlace itself refuses Ca' d'Zan");
ok(chipIdentity("family", "rainy", tibbals) === false, "Rainy day refuses Tibbals / Ringling circus museum");
ok(chipIdentity("family", "rainy", riverWalk) === false, "Rainy day refuses an outdoor River Walk");
ok(chipIdentity("family", "rainy", siesta) === false, "Rainy day refuses a beach");
ok(chipIdentity("family", "rainy", bishop) === true, "Rainy day keeps Bishop (indoor science museum)");
ok(chipIdentity("attractions", "museums", bishop) === true, "Museums keeps Bishop");
ok(chipIdentity("attractions", "beaches", bishop) === false, "Beaches refuses Bishop");
ok(chipIdentity("family", "toddlers", bishop) === false, "Toddlers refuses Bishop (membership museum, not a toddler room)");
ok(chipIdentity("attractions", "beaches", cadzan) === false, "Beaches refuses Ca' d'Zan — a mansion is not sit-on-sand");
ok(isSitOnSandPlace(cadzan) === false, "isSitOnSandPlace itself refuses Ca' d'Zan");
ok(chipIdentity("attractions", "beaches", tennis) === false, "Beaches refuses a tennis club");
ok(chipIdentity("attractions", "beaches", siesta) === true, "Beaches keeps Siesta Key Beach");
ok(chipIdentity("attractions", "beaches", fortDeSoto) === true, "Beaches keeps Fort De Soto (park + beach)");
ok(chipIdentity("family", "kids", intense) === false, "Kids refuses Intense Escape (adult escape room)");
ok(chipIdentity("family", "kids", kidsEmpire) === true, "Kids keeps Kids Empire");

ok(browseChipLibraryCat("attractions", "beaches") === "beach",
  "Activities → Beaches reads wf_inventory category=beach, not attractions");
ok(browseChipLibraryCat("family", "rainy") === "family",
  "Family → Rainy day keeps the tapped family cat so VIRTUAL_CATS still applies");

for (const key of subChips) {
  const fn = CHIP_IDENTITY[key];
  ok(!!fn, `${key} has a named CHIP_IDENTITY predicate`);
  ok(!!fn && /^is[A-Z]/.test(fn.name),
    `${key} identity is a named isX function (got ${fn && fn.name}) — a placeAllowed wrapper with no name is the decorative chip`);
}

ok(!/from ["'].*chipIdentity/.test(HOME),
  "home.js must not import chipIdentity — that graph blew the 496KB homepage ratchet");
const SRC_SOURCES = readFileSync(new URL("../lib/sources.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
ok(!/from ["'].*chipIdentity/.test(SRC_SOURCES),
  "sources.js must not import chipIdentity — that graph is homepage JS and the 496KB ratchet");
ok(!/\bmc=\{browseCat\}/.test(HOME) && !/\bmc === "family"/.test(HOME),
  "home.js must not grow a Family eyebrow table — that 0.2KB is why CI hit 496.2; identity is server-side");

// ── 8. Family chips cannot share a ranked list (live smoke 2026-08-26) ─────
// Trust smoked aa17e8ab at 12:50 AM ET: Family → Toddlers, Kids, and Rainy
// day each returned the SAME 222-item list in the SAME order (Kids Empire,
// Intense Escape, Premier Escape, Freedom Factory, … Tibbals at 13).
// That is fail-open on attractions:sub (Family is VIRTUAL). Identity must
// run on the tapped chip BEFORE rank, and the first 10 names must differ.
const genericAttractions = Array.from({ length: 80 }, (_, i) => ({
  place_id: `fa${i}`, name: `Freedom Factory ${i}`, category: "attractions",
  google_types: ["tourist_attraction", "amusement_center"], primary_type: "tourist_attraction",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.9, reviews: 8000 - i },
}));
const toddlerRooms = Array.from({ length: 12 }, (_, i) => ({
  place_id: `tp${i}`, name: `Toddler Playground ${i}`, category: "attractions",
  google_types: ["playground", "park"], primary_type: "playground",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.4, reviews: 80 },
}));
const kidRooms = Array.from({ length: 12 }, (_, i) => ({
  place_id: `ka${i}`, name: `Kids Arcade ${i}`, category: "attractions",
  google_types: ["amusement_center", "entertainment"], primary_type: "amusement_center",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.4, reviews: 90 },
}));
const rainyRooms = Array.from({ length: 12 }, (_, i) => ({
  place_id: `rm${i}`, name: `Indoor Science Museum ${i}`, category: "attractions",
  google_types: ["museum", "science_museum"], primary_type: "science_museum",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.4, reviews: 85 },
}));
const familyLib = [
  ...genericAttractions,
  ...toddlerRooms, ...kidRooms, ...rainyRooms,
  { place_id: "cadzan", ...cadzan, ...near(0), status: "OPERATIONAL", signals: { rating: 4.8, reviews: 7000 } },
  { place_id: "tibbals", ...tibbals, ...near(1), status: "OPERATIONAL", signals: { rating: 4.7, reviews: 6000 } },
  { place_id: "intense", ...intense, ...near(2), status: "OPERATIONAL", signals: { rating: 4.8, reviews: 6500 } },
  { place_id: "kidsempire", ...kidsEmpire, ...near(3), status: "OPERATIONAL", signals: { rating: 4.8, reviews: 6400 } },
  { place_id: "premier", name: "Premier Escape", types: ["amusement_center"], primaryType: "amusement_center",
    google_types: ["amusement_center"], primary_type: "amusement_center",
    ...near(4), status: "OPERATIONAL", signals: { rating: 4.8, reviews: 6300 } },
];

function chipRows(cat, sub) {
  return familyLib.filter((row) => chipIdentity(cat, sub, asPlace(row)));
}
function browseFamily(sub) {
  return rankInventory(chipRows("family", sub), PARRISH.lat, PARRISH.lng, RADIUS_M, BROWSE_INVENTORY_N);
}
const names10 = (rows) => rows.slice(0, 10).map((p) => (p.displayName && p.displayName.text) || p.name || p.id);

const unfilteredFamily = rankInventory(familyLib, PARRISH.lat, PARRISH.lng, RADIUS_M, 10);
ok(unfilteredFamily.length === 10, "control: unfiltered family rank produced 10 cards");
ok(unfilteredFamily[0] && unfilteredFamily[0].id === "fa0",
  "control: unfiltered family rank leads with the high-review generic attraction — that is the live 222-item disease");

const toddlerBrowse = browseFamily("toddlers");
const kidsBrowse = browseFamily("kids");
const rainyBrowse = browseFamily("rainy");
const toddler10 = names10(toddlerBrowse);
const kids10 = names10(kidsBrowse);
const rainy10 = names10(rainyBrowse);
ok(toddler10.length === 10, `Toddlers identity produced 10 cards (got ${toddler10.length})`);
ok(kids10.length === 10, `Kids identity produced 10 cards (got ${kids10.length})`);
ok(rainy10.length === 10, `Rainy day identity produced 10 cards (got ${rainy10.length})`);
ok(toddler10.join("|") !== kids10.join("|"),
  `Toddlers first 10 must not equal Kids first 10 (live smoke). toddlers=${toddler10.join(", ")} kids=${kids10.join(", ")}`);
ok(kids10.join("|") !== rainy10.join("|"),
  `Kids first 10 must not equal Rainy day first 10 (live smoke). kids=${kids10.join(", ")} rainy=${rainy10.join(", ")}`);
ok(toddler10.join("|") !== rainy10.join("|"),
  `Toddlers first 10 must not equal Rainy day first 10 (live smoke). toddlers=${toddler10.join(", ")} rainy=${rainy10.join(", ")}`);
ok(!rainyBrowse.some((p) => p.id === "cadzan" || /ca['’].?d['’].?zan/i.test((p.displayName && p.displayName.text) || "")),
  "Ca' d'Zan is not on Family → Rainy day");
ok(!rainyBrowse.some((p) => p.id === "tibbals"),
  "Tibbals is not on Family → Rainy day");
ok(!kidsBrowse.some((p) => p.id === "intense" || p.id === "premier"),
  "adult escape rooms are not on Family → Kids");
ok(chipRows("attractions", "beaches").every((r) => r.place_id !== "cadzan"),
  "Ca' d'Zan is not on Activities → Beaches");

if (fail.length) {
  console.error(`test-browse-library: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`test-browse-library: OK (${pass} assertions) — Cafés ${cafeBrowse.length}/${cafeIdentity.length}, Lunch ${lunchBrowse.length}/${lunchIdentity.length}, lead=${lunchLead && lunchLead.displayName.text}`);
