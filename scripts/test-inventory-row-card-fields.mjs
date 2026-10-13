#!/usr/bin/env node
// Lock: an inventory-served row keeps the facts its card needs.
//
// 2026-10-06 (richer place cards). Food browse cards looked empty because the client
// mapper dropped priceLevel, cuisines and editorialSummary.text, all of which
// lib/inventoryServe.js invRowToPlace already sends. This CALLS the real mapper (never a
// regex over its source) on a real server-shaped row, and asserts the card fields land.
import path from "node:path";
import { readFileSync } from "node:fs";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = process.cwd();
let n = 0; const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

const { mapInventoryRow } = await loadComponent(path.join(ROOT, "lib/inventoryRowClient.js"), ROOT);
const serve = await loadComponent(path.join(ROOT, "lib/inventoryServe.js"), ROOT);
const { toAppShape } = await import(path.join(ROOT, "scripts/lib/parity/clientGates.mjs"));
const center = { lat: 27.55, lng: -82.43 };

const dbRow = {
  place_id: "ChIJrich", name: "Siam Garden", lat: 27.56, lng: -82.44, category: "food",
  primary_type: "thai_restaurant", google_types: ["thai_restaurant", "restaurant"],
  cuisines: ["thai"], tags: ["lunch", "dinner"], status: "OPERATIONAL",
  editorial: "Family-run Thai kitchen known for its crispy duck and a shaded courtyard.",
  signals: { rating: 4.7, reviews: 640, priceNum: 2 },
};
const served = serve.invRowToPlace(dbRow);
ok(Array.isArray(served.tags) && served.tags.includes("lunch"), "invRowToPlace must send tags (the meal chip's evidence)");
const card = mapInventoryRow(served, center);
ok(card && card.name === "Siam Garden", "the mapper still names the place");
ok(card.priceNum === 2, `priceLevel MODERATE must land as priceNum 2 (got ${card.priceNum}) — the card's PriceMeter reads it`);
ok(Array.isArray(card.cuisines) && card.cuisines[0] === "thai", "cuisines must survive the mapper");
ok(Array.isArray(card.tags) && card.tags.join() === "lunch,dinner", "tags must survive the mapper");
ok(/crispy duck/.test(card._invEditorial || ""), "editorialSummary.text must survive as _invEditorial (seeds the why line)");
ok(typeof card.wfScore === "number" && card.wfScore > 0 && card._wfInventory === true, "score and provenance are unchanged");

// A stored signals.priceNum of 0 is a REAL free; it stays 0 (home.js PriceMeter + priceNum<=1 filters), never "$".
const free = mapInventoryRow(serve.invRowToPlace({ ...dbRow, place_id: "f1", signals: { ...dbRow.signals, priceNum: 0 } }), center);
ok(free.priceNum === 0, `stored priceNum 0 / PRICE_LEVEL_FREE stays free (0), never 1 or null (got ${free.priceNum})`);

// A row with nothing: honest nulls, never invented.
const bare = mapInventoryRow(serve.invRowToPlace({ place_id: "ChIJbare", name: "Bare Cafe", lat: 27.5, lng: -82.4, signals: { rating: 4.4, reviews: 30 } }), center);
ok(bare.priceNum === null && bare._invEditorial === null && bare.cuisines.length === 0 && bare.tags.length === 0, "a row with no price/cuisine/tags/editorial maps to nulls and empties, not guesses");

// Owned photo passthrough beats ref-building.
const ph = mapInventoryRow(serve.invRowToPlace({ ...dbRow, place_id: "p1", photo_url: "https://cdn.example.com/a.jpg" }), center);
ok(ph.photo === "https://cdn.example.com/a.jpg", "photo_url passes through to card.photo");
const ph2 = mapInventoryRow(serve.invRowToPlace({ ...dbRow, place_id: "p2", photo_ref: "places/x/photos/y" }), center);
ok(/^\/api\/photo\?ref=/.test(ph2.photo || ""), "a photo_ref still builds the /api/photo URL");

// An already app-shaped row passes through untouched.
const shaped = { id: "a", name: "Already", rating: 4.5 };
ok(mapInventoryRow(shaped, center) === shaped, "an app-shaped row passes through unchanged");

// The select list the server reads must request tags, or invRowToPlace has nothing to send.
ok(serve.EXHAUSTIVE_INVENTORY_FIELDS.split(",").includes("tags"), "EXHAUSTIVE_INVENTORY_FIELDS must request the tags column");

// Parity: the guard harness's app shape carries the same card fields.
const par = toAppShape(served, center.lat, center.lng);
ok(par.priceNum === 2 && par.cuisines[0] === "thai" && par.tags.length === 2 && !!par._invEditorial, "scripts/lib/parity/clientGates.mjs toAppShape mirrors the card fields");

// Wiring: ONE mapper (home.js imports it, never re-declares), blurbs seeded from it, sorted-slice known-for.
const home = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
ok(/import \{ mapInventoryRow \} from "\.\.\/lib\/inventoryRowClient"/.test(home), "home.js imports the one mapper");
ok(!/function mapInventoryRow\s*\(/.test(home), "home.js must not re-declare mapInventoryRow (a driftable second copy)");
ok(/_invEditorial/.test(home) && /fetchKnownFor\(/.test(home), "loadBlurbs seeds from _invEditorial and known-for is requested through fetchKnownFor");
ok(/const _viewTopIds = view\.slice\(0, 40\)/.test(home), "known-for is also requested for the top 40 of the SORTED visible list");
ok(/const CACHE_EPOCH = (?:[5-9]|\d{2,});/.test(home), "CACHE_EPOCH was bumped (cached lines changed shape/precedence)");

if (bad.length) { console.error("test-inventory-row-card-fields: FAIL\n  - " + bad.join("\n  - ")); process.exit(1); }
console.log(`test-inventory-row-card-fields: OK — ${n} assertions (the real mapper was called on a server-shaped row: price, cuisine, tags, editorial, photo survive; nulls stay null)`);
