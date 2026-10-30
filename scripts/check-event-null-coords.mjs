// scripts/check-event-null-coords.mjs
//
// OWNER, 2026-10-14: an event with no coordinates must never get a guessed pin,
// must say so truthfully, and must stay discoverable. CALLED, not grepped:
// the real eventJsonLd, eventLocationNote, eventMapPoint, curatedToFeedEvent,
// buildRail, floridaEventsHubPageModel, processEvents and the real <EventWhere>
// component called and its element tree inspected. Negative control: a row WITH coordinates still
// gets JSON-LD geo, a map pin and no unconfirmed line.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { eventJsonLd, curatedToFeedEvent, buildRail, floridaEventsHubPageModel } from "../lib/curatedEvents.js";
import { eventLocationNote, eventMapPoint, UNCONFIRMED_LOCATION_LINE, PARADE_ROUTE_LINE } from "../lib/eventLocation.js";
import { processEvents } from "../lib/eventsPipeline.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };

const NOW = new Date("2026-10-14T16:00:00Z");
const mk = (o) => ({
  event_id: "x-" + o.slug, slug: o.slug, event_name: o.name, short_title: o.name, venue: o.venue || "", address: o.address || "",
  city: "Sarasota", state: "FL", lat: null, lng: null, start_date: "2026-12-12", end_date: "2026-12-12",
  event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "A reason to go.",
  category: "holiday", subcategory: "", tags: [], audience: [], official_url: "https://example.org/e", ...o.extra,
});
const parade = mk({ slug: "null-parade", name: "Holiday Boat Parade", extra: { subcategory: "boat-parade", tags: ["christmas", "boat-parade"] } });
const venue = mk({ slug: "null-venue", name: "Harvest Night", venue: "Some Hall", address: "1 Main St, Sarasota, FL 34236" });
const pinned = mk({ slug: "pinned-venue", name: "Pinned Fest", venue: "Real Park", address: "2 Park Rd, Sarasota, FL 34236", extra: { lat: 27.34, lng: -82.53 } });

// 1. note text
ok(eventLocationNote(parade) === PARADE_ROUTE_LINE && PARADE_ROUTE_LINE === "Parade route: see organizer for viewing spots", "null-coord parade gets the parade route line");
ok(eventLocationNote({ ...parade, subcategory: "", tags: ["parade"] }) === PARADE_ROUTE_LINE, "a parade tag alone is enough");
ok(eventLocationNote(venue) === UNCONFIRMED_LOCATION_LINE && UNCONFIRMED_LOCATION_LINE === "Exact location to be confirmed", "null-coord venue gets the unconfirmed line");
ok(eventLocationNote(pinned) === null, "negative control: a row with coordinates gets no note");
ok(eventLocationNote({ ...venue, lat: 0, lng: 0 }) === UNCONFIRMED_LOCATION_LINE, "0,0 is no location");

// 2. no pin, no geo
ok(eventMapPoint(parade) === null && eventMapPoint(venue) === null, "null-coord rows have no map point");
for (const [n, r] of [["parade", parade], ["venue", venue]]) {
  const ld = eventJsonLd(r);
  ok(!("geo" in ld.location), n + " JSON-LD omits geo");
  ok(ld.location.address.addressLocality === "Sarasota", n + " JSON-LD keeps the address locality");
}
ok(eventJsonLd(venue).location.address.streetAddress === "1 Main St, Sarasota, FL 34236", "venue JSON-LD keeps the street address");
const ldP = eventJsonLd(pinned);
ok(ldP.location.geo && ldP.location.geo.latitude === 27.34 && ldP.location.geo.longitude === -82.53, "negative control: pinned row still gets geo");

// 3. hub rails and eligibility
const rows = [parade, venue, pinned];
const hub = floridaEventsHubPageModel({ ok: true, rows }, { now: NOW, railKeys: [] });
ok(["null-parade", "null-venue", "pinned-venue"].every((s) => hub.eligible.some((e) => e.slug === s)), "hub lists null-coord rows (got " + hub.eligible.map((e) => e.slug).join(",") + ")");
const many = [];
for (let i = 0; i < 4; i++) many.push(mk({ slug: "n" + i, name: "Null " + i, extra: { tags: ["halloween"], editorial_score: 5 } }));
const rail = buildRail("spooky-season", many, { now: NOW, size: 8 });
ok(rail && rail.cards.length === 4, "a rail of null-coord rows still builds (cards=" + (rail ? rail.cards.length : "none") + ")");

// 4. live feed: city-name inclusion, no pin, no change for pinned rows
const feedRows = rows.map(curatedToFeedEvent);
ok(feedRows.every((f) => f && f.curated === true), "curatedToFeedEvent keeps null-coord rows");
ok(feedRows[0].lat === null && feedRows[0].lng === null, "feed card carries null coords, not a centroid");
const run = (city, lat, lng) => processEvents([{ provider: "curated", configured: true, ok: true, ms: 1, events: feedRows }], { lat, lng, radius: 25, city, now: NOW });
const here = run("Sarasota, FL", 27.34, -82.53).events;
ok(here.some((e) => e.curatedSlug === "null-parade") && here.some((e) => e.curatedSlug === "null-venue") && here.some((e) => e.curatedSlug === "pinned-venue"), "Sarasota feed keeps null-coord rows by city name (got " + here.map((e) => e.curatedSlug).join(",") + ")");
ok(here.filter((e) => e.curatedSlug.startsWith("null-")).every((e) => e.lat === null && e.lng === null), "kept null-coord rows still have no coordinates (no centroid written)");
const away = run("Miami, FL", 25.76, -80.19).events;
ok(!away.some((e) => e.curatedSlug.startsWith("null-")), "a Miami feed does not get Sarasota null-coord rows");
ok(!away.some((e) => e.curatedSlug === "pinned-venue"), "negative control: pinned row beyond reach is still distance-gated");
const stateSuffix = processEvents([{ provider: "curated", configured: true, ok: true, ms: 1,
  events: feedRows.map((e) => ({ ...e, city: "Sarasota, FL" })) }],
  { lat: 25.76, lng: -80.19, radius: 25, city: "Miami, FL", now: NOW }).events;
ok(!stateSuffix.some((e) => e.curatedSlug.startsWith("null-")), "matching state alone cannot admit a different city's unplaced curated event");


// 4b. the route's own distance gate cannot be executed here (it needs live
// providers), so this one is a STATIC check on the comment-stripped source: the
// curated filter must let a coordinate-less row through to processEvents.
const route = readFileSync(join(ROOT, "app/api/events/route.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const fn = route.slice(route.indexOf("async function fromCuratedEvents"));
ok(/curatedFeedEventsWithFall\(rows\)\.filter\(\(e\) =>\s*e\.lat == null \|\| e\.lng == null \|\|/.test(fn.slice(0, 1200)), "route.js fromCuratedEvents passes coordinate-less rows (static check, not executed)");

// 5. the real <EventWhere>, CALLED (it is a plain function component) and its
// returned element tree walked. Not rendered to HTML: a pinned row mounts the
// async EventStays, which reads inventory over the network.
const EventWhere = (await loadComponent(join(ROOT, "app/components/EventWhere.js"), ROOT)).default;
const tree = (r) => {
  const p = eventMapPoint(r);
  const root = EventWhere({
    venue: r.venue || r.event_name, address: r.address, directionsHref: null, website: "https://example.org/e",
    lat: p ? p.lat : NaN, lng: p ? p.lng : NaN, locationNote: eventLocationNote(r),
  });
  const texts = [], classes = [], hrefs = [];
  const walk = (n) => {
    if (n == null || typeof n === "boolean") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === "string" || typeof n === "number") return void texts.push(String(n));
    if (n.props) {
      if (n.props.className) classes.push(n.props.className);
      if (n.props.href) hrefs.push(n.props.href);
      walk(n.props.children);
    }
  };
  walk(root);
  return { text: texts.join(" "), classes: classes.join(" "), hrefs };
};
const tP = tree(parade), tV = tree(venue), tE = tree(pinned);
ok(tP.text.includes(PARADE_ROUTE_LINE) && tP.hrefs.includes("https://example.org/e") && !tP.text.includes(UNCONFIRMED_LOCATION_LINE), "parade page shows the route line and the official link");
ok(tV.text.includes(UNCONFIRMED_LOCATION_LINE) && tV.text.includes("1 Main St, Sarasota, FL 34236") && tV.text.includes("Some Hall"), "venue page shows venue, address and the unconfirmed line");
ok(!/\bwfw-map\b/.test(tP.classes) && !/\bwfw-map\b/.test(tV.classes), "no map is drawn for null-coord rows");
ok(/\bwfw-map\b/.test(tE.classes) && !tE.text.includes(UNCONFIRMED_LOCATION_LINE) && !tE.text.includes(PARADE_ROUTE_LINE), "negative control: pinned row draws the map and no unconfirmed line");

if (fail.length) { console.error("FAIL check-event-null-coords:\n - " + fail.join("\n - ")); process.exit(1); }
console.log("PASS check-event-null-coords: " + pass + " assertions (real eventJsonLd, buildRail, hub model, processEvents, EventWhere tree)");
