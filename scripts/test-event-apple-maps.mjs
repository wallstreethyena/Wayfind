#!/usr/bin/env node
// Runtime contract for the event-only MapKit JS session. The fake SDK mirrors
// MapKit JS 6's promise-returning service calls, so cancellation, stale
// responses, timeout handling, and teardown are exercised rather than inferred.
import assert from "node:assert/strict";
import { createAppleMapController } from "../lib/appleMapsRuntime.js";
import { formatDistance, formatDuration, routeSummary, validateRouteInput } from "../lib/appleEventRouting.js";
import { EVENT_MAP_FAMILY, eventMapFamily, eventMapGlyph, eventStayMapPins, mergeEventMapPlaces } from "../lib/eventMapPlaces.js";

const venue = { name: "Fixture Hall", lat: 27.3, lng: -82.5 };
const callbacks = [];
const searches = [];
const maps = [];
class FakeMap {
  constructor() { this.overlays = []; this.annotations = []; this.removed = false; this.showCalls = 0; maps.push(this); }
  addAnnotations(items) { this.annotations.push(...items); }
  addEventListener(name, fn) { this.listener = { name, fn }; }
  removeEventListener() { this.listener = null; }
  addOverlay(overlay) { this.overlays.push(overlay); }
  removeOverlay(overlay) { this.overlays = this.overlays.filter((x) => x !== overlay); }
  removeAnnotations(items) { const removing = new Set(items || []); this.annotations = this.annotations.filter((item) => !removing.has(item)); }
  showItems(items, options) { this.showCalls += 1; this.shown = items; this.showOptions = options; }
  destroy() { this.removed = true; }
}
class FakeCoordinate { constructor(latitude, longitude) { this.latitude = latitude; this.longitude = longitude; } }
class FakeAnnotation { constructor(coordinate, options) { this.coordinate = coordinate; Object.assign(this, options); } }
class FakePadding { constructor(top, right, bottom, left) { Object.assign(this, { top, right, bottom, left }); } }
class FakeDirections {
  route(request) { return new Promise((resolve, reject) => callbacks.push({ request, resolve, reject, directions: this })); }
  cancel(request) { this.cancelledRequest = request; }
}
FakeDirections.Transport = { Automobile: "Automobile" };
class FakeSearch {
  search(query) { return new Promise((resolve, reject) => searches.push({ query, resolve, reject, search: this })); }
  cancel(request) { this.cancelledRequest = request; }
}
const fakeKit = { Map: FakeMap, Coordinate: FakeCoordinate, MarkerAnnotation: FakeAnnotation, Directions: FakeDirections, Search: FakeSearch, Style: class Style { constructor(options) { Object.assign(this, options); } }, Padding: FakePadding };
let pass = 0;
const check = (condition, message) => { assert.ok(condition, message); pass += 1; };

check(validateRouteInput(" Sarasota ", venue).ok, "typed origin accepts a trimmed starting point");
check(!validateRouteInput("", venue).ok && !validateRouteInput({ lat: 0, lng: 0 }, venue).ok, "empty and zero origins are rejected");
check(formatDistance(1609.344) === "1.0 mi" && formatDuration(3900) === "1 hr 5 min", "distance and ETA formatting is stable");
check(routeSummary({ polyline: {}, distance: 1000, expectedTravelTime: 600 }).distanceLabel === "0.6 mi", "a route with geometry produces a display summary");
check(routeSummary({ distance: 1000, expectedTravelTime: 600 }) === null, "a route without geometry is rejected");

const stays = eventStayMapPins([
  { id: 7, name: "Exact stay", detailHref: "/p/7", lat: 27.4, lng: -82.4 },
  { id: "7", name: "Duplicate card", detailHref: "/p/duplicate", lat: 27.5, lng: -82.5 },
  { id: "no-coordinate", name: "Not rendered", detailHref: "/p/no-coordinate" },
]);
const merged = mergeEventMapPlaces([
  { id: "food", name: "Dinner", href: "/p/food", lat: 27.31, lng: -82.49, cat: "Restaurant" },
  { id: "food", name: "Duplicate nearby", href: "/p/duplicate", lat: 27.32, lng: -82.48, cat: "Restaurant" },
  { id: "7", name: "Nearby copy", href: "/p/nearby-7", lat: 27.4, lng: -82.4, cat: "To do" },
], stays);
check(stays.length === 1 && stays[0].id === "7" && stays[0].href === "/p/7" && stays[0].mapRank === 1, "hotel pins preserve the exact rendered card identity, href and order while deduping provider ID types");
check(merged.length === 2 && merged[0].id === "food" && merged[1].id === "7" && merged[1].href === "/p/7", "nearby and stay pins have one identity each, with the exact stay card winning an overlap");
check(eventMapFamily(merged[0]) === "food" && eventMapFamily({ cat: "Night out" }) === "drinks" && eventMapFamily({ cat: "To do" }) === "culture" && eventMapFamily(stays[0]) === "stay", "event category filters classify the same nearby and stay rows the map draws");
check(eventMapGlyph(stays[0]) === EVENT_MAP_FAMILY.stay.icon && EVENT_MAP_FAMILY.stay.color === "#0284C7" && EVENT_MAP_FAMILY.food.color === "#F97316" && EVENT_MAP_FAMILY.cafe.color === "#B45309", "event pin presentation matches the blue-bed, orange-food and brown-coffee reference families");

let selected = null; const errors = [];
const controller = createAppleMapController({ mapkit: fakeKit, container: {}, venue, picks: [{ id: "pick-1", name: "Nearby", lat: 27.31, lng: -82.49, cat: "Restaurant" }], onSelect: (id) => { selected = id; }, onError: (message) => errors.push(message) });
check(controller.map.annotations.length === 2 && controller.map.annotations[0].glyphText === EVENT_MAP_FAMILY.food.icon && controller.map.annotations[0].glyphColor === "#FFFFFF" && controller.map.annotations[0].color === EVENT_MAP_FAMILY.food.color && controller.map.annotations[1].glyphText === "★", "venue star and a white-on-orange food pictogram share one native Apple map");
controller.map.listener.fn({ annotation: controller.map.annotations[0] });
check(selected === "pick-1", "nearby annotation selection reaches the UI callback");

const first = controller.routeFromCoordinate({ lat: 27.4, lng: -82.4 });
const second = controller.routeFromCoordinate({ lat: 27.5, lng: -82.3 });
callbacks[0].resolve({ routes: [{ polyline: { id: "stale" }, distance: 1, expectedTravelTime: 1 }] });
await assert.rejects(first, /cancelled/);
check(callbacks[0].directions.cancelledRequest, "a superseded route request settles as cancelled and cancels its returned MapKit promise");
callbacks[1].resolve({ routes: [{ polyline: { id: "current", boundingMapRect: {} }, distance: 3218.688, expectedTravelTime: 3900 }] });
const current = await second;
check(current.distanceLabel === "2.0 mi" && current.etaLabel === "1 hr 5 min" && controller.map.overlays[0].id === "current" && controller.map.overlays[0].style.strokeColor === "#0F9F8A" && controller.map.shown[2].id === "current" && controller.map.showOptions.animate === true && controller.map.showOptions.padding instanceof FakePadding && controller.map.showOptions.padding.top === 60, "current route geometry, distance, ETA, MapKit stroke style, and real MapKit showItems fit options are applied to the same map");

const routeOverlay = controller.map.overlays[0];
const routeFitCalls = controller.map.showCalls;
controller.setPicks([
  { id: 22, name: "Blue stay", lat: 27.33, lng: -82.47, mapKind: "stay", mapRank: 1, cat: "Hotel" },
  { id: "22", name: "Duplicate stay", lat: 27.34, lng: -82.46, mapKind: "stay", mapRank: 2, cat: "Hotel" },
  { id: "coffee", name: "Coffee", lat: 27.32, lng: -82.48, primaryType: "coffee_shop" },
]);
const streamedStay = controller.map.annotations.find((annotation) => annotation.__wayfindId === "22");
check(controller.map.annotations.length === 3 && controller.map.annotations.some((annotation) => annotation.glyphText === "★") && !controller.map.annotations.some((annotation) => annotation.__wayfindId === "pick-1"), "setPicks replaces only place annotations, dedupes streamed IDs, and retains the venue");
check(streamedStay?.glyphText === EVENT_MAP_FAMILY.stay.icon && streamedStay?.glyphColor === "#FFFFFF" && streamedStay?.color === EVENT_MAP_FAMILY.stay.color, "a streamed hotel renders as the reference white-on-blue bed pin");
check(controller.map.overlays[0] === routeOverlay && controller.map.showCalls === routeFitCalls, "streamed hotel pins preserve the active route overlay and do not reset its fitted camera");
controller.map.listener.fn({ annotation: streamedStay });
check(selected === "22", "selection follows the normalized identity of a streamed pin");

const failing = controller.routeFromCoordinate({ lat: 27.4, lng: -82.4 });
callbacks[2].reject(new Error("quota"));
await assert.rejects(failing, /driving route/);
check(errors.length === 1, "provider route errors reach an honest visible error path");

const afterDestroy = controller.routeFromCoordinate({ lat: 27.4, lng: -82.4 });
const callbackCount = callbacks.length;
controller.destroy();
check(controller.map.removed && controller.map.listener === null, "destroy removes listeners, annotations, overlays, and map resources");
await assert.rejects(afterDestroy, /cancelled/);
callbacks[callbackCount - 1].resolve({ routes: [{ polyline: {}, distance: 10, expectedTravelTime: 10 }] });
await Promise.resolve();
check(errors.length === 1, "callbacks after unmount are ignored and their promise is cancelled");

const timeoutController = createAppleMapController({ mapkit: fakeKit, container: {}, venue, requestTimeoutMs: 1 });
const timedRoute = timeoutController.routeFromCoordinate({ lat: 27.4, lng: -82.4 });
await assert.rejects(timedRoute, /timed out/);
check(callbacks.at(-1).directions.cancelledRequest, "a directions promise that never settles times out and is passed to MapKit cancel");
const timedSearch = timeoutController.searchAndRoute("Sarasota");
await assert.rejects(timedSearch, /timed out/);
check(searches.at(-1).search.cancelledRequest, "a search promise that never settles times out and is passed to MapKit cancel");
timeoutController.destroy();

console.log(`test-event-apple-maps: OK — ${pass} assertions (category pins, exact/deduped card identity, streamed updates that preserve routes, MapKit JS 6 promises, cancellation, timeouts, and teardown)`);
