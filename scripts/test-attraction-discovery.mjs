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
// 2026-09-23 fix round, item 2 — the discovery branch must read WITH offset
// and withMeta (it used to ignore offset entirely and always answer
// hasMore:false), and must merge the exact-ID top-up ONLY on the first page.
// Counted, not just matched once — BOTH inv=1 branches (the unrelated-
// category path and the discovery path's own broad read) must carry this,
// so a fix that only lands on one branch cannot hide behind the other's
// still-matching occurrence.
assert.equal((route.match(/offset: invOffset, withMeta: true, failLoud: true/g) || []).length, 2,
  "both inv=1 branches' broad reads must ask for {offset, withMeta, failLoud} — one of them no longer does, so it cannot know the true eligible count, report hasMore past the first page, or fail loud on error");
assert.match(route, /invOffset === 0 \? serveInventoryByPlaceIds\(ids, lat, lng, request\.radiusM\) : Promise\.resolve\(\[\]\)/,
  "the exact-ID top-up is not gated on invOffset === 0 — merging it again on later pages would re-sort an already-paged slice by a different score formula");
assert.match(route, /const extraCandidates = Math\.max\(0, merged\.length - meta\.served\)/,
  "total no longer accounts for exact-ID candidates the merge added beyond what the broad read itself served");
assert.match(route, /hasMore: meta\.offset \+ meta\.served < meta\.eligible/,
  "hasMore in the discovery branch is not derived from meta.offset + meta.served < meta.eligible");
// 2026-09-23 fix round, item 5 — fail loud, no-store on failure/truncation.
assert.match(route, /const NO_STORE_HEADERS = \{ "Cache-Control": "no-store" \}/,
  "NO_STORE_HEADERS is missing — a failed or truncated inv=1 answer would still be cached under EDGE_HEADERS's s-maxage=86400");
assert.match(route, /status: 503, headers: NO_STORE_HEADERS/,
  "a failed inv=1 read (failLoud) no longer answers 503 + no-store");

// Execute the production route body with hermetic readers. This proves the
// branch and radius arguments themselves; no database or paid provider can be
// reached from this source-module harness.
async function sourceModule(source, prelude) {
  const body = source.replace(/^import[^;]+;\n/gm, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + body));
}
// eligible deliberately exceeds served so hasMore can read true on an early
// page and false once offset+served reaches it — the exact shape item 2's
// bug (eligible up to ~920, always reporting hasMore:false) is about.
const preludeFor = (failBroad) => `
  export const routeCalls = [];
  const DAY = 86400000;
  const NextResponse = { json(value, init = {}) { return new Response(JSON.stringify(value), { status: init.status || 200, headers: init.headers }); } };
  const attractionDiscoveryPlaceIds = (cat, sub) => ["family", "attractions"].includes(String(cat)) && ["all", "kids"].includes(String(sub || "all")) ? ${JSON.stringify(ATTRACTION_DISCOVERY_IDS)} : [];
  // Mirrors the REAL serveFromInventory's failLoud contract exactly: with
  // failLoud it THROWS on a failed read; without it, it fails SOFT (an empty,
  // 200-shaped answer). A stub that throws unconditionally on failBroad would
  // "pass" a test of item 5 even with failLoud never wired up at all — the
  // route would just never see the throw in the first place from a caller
  // that never asked for it. Only discriminating on options.failLoud proves
  // the route ACTUALLY passes it, not merely that its try/catch exists.
  const serveFromInventory = async (cat, lat, lng, radius, n, sub, options) => {
    routeCalls.push(["broad", cat, radius, (options && options.offset) || 0]);
    if (${failBroad ? "true" : "false"}) {
      if (options && options.failLoud) throw new Error("synthetic broad-read failure");
      return (options && options.withMeta)
        ? { places: [], meta: { eligible: 0, served: 0, offset: (options && options.offset) || 0, truncated: false } }
        : [];
    }
    const places = [{ id: cat + "-base-" + ((options && options.offset) || 0) }];
    if (options && options.withMeta) {
      const offset = (options && options.offset) || 0;
      return { places, meta: { eligible: 4, served: places.length, offset, truncated: false } };
    }
    return places;
  };
  const serveInventoryByPlaceIds = async (ids, lat, lng, radius) => { routeCalls.push(["exact", ids.length, radius]); return [{ id: "exact" }]; };
  const loadAttractionDiscovery = async (request, readers) => {
    const ids = ${JSON.stringify(ATTRACTION_DISCOVERY_IDS)};
    const broad = readers.readCategory(request);
    const [base, exact] = await Promise.all([broad, readers.readIds(ids, request)]);
    const seen = new Set(base.map((p) => p.id));
    return base.concat(exact.filter((p) => !seen.has(p.id)));
  };
`;
process.env.GOOGLE_MAPS_SERVER_KEY = "test-placeholder-not-a-key";
try {
  const routeModule = await sourceModule(route, preludeFor(false));
  let response = await routeModule.GET(new Request("https://example.test/api/places/search?q=inventory&lat=28.48&lng=-81.47&radius=72420&n=400&cat=food&sub=all&inv=1"));
  assert.deepEqual((await response.json()).places, [{ id: "food-base-0" }]);
  assert.deepEqual(routeModule.routeCalls, [["broad", "food", 50000, 0]],
    "actual unrelated route performs only its unchanged snapped-radius broad read");

  // ── item 2: first page (offset 0) merges the exact-ID top-up ──
  routeModule.routeCalls.length = 0;
  response = await routeModule.GET(new Request("https://example.test/api/places/search?q=inventory&lat=28.48&lng=-81.47&radius=72420&n=400&cat=attractions&sub=all&inv=1"));
  let body = await response.json();
  assert.deepEqual(body.places, [{ id: "attractions-base-0" }, { id: "exact" }]);
  assert.deepEqual(routeModule.routeCalls, [["broad", "attractions", 72420, 0], ["exact", 6, 72420]],
    "the FIRST page still gives both owned readers the same requested radius");
  assert.equal(body.total, 5, "total = meta.eligible(4) + the one exact candidate the merge added beyond what the broad read served (1) = 5");
  assert.equal(body.hasMore, true, "meta.offset(0) + meta.served(1) < meta.eligible(4) -> hasMore true on the first page");

  // ── item 2: a LATER page (offset > 0) must carry the offset through to the
  // broad read and must NOT re-run the exact-ID merge ──
  routeModule.routeCalls.length = 0;
  response = await routeModule.GET(new Request("https://example.test/api/places/search?q=inventory&lat=28.48&lng=-81.47&radius=72420&n=400&cat=attractions&sub=all&inv=1&offset=3"));
  body = await response.json();
  assert.deepEqual(body.places, [{ id: "attractions-base-3" }],
    "a later page's response is JUST the broad read's own page — no repeated exact-ID top-up");
  assert.deepEqual(routeModule.routeCalls, [["broad", "attractions", 72420, 3]],
    "a later page never calls serveInventoryByPlaceIds — item 2 requires the top-up ONLY at offset 0");
  assert.equal(body.total, 4, "total is just meta.eligible on a later page — no extra candidates to add");
  assert.equal(body.hasMore, false, "meta.offset(3) + meta.served(1) === meta.eligible(4) -> hasMore false on the last page");
} finally {
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
}

// ── item 5: a FAILED broad read (failLoud) answers 503 + no-store, on BOTH
// inv=1 branches, never a cached {places:[]} under EDGE_HEADERS. ──
process.env.GOOGLE_MAPS_SERVER_KEY = "test-placeholder-not-a-key";
try {
  const failModule = await sourceModule(route, preludeFor(true));
  let response = await failModule.GET(new Request("https://example.test/api/places/search?q=inventory&lat=28.48&lng=-81.47&radius=72420&n=400&cat=food&sub=all&inv=1"));
  assert.equal(response.status, 503, "the unrelated-category branch does not answer 503 on a failed (failLoud) read");
  assert.equal(response.headers.get("Cache-Control"), "no-store", "a failed unrelated-category read is cacheable — it would freeze an outage as \"Nothing here\" for a day");
  let bodyErr = await response.json();
  assert.deepEqual(bodyErr.places, [], "a failed read's body should carry an empty places array, never a stale or partial one");
  assert.equal(typeof bodyErr.error, "string", "a failed read's body does not carry an error message");

  response = await failModule.GET(new Request("https://example.test/api/places/search?q=inventory&lat=28.48&lng=-81.47&radius=72420&n=400&cat=attractions&sub=all&inv=1"));
  assert.equal(response.status, 503, "the discovery branch does not answer 503 on a failed (failLoud) broad read");
  assert.equal(response.headers.get("Cache-Control"), "no-store", "a failed discovery-branch read is cacheable");
} finally {
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
}

console.log("test-attraction-discovery: OK");
