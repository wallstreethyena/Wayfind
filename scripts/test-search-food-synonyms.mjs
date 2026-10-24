// Lock: a food WORD search ("tacos") from St. Pete 27.7676,-82.6403, built from
// the live miss of 2026-10-24 (after #1939): Pepe's Cantina (2.2 mi) and Chinelos
// Taqueria (6.1 mi) were missing, Tacos Don Villa 35.5 mi sat above everything
// within 14 mi, Vinoy Park (a park that hosts a taco festival) was a card, and
// "Spartaco's" matched "taco" as a substring. Asserts on the returned cards.
import assert from "node:assert/strict";
import { searchResultCards } from "../lib/searchCards.js";
import { foodTermsFor, carriesFoodTerms } from "../lib/searchFoodTerms.js";

const ENV = { SUPABASE_URL: "https://owned.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-test-key" };
const PT = { lat: 27.7676, lng: -82.6403 };
const at = (mi) => ({ lat: Number((PT.lat + mi / 69).toFixed(5)), lng: PT.lng });
function row(id, name, mi, extra = {}) {
  return { place_id: id, name, ...at(mi), category: "food", primary_type: "restaurant", google_types: ["restaurant", "food"], cuisines: [], status: "OPERATIONAL", excluded: false, signals: { rating: 4.5, reviews: 500 }, ...extra };
}
const MEX = { primary_type: "mexican_restaurant", cuisines: ["mexican"] };
const INVENTORY = [
  row("pepe", "Pepe's Cantina St. Petersburg", 2.2, { ...MEX, signals: { rating: 4.9, reviews: 4762 } }),
  row("bell", "Taco Bell", 2.5, { primary_type: "fast_food_restaurant", cuisines: ["breakfast", "mexican", "vegetarian"], signals: { rating: 3.6, reviews: 2287 } }),
  row("chinelos", "Chinelos Taqueria", 6.1, { ...MEX, signals: { rating: 4.8, reviews: 931 } }),
  row("hacienda", "Grand Hacienda", 8.9, { ...MEX, signals: { rating: 4.5, reviews: 600 } }),
  row("tio", "TACOS TIO LEO", 10.7, MEX),
  row("talkin-c", "Talkin' Tacos Clearwater", 14.2, { primary_type: "taco_restaurant" }),
  row("spartaco", "Spartaco's Kitchen", 15.9, { primary_type: "italian_restaurant", cuisines: ["italian"] }),
  row("carnal", "Tacos \"El Carnal\"", 16.2, MEX),
  row("catrinas", "Catrinas Tacos and Tequila Bar", 16.3, MEX),
  row("juan", "Tacos Juan", 17.7, MEX),
  row("calif", "Tacos Las Californias", 19.4, MEX),
  row("talkin-w", "Talkin' Tacos Westchase", 19.3, { primary_type: "taco_restaurant" }),
  row("sushi", "Nearby Sushi", 1.0, { primary_type: "japanese_restaurant", cuisines: ["japanese", "sushi"] }),
  row("pizza", "Rocco Pizza", 3.0, { primary_type: "pizza_restaurant", cuisines: ["pizza"] }),
];
const FAR_OWNED = [{ id: "villa", displayName: { text: "Tacos Don Villa" }, location: { latitude: at(35.5).lat, longitude: PT.lng }, rating: 4.8, userRatingCount: 159, types: ["food"], _wfInventory: true }];
const PARK = { id: "vinoy", displayName: { text: "Vinoy Park" }, location: { latitude: at(1.2).lat, longitude: PT.lng }, rating: 4.7, userRatingCount: 9000, types: ["park"], primaryType: "park", category: "attractions", _wfInventory: true };
const TACO_PARK = { id: "tacopark", displayName: { text: "Taco Fest Park" }, location: { latitude: at(2).lat, longitude: PT.lng }, rating: 4.6, userRatingCount: 700, types: ["park"], primaryType: "park", category: "attractions", _wfInventory: true };
const FESTIVAL = { event_name: "St. Pete Tacos and Tequila Festival", slug: "st-pete-tacos-tequila", city: "St. Petersburg", category: "food", venue_name: "Vinoy Park", venue_lat: at(1.2).lat, venue_lng: PT.lng, rating: 4.7, reviews: 9000 };

function fakeFetch() {
  return async (url) => {
    const u = new URL(String(url));
    if (!u.pathname.endsWith("/wf_inventory")) return { ok: true, json: async () => [] };
    const lat = u.searchParams.getAll("lat"), lng = u.searchParams.getAll("lng");
    const [minLat, maxLat] = lat.map((v) => Number(v.slice(4)));
    const [minLng, maxLng] = lng.map((v) => Number(v.slice(4)));
    const or = u.searchParams.get("or") || "";
    const names = [...or.matchAll(/(?:name|primary_type)\.ilike\.\*([a-z0-9]+)\*/g)].map((m) => m[1]);
    const cs = [...or.matchAll(/cuisines\.cs\.\{([a-z0-9-]+)\}/g)].map((m) => m[1]);
    const hit = INVENTORY.filter((r) => r.lat >= minLat && r.lat <= maxLat && r.lng >= minLng && r.lng <= maxLng
      && (names.some((w) => r.name.toLowerCase().includes(w) || String(r.primary_type).includes(w)) || cs.some((c) => (r.cuisines || []).includes(c))));
    return { ok: true, json: async () => hit };
  };
}
const run = (query, extra = {}) => searchResultCards({ query, ...PT, ownedPlaces: [...FAR_OWNED, PARK, TACO_PARK], events: [FESTIVAL], guides: [], env: ENV, fetchImpl: fakeFetch(), ...extra });

{
  const out = await run("tacos");
  const got = out.cards.map((c) => c.name);
  const say = `got ${got.join(" | ")}`;
  for (const n of ["Pepe's Cantina St. Petersburg", "Chinelos Taqueria", "Taco Bell", "Grand Hacienda"]) assert.ok(got.includes(n), `${n} is a nearby taco result, ${say}`);
  assert.ok(got.indexOf("Pepe's Cantina St. Petersburg") < 3 && got.indexOf("Chinelos Taqueria") < 5, `Pepe's and Chinelos are in the top results, ${say}`);
  assert.ok(!got.includes("Vinoy Park"), `a park is not a taco result, ${say}`);
  assert.ok(!got.includes("Taco Fest Park"), `a non-food place with taco in its name is not a taco restaurant, ${say}`);
  assert.ok(!got.includes("Spartaco's Kitchen"), `Spartaco's is not a taco place (word match), ${say}`);
  assert.ok(!got.includes("Nearby Sushi") && !got.includes("Rocco Pizza"), `other cuisines stay out, ${say}`);
  assert.ok(!got.includes("Tacos Don Villa"), `a 35 mi row is outside the 25 mi search radius, ${say}`);
  const miles = out.cards.map((c) => c.distMi);
  for (let i = 0; i < miles.length; i++) for (let j = i + 1; j < miles.length; j++) {
    assert.ok(!(miles[i] > 25 && miles[j] < 10), `nothing over 25 mi sits above anything under 10 mi, ${say}`);
  }
  assert.deepEqual(got.slice(0, 5), ["Pepe's Cantina St. Petersburg", "Taco Bell", "Chinelos Taqueria", "Grand Hacienda", "TACOS TIO LEO"].map((n) => n), `nearest band first, ${say}`);
}

{
  const out = await run("pizza");
  const got = out.cards.map((c) => c.name);
  assert.equal(got[0], "Rocco Pizza", `pizza leads with the pizza place, got ${got.join(" | ")}`);
  assert.ok(!got.includes("Vinoy Park"));
}

{
  // Whole-word and synonym helpers, plus non-food words keep the old path.
  const t = foodTermsFor("tacos");
  assert.ok(carriesFoodTerms({ name: "Chinelos Taqueria" }, t));
  assert.ok(carriesFoodTerms({ name: "x", cuisines: ["mexican"] }, t));
  assert.ok(!carriesFoodTerms({ name: "Spartaco's Kitchen", cuisines: ["italian"] }, t));
  assert.ok(carriesFoodTerms({ name: "Sasa", cuisines: ["japanese"] }, foodTermsFor("sushi")));
  assert.equal(foodTermsFor("St. Pete Salt Room"), null);
  assert.equal(foodTermsFor("things to do"), null);
  const named = await run("Vinoy Park");
  assert.ok(named.cards.some((c) => c.name === "Vinoy Park"), "a place-name search still finds the park");
}

console.log("test-search-food-synonyms: OK - tacos from St. Pete: Pepe's and Chinelos lead, no park, no Spartaco's, nearest band first; pizza and place-name searches intact");
