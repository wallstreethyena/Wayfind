// scripts/check-event-approximate-location.mjs
//
// OWNER, 2026-10-14: seven wf_events rows have only a coarse city-level pin.
// "Keep it out of misleading map placement ... add an appropriate
// unresolved-location state ... make sure Wayfind does not pretend guessed
// coordinates are verified." Code-only: lib/eventLocation.js
// APPROXIMATE_LOCATION_EVENTS lists the reviewed ids (no DB column). Not verification_confidence.
//
// CALLED: isApproximateLocation, eventMapPoint, the real eventJsonLd and
// appleDirectionsUrl. Syntactic (comments stripped): every event map surface and
// the event page route through the helper.
import { readFileSync } from "node:fs";
import { isApproximateLocation, eventMapPoint, APPROXIMATE_LOCATION_EVENTS } from "../lib/eventLocation.js";
import { eventJsonLd } from "../lib/curatedEvents.js";
import { appleDirectionsUrl } from "../lib/placeWhere.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };

const LISTED = "fl26-sweet-season-farms-2026";
const base = { event_id: "x-unlisted-event", slug: "x", event_name: "Pumpkin Fest", venue: "Some Farm", address: "12 Farm Rd, Ocala, FL 34470", city: "Ocala", state: "FL", lat: 29.18, lng: -82.14, start_date: "2026-10-20", event_status: "scheduled" };
const approx = { ...base, event_id: LISTED };
const exact = base;
const unassessed = base;

// the list itself
const ids = Object.keys(APPROXIMATE_LOCATION_EVENTS);
ok(ids.length === 8, "exactly 8 approximate-location events are listed (got " + ids.length + ")");
ok(ids.every((k) => typeof APPROXIMATE_LOCATION_EVENTS[k] === "string" && APPROXIMATE_LOCATION_EVENTS[k].trim().length > 10), "every listed event carries a non-empty reason");
ok(Object.isFrozen(APPROXIMATE_LOCATION_EVENTS), "the list is frozen");

// helper: positive + negative controls
ok(isApproximateLocation(approx) === true, "a listed event is approximate");
ok(isApproximateLocation(exact) === false && isApproximateLocation(null) === false, "an unlisted event is not approximate");
ok(isApproximateLocation({ id: "wfc:" + LISTED }) === true && isApproximateLocation({ id: "wfc:x-unlisted-event" }) === false, "feed-card shaped row (id wfc:<event_id>) matches the list too");
ok(ids.every((k) => isApproximateLocation({ event_id: k })), "every listed id is approximate");
ok(eventMapPoint(approx) === null, "approximate row has NO map point");
const vero = { ...base, event_id: "vero-monster-mash-on-main-2026", lat: 27.638368, lng: -80.400605 };
ok(isApproximateLocation(vero) && eventMapPoint(vero) === null && vero.lat === 27.638368, "Vero's block anchor keeps distance ranking but never becomes an exact map point");
const pt = eventMapPoint(exact);
ok(pt && pt.lat === 29.18 && pt.lng === -82.14, "exact row keeps its point");
const pn = eventMapPoint(unassessed);
ok(pn && pn.lat === 29.18, "unassessed row behaves as before (point kept)");
ok(eventMapPoint({ ...exact, lat: null }) === null && eventMapPoint({ ...exact, lat: 0, lng: 0 }) === null && eventMapPoint(null) === null, "missing / 0,0 / null row has no point");
ok(approx.lat === 29.18, "coarse lat/lng stays on the row for distance ranking");

// JSON-LD: the real builder
const ldA = eventJsonLd(approx);
const ldE = eventJsonLd(exact);
ok(!("geo" in ldA.location), "approximate JSON-LD omits geo");
ok(ldA.location.address.streetAddress === "12 Farm Rd, Ocala, FL 34470" && ldA.location.address.addressLocality === "Ocala", "approximate JSON-LD keeps the address");
ok(ldE.location.geo && ldE.location.geo.latitude === 29.18 && ldE.location.geo["@type"] === "GeoCoordinates", "exact JSON-LD still carries geo");
ok(eventJsonLd(unassessed).location.geo, "unassessed JSON-LD still carries geo");

// directions: address text, never the coarse pin
const dA = appleDirectionsUrl(approx);
ok(dA && dA.includes(encodeURIComponent("12 Farm Rd, Ocala, FL 34470")) && !dA.includes("29.18"), "approximate directions use the address text");
const noAddr = appleDirectionsUrl({ ...approx, address: "" });
ok(noAddr === null || (!noAddr.includes("29.18") && noAddr.includes(encodeURIComponent("Some Farm"))), "approximate row with no address never sends the coarse coordinates");
ok(appleDirectionsUrl({ ...exact, address: "" }).includes("29.18,-82.14"), "exact row without an address still directs by coordinates (unchanged)");

// syntactic wiring, code only
const code = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const mapView = code("app/components/MapView.js");
const apple = code("lib/appleExplorerMap.js");
const mapScreen = code("app/components/screens/Map.js");
const page = code("app/florida-events/[slug]/page.js");
const cur = code("lib/curatedEvents.js");
const where = code("app/components/EventWhere.js");
ok(/const eventList = \(events \|\| \[\]\)\.filter\(\(e\) => e && eventMapPoint\(e\)\)/.test(mapView), "MapView event pins filter through eventMapPoint");
ok(/const nextEvents = Array\.isArray\(next\.events\) \? next\.events\.filter\(\(e\) => e && eventMapPoint\(e\)\)/.test(apple), "Apple map event annotations filter through eventMapPoint");
ok(/\(events \|\| \[\]\)\.filter\(\(e\) => eventMapPoint\(e\)/.test(mapScreen), "Map screen event list filters through eventMapPoint");
ok(/const mapPoint = eventMapPoint\(e\)/.test(page) && /lat=\{mapPoint \? mapPoint\.lat : NaN\}/.test(page) && /approximate=\{isApproximateLocation\(e\)\}/.test(page), "event page map point + approximate flag come from the helper");
ok(/const dirs = appleDirectionsUrl\(e\)/.test(page), "event page directions use appleDirectionsUrl, which drops an approximate pin");
ok(/if \(eventMapPoint\(e\)\) \{\s*node\.location\.geo/.test(cur), "eventJsonLd attaches geo only via eventMapPoint");
ok(/approximate \? <p [^>]*>\{APPROXIMATE_LOCATION_LINE\}<\/p>/.test(where), "EventWhere prints the one plain approximate-location line");
ok(!/location_precision|location_note/.test(cur), "no DB column is read for this (code-only)");
// Positive control for the probe: the retired un-gated geo line would be caught.
ok(!/if \(eventMapPoint\(e\)\) \{\s*node\.location\.geo/.test('if (e.lat != null && e.lng != null) {\n node.location.geo = 1;'), "positive control: the geo probe rejects the ungated line");

if (fail.length) {
  console.error("check-event-approximate-location: FAIL\n - " + fail.join("\n - "));
  process.exit(1);
}
console.log(`check-event-approximate-location: OK - ${pass} assertions (${ids.length} listed ids with reasons, real eventJsonLd + appleDirectionsUrl, 6 consumers wired)`);
