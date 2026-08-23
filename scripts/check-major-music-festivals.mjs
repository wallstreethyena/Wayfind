#!/usr/bin/env node
// check-major-music-festivals — the marquee tag must REACH a reader, and it
// must never carry a claim the row has not earned.
//
// WHY THIS GUARD EXISTS (2026-08-23). The events spec that shipped this table
// recorded the exact failure mode two rails earlier: `category = 'holiday'` was
// written onto four rows and NOTHING read it, so the four highest-intent
// ticketed events in the pantry were invisible and no error was ever raised.
// Data with no consumer looks identical to data that works. `major-music-
// festival` is a new tag on seven rows, which is the same shape of bet, so the
// wire gets a guard on the day it is laid rather than after someone notices a
// rail that never appeared.
//
// It EXECUTES the chain — a tagged row goes in, and the rail comes out — rather
// than matching text, because the three ways this breaks are all behavioural:
// the rail key never reaching the page's RAILS array, buildRail's three-card
// floor silently swallowing the shelf, and an `unannounced` row leaking onto a
// surface with a date nobody announced.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAIL_LIBRARY, buildRail, isEligible } from "../lib/curatedEvents.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const KEY = "major-music-festivals";
const TAG = "major-music-festival";

// Rows shape-for-shape with wf_events. Dates are pinned FAR in the future so
// this guard cannot rot into a red build the day a real festival passes — the
// bug it protects against has nothing to do with the calendar.
const row = (over = {}) => ({
  event_id: "fixture-1", event_series_id: "fixture", event_name: "Fixture Fest",
  year: 2099, slug: "fixture-fest-2099",
  start_date: "2099-05-06", end_date: "2099-05-09",
  city: "Daytona Beach", state: "FL", lat: 29.1852, lng: -81.0702,
  category: "music", subcategory: "festival",
  tags: ["music", TAG], audience: ["adults", "music-fans"],
  event_status: "scheduled", source_tier: 1, verification_confidence: "high",
  card_hook: "Four days of rock on the speedway infield.",
  ...over,
});

const now = new Date("2099-01-01T12:00:00Z");
// Distinct event_series_id per fixture: composeRail keeps ONE card per series
// (three years of the same festival is one festival), so fixtures that shared a
// series collapsed to a single card and the shelf fell under its own floor.
const three = [
  row({ event_id: "a", slug: "a", event_series_id: "series-a" }),
  row({ event_id: "b", slug: "b", event_series_id: "series-b" }),
  row({ event_id: "c", slug: "c", event_series_id: "series-c" }),
];

// 1. THE WIRE. The rail exists in the library AND the hub page asks for it.
ok(!!RAIL_LIBRARY[KEY], `RAIL_LIBRARY defines "${KEY}"`);
const hub = readFileSync(path.join(ROOT, "app/florida-events/page.js"), "utf8");
ok(new RegExp(`RAILS\\s*=\\s*\\[[^\\]]*"${KEY}"`).test(hub),
  `app/florida-events/page.js must ASK for "${KEY}" in its RAILS array — a rail nothing requests is the 'category=holiday' bug again, invisible and silent`);

// 2. THE FILTER IS THE TAG, not the category. "live-music" already means every
//    music row; if these two ever collapse into the same predicate the marquee
//    shelf stops being a curation and becomes a duplicate.
const built = buildRail(KEY, three, { now });
ok(built && built.cards.length === 3, `a tagged, eligible set of three builds the shelf (got ${built ? built.cards.length : "null"})`);
const untagged = three.map((e) => ({ ...e, tags: ["music"] }));
ok(buildRail(KEY, untagged, { now }) === null,
  "an untagged music event never reaches the marquee shelf — category is not the qualifier, the explicit tag is");
ok(RAIL_LIBRARY["live-music"] && !RAIL_LIBRARY["live-music"].filter(three[0]) === false,
  "positive control: the live-music rail still accepts a music row, so the two rails are distinct rather than one shadowing the other");

// 3. THE THREE-CARD FLOOR still applies — a marquee shelf of two is not a shelf.
ok(buildRail(KEY, three.slice(0, 2), { now }) === null,
  "two tagged events do not ship a shelf (buildRail's floor), so a thin year reads as absent rather than embarrassing");

// 4. AN UNANNOUNCED ROW NEVER SURFACES. jax-jazz-2027 and florida-folk-2027
//    carry DERIVED Memorial-Day dates and `event_status = 'unannounced'`
//    precisely so they stay invisible until an organiser confirms. If this
//    assert ever goes red, the site is printing a date nobody published.
const unannounced = three.map((e) => ({ ...e, event_status: "unannounced" }));
ok(unannounced.every((e) => !isEligible(e, { now })),
  "an unannounced row is never eligible — its date is derived, and a derived date must not reach a card");
ok(buildRail(KEY, unannounced, { now }) === null,
  "a shelf built entirely from unannounced rows is no shelf at all");
const mixed = [...three, ...unannounced.map((e, i) => ({ ...e, event_id: "u" + i, slug: "u" + i, event_series_id: "series-u" + i }))];
const mixedRail = buildRail(KEY, mixed, { now });
ok(mixedRail && mixedRail.cards.every((c) => !String(c.id || c.event_id || "").startsWith("u")),
  "mixing announced and unannounced rows yields a shelf of ONLY the announced ones");

// 5. NO DISTANCE GATE. These are statewide on purpose: Panama City Beach is
//    ~400mi from the home market and still belongs here. A proximity filter
//    creeping in would silently empty the shelf for every reader.
const farAway = three.map((e) => ({ ...e, lat: 30.2377, lng: -85.8783, city: "Panama City Beach" }));
const farRail = buildRail(KEY, farAway, { now, lat: 27.5989, lng: -82.4384 });
ok(farRail && farRail.cards.length === 3,
  "a reader in the home market still sees Panhandle festivals — this shelf is statewide and must not inherit a proximity gate");

// 6. The copy names what it is.
ok(/festival/i.test(RAIL_LIBRARY[KEY].title), "the shelf title says festival");

if (fail.length) {
  for (const m of fail) console.log("  FAIL:", m);
  console.log(`check-major-music-festivals: FAIL — ${fail.length} of ${pass + fail.length} assertions`);
  process.exit(1);
}
console.log(`check-major-music-festivals: OK — ${pass} assertions (tag reaches the hub, tag not category, three-card floor, unannounced rows stay invisible, statewide by design)`);
