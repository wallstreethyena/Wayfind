#!/usr/bin/env node
// scripts/test-apple-free-pins.mjs — locks the free Apple pin path (2026-10-21,
// owner: "I want the pins, and I don't want to buy that").
//   A. identity: lib/applePlaceMatch.js refuses every unsure match
//   B. quota: no Apple call without a grant once the ledger exists; grants and
//      lifetime caps are never exceeded; the server clamps and fails closed
//   C. storage: only Place IDs are stored; a stored "apple_live" coordinate is
//      never drawn; the migration has no Apple coordinate/name/address column
//   D. parity: an Apple pin is "pinned" for its list place; every list place
//      has exactly one status
//   E. no Google: none of the Apple-pin modules can reach Google
// Behavioral: every assertion calls the real export.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { matchApplePlace, recheckResolvedPlace, nameScore, isGenericName, NAME_MIN } from "../lib/applePlaceMatch.js";
import { createAppleMapRecovery } from "../lib/appleMapRecovery.js";
import { reserveAppleServiceCalls, attachApplePlaceIds, APPLE_GRANT_MAX } from "../lib/applePlaceIds.js";
import { accountListOnMap } from "../lib/mapListAccounting.js";
import { resolveMapCoordinate, judgeCoordinate, COORD_SOURCES } from "../lib/coordProvenance.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
let n = 0;
async function check(name, fn) { await fn(); n++; console.log(`✓ ${name}`); }

const box = { north: 27.62, south: 27.02, east: -82.15, west: -82.72 };
const cafe = (extra = {}) => ({ id: "w1", name: "Ryan's Coffee House", primaryType: "cafe", types: ["cafe"], ...extra });
const apple = (extra = {}) => ({ id: "IAPPLE0001", name: "Ryan’s Coffee House", coordinate: { latitude: 27.55, longitude: -82.43 }, locality: "Parrish", pointOfInterestCategory: "Cafe", ...extra });

// ---------------------------------------------------------------- A. identity
await check("A1 exact identity inside the area with an agreeing category is accepted", () => {
  const v = matchApplePlace(cafe(), [apple()], { box });
  assert.equal(v.ok, true); assert.equal(v.appleId, "IAPPLE0001");
  assert.deepEqual(Object.keys(v).sort(), ["appleId", "category", "evidence", "lat", "lng", "nameScore", "ok"].sort(), "no Apple name/address leaves the matcher");
});
await check("A2 a different business name is refused (identity mismatch)", () => {
  const v = matchApplePlace(cafe(), [apple({ name: "Ryan's Bagel Factory" })], { box });
  assert.equal(v.ok, false); assert.equal(v.reason, "name-mismatch");
  assert.ok(nameScore("Ryan's Coffee House", "Ryan's Bagel Factory") < NAME_MIN);
});
await check("A3 the right name outside the place's area is refused", () => {
  const v = matchApplePlace(cafe(), [apple({ coordinate: { latitude: 28.54, longitude: -81.38 } })], { box });
  assert.equal(v.ok, false); assert.equal(v.reason, "outside-area");
});
await check("A4 an incompatible Apple category is refused", () => {
  const v = matchApplePlace(cafe(), [apple({ pointOfInterestCategory: "Hotel" })], { box });
  assert.equal(v.ok, false); assert.equal(v.reason, "category-mismatch");
});
await check("A5 two same-name branches in the area are ambiguous; one place listed twice is not", () => {
  const two = [apple(), apple({ id: "IAPPLE0002", coordinate: { latitude: 27.40, longitude: -82.50 } })];
  assert.equal(matchApplePlace(cafe(), two, { box }).reason, "ambiguous");
  const dup = [apple(), apple({ id: "IAPPLE0003", coordinate: { latitude: 27.5502, longitude: -82.4301 } })];
  assert.equal(matchApplePlace(cafe(), dup, { box }).ok, true);
  const alt = [apple(), apple({ id: "IAPPLE0004", alternateIds: ["IAPPLE0001"], coordinate: { latitude: 27.45, longitude: -82.45 } })];
  assert.equal(matchApplePlace(cafe(), alt, { box }).ok, true, "alternate Place IDs are the same place");
});
await check("A6 chain-like and generic names need the city to agree", () => {
  assert.equal(matchApplePlace(cafe({ name: "Starbucks" }), [apple({ name: "Starbucks", locality: "Bradenton" })], { box }).reason, "chain-needs-locality");
  assert.equal(matchApplePlace(cafe({ name: "Starbucks", locality: "Bradenton" }), [apple({ name: "Starbucks", locality: "Bradenton" })], { box }).ok, true);
  assert.equal(matchApplePlace(cafe(), [apple()], { box, sameNameIds: 2 }).reason, "chain-needs-locality");
  assert.ok(isGenericName("Village Cafe") && !isGenericName("Ryan's Coffee House"));
  assert.equal(matchApplePlace(cafe({ name: "Village Cafe" }), [apple({ name: "Village Cafe" })], { box }).reason, "generic-name-needs-locality");
});
await check("A7 city: aliases agree, a different city only for an exact name with agreeing category", () => {
  assert.equal(matchApplePlace(cafe({ locality: "St. Petersburg" }), [apple({ locality: "Saint Petersburg" })], { box }).ok, true);
  assert.equal(matchApplePlace(cafe({ locality: "Town 'n' Country" }), [apple({ locality: "Tampa" })], { box }).ok, true);
  assert.equal(matchApplePlace(cafe({ name: "Ryan's Coffee House Downtown", locality: "Sarasota" }), [apple({ locality: "Tampa" })], { box }).reason, "locality-mismatch");
  assert.equal(matchApplePlace(cafe(), [apple({ pointOfInterestCategory: null, name: "Ryans Coffee House Parrish" })], { box }).ok, false, "a non-exact name with no category to cross-check is refused");
});
await check("A8 no area, no name, no Apple id: refused", () => {
  assert.equal(matchApplePlace(cafe(), [apple()], {}).reason, "no-area");
  assert.equal(matchApplePlace(cafe({ name: "" }), [apple()], { box }).ok, false);
  assert.equal(matchApplePlace(cafe(), [apple({ id: null })], { box }).ok, false);
});
await check("A10 an extended name is a different business; a branch-word suffix matches only with agreeing city and category", () => {
  const tampaBox = { north: 28.17, south: 27.6, east: -82.2, west: -82.75 };
  const at = (name, locality = "Tampa", cat = "Restaurant") => ({ id: "IAPPLE7777", name, locality, pointOfInterestCategory: cat, coordinate: { latitude: 27.95, longitude: -82.46 } });
  const joes = matchApplePlace({ name: "Joe's Pizza", locality: "Tampa", primaryType: "restaurant" }, [at("Joe's Pizza & Pasta")], { box: tampaBox });
  assert.equal(joes.ok, false); assert.equal(joes.reason, "name-extended");
  assert.ok(nameScore("Joe's Pizza", "Joe's Pizza & Pasta") < NAME_MIN, "a prefix alone scores below NAME_MIN");
  assert.equal(matchApplePlace({ name: "Ulele", locality: "Tampa", primaryType: "restaurant" }, [at("Ulele Restaurant & Bar")], { box: tampaBox }).ok, true, "venue-word suffix + same city + agreeing category");
  assert.equal(matchApplePlace({ name: "Ulele", primaryType: "restaurant" }, [at("Ulele Restaurant & Bar")], { box: tampaBox }).reason, "prefix-needs-locality", "no Wayfind city: refused");
  assert.equal(matchApplePlace({ name: "Ulele", locality: "Tampa", primaryType: "restaurant" }, [at("Ulele Restaurant & Bar", "Tampa", null)], { box: tampaBox }).ok, false, "no Apple category: refused");
  assert.equal(matchApplePlace({ name: "Latin Grill Tampa", locality: "Brandon", primaryType: "restaurant" }, [at("Latin Grill")], { box: tampaBox }).ok, false, "a city-word suffix still needs the cities to agree");
  assert.equal(matchApplePlace({ name: "Bean Wandering Coffee Downtown", locality: "St. Petersburg", primaryType: "cafe" }, [at("Bean Wandering", "Saint Petersburg", "Cafe")], { box: tampaBox }).ok, true);
});
await check("A9 a resolved Place ID that now names another business is not pinned", () => {
  assert.equal(recheckResolvedPlace(cafe(), apple(), box).ok, true);
  assert.equal(recheckResolvedPlace(cafe(), apple({ name: "Tire Kingdom" }), box).reason, "apple-identity-changed");
  assert.equal(recheckResolvedPlace(cafe({ name: "Ulele" }), apple({ name: "Ulele Restaurant & Bar" }), box).ok, true, "a rename that adds venue words keeps the stored ID's pin");
  assert.equal(recheckResolvedPlace(cafe({ name: "Ulele" }), apple({ name: "Bern's Steak House" }), box).ok, false);
  assert.equal(recheckResolvedPlace(cafe(), apple({ coordinate: { latitude: 30, longitude: -84 } }), box).reason, "outside-area");
});

// ---------------------------------------------------------------- B. quota
const bounds = { north: 28, south: 27, east: -82, west: -83 };
const origin = { lat: 27.5, lng: -82.5 };
const listPlace = (i, extra = {}) => ({ id: `p${i}`, name: `Independent Roasters ${String.fromCharCode(65 + (i % 26))}${i}`, city: "Parrish", category: "food",
  primaryType: "cafe", types: ["cafe"], wfScore: 96, governed_score: 96, mapCoord: { ok: false, reason: "no-permitted-coordinate" }, ...extra });
const lookupOk = (calls) => async (id) => { calls.push(id); return { id, name: null, coordinate: { latitude: 27.5, longitude: -82.5 } }; };

await check("B1 Place ID lookups never exceed the ledger grant", async () => {
  const places = Array.from({ length: 10 }, (_, i) => listPlace(i, { applePlaceId: `IAPPLEID${i}X` }));
  for (const p of places) p.name = p.name; // identity unchanged
  const calls = [];
  const lookup = async (id) => { calls.push(id); const p = places.find((x) => x.applePlaceId === id); return { id, name: p.name, coordinate: { latitude: 27.5, longitude: -82.5 } }; };
  const grants = [];
  const engine = createAppleMapRecovery({ search: async () => ({ places: [] }), lookup, grant: async (u, c) => { grants.push([u, c]); return { granted: Math.min(u, 4), ledger: true }; } });
  const stats = await engine.recover({ places, bounds, origin, category: "food" });
  assert.equal(calls.length, 4, "exactly the granted units"); assert.equal(stats.lookups, 4);
  assert.equal(stats.recovered, 4); assert.equal(stats.grantLimited, true);
  assert.deepEqual(grants[0], [10, "map_place_lookup"]);
  assert.equal(Object.values(stats.outcomes).filter((o) => o === "budget").length, 6, "unfunded places are accounted as budget, not silently dropped");
});
await check("B2 no ledger (pre-migration) = zero Place ID lookups; Search keeps legacy caps", async () => {
  const places = [listPlace(1, { applePlaceId: "IAPPLEID1X" }), listPlace(2)];
  const lk = [], se = [];
  const engine = createAppleMapRecovery({ search: async (q) => { se.push(q); return { places: [] }; }, lookup: lookupOk(lk), grant: async () => ({ granted: 0, ledger: false }) });
  const stats = await engine.recover({ places, bounds, origin, category: "food" });
  assert.equal(lk.length, 0); assert.equal(se.length, 1); assert.equal(stats.ledger, false);
  const noGrant = createAppleMapRecovery({ search: async () => ({ places: [] }), lookup: lookupOk(lk) });
  await noGrant.recover({ places: [listPlace(3, { applePlaceId: "IAPPLEID3X" })], bounds, origin, category: "food" });
  assert.equal(lk.length, 0, "without a grant function a lookup can never run");
  const throws = createAppleMapRecovery({ search: async () => ({ places: [] }), lookup: lookupOk(lk), grant: async () => { throw new Error("down"); } });
  await throws.recover({ places: [listPlace(4, { applePlaceId: "IAPPLEID4X" })], bounds, origin, category: "food" });
  assert.equal(lk.length, 0, "a failing grant is a refusal");
});
await check("B3 a drained (or spoof-drained) ledger never zeroes Search: legacy caps (12 per batch, 36 per mount) apply", async () => {
  const se = [];
  const engine = createAppleMapRecovery({ search: async (q) => { se.push(q); return { places: [] }; }, grant: async () => ({ granted: 0, ledger: true }) });
  const stats = await engine.recover({ places: [listPlace(1), listPlace(2)], bounds, origin, category: "food" });
  assert.equal(se.length, 2, "Search still runs when the ledger grants 0"); assert.equal(stats.searchLegacyFallback, true); assert.equal(stats.ledger, true);
  for (let s = 0; s < 4; s++) await engine.recover({ places: Array.from({ length: 16 }, (_, i) => listPlace(100 + s * 20 + i)), bounds, origin, category: "food", scope: `d${s}` });
  assert.equal(se.length, 36, "legacy lifetime cap of 36 searches per mounted map still holds");
  const lk = [];
  const drained = createAppleMapRecovery({ search: async () => ({ places: [] }), lookup: lookupOk(lk), grant: async () => ({ granted: 0, ledger: true }) });
  await drained.recover({ places: [listPlace(9, { applePlaceId: "IAPPLEID9X" })], bounds, origin, category: "food" });
  assert.equal(lk.length, 0, "a drained ledger still blocks Place ID lookups");
});
await check("B6 the budget route has its own 10/min per-IP window", async () => {
  const { guardPaidRoute, routeRateLimitHit, APPLE_BUDGET_RL } = await import("../lib/apiGuard.js");
  assert.deepEqual([APPLE_BUDGET_RL.key, APPLE_BUDGET_RL.limit], ["apple-budget", 10]);
  const req = (ip) => new Request("https://www.gowayfind.com/api/maps/apple-budget", { method: "POST", headers: { "x-forwarded-for": ip, "sec-fetch-site": "same-origin", origin: "https://www.gowayfind.com", host: "www.gowayfind.com" } });
  const results = [];
  for (let i = 0; i < 11; i++) results.push(guardPaidRoute(req("203.0.113.7"), { routeLimit: APPLE_BUDGET_RL }));
  assert.ok(results.slice(0, 10).every((r) => r === null), "first ten pass");
  assert.equal(results[10] && results[10].status, 429, "the eleventh in a minute is refused");
  assert.equal(guardPaidRoute(req("203.0.113.8"), { routeLimit: APPLE_BUDGET_RL }), null, "another IP is unaffected");
  assert.equal(guardPaidRoute(req("203.0.113.7")), null, "the general 120/min window is unaffected for other routes");
  const t = 1e12;
  for (let i = 0; i < 10; i++) routeRateLimitHit("probe", "198.51.100.1", 10, t);
  assert.equal(routeRateLimitHit("probe", "198.51.100.1", 10, t), true);
  assert.equal(routeRateLimitHit("probe", "198.51.100.1", 10, t + 61000), false, "the window slides");
  const mw = readFileSync(ROOT + "middleware.js", "utf8");
  assert.match(mw, /path === "\/api\/maps\/apple-budget" \? APPLE_BUDGET_RL/, "middleware applies the window to the budget route");
  assert.match(mw, /"\/api\/maps\/apple-budget",/, "the budget route is in the middleware matcher");
});
await check("B7 grants are clamped to 24 per request and the browser asks in chunks of at most 24 (at most 4 requests per batch)", async () => {
  assert.equal(APPLE_GRANT_MAX, 24);
  const asks = [];
  const lk = [];
  const many = Array.from({ length: 96 }, (_, i) => listPlace(300 + i, { applePlaceId: `IAPPLEIDM${i}X` }));
  const engine = createAppleMapRecovery({ search: async () => ({ places: [] }), lookup: lookupOk(lk), grant: async (u) => { asks.push(u); return { granted: Math.min(u, 24), ledger: true }; } });
  await engine.recover({ places: many, bounds, origin, category: "food" });
  assert.ok(asks.length <= 5 && asks.every((u) => u <= 24), `asks ${asks}`);
  assert.equal(lk.length, 96);
  const short = []; const lk2 = [];
  const e2 = createAppleMapRecovery({ search: async () => ({ places: [] }), lookup: lookupOk(lk2), grant: async (u) => { short.push(u); return { granted: 5, ledger: true }; } });
  await e2.recover({ places: many.slice(0, 40), bounds, origin, category: "food" });
  assert.equal(lk2.length, 5, "a short grant stops asking");
  assert.equal(short.length, 1, "no second lookup request after a short grant");
});
await check("B4 lifetime lookup cap per mounted map holds across scopes", async () => {
  const lk = [];
  const engine = createAppleMapRecovery({ search: async () => ({ places: [] }), lookup: lookupOk(lk), grant: async (u) => ({ granted: u, ledger: true }), maxLookups: 5 });
  for (let s = 0; s < 3; s++) {
    const places = Array.from({ length: 4 }, (_, i) => listPlace(s * 10 + i, { applePlaceId: `IAPPLEID${s}${i}X` }));
    await engine.recover({ places, bounds, origin, category: "food", scope: `s${s}` });
  }
  assert.equal(lk.length, 5); assert.equal(engine.snapshot().remainingLookups, 0);
});
await check("B5 server reservation clamps units and fails closed", async () => {
  const env = { url: "https://db.example", key: "k" };
  const seen = [];
  const fetchImpl = (reply) => async (url, init) => { seen.push(JSON.parse(init.body)); return { ok: true, json: async () => reply }; };
  const g = await reserveAppleServiceCalls(10000, { env, fetchImpl: fetchImpl([{ allowed: true, reason: "reserved", calls: 96 }]) });
  assert.equal(g.granted, APPLE_GRANT_MAX); assert.equal(seen[0].p_units, APPLE_GRANT_MAX); assert.equal(seen[0].p_provider, "apple_maps");
  const full = await reserveAppleServiceCalls(5, { env, fetchImpl: fetchImpl([{ allowed: false, reason: "daily_ceiling_reached" }]) });
  assert.deepEqual([full.granted, full.ledger], [0, true]);
  const unreg = await reserveAppleServiceCalls(5, { env, fetchImpl: fetchImpl([{ allowed: false, reason: "provider_unavailable_or_rights_denied" }]) });
  assert.deepEqual([unreg.granted, unreg.ledger], [0, false]);
  const down = await reserveAppleServiceCalls(5, { env, fetchImpl: async () => ({ ok: false, status: 500 }) });
  assert.deepEqual([down.granted, down.ledger], [0, false]);
  assert.equal((await reserveAppleServiceCalls(0, { env, fetchImpl: fetchImpl([]) })).granted, 0);
});

// ---------------------------------------------------------------- C. storage
await check("C1 only list rows the map cannot pin receive a stored Place ID; failures attach nothing", async () => {
  const rows = [{ id: "a", mapCoord: { ok: false } }, { id: "b", mapCoord: { ok: true } }, { id: "c", mapCoord: { ok: false } }];
  let url = "";
  const okFetch = async (u) => { url = u; return { ok: true, json: async () => [{ place_id: "a", apple_place_id: "IAPPLEA1" }, { place_id: "c", apple_place_id: "bad id!" }] }; };
  assert.equal(await attachApplePlaceIds(rows, { env: { url: "https://db", key: "k" }, fetchImpl: okFetch }), 1);
  assert.equal(rows[0].applePlaceId, "IAPPLEA1"); assert.equal(rows[1].applePlaceId, undefined); assert.equal(rows[2].applePlaceId, undefined);
  assert.ok(/status=eq\.matched/.test(url) && !/\bb\b/.test(decodeURIComponent(url.split("place_id=in.(")[1] || "")), "asks only for unpinnable rows");
  const fresh = [{ id: "a", mapCoord: { ok: false } }];
  assert.equal(await attachApplePlaceIds(fresh, { env: { url: "https://db", key: "k" }, fetchImpl: async () => ({ ok: false, status: 404 }) }), 0);
  assert.equal(fresh[0].applePlaceId, undefined);
});
await check("C2 an Apple coordinate written into a stored row is never drawn", () => {
  assert.equal(COORD_SOURCES.apple_live.sessionOnly, true);
  assert.equal(judgeCoordinate({ source: "apple_live", lat: 27.5, lng: -82.5, observed_at: new Date().toISOString() }).reason, "session-only-source");
  const v = resolveMapCoordinate({ lat: null, lng: null, refreshed_at: null, independent_coords: [{ source: "apple_live", lat: 27.5, lng: -82.5, observed_at: new Date().toISOString() }] });
  assert.equal(v.ok, false);
});
await check("C3 the migration and the matcher store no Apple coordinate, name or address", () => {
  const sql = readFileSync(ROOT + "supabase/migrations/20261021180000_wf_apple_place_ids.sql", "utf8");
  const table = sql.slice(sql.indexOf("create table if not exists public.wf_apple_place_ids"), sql.indexOf(");", sql.indexOf("create table if not exists public.wf_apple_place_ids")));
  const cols = [...table.matchAll(/^\s+([a-z_]+)\s+(?:text|numeric|boolean|timestamptz)/gm)].map((m) => m[1]);
  assert.deepEqual(cols, ["place_id", "status", "apple_place_id", "reason", "name_score", "category_checked", "method", "matched_name", "checked_at"]);
  assert.ok(/lat|lng|coord|address|apple_name|locality/.test("apple_lat"), "column probe catches a coordinate column");
  for (const c of cols) assert.ok(!/lat|lng|coord|address|apple_name|locality/.test(c), `column ${c}`);
  const script = readFileSync(ROOT + "scripts/apple-place-match.mjs", "utf8");
  const push = script.slice(script.indexOf("out.push({"), script.indexOf("});", script.indexOf("out.push({")));
  const keys = [...push.matchAll(/([a-z_]+):/g)].map((m) => m[1]).filter((k) => !["v", "ok"].includes(k));
  for (const k of keys) assert.ok(cols.includes(k), `matcher writes only migration columns (${k})`);
});

// ---------------------------------------------------------------- D. parity
await check("D1 an Apple pin counts as pinned; every list place has exactly one status", () => {
  const list = [{ id: "x", mapCoord: { ok: false } }, { id: "y", mapCoord: { ok: false }, applePlaceId: "IAPPLEY1" }, { id: "z", mapCoord: { ok: false } }, { id: "w", mapCoord: { ok: true } }];
  const pins = [{ id: "x", coordSource: "apple_live", lat: 27.5, lng: -82.5 }, { id: "w", lat: 27.4, lng: -82.4 }];
  const acc = accountListOnMap({ listPlaces: list, pins, areaPlaces: pins, areaStatus: "ready", appleOutcomes: { z: "no-match" } });
  assert.equal(acc.total, list.length); assert.equal(acc.rows.length, list.length);
  assert.equal(Object.values(acc.counts).reduce((a, b) => a + b, 0), list.length);
  assert.deepEqual(acc.rows.map((r) => r.status), ["pinned", "no-permitted-coordinate", "no-permitted-coordinate", "pinned"]);
  assert.deepEqual([acc.rows[1].apple, acc.rows[2].apple], ["stored-id-pending", "no-match"]);
  assert.equal(acc.rows[0].apple, undefined, "a pinned row carries no Apple refusal");
});

// ---------------------------------------------------------------- E. no Google
await check("E1 no Apple-pin module can reach Google (positive control: lib/google.js)", () => {
  const RX = /googleapis\.com|maps\.google|places\.googleapis|google\.com\/maps|from\s+["'][./]*lib\/google(?:\.js)?["']|from\s+["']\.\/google(?:\.js)?["']|serverCache\.js["'][^;]*\b(?:placesSearch|googleSearch)/;
  assert.ok(RX.test(readFileSync(ROOT + "lib/inventoryRowClient.js", "utf8")), "probe finds a known Google import (lib/inventoryRowClient.js imports ./google)");
  assert.ok(RX.test("fetch('https://places.googleapis.com/v1/places:searchText')"), "probe catches a Google host");
  // 2026-10-22: the matcher moved into lib/appleMatchJob.js, shared by the
  // nightly cron route and the CLI; the list-to-map read joined the Apple path.
  const files = ["lib/applePlaceMatch.js", "lib/applePlaceIds.js", "lib/appleMapRecovery.js", "app/components/useAppleMapRecovery.js", "app/api/maps/apple-budget/route.js", "scripts/apple-place-match.mjs",
    "lib/appleMatchJob.js", "app/api/cron/apple-place-match/route.js", "app/api/places/map/list/route.js", "lib/mapListScope.js"];
  for (const f of files) {
    const src = readFileSync(ROOT + f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!RX.test(src), `${f} references Google`);
  }
  const matcherSrc = ["scripts/apple-place-match.mjs", "lib/appleMatchJob.js", "app/api/cron/apple-place-match/route.js"].map((f) => readFileSync(ROOT + f, "utf8").replace(/^\s*\/\/.*$/gm, "")).join("\n");
  const hosts = [...matcherSrc.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(hosts)].sort(), ["maps-api.apple.com"], "the matcher (lib, cron route, CLI) talks only to Apple (and the configured Supabase URL)");
});

console.log(`Apple free pins: ${n} checks passed (identity, quota, storage, parity, no-Google).`);
