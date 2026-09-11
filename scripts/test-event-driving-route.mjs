#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { default: EventDrivingRoute, requestCurrentLocationRoute } = await loadComponent(path.join(root, "app/components/EventDrivingRoute.js"), root);
const html = renderToStaticMarkup(createElement(EventDrivingRoute, { venue: { name: "Test venue", lat: 27.3, lng: -82.5 }, mapController: null }));
assert.ok(html.includes("Starting city or address") && html.includes("Use my location"), "the real component renders its manual fallback and retry controls");

const tick = () => new Promise((resolve) => setImmediate(resolve));
const pendingGeo = () => {
  const calls = [];
  return {
    calls,
    getCurrentPosition(success, error, options) { calls.push({ success, error, options }); },
  };
};

let successes = [];
let errors = [];
const geo = pendingGeo();
const routes = [];
const controller = { routeFromCoordinate(point) { routes.push(point); return Promise.resolve({ distanceLabel: "1.0 mi", etaLabel: "5 min" }); } };
requestCurrentLocationRoute({ geolocation: geo, controller: null, onSuccess: () => {}, onError: () => {} });
assert.equal(geo.calls.length, 0, "GPS waits until the Apple map controller is ready");
requestCurrentLocationRoute({ geolocation: geo, controller, onSuccess: (value) => successes.push(value), onError: (value) => errors.push(value) });
assert.equal(geo.calls.length, 1, "a ready controller starts one browser geolocation request");
assert.deepEqual(geo.calls[0].options, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }, "GPS uses the bounded cached-position policy");
geo.calls[0].success({ coords: { latitude: 27.3, longitude: -82.5 } });
await tick();
assert.deepEqual(routes, [{ lat: 27.3, lng: -82.5 }], "the browser coordinate is sent directly to the Apple controller");
assert.equal(successes[0].distanceLabel, "1.0 mi", "the current route summary reaches the UI callback");

const staleGeo = pendingGeo();
const cancel = requestCurrentLocationRoute({ geolocation: staleGeo, controller, onSuccess: (value) => successes.push(value), onError: (value) => errors.push(value) });
cancel();
staleGeo.calls[0].success({ coords: { latitude: 1, longitude: 2 } });
staleGeo.calls[0].error(new Error("denied"));
await tick();
assert.equal(routes.length, 1, "a cancelled permission callback cannot route with a stale controller or venue");
assert.equal(errors.length, 0, "a cancelled permission failure cannot replace current UI state");

const throwingGeo = pendingGeo();
requestCurrentLocationRoute({
  geolocation: throwingGeo,
  controller: { routeFromCoordinate() { throw new Error("controller replaced"); } },
  onSuccess: (value) => successes.push(value),
  onError: (value) => errors.push(value),
});
throwingGeo.calls[0].success({ coords: { latitude: 3, longitude: 4 } });
await tick();
assert.match(errors.at(-1), /controller replaced/, "a synchronous controller rejection becomes a visible failure instead of escaping");

requestCurrentLocationRoute({ geolocation: null, controller, onSuccess: () => {}, onError: (value) => errors.push(value) });
assert.match(errors.at(-1), /Enter a starting point/, "missing or denied GPS preserves the manual starting-point fallback");

console.log("test-event-driving-route: OK — 9 assertions (controller readiness, auto GPS, bounded options, Apple handoff, cancellation, synchronous failure, manual fallback)");
