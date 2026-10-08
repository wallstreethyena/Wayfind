#!/usr/bin/env node
// scripts/test-unknown-price.mjs — owner rule (2026-10-08): NEVER INVENT PRICES.
// Unknown price renders as NO price chip and sorts LAST; it is never "$" /
// "Inexpensive". Live evidence: /date-night Key West + Miami showed Latitudes,
// El Toro Loco and Carnicero as "$ · Inexpensive" (the mapper defaulted a
// missing price to 0 / PRICE_LEVEL_FREE, priceLevelOf folded 0 into 1), and
// "Price: low to high" never sorted (priceKey ignored PRICE_LEVEL_* strings and
// priceNum, so every row tied and fell back to rating).
// CALL-level: imports the real functions and invokes them.
import path from "node:path";
import { readFileSync } from "node:fs";
import { loadComponent } from "./lib/jsxLoad.mjs";
let pass = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); process.exit(1); } pass++; };
const eq = (a, b, m) => ok(a === b, m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")");
const imp = (f) => import(path.resolve(f));

const { normalizePrice, priceNumFrom, priceLabel, priceLevelOf } = await imp("lib/price.js");
const { toDateNightPlace, scrubLegacyPrice } = await imp("lib/dateNightIntent.js");
const { sortPlacesBy, isSortedBy } = await imp("lib/sortModes.js");

// --- normalizer ---------------------------------------------------------------
eq(normalizePrice({ priceNum: 0 }), "free", "priceNum 0 from a real field (lib/google.js shape) is free");
eq(normalizePrice(0), "free", "bare 0 is free");
eq(normalizePrice({ priceNum: 0, priceLevel: "PRICE_LEVEL_FREE" }), "free", "explicit FREE + 0 is free");
eq(priceNumFrom("PRICE_LEVEL_FREE"), 0, "priceNumFrom: free -> 0");
eq(priceNumFrom(undefined), null, "priceNumFrom: unknown -> null, never 0");
eq(priceNumFrom("PRICE_LEVEL_EXPENSIVE"), 3, "priceNumFrom: EXPENSIVE -> 3");
eq(normalizePrice({ priceLevel: "PRICE_LEVEL_FREE" }), "free", "FREE from a real price field with no fallback companion is free");
eq(normalizePrice("PRICE_LEVEL_FREE"), "free", "bare real FREE string is free");
eq(normalizePrice({ priceLevel: "PRICE_LEVEL_EXPENSIVE" }), 3, "PRICE_LEVEL_EXPENSIVE -> 3");
eq(normalizePrice("PRICE_LEVEL_VERY_EXPENSIVE"), 4, "PRICE_LEVEL_VERY_EXPENSIVE -> 4");
eq(normalizePrice({ price_level: "PRICE_LEVEL_MODERATE" }), 2, "price_level string read");
eq(normalizePrice(3), 3, "number 3 -> 3");
eq(normalizePrice({ priceNum: 2 }), 2, "priceNum 2 -> 2");
eq(normalizePrice(null), null, "null -> null");
eq(normalizePrice(undefined), null, "undefined -> null");
eq(normalizePrice({}), null, "empty place -> null");
eq(normalizePrice("PRICE_LEVEL_UNSPECIFIED"), null, "UNSPECIFIED -> null");
eq(priceLabel(0), "Free", "0 (real free) prints Free");
eq(priceLabel({ priceLevel: "PRICE_LEVEL_FREE" }), "Free", "real FREE prints Free");
eq(priceLabel({ priceNum: 3 }), "$$$ · Expensive", "known price still prints");
eq(priceLevelOf(0), null, "priceLevelOf(0) is not 1");

// --- date-night mapper: a promoted (price-blind) row ---------------------------
const blind = { id: "ChIJ1", name: "Carnicero Steakhouse", rating: 4.6, userRatingCount: 900, primaryType: "steak_house", types: ["steak_house"], location: { latitude: 25.76, longitude: -80.19 } };
const m = toDateNightPlace(blind, { lat: 25.76, lng: -80.19 });
ok(m, "mapper returns a row for a promoted row without price");
ok(m.priceNum === null && m.priceLevel === null, "mapper: no price data -> priceNum/priceLevel null, not 0 / PRICE_LEVEL_FREE");
eq(priceLabel(m), null, "mapper output renders NO price chip");
const priced = toDateNightPlace({ ...blind, priceLevel: "PRICE_LEVEL_EXPENSIVE" });
ok(priced.priceNum === 3 && priced.priceLevel === "PRICE_LEVEL_EXPENSIVE", "mapper keeps a real price");
const free = toDateNightPlace({ ...blind, priceLevel: "PRICE_LEVEL_FREE" });
eq(priceLabel(free), "Free", "mapper keeps a real FREE as Free");
ok(free.priceNum === 0 && free.priceSrc === "field", "mapper: real free keeps priceNum 0 (passes <=1 filters) and is marked as from a field");
eq(priceLabel(scrubLegacyPrice(free)), "Free", "scrub leaves a marked real free alone");
const stale = { ...m, priceNum: 0, priceLevel: "PRICE_LEVEL_FREE", priceSrc: undefined }; // an old cached /api/date-night response
eq(priceLabel(scrubLegacyPrice(stale)), null, "legacy cached {priceNum:0, PRICE_LEVEL_FREE} without priceSrc prints no chip in the date-night path");

// --- free places are not regressed across the sources --------------------------
const googleFree = { id: "g1", name: "Park", priceNum: 0 }; // lib/google.js shape: priceNum 0, no priceLevel
eq(normalizePrice(googleFree), "free", "google.js-shaped free row -> free");
ok(googleFree.priceNum <= 1 && priceNumFrom(googleFree) <= 1, "google.js-shaped free row passes priceNum<=1 filter");

const { mapInventoryRow } = await loadComponent(path.resolve("lib/inventoryRowClient.js"), process.cwd());
const invFree = mapInventoryRow({ id: "i1", displayName: { text: "Free Museum" }, location: { latitude: 27.5, longitude: -82.4 }, rating: 4.6, userRatingCount: 300, priceLevel: "PRICE_LEVEL_FREE" }, { lat: 27.5, lng: -82.4 });
ok(invFree.priceNum === 0 && invFree.priceNum <= 1, "inventory PRICE_LEVEL_FREE -> priceNum 0 (free), passes <=1 filter");
const invUnk = mapInventoryRow({ id: "i2", displayName: { text: "Blind" }, location: { latitude: 27.5, longitude: -82.4 }, rating: 4.6, userRatingCount: 300 }, { lat: 27.5, lng: -82.4 });
ok(invUnk.priceNum === null, "inventory row with no price -> null (unknown), not 0");
const { toRow } = await imp("lib/intentPages.js");
const rowFree = toRow({ id: "r1", displayName: { text: "Free Park" }, rating: 4.7, userRatingCount: 500, priceLevel: "PRICE_LEVEL_FREE", location: { latitude: 27.5, longitude: -82.4 } }, { lat: 27.5, lng: -82.4 });
const rowUnk = toRow({ id: "r2", displayName: { text: "Blind" }, rating: 4.7, userRatingCount: 500, location: { latitude: 27.5, longitude: -82.4 } }, { lat: 27.5, lng: -82.4 });
ok(rowFree && rowFree.priceLevel === 0, "intent row: FREE -> 0 (passes maxPrice), not collapsed to 1");
ok(rowUnk && rowUnk.priceLevel === null, "intent row: no price -> null");

// --- sort: known ascending (free first), unknown last, rating tie-break --------
const row = (id, rating, extra) => ({ id, name: id, rating, reviews: 100, wfScore: rating * 10, ...extra });
const list = [
  row("unk-hi", 4.9, {}),
  row("exp", 4.5, { priceLevel: "PRICE_LEVEL_EXPENSIVE" }),
  row("free-hi", 4.8, { priceNum: 0, priceLevel: "PRICE_LEVEL_FREE" }),
  row("cheap-lo", 4.1, { priceNum: 1 }),
  row("mod", 4.4, { price_level: "PRICE_LEVEL_MODERATE" }),
  row("free-lo", 4.0, { priceLevel: "PRICE_LEVEL_FREE" }),
  row("cheap-hi", 4.7, { priceLevel: "PRICE_LEVEL_INEXPENSIVE" }),
];
const out = sortPlacesBy(list, "price").map((p) => p.id);
eq(out.join(","), "free-hi,free-lo,cheap-hi,cheap-lo,mod,exp,unk-hi", "price sort: free, 1 (rating order), 2, 3, unknown last");
ok(isSortedBy(sortPlacesBy(list, "price"), "price"), "isSortedBy agrees");

// --- renderers route through the normalizer ------------------------------------
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const intent = strip(readFileSync("app/components/IntentRail.js", "utf8"));
ok(/priceLabel\(r\)/.test(intent), "IntentRail prints priceLabel(whole row), not the bare priceLevel string");

// --- routes that fabricated priceNum 0 for missing data (indexOf -1 -> Math.max(0)) ---
for (const f of ["app/api/birthday/route.js", "app/api/today-discovery/route.js", "app/api/lunch-break/route.js"]) {
  const src = strip(readFileSync(f, "utf8"));
  ok(/priceNumFrom/.test(src) && /function toBirthdayPlace|function toPlace|function toLunchPlace/.test(src), f + ": positive control (maps places and imports priceNumFrom)");
  ok(!/Math\.max\(0,\s*values\.indexOf/.test(src), f + ": no fabricated 0 for an unknown price");
}

console.log(`test-unknown-price: OK — ${pass} assertions (normalizer fallback/real FREE/enum/number/null; date-night mapper emits no price for a price-blind row; price sort known-asc unknown-last)`);
