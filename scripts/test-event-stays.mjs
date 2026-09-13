import assert from "node:assert/strict";
import { eventStays, selectEventStays } from "../lib/eventStays.js";

const origin = { lat: 28.475, lng: -81.467 };
const hotel = (id, extra = {}) => ({ id, name: "Test Hotel", types: ["hotel", "lodging"], lat: 28.48, lng: -81.47, wfScore: 92, ...extra });
const good = hotel("near");
const selected = selectEventStays([good, good, hotel("far", { lat: 27.3, lng: -82.5 }), hotel("cafe", { types: ["cafe"] }), hotel("better", { wfScore: 96 }), hotel("bad", { lat: null })], origin);
assert.deepEqual(selected.map((p) => p.id), ["better", "near"]);
assert.ok(selected.every((p) => p.distMi < 12));
const canonicalOwned = selectEventStays([hotel("wfh-owned", { googlePlaceId: "ChIJ-test" })], origin)[0];
assert.equal(canonicalOwned.id, "ChIJ-test", "the event card, map pin, and /p route share the Google Place identity");
assert.equal(canonicalOwned.sourceId, "wfh-owned", "the owned-inventory identity remains available as provenance");
assert.equal(canonicalOwned.detailHref, "/p/ChIJ-test");
assert.match(selectEventStays([hotel("wfh-owned")], origin)[0].detailHref, /^https:\/\/maps.apple.com\//);
assert.equal(selectEventStays([hotel("wfh-owned")], origin)[0].mapsOnly, true);
assert.deepEqual(selectEventStays([good], { lat: 0, lng: 0 }), []);
let calls = 0;
assert.deepEqual(await eventStays({ lat: null, lng: null }, { readOwned: () => { calls++; }, readInventory: () => { calls++; } }), { places: [], unavailable: false });
assert.equal(calls, 0);
const empty = await eventStays(origin, { readOwned: async () => [], readInventory: async (...args) => { assert.equal(args[0], "hotels"); assert.equal(args[1], origin.lat); assert.equal(args[6].failLoud, true); return []; } });
assert.deepEqual(empty, { places: [], unavailable: false });
const failed = await eventStays(origin, { readOwned: async () => [], readInventory: async () => { throw new Error("offline"); } });
assert.deepEqual(failed, { places: [], unavailable: true });
const partial = await eventStays(origin, { readOwned: async () => [good], readInventory: async () => { throw new Error("offline"); } });
assert.equal(partial.places.length, 1);
assert.equal(partial.unavailable, false);
const mapped = await eventStays(origin, { readOwned: async () => [], readInventory: async () => [{ id: "real", displayName: { text: "Real Hotel" }, location: { latitude: 28.48, longitude: -81.47 }, types: ["hotel"], rating: 4.8, userRatingCount: 1000 }] });
assert.equal(mapped.places[0].name, "Real Hotel");
assert.equal(mapped.places[0].category, "hotels");
const permanentPhoto = "https://images.example.test/roost-tampa.jpg";
const photographed = await eventStays(origin, { readOwned: async () => [], readInventory: async () => [{ id: "roost", displayName: { text: "ROOST Tampa" }, location: { latitude: 28.48, longitude: -81.47 }, types: ["hotel"], rating: 4.8, userRatingCount: 1000, photo_url: permanentPhoto, photos: [{ name: "places/roost/photos/stale" }] }] });
assert.equal(photographed.places[0].photo, permanentPhoto, "event Stays must preserve the inventory-owned photo ahead of a provider ref");
const stockRejected = await eventStays(origin, { readOwned: async () => [], readInventory: async () => [{ id: "roost", displayName: { text: "ROOST Tampa" }, location: { latitude: 28.48, longitude: -81.47 }, types: ["hotel"], rating: 4.8, userRatingCount: 1000, photo_url: "https://images.pexels.com/photos/shared-hotel.jpg", photos: [{ name: "places/roost/photos/exact" }] }] });
assert.equal(stockRejected.places[0].photo, "/api/photo?ref=places%2Froost%2Fphotos%2Fexact&w=640", "event Stays must reject a shared stock URL and retain the place-bound ref");
const merged = await eventStays(origin, { readOwned: async () => [hotel("wfh-real", { googlePlaceId: "real", wfScore: 99, blurb: "Owned editorial" })], readInventory: async () => [{ id: "real", displayName: { text: "Real Hotel" }, location: { latitude: 28.48, longitude: -81.47 }, types: ["hotel"], rating: 4, userRatingCount: 10 }] });
assert.equal(merged.places.length, 1);
assert.equal(merged.places[0].id, "real", "the owned row wins dedupe without keeping a parallel card identity");
assert.equal(merged.places[0].sourceId, "wfh-real");
assert.equal(merged.places[0].wfScore, 99);
assert.equal(merged.places[0].blurb, "Owned editorial");
const serviceRows = await eventStays(origin, { readOwned: async () => [], readInventory: async () => [
  { id: "massage", displayName: { text: "LeVisa Massage Spa & Wellness" }, primaryType: "massage", types: ["hotel", "spa", "massage", "lodging"], location: { latitude: 28.48, longitude: -81.47 }, rating: 5, userRatingCount: 1000 },
  { id: "spa-hotel", displayName: { text: "Test Spa Resort" }, primaryType: "spa", types: ["hotel", "spa", "lodging"], location: { latitude: 28.48, longitude: -81.47 }, rating: 4.8, userRatingCount: 1000 },
] });
if (serviceRows.places.length !== 1 || serviceRows.places[0].id !== "spa-hotel") throw new Error("Event Stays must reject standalone massage businesses while retaining spa resorts");
console.log("event-stays PASS: venue geography, lodging identity, score order, dedupe, invalid origins, empty/error distinction, partial availability, inventory mapping");
