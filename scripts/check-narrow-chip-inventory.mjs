#!/usr/bin/env node
// check-narrow-chip-inventory — a narrow chip must filter BEFORE the cap.
//
// Owner, repeatedly: "the cafes are still not working." Food > Cafés in Parrish
// rendered "Nothing here right now" while 111 admissible cafés sat in inventory
// within 17 miles.
//
// THE ORDERING BUG. serveFromInventory served the whole CATEGORY;
// rankInventory returned the TOP 50 by `rating*20 + reviews/100`; only then did
// the chip filter run. Across all food near Parrish those 50 slots go to
// big-review restaurants — measured, ZERO of them cafés — so the chip filtered
// a shelf it had never been on. Same shape as v8.48's count-vs-cards defect and
// v8.46's terminal skeleton: a confident empty produced by an ordering, not by
// missing data.
//
// This EXECUTES the ordering against a synthetic pool built to reproduce it: a
// cap's worth of high-review restaurants plus a handful of real cafés. If the
// filter ever moves back behind the cap, the cafés vanish and this fails.
import { rankInventory, serveFromInventory } from "../lib/inventoryServe.js";
import { placeAllowed, SUB_ALLOW } from "../lib/placeFilter.js";
import { readFileSync } from "node:fs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const PLAT = 27.5859, PLNG = -82.4254;
const near = (i) => ({ lat: PLAT + i * 0.0009, lng: PLNG });

// 60 restaurants that will win every one of the 50 slots on score...
const restaurants = Array.from({ length: 60 }, (_, i) => ({
  place_id: `r${i}`, name: `Steakhouse ${i}`, category: "food",
  google_types: ["restaurant", "american_restaurant"], primary_type: "restaurant",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.8, reviews: 4000 },
}));
// ...and 6 real cafés that cannot.
const cafes = Array.from({ length: 6 }, (_, i) => ({
  place_id: `c${i}`, name: `Roaster ${i}`, category: "food",
  google_types: ["coffee_shop", "cafe"], primary_type: "coffee_shop",
  ...near(i), status: "OPERATIONAL", signals: { rating: 4.6, reviews: 120 },
}));
const pool = [...restaurants, ...cafes];
const R = 17 * 1609.34;

// 1. THE DEFECT, reproduced: rank first, filter after.
const rankedFirst = rankInventory(pool, PLAT, PLNG, R, 50)
  .filter((p) => placeAllowed("food", "cafes", p));
ok(rankedFirst.length === 0,
  "the OLD order (rank 50, then filter) yields ZERO cafés — this is the bug, reproduced");

// 2. THE FIX: filter first, then rank.
const filteredFirst = rankInventory(
  pool.filter((row) => placeAllowed("food", "cafes", {
    name: row.name, types: row.google_types, primary_type: row.primary_type, category: row.category,
  })), PLAT, PLNG, R, 50);
ok(filteredFirst.length === 6,
  `filtering BEFORE the cap serves all 6 cafés (got ${filteredFirst.length})`);

// 3. THE WIRE. serveFromInventory must accept and honour `sub`.
ok(serveFromInventory.length >= 6,
  "serveFromInventory accepts a `sub` argument");
const SRC = readFileSync(new URL("../lib/inventoryServe.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
ok(/placeAllowed\(physical, subId,/.test(SRC),
  "serveFromInventory applies placeAllowed with the sub");
ok(SRC.indexOf("placeAllowed(physical, subId,") < SRC.indexOf("return rankInventory("),
  "…and it does so BEFORE rankInventory — the whole point");
ok(/lat=gte\.|lat=lte\./.test(SRC),
  "the inventory read is GEO-BOUNDED — an unbounded limit=1000 reads heap order and loses 81% of nearby cafés");

// 4. FAIL-OPEN. An unknown chip must not empty a category.
const unknown = rankInventory(pool, PLAT, PLNG, R, 50);
ok(unknown.length > 0 && !SUB_ALLOW["food:notachip"],
  "an unrecognised sub has no contract and must fall through, never empty the tab");

// 5. THE CALLERS. Every serveFromInventory call site passes the sub through,
// and the browse feed actually sends it.
const ROUTE = readFileSync(new URL("../app/api/places/search/route.js", import.meta.url), "utf8");
// Match to end-of-statement, not to the first ")" — one call site wraps its
// first argument in String(...), and a lazy paren match stops inside it.
const calls = ROUTE.match(/serveFromInventory\(.*?\);/g) || [];
ok(calls.length > 0 && calls.every((c) => /params\.sub/.test(c)),
  `every serveFromInventory call in the route forwards params.sub (${calls.length} call sites)`);
const HOME = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/inv=1\$\{sub && sub !== "all"/.test(HOME),
  "the browse feed sends &sub= on its inv=1 serve");
ok(/if\s*\(\s*browseChipUsesInventory\(\s*cat,\s*sub\s*\)\s*\)/.test(HOME),
  "a specific identity chip actually CALLS if (browseChipUsesInventory(cat, sub)) — a `false &&` mention is the v8.49 false green");
ok(/mergeBrowseSources\(/.test(HOME),
  "the chip path merges owned inventory into the browse list");

if (fail.length) {
  console.error(`check-narrow-chip-inventory: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-narrow-chip-inventory: OK (${pass} assertions) — the chip filters before the cap`);
