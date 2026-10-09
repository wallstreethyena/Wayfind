#!/usr/bin/env node
// scripts/check-event-jsonld-offset.mjs — schema.org Event startDate/endDate must
// carry the UTC offset of the EVENT'S place on the EVENT'S date (owner, 2026-10-09:
// "do not apply Eastern time to the entire state"). Calls the real helper and the
// real eventJsonLd(); the two /events page builders are checked by role (they are
// JSX server components that fetch over the network) and say so below.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventIsoWithOffset, eventJsonLdDates, resolveEventZone } from "../lib/eventTime.js";
import { eventJsonLd } from "../lib/curatedEvents.js";
import { eventVisitStatus, eventLocalClock } from "../lib/eventVisitFacts.js";

let n = 0;
const ok = (label, fn) => { try { fn(); n++; } catch (e) { console.error(`check-event-jsonld-offset: FAIL - ${label}\n  ${e.message}`); process.exit(1); } };
const NY = "America/New_York", CH = "America/Chicago";

ok("Eastern summer is -04:00", () => assert.equal(eventIsoWithOffset("2026-10-10", "10:00:00", NY), "2026-10-10T10:00:00-04:00"));
ok("Eastern winter is -05:00", () => assert.equal(eventIsoWithOffset("2026-12-12", "19:00", NY), "2026-12-12T19:00:00-05:00"));
ok("Central summer is -05:00", () => assert.equal(eventIsoWithOffset("2026-07-04", "20:00:00", CH), "2026-07-04T20:00:00-05:00"));
ok("Central winter is -06:00", () => assert.equal(eventIsoWithOffset("2026-01-15", "20:00:00", CH), "2026-01-15T20:00:00-06:00"));
ok("fall-back day: 00:30 is still DST, 03:00 is standard", () => {
  assert.equal(eventIsoWithOffset("2026-11-01", "00:30", NY), "2026-11-01T00:30:00-04:00");
  assert.equal(eventIsoWithOffset("2026-11-01", "03:00", NY), "2026-11-01T03:00:00-05:00");
});
ok("AMBIGUOUS 2026-11-01 01:30 ET takes the first occurrence (EDT -04:00)", () => assert.equal(eventIsoWithOffset("2026-11-01", "01:30", NY), "2026-11-01T01:30:00-04:00"));
ok("NONEXISTENT 2026-03-08 02:30 ET takes the pre-gap offset (-05:00)", () => assert.equal(eventIsoWithOffset("2026-03-08", "02:30", NY), "2026-03-08T02:30:00-05:00"));
ok("spring-forward day: 01:30 EST, 03:30 EDT", () => {
  assert.equal(eventIsoWithOffset("2026-03-08", "01:30", NY), "2026-03-08T01:30:00-05:00");
  assert.equal(eventIsoWithOffset("2026-03-08", "03:30", NY), "2026-03-08T03:30:00-04:00");
});
ok("date-only stays date-only", () => {
  assert.equal(eventIsoWithOffset("2026-10-10", "", NY), "2026-10-10");
  assert.equal(eventIsoWithOffset("2026-10-10", null, CH), "2026-10-10");
});
ok("unknown or invalid zone emits NO offset, never a guess", () => {
  assert.equal(eventIsoWithOffset("2026-10-10", "10:00", null), "2026-10-10T10:00:00");
  assert.equal(eventIsoWithOffset("2026-10-10", "10:00", "Not/AZone"), "2026-10-10T10:00:00");
  assert.equal(resolveEventZone({}), null);
});
ok("zone resolution: row tz > county > coordinates", () => {
  assert.equal(resolveEventZone({ timezone: CH, county: "Miami-Dade" }), CH);
  assert.equal(resolveEventZone({ county: "Escambia" }), CH);
  assert.equal(resolveEventZone({ county: "Okaloosa County", state: "FL" }), CH);
  assert.equal(resolveEventZone({ county: "Miami-Dade" }), NY);
  assert.equal(resolveEventZone({ county: "Hillsborough" }), NY);
  assert.equal(resolveEventZone({ lat: 30.42, lng: -87.21 }), CH); // Pensacola
  assert.equal(resolveEventZone({ county: "Gulf", lat: 29.81, lng: -85.30 }), NY); // Port St. Joe
  assert.equal(resolveEventZone({ county: "Gulf" }), null); // split county, no coords
});

const row = (o) => ({ event_status: "scheduled", slug: "x", event_name: "Show", start_date: "2026-10-10", start_time: "19:00:00", end_date: "2026-10-10", end_time: "22:00:00", ...o });
const pns = eventJsonLd(row({ city: "Pensacola", county: "Escambia", timezone: CH }));
const mia = eventJsonLd(row({ city: "Miami", county: "Miami-Dade", timezone: NY }));
ok("real eventJsonLd: Pensacola row is -05:00, Miami row is -04:00, same wall clock", () => {
  assert.equal(pns.startDate, "2026-10-10T19:00:00-05:00");
  assert.equal(pns.endDate, "2026-10-10T22:00:00-05:00");
  assert.equal(mia.startDate, "2026-10-10T19:00:00-04:00");
  assert.notEqual(pns.startDate.slice(-6), mia.startDate.slice(-6));
});
ok("real eventJsonLd: tz null falls back to county, then no offset", () => {
  assert.equal(eventJsonLd(row({ county: "Bay" })).startDate, "2026-10-10T19:00:00-05:00");
  assert.equal(eventJsonLd(row({ county: "Pinellas" })).startDate, "2026-10-10T19:00:00-04:00");
  assert.equal(eventJsonLd(row({})).startDate, "2026-10-10T19:00:00");
});
ok("real eventJsonLd: date-only row stays date-only; winter date flips offset", () => {
  assert.equal(eventJsonLd(row({ start_time: null, end_time: null, timezone: NY })).startDate, "2026-10-10");
  assert.equal(eventJsonLd(row({ start_date: "2026-12-12", end_date: "2026-12-12", timezone: NY })).startDate, "2026-12-12T19:00:00-05:00");
});
ok("feed-event field names work too (/events pages)", () => {
  assert.equal(eventJsonLdDates({ date: "2026-10-10", time: "19:00:00", lat: 30.42, lng: -87.21 }).startDate, "2026-10-10T19:00:00-05:00");
  assert.equal(eventJsonLdDates({ date: "2026-10-10", time: "" , timezone: NY }).startDate, "2026-10-10");
});

// open-now reads the SAME zone: Pensacola 7 PM CDT show on 10-10 is 00:00Z on 10-11.
ok("open-now/clock use the event's zone (Pensacola vs Miami at the same instant)", () => {
  const at = new Date("2026-10-10T23:30:00Z"); // 18:30 CDT, 19:30 EDT
  const p = eventLocalClock({ county: "Escambia" }, at), m = eventLocalClock({ county: "Miami-Dade" }, at);
  assert.equal(p.minute, 18 * 60 + 30);
  assert.equal(m.minute, 19 * 60 + 30);
  const st = (county) => eventVisitStatus({ county, start_date: "2026-10-10", end_date: "2026-10-10", start_time: "19:00:00", end_time: "22:00:00" }, at);
  assert.notEqual(st("Escambia")?.label, st("Miami-Dade")?.label, "Miami (19:30) is open, Pensacola (18:30) is not yet");
});

// Pages: JSX server components that fetch over the network cannot be invoked here.
ok("/events page builders route startDate through eventJsonLdDates (role check, not invoked)", () => {
  const src = readFileSync(new URL("../app/events/[city]/[slug]/page.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.equal((src.match(/startDate:\s*eventJsonLdDates\(e\)\.startDate/g) || []).length, 2);
  assert.ok(/import\s*\{[^}]*\beventJsonLdDates\b[^}]*\}\s*from/.test(src));
  assert.ok(!/startDate:\s*e\.time\s*\?/.test(src), "bare wall-clock startDate must not return");
});

// Negative control: a naive builder with no offset must be caught by the same assertion.
ok("negative control: offset-less output is detected as wrong", () => {
  assert.throws(() => assert.equal("2026-10-10T19:00:00", pns.startDate));
  assert.throws(() => assert.equal(eventIsoWithOffset("2026-10-10", "19:00", NY), eventIsoWithOffset("2026-10-10", "19:00", CH)), undefined);
});
console.log(`check-event-jsonld-offset: ok - ${n} checks (helper + real eventJsonLd + open-now clock; 2 page builders by role)`);
