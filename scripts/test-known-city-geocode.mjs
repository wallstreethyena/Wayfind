import assert from "node:assert/strict";
import { knownCityGeocode } from "../lib/knownCityGeocode.js";
import { LANDING_CITIES } from "../lib/landingCities.js";
import { readFileSync } from "node:fs";

for (const city of Object.values(LANDING_CITIES)) {
  const result = knownCityGeocode(city.name);
  assert.equal(result.lat, city.lat);
  assert.equal(result.lng, city.lng);
  assert.equal(result.isArea, true);
}
assert.equal(knownCityGeocode("  SARASOTA,   FL ").lat, 27.3364);
assert.equal(knownCityGeocode("Sarasota Florida").lng, -82.5307);
for (const query of ["Venice, Italy", "Sarasota Memorial Hospital", "Miami, OH", "Parrish, Alabama", "", null]) {
  assert.equal(knownCityGeocode(query), null);
}
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const body = google.match(/export async function geocodeCity\(query\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(body, /return knownCityGeocode\(query\)/);
assert.doesNotMatch(body, /getLoader|Geocoder|importLibrary|googleapis/);
console.log("test-known-city-geocode: OK — owned cities resolve locally and city fallback cannot spend from the browser");
