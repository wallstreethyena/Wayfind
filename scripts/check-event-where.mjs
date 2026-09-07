#!/usr/bin/env node
// check-event-where — v8.99 (owner, 2026-09-06, on the 3 Daughters Oktoberfest
// page): "the events page does not have the address nor the website for the
// place … a map … the direction already mapped out … based on the users
// current location … the recommendation of nearby worth it … in the map …
// this will be the rule globally to every event page".
//
// Pins four things:
//   1. addressLine PRINTS THE TOWN. wf_events stores the street in `address`
//      and the town in `city` (103 of 133 live street lines carried no city);
//      "222 22nd St S" on its own is not an address anyone can drive to.
//   2. directionsUrl sends the FULL line to Maps, never a bare street.
//   3. BOTH event pages render the one shared <EventWhere> block, and that
//      block draws the map only with real coordinates, never Null Island.
//   4. THE MAP USES APPLE MAPKIT JS: the public token is domain-restricted,
//      routing is an explicit user action, real Apple road geometry is drawn on
//      the same map as the venue/picks, and no public demo router or paid Google
//      route API can return through a side door.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addressLine, directionsUrl, websiteUrl, websiteHost } from "../lib/placeWhere.js";
import { eventWebsiteUrl } from "../lib/curatedEvents.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// 1. the human line carries the town
const three = { venue: "3 Daughters Brewing", address: "222 22nd St S", city: "St. Petersburg", state: "FL", lat: 27.7691667, lng: -82.6627778, place_id: "ChIJ28aBEDHiwogRzv5VMM80mE0" };
ok(addressLine(three) === "222 22nd St S, St. Petersburg, FL", `street-only row prints street + town (got ${JSON.stringify(addressLine(three))})`);
const mobius = { venue: "Möbius Sarasota", address: "2211 Whitfield Park Loop, Ste 101, Sarasota, FL 34243", city: "Sarasota", state: "FL" };
ok(addressLine(mobius) === mobius.address, "a full postal line is left exactly as stored (no doubled town)");
ok(addressLine({ city: "Tampa", state: "FL" }) === "Tampa, FL", "no street -> City, ST, as before");
ok(addressLine({ address: "1 Main St" }) === "1 Main St", "street with no town stays the street (never invents one)");
ok(addressLine(null) === "" && addressLine({}) === "", "nothing in -> empty string, never a throw");

// 2. directions carry the town too
const dir = directionsUrl({ address: "222 22nd St S", city: "St. Petersburg", state: "FL" });
ok(dir && /destination=222\+22nd\+St\+S%2C\+St\.\+Petersburg%2C\+FL/.test(dir), `Maps gets the full line, not a bare street (got ${dir})`);
ok(directionsUrl(three).includes("destination_place_id=ChIJ28aBEDHiwogRzv5VMM80mE0"), "a place id still wins the ladder");

// website gate
ok(websiteUrl({ url: "https://www.3dbrewing.com/events/" }) === "https://www.3dbrewing.com/events/", "https website passes");
ok(websiteUrl({ url: "javascript:alert(1)" }) === null && websiteUrl({ url: "notaurl" }) === null && websiteUrl(null) === null, "junk never becomes a button");
ok(websiteHost("https://www.3dbrewing.com/events/") === "3dbrewing.com", "button caption is the bare host");
ok(eventWebsiteUrl({ official_event_url: "https://organiser.example/x", official_ticket_url: "https://tickets.example/y", link_ok: true }) === "https://organiser.example/x", "Official site prefers the organiser page over the ticket vendor");
ok(eventWebsiteUrl({ official_event_url: "https://organiser.example/x", link_ok: false }) === "", "a row the link-health sweep marked bad gets no website button (hijacked-domain rule)");

// 3. both pages, one block
const fl = read("app/florida-events/[slug]/page.js");
const live = read("app/events/[city]/[slug]/page.js");
const where = read("app/components/EventWhere.js");
const map = read("app/components/EventVenueMap.js");
const appleRuntime = read("lib/appleMapsRuntime.js");
ok(/import EventWhere from/.test(fl) && /<EventWhere/.test(fl), "/florida-events/[slug] renders <EventWhere>");
ok(/import EventWhere from/.test(live) && /<EventWhere/.test(live), "/events/[city]/[slug] renders <EventWhere>");
ok(/website=\{site\}/.test(fl) && /website=\{site\}/.test(live), "both pages hand the gated website to the block");
ok(/eventWebsiteUrl\(e\)/.test(fl), "the curated page gates the website through eventWebsiteUrl");
ok(/!isTicketmasterFamily\(external\)/.test(live), "the live page never hands a Ticketmaster affiliate URL to the plain website button (founder P0)");
ok(/Official site/.test(where) && /Get directions/.test(where), "the block carries both buttons: directions and official site");
ok(/!\(lat === 0 && lng === 0\)/.test(where), "the block refuses Null Island (0,0) as a venue point");
ok(/pins\.length\s*>\s*0/.test(where), "nearby shelf only renders with pins");
ok(!/\/\*/.test(where.slice(where.indexOf("const CSS"), where.indexOf("`;", where.indexOf("const CSS")))), "no block comments inside the shipped CSS template (check-css-comment-bytes rule)");
ok(!/\/\*/.test(map.slice(map.indexOf("const CSS"), map.indexOf("`;", map.indexOf("const CSS")))), "no block comments inside the map's shipped CSS template");

// 4. the map is free, keyed to nothing, sends the reader nowhere, and keeps
//    the pin vocabulary
ok(!/maps\.googleapis\.com|google\.maps|@googlemaps/.test(map), "the event map never loads Google Maps JS (spend law)");
ok(/cdn\.apple-mapkit\.com/.test(appleRuntime) && /NEXT_PUBLIC_APPLE_MAPS_TOKEN/.test(map), "event maps load MapKit JS with the domain-restricted public token env");
ok(!/maplibre|openfreemap/i.test(map), "event maps no longer use the event-only MapLibre/OpenFreeMap surface");
// PR #1129 review (2026-09-06): the first cut routed through the public OSRM
// demo server — non-commercial terms, 1 req/s, no uptime promise — and shipped
// the reader's GPS point to it. A public demo router is never a production
// dependency, and the reader's coordinates leave the browser for nothing but
// Wayfind's own /api/geo. Scanned across ALL app code and the CSP, not just
// this component, so the host cannot come back through a side door.
const DEMO_ROUTERS = /router\.project-osrm\.org|valhalla1?\.openstreetmap\.de|api\.openrouteservice\.org|routing\.openstreetmap\.de|graphhopper\.com\/api|nominatim\.openstreetmap\.org/i;
const appFiles = [];
(function walk(d) {
  for (const f of readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    const rel = path.join(d, f.name);
    if (f.isDirectory()) walk(rel);
    else if (/\.(js|mjs|jsx|ts|tsx)$/.test(f.name)) appFiles.push(rel);
  }
})("app");
for (const f of [...appFiles, "lib/placeWhere.js", "lib/eventPairings.js", "next.config.js", "middleware.js"]) {
  ok(!DEMO_ROUTERS.test(read(f)), `${f} references a public demo routing/geocoding host — not a production dependency (PR #1129 review)`);
}
ok(!/\/route\/v1\/|geometries=geojson|router\.project-osrm/.test(map), "the map does not invent or call a public routing endpoint");
ok(!/getCurrentPosition/.test(map), "nearby map never asks for location automatically");
const driving = read("app/components/EventDrivingRoute.js");
ok(/onClick=\{showLocation\}/.test(driving) && /Use my location/.test(driving) && /searchAndRoute/.test(driving), "Apple driving preview requires an explicit location or typed starting point action");
ok(/event-route/.test(driving) && /distanceLabel/.test(driving) && /etaLabel/.test(driving), "route controls expose a stable in-page target and Apple distance/ETA summary");
ok(/starting point is shared with Apple/.test(driving), "route controls disclose sharing the opted-in starting point with Apple");
ok(/prefers-reduced-motion/.test(read("app/components/EventRouteJump.js")), "in-page route jump respects reduced-motion preference");
ok(/The map preview is unavailable right now/.test(map) && !/The .*token/i.test(map), "reader-facing map fallback does not expose configuration jargon");
ok(/Numbered teal pins/.test(where), "map legend describes the actual nearby pins");
ok(/glyphText: "★"/.test(read("lib/appleMapsRuntime.js")) && /glyphText: String\(i \+ 1\)/.test(read("lib/appleMapsRuntime.js")), "venue star and numbered nearby pins remain distinct");
ok(/createAppleMapController/.test(map) && /destroy\(\)/.test(read("lib/appleMapsRuntime.js")), "the MapKit session is torn down on unmount");
ok(/routeSummary/.test(read("lib/appleMapsRuntime.js")) && /polyline/.test(read("lib/appleMapsRuntime.js")), "Apple route responses require real polyline geometry");
const csp = read("next.config.js");
ok(!/osrm/i.test(csp), "the CSP carries no routing host in any directive");
const pair = read("lib/eventPairings.js");
ok(/lat: r\.lat,\s*\n\s*lng: r\.lng,/.test(pair), "eventPairings keeps lat/lng so the picks can be pinned");

if (fail.length) {
  console.error(`check-event-where: FAIL — ${fail.length} of ${pass + fail.length} assertions`);
  for (const f of fail) console.error("  FAIL: " + f);
  process.exit(1);
}
console.log(`check-event-where: OK — ${pass} assertions (address carries the town, both event pages share one Where block with a free map, nearby pins and a separately consented driving preview).`);
