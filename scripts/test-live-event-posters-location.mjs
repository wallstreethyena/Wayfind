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
import { readFileSync } from "node:fs";
import { posterEventsKey, isSettledCurrent } from "../app/components/usePosterEvents.js";
import {
  currentLivePosterTile, livePosterCandidateKey,
} from "../app/components/useLivePosterTiles.js";
import {
  livePosterCandidates, mayHaveUsableLivePosterArt,
  resolveLivePosterTile, LIVE_POSTER_MAX_ATTEMPTS, LIVE_POSTER_MAX_RANKED_SCAN, LIVE_POSTER_REQUEST_TIMEOUT_MS,
} from "../lib/livePosterSelection.js";
import { selectPosterEvents, posterEventBucket } from "../lib/posterEvents.js";
import { LIVE_POSTER_TYPE_CONFIG } from "../lib/liveEventPosterTypes.js";
import {
  eventMayHaveUsableProviderArt, isNotEventArtwork as sharedIsNotEventArtwork,
  isPlaceholderTmUrl as sharedIsPlaceholderTmUrl, livePosterSourceCanPossiblyFit,
  LIVE_POSTER_MIN_CROP_WIDTH,
} from "../lib/livePosterCandidate.js";
import { isNotEventArtwork as serverIsNotEventArtwork, isPlaceholderTmUrl as serverIsPlaceholderTmUrl } from "../lib/posterImageFit.js";

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

 // This suite proves location/bucket wiring, not today's calendar boundary.
 // Pin the selector clock to the owner-spec date so the 2026-09-25 fixture
 // cannot turn into a past event merely because CI runs after that date.
const FIXTURE_NOW = new Date("2026-09-16T12:00:00.000Z");
const selectFixturePosterEvents = (events, opts) => selectPosterEvents(events, { ...opts, now: FIXTURE_NOW });

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
  const sportsRail = selectFixturePosterEvents(pool, { mode: "summer-sports", center: BRADENTON });
  const concertsRail = selectFixturePosterEvents(pool, { mode: "date-night", center: BRADENTON });
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
  const sportsRail = selectFixturePosterEvents(musicOnlyPool, { mode: "summer-sports", center: BRADENTON });
  const concertsRail = selectFixturePosterEvents(musicOnlyPool, { mode: "date-night", center: BRADENTON });
  assert.deepEqual(sportsRail.sports, [], "sports must be a real empty array (not undefined, not an error) when the pool has no sporting events");
  assert.equal(concertsRail.livemusic.length, 1, "concerts must be entirely unaffected by sports having nothing to show");

  const sportsOnlyPool = [makeEvent({ id: "s1", segment: "Sports", genre: "Baseball" })];
  const sportsRail2 = selectFixturePosterEvents(sportsOnlyPool, { mode: "summer-sports", center: BRADENTON });
  const concertsRail2 = selectFixturePosterEvents(sportsOnlyPool, { mode: "date-night", center: BRADENTON });
  assert.equal(sportsRail2.sports.length, 1, "sports must be entirely unaffected by concerts having nothing to show");
  assert.deepEqual(concertsRail2.livemusic, [], "concerts must be a real empty array when the pool has no music events");
});

// --- 7. Cancelled/invalid events and events outside the radius are
// excluded by the SAME existing pipeline validation both posters share --
check(() => {
  const farAway = makeEvent({ id: "far", segment: "Sports", genre: "Baseball", lat: 40.7128, lng: -74.006 }); // NYC
  const noDest = makeEvent({ id: "nodest", segment: "Sports", genre: "Baseball", dest: "" });
  const rail = selectFixturePosterEvents([farAway, noDest], { mode: "summer-sports", center: BRADENTON });
  assert.deepEqual(rail.sports, [], "an event far outside the radius and an event with no real destination must both be excluded, not shown");
});

// --- 8. No duplicate event inside the same poster's pool -----------------
check(() => {
  const dup = makeEvent({ id: "dup1", segment: "Music", genre: "Rock" });
  const rail = selectFixturePosterEvents([dup, { ...dup }], { mode: "date-night", center: BRADENTON });
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

// --- 11. The browser suite must locate the synthetic rail tiles that the
// current renderer actually emits. The old standalone LiveEventPoster used
// data-live-poster-* attributes; #1360 deleted that component when the two
// posters moved into DaypartRail, so retaining those selectors makes every
// browser assertion time out before it checks location or routing.
check(() => {
  const tileSource = readFileSync(new URL("../app/components/useLivePosterTiles.js", import.meta.url), "utf8");
  const workerSource = readFileSync(new URL("../lib/livePosterSelection.js", import.meta.url), "utf8");
  const railSource = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
  const browserSource = readFileSync(new URL("../tests/e2e/live-event-posters.spec.js", import.meta.url), "utf8");
  assert.match(workerSource, /id: `live-\$\{type\}`/, "synthetic poster ids must remain live-<type>");
  assert.match(tileSource, /resolveLivePosterTile\(type, config, rankedEvents/, "the hook must render through the lazy tile worker");
  assert.match(railSource, /data-id=\{id\}/, "DaypartRail must expose the synthetic rail id on its rendered tile");
  assert.match(browserSource, /page\.locator\(`\[data-id="live-\$\{type\}"\]`\)/, "the browser suite must locate the rendered synthetic rail id");
  assert.doesNotMatch(browserSource, /data-live-poster-(?:type|event-id)/, "the browser suite must not target attributes from the deleted standalone poster component");
});

// --- 12. Artwork work settles and repaired event data invalidates the old
// tile even when the provider keeps the same event id.
check(() => {
  const tileSource = readFileSync(new URL("../app/components/useLivePosterTiles.js", import.meta.url), "utf8");
  const workerSource = readFileSync(new URL("../lib/livePosterSelection.js", import.meta.url), "utf8");
  assert.equal(LIVE_POSTER_REQUEST_TIMEOUT_MS, 10000, "each live-poster image request must have a finite reader-facing deadline");
  assert.match(workerSource, /fetchJsonWithDeadline\("\/api\/live-poster", \{[\s\S]{0,120}timeoutMs: LIVE_POSTER_REQUEST_TIMEOUT_MS/, "the lazy live-poster worker must use the shared bounded JSON client");
  assert.match(tileSource, /await import\("\.\.\/\.\.\/lib\/livePosterSelection\.js"\)/, "poster artwork work must remain outside the initial homepage bundle");

  const original = makeEvent({ id: "same", image: "https://img.example/old.jpg", dest: "/events/old" });
  const repairedImage = { ...original, image: "https://img.example/repaired.jpg" };
  const repairedDest = { ...original, dest: "/events/repaired" };
  const repairedDimensions = { ...original, imageVariants: [{ url: original.image, ratio: "16_9", width: 2048, height: 1152 }] };
  const repairedSport = { ...original, segment: "Sports", genre: "Baseball", subGenre: "MLB", source: "Ticketmaster" };
  assert.notEqual(livePosterCandidateKey([original]), livePosterCandidateKey([repairedImage]), "same-id image repair must trigger a new fitted poster request");
  assert.notEqual(livePosterCandidateKey([original]), livePosterCandidateKey([repairedDest]), "same-id destination repair must replace the old poster link");
  assert.notEqual(livePosterCandidateKey([original]), livePosterCandidateKey([repairedDimensions]), "same-id dimension repair must re-run the browser prefilter");
  assert.notEqual(livePosterCandidateKey([original]), livePosterCandidateKey([repairedSport]), "same-id classification repair must re-evaluate owner art");
});

// --- 13. Six definitively unusable leaders do not hide a valid rank 7.
// The browser only skips facts the server would reject without judgement:
// venue/stock URLs, provider placeholder art, or variants whose declared
// dimensions cannot retain the server's 640px minimum after a 9:16 crop.
check(() => {
  const venue = (id) => makeEvent({ id, segment: "Sports", genre: "Football", image: `/api/photo?place=${id}&w=800` });
  const placeholder = (id) => makeEvent({ id, segment: "Sports", genre: "Football", image: `https://s1.ticketm.net/dam/c/${id}/generic.jpg` });
  const tooSmall = (id) => makeEvent({ id, segment: "Sports", genre: "Football", image: `https://s1.ticketm.net/dam/a/${id}/small.jpg`, imageVariants: [
    { url: `https://s1.ticketm.net/dam/a/${id}/small.jpg`, width: 1024, height: 576, ratio: "16_9" },
  ] });
  const valid7 = makeEvent({ id: "valid7", name: "Rank Seven Sport", segment: "Sports", genre: "Soccer", image: "https://s1.ticketm.net/dam/a/valid7/large.jpg", imageVariants: [
    { url: "https://s1.ticketm.net/dam/a/valid7/large.jpg", width: 2048, height: 1152, ratio: "16_9" },
  ] });
  const ranked = [venue("v1"), placeholder("p2"), tooSmall("s3"), venue("v4"), placeholder("p5"), tooSmall("s6"), valid7];
  assert.equal(LIVE_POSTER_MAX_ATTEMPTS, 6, "the expensive image-processing budget must remain six");
  assert.equal(LIVE_POSTER_MAX_RANKED_SCAN, 24, "the cheap ranked scan must remain explicitly bounded");
  assert.deepEqual(livePosterCandidates("sports", ranked).map((e) => e.id), ["valid7"], "a valid rank 7 must survive six proven no-art leaders without weakening any art gate");
});

// --- 14. A genuinely unavailable bucket remains unavailable; the prefilter
// does not invent a candidate merely to force a tile.
check(() => {
  const unavailable = Array.from({ length: 30 }, (_, i) => makeEvent({
    id: `bad-${i}`, segment: "Sports", genre: "Football", image: `https://s1.ticketm.net/dam/c/${i}/generic.jpg`,
  }));
  assert.deepEqual(livePosterCandidates("sports", unavailable), [], "all unavailable artwork must still fail closed across the entire bounded raw scan");
});

// --- 15. Owner-supplied baseball and concert art remain first-class even
// without provider images, while the two buckets stay isolated.
check(() => {
  const baseball = makeEvent({ id: "baseball", name: "Orlando Baseball", segment: "Sports", genre: "Baseball", image: null, thumb: null, imageVariants: [] });
  const concert = makeEvent({ id: "concert", name: "Orlando Live", segment: "Music", genre: "Rock", image: null, thumb: null, imageVariants: [] });
  assert.equal(mayHaveUsableLivePosterArt("sports", baseball), true, "owner baseball art must bypass provider-image prefiltering");
  assert.deepEqual(livePosterCandidates("sports", [baseball]).map((e) => e.id), ["baseball"], "owner baseball event must remain selected in ranked order");
  assert.equal(mayHaveUsableLivePosterArt("concerts", baseball), false, "owner baseball art must never leak into Concerts");
  assert.equal(mayHaveUsableLivePosterArt("concerts", concert), true, "owner concert art must bypass provider-image prefiltering");
  assert.deepEqual(livePosterCandidates("concerts", [concert]).map((e) => e.id), ["concert"], "owner concert event must remain selected in ranked order");
  assert.equal(mayHaveUsableLivePosterArt("sports", concert), false, "owner concert art must never leak into Sporting Events");
});

// --- 16. The cheap browser prefilter and authoritative server import the same
// URL gates and crop geometry, so a future rule change cannot strand one side.
check(() => {
  assert.equal(serverIsNotEventArtwork, sharedIsNotEventArtwork, "client and server must share one non-event-artwork predicate");
  assert.equal(serverIsPlaceholderTmUrl, sharedIsPlaceholderTmUrl, "client and server must share one Ticketmaster-placeholder predicate");
  assert.equal(LIVE_POSTER_MIN_CROP_WIDTH, 640);
  assert.equal(livePosterSourceCanPossiblyFit({ url: "https://img.example/large.jpg", width: 2048, height: 1152 }), true);
  assert.equal(livePosterSourceCanPossiblyFit({ url: "https://img.example/small.jpg", width: 1024, height: 576 }), false);
  assert.equal(eventMayHaveUsableProviderArt({ image: "https://s1.ticketm.net/dam/c/generic.jpg" }), false);
  assert.equal(eventMayHaveUsableProviderArt({ image: "https://img.example/provider-no-metadata.jpg" }), true, "provider art with unknown dimensions must reach authoritative byte inspection");
  assert.equal(eventMayHaveUsableProviderArt({}), false, "an event with no image path must remain definitively unavailable");
  assert.equal(eventMayHaveUsableProviderArt({
    image: "https://img.example/known-small.jpg",
    imageVariants: [{ url: "https://img.example/known-small.jpg", width: 1024, height: 576 }],
  }), false, "a duplicate dimensionless image field must not override its known undersized variant");
});

// --- 17. A tile belongs to the complete candidate identity that produced it.
// Once a new feed settles, its replacement artwork may still be resolving;
// the old city's (or repaired same-id event's) tile must stay hidden then.
check(() => {
  const oldCandidates = [makeEvent({ id: "same", city: "Bradenton", image: "https://img.example/old.jpg" })];
  const newCandidates = [makeEvent({ id: "same", city: "Orlando", image: "https://img.example/new.jpg" })];
  const oldKey = livePosterCandidateKey(oldCandidates);
  const newKey = livePosterCandidateKey(newCandidates);
  const oldTile = { id: "live-concerts", title: "Old city event" };
  const oldState = { candidateKey: oldKey, tile: oldTile };

  assert.equal(currentLivePosterTile(oldState, oldKey, false), oldTile, "a settled tile remains visible for the exact candidates that produced it");
  assert.equal(currentLivePosterTile(oldState, oldKey, true), null, "feed loading hides even a matching tile");
  assert.equal(currentLivePosterTile(oldState, newKey, false), null, "a newly settled feed must not flash the old tile while replacement artwork resolves");
  assert.equal(currentLivePosterTile({ candidateKey: newKey, tile: oldTile }, newKey, false), oldTile, "the replacement becomes visible only after state carries the new candidate key");
});

// --- 18. The lazy worker preserves owner art, ordered fallback and stale-work
// cancellation at its executable network boundary.
n++;
const realFetch = globalThis.fetch;
try {
  const ownerEvent = makeEvent({ id: "owner-worker", name: "Orlando Baseball", segment: "Sports", genre: "Baseball", image: null });
  const ownerConcert = makeEvent({ id: "owner-concert", name: "Orlando Live Tonight", segment: "Music", genre: "Rock", image: null });
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; throw new Error("owner art must not fetch"); };
  const ownerTile = await resolveLivePosterTile("sports", LIVE_POSTER_TYPE_CONFIG.sports, [ownerEvent]);
  assert.equal(ownerTile?.href, ownerEvent.dest);
  assert.equal(ownerTile?.title, ownerEvent.name);
  assert.equal(ownerTile?.livePosterEventId, ownerEvent.id);
  assert.equal(ownerTile?.livePosterStrategy, "owner-art");
  const concertTile = await resolveLivePosterTile("concerts", LIVE_POSTER_TYPE_CONFIG.concerts, [ownerConcert]);
  assert.equal(concertTile?.href, ownerConcert.dest);
  assert.equal(concertTile?.title, ownerConcert.name);
  assert.equal(concertTile?.livePosterEventId, ownerConcert.id);
  assert.equal(concertTile?.livePosterStrategy, "owner-art");
  assert.equal(fetches, 0, "baseball and concert owner art must resolve without fitted-art requests");

  const invalidDest = { ...ownerConcert, id: "missing-dest", dest: "" };
  const invalidName = { ...ownerConcert, id: "missing-name", name: "" };
  assert.equal(await resolveLivePosterTile("concerts", LIVE_POSTER_TYPE_CONFIG.concerts, [invalidDest, invalidName]), null, "owner art must not create a tile without event identity and destination");
  assert.equal(fetches, 0, "invalid owner-art events must fail before any fitted-art request");

  const laterConcert = { ...ownerConcert, id: "owner-concert-2", name: "Later Ranked Concert", dest: "/events/orlando/later" };
  const rankedTile = await resolveLivePosterTile("concerts", LIVE_POSTER_TYPE_CONFIG.concerts, [ownerConcert, laterConcert]);
  assert.equal(rankedTile?.livePosterEventId, ownerConcert.id, "owner concert art must preserve event ranking");
  assert.equal(rankedTile?.href, ownerConcert.dest, "owner concert art must preserve the winning event destination");

  const first = makeEvent({ id: "fit-first", segment: "Sports", genre: "Football", image: "https://img.example/first.jpg" });
  const second = makeEvent({ id: "fit-second", name: "Second Honest Sport", segment: "Sports", genre: "Soccer", image: "https://img.example/second.jpg" });
  const payloads = [
    { ok: false },
    { ok: true, dataUrl: "data:image/webp;base64,good", event: second, strategy: "attention" },
  ];
  fetches = 0;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payloads[fetches++] });
  const fittedTile = await resolveLivePosterTile("sports", LIVE_POSTER_TYPE_CONFIG.sports, [first, second]);
  assert.equal(fetches, 2, "one rejected fit must advance exactly once to the next ranked candidate");
  assert.equal(fittedTile?.livePosterEventId, second.id);
  assert.equal(fittedTile?.href, second.dest);
  assert.equal(fittedTile?.livePosterStrategy, "attention");

  let stale = false;
  let releaseFirst;
  fetches = 0;
  globalThis.fetch = () => {
    fetches++;
    return new Promise((resolve) => { releaseFirst = () => resolve({ ok: true, status: 200, json: async () => ({ ok: false }) }); });
  };
  const pendingTile = resolveLivePosterTile("sports", LIVE_POSTER_TYPE_CONFIG.sports, [first, second], () => stale);
  await new Promise((resolve) => setTimeout(resolve, 0));
  stale = true;
  releaseFirst();
  assert.equal(await pendingTile, null);
  assert.equal(fetches, 1, "cancellation after a pending fit must suppress every remaining candidate POST");

  fetches = 0;
  globalThis.fetch = async () => { fetches++; throw new Error("cancelled work must not fetch"); };
  assert.equal(await resolveLivePosterTile("sports", LIVE_POSTER_TYPE_CONFIG.sports, [first], () => true), null);
  assert.equal(fetches, 0, "cancellation before the first candidate must issue no POST");
} finally {
  globalThis.fetch = realFetch;
}

console.log(`test-live-event-posters-location: ${n} checks passed`);
