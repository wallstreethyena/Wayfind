// "free things to do in sarasota" must not come back empty, and must never
// show a paid place. Found 2026-11-11 in PostHog search_outcome (30 days, real
// visitors): "free things to do in sarasota" 6 searches / 4 people, "free
// things to do in orlando", "top tourist attractions in orlando" and "family
// friendly things to do in sarasota" were all `empty / not_in_library` while
// "things to do in sarasota" had a page and cards.
//
// Every assertion CALLS the real code: resolveSearchIntent, searchLibrary,
// searchResultCards (fixture rows, no network) and the /api/search handler
// (unconfigured Supabase, as test-unified-search does). Red-prove: delete the
// peelModifiers() call in lib/searchIntent.js, or the `intent.free ?` filter in
// lib/searchCards.js, and this script fails.
import assert from "node:assert/strict";
import { GET as searchRoute } from "../app/api/search/route.js";
import { resolveSearchIntent } from "../lib/searchIntent.js";
import { searchLibrary } from "../lib/unifiedSearch.js";
import { searchResultCards, isFreeDoc, isFreeOwnedPlace } from "../lib/searchCards.js";

const SARASOTA = { lat: 27.3364, lng: -82.5307 };
const QUIET = { WAYFIND_SEARCH_UNDERSTAND: "" };
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// 1. Intent: the modifier is peeled only when a known phrase remains.
for (const [query, id, free, slug] of [
  ["free things to do in sarasota", "things-to-do", true, "sarasota"],
  ["Free Things To Do In Sarasota", "things-to-do", true, "sarasota"],
  ["free things to do in orlando", "things-to-do", true, "orlando"],
  ["top tourist attractions in orlando", "things-to-do", false, "orlando"],
  ["best things to do in sarasota", "things-to-do", false, "sarasota"],
  ["family friendly things to do in sarasota", "family", false, "sarasota"],
  ["free events tampa", "events", true, "tampa"],
  ["free beaches sarasota", "beaches", true, "sarasota"],
]) {
  const intent = resolveSearchIntent(query, {});
  eq([intent.recognized, intent.id, intent.free, intent.city.slug], [true, id, free, slug], `${query} -> ${id}${free ? " (free)" : ""} in ${slug}`);
}
// Exact phrases keep their old answer and are never "free".
eq(resolveSearchIntent("things to do in sarasota", {}).free, false, "an exact phrase is not a free search");
// Not a known remainder: stays unrecognized, so the route keeps its old JSON.
for (const query of ["free things to do in gastonia", "free", "free pizza", "best tacos", "free date night", "top"]) {
  eq(resolveSearchIntent(query, {}).recognized, false, `${query} stays unrecognized`);
}

// 2. Library: the lead is the city's real page; extras must SAY they are free.
{
  const lib = await searchLibrary({
    query: "free things to do in sarasota", ...SARASOTA, env: QUIET, fetchImpl: async () => { throw new Error("no network in this test"); },
    extraDocuments: [
      { kind: "event", title: "Sarasota Free Art Walk", href: "/florida-events/sarasota-free-art-walk", city_slug: "sarasota", price_band: "free", keywords: ["things to do"] },
      { kind: "event", title: "Sarasota Things To Do Gala, Free Valet", href: "/florida-events/sarasota-gala", city_slug: "sarasota", price_band: "$$", keywords: ["things to do"] },
      { kind: "event", title: "Sarasota Things To Do Show", href: "/florida-events/sarasota-show", city_slug: "sarasota", price_band: null, keywords: ["things to do"] },
    ],
  });
  eq(lib.recognized, true, "free things to do in sarasota is recognized by the library");
  eq(lib.results[0].href, "/things-to-do/sarasota", "lead is the real Sarasota page");
  eq(lib.results[0].title, "Things to do in Sarasota", "the page title does not claim the page is free");
  const hrefs = lib.results.map((r) => r.href);
  ok(!hrefs.includes("/florida-events/sarasota-gala"), "a priced event is not listed under free");
  ok(!hrefs.includes("/florida-events/sarasota-show"), "an event with no price evidence is not listed under free");
  ok(hrefs.includes("/florida-events/sarasota-free-art-walk"), "an event marked free IS listed (positive control for the free filter)");
}

// 3. Cards: only places of a no-charge public type, only events marked free.
const place = (id, name, primary_type) => ({ id, name, primary_type, lat: 27.33, lng: -82.53, rating: 4.7, reviews: 900, category: "attractions" });
const fixturePlaces = [
  place("p-beach", "Lido Key Beach", "beach"),
  place("p-park", "Bayfront Park", "park"),
  place("p-trail", "Legacy Trail Trailhead", "hiking_area"),
  place("p-museum", "The Ringling Museum of Art", "museum"),
  place("p-zoo", "Sarasota Jungle Gardens", "zoo"),
  place("p-state", "Myakka River State Park", "state_park"),
  place("p-parkname", "Sarasota Polo Club Park", "park"),
  place("p-unknown", "Mystery Spot", null),
  // Neutral names, paid types: these isolate the TYPE allowlist from the
  // name regex (the first red-prove of that list stayed green without them).
  place("p-cat", "Big Cat Habitat", "zoo"),
  place("p-mote", "Mote Marine Laboratory", "aquarium"),
  place("p-oscar", "Oscar Scherer", "state_park"),
  // Audit 2026-11-11: paid-entry parks Google types as plain "park".
  place("p-boyd", "Boyd Hill Nature Preserve", "park"),
  place("p-desoto", "Fort De Soto Park", "park"),
  place("p-lettuce", "Lettuce Lake Regional Park", "park"),
];
const fixtureEvents = [
  { event_id: "e1", slug: "free-concert", event_name: "Free Bayfront Concert", city: "Sarasota", is_free: true, lat: 27.33, lng: -82.54 },
  { event_id: "e2", slug: "paid-show", event_name: "Ticketed Show", city: "Sarasota", is_free: false, price_band: "$$", lat: 27.33, lng: -82.54 },
];
{
  const free = await searchResultCards({ query: "free things to do in sarasota", places: fixturePlaces, events: fixtureEvents, guides: [], env: QUIET, fetchImpl: async () => { throw new Error("no network"); } });
  const ids = free.cards.map((c) => c.id).sort();
  ok(free.cards.length > 0, "free things to do in sarasota returns cards (was empty)");
  for (const id of ["p-museum", "p-zoo", "p-state", "p-parkname", "p-unknown", "p-cat", "p-mote", "p-oscar", "p-boyd", "p-desoto", "p-lettuce", "event:e2"]) ok(!ids.includes(id), `${id} is never a free card`);
  for (const id of ["p-beach", "p-park", "p-trail"]) ok(ids.includes(id), `${id} is a free card`);
  const all = await searchResultCards({ query: "things to do in sarasota", places: fixturePlaces, events: fixtureEvents, guides: [], env: QUIET, fetchImpl: async () => { throw new Error("no network"); } });
  const refused = ["p-museum", "p-zoo", "p-state", "p-parkname", "p-cat", "p-mote", "p-oscar", "p-boyd", "p-desoto", "p-lettuce"];
  ok(all.cards.some((c) => refused.includes(c.id)), "without 'free' places the free rule refuses still rank: the filter is free-only");
}
// (a) the ownedPlaces path: the route hands its place matches in this shape.
const owned = (id, name, primaryType) => ({ id, displayName: { text: name }, primaryType, location: { latitude: 27.33, longitude: -82.53 }, rating: 4.6, userRatingCount: 500 });
{
  const viaOwned = await searchResultCards({ query: "free things to do in sarasota", places: [], events: [], guides: [], ownedPlaces: [owned("o-beach", "Siesta Beach", "beach"), owned("o-museum", "Art Center Sarasota", "museum")], env: QUIET });
  const ids = viaOwned.cards.map((c) => c.id);
  ok(ids.includes("o-beach"), "an owned beach match is a free card");
  ok(!ids.includes("o-museum"), "an owned museum match is never a free card");
}
// (b) the indexed path: index rows come from the search RPC (stubbed here).
{
  const rpcRows = [
    { kind: "event", title: "Free Sarasota Events Fair", href: "/florida-events/free-fair", city_slug: "sarasota", price_band: "free", keywords: ["events"], lat: 27.33, lng: -82.54 },
    { kind: "event", title: "Sarasota Events Expo, Free Parking", href: "/florida-events/priced-expo", city_slug: "sarasota", price_band: "$$", keywords: ["events"], lat: 27.33, lng: -82.54 },
  ];
  let rpcCalls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("/rpc/wf_search_documents_query")) { rpcCalls++; return new Response(JSON.stringify(rpcRows), { status: 200, headers: { "content-type": "application/json" } }); }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k".repeat(64), WAYFIND_SEARCH_UNDERSTAND: "" };
  const viaIndex = await searchResultCards({ query: "free events in sarasota", places: [], guides: [], env, fetchImpl });
  ok(rpcCalls > 0, "the indexed path actually ran (positive control: the RPC stub was called)");
  const hrefs = viaIndex.cards.map((c) => c.href);
  ok(hrefs.includes("/florida-events/free-fair"), "an index event marked free is a card");
  ok(!hrefs.includes("/florida-events/priced-expo"), "a priced index event is never a free card");
}
// The route filters its own `places` with this helper under a free search.
eq(isFreeOwnedPlace(owned("r-beach", "Lido Beach", "beach")), true, "route helper: an owned beach is free");
eq(isFreeOwnedPlace(owned("r-aq", "Mote Marine Laboratory", "aquarium")), false, "route helper: an owned aquarium is not free");
eq(isFreeOwnedPlace(owned("r-boyd", "Boyd Hill Nature Preserve", "park")), false, "route helper: a paid preserve typed park is not free");
eq(isFreeDoc({ kind: "event", free: true }), true, "an event marked free is free");
eq(isFreeDoc({ kind: "event" }), false, "an event with no evidence is not free");
eq(isFreeDoc({ kind: "guide", title: "Free things" }), false, "a guide is never a free card");

// 4. Route: Gastonia keeps its exact unsupported-location JSON.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2e-placeholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
process.env.WAYFIND_SEARCH_UNDERSTAND = "";
try {
  const gastonia = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=free%20things%20to%20do%20in%20gastonia"))).json();
  eq(gastonia, { status: "unavailable", places: [], source: "owned-inventory", query: "free things to do in gastonia", reason: "unsupported_location" }, "Gastonia JSON is exactly the unsupported-location contract");
  const sarasota = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=free%20things%20to%20do%20in%20sarasota"))).json();
  eq(sarasota.status, "ok", "free things to do in sarasota is no longer empty through the real route");
  eq(sarasota.results[0].href, "/things-to-do/sarasota", "route leads with the Sarasota page");
  const noPoint = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=family%20friendly%20things%20to%20do"))).json();
  eq(noPoint.results && noPoint.results[0].href, "/family?city=Parrish", "family friendly things to do before GPS is the home market, not unsupported");
} finally {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.WAYFIND_SEARCH_UNDERSTAND;
}

console.log(`test-search-free-modifier: OK — ${checks} assertions: free/top/best/family-friendly modifiers reach real city pages; free cards only beach/park/trail/playground types and is_free events (museum, zoo, state park, unknown, priced event refused); Gastonia JSON unchanged`);
