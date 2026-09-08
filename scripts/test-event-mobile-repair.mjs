import assert from "node:assert/strict";
import { resolvePlacePhoto, photoCacheKey } from "../lib/placePhotoServe.js";
import { routeSummary, validateRouteInput } from "../lib/appleEventRouting.js";

const ref = "places/ChIJFixturePlace/photos/FixturePhoto";
const uri = "https://lh3.googleusercontent.com/fixture-photo";
let ledger = 0, upstream = 0, writes = 0;
const reads = [];
const deps = {
  cacheGet: async key => { reads.push(key); return key === photoCacheKey(ref, 640) ? { v: { uri } } : null; },
  cacheSet: async () => { writes++; },
  inventoryGet: async () => null,
  fetchOwnedUri: async () => { upstream++; return null; },
};
const input = { ref, w: 220, serverKey: "fixture-key", gateShut: false, authorizeSpend: async () => { ledger++; return false; } };
assert.equal((await resolvePlacePhoto(input, deps)).location, uri);
assert.deepEqual(reads, [photoCacheKey(ref, 220), photoCacheKey(ref, 640)]);
assert.equal(ledger, 0); assert.equal(upstream, 0); assert.equal(writes, 0);
assert.equal((await resolvePlacePhoto({ ...input, gateShut: true }, deps)).location, uri);
assert.equal((await resolvePlacePhoto({ ...input, w: 1200, gateShut: true }, deps)).type, "empty");
assert.equal((await resolvePlacePhoto(input, { ...deps, cacheGet: async () => null })).type, "empty");
assert.equal(ledger, 1); assert.equal(upstream, 0);
await resolvePlacePhoto({ ...input, gateShut: true }, { ...deps, cacheGet: async () => null });
assert.equal(ledger, 1); assert.equal(upstream, 0);
assert.equal((await resolvePlacePhoto({ ...input, authorizeSpend: async () => { ledger++; return true; } }, { ...deps, cacheGet: async () => null })).type, "miss");
assert.equal(ledger, 2); assert.equal(upstream, 1);

const origin = { lat: 27.34, lng: -82.55 }, destination = { lat: 28.04, lng: -82.42 };
assert.deepEqual(validateRouteInput(origin, destination), { ok: true, origin, destination });
assert.equal(validateRouteInput("Sarasota", destination).ok, true);
for (const invalid of [null, {}, { lat: NaN, lng: 1 }, { lat: 0, lng: 0 }, { lat: 91, lng: 1 }, { lat: 1, lng: 181 }]) {
  assert.equal(validateRouteInput(invalid, destination).ok, false);
  assert.equal(validateRouteInput(origin, invalid).ok, false);
}
assert.equal(routeSummary({ polyline: {}, distance: 1609.344, expectedTravelTime: 600 }).distanceLabel, "1.0 mi");
assert.equal(routeSummary({ distance: 1609.344, expectedTravelTime: 600 }), null);
console.log("test-event-mobile-repair: OK — cached-size reuse, no cache-hit spending/renewal, gate-shut control, and Apple in-page route validation contract");
