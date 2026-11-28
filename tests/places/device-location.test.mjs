import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { loadComponent } from "../../scripts/lib/jsxLoad.mjs";
import { createAppleMapController } from "../../lib/appleMapsRuntime.js";

const project = fileURLToPath(new URL("../../", import.meta.url));
const { default: Controls } = await loadComponent(path.join(project, "app/components/PlaceMapLocationControls.js"), project);
class Coordinate { constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); } }
class Annotation { constructor(coordinate, options) { Object.assign(this, { coordinate }, options); } }
class MapView {
  constructor(_, { center }) { this.center = center; this.annotations = []; this.moves = []; }
  addAnnotations(items) { this.annotations.push(...items); }
  removeAnnotations(items) { this.annotations = this.annotations.filter(item => !items.includes(item)); }
  setCenterAnimated(center, animated) { this.center = center; this.moves.push(animated); }
}
const mapkit = { Map: MapView, Coordinate, ImageAnnotation: Annotation };
const venue = { id: "venue", name: "Bakery", lat: 12, lng: 14 };

test("place map refresh and recenter use one fresh device fix and preserve venue and parking", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const old = new Map(["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const requests = [];
  let permission = "prompt";
  const geo = { getCurrentPosition(success, fail, options) { requests.push({ success, fail, options }); } };
  Object.assign(dom.window, { matchMedia: () => ({ matches: true }) });
  Object.defineProperty(dom.window.navigator, "geolocation", { value: geo });
  Object.defineProperty(dom.window.navigator, "permissions", { value: { query: async () => ({ state: permission }) } });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const controller = createAppleMapController({ mapkit, container: {}, venue, venueKind: "place" });
  const map = controller.map;
  const root = createRoot(document.getElementById("root"));
  const render = async (key) => act(async () => { root.render(React.createElement(Controls, { controller, key })); });
  const click = async (name) => act(async () => { [...document.querySelectorAll("button")].find(button => button.textContent === name).click(); });
  const fix = async (pending, lat, lng) => act(async () => { pending.success({ coords: { latitude: lat, longitude: lng } }); });
  const dot = () => map.annotations.filter(annotation => annotation.__wayfindOrigin);
  try {
    await render("initial");
    assert.equal(requests.length, 0, "a visit without prior permission does not prompt");
    assert.equal(controller.centerOnUserLocation(), false, "the venue never substitutes for the device");
    controller.setParkingMode(true, [{ id: "parking:garage", name: "Garage", lat: 12.01, lng: 14.01 }]);
    const nonUserPins = map.annotations.slice();
    assert.ok(nonUserPins.some(pin => pin.__wayfindId === "parking:garage"));
    await click("Refresh location");
    assert.deepEqual(requests[0].options, { maximumAge: 0, timeout: 10000, enableHighAccuracy: true });
    await fix(requests[0], 11, 13);
    assert.deepEqual(map.center, new Coordinate(12, 14), "refresh leaves the camera alone");
    assert.equal(dot().length, 1);
    await click("Center on me");
    await fix(requests[1], 10, 15);
    assert.deepEqual(map.center, new Coordinate(10, 15));
    assert.deepEqual(map.moves, [false], "recenter respects reduced motion");
    assert.equal(dot().length, 1, "a new fix replaces the previous pin");
    assert.deepEqual(map.annotations.filter(a => !a.__wayfindOrigin), nonUserPins);
    await click("Refresh location");
    await act(async () => requests[2].fail({ code: 1 }));
    assert.match(document.querySelector('[role="status"]').textContent, /blocked/);
    assert.equal(dot().length, 0);
    permission = "granted";
    await render("next map");
    assert.equal(requests.length, 4, "an existing grant permits the passive pin");
    await click("Refresh location");
    await fix(requests[4], 9, 16);
    await fix(requests[3], 8, 17);
    assert.deepEqual(dot()[0].coordinate, new Coordinate(9, 16), "a delayed passive callback cannot overwrite the refreshed pin");
    await click("Center on me");
    await act(async () => root.render(null));
    await fix(requests[5], 7, 18);
    assert.deepEqual(map.center, new Coordinate(10, 15), "a closed map ignores a late location result");
  } finally {
    await act(async () => root.unmount());
    controller.destroy();
    dom.window.close();
    for (const [key, previous] of old) { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key]; }
  }
});
