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
import { addressLine, directionsUrl, appleDirectionsUrl, websiteUrl, websiteHost } from "../lib/placeWhere.js";
import { describeAppleMapsToken, appleMapsTokenHealth, appleMapsTokenUsable, APPLE_MAPS_TOKEN_WARN_DAYS } from "../lib/appleMapsToken.js";
import { eventWebsiteUrl } from "../lib/curatedEvents.js";
import { mapPinSvg } from "../lib/mapPinStandard.js";
import { EVENT_MAP_FAMILY } from "../lib/eventMapPlaces.js";

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

// 2b. APPLE, PERMANENTLY (owner, 2026-09-08). The event pages' outbound link is
//     the Apple ladder: full line first, coordinate second, venue+town third,
//     null when nothing honest exists. Same rules, different map.
const appleDir = appleDirectionsUrl({ address: "222 22nd St S", city: "St. Petersburg", state: "FL" });
ok(appleDir === "https://maps.apple.com/?daddr=222%2022nd%20St%20S%2C%20St.%20Petersburg%2C%20FL&dirflg=d", `Apple gets the full street + town line as daddr with driving preselected (got ${appleDir})`);
const appleCoord = appleDirectionsUrl({ venue: "Coachman Park", city: "Clearwater", state: "FL", lat: 27.9659, lng: -82.8001 });
ok(appleCoord === "https://maps.apple.com/?daddr=27.9659,-82.8001&dirflg=d&q=Coachman%20Park", `no street -> the coordinate pair with a literal comma, labelled with the venue (got ${appleCoord})`);
ok(appleDirectionsUrl({ venue: "Somewhere", city: "Tampa", state: "FL" }) === "https://maps.apple.com/?daddr=Somewhere%2C%20Tampa%2C%20FL&dirflg=d&q=Somewhere", "venue + town is the floor");
ok(appleDirectionsUrl({ venue: "Only a name" }) === null && appleDirectionsUrl({ lat: 0, lng: 0, venue: "Null", city: "Island" }) !== null && !appleDirectionsUrl({ lat: 0, lng: 0, venue: "Null" }), "no destination -> null (no button); Null Island is never a coordinate destination");
ok(!/google\./.test(appleDirectionsUrl(three)), "the Apple link never carries a Google host");

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
ok(/appleDirectionsUrl\(e\)/.test(fl) && /appleDirectionsUrl\(e\)/.test(live), "BOTH event pages build their directions href with appleDirectionsUrl (Apple permanently, owner 2026-09-08)");
ok(!/[^a-zA-Z]directionsUrl\(/.test(fl) && !/[^a-zA-Z]directionsUrl\(/.test(live), "neither event page calls the Google directions ladder any more");
const driving0 = read("app/components/EventDrivingRoute.js");
ok(/Open in Apple Maps/.test(driving0) && !/Google Maps/.test(driving0), "the route controls' outbound link is labelled Apple Maps, and nothing on the event surface says Google Maps");
ok(/Open in Apple Maps/.test(where) && !/Google/.test(where), "the Where block's outbound button is labelled Apple Maps");
for (const f of ["lib/eventDrivingRoute.js"]) {
  let exists = true; try { read(f); } catch { exists = false; }
  ok(!exists, `${f} (the unused Google Maps Embed directions helper) stays deleted — no Google route surface can return through a side door`);
}
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

// 4b. THE TOKEN HAS A CLOCK, AND THE APP CAN READ IT (2026-09-08). #1144 went
//     live on a portal token with a 7-day exp (2026-09-15) and no origin —
//     nothing in the repo could tell. lib/appleMapsToken.js reads the JWT
//     lifetime; the map refuses an expired one before loading MapKit; and
//     /api/health/apple-maps + the synthetic monitor turn "expires soon" into a
//     red run on a clock. Executed here with fixture tokens, not regexed.
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const mint = (payload) => `${b64u({ kid: "K", typ: "JWT", alg: "ES256" })}.${b64u(payload)}.sig`;
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);
const sevenDay = mint({ iss: "T", iat: 1788800487, exp: 1789455599, scope: "mapkit_js" }); // the real 09-07 shape: exp 2026-09-15T06:59:59Z, no origin
const d7 = describeAppleMapsToken(sevenDay, NOW);
ok(d7.configured && d7.format === "jwt" && d7.expiresAt === "2026-09-15T06:59:59.000Z" && d7.daysLeft === 6 && !d7.expired && !d7.originRestricted, `the 09-07 portal token reads as a 7-day, origin-less JWT (got ${JSON.stringify(d7)})`);
const h7 = appleMapsTokenHealth(sevenDay, NOW);
ok(h7.ok && h7.warning && /expires in 6 day/.test(h7.reason), `a token inside the ${APPLE_MAPS_TOKEN_WARN_DAYS}-day window is ok-but-WARNING with a human reason (got ${JSON.stringify({ ok: h7.ok, warning: h7.warning, reason: h7.reason })})`);
const dead = describeAppleMapsToken(sevenDay, Date.UTC(2026, 8, 16));
ok(dead.expired && dead.daysLeft < 0 && !appleMapsTokenUsable(sevenDay, Date.UTC(2026, 8, 16)) && !appleMapsTokenHealth(sevenDay, Date.UTC(2026, 8, 16)).ok, "on 2026-09-16 the same token is expired, unusable, and NOT ok");
const forever = mint({ iss: "T", iat: 1788800487, scope: "mapkit_js", origin: "https://www.gowayfind.com,https://gowayfind.com" });
const df = describeAppleMapsToken(forever, NOW);
ok(df.nonExpiring && !df.expired && df.daysLeft === null && df.originRestricted && df.origins.length === 2 && appleMapsTokenHealth(forever, NOW).ok && !appleMapsTokenHealth(forever, NOW).warning, `a non-expiring, domain-restricted token is ok with no warning (got ${JSON.stringify(df)})`);
const opaque = describeAppleMapsToken("not-a-jwt-but-configured-value-0123456789", NOW);
ok(opaque.configured && opaque.format === "opaque" && !opaque.expired && appleMapsTokenUsable("not-a-jwt-but-configured-value-0123456789", NOW), "an unreadable token is treated as configured and usable (Apple's format is Apple's; the render check judges it)");
for (const v of ["", null, undefined, "   "]) ok(!describeAppleMapsToken(v, NOW).configured && describeAppleMapsToken(v, NOW).format === "missing" && !appleMapsTokenUsable(v, NOW), `empty (${JSON.stringify(v)}) is missing, not usable`);
for (const v of ["placeholder", "your-token-here", "xxx", "changeme", "<paste token>"]) ok(!describeAppleMapsToken(v, NOW).configured && describeAppleMapsToken(v, NOW).format === "placeholder" && appleMapsTokenHealth(v, NOW).reason === "placeholder token", `${JSON.stringify(v)} is a placeholder, not a token`);
ok(describeAppleMapsToken("a.b.c", NOW).format === "opaque" && describeAppleMapsToken(`${b64u({ alg: "ES256" })}.!!!.sig`, NOW).format === "opaque", "a malformed three-part value never throws and never reads as a JWT");
ok(/appleMapsTokenUsable\(token\)/.test(appleRuntime) && /appleMapsTokenUsable\(token\)/.test(map), "both the loader and the map refuse an unusable (missing/placeholder/expired) token before MapKit is fetched");
const healthRoute = read("app/api/health/apple-maps/route.js");
ok(/appleMapsTokenHealth\(process\.env\.NEXT_PUBLIC_APPLE_MAPS_TOKEN\)/.test(healthRoute) && /force-dynamic/.test(healthRoute) && /no-store/.test(healthRoute), "/api/health/apple-maps reads the shipped token at REQUEST time and is never cached");
ok(!/process\.env\.NEXT_PUBLIC_APPLE_MAPS_TOKEN\s*[,}]/.test(healthRoute) && !/token:\s*/.test(healthRoute), "the health route describes the token and never echoes it");
ok(/expiresAt/.test(healthRoute) && /daysLeft/.test(healthRoute) && /originRestricted/.test(healthRoute) && /warning/.test(healthRoute), "the health payload carries the lifetime fields the monitor asserts on");
const scenarios = read("scripts/lib/synthetic/scenarios.mjs");
ok(/id: "event-apple-maps"/.test(scenarios) && /\/api\/health\/apple-maps/.test(scenarios) && /mk-map-view/.test(scenarios), "the synthetic monitor owns an event-apple-maps scenario: health endpoint + a REAL MapKit render on a real event page, every 30 minutes");
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
ok(/requestCurrentLocationRoute/.test(driving) && /\[mapController, venue\.lat, venue\.lng\]/.test(driving) && /onClick=\{showLocation\}/.test(driving) && /Use my location/.test(driving) && /searchAndRoute/.test(driving), "Apple driving preview requests current location after its controller is ready and keeps location retry plus typed fallback actions");
ok(/event-route/.test(driving) && /distanceLabel/.test(driving) && /etaLabel/.test(driving), "route controls expose a stable in-page target and Apple distance/ETA summary");
ok(/starting point is shared with Apple/.test(driving), "route controls disclose sharing the opted-in starting point with Apple");
ok(/prefers-reduced-motion/.test(read("app/components/EventRouteJump.js")), "in-page route jump respects reduced-motion preference");
ok(/The map preview is unavailable right now/.test(map) && !/The .*token/i.test(map), "reader-facing map fallback does not expose configuration jargon");
ok(/aria-label="Map key"/.test(where) && /wfw-key-venue" aria-hidden="true">★<\/b> Event/.test(where) && /wfw-key-nearby" aria-hidden="true">●<\/b> Places/.test(where), "compact map key distinguishes the event star from category place pins");
ok(/className="wfev-card" role="region" aria-label=\{selected\.name\}/.test(map) && !/className="wfev-card" role="dialog"/.test(map), "a selected map callout is a labelled region, never a modal dialog without dialog focus behavior");
ok(appleRuntime.includes('applePinOptions(mapkit, "event")') && appleRuntime.includes('applePinOptions(mapkit, eventMapFamily(p))') && mapPinSvg("event") !== mapPinSvg("food") && mapPinSvg("food").includes('fill="white"'), "venue star stays distinct from white category pictograms inside shared Apple image pins");
ok(EVENT_MAP_FAMILY.food.color === "#F97316" && EVENT_MAP_FAMILY.cafe.color === "#A66A3F" && EVENT_MAP_FAMILY.stay.color === "#058ADB" && EVENT_MAP_FAMILY.stay.path.startsWith("M1 3H4V15"), "event pin families preserve orange food, brown coffee and blue bed-stay reference semantics");
ok(/aria-label="Map categories"/.test(map) && /<span>All places<\/span><b>\{pins\.length\}<\/b>/.test(map) && /groups\.map/.test(map) && /aria-pressed=\{active === group\.family\}/.test(map), "the event map has one horizontal category strip whose counts and filtered pins come from the same rows");
ok(/createAppleMapController/.test(map) && /destroy\(\)/.test(read("lib/appleMapsRuntime.js")), "the MapKit session is torn down on unmount");
ok(/routeSummary/.test(read("lib/appleMapsRuntime.js")) && /polyline/.test(read("lib/appleMapsRuntime.js")), "Apple route responses require real polyline geometry");
// 5. (2026-10-22) WHO MAY MOVE THE VENUE PIN. Ticketmaster venue records
// often carry a ZIP/city centroid (Tropicana Field sat 3.5 km south of the
// stadium; 51 of 146 live Florida venues over 150 m off), so the browser map
// verifies a PROVIDER point against Apple (lib/appleVenueLocation.js) before
// pinning, searching parking or routing — and never touches a VERIFIED one.
const stripped = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const liveCode = stripped(live), flCode = stripped(fl), mapCode = stripped(map), whereCode = stripped(where);
const parkingMap = stripped(read("app/components/PlaceParkingMap.js"));
ok(/function\s+eventLocationTrust\s*\(/.test(liveCode) && /e\.source !== "Ticketmaster" \|\| !String\(e\.venue \|\| ""\)\.trim\(\) \|\| \/\^\(tba\|tbd[^/]*\/i\.test\(String\(e\.venue\)\.trim\(\)\)\) return \{ trust: "verified" \}/.test(liveCode) && /return \{ trust: "provider", street: e\.address/.test(liveCode), "the live event page marks ONLY named Ticketmaster venues as provider hints (staples keep owner-set points; a blank or TBA venue is never searched as the city)");
ok(/<EventWhere[\s\S]*?location=\{eventLocationTrust\(e\)\}[\s\S]*?\/>/.test(liveCode), "the live event page passes that trust to <EventWhere>");
ok(/<EventWhere[\s\S]*?location=\{\{ trust: "verified" \}\}[\s\S]*?\/>/.test(flCode), "the curated event page marks its editorially verified point as never movable");
ok(/location = \{ trust: "verified" \}/.test(whereCode) && /locationTrust: location\.trust, street: location\.street, city: location\.city, state: location\.state/.test(whereCode), "<EventWhere> defaults to verified and hands trust + address parts to the map venue");
ok(/const venue = \{ \.\.\.place, id: place\.id, name: [^\n]*\.\.\.point, locationTrust: "verified" \};/.test(parkingMap), "place detail / durable place pages build their map venue with locationTrust verified AFTER the row spread, so no row field can re-open it");
ok(/import \{[^}]*needsAppleVenueCheck[^}]*resolveAppleVenueLocation[^}]*applyVenueResolution[^}]*\} from "\.\.\/\.\.\/lib\/appleVenueLocation\.js"/.test(mapCode), "the venue map imports the Apple venue check");
const resolveOrder = ["loadAppleMapKit(token).then(", "needsAppleVenueCheck(venue)", "await resolveAppleVenueLocation({ mapkit, venue })", "applyVenueResolution(venue, resolution)", "createAppleMapController({"].map((needle) => mapCode.indexOf(needle));
ok(resolveOrder.every((i) => i >= 0) && resolveOrder.every((i, n) => n === 0 || i > resolveOrder[n - 1]), `the map resolves a provider venue against Apple BEFORE the controller is built, so pin, parking and routing share the corrected point (order ${resolveOrder.join(" < ")})`);
ok(/createAppleMapController\(\{\s*mapkit, container: hostRef\.current, venue: resolvedVenue/.test(mapCode), "the controller is built from the resolved venue, not the raw provider one");
ok(/<VenueParkingResults venue=\{mapVenue\}/.test(mapCode), "walk/drive links end at the resolved venue point");
const resolveCode = stripped(read("lib/eventResolve.js"));
const stateProbe = /\n\s*(stateCode|state): venue && venue\.state && venue\.state\.stateCode/g;
const stateHits = [...resolveCode.matchAll(stateProbe)].map((m) => m[1]);
ok(stateHits.length === 1 && stateHits[0] === "stateCode", `the Ticketmaster row carries the state as stateCode ONLY (positive control: probe found ${JSON.stringify(stateHits)}), so lib/placeWhere.js (which prints \`state\`) keeps the address line and Apple link unchanged`);
const anchorOrder = ["const e = await resolveEventById(id);", "return anchorEventVenue(applyStoredStartCorrection(e) || e);", "export default async function EventPage(", "eventPairings({ lat, lng,"].map((needle) => liveCode.indexOf(needle));
ok(anchorOrder.every((i) => i >= 0) && anchorOrder.every((i, n) => n === 0 || i > anchorOrder[n - 1]) && /import \{ anchorEventVenue \} from "[^"]*lib\/venueAnchor\.js"/.test(liveCode), `the live event page anchors a resolved Ticketmaster event on Wayfind's own venue row (lib/venueAnchor.js) BEFORE it ranks picks, stays and the plan from the point (order ${anchorOrder.join(" < ")})`);
ok(!/anchorEventVenue|venueAnchor/.test(resolveCode), "the resolver itself stays on its provider-authority contract (one read, no anchoring inside; scripts/test-events-contract.mjs counts its calls)");
const venueAnchor = stripped(read("lib/venueAnchor.js"));
ok(/export function anchorableEvent\(event\)/.test(venueAnchor) && /event\.source === "Ticketmaster"/.test(venueAnchor) && !/google|maps\.googleapis|apple|mapkit/i.test(venueAnchor.replace(/applePlaceMatch|appleVenueLocation/g, "")), "the server anchor reads only Wayfind's own inventory (no Google, no Apple call) and only for Ticketmaster rows");
const planWaitCode = stripped(read("app/events/[city]/[slug]/EventPlan.js"));
ok(/export const EVENT_PLAN_VENUE_WAIT_MS = \d+;/.test(planWaitCode) && /const ready = !awaitVenue \|\| resolved \|\| waited;/.test(planWaitCode) && /if \(!ready\) return undefined;/.test(planWaitCode) && /\/api\/places\/search\?/.test(planWaitCode), "EventPlan (metered /api/places/search rails) holds its requests for a provider venue until the Apple answer lands or the bounded wait runs out, so it requests once from the best point");
ok(/<EventPlan [^\n]*awaitVenue=\{eventLocationTrust\(e\)\.trust === "provider" && !\(e\.venueAnchor && e\.venueAnchor\.source === "wayfind-inventory"\)\}/.test(liveCode), "the live event page asks EventPlan to wait only for provider venues the server could NOT anchor on an owned row");
ok(/publishVenueResolution\(venue, \{ status: "kept", point: \{ lat: Number\(venue\.lat\), lng: Number\(venue\.lng\) \}, source: "provider", driftMeters: 0, reason: "map-unavailable" \}\)/.test(mapCode), "a map that fails to load still publishes a kept answer, so a waiting plan proceeds at once instead of holding for the full bounded wait");
const venueLocation = stripped(read("lib/appleVenueLocation.js"));
ok(/export function needsAppleVenueCheck\(venue\)/.test(venueLocation) && /venue\.locationTrust === "provider"/.test(venueLocation), "only provider-trust venues are ever sent to Apple");
ok(!/google|maps\.googleapis|fetch\(/i.test(venueLocation), "the venue check is Apple-only and makes no direct network call of its own");

// 5b. (2026-10-22) THE NEARBY SURFACES FOLLOW APPLE'S POINT. When the map's Apple check moves a
// PROVIDER venue by more than 300 m, the nearby picks, their map pins, the stays rail and EventPlan
// re-anchor on the corrected point (lib/venueResolutionStore.js -> EventNearbyReanchor). Behavior is
// proved by scripts/test-event-reanchor-render.mjs and test-event-venue-nearby-api.mjs; these are the
// structural doors: who mounts it, who feeds it, who reads it.
const stayCardsCode = stripped(read("app/components/EventStayCards.js"));
const nearbyCardsCode = stripped(read("app/components/EventNearbyCards.js"));
const placesCtxCode = stripped(read("app/components/EventMapPlaces.js"));
const loaderCode = stripped(read("app/components/EventVenueMapLoader.js"));
const planCode = stripped(read("app/events/[city]/[slug]/EventPlan.js"));
const reanchorCode = stripped(read("app/components/EventNearbyReanchor.js"));
const mountsOnlyForProvider = (src) => (src.match(/<EventNearbyReanchor[\s/>]/g) || []).length === 1
  && /\{\s*location\.trust\s*===\s*"provider"\s*&&\s*hasPoint\s*\?\s*<EventNearbyReanchor[\s/]/.test(src);
ok(/import EventNearbyReanchor from "\.\/EventNearbyReanchor\.js"/.test(whereCode) && mountsOnlyForProvider(whereCode), "EventWhere mounts <EventNearbyReanchor> exactly once, and only when location.trust === \"provider\" with a real point (verified pages never re-anchor)");
const ungatedWhere = whereCode.replace('location.trust === "provider" && hasPoint ? <EventNearbyReanchor', 'hasPoint ? <EventNearbyReanchor');
ok(ungatedWhere !== whereCode && !mountsOnlyForProvider(ungatedWhere), "positive control: the mount probe rejects a copy of EventWhere whose re-anchor is not gated on provider trust (mutation applied)");
ok(/<EventNearbyReanchor venue=\{\{ name: venue \|\| address, lat, lng \}\}/.test(whereCode) && /<EventVenueMapLoader[^>]*venue=\{\{ name: venue \|\| address, lat, lng, locationTrust/.test(whereCode), "the re-anchor and the map are keyed by the SAME venue label and provider point, which is how the store finds the map's answer");
ok(/hasNearby=\{pins\.length > 0\}/.test(whereCode), "the picks swap only where the server rendered a nearby shelf (cards and pins stay one list)");
ok(/nearbyQuery = \{\}/.test(whereCode) && /export \{ eventNearbyPlaces \}/.test(whereCode) && /import \{ eventNearbyPlaces \} from "\.\.\/\.\.\/lib\/eventNearbyPlaces\.js"/.test(whereCode), "EventWhere takes an optional nearbyQuery and shares eventNearbyPlaces with the browser re-anchor through lib/eventNearbyPlaces.js");
ok(/<EventWhere[\s\S]*?nearbyQuery=\{\{[^}]*\bname: e\.name\b[^}]*\bdate: e\.date\b[^}]*\btime: e\.time\b[^}]*\bsegment: e\.segment\b[^}]*\bgenre: e\.genre\b[^}]*placeId: e\.place_id \|\| e\.placeId[^}]*\}\}[\s\S]*?\/>/.test(liveCode), "the live event page passes nearbyQuery (name, date, time, segment, genre, placeId) so the re-anchored picks are before/after THIS event");
ok(!/nearbyQuery/.test(flCode), "the curated event page passes no nearbyQuery (its point is verified and never re-anchors)");
ok(/venue=\{e\.venue \|\| e\.city \|\| "Event venue"\}/.test(liveCode) && /<EventPlan[^>]*anchorName=\{e\.venue \|\| e\.city \|\| "Event venue"\}/.test(liveCode), "EventPlan is handed the same venue label EventWhere gives the map, so it finds the same stored answer");
ok(/import \{ useResolvedVenuePoint \} from "[^"]*components\/useResolvedVenuePoint\.js"/.test(planCode) && /const \{ point, resolved \} = useResolvedVenuePoint\(\{ name: anchorName \|\| venue, lat, lng \}\)/.test(planCode) && /const origin = \{ lat: originLat, lng: originLng \}/.test(planCode) && /\}, \[ready, originLat, originLng, city, venue, time\]\);/.test(planCode) && !/lat: Number\(lat\)/.test(planCode), "EventPlan imports useResolvedVenuePoint and builds its fetch origin (and its effect dependencies) from the resolved point, not the raw props");
ok(/import \{ useEventMapPlaces \} from "\.\/EventMapPlaces\.js"/.test(nearbyCardsCode) && /const reanchored = useEventMapPlaces\(\)\?\.picks/.test(nearbyCardsCode) && /orderPlaceRecommendations\(Array\.isArray\(reanchored\) \? reanchored : places\)/.test(nearbyCardsCode), "EventNearbyCards reads the context's re-anchored picks and falls back to the server's list only while there are none");
ok(/eventPlaces\?\.reanchoredStays/.test(stayCardsCode) && /const shown = Array\.isArray\(reanchoredStays\) \? reanchoredStays : places/.test(stayCardsCode) && /orderPlaceRecommendations\(shown\)/.test(stayCardsCode) && /setStays\?\.\(eventStayMapPins\(orderedPlaces\)\)/.test(stayCardsCode), "EventStayCards shows the re-anchored stays when present and publishes the map pins for exactly the list it displays (one publisher, so a stale list cannot overwrite the new one)");
ok(/const picks = places && Array\.isArray\(places\.picks\) \? places\.picks : serverPicks/.test(placesCtxCode) && /applyReanchor/.test(placesCtxCode) && /reanchoredStays/.test(placesCtxCode) && /corrected: !!reanchor/.test(placesCtxCode) && /setStays/.test(placesCtxCode), "the EventMapPlaces context carries picks, reanchoredStays, a corrected flag and one atomic applyReanchor, and still carries stays/setStays");
ok(/const mapPicks = useEventMapPins\(props\.picks\)/.test(loaderCode) && /<EventVenueMap \{\.\.\.props\} picks=\{mapPicks\}/.test(loaderCode), "the map loader draws pins from the context's picks when a re-anchor landed, merged with the stays the rail shows");
const publishOrder = ["setMapVenue(resolvedVenue);", "if (resolution) publishVenueResolution(venue, resolution);", "setReady(true)"].map((needle) => mapCode.indexOf(needle));
ok(/import \{ publishVenueResolution \} from "\.\.\/\.\.\/lib\/venueResolutionStore\.js"/.test(mapCode) && publishOrder.every((i) => i >= 0) && publishOrder.every((i, n) => n === 0 || i > publishOrder[n - 1]), `the map publishes Apple's answer (keyed by the PROVIDER venue) right after it adopts the resolved venue (order ${publishOrder.join(" < ")})`);
ok(/useResolvedVenuePoint\(venue \|\| \{\}\)/.test(reanchorCode) && /if \(!corrected \|\| typeof applyReanchor !== "function"/.test(reanchorCode) && /new AbortController\(\)/.test(reanchorCode) && /\/api\/events\/venue-nearby\?/.test(reanchorCode) && /role="status"/.test(reanchorCode) && !/appleVenueLocation|mapkit|google/i.test(reanchorCode), "EventNearbyReanchor acts only on a corrected answer, aborts superseded requests, calls the one same-origin route and announces the swap politely");
ok(readFileSync(path.join(ROOT, "app/api/events/venue-nearby/route.js"), "utf8").includes("export const GET = createHandler()"), "the route the re-anchor calls exists");

const csp = read("next.config.js");
ok(!/osrm/i.test(csp), "the CSP carries no routing host in any directive");
const pair = read("lib/eventPairings.js");
ok(/lat: r\.lat,\s*\n\s*lng: r\.lng,/.test(pair), "eventPairings keeps lat/lng so the picks can be pinned");

if (fail.length) {
  console.error(`check-event-where: FAIL — ${fail.length} of ${pass + fail.length} assertions`);
  for (const f of fail) console.error("  FAIL: " + f);
  process.exit(1);
}
console.log(`check-event-where: OK — ${pass} assertions (address carries the town, both event pages share one Where block with a free Apple map, an Apple outbound link, a token whose clock the app can read, nearby pins and a separately consented driving preview).`);
