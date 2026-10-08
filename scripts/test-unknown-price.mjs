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
let pass = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL: " + m); process.exit(1); } pass++; };
const eq = (a, b, m) => ok(a === b, m + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")");
const imp = (f) => import(path.resolve(f));

const { normalizePrice, priceLabel, priceLevelOf } = await imp("lib/price.js");
const { toDateNightPlace } = await imp("lib/dateNightIntent.js");
const { sortPlacesBy, isSortedBy } = await imp("lib/sortModes.js");

// --- normalizer ---------------------------------------------------------------
eq(normalizePrice({ priceNum: 0 }), null, "priceNum 0 (the defaulted fallback) is unknown");
eq(normalizePrice(0), null, "bare 0 is unknown");
eq(normalizePrice({ priceNum: 0, priceLevel: "PRICE_LEVEL_FREE" }), null, "FREE riding on the priceNum:0 fallback is unknown");
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
eq(priceLabel({ priceNum: 0, priceLevel: "PRICE_LEVEL_FREE" }), null, "fallback-FREE prints no label");
eq(priceLabel(0), null, "0 prints no label");
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
const stale = { ...m, priceNum: 0, priceLevel: "PRICE_LEVEL_FREE" }; // an old cached API response
eq(priceLabel(stale), null, "stale cached {priceNum:0, PRICE_LEVEL_FREE} still prints no chip");

// --- sort: known ascending (free first), unknown last, rating tie-break --------
const row = (id, rating, extra) => ({ id, name: id, rating, reviews: 100, wfScore: rating * 10, ...extra });
const list = [
  row("unk-hi", 4.9, {}),
  row("exp", 4.5, { priceLevel: "PRICE_LEVEL_EXPENSIVE" }),
  row("fallback-free", 4.8, { priceNum: 0, priceLevel: "PRICE_LEVEL_FREE" }),
  row("cheap-lo", 4.1, { priceNum: 1 }),
  row("mod", 4.4, { price_level: "PRICE_LEVEL_MODERATE" }),
  row("real-free", 4.0, { priceLevel: "PRICE_LEVEL_FREE" }),
  row("cheap-hi", 4.7, { priceLevel: "PRICE_LEVEL_INEXPENSIVE" }),
];
const out = sortPlacesBy(list, "price").map((p) => p.id);
eq(out.join(","), "real-free,cheap-hi,cheap-lo,mod,exp,unk-hi,fallback-free", "price sort: free, 1 (rating order), 2, 3, then unknown last (rating order)");
ok(isSortedBy(sortPlacesBy(list, "price"), "price"), "isSortedBy agrees");

// --- renderers route through the normalizer ------------------------------------
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const intent = strip(readFileSync("app/components/IntentRail.js", "utf8"));
ok(/priceLabel\(r\)/.test(intent), "IntentRail prints priceLabel(whole row), not the bare priceLevel string");

console.log(`test-unknown-price: OK — ${pass} assertions (normalizer fallback/real FREE/enum/number/null; date-night mapper emits no price for a price-blind row; price sort known-asc unknown-last)`);
