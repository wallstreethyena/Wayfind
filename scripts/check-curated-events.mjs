#!/usr/bin/env node
// scripts/check-curated-events.mjs — proves the curated-events contract by
// EXECUTING it. Every failure this guards against is a publishing failure, and
// each is worse than showing nothing:
//   * a paused or discontinued event surfaced with a rolled-forward date
//   * schema carrying a start time nobody actually knows
//   * a rail that collapses into "the four biggest theme parks, forever"
//   * a Tier 5 creator video establishing a date

import assert from "node:assert/strict";
import {
  isEligible, rankEvents, composeRail, buildRail, eventJsonLd, scoreEvent,
  daysUntil, needsRecheck, recheckIntervalDays, dateRangeLabel, DISPLAYABLE_STATUS,
} from "../lib/curatedEvents.js";

const NOW = new Date("2026-08-13T12:00:00-04:00");
let n = 0;
const ok = (label, fn) => { try { fn(); n++; } catch (e) { console.error(`check-curated-events: FAIL — ${label}\n  ${e.message}`); process.exit(1); } };

const base = {
  event_series_id: "s", city: "Tampa", card_hook: "hook", source_tier: 1,
  verification_confidence: "high", last_verified_at: "2026-08-13",
  event_status: "scheduled", editorial_score: 8, uniqueness_score: 5,
  popularity_score: 5, lat: 27.95, lng: -82.46, audience: [], tags: [],
};
const ev = (o) => ({ ...base, ...o });

/* 1 — nothing unverified ships */
ok("a paused event is never eligible", () =>
  assert.equal(isEligible(ev({ event_status: "paused", start_date: "2027-05-01" }), { now: NOW }), false));
ok("an unannounced event is never eligible", () =>
  assert.equal(isEligible(ev({ event_status: "unannounced", start_date: "2026-10-31" }), { now: NOW }), false));
ok("a cancelled event is never eligible", () =>
  assert.equal(isEligible(ev({ event_status: "cancelled", start_date: "2026-10-01" }), { now: NOW }), false));
ok("Tier 5 discovers but never dates", () => {
  assert.equal(isEligible(ev({ start_date: "2026-10-01", source_tier: 5 }), { now: NOW }), false);
  assert.equal(isEligible(ev({ start_date: "2026-10-01", source_tier: 1 }), { now: NOW }), true);
});
ok("low confidence is not publishable", () =>
  assert.equal(isEligible(ev({ start_date: "2026-10-01", verification_confidence: "low" }), { now: NOW }), false));
ok("finished drops out, mid-run stays in", () => {
  assert.equal(isEligible(ev({ start_date: "2026-07-01", end_date: "2026-07-10" }), { now: NOW }), false);
  const running = ev({ start_date: "2026-08-07", end_date: "2026-10-31" });
  assert.equal(isEligible(running, { now: NOW }), true);
  assert.equal(daysUntil(running, NOW), 0);
});
ok("no hook means not shippable", () =>
  assert.equal(isEligible(ev({ start_date: "2026-10-01", card_hook: null }), { now: NOW }), false));
ok("DISPLAYABLE_STATUS excludes every non-live state", () => {
  for (const bad of ["paused", "unannounced", "cancelled", "postponed", "completed"])
    assert.equal(DISPLAYABLE_STATUS.has(bad), false, bad);
});

/* 2 — schema never invents a time */
ok("date-only startDate when the time is unknown", () => {
  const j = eventJsonLd(ev({ slug: "x", event_name: "Fantasy Fest", start_date: "2026-10-16", end_date: "2026-10-25", start_time: null }));
  assert.equal(j.startDate, "2026-10-16");
  assert.ok(!String(j.startDate).includes("T"), "must not fabricate a time");
});
ok("the time appears only when we hold one", () =>
  assert.equal(eventJsonLd(ev({ slug: "y", event_name: "P", start_date: "2026-10-16", start_time: "19:00:00" })).startDate, "2026-10-16T19:00:00"));
ok("a non-displayable event emits no schema", () => {
  assert.equal(eventJsonLd(ev({ event_status: "paused", slug: "s", start_date: "2027-05-01" })), null);
  assert.equal(eventJsonLd(ev({ event_status: "unannounced", slug: "g", start_date: "2026-10-31" })), null);
});
ok("free gets a zero offer; unknown price gets none", () => {
  assert.equal(eventJsonLd(ev({ slug: "g", event_name: "G", start_date: "2027-01-30", is_free: true })).offers.price, "0");
  assert.equal(eventJsonLd(ev({ slug: "u", event_name: "U", start_date: "2026-10-01", is_free: false })).offers, undefined);
});

/* 3 — rails discover, not just rank */
const POOL = [
  ev({ event_id: "hhn", event_series_id: "hhn", start_date: "2026-08-28", end_date: "2026-11-01", popularity_score: 9.8, uniqueness_score: 8.0, tags: ["halloween"] }),
  ev({ event_id: "mnsshp", event_series_id: "mnsshp", start_date: "2026-08-07", end_date: "2026-10-31", popularity_score: 9.5, uniqueness_score: 7.0, tags: ["halloween"], audience: ["families"] }),
  ev({ event_id: "howl", event_series_id: "howl", start_date: "2026-09-11", end_date: "2026-10-31", popularity_score: 8.6, uniqueness_score: 7.5, tags: ["halloween"] }),
  ev({ event_id: "edc", event_series_id: "edc", start_date: "2026-11-06", end_date: "2026-11-08", popularity_score: 9.2, uniqueness_score: 7.0, tags: [] }),
  ev({ event_id: "fantasy", event_series_id: "fantasy", start_date: "2026-10-16", end_date: "2026-10-25", popularity_score: 8.2, uniqueness_score: 9.8, tags: ["halloween", "only-in-florida"] }),
  ev({ event_id: "hula", event_series_id: "hula", start_date: "2026-10-22", end_date: "2026-10-25", popularity_score: 8.0, uniqueness_score: 9.5, tags: ["halloween", "only-in-florida"] }),
  ev({ event_id: "crystal", event_series_id: "crystal", start_date: "2026-11-13", end_date: "2026-11-16", popularity_score: 6.8, uniqueness_score: 9.0, tags: ["fall"] }),
  ev({ event_id: "hunsader", event_series_id: "hunsader", start_date: "2026-10-10", end_date: "2026-10-25", popularity_score: 6.0, uniqueness_score: 7.5, tags: ["fall"], audience: ["families"] }),
];
const CTX = { now: NOW, lat: 27.95, lng: -82.46 };

ok("a rail never becomes a list of the biggest theme parks", () => {
  const r = composeRail(rankEvents(POOL, CTX), { size: 6 });
  assert.ok(r.filter((e) => Number(e.popularity_score) >= 8.5).length <= 2);
  assert.ok(r.length >= 3, "a rail must never ship as a shelf");
});
ok("the unexpected finds are not crowded out", () => {
  const ids = composeRail(rankEvents(POOL, CTX), { size: 6 }).map((e) => e.event_id);
  assert.ok(ids.some((id) => ["fantasy", "hula", "crystal"].includes(id)), ids.join(","));
});
ok("the strongest card leads the rail", () => {
  const s = composeRail(rankEvents(POOL, CTX), { size: 6 }).map((e) => e._score);
  assert.deepEqual(s, [...s].sort((a, b) => b - a));
});
ok("one event per series", () => {
  const dupes = [...POOL, ev({ event_id: "hhn-b", event_series_id: "hhn", start_date: "2026-09-01", popularity_score: 9.8 })];
  const s = composeRail(rankEvents(dupes, CTX), { size: 8 }).map((e) => e.event_series_id);
  assert.equal(new Set(s).size, s.length);
});
ok("a thin rail returns null rather than a shelf", () =>
  assert.equal(buildRail("spooky-season", [POOL[0]], { now: NOW }), null));
ok("audience context reorders the rail", () => {
  const fam = rankEvents(POOL, { ...CTX, audience: "families" }).map((e) => e.event_id);
  const neu = rankEvents(POOL, CTX).map((e) => e.event_id);
  assert.notDeepEqual(fam, neu);
  assert.ok(fam.indexOf("hunsader") < neu.indexOf("hunsader"));
});
ok("proximity matters", () => {
  assert.ok(scoreEvent(ev({ start_date: "2026-10-01", lat: 27.95, lng: -82.46 }), CTX) >
            scoreEvent(ev({ start_date: "2026-10-01", lat: 24.55, lng: -81.80 }), CTX));
});
ok("the spooky rail contains only Halloween events", () => {
  const rail = buildRail("spooky-season", POOL, CTX);
  assert.ok(rail);
  for (const e of rail.cards) assert.ok(e.tags.includes("halloween"), e.event_id);
});

/* 4 — freshness + display */
ok("re-check cadence tightens as the event approaches", () => {
  assert.equal(recheckIntervalDays(ev({ start_date: "2026-08-16" }), NOW), 1);
  assert.equal(recheckIntervalDays(ev({ start_date: "2026-09-01" }), NOW), 7);
  assert.equal(recheckIntervalDays(ev({ start_date: "2026-10-15" }), NOW), 14);
  assert.equal(recheckIntervalDays(ev({ start_date: "2027-01-30" }), NOW), 30);
});
ok("a never-verified row is always due", () => {
  assert.equal(needsRecheck(ev({ start_date: "2026-10-01", last_verified_at: "2026-08-13" }), NOW), false);
  assert.equal(needsRecheck(ev({ start_date: "2026-10-01", last_verified_at: null }), NOW), true);
});
ok("date labels read like a human wrote them", () => {
  assert.equal(dateRangeLabel({ start_date: "2026-10-16", end_date: "2026-10-25" }), "Oct 16–25");
  assert.equal(dateRangeLabel({ start_date: "2027-01-30" }), "Jan 30");
  assert.equal(dateRangeLabel({ start_date: "2026-08-07", end_date: "2026-10-31" }), "Aug 7 – Oct 31");
});

console.log(`check-curated-events: OK — ${n} assertions`);
