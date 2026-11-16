#!/usr/bin/env node
// scripts/test-detail-cta-place-city.mjs — a place sheet's partner links name
// the PLACE's city, not the visitor's.
//
// 2026-11-11, live: a visitor whose location was Parrish opened The Charles
// Hosmer Morse Museum (Orlando). The "Search Viator" fallback carried
// city=Parrish, and /api/viator/go appends the city to the search term, so
// Viator was asked for "The Charles Hosmer Morse Museum of American Art
// Parrish". Detail.js now takes ctaCity from lib/placeCity (the same ladder the
// sheet's own location line trusts) and keeps the visitor's city only as the
// fallback for a place with no trustworthy city.
//
// Hermetic: no env, no network, no writes.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeCity } from "../lib/placeCity.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// The CALL: the ladder Detail.js now uses names the place's city for the
// shapes the sheet receives.
ok(placeCity({ address: "445 N Park Ave, Winter Park, FL 32789, USA" }) === "Winter Park", "A1 a formatted address names its own city");
ok(placeCity({ locality: "Orlando" }) === "Orlando", "A2 an inventory locality names the city");
ok(placeCity({ postal_city: "Sarasota" }) === "Sarasota", "A3 a verified postal city names the city");
ok(!placeCity({}), "A4 a place with no city yields nothing (so the visitor's city is the fallback)");

// The WIRING: the declaration, not a substring anywhere.
const src = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const decl = src.match(/const\s+ctaCity\s*=\s*([^;\n]+);/g) || [];
ok(decl.length === 1, `B1 Detail.js declares ctaCity exactly once (found ${decl.length})`);
ok(/^const\s+ctaCity\s*=\s*placeCity\(detail\)\s*\|\|\s*\(locName\s*\?/.test(decl[0] || ""),
  "B2 ctaCity is the place's city first, the visitor's city only as fallback");
ok(/import\s*\{\s*placeCity\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/placeCity\.js"/.test(src), "B3 Detail.js imports placeCity from lib/placeCity.js");
ok(/<BookingCTA\s+variant="list"[^>]*\bcity=\{ctaCity\}/.test(src), "B4 the list BookingCTA (Search Viator fallback) receives ctaCity");

console.log(`test-detail-cta-place-city: OK — ${n} assertions (placeCity ladder called on 4 shapes; Detail.js ctaCity declared once, place city first, wired to the list BookingCTA)`);
