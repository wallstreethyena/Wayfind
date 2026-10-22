// Lock for scripts/reconcile-list-map-live.mjs (pure part; no browser, no network).
// Positive controls: a drawable place pinned, a place pinned inside a cluster, an
// expired verdict reported as unverified even though the shipped verdict said ok,
// a below-floor place with a verified coordinate, an API-only place kept out of
// the list. Negative control: breaking the join (dropping the mapList statuses)
// must make the unaccounted counter move, so the assertion can go red.
import assert from "node:assert/strict";
import { reconcile, renderTable } from "./reconcile-list-map-live.mjs";
import { mapCoordVerdict } from "../lib/coordProvenance.js";

const now = Date.parse("2026-10-22T12:00:00Z");
// Verdicts come from the REAL lib/coordProvenance.js (not hand-written shapes):
// a Google coordinate observed N days before `at` ships an ok verdict whose
// `until` is observed + 30 d.
const verdictAt = (observedIso, at) => mapCoordVerdict({ lat: 27.5, lng: -82.4, refreshed_at: observedIso }, at);
const ok = (until) => verdictAt(new Date(Date.parse(until) - 30 * 86400000).toISOString(), Date.parse(until) - 86400000);
const listPlaces = [
  { id: "A", displayName: { text: "Pinned Alone" }, mapCoord: ok("2026-11-01T00:00:00Z") },
  { id: "B", displayName: { text: "Pinned In Cluster" }, mapCoord: ok("2026-11-01T00:00:00Z") },
  { id: "C", displayName: { text: "Expired Since Response" }, mapCoord: ok("2026-10-20T00:00:00Z") },
  { id: "D", displayName: { text: "Below Floor" }, mapCoord: ok("2026-11-01T00:00:00Z") },
  { id: "E", displayName: { text: "No Coordinate" }, mapCoord: mapCoordVerdict({ lat: 27.5, lng: -82.4, refreshed_at: "2026-08-01T00:00:00Z" }, now) },
  { id: "F", displayName: { text: "API only" }, mapCoord: ok("2026-11-01T00:00:00Z") },
];
const mapList = {
  listIds: ["A", "B", "C", "D", "E"],
  pinned: ["A", "B"],
  unmapped: [{ id: "C", status: "no-permitted-coordinate" }, { id: "D", status: "below-map-floor" }, { id: "E", status: "no-permitted-coordinate", apple: "not-checked" }],
};
const clusters = { measured: true, renderer: "mapkit", method: "estimated-by-screen-overlap", clusteredPlaceIds: ["B"], markers: 1, clusterMarkers: 1, placesInClusters: 1 };
const r = reconcile({ listPlaces, renderedIds: ["A", "B", "C", "D", "E"], mapPinIds: ["A", "B", "Z"], appleRecoveredIds: [], mapList, clusters, now });
const s = r.summary;
assert.equal(s.list, 5, "list = rendered/app list, not the wider API payload");
assert.equal(s.apiReturned, 6); assert.equal(s.apiOnlyNotInList, 1);
assert.equal(s.verifiedCoords, 3, "A, B, D verified now; C's shipped ok has expired; E never had one");
assert.equal(s.onMap, 2); assert.equal(s.onMapDrawnAsOwnMarker, 1); assert.equal(s.onMapInsideClusters, 1);
assert.deepEqual(s.excludedByReason, { "no-permitted-coordinate": 2, "below-map-floor": 1 });
assert.equal(s.verifiedButNotOnMap, 1, "D: verified coordinate, not drawn (below floor)");
assert.equal(s.mapPinsOutsideList, 1); assert.deepEqual(r.mapPinsOutsideList, ["Z"]);
assert.equal(s.unaccountedListPlaces, 0);
const byId = Object.fromEntries(r.rows.map((x) => [x.id, x]));
assert.equal(byId.C.verifiedCoord, false); assert.equal(byId.C.shippedOk, true);
assert.equal(byId.E.coordWhy, "coordinate-expired");
assert.equal(byId.C.shippedOk, true, "the shipped verdict was ok when cached");
// negative control: without the app's statuses the unpinned places are unaccounted
const broken = reconcile({ listPlaces, renderedIds: ["A", "B", "C", "D", "E"], mapPinIds: ["A", "B"], mapList: null, clusters, now });
assert.equal(broken.summary.unaccountedListPlaces, 3, "negative control: the check can go red");
const table = renderTable([{ scenario: "t", viewport: "390x844", summary: s }]);
assert.ok(/below-map-floor:1/.test(table) && /no-permitted-coordinate:2/.test(table));
console.log("reconcile-list-map-live: all assertions OK (join, expiry re-check, clusters, API-only, negative control)");
