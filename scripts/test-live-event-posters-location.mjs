// scripts/test-live-event-posters-location.mjs
//
// Proves the location-wiring laws from the owner's spec (2026-09-16) against
// the REAL, shipped functions -- not a re-implementation of them. Imports
// posterEventsKey/isSettledCurrent straight out of app/components/
// usePosterEvents.js (the exact stale-response guard every render uses) and
// selectPosterEvents/posterEventBucket straight out of lib/posterEvents.js
// (the exact classification every poster and every existing event rail
// already uses).

import assert from "node:assert/strict";
import { posterEventsKey, isSettledCurrent } from "../app/components/usePosterEvents.js";
import { selectPosterEvents, posterEventBucket } from "../lib/posterEvents.js";
import { LIVE_POSTER_TYPE_CONFIG } from "../lib/liveEventPosterTypes.js";

let n = 0;
const check = (fn) => { n++; fn(); };

// Real coordinates for the three cities named in the spec.
const BRADENTON = { lat: 27.4989, lng: -82.5748 };
const TAMPA = { lat: 27.9506, lng: -82.4572 };
const ORLANDO = { lat: 28.5384, lng: -81.3789 };

function makeEvent(over = {}) {
  return {
    id: over.id || `tm_${Math.random().toString(36).slice(2)}`,
    name: "Test Event", dest: "https://www.ticketmaster.com/event/x", destKind: "ticket",
    date: "2026-09-25", time: "19:00", lat: BRADENTON.lat, lng: BRADENTON.lng,
    segment: "", genre: "", ...over,
  };
}

// --- 1. The active location fully determines the request key -----------
check(() => {
  const kBradentonSports = posterEventsKey({ active: true, disabled: false, lat: BRADENTON.lat, lng: BRADENTON.lng, city: "Bradenton", mode: "summer-sports" });
  const kBradentonConcerts = posterEventsKey({ active: true, disabled: false, lat: BRADENTON.lat, lng: BRADENTON.lng, city: "Bradenton", mode: "date-night" });
  assert.ok(kBradentonSports.includes("Bradenton"), "the sports request key must carry the active city");
  assert.ok(kBradentonConcerts.includes("Bradenton"), "the concerts request key must carry the active city");
  assert.notEqual(kBradentonSports, kBradentonConcerts, "sports and concerts are independent requests, never the same key");
});

// --- 2/3. Changing the selector produces a genuinely different key for
// BOTH posters, city by city, exactly the sequence in the spec ----------
check(() => {
  for (const type of ["sports", "concerts"]) {
    const mode = LIVE_POSTER_TYPE_CONFIG[type].mode;
    const kB = posterEventsKey({ active: true, disabled: false, lat: BRADENTON.lat, lng: BRADENTON.lng, city: "Bradenton", mode });
    const kT = posterEventsKey({ active: true, disabled: false, lat: TAMPA.lat, lng: TAMPA.lng, city: "Tampa", mode });
    const kO = posterEventsKey({ active: true, disabled: false, lat: ORLANDO.lat, lng: ORLANDO.lng, city: "Orlando", mode });
    assert.notEqual(kB, kT, `${type}: Bradenton -> Tampa must be a different request`);
    assert.notEqual(kT, kO, `${type}: Tampa -> Orlando must be a different request`);
    assert.notEqual(kB, kO, `${type}: Bradenton and Orlando must never collide`);
  }
});

// --- 4. The exact race: a late Bradenton response cannot win once the
// active key has already moved to Tampa ----------------------------------
check(() => {
  const mode = "summer-sports";
  const kBradenton = posterEventsKey({ active: true, disabled: false, lat: BRADENTON.lat, lng: BRADENTON.lng, city: "Bradenton", mode });
  const kTampa = posterEventsKey({ active: true, disabled: false, lat: TAMPA.lat, lng: TAMPA.lng, city: "Tampa", mode });
  // Bradenton's fetch finally resolves AFTER the user has already moved to
  // Tampa -- this is exactly "Bradenton response arrives late" from the spec.
  const lateBradentonSettled = { key: kBradenton, failed: false, byRail: { sports: [makeEvent({ name: "Old city event" })] } };
  assert.equal(isSettledCurrent(lateBradentonSettled, kTampa), false, "a late response keyed to the OLD city must never be accepted as current once the active key is Tampa");
  // And the correct, matching response for Tampa DOES get accepted.
  const onTimeTampaSettled = { key: kTampa, failed: false, byRail: { sports: [makeEvent({ name: "Tampa event" })] } };
  assert.equal(isSettledCurrent(onTimeTampaSettled, kTampa), true, "a response that matches the currently active key must be accepted");
});

// --- 5. Sports responses cannot populate Concerts, and vice versa,
// straight from real Ticketmaster segment values -------------------------
check(() => {
  const pool = [
    makeEvent({ id: "s1", name: "Rays vs Red Sox", segment: "Sports", genre: "Baseball" }),
    makeEvent({ id: "s2", name: "Bucs vs Dolphins", segment: "Sports", genre: "Football" }),
    makeEvent({ id: "m1", name: "Touring Band Live", segment: "Music", genre: "Rock" }),
    makeEvent({ id: "m2", name: "Singer-Songwriter Night", segment: "Music", genre: "Pop" }),
    makeEvent({ id: "c1", name: "Comedy Night at the Club", segment: "Arts & Theatre", genre: "Comedy" }),
    makeEvent({ id: "t1", name: "Broadway Touring Show", segment: "Arts & Theatre", genre: "Theatre" }),
  ];
  const sportsRail = selectPosterEvents(pool, { mode: "summer-sports", center: BRADENTON });
  const concertsRail = selectPosterEvents(pool, { mode: "date-night", center: BRADENTON });
  const sportsIds = sportsRail.sports.map((e) => e.id).sort();
  const concertIds = concertsRail.livemusic.map((e) => e.id).sort();
  assert.deepEqual(sportsIds, ["s1", "s2"], "the sports poster's pool must be exactly the two real sporting events, nothing else");
  assert.deepEqual(concertIds, ["m1", "m2"], "the concerts poster's pool must be exactly the two real music events, nothing else");
  assert.ok(!sportsIds.includes("m1") && !sportsIds.includes("m2"), "no music event may ever appear in the sports bucket");
  assert.ok(!concertIds.includes("s1") && !concertIds.includes("s2"), "no sporting event may ever appear in the concerts bucket");
  assert.ok(!concertIds.includes("c1"), "comedy must NOT appear in the Concerts poster -- the owner's spec lists only concerts and live music");
  assert.ok(!concertIds.includes("t1"), "theatre must NOT appear in the Concerts poster");
});

// --- 6. An empty Sports pool does not affect the Concerts pool, and an
// empty Concerts pool does not affect Sports -- proven by construction:
// each poster is an INDEPENDENT call with no shared state ----------------
check(() => {
  const musicOnlyPool = [makeEvent({ id: "m1", segment: "Music", genre: "Rock" })];
  const sportsRail = selectPosterEvents(musicOnlyPool, { mode: "summer-sports", center: BRADENTON });
  const concertsRail = selectPosterEvents(musicOnlyPool, { mode: "date-night", center: BRADENTON });
  assert.deepEqual(sportsRail.sports, [], "sports must be a real empty array (not undefined, not an error) when the pool has no sporting events");
  assert.equal(concertsRail.livemusic.length, 1, "concerts must be entirely unaffected by sports having nothing to show");

  const sportsOnlyPool = [makeEvent({ id: "s1", segment: "Sports", genre: "Baseball" })];
  const sportsRail2 = selectPosterEvents(sportsOnlyPool, { mode: "summer-sports", center: BRADENTON });
  const concertsRail2 = selectPosterEvents(sportsOnlyPool, { mode: "date-night", center: BRADENTON });
  assert.equal(sportsRail2.sports.length, 1, "sports must be entirely unaffected by concerts having nothing to show");
  assert.deepEqual(concertsRail2.livemusic, [], "concerts must be a real empty array when the pool has no music events");
});

// --- 7. Cancelled/invalid events and events outside the radius are
// excluded by the SAME existing pipeline validation both posters share --
check(() => {
  const farAway = makeEvent({ id: "far", segment: "Sports", genre: "Baseball", lat: 40.7128, lng: -74.006 }); // NYC
  const noDest = makeEvent({ id: "nodest", segment: "Sports", genre: "Baseball", dest: "" });
  const rail = selectPosterEvents([farAway, noDest], { mode: "summer-sports", center: BRADENTON });
  assert.deepEqual(rail.sports, [], "an event far outside the radius and an event with no real destination must both be excluded, not shown");
});

// --- 8. No duplicate event inside the same poster's pool -----------------
check(() => {
  const dup = makeEvent({ id: "dup1", segment: "Music", genre: "Rock" });
  const rail = selectPosterEvents([dup, { ...dup }], { mode: "date-night", center: BRADENTON });
  assert.equal(rail.livemusic.length, 1, "the same event id must never appear twice in one poster's pool");
});

// --- 9. The two live-poster types map onto real, pre-existing buckets,
// nothing invented for this feature ---------------------------------------
check(() => {
  assert.deepEqual(Object.keys(LIVE_POSTER_TYPE_CONFIG).sort(), ["concerts", "sports"], "exactly two poster types exist: sports and concerts");
  assert.equal(LIVE_POSTER_TYPE_CONFIG.sports.mode, "summer-sports");
  assert.equal(LIVE_POSTER_TYPE_CONFIG.sports.bucketKey, "sports");
  assert.equal(LIVE_POSTER_TYPE_CONFIG.concerts.mode, "date-night");
  assert.equal(LIVE_POSTER_TYPE_CONFIG.concerts.bucketKey, "livemusic");
});

// --- 10. posterEventBucket itself classifies by real segment/genre data,
// not by loose title-keyword search (checked directly against events whose
// NAME would mislead a keyword search but whose real classification is
// unambiguous) --------------------------------------------------------------
check(() => {
  // Title mentions "band" and "live" (concert-sounding words) but the real
  // TM segment says Sports -- a keyword classifier would get this wrong.
  const trickyTitle = makeEvent({ name: "Marching Band Live at the Halftime Show", segment: "Sports", genre: "Football" });
  assert.equal(posterEventBucket(trickyTitle), "sports", "classification must follow the real segment field, not words in the title");
  // Title has no music words at all but the real segment says Music.
  const plainTitle = makeEvent({ name: "TBA at Amalie Arena", segment: "Music", genre: "Pop" });
  assert.equal(posterEventBucket(plainTitle), "concerts", "classification must follow the real segment field even with a generic, non-descriptive title");
});

console.log(`test-live-event-posters-location: ${n} checks passed`);
