#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appleMapBounds, createAppleExplorerController } from "../lib/appleExplorerMap.js";

const componentSource = readFileSync(new URL("../app/components/AppleExplorerMap.js", import.meta.url), "utf8");
assert.match(componentSource, /dataRef\.current = \{ places, center, category, deviceLoc, events, selectedId, fit, rings, showOrigin, focus \}/, "component retains the newest async SDK startup inputs");
assert.match(componentSource, /controller\.focusOn\(latest\.focus, latest\.selectedId\)/, "a focus command arriving during SDK startup is applied after controller creation");
assert.match(componentSource, /\}, \[focus && focus\.ts\]\);/, "selection rerenders cannot replay a stale focus command");
assert.match(componentSource, /\[places, center, category, deviceLoc, eventsKey, fit, rings, showOrigin\]/, "equivalent event arrays cannot rebuild every native annotation after selection");

class Coordinate { constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }); } }
class CoordinateSpan { constructor(latitudeDelta, longitudeDelta) { Object.assign(this, { latitudeDelta, longitudeDelta }); } }
class CoordinateRegion { constructor(center, span) { Object.assign(this, { center, span }); } }
class Padding { constructor(top, right, bottom, left) { Object.assign(this, { top, right, bottom, left }); } }
class Style { constructor(options) { Object.assign(this, options); } }
class CircleOverlay { constructor(center, radius) { Object.assign(this, { center, radius }); } }
class MarkerAnnotation {
  constructor(coordinate, options) {
    this.coordinate = coordinate;
    this._selected = false;
    this._map = null;
    Object.assign(this, options);
  }
  get selected() { return this._selected; }
  set selected(value) {
    const next = Boolean(value);
    this._selected = next;
    if (next && this._map && this._map.listeners.has("select")) {
      this._map.listeners.get("select")({ annotation: this });
    }
  }
}
class Annotation { constructor(coordinate, factory, options) { this.coordinate = coordinate; this.factory = factory; Object.assign(this, options); } }
class FakeMap {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.region = options.region || new CoordinateRegion(options.center, new CoordinateSpan(0.4, 0.5));
    this.annotations = [];
    this.overlays = [];
    this.listeners = new Map();
  }
  addAnnotations(values) { for (const v of values) v._map = this; this.annotations.push(...values); }
  removeAnnotations(values) { for (const v of values) v._map = null; this.annotations = this.annotations.filter((item) => !values.includes(item)); }
  addOverlays(values) { this.overlays.push(...values); }
  removeOverlays(values) { this.overlays = this.overlays.filter((item) => !values.includes(item)); }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
  showItems(items, options) { this.shown = items; this.showOptions = options; }
  setCenterAnimated(center, animated) { this.focused = { center, animated }; }
  destroy() { this.destroyed = true; }
}
const mapkit = { Map: FakeMap, Coordinate, CoordinateSpan, CoordinateRegion, Padding, Style, CircleOverlay, ImageAnnotation: MarkerAnnotation, Annotation };

const places = Array.from({ length: 75 }, (_, index) => ({
  id: `p-${index}`,
  name: `Place ${index}`,
  // Numeric strings reproduce the marker-loss class: valid API coordinates
  // must not disappear merely because serialization preserved their type.
  lat: index === 0 ? "27.301" : 27.301 + index / 10000,
  lng: index === 0 ? "-82.501" : -82.501 - index / 10000,
  primaryType: index % 3 === 0 ? "pizza_restaurant" : index % 3 === 1 ? "coffee_shop" : "hotel",
  wfScore: index === 0 ? 91 : 93,
  governed_score: index === 0 ? 92 : 93,
}));
places.push({ id: "bad", name: "No coordinate", lat: "", lng: -82.5 });

let selected = null;
let selectedEvent = null;
let area = "unset";
const viewports = [];
const controller = createAppleExplorerController({
  mapkit, container: {}, center: { lat: 27.3, lng: -82.5 }, places,
  category: "food", deviceLoc: { lat: 27.3, lng: -82.5 },
  events: [{ id: "e-1", name: "Show", venue: "Hall", lat: 27.4, lng: -82.4 }],
  selectedId: "p-2", rings: true,
  onSelect: (place) => { selected = place; },
  onSelectEvent: (event) => { selectedEvent = event; },
  onAreaChange: (next) => { area = next; },
  onViewportChange: (bounds) => viewports.push(bounds),
});

assert.equal(controller.map.annotations.filter((a) => a.__wayfindId).length, 75, "the renderer keeps every valid result; it has no display cap");
assert.equal(controller.map.annotations.some((a) => a.__wayfindId === "bad"), false, "invalid coordinates are excluded");
assert.equal(controller.map.annotations.find((a) => a.__wayfindId === "p-0").coordinate.latitude, 27.301, "numeric-string coordinates remain visible");
assert.equal(controller.map.annotations.find((a) => a.__wayfindId === "p-2").selected, true, "selectedId reaches the native annotation");
assert.equal(selected, null, "initial programmatic selectedId does not fire user onSelect");
assert.equal(controller.map.annotations.find((a) => a.__wayfindId === "p-0").subtitle.startsWith("Wayfind 9.2/10"), true, "the qualifying annotation shows the governed 9.2 instead of its raw 9.1 score");
assert.match(controller.map.annotations.find((a) => a.__wayfindId === "p-0").accessibilityLabel, /score 9\.2 out of 10/, "the accessible label uses the same governed score as the visible subtitle");

const placePins = controller.map.annotations.filter((a) => a.__wayfindId);

// Sentry WAYFIND-12/1B/1C/1D/R: MapKit throws "undefined is not an object
// (evaluating 'e.width')" in positionForCallout when a selected pin's Apple
// callout is sized around an SVG data-URL image it cannot measure yet. No pin
// this controller creates (place, event, origin) may ask for a callout, and
// the selectedId pin (selected BEFORE it is added to the map) is the case that
// used to throw.
const imageAnnotations = controller.map.annotations.filter((a) => a instanceof MarkerAnnotation && !(a.factory));
assert.ok(imageAnnotations.length >= 77, `probe finds the place, event and origin annotations (found ${imageAnnotations.length})`);
assert.ok(imageAnnotations.some((a) => a.__wayfindId) && imageAnnotations.some((a) => a.__wayfindEvent) && imageAnnotations.some((a) => a.title === "Your location"), "probe covers a place, an event and the origin pin");
assert.ok(imageAnnotations.every((a) => a.calloutEnabled === false), "no ImageAnnotation asks Apple Maps to position a callout it cannot measure");
assert.equal(controller.map.annotations.find((a) => a.__wayfindId === "p-2").calloutEnabled, false, "the pin selected before it reaches the map has no callout");
assert.ok(placePins.every((a) => a.image?.[1]?.startsWith("data:image/svg+xml")), "every place pin uses the shared vector teardrop");
assert.equal(new Set(placePins.slice(0, 3).map((a) => a.image[1])).size, 3, "restaurant, cafe and stay pins retain distinct vector category designs");
assert.ok(placePins.every((a) => a.clusteringIdentifier === "wayfind-places"), "all result annotations participate in native clustering");

assert.deepEqual(controller.map.overlays.map((o) => Math.round(o.radius / 1609.344)), [5, 10, 15, 20], "the fixed 5/10/15/20-mile scale is rendered with native overlays");
assert.ok(controller.map.overlays.every((o) => o.style instanceof Style && o.style.strokeColor === "#F97316"), "rings have a visible native MapKit style");
const ringLabels = controller.map.annotations.filter((a) => /mile distance ring/.test(a.accessibilityLabel || ""));
assert.equal(ringLabels.length, 4, "every distance ring has an accessible 5/10/15/20-mile label");
assert.deepEqual(ringLabels.map((a) => a.accessibilityLabel), ["5 mile distance ring", "10 mile distance ring", "15 mile distance ring", "20 mile distance ring"], "ring labels preserve the fixed scale");
assert.deepEqual(controller.map.padding, new Padding(150, 68, 150, 12), "native MapKit content is inset clear of overlay controls and drawers");

controller.map.listeners.get("select")({ annotation: placePins[1] });
assert.equal(selected.id, "p-1", "select returns the original place object");
const eventPin = controller.map.annotations.find((a) => a.__wayfindEvent);
controller.map.listeners.get("select")({ annotation: eventPin });
assert.equal(selectedEvent.id, "e-1", "event selection remains independently routed");
controller.map.listeners.get("select")({ annotation: { memberAnnotations: [placePins[0], placePins[1]] } });
assert.deepEqual(controller.map.shown, [placePins[0], placePins[1]], "tapping a native cluster asks MapKit to reveal all members");
controller.map.listeners.get("select")({ annotation: { memberAnnotations: [placePins[0], { ...placePins[1], coordinate: placePins[0].coordinate }] } });
assert.equal(selected.id, "p-0", "an exact-coordinate cluster opens a member whose shared list can page through co-located results");

await new Promise((resolve) => setTimeout(resolve, 1));
assert.equal(viewports.length, 1, "the initial settled viewport is reported even before a user pans");
assert.deepEqual(viewports[0], { north: 27.66, south: 26.94, east: -82.08, west: -82.92 }, "viewport bounds come from MapKit's achieved region");
assert.equal(area, null, "the initial region does not offer a redundant area search");

controller.map.region = new CoordinateRegion(new Coordinate(27.4, -82.5), new CoordinateSpan(0.2, 0.3));
controller.map.listeners.get("region-change-end")();
assert.deepEqual(area, { lat: 27.4, lng: -82.5, bounds: { north: 27.5, south: 27.299999999999997, east: -82.35, west: -82.65 } }, "a settled pan reports center and the same achieved bounds");
assert.equal(viewports.length, 2, "every settled viewport reaches the area data callback");

controller.focusOn({ lat: 27.9, lng: -82.1 }, "p-4");
assert.equal(controller.map.focused.center.latitude, 27.9, "focus moves the native camera without rebuilding annotations");
assert.equal(controller.map.annotations.find((a) => a.__wayfindId === "p-4").selected, true, "focus selects the matching result");
assert.equal(selected.id, "p-0", "programmatic focusOn selection does not re-trigger user onSelect");
controller.selectId("p-7");
const pin7 = controller.map.annotations.find((a) => a.__wayfindId === "p-7");
assert.equal(pin7.selected, true, "selection updates in place without rebuilding the full annotation set");
assert.equal(selected.id, "p-0", "programmatic selectId (hover highlight) does not fire user onSelect even when MapKit dispatches select inside the selected setter");
assert.match(decodeURIComponent(pin7.image[1]), />9\.3<\/text>/, "in-place selection preserves the Score Pill Pin SVG text");
assert.equal(pin7.calloutEnabled, false, "native MapKit callout is disabled on SVG data-URL pins");

const clusterAnn = controller.map.annotationForCluster({
  coordinate: new Coordinate(27.3, -82.5),
  memberAnnotations: [placePins[0], placePins[1], placePins[2]],
});
assert.ok(clusterAnn, "annotationForCluster returns a custom cluster badge for 2+ members");
assert.equal(clusterAnn.calloutEnabled, false, "cluster annotation disables native callout");
assert.match(decodeURIComponent(clusterAnn.image[1]), />3<\/text>/, "cluster badge displays the active member count");
assert.equal(controller.map.annotationForCluster({ memberAnnotations: [placePins[0]] }), null, "single member does not produce a cluster badge");

// Annotation diffing verification: unchanged places keep their exact annotation instance,
// while coordinate, category, or score changes replace the annotation cleanly, and
// updated place objects with identical signatures update the selection callback payload.
const retainedPin0 = controller.map.annotations.find((a) => a.__wayfindId === "p-0");
const retainedPin1 = controller.map.annotations.find((a) => a.__wayfindId === "p-1");
const updatedPlace0 = { ...places[0], extraTag: "fresh-payload" };
const movedPlace1 = { ...places[1], lat: 27.355 };
const rescoredPlace2 = { ...places[2], governed_score: 98, wfScore: 98 };
const recategorizedPlace3 = { ...places[3], primaryType: "bar", category: "nightlife" };
const addedPlace = { id: "p-added", name: "Added Place", lat: 27.31, lng: -82.51, primaryType: "bakery", governed_score: 95, wfScore: 95 };
const unscoredPlace = { id: "p-noscore", name: "Unscored Place", lat: 27.32, lng: -82.52, primaryType: "park" };

controller.update({
  center: { lat: 27.3, lng: -82.5 },
  places: [updatedPlace0, movedPlace1, rescoredPlace2, recategorizedPlace3, addedPlace, unscoredPlace],
  category: "food",
  rings: false,
  showOrigin: false,
  fit: true,
});
assert.equal(controller.map.annotations.length, 6, "updates keep exact active count and remove omitted annotations");
assert.equal(controller.map.annotations.find((a) => a.__wayfindId === "p-0"), retainedPin0, "unchanged place retains the exact native annotation instance without flicker");
controller.map.listeners.get("select")({ annotation: retainedPin0 });
assert.equal(selected.extraTag, "fresh-payload", "retaining an annotation updates its bound place payload so stale data is never returned");
assert.notEqual(controller.map.annotations.find((a) => a.__wayfindId === "p-1"), retainedPin1, "moved coordinate replaces the annotation");
assert.equal(controller.map.annotations.find((a) => a.__wayfindId === "p-1").coordinate.latitude, 27.355, "moved annotation uses the new coordinate");
assert.match(decodeURIComponent(controller.map.annotations.find((a) => a.__wayfindId === "p-2").image[1]), />9\.8<\/text>/, "changed score updates the Score Pill Pin SVG");
assert.equal(controller.map.annotations.find((a) => a.__wayfindId === "p-3").__wayfindFamily, "drinks", "changed category updates the marker family");
assert.ok(controller.map.annotations.find((a) => a.__wayfindId === "p-added"), "newly added place is mounted");
const unscoredPin = controller.map.annotations.find((a) => a.__wayfindId === "p-noscore");
assert.equal(unscoredPin.__wayfindScore, null, "missing score receives null score fallback");
assert.match(decodeURIComponent(unscoredPin.image[1]), /viewBox="0 0 34 46"/, "missing score falls back cleanly to the standard teardrop pin");

controller.update({ center: { lat: 27.35, lng: -82.45 }, places: [{ ...places[3], id: "p-new" }, ...places.slice(0, 2)], category: "food", rings: false, showOrigin: true, fit: false });
assert.ok(controller.map.annotations.filter((a) => a instanceof MarkerAnnotation && !a.factory).every((a) => a.calloutEnabled === false), "annotations added by a later update (new place, new origin) also have no callout");
controller.update({ center: { lat: 27.3, lng: -82.5 }, places: places.slice(0, 2), category: "food", rings: false, showOrigin: false, fit: true });
assert.equal(controller.map.annotations.length, 2, "updates replace stale annotations instead of accumulating them");
assert.equal(controller.map.overlays.length, 0, "updates remove obsolete rings");
assert.equal(controller.map.shown.length, 2, "explicit fit frames the current annotations");

// A PROGRAMMATIC FIT IS NOT A PAN (2026-11-03, synthetic monitor red since #2079
// shipped 2026-10-31 22:44Z). showItems frames the list's pins; the settled
// center may sit miles from the search origin. That settle must NOT raise
// "Search this area" (it also hides the unpinned note), and a later real pan is
// measured from the FITTED center.
area = "unset";
controller.map.region = new CoordinateRegion(new Coordinate(27.9, -82.9), new CoordinateSpan(0.2, 0.3)); // far from the 27.3/-82.5 origin
controller.map.listeners.get("region-change-end")();
assert.equal(area, null, "the settle after a programmatic list fit never offers an area search");
controller.map.region = new CoordinateRegion(new Coordinate(27.905, -82.905), new CoordinateSpan(0.2, 0.3)); // a nudge well under the move threshold
controller.map.listeners.get("region-change-end")();
assert.equal(area, null, "a sub-threshold nudge after the fit still does not offer");
controller.map.region = new CoordinateRegion(new Coordinate(28.4, -82.9), new CoordinateSpan(0.2, 0.3)); // ~35 mi north of the fitted center
controller.map.listeners.get("region-change-end")();
assert.equal(area && area.lat, 28.4, "a real pan away from the FITTED center offers the area search");
controller.update({ center: { lat: 27.3, lng: -82.5 }, places: places.slice(0, 2), category: "food", rings: false, showOrigin: false, fit: false });
controller.map.region = new CoordinateRegion(new Coordinate(27.9, -82.9), new CoordinateSpan(0.2, 0.3));
controller.map.listeners.get("region-change-end")();
assert.equal(area && area.lat, 27.9, "leaving fit mode measures pans from the search origin again");

const selectListener = controller.map.listeners.get("select");
const selectedBeforeDestroy = selected;
controller.destroy();
assert.equal(controller.map.destroyed, true, "teardown destroys MapKit");
assert.equal(controller.map.annotations.length, 0, "teardown removes annotations");
assert.equal(controller.map.listeners.size, 0, "teardown removes selection and viewport listeners");
selectListener({ annotation: placePins[0] });
assert.equal(selected, selectedBeforeDestroy, "late native callbacks after teardown are inert");

assert.equal(appleMapBounds({ region: null }), null, "bounds fail closed until MapKit has a real region");
console.log("test-apple-explorer-map: OK — full result set, numeric coordinates, score pills, diffing, clustering, rings, selection, viewport reporting, focus, updates, and teardown");
