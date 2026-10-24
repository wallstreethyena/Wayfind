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

console.log("test-search-nearby-first: OK - tacos from St. Pete lead with nearby places; pizza from Sarasota, city and place-name searches unchanged");
