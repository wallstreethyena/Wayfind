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
  assert.match(src, /const categoryImage = fall \? "" : eventCategoryArt\(/);
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

console.log(`test-events-fall-feed-image: ${n} checks passed`);
