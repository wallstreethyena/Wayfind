#!/usr/bin/env node
// scripts/check-not-public-places.mjs — HERMETIC guard for lib/notPublicPlaces.js.
//
// Owner decision 2026-09-29: Le Mans Kitchen (ChIJWSN54VZBw4gRJeqLPipSLEM,
// 707 S Washington Blvd, inside the Sarasota Ford dealership, "curated
// exclusively for our customers") is not a public restaurant and must not sit
// on /restaurants/sarasota. It was driving junk "sarasota ford ... 707 s
// washington blvd" impressions.
//
// Asserted by CALLING the real code with a fixture pool (no network, no DB, no
// env): rankedForCenter (the landing pool builder), rankInventory and
// isServableRow (the two inventory choke points), and isIndexable (the /places
// robots decision). The heart of it is the ORDER proof: ranking the pool WITH
// the not-public row must equal ranking the pool WITHOUT it, item for item,
// score for score. That is what "ranking untouched" means.
//
// Red-proof (run by hand 2026-09-29, see the commit message): removing the
// isNotPublicPlace() line from rankLandingPool makes sections 3 and 4 fail.

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { NOT_PUBLIC_PLACES, isNotPublicPlace } from "../lib/notPublicPlaces.js";
import { rankInventory } from "../lib/inventoryServe.js";
import { isServableRow } from "../lib/ownedPool.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const LE_MANS = "ChIJWSN54VZBw4gRJeqLPipSLEM";

// ── 1. The registry itself: exact ids, a reason, an owner decision date ──
const entry = NOT_PUBLIC_PLACES.find((e) => e.place_id === LE_MANS);
ok(!!entry, "Le Mans Kitchen is in the registry by exact place_id");
ok(entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.decided) && entry.decided === "2026-09-29", "entry records the owner decision date 2026-09-29");
ok(entry && entry.decidedBy === "owner", "entry records who decided");
ok(entry && typeof entry.reason === "string" && entry.reason.length > 20, "entry records a reason");
ok(NOT_PUBLIC_PLACES.every((e) => /^ChIJ[A-Za-z0-9_-]{20,}$/.test(e.place_id)), "every registry key is a real-shaped Google place_id, never a name");
ok(new Set(NOT_PUBLIC_PLACES.map((e) => e.place_id)).size === NOT_PUBLIC_PLACES.length, "no duplicate ids");
ok(Object.isFrozen(NOT_PUBLIC_PLACES), "registry is frozen");

// ── 2. Predicate: exact id only ──
ok(isNotPublicPlace(LE_MANS) === true, "string id matches");
ok(isNotPublicPlace({ id: LE_MANS }) === true, "landing-shaped row (id) matches");
ok(isNotPublicPlace({ place_id: LE_MANS }) === true, "inventory-shaped row (place_id) matches");
ok(isNotPublicPlace({ id: "ChIJWSN54VZBw4gRJeqLPipSLEN", name: "Le Mans Kitchen" }) === false, "a one-character-different id is NOT matched, even with the same name");
ok(isNotPublicPlace({ id: "other", name: "Le Mans Kitchen" }) === false, "NAME never matches (an honest namesake elsewhere is safe)");
ok(isNotPublicPlace(null) === false && isNotPublicPlace("") === false && isNotPublicPlace({}) === false, "empty inputs are false");

// ── 3. Landing pool builder, fixture pool ──
// Sarasota-shaped restaurants with distinct scores. Le Mans is given the BEST
// rating so that, if the gate were missing, it would visibly lead the list.
const sarasota = { name: "Sarasota", state: "FL", lat: 27.3364, lng: -82.5307 };
const mk = (id, name, rating, reviews, dLat) => ({
  place_id: id, id, name, rating, userRatingCount: reviews, formattedAddress: "Sarasota, FL",
  types: ["restaurant", "food"], primaryType: "restaurant",
  location: { latitude: 27.33 + dLat, longitude: -82.53 }, businessStatus: "OPERATIONAL",
});
const neighbours = [
  mk("fx-alpha", "Alpha Grill", 4.6, 900, 0.001),
  mk("fx-beta", "Beta Bistro", 4.4, 1200, 0.003),
  mk("fx-gamma", "Gamma Cafe", 4.7, 500, 0.004),
  mk("fx-delta", "Delta Diner", 4.2, 2000, 0.005),
  mk("fx-epsilon", "Epsilon Eats", 4.5, 700, 0.006),
];
const lemans = mk(LE_MANS, "Le Mans Kitchen", 4.9, 400, 0.002);
// Same row under an id the registry does not know: the CONTROL that proves the
// fixture really would rank it if the gate were absent.
const control = { ...lemans, place_id: "fx-not-registered", id: "fx-not-registered" };

const landing = await loadComponent(join(ROOT, "lib/landing.js"), ROOT);
const run = async (rows) => (await landing.rankedForCenter("restaurants", { ...sarasota }, { inventoryRows: rows }, "sarasota")) || [];
const shape = (list) => list.map((p) => [p.id, p._s, p.name].join("|"));

const without = await run(neighbours);
const withLemans = await run([neighbours[0], neighbours[1], lemans, ...neighbours.slice(2)]);
const withControl = await run([neighbours[0], neighbours[1], control, ...neighbours.slice(2)]);

ok(without.length === neighbours.length, `fixture sanity: all ${neighbours.length} neighbours survive on their own (got ${without.length})`);
ok(!withLemans.some((p) => p.id === LE_MANS), "Le Mans is NOT in the restaurants landing pool");
ok(withControl.some((p) => p.id === "fx-not-registered"), "CONTROL: the identical row under an unregistered id IS ranked (the fixture would show it)");
ok(withControl[0] && withControl[0].id === "fx-not-registered", "CONTROL: it would have LED the list (best rating), so the exclusion is doing real work");
ok(JSON.stringify(shape(withLemans)) === JSON.stringify(shape(without)),
  "ORDER PROOF: pool WITH Le Mans ranks identically (ids, scores, order) to the pool WITHOUT it");
ok(withLemans.every((p) => neighbours.some((n) => n.id === p.id)), "every neighbour is still present");
// Neighbours' scores match the unexcluded control run for the same rows (score math untouched).
const scoreOf = (list, id) => (list.find((p) => p.id === id) || {})._s;
ok(neighbours.every((n) => scoreOf(withLemans, n.id) === scoreOf(withControl, n.id)),
  "neighbour scores are the same whether or not the excluded row is present");

// The same gate holds on the other landing categories (it is id-keyed, not chip-keyed).
for (const cat of ["things-to-do", "nightlife", "beaches"]) {
  const rows = [neighbours[0], lemans];
  const list = (await landing.rankedForCenter(cat, { ...sarasota }, { inventoryRows: rows }, "sarasota")) || [];
  ok(!list.some((p) => p.id === LE_MANS), `Le Mans is not on the ${cat} landing pool either`);
}

// ── 4. Inventory choke points (rails, chips, exhaustive reader) ──
const invRow = (id, name, rating, dLat) => ({
  place_id: id, name, lat: 27.33 + dLat, lng: -82.53, category: "food", status: "OPERATIONAL",
  primary_type: "restaurant", google_types: ["restaurant"], signals: { rating, reviews: 500 },
});
const invRows = [invRow("fx-a", "A", 4.5, 0.001), invRow(LE_MANS, "Le Mans Kitchen", 4.9, 0.002), invRow("fx-b", "B", 4.6, 0.003)];
ok(invRows.map((r) => r.place_id).includes(LE_MANS), "POSITIVE CONTROL: the fixture inventory really does contain the not-public id");
const ranked = rankInventory(invRows, 27.3364, -82.5307, 20000, 20);
const rankedNo = rankInventory(invRows.filter((r) => r.place_id !== LE_MANS), 27.3364, -82.5307, 20000, 20);
ok(ranked.length === 2 && !ranked.some((p) => p.id === LE_MANS), "rankInventory never serves the not-public id");
ok(JSON.stringify(ranked.map((p) => p.id)) === JSON.stringify(rankedNo.map((p) => p.id)), "rankInventory order of the remaining rows is unchanged");
ok(isServableRow(invRow(LE_MANS, "Le Mans Kitchen", 4.9, 0.002)) === false, "isServableRow refuses the not-public id");
ok(isServableRow(invRow("fx-a", "A", 4.5, 0.001)) === true, "CONTROL: isServableRow still serves a normal row");
ok(isServableRow(invRow("fx-not-registered", "Le Mans Kitchen", 4.9, 0.002)) === true, "CONTROL: same name, other id, still served");

// ── 5. /places page stays noindex ──
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { register } = await import("node:module");
register("./lib/placeDataNodeHook.mjs", import.meta.url);
const placeData = await import("../lib/placeData.js");
const { listIndexedIds } = await import("../lib/placeIndex.js");
const sitemapIds = await listIndexedIds(500);
const { listGuidePlaceIds, guidePlaceFor, guidePlaceHasSubstantiveDetail } = await import("../lib/guidePlaceIndex.js");
const { mergePlacePage } = await import("../lib/atlasPlaceAllowlist.js");
const realEligibleId = listGuidePlaceIds().find((id) => {
  const g = guidePlaceFor(id);
  if (!guidePlaceHasSubstantiveDetail(g)) return false;
  const merged = mergePlacePage(id, { skel: null, details: null, atlas: null, guide: g, editorial: null });
  return !!(merged && merged.durableEligible);
});
ok(!!realEligibleId, "fixture sanity: a real durably eligible guide id exists");
ok(sitemapIds.includes(realEligibleId), "POSITIVE CONTROL: listIndexedIds() does list a real durably eligible guide id");
ok(!sitemapIds.includes(LE_MANS), "the not-public id is not in the sitemap id set (listIndexedIds)");
ok(placeData.isIndexable({ id: LE_MANS, durableEligible: true }) === false, "isIndexable is false for the not-public id even when otherwise durably eligible (noindex)");
ok(placeData.isIndexable({ id: "fx-other", durableEligible: true }) === true, "CONTROL: isIndexable is unchanged for a normal eligible page");
ok(placeData.isIndexable({ id: LE_MANS, durableEligible: false }) === false, "and false when not eligible, as before");

if (fail.length) {
  console.error("check-not-public-places: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`check-not-public-places: OK (${pass} assertions)`);
