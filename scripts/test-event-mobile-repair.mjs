import assert from "node:assert/strict";
import { resolvePlacePhoto, photoCacheKey } from "../lib/placePhotoServe.js";
import { routeSummary, validateRouteInput } from "../lib/appleEventRouting.js";

// COMPLIANT PHOTOS (2026-10-08): the cached-size reuse / cache-hit-renewal
// contract this block used to lock is REMOVED. A Google photo URL is never read
// from or written to the shared cache, so a warm photo| row (the old fixture)
// must NOT be served, and no cache call of any kind may happen.
const ref = "places/ChIJFixturePlace/photos/FixturePhoto";
const uri = "https://lh3.googleusercontent.com/fixture-photo";
let ledger = 0, upstream = 0, writes = 0;
const reads = [];
const deps = {
  // A warm legacy row for every width: serving it would be the forbidden behaviour.
  cacheGet: async key => { reads.push(key); return { v: { uri } }; },
  cacheSet: async () => { writes++; },
  inventoryGet: async () => null,
  fetchOwnedUri: async () => { upstream++; return null; },
};
const input = { ref, w: 220, serverKey: "fixture-key", gateShut: false, authorizeSpend: async () => { ledger++; return false; } };
// Non-credited surface: honest miss, zero cache calls, zero ledger asks, zero upstream.
const cold = await resolvePlacePhoto(input, deps);
assert.equal(cold.type, "miss"); assert.equal(cold.reason, "not-google-surface"); assert.notEqual(cold.location, uri);
assert.equal(reads.length, 0, "the resolver must never call cacheGet");
assert.equal(ledger, 0); assert.equal(upstream, 0); assert.equal(writes, 0);
for (const w of [220, 640, 1200]) {
  const r = await resolvePlacePhoto({ ...input, w, gateShut: true }, deps);
  assert.notEqual(r.location, uri, "a warm cache row must not be served at width " + w);
}
assert.equal(reads.length, 0); assert.equal(writes, 0);
// Positive control for the probe: the legacy key helper still names the row the fixture planted.
assert.equal(photoCacheKey(ref, 220), "photo|" + ref + "|220");
// Credited surface with the ledger refusing: a denied miss, one ask, still no Google call, no cache.
const denied = await resolvePlacePhoto({ ...input, googleSurface: true }, deps);
assert.equal(denied.reason, "spend-denied");
assert.equal(ledger, 1); assert.equal(upstream, 0); assert.equal(writes, 0); assert.equal(reads.length, 0);
// Credited surface with a grant: exactly one upstream attempt, nothing written to the cache.
const granted = await resolvePlacePhoto({ ...input, googleSurface: true, authorizeSpend: async () => { ledger++; return true; } }, { ...deps, fetchOwnedUri: async () => { upstream++; return { uri, upstream: "ok", credit: { name: "A" } }; } });
assert.equal(granted.type, "redirect"); assert.equal(granted.reason, "google"); assert.equal(granted.cacheControl, "private, no-store");
assert.equal(ledger, 2); assert.equal(upstream, 1); assert.equal(writes, 0); assert.equal(reads.length, 0);

const origin = { lat: 27.34, lng: -82.55 }, destination = { lat: 28.04, lng: -82.42 };
assert.deepEqual(validateRouteInput(origin, destination), { ok: true, origin, destination });
assert.equal(validateRouteInput("Sarasota", destination).ok, true);
for (const invalid of [null, {}, { lat: NaN, lng: 1 }, { lat: 0, lng: 0 }, { lat: 91, lng: 1 }, { lat: 1, lng: 181 }]) {
  assert.equal(validateRouteInput(invalid, destination).ok, false);
  assert.equal(validateRouteInput(origin, invalid).ok, false);
}
assert.equal(routeSummary({ polyline: {}, distance: 1609.344, expectedTravelTime: 600 }).distanceLabel, "1.0 mi");
assert.equal(routeSummary({ distance: 1609.344, expectedTravelTime: 600 }), null);
console.log("test-event-mobile-repair: OK — no Google photo cache read/write, non-credited surface never spends, credited surface asks the ledger once, gate-shut control, and Apple in-page route validation contract");
