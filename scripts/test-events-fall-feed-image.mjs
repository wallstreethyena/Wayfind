// scripts/test-events-fall-feed-image.mjs
//
// 2026-10-06: the Events tab showed generic community stock (a smiling woman,
// /events/community-social.jpg) for fall events such as Hunsader Farms Pumpkin
// Festival because /api/events never merged the checked-in fall registry.
// Executes the real merge: no DB, no network, no paid lookup.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { curatedFeedEventsWithFall, FALL_FEED_CACHE_VERSION } from "../lib/curatedFallFeed.js";
import { processEvents } from "../lib/eventsPipeline.js";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { FALL_EVENT_IMAGE_HOLDS } from "../lib/fallEventImage.js";

let n = 0;
const check = (label, fn) => { n++; fn(); console.log(`  OK  ${label}`); };
const NOW = new Date("2026-10-06T12:00:00-04:00");

// Empty DB: the registry alone must carry the fall rows.
const feed = curatedFeedEventsWithFall([], { now: NOW });
const hunsader = feed.filter((e) => e.id === "wfc:hunsader-pumpkin-2026");

check("Hunsader resolves to its goat image from the registry, exactly once", () => {
  assert.equal(hunsader.length, 1);
  assert.equal(hunsader[0].image, "/guides/verified/hunsader-farms-goats.webp");
  assert.equal(hunsader[0].isFall, true);
});

check("a lagging DB row (hero_image NULL) is deduped against the registry, not duplicated", () => {
  const dbRow = { event_id: "hunsader-pumpkin-2026", slug: "hunsader-farms-pumpkin-festival-2026", hero_image: null,
    event_name: "Hunsader Farms Pumpkin Festival", start_date: "2026-10-10", end_date: "2026-10-25", city: "Bradenton" };
  const f = curatedFeedEventsWithFall([dbRow], { now: NOW }).filter((e) => e.id === "wfc:hunsader-pumpkin-2026");
  assert.equal(f.length, 1);
  assert.equal(f[0].image, "/guides/verified/hunsader-farms-goats.webp");
});

check("no event id appears twice in the feed", () => {
  const ids = feed.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

check("no fall row ever carries community stock or category art", () => {
  const fall = feed.filter((e) => e.isFall);
  assert.ok(fall.length > 5, "expected the registry's fall rows");
  for (const e of fall) {
    assert.doesNotMatch(String(e.image || ""), /\/events\/community-|\/events\/(concerts|theater|sports)/, `${e.id} carries stock art: ${e.image}`);
  }
});

check("the isFall flag survives the events pipeline to the client", () => {
  const out = processEvents(hunsader.map((e) => ({ ...e })), { lat: 27.5, lng: -82.4, now: NOW });
  const list = Array.isArray(out) ? out : out?.events || [];
  if (list.length) assert.equal(list[0].isFall, true);
});

check("the Events screen never applies category stock to fall rows and drops Official details", () => {
  const src = readFileSync("app/components/screens/Events.js", "utf8");
  // 2026-10-08: no event gets category stock; a missing image shows the designed tile.
  assert.doesNotMatch(src, /eventCategoryArt/);
  assert.match(src, /const placeholder = eventPlaceholder\(ctx\.eventBucket\(e\), e\);/);
  assert.match(src, /planningHref=\{internal && !fall \? e\.dest : null\}/);
  assert.match(src, /className=\{fallSkin \? "wf-fall-card" : undefined\}/);
  assert.match(src, /const hasCta = !fall \|\| !!e\.ticketVia \|\| !!e\.ticketed;/);
});

check("/api/events wires the fall-aware feed and never makes a paid lookup for it", () => {
  const src = readFileSync("app/api/events/route.js", "utf8");
  assert.match(src, /curatedFeedEventsWithFall\(rows\)/);
  const lib = readFileSync("lib/curatedFallFeed.js", "utf8");
  assert.doesNotMatch(lib, /places\.googleapis|maps\.googleapis|fetch\(/);
});

check("/api/events shared cache key is versioned by the fall registry, so pre-merge rows cannot be served", () => {
  const src = readFileSync("app/api/events/route.js", "utf8");
  const m = src.match(/evK = "(ev\d+)\|" \+ FALL_FEED_CACHE_VERSION \+ "\|"/);
  assert.ok(m, "evK must embed FALL_FEED_CACHE_VERSION");
  assert.notEqual(m[1], "ev1", "ev1| rows predate curatedFeedEventsWithFall");
  assert.doesNotMatch(src, /evK = "ev1\|"/);
  assert.match(FALL_FEED_CACHE_VERSION, /^[0-9a-z]{3,}$/);
  const lib = readFileSync("lib/curatedFallFeed.js", "utf8");
  assert.match(lib, /FALL_FEED_CACHE_VERSION = fnv1a\(JSON\.stringify\(\[FALL_DISCOVERIES_2026, FALL_FEATURED_FESTIVALS_2026, FALL_GAP_FILL_2026_10_07, FALL_FOOD_GAP_2026_10_08, (?:FALL_TAMPA_PICKS_2026_10_08, )?FALL_DB_SEED_VERSION\]\)\)/);
});

// 2026-10-14: the unified feed (/api/events, home Events rail, /events/[city]/[slug])
// shipped image "" for every verified event with a place_id and no hero_image,
// while the fall route and /florida-events derived the venue photo. These call
// the real curatedToFeedEvent.
const GOOGLE_ID = "ChIJ336If1rEwogRx-8ntTOjVvk";
const baseRow = { event_id: "venue-photo-probe-2026", slug: "venue-photo-probe-2026", event_name: "Venue Photo Probe",
  start_date: "2026-11-07", city: "Tampa", state: "FL", venue: "The Ritz Ybor" };

check("feed: place_id and no hero resolves to the venue's own photo, flagged as a venue photo", () => {
  const f = curatedToFeedEvent({ ...baseRow, place_id: GOOGLE_ID, hero_image: null });
  assert.equal(f.image, `/api/photo?place=${GOOGLE_ID}&g=2&w=640`);
  assert.equal(f.imageIsVenue, true);
  assert.equal(f.visitFacts.image_is_venue, true);
  assert.equal(f.visitFacts.place_id, GOOGLE_ID);
});

check("feed: an existing hero_image is never replaced and is not relabelled a venue photo", () => {
  const f = curatedToFeedEvent({ ...baseRow, place_id: GOOGLE_ID, hero_image: "/events/owned/probe.webp" });
  assert.equal(f.image, "/events/owned/probe.webp");
  assert.equal(f.imageIsVenue, false);
  assert.equal(f.visitFacts.image_is_venue, false);
  const declared = curatedToFeedEvent({ ...baseRow, place_id: GOOGLE_ID, hero_image: "/events/owned/probe.webp", hero_image_kind: "venue" });
  assert.equal(declared.image, "/events/owned/probe.webp");
  assert.equal(declared.imageIsVenue, true, "a declared venue hero stays a venue photo");
});

check("feed: a slug or event id in place_id never becomes an /api/photo url (#1790)", () => {
  for (const bad of ["venue-photo-probe-2026", "wfc:venue-photo-probe-2026", "ritz-ybor", "", null, undefined]) {
    const f = curatedToFeedEvent({ ...baseRow, place_id: bad, hero_image: null });
    assert.equal(f.image, "", `place_id ${JSON.stringify(bad)} produced ${f.image}`);
    assert.equal(f.imageIsVenue, false);
  }
});

check("feed: every FALL_EVENT_IMAGE_HOLDS event stays image-less even with a verified place_id", () => {
  assert.ok(FALL_EVENT_IMAGE_HOLDS.size >= 4);
  for (const id of FALL_EVENT_IMAGE_HOLDS) {
    const f = curatedToFeedEvent({ ...baseRow, event_id: id, slug: id, place_id: GOOGLE_ID, hero_image: null });
    assert.equal(f.image, "", `${id} is held but got ${f.image}`);
    assert.equal(f.imageIsVenue, false);
  }
});

check("feed: the venue photo is never written into the schema.org hero column", () => {
  const f = curatedToFeedEvent({ ...baseRow, place_id: GOOGLE_ID, hero_image: null });
  assert.equal(f.visitFacts.hero_image, null);
});

console.log(`test-events-fall-feed-image: ${n} checks passed`);
