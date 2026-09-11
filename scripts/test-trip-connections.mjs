import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { ATTRACTION_DISCOVERY_IDS } from "../lib/attractionDiscovery.js";
import {
  selectAttractionConnections,
  tripConnections,
  withTripConnectionDeadline,
} from "../lib/tripConnections.js";

const orlando = { lat: 28.474, lng: -81.468 };
const raw = (id, name, extra = {}) => ({
  id,
  displayName: { text: name },
  location: { latitude: orlando.lat, longitude: orlando.lng },
  rating: 4.8,
  userRatingCount: 2000,
  types: ["tourist_attraction", "amusement_park"],
  businessStatus: "OPERATIONAL",
  ...extra,
});

const strong = raw(ATTRACTION_DISCOVERY_IDS[1], "Universal Studios Florida", { rating: 4.8, userRatingCount: 1000 });
const stronger = raw(ATTRACTION_DISCOVERY_IDS[2], "Universal's Islands of Adventure", { rating: 5, userRatingCount: 9000,
  location: { latitude: 28.52, longitude: -81.47 } });
const epic = raw(ATTRACTION_DISCOVERY_IDS[3], "Universal Epic Universe", { rating: 3.9, userRatingCount: 8000 });
const weakEvidence = raw(ATTRACTION_DISCOVERY_IDS[0], "Universal Orlando Resort", { rating: 4.8, userRatingCount: 499 });
const unknown = raw("ChIJ-unknown", "Invented Attraction");
const far = raw(ATTRACTION_DISCOVERY_IDS[4], "Kennedy Space Center", { location: { latitude: 28.57, longitude: -80.65 } });
const changedIdentity = raw(ATTRACTION_DISCOVERY_IDS[5], "Former Attraction Hotel", { types: ["hotel", "lodging"], primaryType: "hotel" });

const selected = selectAttractionConnections([strong, stronger, epic, weakEvidence, unknown, far, changedIdentity], orlando);
assert.deepEqual(selected.map((place) => place.id), [stronger.id, strong.id]);
assert.ok(selected.every((place) => place.distMi <= 12));
assert.ok(selected.every((place) => place.priceNum === null && place.priceLevel === null), "unknown admission must never be labelled Free");
assert.ok(selected[0].governed_score >= selected[1].governed_score, "the displayed score must govern order");

let reads = 0;
const invalid = await tripConnections({ placeId: strong.id, lat: 0, lng: 0 }, { readExact: async () => { reads++; return []; } });
assert.equal(invalid.invalid, true);
assert.equal(reads, 0);

let staysOrigin = null;
const attractionResult = await tripConnections({ placeId: epic.id, lat: orlando.lat + 0.005, lng: orlando.lng }, {
  readExact: async (ids, origin, radiusMi) => {
    assert.deepEqual(ids, [epic.id]);
    assert.equal(radiusMi, 2);
    return [epic];
  },
  readStays: async (origin) => { staysOrigin = origin; return { places: [{ id: "hotel-1" }], unavailable: false }; },
});
assert.equal(attractionResult.kind, "stays", "an exact low-rated flagship still offers nearby stays");
assert.deepEqual(staysOrigin, orlando, "the verified inventory point, not client coordinates, centers stays");

let coordinateFreeOrigin = null;
const coordinateFreeAttraction = await tripConnections({ placeId: epic.id }, {
  readExact: async (ids, origin, radiusMi) => {
    assert.deepEqual(ids, [epic.id]);
    assert.equal(radiusMi, 500);
    assert.ok(origin.lat >= 24 && origin.lat <= 31.1 && origin.lng >= -87.7 && origin.lng <= -79.8);
    return [epic];
  },
  readStays: async (origin) => { coordinateFreeOrigin = origin; return { places: [{ id: "hotel-2" }], unavailable: false }; },
});
assert.equal(coordinateFreeAttraction.kind, "stays");
assert.deepEqual(coordinateFreeOrigin, orlando, "an ID-only detail uses returned inventory coordinates for all distance work");

const hotel = raw("hotel-1", "Verified Resort", { types: ["hotel", "lodging"], primaryType: "hotel", location: { latitude: 28.48, longitude: -81.47 } });
let hotelCalls = 0;
const hotelResult = await tripConnections({ placeId: hotel.id, lat: 28.481, lng: -81.47 }, {
  readExact: async (ids, origin, radiusMi) => {
    hotelCalls++;
    if (hotelCalls === 1) { assert.deepEqual(ids, [hotel.id]); assert.equal(radiusMi, 2); return [hotel]; }
    assert.deepEqual(ids, ATTRACTION_DISCOVERY_IDS);
    assert.deepEqual(origin, { lat: 28.48, lng: -81.47 });
    assert.equal(radiusMi, 12);
    return [strong, epic];
  },
});
assert.equal(hotelResult.kind, "attractions");
assert.deepEqual(hotelResult.places.map((place) => place.id), [strong.id]);

const impostor = raw("cafe-1", "Not A Hotel", { types: ["cafe"], primaryType: "cafe" });
const impostorResult = await tripConnections({ placeId: impostor.id, ...orlando }, { readExact: async () => [impostor] });
assert.deepEqual(impostorResult.places, []);
let impostorReads = 0;
const coordinateFreeImpostor = await tripConnections({ placeId: impostor.id }, { readExact: async () => { impostorReads++; return [impostor]; } });
assert.deepEqual(coordinateFreeImpostor.places, []);
assert.equal(impostorReads, 1, "a non-lodging ID does not trigger an attraction follow-up read");
let partialReads = 0;
assert.equal((await tripConnections({ placeId: strong.id, lat: orlando.lat }, { readExact: async () => { partialReads++; return []; } })).invalid, true);
assert.equal(partialReads, 0);

const centerResult = await tripConnections({ mode: "attractions", ...orlando }, { readExact: async (ids, origin, radiusMi) => {
  assert.deepEqual(ids, ATTRACTION_DISCOVERY_IDS); assert.deepEqual(origin, orlando); assert.equal(radiusMi, 12); return [strong];
} });
assert.equal(centerResult.kind, "attractions");
assert.match(centerResult.description, /search area/);

await assert.rejects(withTripConnectionDeadline(new Promise(() => {}), 5), /deadline exceeded/);

// Query construction is intentionally coordinate + opaque ID only. A hotel
// name supplied by the browser must never become server identity evidence.
const component = fs.readFileSync(new URL("../app/components/TripConnections.js", import.meta.url), "utf8");
assert.match(component, /params\.set\("lat", String\(lat\)\).*params\.set\("lng", String\(lng\)\)/s);
assert.match(component, /params\.set\("id", id\)/);
assert.doesNotMatch(component, /params\.set\(["'](?:name|hotel|title)["']/);
assert.match(component, /controller\.abort/);

const repo = fileURLToPath(new URL("..", import.meta.url));
const componentModule = await loadComponent(fileURLToPath(new URL("../app/components/TripConnections.js", import.meta.url)), repo);
const { TripConnectionsContent, tripConnectionCardProps, tripConnectionsParams } = componentModule;
const openPlace = () => {};
const cardProps = tripConnectionCardProps(selected[0], 0, { kind: "attractions", onOpenPlace: openPlace });
assert.equal(cardProps.onOpen, openPlace, "an attraction card keeps the sheet callback");
assert.match(cardProps.rankingNote, /miles from the hotel/);
assert.equal(tripConnectionCardProps({ ...selected[0], mapsOnly: true }, 0, { onOpenPlace: openPlace }).onOpen, undefined);
assert.equal(tripConnectionsParams({ place: impostor, center: orlando }), null, "unrelated detail cards make no request");
const placeParams = tripConnectionsParams({ place: { ...hotel, lat: 28.48, lng: -81.47 }, center: { lat: 25, lng: -80 } });
assert.equal(placeParams.get("lat"), "28.48", "a supplied center cannot replace an actual detail point");
const idOnlyParams = tripConnectionsParams({ place: { id: epic.id, name: "Epic Universe", types: ["amusement_park"] } });
assert.equal(idOnlyParams.toString(), `id=${encodeURIComponent(epic.id)}`, "a canonical detail can request by opaque ID when its list row omitted coordinates");
assert.equal(tripConnectionsParams({ place: { id: epic.id, lat: orlando.lat } }), null, "partial detail coordinates are rejected");
assert.equal(tripConnectionsParams({ center: {}, mode: "attractions" }), null, "center mode still requires coordinates");

const { GET } = await import("../app/api/trip-connections/route.js");
for (const url of [
  "https://wayfind.test/api/trip-connections?id=x&lat=28",
  "https://wayfind.test/api/trip-connections?id=x&lat=bad&lng=-81",
  "https://wayfind.test/api/trip-connections?mode=attractions",
]) {
  const response = await GET(new Request(url));
  assert.equal(response.status, 400, `invalid coordinate shape rejects before inventory: ${url}`);
}

const readyHtml = renderToStaticMarkup(createElement(TripConnectionsContent, {
  state: { key: "hotel", status: "ready", places: [selected[0]], kind: "attractions", title: "Big days near Verified Resort", description: "Ticketed attractions within 12 miles of this hotel." },
  currentKey: "hotel", titleId: "connections-1", onOpenPlace: openPlace, onRetry: () => {},
}));
assert.match(readyHtml, /Big days near Verified Resort/);
assert.match(readyHtml, /miles from the hotel/);
assert.match(readyHtml, /role="listitem"/);
assert.equal(renderToStaticMarkup(createElement(TripConnectionsContent, {
  state: { key: "old-hotel", status: "ready", places: [selected[0]], kind: "attractions", title: "Old hotel", description: "Old result" },
  currentKey: "new-hotel", titleId: "connections-2",
})), "", "a stale response cannot flash for the next detail");
const failedHtml = renderToStaticMarkup(createElement(TripConnectionsContent, {
  state: { key: "hotel", status: "failed", places: [] }, currentKey: "hotel", titleId: "connections-3", onRetry: () => {},
}));
assert.match(failedHtml, /Nearby trip ideas couldn’t load/);
assert.match(failedHtml, />Retry</);

console.log("trip-connections PASS: exact/id-only identity, verified origin, strict radius, family floor, lawful order, client/API coordinate gates, callbacks, stale/failure render, deadlines");
