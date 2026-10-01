import assert from "node:assert/strict";
import { eventStays, selectEventStays, venueStayProximity } from "../lib/eventStays.js";

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
const ROOST = "ChIJRoostTampaExact001";
const stockRejected = await eventStays(origin, { readOwned: async () => [], readInventory: async () => [{ id: ROOST, displayName: { text: "ROOST Tampa" }, location: { latitude: 28.48, longitude: -81.47 }, types: ["hotel"], rating: 4.8, userRatingCount: 1000, photo_url: "https://images.pexels.com/photos/shared-hotel.jpg", photos: [{ name: `places/${ROOST}/photos/exact` }] }] });
assert.equal(stockRejected.places[0].photo, `/api/photo?ref=places%2F${ROOST}%2Fphotos%2Fexact&g=2&w=640`, "event Stays must reject a shared stock URL and retain the place-bound ref");
// Hotel resolver (lib/hotelImage.js): another property's photo ref is never used;
// the card falls to this property's own ?place= path instead.
const foreignRef = await eventStays(origin, { readOwned: async () => [], readInventory: async () => [{ id: ROOST, displayName: { text: "ROOST Tampa" }, location: { latitude: 28.48, longitude: -81.47 }, types: ["hotel"], rating: 4.8, userRatingCount: 1000, photos: [{ name: "places/ChIJSomeOtherHotel0001/photos/x" }] }] });
assert.equal(foreignRef.places[0].photo, `/api/photo?place=${ROOST}&g=2&w=640`, "a hotel card never shows another property's photo ref");
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

// VENUE-FIRST RANKING (2026-09-30). Real wf_inventory shape around Jannus Live,
// 16 2nd St N, St Petersburg: before this, pure score order sent the page to
// beach resorts 7 to 9 miles away while real hotels sat two blocks off.
{
  const jannus = { lat: 27.7722, lng: -82.6367 };
  const MI_LAT = 1 / 69;
  const at = (id, mi, wfScore, extra = {}) => ({ id, name: id, types: ["hotel", "lodging"], lat: jannus.lat + mi * MI_LAT, lng: jannus.lng, wfScore, ...extra });
  const pool = [
    at("hollander", 0.34, 93), at("hampton", 0.19, 90), at("hyatt-place", 0.09, 89), at("birchwood", 0.39, 89),
    at("avalon", 0.35, 89), at("the-1888", 0.35, 90), at("ponce", 0.20, 68), at("vinoy", 0.56, 89),
    at("the-saint-beach", 7.44, 97), at("inn-on-the-beach", 8.27, 95), at("plaza-beach", 7.28, 93),
    at("closed-inn", 0.05, 99, { status: "CLOSED_PERMANENTLY" }),
  ];
  const venue = selectEventStays(pool, jannus, 6, { rank: "venue" });
  assert.equal(venue.length, 6);
  assert.ok(venue.every((p) => p.distMi <= 3), `with six good stays within 3 mi, nothing farther is shown (got ${venue.map((p) => p.id + "@" + p.distMi.toFixed(1)).join(", ")})`);
  assert.ok(!venue.some((p) => p.id === "ponce"), "a stay under the quality floor never outranks ones that clear it");
  assert.ok(!venue.some((p) => p.id === "closed-inn"), "a permanently closed hotel is never recommended");
  assert.equal(venue[0].id, "hollander", "the best-reviewed walkable hotel leads");
  // The destination poster keeps its promised Wayfind Score order.
  const scoreOrder = selectEventStays(pool, jannus, 3);
  assert.deepEqual(scoreOrder.map((p) => p.id), ["the-saint-beach", "inn-on-the-beach", "hollander"], "default rank stays pure Wayfind Score order for the destination poster");
  // Sparse venue: when there are not enough close stays, farther good ones fill,
  // nearest-and-best first, and weak ones come last.
  const sparse = [at("far-good", 6, 92), at("mid-good", 2.5, 88), at("near-weak", 0.3, 65)];
  assert.deepEqual(selectEventStays(sparse, jannus, 6, { rank: "venue" }).map((p) => p.id), ["mid-good", "far-good", "near-weak"], "a thin venue still gets a ranked list, floor-clearing stays first");
  // The hard 3 mile rule, isolated: six floor-clearing stays at 2.8 mi must
  // hold off a 99 at 3.5 mi that would win on the blend alone.
  const edge = [...[1, 2, 3, 4, 5, 6].map((i) => at("edge-" + i, 2.8, 76)), at("just-past", 3.5, 99)];
  assert.ok(!selectEventStays(edge, jannus, 6, { rank: "venue" }).some((p) => p.id === "just-past"), "enough good stays within 3 mi means nothing past 3 mi, whatever its score");
  assert.ok(venueStayProximity(0.3) === 1 && venueStayProximity(3) < venueStayProximity(1), "proximity is flat inside a walk and decays after it");
}
console.log("event-stays PASS: venue geography, lodging identity, score order, dedupe, invalid origins, empty/error distinction, partial availability, inventory mapping");
