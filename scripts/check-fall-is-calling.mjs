#!/usr/bin/env node
// check-fall-is-calling — the FALL IS CALLING 🍂 collection (v8.47).
//
// Owner, 2026-08-23: "this should absolutely become a dedicated Wayfind fall
// collection, not just random places… Pumpkin Season, Halloween Nights, Family
// Fall, Fall Date Night, and Worth the Drive."
//
// Same doctrine as check-florida-icons and check-major-music-festivals: a rail
// with no guard is a wire nobody notices cutting. What makes THIS collection
// break differently is the split itself.
//
//   1. AUDIENCE IS THE SPLIT. `spooky-season` already exists and is broad
//      (`tags.includes("halloween")`). Fantasy Fest and Mickey's Not-So-Scary
//      both carry that tag and belong on OPPOSITE shelves. If Family Fall ever
//      stopped reading `audience`, a Key West costume street party would land
//      on the shelf a parent opens for their six-year-old. That is the failure
//      this file exists to make impossible, and it is asserted with the real
//      pair, by name.
//   2. AN OMISSION IS NOT A LICENCE TO GUESS. A row with no `audience` must
//      appear on NEITHER audience shelf rather than on both. Guessing who a
//      night is for is the same class of invention as a fabricated startTime.
//   3. SEASONAL BY CONSTRUCTION. Every filter is a tag test, so the shelves
//      empty themselves out of season. A date rule creeping in would be a
//      second thing to maintain and a new way to be wrong in November.
//
// EXECUTES the real RAIL_LIBRARY predicates against wf_events-shaped fixtures.
import { readFileSync } from "node:fs";
import { RAIL_LIBRARY } from "../lib/curatedEvents.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const SHELVES = ["pumpkin-season", "halloween-nights", "family-fall", "fall-date-night"];

// 1. THE WIRE EXISTS, and the fifth shelf is the pre-existing distance rail —
// deliberately NOT redefined, because two rails answering "worth the drive"
// would drift apart.
for (const key of SHELVES) {
  ok(!!RAIL_LIBRARY[key], `RAIL_LIBRARY defines "${key}"`);
  ok(!!(RAIL_LIBRARY[key] && RAIL_LIBRARY[key].title), `"${key}" carries a title`);
}
ok(!!RAIL_LIBRARY["worth-the-drive"],
  "the fifth shelf is the EXISTING worth-the-drive rail, not a fall-specific duplicate");
ok(!!RAIL_LIBRARY["spooky-season"],
  "the broad spooky-season rail still exists — the five shelves add to it, they do not replace it");

const f = (key) => RAIL_LIBRARY[key].filter;
const row = (over = {}) => ({
  event_name: "Fixture", tags: [], audience: [], event_status: "scheduled",
  city: "Orlando", state: "FL", ...over,
});

// 2. THE REAL PAIR, BY NAME. Both carry `halloween`; they must not share a shelf.
const fantasyFest = row({ event_name: "Fantasy Fest", city: "Key West", tags: ["tentpole", "halloween", "costume", "nightlife", "only-in-florida", "florida-icon"], audience: ["adults"] });
const notSoScary = row({ event_name: "Mickey's Not-So-Scary Halloween Party", city: "Lake Buena Vista", tags: ["halloween", "family", "theme-park", "trick-or-treat"], audience: ["families"] });

ok(f("halloween-nights")(fantasyFest) === true, "Fantasy Fest is a Halloween Night");
ok(f("family-fall")(fantasyFest) === false || !(fantasyFest.audience || []).includes("families"),
  "Fantasy Fest never reaches Family Fall — a Key West costume street party is not a shelf for a six-year-old");
ok(!!f("family-fall")(notSoScary), "Mickey's Not-So-Scary is Family Fall");
ok(f("halloween-nights")(notSoScary) === false,
  "Mickey's Not-So-Scary never reaches Halloween Nights — it carries neither `scary` nor `nightlife`");

// 3. AN OMISSION IS NOT A VERDICT. No audience → neither audience shelf.
const noAudience = row({ tags: ["halloween", "fall"], audience: [] });
ok(!f("family-fall")(noAudience) && !f("fall-date-night")(noAudience),
  "a row with no audience appears on NEITHER audience shelf — we do not guess who a night is for");

// 4. PUMPKIN SEASON is the farm lane, not everything with a pumpkin in it.
ok(!!f("pumpkin-season")(row({ tags: ["fall", "family", "pumpkins", "farm", "local"] })),
  "a real pumpkin festival is Pumpkin Season");
ok(!!f("pumpkin-season")(row({ tags: ["fall", "harvest"] })),
  "a harvest festival is Pumpkin Season even without the pumpkins tag");
ok(f("pumpkin-season")(row({ tags: ["fall"] })) === false,
  "`fall` ALONE is not Pumpkin Season — otherwise a food festival becomes a patch");
ok(f("pumpkin-season")(row({ tags: ["halloween", "scary"] })) === false,
  "a haunt is not a pumpkin patch");

// 5. DATE NIGHT reads couples, and only in season.
ok(!!f("fall-date-night")(row({ tags: ["fall"], audience: ["couples"] })), "a fall couples row is Fall Date Night");
ok(f("fall-date-night")(row({ tags: ["music"], audience: ["couples"] })) === false,
  "a couples row with no fall/halloween tag is NOT Fall Date Night — the shelf is seasonal or it is just date-night");

// 6. SEASONAL BY CONSTRUCTION. Nothing out of season survives any shelf, and no
// filter consults a date — which is what lets these empty themselves in December.
const christmas = row({ tags: ["christmas", "holiday", "holiday-lights"], audience: ["families", "couples"] });
for (const key of SHELVES) {
  ok(f(key)(christmas) === false, `"${key}" rejects a Christmas row — the collection empties itself out of season`);
  ok(f(key).length <= 1, `"${key}" reads only the event — no date/context argument, so there is no calendar rule to maintain`);
}

// 7. THE POOL EVERY SHELF IS BUILT FROM MUST NOT SILENTLY TRUNCATE (v8.47.1).
// fetchCuratedEvents is the ONLY source for every rail in RAIL_LIBRARY. It used
// a bare `.limit(200)` ordered by start_date, so the first time wf_events grew
// past 200 the furthest-out events would drop off every shelf with no error —
// a wrong answer indistinguishable from a right one, which is the same defect
// class as v8.46's terminal skeleton. It found me before I found it: a short
// read of this table produced shelf counts I published and had to correct.
const SRC = readFileSync(new URL("../lib/curatedEvents.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
ok(!/export async function fetchCuratedEvents\([\s\S]{0,400}?\.limit\(limit\);\s*\n\s*if \(error/.test(SRC),
  "fetchCuratedEvents no longer ends on a bare .limit() as its only bound");
ok(/\.range\(from, from \+ PAGE - 1\)/.test(SRC),
  "fetchCuratedEvents PAGES through wf_events — it cannot silently truncate the pool every rail is built from");
ok(/if \(data\.length < PAGE\) break/.test(SRC),
  "pagination terminates on a short page rather than on a hardcoded ceiling");

if (fail.length) {
  console.error(`check-fall-is-calling: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-fall-is-calling: OK (${pass} assertions) — five shelves, audience-split, seasonal by construction`);
