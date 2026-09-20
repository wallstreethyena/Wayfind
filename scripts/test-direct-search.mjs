import assert from "node:assert/strict";
import {
  DIRECT_SEARCH_MAX_AGE_MS,
  exactNameMatch,
  normalizeSearchText,
  searchOwnedPlaces,
  splitCityQualifier,
} from "../lib/directSearch.js";
import { GET as searchRoute } from "../app/api/search/route.js";

const ENV = { SUPABASE_URL: "https://owned.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-test-key" };
const NOW = Date.parse("2026-09-19T12:00:00.000Z");
const ORLANDO = { lat: 28.5384, lng: -81.3789 };
const ADDRESS_INDEX = [
  { placeId: "ChIJdolce", name: "Dolce & Bake", address: "8143 S John Young Pkwy, Orlando, FL", city: "Orlando", category: "Food" },
  { placeId: "ChIJdolceMiami", name: "Dolce & Bake", address: "1 Biscayne Blvd, Miami, FL", city: "Miami", category: "Food" },
];

function row(overrides = {}) {
  return {
    place_id: "ChIJdolce",
    name: "Dolce & Bake",
    lat: ORLANDO.lat,
    lng: ORLANDO.lng,
    category: "food",
    primary_type: "cafe",
    google_types: ["cafe", "bakery"],
    cuisines: [],
    status: "OPERATIONAL",
    excluded: false,
    signals: { rating: 4.7, reviews: 321 },
    refreshed_at: new Date(NOW - DIRECT_SEARCH_MAX_AGE_MS + 1000).toISOString(),
    ...overrides,
  };
}

function fetchRows(rows, capture = {}) {
  return async (url, init) => {
    (capture.calls ||= []).push({ url, init });
    return { ok: true, json: async () => url.pathname.endsWith("/wf_inventory") ? rows : [] };
  };
}

assert.equal(normalizeSearchText("  Dolce & Bake — Café  "), "dolce and bake cafe");
assert(exactNameMatch("Ryan's Coffee House", "Ryan’s Coffee House"), "apostrophe variants are the same exact name");
assert.deepEqual(splitCityQualifier("Dolce & Bake, Orlando, FL").city, { name: "Orlando", state: "FL", ...ORLANDO });
assert.equal(splitCityQualifier("Dolce & Bake, Orlando, FL").text, "dolce and bake");

{
  const capture = {};
  const result = await searchOwnedPlaces({
    query: "Dolce and Bake, Orlando FL",
    lat: 25.7617,
    lng: -80.1918,
    env: ENV,
    nowMs: NOW,
    addressIndex: ADDRESS_INDEX,
    fetchImpl: fetchRows([row()], capture),
  });
  assert.equal(result.status, "ok");
  assert.equal(result.places.length, 1, "explicit Orlando qualifier excludes same-name Miami location");
  assert.equal(result.places[0].formattedAddress, ADDRESS_INDEX[0].address);
  assert.equal(result.places[0].exactMatch, true);
  assert.equal(result.places[0].matchKind, "exact-name");
  assert.equal(result.places[0].distanceMeters, 0, "candidate distance is measured from the explicit search area center");
  assert.equal(result.coverage.city, "Orlando, FL");
  assert.equal(result.coverage.radiusMeters, 30000, "a city qualifier uses the tighter locality scope");
  assert.equal(capture.calls.length, 2, "fresh inventory and fresh permanent index are read in parallel");
  const invCall = capture.calls.find((call) => call.url.pathname.endsWith("/wf_inventory"));
  const idxCall = capture.calls.find((call) => call.url.pathname.endsWith("/wf_place_ids"));
  assert.match(invCall.url.searchParams.get("refreshed_at"), /^gte\.2026-08-20T12:00:00\.000Z$/);
  assert.match(idxCall.url.searchParams.get("seen_at"), /^gte\.2026-08-20T12:00:00\.000Z$/);
  assert.match(invCall.url.searchParams.get("or"), /place_id\.in\.\(ChIJdolce\)/);
  assert.equal(invCall.init.cache, "no-store");
}

{
  const result = await searchOwnedPlaces({
    query: "8143 S. John Young Pkwy, Orlando, FL",
    env: ENV,
    nowMs: NOW,
    addressIndex: ADDRESS_INDEX,
    fetchImpl: fetchRows([row()]),
  });
  assert.equal(result.status, "ok");
  assert.equal(result.places[0].matchKind, "exact-address");
  assert.equal(result.places[0].exactMatch, true, "the full stored street line remains exact when its city qualifier scopes the search");
}

{
  const result = await searchOwnedPlaces({
    query: "Shake Station",
    ...ORLANDO,
    env: ENV,
    nowMs: NOW,
    addressIndex: [],
    fetchImpl: async (url) => ({
      ok: true,
      json: async () => url.pathname.endsWith("/wf_place_ids") ? [{
        place_id: "ChIJshake", name: "Shake Station", lat: ORLANDO.lat, lng: ORLANDO.lng,
        category: "Food", signals: { rating: 4.7, reviews: 4000 }, seen_at: "2026-09-16T12:00:00.000Z",
      }] : [],
    }),
  });
  assert.equal(result.status, "ok", "a fresh index identity fills an inventory row older than 30 days");
  assert.equal(result.places[0].exactMatch, true);
  assert.deepEqual(result.places[0].types, ["food"]);
}

{
  const result = await searchOwnedPlaces({
    query: "Shake Station", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [],
    fetchImpl: async (url) => {
      if (url.pathname.endsWith("/wf_place_ids")) return {
        ok: true, json: async () => [{ place_id: "ChIJclosed", name: "Shake Station", ...ORLANDO, category: "Food", signals: {}, seen_at: "2026-09-16T12:00:00.000Z" }]
      };
      if (url.searchParams.has("refreshed_at")) return { ok: true, json: async () => [] };
      return { ok: true, json: async () => [{ place_id: "ChIJclosed", status: "CLOSED_PERMANENTLY", excluded: false }] };
    },
  });
  assert.equal(result.status, "empty", "fresh index identity cannot resurrect an inventory-suppressed place");
}

{
  const farOrlando = row({ place_id: "ChIJfar", name: "Shake Station", lat: 28.898, lng: -81.3789 });
  const result = await searchOwnedPlaces({ query: "Shake Station, Orlando FL", env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows([farOrlando]) });
  assert.equal(result.status, "empty", "an exact chain name outside the qualified city's 30km scope is not auto-openable");
}

{
  const many = Array.from({ length: 101 }, (_, i) => ({
    place_id: `ChIJchain${i}`, name: "Keke's Breakfast Cafe", lat: ORLANDO.lat + i / 100000, lng: ORLANDO.lng,
    category: "Food", signals: {}, seen_at: "2026-09-16T12:00:00.000Z",
  }));
  const result = await searchOwnedPlaces({
    query: "Keke's Breakfast Cafe", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [],
    fetchImpl: async (url) => ({ ok: true, json: async () => url.pathname.endsWith("/wf_place_ids") ? many : [] }),
  });
  assert.equal(result.ambiguity, "source_truncated");
  assert(result.places.every((place) => place.exactMatch === false), "truncated source cannot declare any exact result uniquely safe");
}

{
  const unrelated = Array.from({ length: 101 }, (_, i) => ({
    place_id: `ChIJunrelated${i}`, name: `Different Place ${i}`, lat: ORLANDO.lat, lng: ORLANDO.lng,
    category: "Food", signals: {}, seen_at: "2026-09-16T12:00:00.000Z",
  }));
  const result = await searchOwnedPlaces({
    query: "Missing Cafe", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [],
    fetchImpl: async (url) => ({ ok: true, json: async () => url.pathname.endsWith("/wf_place_ids") ? unrelated : [] }),
  });
  assert.equal(result.status, "unavailable", "a truncated no-match cannot claim the library is empty");
  assert.equal(result.reason, "source_truncated");
}

{
  const blankNameAddress = [{ placeId: "ChIJblank", name: "", address: "1 Elsewhere Ave", city: null }];
  const result = await searchOwnedPlaces({
    query: "Cafe", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: blankNameAddress,
    fetchImpl: fetchRows([row({ place_id: "ChIJblank", name: "Totally Different" })]),
  });
  assert.equal(result.status, "empty", "an empty stored name cannot become a prefix match for arbitrary text");
}

{
  const stale = row({ refreshed_at: "2026-08-19T11:59:59.000Z" });
  const result = await searchOwnedPlaces({ query: "Dolce & Bake", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: ADDRESS_INDEX, fetchImpl: fetchRows([stale]) });
  assert.equal(result.status, "empty", "a stale row is rejected even when a mocked reader ignores the database freshness filter");
}

{
  const result = await searchOwnedPlaces({ query: "Unknown Cafe", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows([]) });
  assert.equal(result.status, "empty");
  assert.equal(result.reason, "not_in_library");
  assert.equal(result.coverage.available, undefined, "covered no-match is distinct from source unavailability");
}

{
  const noLocation = await searchOwnedPlaces({ query: "Unknown Cafe", env: ENV, nowMs: NOW, addressIndex: [] });
  assert.equal(noLocation.status, "unavailable");
  assert.equal(noLocation.reason, "unsupported_location");
  const nullLocation = await searchOwnedPlaces({ query: "Unknown Cafe", lat: null, lng: null, env: ENV, nowMs: NOW, addressIndex: [] });
  assert.equal(nullLocation.reason, "unsupported_location", "null coordinates are absence, not zero degrees");
  for (const query of ["Gastonia", "Pensacola", "Pensacola, FL", "400 W Garden St, Pensacola, FL"]) {
    const explicitUnsupported = await searchOwnedPlaces({ query, ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows([]) });
    assert.equal(explicitUnsupported.reason, "unsupported_location", `${query} does not silently become an Orlando search`);
  }
  const outside = await searchOwnedPlaces({ query: "Unknown Cafe", lat: 40.7128, lng: -74.006, env: ENV, nowMs: NOW, addressIndex: [] });
  assert.equal(outside.reason, "unsupported_location");
}

{
  const missingConfig = await searchOwnedPlaces({ query: "Unknown Cafe", ...ORLANDO, env: {}, nowMs: NOW, addressIndex: [] });
  assert.equal(missingConfig.reason, "not_configured");
  const failedRead = await searchOwnedPlaces({ query: "Unknown Cafe", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: async () => ({ ok: false }) });
  assert.equal(failedRead.reason, "source_unavailable");
  const partialEmpty = await searchOwnedPlaces({
    query: "Unknown Cafe", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [],
    fetchImpl: async (url) => url.pathname.endsWith("/wf_inventory") ? ({ ok: true, json: async () => [] }) : ({ ok: false }),
  });
  assert.equal(partialEmpty.status, "unavailable", "a partial read cannot be reported as a complete empty library");
}

{
  const routeResult = await searchRoute(new Request("https://www.gowayfind.com/api/search?q=Gastonia&lat=28.54&lng=-81.38"));
  assert.equal(routeResult.status, 200);
  assert.match(routeResult.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await routeResult.json(), {
    status: "unavailable", places: [], source: "owned-inventory", query: "Gastonia", reason: "unsupported_location",
  });
}

console.log("test-direct-search: OK — punctuation, city intent, stored addresses, 30-day freshness, empty, scope and failures");
