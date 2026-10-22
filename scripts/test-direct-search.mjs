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
  // #1684: "Cafe" may still find this row as a CATEGORY match (its owned type
  // is cafe) — but never as a name/exact match spoofed by the blank stored name.
  assert(result.places.every((p) => p.matchKind === "category" && p.exactMatch === false), "an empty stored name cannot become a prefix or exact match for arbitrary text");
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
  for (const query of ["Gastonia", "Gastonia, NC", "400 W Main Ave, Gastonia, NC"]) {
    const explicitUnsupported = await searchOwnedPlaces({ query, ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows([]) });
    assert.equal(explicitUnsupported.reason, "unsupported_location", `${query} does not silently become an Orlando search`);
  }
  // Pensacola became a covered market (lib/landingCities.js MARKET_CITIES,
  // 2026-10-01). Same invariant, now satisfied the other way: an explicit
  // Pensacola query searches PENSACOLA, never the device's Orlando.
  for (const query of ["Pensacola", "Pensacola, FL"]) {
    const bare = await searchOwnedPlaces({ query, ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows([]) });
    assert.equal(bare.reason, "place-query-required", `${query} is a covered city, not a venue near Orlando`);
  }
  {
    // A business whose own name ends in a covered city keeps exact status:
    // "Hotel St. Pete" is searched as "hotel" within St. Pete, but the full
    // query still equals the name. A sibling hotel is a match, never exact.
    const STP = { lat: 27.7676, lng: -82.6403 };
    const rows = [
      row({ place_id: "ChIJhotelstpete", name: "Hotel St. Pete", lat: STP.lat, lng: STP.lng, primary_type: "hotel", google_types: ["hotel", "lodging"] }),
      row({ place_id: "ChIJhotelother", name: "Hotel Zamora", lat: STP.lat + 0.01, lng: STP.lng, primary_type: "hotel", google_types: ["hotel", "lodging"] }),
    ];
    const result = await searchOwnedPlaces({ query: "Hotel St. Pete", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows(rows) });
    const exact = result.places.filter((place) => place.exactMatch === true).map((place) => place.id);
    assert.deepEqual(exact, ["ChIJhotelstpete"], "the exact business named with a city suffix stays the one exact result");
    assert(result.places.some((place) => place.id === "ChIJhotelother"), "the sibling hotel is still a (non-exact) result");
  }
  {
    // Bare covered-city query: still a city (place-query-required when no
    // venue carries the words), but a venue named with the city's words near
    // that city is still offered — the owner's "Saint Pete Salt Room".
    const STP = { lat: 27.7676, lng: -82.6403 };
    const salt = [row({ place_id: "ChIJsaltroom", name: "Saint Pete Salt Room", lat: STP.lat + 0.02, lng: STP.lng, primary_type: "spa", google_types: ["spa"] })];
    const bare = await searchOwnedPlaces({ query: "saint pete", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows(salt) });
    assert.equal(bare.status, "ok", "a bare city query still finds the venue carrying the city's words near that city");
    assert.deepEqual(bare.places.map((p) => p.id), ["ChIJsaltroom"]);
    const stateForm = await searchOwnedPlaces({ query: "Saint Pete, FL", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows(salt) });
    assert.equal(stateForm.status, "ok", "the state suffix is not part of the venue-name search");
    // City-qualified search: places nearest the named city lead; a Tampa
    // name-prefix match drops below a St. Pete match. Unqualified control keeps
    // the old order.
    const TPA = { lat: 27.9506, lng: -82.4572 };
    const pizzas = [
      row({ place_id: "ChIJpizzakitchen", name: "Pizza Kitchen", lat: TPA.lat, lng: TPA.lng, primary_type: "pizza_restaurant", google_types: ["pizza_restaurant"] }),
      row({ place_id: "ChIJtonyspizza", name: "Tony's Pizza", lat: STP.lat + 0.004, lng: STP.lng, primary_type: "pizza_restaurant", google_types: ["pizza_restaurant"] }),
    ];
    const qualified = await searchOwnedPlaces({ query: "pizza st pete", ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows(pizzas) });
    assert.deepEqual(qualified.places.map((p) => p.id), ["ChIJtonyspizza", "ChIJpizzakitchen"], "St. Pete's pizza leads; Tampa's stays listed below");
    const control = await searchOwnedPlaces({ query: "pizza", lat: STP.lat, lng: STP.lng, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows(pizzas) });
    // #1684 changed this control: for a category word the NEARER match leads
    // (a 34 mi name-prefix once outranked a 9 mi "sushi"). Exact identity and
    // the explicit-city tier still lead; match rank only breaks near-ties.
    assert.equal(control.places[0].id, "ChIJtonyspizza", "control (#1684): without a city qualifier the nearer match leads");
  }
  for (const [query, cityLat] of [["400 W Garden St, Pensacola, FL", 30.4213], ["pizza st pete", 27.7676], ["tacos jax", 30.3322], ["pizza orlando", ORLANDO.lat]]) {
    const seen = [];
    await searchOwnedPlaces({ query, ...ORLANDO, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: async (url, init) => { seen.push(String(url)); return fetchRows([])(url, init); } });
    assert(seen.length > 0, `${query} reaches the owned library`);
    for (const u of seen) {
      const lo = Number(u.match(/lat=gte\.(-?[\d.]+)/)?.[1]), hi = Number(u.match(/lat=lte\.(-?[\d.]+)/)?.[1]);
      assert(Number.isFinite(lo) && Number.isFinite(hi), `${query}: the probe found the lat box (positive control)`);
      assert(Math.abs((lo + hi) / 2 - cityLat) < 0.01, `${query} searches a box centred on its own city (${cityLat}), got ${lo}..${hi}`);
    }
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

{
  // #1684 — accented stored names must survive the database prefilter. The JS
  // matcher folds accents; the generated query must also try the accented
  // spelling and a short stem, or "The Dalí Museum" is never fetched.
  const STP = { lat: 27.7676, lng: -82.6403 };
  const museum = row({ place_id: "ChIJdali", name: "The Dalí Museum", lat: STP.lat, lng: STP.lng, primary_type: "museum", google_types: ["museum"] });
  const capture = {};
  const accented = await searchOwnedPlaces({ query: "Dalí", ...STP, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows([museum], capture) });
  assert.equal(accented.status, "ok");
  assert.equal(accented.places[0].id, "ChIJdali", "accented query finds the accented museum");
  const invOr = capture.calls.find((c) => c.url.pathname.endsWith("/wf_inventory")).url.searchParams.get("or");
  assert(invOr.includes("dalí") || invOr.includes("dal%C3%AD") || /dal/i.test(decodeURIComponent(invOr)), "prefilter carries an accent-capable clause");
  const plain = await searchOwnedPlaces({ query: "Dali", ...STP, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows([museum]) });
  assert.equal(plain.places[0].id, "ChIJdali", "unaccented query still matches the accented name in JS matching");
}

{
  // #1684 — category words match owned type data, nearest first. "Masa"
  // carries sushi only in cuisines/types; the far name-prefix must not lead.
  const TPA = { lat: 27.9506, lng: -82.4572 };
  const rows = [
    row({ place_id: "ChIJfarSushi", name: "Sushi Ramen Anna Maria", lat: 28.35, lng: -82.75, primary_type: "sushi_restaurant", google_types: ["sushi_restaurant"], cuisines: ["sushi"] }),
    row({ place_id: "ChIJmasa", name: "Masa", lat: TPA.lat + 0.05, lng: TPA.lng, primary_type: "sushi_restaurant", google_types: ["sushi_restaurant", "japanese_restaurant"], cuisines: ["japanese", "sushi"] }),
    row({ place_id: "ChIJkanji", name: "Kanji Sushi & Ramen", lat: TPA.lat + 0.12, lng: TPA.lng, primary_type: "sushi_restaurant", google_types: ["sushi_restaurant"], cuisines: ["japanese", "sushi"] }),
  ];
  const result = await searchOwnedPlaces({ query: "sushi", ...TPA, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows(rows) });
  assert.equal(result.status, "ok");
  assert.equal(result.places[0].id, "ChIJmasa", "nearest sushi (category identity) leads, not the 30+ mi name-prefix");
  assert.equal(result.places[0].matchKind, "category", "name-free sushi place is a category match, never exact");
  assert(result.places.some((p) => p.id === "ChIJkanji"), "name-carrying sushi place still listed");
  // A dish phrase with no owned signal stays honestly empty.
  const dish = await searchOwnedPlaces({ query: "key lime pie", lat: 25.7617, lng: -80.1918, env: ENV, nowMs: NOW, addressIndex: [], fetchImpl: fetchRows([row({ place_id: "ChIJbakery", name: "Rosetta Bakery", primary_type: "bakery", google_types: ["bakery"], cuisines: ["pizza"] })]) });
  assert.equal(dish.status, "empty", "key lime pie with no owned dish signal is an honest empty, never invented");
}

console.log("test-direct-search: OK — punctuation, city intent, stored addresses, 30-day freshness, empty, scope and failures");
