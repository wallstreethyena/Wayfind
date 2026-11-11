// scripts/test-geocode-owned-fallback.mjs
//
// /api/geocode used to answer 503 {name:null} whenever the Google reverse-geocode
// budget was refused (live 2026-11: Sarasota). The route now names the nearest
// covered city from OWNED data (lib/locationHonesty nearestOwnedCityName, the
// same helper the client falls back to) and tags it source:"owned". This guard
// EXECUTES resolveReverseGeocode with injected deps and asserts:
//   - budget refused / no key / upstream failure -> 200 owned name, zero fetches
//   - owned answers are never written to the Google cache key
//   - offshore or out-of-market coordinates stay null with the old status
//   - healthy budget -> unchanged Google path, one fetch, cache write
import { readFileSync } from "node:fs";
import { nearestOwnedCityName } from "../lib/locationHonesty.js";

let failures = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { failures++; console.error("FAIL " + m + "\n  got " + JSON.stringify(a) + "\n  want " + JSON.stringify(b)); } };
const ok = (c, m) => eq(!!c, true, m);

let source = readFileSync("app/api/geocode/route.js", "utf8").replace(/^import[^;]+;\n/gm, "");
globalThis.__geoOwned = { nearestOwnedCityName };
const mod = await import("data:text/javascript," + encodeURIComponent(`
  const cget = async () => null, cset = async () => {};
  const spendAllowCapped = async () => true, geocodingCap = () => 1;
  const nearestOwnedCityName = (...a) => globalThis.__geoOwned.nearestOwnedCityName(...a);
` + source));
const { resolveReverseGeocode } = mod;

const SARASOTA = [27.3364, -82.5307], PARRISH = [27.5689, -82.4393];
const OFFSHORE = [25.0, -90.0], OUT_OF_STATE = [40.7128, -74.006];

function deps(over = {}) {
  const st = { fetches: 0, writes: [] };
  const d = {
    serverKey: "k",
    cacheGet: async () => null,
    cacheSet: async (...a) => { st.writes.push(a); },
    spendAllow: async () => false,
    fetchImpl: async () => { st.fetches++; throw new Error("fetch must not be called"); },
    ...over,
  };
  return { d, st };
}

for (const [label, [lat, lng], city] of [["Sarasota", SARASOTA, "Sarasota, FL"], ["Parrish", PARRISH, "Parrish, FL"]]) {
  const { d, st } = deps();
  const r = await resolveReverseGeocode({ lat, lng, ...d });
  eq(r.status, 200, label + ": budget shut answers 200");
  eq(r.value, { name: city, source: "owned" }, label + ": owned name and provenance");
  eq(st.fetches, 0, label + ": no Google fetch");
  eq(st.writes.length, 0, label + ": owned answer never written to the Google cache key");
}
{ // no server key
  const { d, st } = deps({ serverKey: "" });
  const r = await resolveReverseGeocode({ lat: SARASOTA[0], lng: SARASOTA[1], ...d });
  eq([r.status, r.value.name, st.fetches], [200, "Sarasota, FL", 0], "no server key still names the city for free");
}
{ // upstream failure (non-ok and thrown)
  const { d, st } = deps({ spendAllow: async () => true, fetchImpl: async () => { st.fetches++; return { ok: false }; } });
  const r = await resolveReverseGeocode({ lat: PARRISH[0], lng: PARRISH[1], ...d });
  eq([r.status, r.value.source], [200, "owned"], "upstream non-ok falls back to owned");
  eq(st.writes.length, 0, "upstream fallback is not cached");
  const t = deps({ spendAllow: async () => true, fetchImpl: async () => { throw new Error("net"); } });
  const r2 = await resolveReverseGeocode({ lat: PARRISH[0], lng: PARRISH[1], ...t.d });
  eq([r2.status, r2.value.source], [200, "owned"], "upstream throw falls back to owned");
}
for (const [label, [lat, lng]] of [["offshore", OFFSHORE], ["out of market", OUT_OF_STATE]]) {
  const { d, st } = deps();
  const r = await resolveReverseGeocode({ lat, lng, ...d });
  eq([r.status, r.value], [503, { name: null }], label + ": no owned city, original failure preserved");
  eq(st.fetches, 0, label + ": still no fetch");
}
{ // healthy budget: Google path unchanged
  const { d, st } = deps({
    spendAllow: async () => true,
    fetchImpl: async () => { st.fetches++; return { ok: true, json: async () => ({ results: [{ address_components: [
      { long_name: "Bradenton", types: ["locality"] }, { short_name: "FL", types: ["administrative_area_level_1"] }] }] }) }; },
  });
  const r = await resolveReverseGeocode({ lat: PARRISH[0], lng: PARRISH[1], ...d });
  eq([r.status, r.value], [200, { name: "Bradenton, FL" }], "healthy budget returns the Google answer untouched");
  eq(st.fetches, 1, "healthy budget makes exactly one fetch");
  eq(st.writes.length, 1, "Google answer still cached");
}
{ // cache hit still wins first
  const { d } = deps({ cacheGet: async () => ({ v: { name: "Cached, FL" } }), spendAllow: async () => { throw new Error("no spend on hit"); } });
  const r = await resolveReverseGeocode({ lat: PARRISH[0], lng: PARRISH[1], ...d });
  eq(r.value.name, "Cached, FL", "cache hit precedes everything");
}
ok(/Cache-Control/.test(source) && /result\.owned \? ONE_DAY/.test(source), "owned answers get the shorter cache life");

if (failures) process.exit(1);
console.log("geocode-owned-fallback: OK");
