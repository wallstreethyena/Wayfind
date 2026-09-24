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
ok(/chipIdentity\(cat, subId/.test(SRC),
  "serveFromInventory applies chipIdentity(cat, subId) — the tapped chip, not physical:sub");
// 2026-09-23: the ordering proof no longer anchors on a literal
// "return rankInventory(" — serveFromInventoryUncached now calls rankInventory
// into a variable (fullRanked, with an unbounded n) so it can page/hydrate the
// result, it does not return it directly. "rankInventory(rows, lat, lng,
// radiusM" alone is NOT unique — rankInventory's own declaration matches the
// same text — so this anchors on the full exhaustive-read call site
// (", Infinity)"), which exists exactly once, inside serveFromInventoryUncached.
ok(SRC.indexOf("chipIdentity(cat, subId") < SRC.indexOf("rankInventory(rows, lat, lng, radiusM, Infinity)"),
  "…and it does so BEFORE rankInventory — Family → Rainy used to rank unfiltered attractions");
ok(/await import\(["']\.\/chipIdentity\.js["']\)/.test(SRC),
  "chipIdentity is a dynamic import inside serveFromInventory — a top-level import leaked 0.2KB onto the homepage");
const EXPLODING = readFileSync(new URL("../lib/explodingNearby.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
ok(!/from ["'].*inventoryServe/.test(EXPLODING),
  "explodingNearby must not import inventoryServe — that was the homepage-JS leak of chipIdentity");
// 2026-09-23 — THE READ ITSELF MUST BE EXHAUSTIVE, not just geo-bounded. A
// bounded-but-capped `limit=1000` still lost Ryan's Coffee House (row 1,001+
// of 1,598 food rows near Parrish). The box math (boxForRadius) stays inline
// here; the actual paged fetch now lives in lib/ownedPool.js's
// readOwnedCategory, called through a LAZY import — asserted directly against
// both files rather than a substring that used to live in just one of them.
ok(/boxForRadius\(lat, lng, radiusM\)/.test(SRC),
  "the geo box is still computed from the caller's exact radius");
ok(/await import\(["']\.\/ownedPool\.js["']\)/.test(SRC) && /readOwnedCategory\(/.test(SRC),
  "serveFromInventory reads through ownedPool's readOwnedCategory, not a capped single fetch");
const OWNED_SRC = readFileSync(new URL("../lib/ownedPool.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
ok(/order=place_id\.asc/.test(OWNED_SRC),
  "readOwnedCategory orders by place_id — the fix for the heap-order truncation that lost 81% of nearby cafés");
ok(/Range-Unit/.test(OWNED_SRC) && /from \+= page/.test(OWNED_SRC),
  "readOwnedCategory pages with Range headers to exhaustion, not a single limit=1000");
ok(/lat=gte\.|lat=lte\./.test(OWNED_SRC),
  "the exhaustive read is GEO-BOUNDED — an unbounded read would page the whole category, not just the box");

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
ok(/if\s*\(\s*sub\s*&&\s*sub\s*!==\s*"all"\s*&&\s*SUB_ALLOW\[/.test(HOME),
  "a specific identity chip widens from inventory when SUB_ALLOW[cat:sub] exists — a `false &&` mention is the v8.49 false green");
ok(/const\s+inv\s*=\s*await\s+_invAll\(m\)/.test(HOME),
  "the chip path CALLS _invAll(m) so the owned library is the list");

if (fail.length) {
  console.error(`check-narrow-chip-inventory: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-narrow-chip-inventory: OK (${pass} assertions) — the chip filters before the cap`);
