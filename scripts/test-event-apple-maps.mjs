#!/usr/bin/env node
// Runtime contract for the event-only MapKit JS session. The fake SDK mirrors
// MapKit JS 6's promise-returning service calls, so cancellation, stale
// responses, timeout handling, and teardown are exercised rather than inferred.
import assert from "node:assert/strict";
import { createAppleMapController } from "../lib/appleMapsRuntime.js";
import { formatDistance, formatDuration, routeSummary, validateRouteInput } from "../lib/appleEventRouting.js";

const venue = { name: "Fixture Hall", lat: 27.3, lng: -82.5 };
const callbacks = [];
const searches = [];
const maps = [];
class FakeMap {
  constructor() { this.overlays = []; this.annotations = []; this.removed = false; maps.push(this); }
  addAnnotations(items) { this.annotations.push(...items); }
  addEventListener(name, fn) { this.listener = { name, fn }; }
  removeEventListener() { this.listener = null; }
  addOverlay(overlay) { this.overlays.push(overlay); }
  removeOverlay(overlay) { this.overlays = this.overlays.filter((x) => x !== overlay); }
  removeAnnotations() { this.annotations = []; }
  showItems(items, options) { this.shown = items; this.showOptions = options; }
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

let selected = null; const errors = [];
const controller = createAppleMapController({ mapkit: fakeKit, container: {}, venue, picks: [{ id: "pick-1", name: "Nearby", lat: 27.31, lng: -82.49 }], onSelect: (id) => { selected = id; }, onError: (message) => errors.push(message) });
check(controller.map.annotations.length === 2 && controller.map.annotations[0].glyphText === "1" && controller.map.annotations[1].glyphText === "★", "venue and numbered nearby annotations share one map");
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

console.log(`test-event-apple-maps: OK — ${pass} assertions (MapKit JS 6 promises, cancellation, route geometry, formatting, errors, timeouts, and teardown)`);
