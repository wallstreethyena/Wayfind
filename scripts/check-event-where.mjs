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
import { describeAppleMapsToken, appleMapsTokenHealth, appleMapsTokenUsable, appleMapsTokenContract, appleMapsTokenContractViolations, APPLE_MAPS_TOKEN_WARN_DAYS } from "../lib/appleMapsToken.js";
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

// 4c. PERMANENT IS THE STANDARD, NOT "MORE THAN A FORTNIGHT LEFT" (2026-09-10).
//     The permanent token went live 2026-09-08 (no `exp`, origin
//     www.gowayfind.com — verified out of the chunk a reader downloads). The
//     14-day window alone cannot keep it that way: a ONE-YEAR testing token
//     would sit green for 351 days and then page, the same silent-failure-on-
//     a-clock shape #1144 taught, only slower. So any expiry at all warns, and
//     APPLE_MAPS_TOKEN_WARN_DAYS only escalates the wording.
const oneYear = mint({ iss: "T", iat: 1788800487, exp: Math.floor(NOW / 1000) + 365 * 86400, scope: "mapkit_js", origin: "https://www.gowayfind.com" });
const hYear = appleMapsTokenHealth(oneYear, NOW);
ok(hYear.ok && hYear.warning && hYear.temporary && !hYear.urgent && /token is temporary/.test(hYear.reason) && hYear.daysLeft === 365,
  `a one-year token is ok-but-WARNING as TEMPORARY and not urgent, ${APPLE_MAPS_TOKEN_WARN_DAYS}-day window notwithstanding (got ${JSON.stringify({ ok: hYear.ok, warning: hYear.warning, temporary: hYear.temporary, urgent: hYear.urgent, daysLeft: hYear.daysLeft, reason: hYear.reason })})`);
ok(h7.urgent === true && hYear.urgent === false && h7.warning === hYear.warning,
  "`urgent` is what separates a 6-day token from a 1-year one; both still WARN");
const hForever = appleMapsTokenHealth(forever, NOW);
ok(hForever.temporary === false && hForever.nonExpiring === true && hForever.warning === false && hForever.urgent === false && hForever.reason === null,
  `the PERMANENT token is the only shape that warns about nothing (got ${JSON.stringify({ temporary: hForever.temporary, warning: hForever.warning, reason: hForever.reason })})`);
const hOpaque = appleMapsTokenHealth("not-a-jwt-but-configured-value-0123456789", NOW);
ok(hOpaque.temporary === false && hOpaque.nonExpiring === false && hOpaque.warning === false,
  "an OPAQUE token is never called temporary and never warns — a format we cannot read is not evidence of an expiry (Apple's format is Apple's to change)");

// 4d. THE MONITOR AND THIS SUITE JUDGE THE TOKEN THROUGH THE SAME FUNCTION.
//     CLAUDE.md: assert on the CALL, not the string. appleMapsTokenContract()
//     is what scripts/lib/synthetic/scenarios.mjs turns into assertions every
//     30 minutes, so red-proving it HERE red-proves production monitoring —
//     no browser, no network. Each fixture below must trip exactly one entry;
//     "some assertion failed" would pass on the wrong bug.
const CONTRACT_IDS = ["configured", "not-expired", "no-warning", "permanent", "domain-locked"];
const contractIds = appleMapsTokenContract(hForever).map((c) => c.id);
ok(contractIds.length === CONTRACT_IDS.length && CONTRACT_IDS.every((id, i) => contractIds[i] === id),
  `the token contract is exactly [${CONTRACT_IDS.join(", ")}] (got [${contractIds.join(", ")}])`);
// POSITIVE CONTROL: the shape production actually serves passes every entry.
ok(appleMapsTokenContractViolations(hForever).length === 0,
  `the live permanent-token shape violates nothing (got ${JSON.stringify(appleMapsTokenContractViolations(hForever).map((c) => c.id))})`);
// NEGATIVE CONTROLS: one broken property each, naming the entry it must trip.
const violatedBy = (health) => appleMapsTokenContractViolations(health).map((c) => c.id).sort().join(",");
ok(violatedBy(hYear) === "no-warning,permanent",
  `a one-year testing token trips exactly no-warning + permanent (got ${violatedBy(hYear)})`);
// The real 09-07 token was BOTH temporary AND origin-less, which is precisely
// why `domain-locked` is a separate entry rather than a footnote: the token
// that shipped to production could be lifted out of the bundle and pointed at
// anyone's site, and nothing said so for a day.
ok(violatedBy(h7) === "domain-locked,no-warning,permanent",
  `the real 09-07 seven-day token trips no-warning + permanent + domain-locked (got ${violatedBy(h7)})`);
ok(violatedBy(appleMapsTokenHealth(sevenDay, Date.UTC(2026, 8, 16))) === "domain-locked,no-warning,not-expired,permanent",
  `an EXPIRED token trips not-expired as well (got ${violatedBy(appleMapsTokenHealth(sevenDay, Date.UTC(2026, 8, 16)))})`);
const unlocked = mint({ iss: "T", iat: 1788800487, scope: "mapkit_js" }); // permanent, but no origin claim
ok(violatedBy(appleMapsTokenHealth(unlocked, NOW)) === "domain-locked",
  `a permanent token with NO origin claim trips exactly domain-locked — it is lift-and-reuse from a public bundle (got ${violatedBy(appleMapsTokenHealth(unlocked, NOW))})`);
ok(violatedBy(hOpaque) === "", "an opaque token trips nothing: the monitor's RENDER assertion is its judge");
// An ABSENT token is honestly "not expired" — there is nothing to expire — so
// it trips configured + no-warning and nothing else. That is a different bug
// from "a testing token is installed", and the contract keeps them apart. (A
// garbage BODY, below, cannot even say that much, so it also trips not-expired.)
ok(violatedBy(appleMapsTokenHealth("", NOW)) === "configured,no-warning",
  `an unconfigured token trips exactly configured + no-warning, never permanent (got ${violatedBy(appleMapsTokenHealth("", NOW))})`);
// A monitor that throws reports nothing, which reads as silence, not as red.
for (const junk of [null, undefined, {}, "nonsense", 42, []]) {
  let entries = null;
  try { entries = appleMapsTokenContract(junk); } catch { entries = "THREW"; }
  ok(Array.isArray(entries) && entries.length === CONTRACT_IDS.length && entries.every((c) => typeof c.pass === "boolean" && typeof c.label === "string"),
    `the contract survives a missing/garbage health body (${JSON.stringify(junk)}) with ${CONTRACT_IDS.length} boolean verdicts (got ${entries === "THREW" ? "a THROW" : Array.isArray(entries) ? entries.length : typeof entries})`);
  ok(entries !== "THREW" && appleMapsTokenContractViolations(junk).map((c) => c.id).sort().join(",") === "configured,no-warning,not-expired",
    `a garbage health body (${JSON.stringify(junk)}) reads as "nothing is configured", never as a healthy token`);
}

const opaque = describeAppleMapsToken("not-a-jwt-but-configured-value-0123456789", NOW);
ok(opaque.configured && opaque.format === "opaque" && !opaque.expired && appleMapsTokenUsable("not-a-jwt-but-configured-value-0123456789", NOW), "an unreadable token is treated as configured and usable (Apple's format is Apple's; the render check judges it)");
for (const v of ["", null, undefined, "   "]) ok(!describeAppleMapsToken(v, NOW).configured && describeAppleMapsToken(v, NOW).format === "missing" && !appleMapsTokenUsable(v, NOW), `empty (${JSON.stringify(v)}) is missing, not usable`);
for (const v of ["placeholder", "your-token-here", "xxx", "changeme", "<paste token>"]) ok(!describeAppleMapsToken(v, NOW).configured && describeAppleMapsToken(v, NOW).format === "placeholder" && appleMapsTokenHealth(v, NOW).reason === "placeholder token", `${JSON.stringify(v)} is a placeholder, not a token`);
ok(describeAppleMapsToken("a.b.c", NOW).format === "opaque" && describeAppleMapsToken(`${b64u({ alg: "ES256" })}.!!!.sig`, NOW).format === "opaque", "a malformed three-part value never throws and never reads as a JWT");
ok(/appleMapsTokenUsable\(token\)/.test(appleRuntime) && /appleMapsTokenUsable\(token\)/.test(map), "both the loader and the map refuse an unusable (missing/placeholder/expired) token before MapKit is fetched");
const healthRoute = read("app/api/health/apple-maps/route.js");
// 2026-09-10. A presence check over RAW source passes on its own explanatory
// comment — CLAUDE.md lists five guards in this repo that hit exactly that,
// and this one hit it too: commenting out `temporary: health.temporary,` left
// the guard green because the text survived inside the comment. Strip comments
// before any presence check, and self-test the stripper both ways first, or it
// is one more thing taken on faith.
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
ok(/temporary: health\.temporary/.test(stripComments("      temporary: health.temporary,")), "self-test: stripComments keeps real code");
ok(!/temporary: health\.temporary/.test(stripComments("      // temporary: health.temporary,")), "self-test: stripComments removes a commented-out line, so prose cannot satisfy a presence check");
ok(/https:\/\/x/.test(stripComments('const u = "https://x";')), "self-test: stripComments does not eat a URL's double slash");
const healthRouteCode = stripComments(healthRoute);
ok(/appleMapsTokenHealth\(process\.env\.NEXT_PUBLIC_APPLE_MAPS_TOKEN\)/.test(healthRoute) && /force-dynamic/.test(healthRoute) && /no-store/.test(healthRoute), "/api/health/apple-maps reads the shipped token at REQUEST time and is never cached");
ok(!/process\.env\.NEXT_PUBLIC_APPLE_MAPS_TOKEN\s*[,}]/.test(healthRoute) && !/token:\s*/.test(healthRoute), "the health route describes the token and never echoes it");
ok(/expiresAt: health\.expiresAt/.test(healthRouteCode) && /daysLeft: health\.daysLeft/.test(healthRouteCode) && /originRestricted: health\.originRestricted/.test(healthRouteCode) && /warning: health\.warning/.test(healthRouteCode), "the health payload carries the lifetime fields the monitor asserts on");
ok(/temporary: health\.temporary/.test(healthRouteCode) && /urgent: health\.urgent/.test(healthRouteCode), "the health payload answers \"is the key permanent?\" in one field (`temporary`) and grades the urgency (`urgent`)");
const scenarios = read("scripts/lib/synthetic/scenarios.mjs");
ok(/id: "event-apple-maps"/.test(scenarios) && /\/api\/health\/apple-maps/.test(scenarios) && /mk-map-view/.test(scenarios), "the synthetic monitor owns an event-apple-maps scenario: health endpoint + a REAL MapKit render on a real event page, every 30 minutes");
ok(/import \{ appleMapsTokenContract \} from "\.\.\/\.\.\/\.\.\/lib\/appleMapsToken\.js"/.test(scenarios) && /for \(const c of appleMapsTokenContract\(h\)\) ctx\.ok\(/.test(scenarios), "the monitor turns appleMapsTokenContract() into its assertions — the same function red-proved above, not a hand-copied second opinion that can drift");
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
console.log(`check-event-where: OK — ${pass} assertions (address carries the town, both event pages share one Where block with a free Apple map, an Apple outbound link, a token whose clock the app can read, nearby pins and a separately consented driving preview).`);
