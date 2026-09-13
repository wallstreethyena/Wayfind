import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATTRACTION_DISCOVERY_IDS,
  attractionDiscoveryPlaceIds,
  attractionDiscoveryEligible,
  loadAttractionDiscovery,
  mergeAttractionDiscovery,
} from "../lib/attractionDiscovery.js";

assert.equal(ATTRACTION_DISCOVERY_IDS.length, 6);
assert.equal(new Set(ATTRACTION_DISCOVERY_IDS).size, 6, "canonical IDs are unique");
assert.deepEqual(attractionDiscoveryPlaceIds("family", "all"), ATTRACTION_DISCOVERY_IDS);
assert.deepEqual(attractionDiscoveryPlaceIds("attractions", "family"), ATTRACTION_DISCOVERY_IDS);
assert.deepEqual(attractionDiscoveryPlaceIds("food", "all"), [], "unrelated categories get no supplement");
assert.deepEqual(attractionDiscoveryPlaceIds("family", "unknown"), [], "unknown chips get no supplement");

const ORIGIN = { lat: 28.48, lng: -81.47 };
const place = (id, name, rating, reviews, extra = {}) => ({
  id, displayName: { text: name }, location: { latitude: 28.479, longitude: -81.468 },
  rating, userRatingCount: reviews, primaryType: "amusement_park",
  types: ["amusement_park", "theme_park", "tourist_attraction"], ...extra,
});
const studios = place(ATTRACTION_DISCOVERY_IDS[1], "Universal Studios Florida", 4.7, 162083);
assert.equal(attractionDiscoveryEligible(studios, { cat: "family", sub: "kids", ...ORIGIN, radiusM: 17000 }), true);
assert.equal(attractionDiscoveryEligible(studios, { cat: "attractions", sub: "all", ...ORIGIN, radiusM: 17000 }), true);
assert.equal(attractionDiscoveryEligible(studios, { cat: "attractions", sub: "museums", ...ORIGIN, radiusM: 17000 }), false,
  "a theme park cannot enter an unrelated chip");
assert.equal(attractionDiscoveryEligible(place(ATTRACTION_DISCOVERY_IDS[0], "Universal Night Club", 4.7, 10000, {
  primaryType: "night_club", types: ["night_club", "tourist_attraction"],
}), { cat: "family", sub: "all", ...ORIGIN, radiusM: 17000 }), false,
  "the virtual Family gate still vetoes adult nightlife identity");
assert.equal(attractionDiscoveryEligible(studios, { cat: "family", sub: "kids", lat: 27, lng: -82, radiusM: 17000 }), false,
  "the exact requested radius, not the inventory reader's 15% buffer, is final");
assert.equal(attractionDiscoveryEligible(place("not-canonical", "Universal Studios Florida", 4.7, 162083), { cat: "family", sub: "kids", ...ORIGIN, radiusM: 17000 }), false,
  "a matching name cannot mint a canonical identity");
assert.equal(attractionDiscoveryEligible({ ...studios, location: null }, { cat: "family", sub: "kids", ...ORIGIN, radiusM: 17000 }), false,
  "missing coordinates do not coerce to zero");
assert.equal(attractionDiscoveryEligible({ ...studios, location: { latitude: null, longitude: null } }, { cat: "family", sub: "kids", ...ORIGIN, radiusM: 17000 }), false,
  "null coordinates do not coerce to zero");
assert.equal(attractionDiscoveryEligible(place(ATTRACTION_DISCOVERY_IDS[0], "Universal Resort Hotel", 4.7, 10000, {
  primaryType: "hotel", types: ["hotel", "lodging", "amusement_park"],
}), { cat: "attractions", sub: "all", ...ORIGIN, radiusM: 17000 }), false,
  "a canonical ID cannot override a renamed hotel's primary identity");

const canonicalFixtures = [
  place(ATTRACTION_DISCOVERY_IDS[0], "Universal Orlando Resort", 4.7, 191748),
  studios,
  place(ATTRACTION_DISCOVERY_IDS[2], "Universal's Islands of Adventure", 4.7, 108563),
  place(ATTRACTION_DISCOVERY_IDS[3], "Universal Epic Universe", 3.9, 9340),
  place(ATTRACTION_DISCOVERY_IDS[4], "Kennedy Space Center Visitor Complex", 4.7, 47848, {
    primaryType: "visitor_center", types: ["visitor_center", "historical_landmark", "amusement_park", "tourist_attraction"],
  }),
  place(ATTRACTION_DISCOVERY_IDS[5], "The Florida Aquarium", 4.5, 21970, {
    primaryType: "aquarium", types: ["aquarium", "tourist_attraction"],
  }),
];
for (const fixture of canonicalFixtures) {
  const here = fixture.location;
  for (const cat of ["family", "attractions"]) {
    assert.equal(attractionDiscoveryEligible(fixture, {
      cat, sub: "all", lat: here.latitude, lng: here.longitude, radiusM: 1000,
    }), true, `${fixture.displayName.text} qualifies for ${cat}:all on its real identity and score`);
  }
}
assert.equal(attractionDiscoveryEligible(canonicalFixtures[4], {
  cat: "attractions", sub: "museums", lat: 28.479, lng: -81.468, radiusM: 1000,
}), true, "Kennedy follows the shared Museums contract for its historical-landmark identity");

const epic = place(ATTRACTION_DISCOVERY_IDS[3], "Universal Epic Universe", 3.9, 9340);
const ordinary = place("ordinary", "Strong Local Attraction", 4.8, 5000);
const merged = mergeAttractionDiscovery([ordinary, studios], [studios, epic], { cat: "attractions", sub: "all", ...ORIGIN, radiusM: 17000 });
assert.deepEqual(merged.map((p) => p.id), [ordinary.id, studios.id, epic.id],
  "combined candidates dedupe and rank by real score, never registry position");
assert.equal(merged.length, 3, "the merged result is not sliced back to the broad-pool cap");
const baseOutsideSupplementGate = mergeAttractionDiscovery([studios], [studios], {
  cat: "family", sub: "kids", lat: 27, lng: -82, radiusM: 1000,
});
assert.deepEqual(baseOutsideSupplementGate.map((p) => p.id), [studios.id],
  "a canonical row already admitted by the broad reader keeps its native membership");
assert.deepEqual(mergeAttractionDiscovery([], [studios], {
  cat: "family", sub: "kids", lat: 27, lng: -82, radiusM: 1000,
}), [], "the same row entering only as a supplement must pass the exact-radius gate");

const calls = [];
const untouched = [{ id: "food-base" }];
const unrelated = await loadAttractionDiscovery({ cat: "food", sub: "all", ...ORIGIN, radiusM: 32000, n: 40 }, {
  readCategory: async (request) => { calls.push(["broad", request.radiusM]); return untouched; },
  readIds: async () => { calls.push(["exact"]); return []; },
});
assert.equal(unrelated, untouched, "an unrelated request returns the original inventory result untouched");
assert.deepEqual(calls, [["broad", 32000]], "an unrelated request performs no exact-ID read");
calls.length = 0;
await loadAttractionDiscovery({ cat: "attractions", sub: "all", ...ORIGIN, radiusM: 72420, n: 400 }, {
  readCategory: async (request) => { calls.push(["broad", request.radiusM]); return []; },
  readIds: async (ids, request) => { calls.push(["exact", request.radiusM, ids.length]); return []; },
});
assert.deepEqual(calls, [["broad", 72420], ["exact", 72420, 6]],
  "supported browse resolves broad and exact owned inventory at the same requested radius");

const source = readFileSync(new URL("../lib/attractionDiscovery.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /placePartnerPicks|venueOffers|partnerOffer|klook/i,
  "organic discovery has no affiliate-provider dependency");
const route = readFileSync(new URL("../app/api/places/search/route.js", import.meta.url), "utf8");
assert.match(route, /if \(!discoveryIds\.length\)/);
assert.match(route, /loadAttractionDiscovery\(discoveryRequest/);
assert.match(route, /serveFromInventory\(String\(request\.cat \|\| ""\), lat, lng, request\.radiusM/);
assert.match(route, /serveInventoryByPlaceIds\(ids, lat, lng, request\.radiusM\)/);
assert.match(route, /places: merged/);

// Execute the production route body with hermetic readers. This proves the
// branch and radius arguments themselves; no database or paid provider can be
// reached from this source-module harness.
async function sourceModule(source, prelude) {
  const body = source.replace(/^import[^;]+;\n/gm, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + body));
}
const routeModule = await sourceModule(route, `
  export const routeCalls = [];
  const DAY = 86400000;
  const NextResponse = { json(value, init = {}) { return new Response(JSON.stringify(value), { status: init.status || 200, headers: init.headers }); } };
  const attractionDiscoveryPlaceIds = (cat, sub) => ["family", "attractions"].includes(String(cat)) && ["all", "kids"].includes(String(sub || "all")) ? ${JSON.stringify(ATTRACTION_DISCOVERY_IDS)} : [];
  const serveFromInventory = async (cat, lat, lng, radius) => { routeCalls.push(["broad", cat, radius]); return [{ id: cat + "-base" }]; };
  const serveInventoryByPlaceIds = async (ids, lat, lng, radius) => { routeCalls.push(["exact", ids.length, radius]); return [{ id: "exact" }]; };
  const loadAttractionDiscovery = async (request, readers) => { const [base, exact] = await Promise.all([readers.readCategory(request), readers.readIds(${JSON.stringify(ATTRACTION_DISCOVERY_IDS)}, request)]); return base.concat(exact); };
`);
process.env.GOOGLE_MAPS_SERVER_KEY = "test-placeholder-not-a-key";
try {
  let response = await routeModule.GET(new Request("https://example.test/api/places/search?q=inventory&lat=28.48&lng=-81.47&radius=72420&n=400&cat=food&sub=all&inv=1"));
  assert.deepEqual((await response.json()).places, [{ id: "food-base" }]);
  assert.deepEqual(routeModule.routeCalls, [["broad", "food", 50000]],
    "actual unrelated route performs only its unchanged snapped-radius broad read");
  routeModule.routeCalls.length = 0;
  response = await routeModule.GET(new Request("https://example.test/api/places/search?q=inventory&lat=28.48&lng=-81.47&radius=72420&n=400&cat=attractions&sub=all&inv=1"));
  assert.deepEqual((await response.json()).places, [{ id: "attractions-base" }, { id: "exact" }]);
  assert.deepEqual(routeModule.routeCalls, [["broad", "attractions", 72420], ["exact", 6, 72420]],
    "actual supported route gives both owned readers the same requested radius");
} finally {
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
}

console.log("test-attraction-discovery: OK");
