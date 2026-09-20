#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { composeCreatorPicksRails, creatorPageAttemptKey, shouldAutoLoadCreatorPage } from "../lib/creatorPicksRails.js";
import { fillRails } from "../lib/railSelect.js";

const places = [
  { id: "next", name: "Next Place", governed_score: 91, creatorSources: [{ handle: "@cindy.selects", platform: "tiktok" }] },
  { id: "top", name: "Top Place", governed_score: 94, creatorSources: [
    { handle: "cindy.selects", platform: "tiktok", url: "https://example.test/cindy" },
    { handle: "second.creator", platform: "instagram", url: "https://example.test/second" },
  ] },
  { id: "ignored", name: "Ignored", governed_score: 99, creatorSources: [] },
];

const rails = composeCreatorPicksRails(places);
assert.deepEqual(rails.map((rail) => rail.handle), ["cindy.selects", "second.creator"], "one rail is created for every explicit creator handle");
assert.deepEqual(rails[0].places.map((place) => place.id), ["top", "next"], "each creator rail sorts by governed Wayfind Score even when input is unsorted");
assert.deepEqual(rails[1].places.map((place) => place.id), ["top"], "a place credited to two creators appears in both creators' rails");
assert.equal(composeCreatorPicksRails([{ id: "name-only", name: "Cindy's Cafe" }]).length, 0, "place names never infer a creator");
assert.equal(composeCreatorPicksRails([{ id: "url-only", creatorSources: [{ url: "https://tiktok.com/@invented/video/1" }] }]).length, 0, "social URLs never infer a creator");
assert.equal(composeCreatorPicksRails([]).length, 0, "empty input produces no empty rails");

const page0 = creatorPageAttemptKey("locals|tampa|afternoon", 12);
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: false, attemptKey: page0, lastAttemptKey: "" }), true, "a new page offset gets one automatic attempt");
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: false, attemptKey: page0, lastAttemptKey: page0 }), false, "an unchanged page cannot automatically retry forever");
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: true, attemptKey: page0, lastAttemptKey: page0 }), false, "a failed offset waits for the manual retry control");
const page1 = creatorPageAttemptKey("locals|tampa|afternoon", 36);
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: false, attemptKey: page1, lastAttemptKey: page0 }), true, "a successful retry that advances the loaded count resumes automatic paging");
const moved = creatorPageAttemptKey("locals|orlando|afternoon", 12);
assert.equal(shouldAutoLoadCreatorPage({ hasMore: true, loadingMore: false, loadFailed: false, attemptKey: moved, lastAttemptKey: page0 }), true, "a new location scope gets its own first attempt");

// Execute the real server pool builder without importing railsData.js (that
// module reaches server-only caches and React-bearing landing metadata). The
// optional ref makes the same assertions runnable against the checked-in
// baseline for a red proof: node ... --source-ref=HEAD
const sourceRef = String((process.argv.find((arg) => arg.startsWith("--source-ref=")) || "").slice("--source-ref=".length)).trim();
const railsDataSource = sourceRef
  ? execFileSync("git", ["show", `${sourceRef}:lib/railsData.js`], { encoding: "utf8" })
  : readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8");
const poolStart = railsDataSource.indexOf("async function buildCreatorsPool");
const poolEnd = railsDataSource.indexOf("async function buildSummerPool", poolStart);
assert.ok(poolStart >= 0 && poolEnd > poolStart, "the real buildCreatorsPool body is present for behavioral execution");
let poolBody = railsDataSource.slice(poolStart, poolEnd);
poolBody = poolBody
  .replace("async function buildCreatorsPool(pools, origin)", "async function buildCreatorsPool(pools, origin, injected)")
  .replace(
    'const { serveInventoryByPlaceIds } = await import("./inventoryServe.js");',
    "const { serveInventoryByPlaceIds } = injected;",
  );
if (!sourceRef) assert.match(poolBody, /const \{ serveInventoryByPlaceIds \} = injected;/, "the extracted pool uses the injected exact-ID reader and cannot reach a live service");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Exercise the exact reader's compatibility contract in isolation: existing
// callers still receive an array, while authoritative callers also receive
// every ID found in owned inventory even when ranking rejects that row.
const inventorySource = readFileSync(new URL("../lib/inventoryServe.js", import.meta.url), "utf8");
const exactReaderStart = inventorySource.indexOf("export async function serveInventoryByPlaceIds");
assert.ok(exactReaderStart >= 0, "the real exact owned-inventory reader is present for behavioral execution");
let exactReaderBody = inventorySource.slice(exactReaderStart)
  .replace("export async function serveInventoryByPlaceIds", "async function serveInventoryByPlaceIds")
  .replace('const { sbEnv } = await import("./serverCache.js");', "const { sbEnv } = injected;");
assert.match(exactReaderBody, /const \{ sbEnv \} = injected;/, "the extracted exact reader cannot reach live configuration");
const compileExactReader = new AsyncFunction(
  "fetchDeadline", "rankInventory", "DB_DEADLINE_MS", "injected",
  `${exactReaderBody}\nreturn serveInventoryByPlaceIds;`,
);
const inventoryRows = [{ place_id: "eligible" }, { place_id: "known-rejected" }];
const exactReader = await compileExactReader(
  async () => ({ ok: true, json: async () => inventoryRows }),
  (rows) => rows.filter((row) => row.place_id === "eligible").map((row) => ({ id: row.place_id })),
  5000,
  { sbEnv: () => ({ url: "https://inventory.test", key: "test-key" }) },
);
assert.deepEqual(await exactReader(["eligible", "known-rejected"], 0, 0, 1000), [{ id: "eligible" }], "the exact reader preserves its array return for existing callers");
assert.deepEqual(
  await exactReader(["eligible", "known-rejected"], 0, 0, 1000, { withKnownIds: true }),
  { places: [{ id: "eligible" }], knownIds: ["eligible", "known-rejected"] },
  "the authoritative return distinguishes a known rejected row from an absent ID",
);

const compilePool = new AsyncFunction(
  "spotsByCity", "allCreators", "sameVenueName", "getPlaceDetails", "normalizeDetails",
  "governedScoreOf", "haversineMi", "CREATOR_FINDS_RADIUS_MI",
  `${poolBody}\nreturn buildCreatorsPool;`,
);

const source = (handle, key, placeId = null) => ({
  handle,
  spots: [{ key, placeId, video: { creator: handle, platform: "instagram", url: `https://instagram.test/${handle}/${key}` } }],
});
const spot = (id, handle, distance = 0) => ({
  key: `key-${id}`, name: `Place ${id}`, city: "Testville", placeId: id,
  video: { creator: handle, platform: "instagram", url: `https://instagram.test/${handle}/${id}` },
  distance,
});
const detail = (id, distance, overrides = {}) => ({
  id, name: `Place ${id}`, rating: 4.7, reviews: 100 + Number(String(id).replace(/\D/g, "") || 0),
  types: ["restaurant"], businessStatus: "OPERATIONAL", lat: 0, lng: distance,
  primaryType: "restaurant", cuisines: ["Test cuisine"], priceLevel: "PRICE_LEVEL_MODERATE",
  photoRef: `places/${id}/photos/hero`, description: `Editorial ${id}`, ...overrides,
});
const governed = (row) => Number(row.rating) * 20 + Math.min(Number(row.reviews) || 0, 500) / 100;
const sameName = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const distanceOf = (_aLat, _aLng, _bLat, bLng) => Number(bLng);

async function makePool({ groups, creators, anchorPools = {}, readExact, readDetails = async () => null }) {
  const build = await compilePool(
    () => groups,
    () => ({ creators, unattributed: [] }),
    sameName,
    readDetails,
    (raw) => raw,
    governed,
    distanceOf,
    25,
  );
  return build(anchorPools, { lat: 0, lng: 0 }, { serveInventoryByPlaceIds: readExact });
}

// The failure in Orlando: exact, verified IDs exist in owned inventory but do
// not happen to survive a broad anchor pool. All of them must still become
// creator cards, including a valid place between the generic 17mi ring and the
// creator rail's documented 25mi boundary.
const localSpots = [
  spot("near-a", "creator.a", 8),
  spot("near-b", "creator.b", 9),
  spot("near-c", "creator.c", 10),
  spot("far-valid", "creator.d", 24),
  spot("far-invalid", "creator.outside", 26),
  spot("known-rejected", "creator.rejected", 5),
  spot("missing", "creator.missing", 6),
];
const exactCalls = [];
const detailCalls = [];
const localPool = await makePool({
  groups: [{ city: "Testville", distMi: 0, spots: localSpots }],
  creators: localSpots.map((s) => source(s.video.creator, s.key, s.placeId)),
  readExact: async (ids, _lat, _lng, radiusM, options) => {
    exactCalls.push(ids.slice());
    assert.equal(radiusM, 25 * 1609.34, "the exact owned read uses the creator rail's 25mi radius");
    assert.equal(options?.failLoud, true, "an exact owned read failure cannot masquerade as sparse creator coverage");
    assert.equal(options?.withKnownIds, true, "the caller requests authoritative inventory membership alongside eligible places");
    const knownIds = ids.filter((id) => id !== "missing");
    const eligibleIds = knownIds.filter((id) => id !== "known-rejected");
    return { places: eligibleIds.map((id) => {
      const s = localSpots.find((item) => item.placeId === id);
      const index = localSpots.indexOf(s);
      return detail(id, s.distance, { rating: 4.5 + index * 0.05, reviews: 100 + index });
    }), knownIds };
  },
  readDetails: async (id) => {
    detailCalls.push(id);
    const s = localSpots.find((item) => item.placeId === id);
    return s ? detail(id, s.distance) : null;
  },
});
assert.deepEqual(exactCalls, [["near-a", "near-b", "near-c", "far-valid", "far-invalid", "known-rejected", "missing"]], "every missing exact registry ID is requested once");
assert.deepEqual(detailCalls, ["missing"], "cached Place Details is consulted only for an ID truly absent from owned inventory");
assert.deepEqual(localPool.map((row) => row.id).sort(), ["far-valid", "missing", "near-a", "near-b", "near-c"], "owned creator IDs survive anchor-pool starvation while a known rejected row and >25mi control stay out");
assert.ok(localPool.every((row) => row.photoRef && Number.isFinite(row.distMi) && row.rating > 0), "owned creator rows keep real photo, measured location and rating evidence");
const ownedEvidence = localPool.find((row) => row.id === "near-a");
assert.equal(ownedEvidence.primaryType, "restaurant", "exact owned rows preserve primary type evidence");
assert.deepEqual(ownedEvidence.cuisines, ["Test cuisine"], "exact owned rows preserve cuisine evidence");
assert.equal(ownedEvidence.priceLevel, "PRICE_LEVEL_MODERATE", "exact owned rows preserve normalized price evidence");

const slimCreator = (row) => ({
  id: row.id, name: row.name, governed_score: row.governed_score, rating: row.rating, reviews: row.reviews,
  photoRef: row.photoRef, distMi: row.distMi, creatorSources: row._creatorSources,
});
const filled = fillRails({ creators: localPool }, slimCreator, { nearMi: 17, widenMi: 25, cityLabel: "Testville" });
assert.deepEqual(filled.places.locals.map((row) => row.id).sort(), ["far-valid", "missing", "near-a", "near-b", "near-c"], "Creators Pick keeps every eligible row through the creator rail's 25mi boundary");
assert.ok(filled.places.locals.every((row) => Number.isFinite(row.governed_score)), "the real selector stamps every creator card with the governed score it sorts by");
assert.ok(filled.places.locals.every((row, index, rows) => index === 0 || rows[index - 1].governed_score >= row.governed_score), "the complete creator answer remains ordered by displayed governed score");
const composed = composeCreatorPicksRails(filled.places.locals);
assert.deepEqual(composed.map((rail) => rail.handle).sort(), ["creator.a", "creator.b", "creator.c", "creator.d", "creator.missing"], "every eligible verified handle receives a creator rail");
assert.ok(composed.every((rail) => rail.places[0].photoRef && rail.places[0].creatorSources[0].platform === "instagram" && rail.places[0].creatorSources[0].url), "creator cards retain owned photos and explicit handle/platform/url attribution");

// spotsByCity intentionally exposes one primary video. A no-ID registry entry
// that matched an already-ranked venue must recover every verified creator by
// registry key instead of silently crediting only the first video.
const sharedAnchor = { id: "shared-row", name: "Shared Place", city: "Testville", rating: 4.8, reviews: 240, lat: 0, lng: 5, distMi: 5, photoRef: "places/shared/photos/hero" };
const noIdPool = await makePool({
  groups: [{ city: "Testville", distMi: 0, spots: [{ key: "shared-key", name: "Shared Place", city: "Testville", placeId: null,
    video: { creator: "first.creator", platform: "instagram", url: "https://instagram.test/first" } }] }],
  creators: [source("first.creator", "shared-key"), source("second.creator", "shared-key")],
  anchorPools: { restaurants: [sharedAnchor] },
  readExact: async () => { throw new Error("no exact read is expected for a no-ID entry"); },
});
assert.deepEqual(noIdPool[0]._creatorSources.map((item) => item.handle), ["first.creator", "second.creator"], "a matched no-ID registry entry retains every verified creator attached to its key");
assert.equal(sharedAnchor._creatorSources, undefined, "creator provenance is stamped on a clone and never leaks into an anchor pool row");

// serveInventoryByPlaceIds deliberately accepts at most 100 IDs. The caller
// must chunk before that boundary; otherwise the tail silently disappears.
const manySpots = Array.from({ length: 205 }, (_, index) => spot(`bulk-${index}`, `bulk.creator.${index}`, 8 + (index % 8)));
const chunkCalls = [];
const bulkPool = await makePool({
  groups: [{ city: "Testville", distMi: 0, spots: manySpots }],
  creators: manySpots.map((s) => source(s.video.creator, s.key, s.placeId)),
  readExact: async (ids) => {
    chunkCalls.push(ids.slice());
    return {
      places: ids.map((id) => detail(id, manySpots.find((item) => item.placeId === id).distance)),
      knownIds: ids.slice(),
    };
  },
});
assert.deepEqual(chunkCalls.map((ids) => ids.length), [100, 100, 5], "exact creator IDs are chunked at the reader's 100-ID boundary");
assert.equal(bulkPool.length, 205, "chunking never silently drops the exact-ID tail");
assert.equal(new Set(bulkPool.flatMap((row) => row._creatorSources.map((item) => item.handle))).size, 205, "every chunk retains its verified source attribution");

await assert.rejects(
  makePool({
    groups: [{ city: "Testville", distMi: 0, spots: [spot("read-fails", "failure.creator", 4)] }],
    creators: [source("failure.creator", "key-read-fails", "read-fails")],
    readExact: async () => { throw new Error("owned inventory unavailable"); },
  }),
  /owned inventory unavailable/,
  "an exact owned-inventory failure propagates instead of shipping a plausible four-card partial answer",
);

console.log("creator picks rails: composition, exact inventory, attribution, radius, chunking and failure assertions passed");
