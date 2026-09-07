// CALL: the geocode path stays usable without Google for owned cities.
// Red proof: a throwing external provider must never be touched for known cities.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knownCityGeocode, geocodeKnownCityFirst } from '../lib/knownCityGeocode.js';
import { LANDING_CITIES } from '../lib/landingCities.js';
let externalCalls = 0;
const blocked = async () => { externalCalls++; throw new Error('Google unavailable'); };
for (const city of Object.values(LANDING_CITIES)) {
  const result = await geocodeKnownCityFirst(city.name, blocked);
  assert.equal(result.lat, city.lat);
  assert.equal(result.lng, city.lng);
  assert.equal(result.isArea, true);
}
assert.equal(externalCalls, 0);
assert.equal(knownCityGeocode('  SARASOTA,   FL ').lat, 27.3364);
assert.equal(knownCityGeocode('Sarasota Florida').lng, -82.5307);
for (const query of ['Venice, Italy', 'Sarasota Memorial Hospital', 'Miami, OH', 'Parrish, Alabama', '', null]) assert.equal(knownCityGeocode(query), null);
const fallback = { name: 'Verified external city', lat: 1, lng: 2 };
assert.equal(await geocodeKnownCityFirst('External city', async q => { assert.equal(q, 'External city'); return fallback; }), fallback);
await assert.rejects(geocodeKnownCityFirst('Unknown city', blocked), /Google unavailable/);
// Execute the real adapter body too: testing the helper alone would miss a
// future edit that disconnects it from the user-facing geocoder.
const source = readFileSync(new URL('../lib/google.js', import.meta.url), 'utf8');
const body = source.match(/export async function geocodeCity\(query\) \{([\s\S]*?)\n\}/)?.[1];
assert.ok(body, 'real geocodeCity body is present');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
const realAdapter = new AsyncFunction('query', 'geocodeKnownCityFirst', 'getLoader', 'isAreaResult', body);
assert.equal((await realAdapter('Sarasota', geocodeKnownCityFirst, () => { throw new Error('Google loader unavailable'); }, () => true)).lat, 27.3364);
const loader = () => ({ importLibrary: async () => ({ Geocoder: class { async geocode() { return {results:[{formatted_address:'External city',types:['locality'],geometry:{location:{lat:()=>1,lng:()=>2}}}]}; } } }) });
assert.equal((await realAdapter('External city', geocodeKnownCityFirst, loader, () => true)).lng, 2);
console.log('test-known-city-geocode: OK — all owned cities resolve with zero provider calls; mismatched states and business names fall through');
