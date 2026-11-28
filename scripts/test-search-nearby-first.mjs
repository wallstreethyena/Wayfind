// Lock: a word search ("tacos") surfaces the places NEAR the searched city and
// ranks them above far ones. Live 2026-10-23, St. Pete: only three results, all
// 28-35 miles out, because the owned search served only rows refreshed in the
// last 30 days (6 percent of inventory) and needed the exact plural in the name.
// This drives searchResultCards against a fake PostgREST holding both kinds of
// rows and asserts on the cards, never on a status code.
import assert from "node:assert/strict";
import { searchResultCards } from "../lib/searchCards.js";
import { searchScore, singularQuery } from "../lib/searchRank.js";

const ENV = { SUPABASE_URL: "https://owned.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-test-key" };
const STPETE = { lat: 27.7731, lng: -82.64 };
const SARASOTA = { lat: 27.3364, lng: -82.5307 };
const PROJECT_COFFEE = "ChIJy6vf9_dBw4gRGg1sXR5UTGU";
const COFFEE = { primary_type: "coffee_shop", google_types: ["coffee_shop", "cafe", "food"], cuisines: ["coffee"] };
const PAPERBACK_QUERY = "somewhere I can order coffee and flip through a paperback in Sarasota";

function row(id, name, lat, lng, extra = {}) {
  return {
    place_id: id, name, lat, lng, category: "food", primary_type: "restaurant", google_types: ["restaurant", "food"],
    cuisines: [], status: "OPERATIONAL", excluded: false, signals: { rating: 4.5, reviews: 400 }, ...extra,
  };
}
const INVENTORY = [
  row("near-bell", "Taco Bell", 27.80, -82.66, { primary_type: "fast_food_restaurant" }),
  row("near-talkin", "Talkin' Tacos Clearwater", 27.97, -82.76, { primary_type: "taco_restaurant" }),
  row("near-bar", "bartaco", 27.94, -82.46, { primary_type: "taco_restaurant" }),
  row("near-cuisine", "Green Lemon", 27.95, -82.50, { primary_type: "restaurant", cuisines: ["mexican"] }),
  row("far-rocco", "Rocco's Tacos & Tequila Bar", 27.384, -82.457),
  row("far-smash", "Smash Burgers & Tacos", 27.389, -82.505),
  row("near-sushi", "Nearby Sushi", 27.78, -82.64, { cuisines: ["sushi"] }),
  row("near-closed", "Closed Tacos", 27.78, -82.65, { status: "CLOSED_PERMANENTLY" }),
  row("near-unrated", "Unrated Tacos", 27.78, -82.63, { signals: {} }),
  row("pz-near", "Sarasota Pizza Co", 27.34, -82.53, { primary_type: "pizza_restaurant" }),
  row("pz-cuisine", "Marina Kitchen", 27.33, -82.55, { cuisines: ["pizza"] }),
  row("pz-far", "Tampa Pizza Far", 27.95, -82.46, { primary_type: "pizza_restaurant" }),
  row(PROJECT_COFFEE, "Project Coffee", 27.332, -82.539, COFFEE),
  row("second-coffee", "Another Coffee Shop", 27.35, -82.52, COFFEE),
  row("closed-coffee", "Closed Coffee", 27.33, -82.54, { ...COFFEE, status: "CLOSED_PERMANENTLY" }),
  row("unrated-coffee", "Unrated Coffee", 27.33, -82.52, { ...COFFEE, signals: {} }),
  row("outside-coffee-radius", "Far Coffee", 27.66, -82.88, COFFEE),
  row("orlando-coffee", "Orlando Coffee", 28.542, -81.379, COFFEE),
];

function fakeFetch(calls) {
  return async (url) => {
    const u = new URL(String(url));
    calls.push(u);
    if (!u.pathname.endsWith("/wf_inventory")) return { ok: true, json: async () => [] };
    const lat = u.searchParams.getAll("lat"), lng = u.searchParams.getAll("lng");
    const minLat = Number(lat[0].slice(4)), maxLat = Number(lat[1].slice(4));
    const minLng = Number(lng[0].slice(4)), maxLng = Number(lng[1].slice(4));
    const or = u.searchParams.get("or") || "";
    const names = [...or.matchAll(/(?:name|primary_type)\.ilike\.\*([a-z0-9]+)\*/g)].map((m) => m[1]);
    const cs = [...or.matchAll(/cuisines\.cs\.\{([a-z0-9-]+)\}/g)].map((m) => m[1]);
    const hit = INVENTORY.filter((r) => r.lat >= minLat && r.lat <= maxLat && r.lng >= minLng && r.lng <= maxLng
      && (names.some((w) => r.name.toLowerCase().includes(w) || String(r.primary_type).includes(w)) || cs.some((c) => (r.cuisines || []).includes(c))));
    return { ok: true, json: async () => hit };
  };
}

// What directSearch served live: only the fresh rows, far away.
const farOwned = INVENTORY.filter((r) => r.place_id.startsWith("far-")).map((r) => ({
  id: r.place_id, displayName: { text: r.name }, location: { latitude: r.lat, longitude: r.lng },
  rating: 4.6, userRatingCount: 900, types: ["food"], _wfInventory: true,
}));

{
  const calls = [];
  const out = await searchResultCards({ query: "tacos", ...STPETE, ownedPlaces: farOwned, guides: [], events: [], env: ENV, fetchImpl: fakeFetch(calls) });
  const got = out.cards.map((c) => c.name);
  assert.ok(calls.some((u) => u.pathname.endsWith("/wf_inventory")), "a word search reads nearby owned inventory");
  for (const name of ["Taco Bell", "Talkin' Tacos Clearwater", "bartaco", "Green Lemon"]) assert.ok(got.includes(name), `tacos from St. Pete includes ${name}, got ${got.join(" | ")}`);
  for (const name of ["Closed Tacos", "Unrated Tacos", "Nearby Sushi"]) assert.ok(!got.includes(name), `${name} must not be served`);
  const nearIdx = ["Taco Bell", "Talkin' Tacos Clearwater", "bartaco"].map((n) => got.indexOf(n));
  const farIdx = ["Rocco's Tacos & Tequila Bar", "Smash Burgers & Tacos"].map((n) => got.indexOf(n)).filter((i) => i >= 0);
  assert.ok(Math.max(...nearIdx) < Math.min(...farIdx, 99), `nearby tacos outrank far ones, got ${got.join(" | ")}`);
  assert.ok(out.cards[0].distMi < 10, `first taco card is nearby, got ${out.cards[0].name} ${out.cards[0].distMi} mi`);
}

{
  const out = await searchResultCards({ query: "pizza", ...SARASOTA, ownedPlaces: [], guides: [], events: [], env: ENV, fetchImpl: fakeFetch([]) });
  const got = out.cards.map((c) => c.name);
  assert.deepEqual(got.slice(0, 2).sort(), ["Marina Kitchen", "Sarasota Pizza Co"], `pizza from Sarasota leads with local pizza, got ${got.join(" | ")}`);
  assert.ok(!got.includes("Tampa Pizza Far"), "pizza stays inside the 25 mile search radius");
}

{
  // A city search and a place name search must not turn into word searches.
  const calls = [];
  const city = await searchResultCards({ query: "St. Pete", ...STPETE, ownedPlaces: [], guides: [], events: [], env: ENV, fetchImpl: fakeFetch(calls) });
  assert.ok(!calls.some((u) => u.pathname.endsWith("/wf_inventory")), "a bare city query reads no word-search inventory");
  assert.equal(city.cards.length, 0, "a bare city query adds no place cards");
  const named = await searchResultCards({
    query: "Smash Burgers & Tacos", ...STPETE, ownedPlaces: farOwned.filter((p) => p.id === "far-smash"), guides: [], events: [], env: ENV, fetchImpl: fakeFetch([]),
  });
  assert.equal(named.cards[0] && named.cards[0].name, "Smash Burgers & Tacos", "an exact place-name search still leads with that place");
}

{
  assert.equal(singularQuery("tacos"), "taco");
  assert.equal(singularQuery("pizzas"), "pizza");
  assert.equal(singularQuery("brunch"), "brunch");
  assert.equal(singularQuery("bus"), "bus");
  assert.equal(singularQuery("glass"), "glass");
  assert.ok(searchScore({ title: "Taco Bell", keywords: [] }, "tacos", null) >= 520, "the singular title matches a plural query");
}

{
  const run = (query, opts = {}, calls = []) => searchResultCards({
    query, ...SARASOTA, ownedPlaces: [], guides: [], events: [], env: ENV, fetchImpl: fakeFetch(calls), ...opts,
  });
  const nearbyCoffee = [PROJECT_COFFEE, "second-coffee"].sort();
  const simple = await run("coffee");
  assert.deepEqual(simple.cards.map((card) => card.id).sort(), nearbyCoffee, "the owned inventory fixture serves the local coffee results");

  for (const opts of [{}, { filters: { category: "food", keywords: ["coffee"] } }]) {
    // Sarasota is explicit, even with the visitor's location set to Orlando.
    const out = await run(PAPERBACK_QUERY, { lat: 28.542, lng: -81.379, ...opts });
    assert.equal(out.city.slug, "sarasota");
    assert.deepEqual(out.cards.map((card) => card.id).sort(), nearbyCoffee,
      "conversational coffee searches include only eligible Sarasota cafés, with or without AI filters");
  }

  const cortado = await run("looking for a cortado and somewhere to sit with a paperback in Sarasota");
  assert.deepEqual(cortado.cards.map((card) => card.id).sort(), nearbyCoffee,
    "an explicit coffee subtype can find nearby coffee places without a provider");

  const cafeOnly = await run(PAPERBACK_QUERY, { places: [
    INVENTORY.find((place) => place.place_id === PROJECT_COFFEE),
    row("wholesale", "South Coast Coffee Wholesale", 27.332, -82.53, { primary_type: "grocery_store" }),
    row("kava", "Coffee & Kava Room", 27.332, -82.53, COFFEE),
    row("dessert", "Coffee + Ice Cream", 27.332, -82.53, { primary_type: "ice_cream_shop" }),
  ] });
  assert.deepEqual(cafeOnly.cards.map((card) => card.id), [PROJECT_COFFEE], "coffee in the name alone does not make a business a café");

  for (const query of [
    "no coffee",
    "coffee open after 9",
    "somewhere I can sit without coffee in Sarasota",
    "somewhere I can order coffee after 9 in Sarasota",
    "somewhere I can get coffee or sushi in Sarasota",
    "somewhere to get coffee in Seattle",
    "looking for Ghost Rose Coffee in Sarasota",
    "somewhere to get coffee within walking distance in Sarasota",
    "somewhere to get decaf coffee in Sarasota",
    "somewhere to get coffee and a place to charge my laptop in Sarasota",
  ]) {
    const out = await run(query);
    assert.deepEqual(out.cards, [], `uncertain or excluded coffee should not become an unrestricted coffee search: ${query}`);
  }

  const calls = [];
  const exact = await run("Project Coffee in Sarasota", {}, calls);
  assert.equal(exact.cards[0]?.id, PROJECT_COFFEE, "an exact venue still leads alongside other coffee inventory");
  assert.ok(!calls.some((url) => url.pathname.endsWith("/wf_inventory") && url.searchParams.get("or")?.includes("name.ilike.*coffee*")),
    "a successful exact venue search needs no broad coffee inventory read");
}

console.log("test-search-nearby-first: OK - local word searches, conversational coffee and cortado, explicit location, exclusions, and exact venue precedence");
