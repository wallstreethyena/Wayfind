#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  FALL_INTENT_RAIL_DEFS, FALL_RAIL_RADIUS_MI, fallEventRail, fallPhase,
  fallRailOrder, composeFallIntentRails,
} from "../lib/fallIntentRails.js";
import { FALL_PLACE_IDS, FALL_PLACE_RAIL } from "../lib/fallPool.js";

let pass = 0;
const failures = [];
const ok = (condition, message) => { if (condition) pass++; else failures.push(message); };
const now = new Date("2026-09-01T16:00:00Z");
const event = (over = {}) => ({
  kind: "event", id: "fixture", event_id: "fixture", event_name: "Fixture", title: "Fixture",
  event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "Verified seasonal reason.",
  city: "Tampa", state: "FL", lat: 27.95, lng: -82.46, start_date: "2026-09-01", end_date: "2026-10-31",
  category: "seasonal", subcategory: "", tags: ["fall"], audience: [], editorial_score: 7,
  uniqueness_score: 7, popularity_score: 7, last_verified_at: "2026-08-25T00:00:00Z", ...over,
});

const expected = ["food", "farms", "theme-parks", "haunts", "family", "oktoberfest", "date-night", "festivals", "photos", "day-trips"];
ok(FALL_INTENT_RAIL_DEFS.length === 10, "the collection has exactly ten rails");
ok(FALL_INTENT_RAIL_DEFS.map((rail) => rail.id).join("|") === expected.join("|"), "the ten approved base intents are present in order");
ok(new Set(FALL_INTENT_RAIL_DEFS.map((rail) => rail.title)).size === 10, "every rail title is unique");
ok(Object.keys(FALL_RAIL_RADIUS_MI).sort().join("|") === expected.slice().sort().join("|"), "every intent has an explicit radius law");

ok(fallPhase("2026-09-01") === "early", "September opens in the early fall phase");
ok(fallPhase("2026-09-30") === "opening", "late September promotes farms and Oktoberfest");
ok(fallPhase("2026-10-15") === "halloween", "mid-October promotes fright and date-night intent");
ok(fallPhase("2026-10-28") === "lastMinute", "Halloween week promotes family and tonight-ready choices");
ok(fallPhase("2026-11-10") === "november", "November promotes festivals and day trips");
for (const date of ["2026-09-01", "2026-09-30", "2026-10-15", "2026-10-28", "2026-11-10"]) {
  const order = fallRailOrder(date);
  ok(order.length === 10 && new Set(order).size === 10, `${date} returns all ten intents exactly once`);
}
ok(fallRailOrder("2026-09-01")[0] === "food", "early fall leads with seasonal food");
ok(fallRailOrder("2026-09-30")[0] === "farms", "patch season leads with farms");
ok(fallRailOrder("2026-10-15")[0] === "haunts", "mid-October leads with haunts");
ok(fallRailOrder("2026-10-28")[0] === "family", "Halloween week leads with practical family intent");
ok(fallRailOrder("2026-11-10")[0] === "festivals", "November leads with outdoor festivals");

ok(fallEventRail(event({ event_name: "Hunsader Pumpkin Festival", tags: ["fall", "pumpkins", "farm"], audience: ["families"] })) === "farms", "a real pumpkin farm enters the farm rail");
ok(fallEventRail(event({ event_name: "Generic Fall Concert", category: "music", subcategory: "concert", tags: ["fall"] })) == null, "fall alone cannot seasonalize an ordinary concert");
ok(fallEventRail(event({ event_name: "Halloween Horror Nights", category: "halloween", subcategory: "haunted-house", tags: ["halloween", "theme-park", "scary"] })) === "theme-parks", "HHN is a theme-park decision, not duplicated as a local haunt");
ok(fallEventRail(event({ event_name: "Halloween Hangar Bar", subcategory: "themed-bar", tags: ["fall", "halloween", "theme-park", "nightlife"], audience: ["adults"] })) === "date-night", "a theme-park district tag cannot turn an adults-only Halloween bar into a park event");
ok(fallEventRail(event({ event_name: "Ordinary Hotel Bar", subcategory: "bar", tags: ["fall"], audience: ["adults"] })) == null, "adult audience plus a bar is not enough without a themed seasonal offering");
ok(fallEventRail(event({ event_name: "EPCOT Food & Wine", category: "festival", subcategory: "food-festival", tags: ["fall", "theme-park", "food"] })) === "festivals", "a theme-park fall festival without Halloween programming stays out of Halloween Theme Parks");
ok(fallEventRail(event({ event_name: "Scream-A-Geddon Horror Park", category: "halloween", subcategory: "haunted-house", tags: ["fall", "halloween", "scary"] })) === "haunts", "a non-park scare attraction enters haunts");
ok(fallEventRail(event({ event_name: "Boo at the Bay", tags: ["halloween", "trick-or-treat"], audience: ["families", "kids"] })) === "family", "safe trick-or-treat programming enters family");
ok(fallEventRail(event({ event_name: "Scary Family Fixture", tags: ["halloween", "scary"], audience: ["families"] })) === "haunts", "a scary signal vetoes family placement");
ok(fallEventRail(event({ event_name: "Wellen Park Oktoberfest", category: "festival", subcategory: "oktoberfest", tags: ["fall", "beer", "music"] })) === "oktoberfest", "Oktoberfest does not leak into generic festivals");
ok(fallEventRail(event({ event_name: "Jock Lindsey Halloween Hangar Bar", subcategory: "themed-bar", tags: ["halloween", "nightlife", "date-night"], audience: ["adults", "couples"] })) === "date-night", "a verified couples themed bar enters spooky date night");
ok(fallEventRail(event({ event_name: "Generic Cocktail Bar", category: "nightlife", tags: [], audience: ["couples"] })) == null, "a normal cocktail bar is not seasonal");
ok(fallEventRail(event({ event_name: "Stone Crab Festival", category: "food", subcategory: "seafood-festival", tags: ["fall", "food"] })) === "festivals", "a named fall food festival enters outdoor festivals");
ok(fallEventRail(event({ event_name: "Crystal Classic", category: "arts", subcategory: "festival", tags: ["fall", "art"], audience: ["photographers"] })) === "photos", "explicit photographer fit promotes a visual event to photo spots");
ok(fallEventRail(event({ event_name: "North Florida Scenic Drive", tags: ["fall", "scenic", "road-trip"] })) === "day-trips", "a seasonal scenic drive enters day trips");
ok(fallEventRail(event({ event_name: "Audience Missing", tags: ["halloween"], audience: [] })) == null, "missing audience does not guess family or couples");

const duplicateSeries = [
  event({ id: "farm-a", event_id: "farm-a", event_series_id: "farm-series", event_name: "Farm Weekend One", title: "Farm Weekend One", tags: ["fall", "farm", "pumpkins"], editorial_score: 9 }),
  event({ id: "farm-b", event_id: "farm-b", event_series_id: "farm-series", event_name: "Farm Weekend Two", title: "Farm Weekend Two", tags: ["fall", "farm", "pumpkins"], editorial_score: 7 }),
];
const composed = composeFallIntentRails(duplicateSeries, [
  { kind: "place", id: "food-near", name: "Near Fall Cafe", lat: 27.96, lng: -82.46, fallRail: "food", wfScore: 9.4 },
  { kind: "place", id: "food-far", name: "Far Fall Cafe", lat: 25.76, lng: -80.19, fallRail: "food", wfScore: 9.9 },
], { lat: 27.95, lng: -82.46, today: "2026-09-01", now });
ok(composed.rails.length === 10, "composition always returns all ten rails, including honest empties");
ok(composed.rails.find((rail) => rail.id === "farms").cards.length === 1, "one event series appears once");
ok(composed.rails.find((rail) => rail.id === "food").cards.map((card) => card.id).join("|") === "food-near", "local food radius excludes a distant seasonal menu");
ok(composed.rails.flatMap((rail) => rail.cards).length === new Set(composed.rails.flatMap((rail) => rail.cards.map((card) => card.id))).size, "no card appears in more than one rail");

ok(Object.keys(FALL_PLACE_IDS).sort().join("|") === Object.keys(FALL_PLACE_RAIL).sort().join("|"), "every vetted fall place has exactly one primary intent assignment");
ok(Object.values(FALL_PLACE_RAIL).every((rail) => expected.includes(rail)), "every fall place assignment targets an approved rail");

const route = readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8");
const daypart = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/components/FallIntentRails.js", import.meta.url), "utf8");
const card = readFileSync(new URL("../app/components/RailCard.js", import.meta.url), "utf8");
ok(/fall-intents:v2:/.test(route) && /fastCachedRail/.test(route), "the API uses a versioned shared FastCache key");
ok(/take: FALL_PLACE_IDS\[p\.place_id\] \|\| p\.editorial/.test(route), "verified seasonal evidence wins over a generic inventory summary");
ok(!/searchText|places\.googleapis|nearbySearch/.test(route), "the fall API makes no paid Google place call");
ok(/Promise\.all\(\[/.test(route), "independent Supabase reads start in parallel");
ok(/FALL_PLACE_RAIL/.test(route) && /composeFallIntentRails/.test(route), "the API composes owned events and vetted places through one taxonomy");
ok(/FallIntentRails = dynamic/.test(daypart), "the ten-rail component is lazy and absent from first paint");
ok(/selRail\.id === "augtober"/.test(daypart) && /<FallIntentRails/.test(daypart), "the Augtober poster opens the specialized collection");
ok(/selRail\.id === "augtober" \|\| selRail\.id === "events"/.test(daypart), "generic place fallback is suppressed for Augtober");
ok(!/fallEvents\.map|wf8-falltile/.test(daypart), "the old mixed inline fall strip is retired rather than duplicated");
ok(/result\.rails\.length !== 10/.test(component), "the client fails closed on an incomplete rail contract");
ok(/FALL_LOAD_TIMEOUT_MS = 12000/.test(component) && /controller\.abort\(\)/.test(component) && /signal: controller\.signal/.test(component), "the collection cannot leave a first-time reader on an endless skeleton");
ok(/\}, \[key, retry\]\);/.test(component) && !/\[key, city, retry, onTrack\]/.test(component), "parent telemetry re-renders cannot abort the rail request and strand its duplicate guard");
ok(/service miss, not an empty city/.test(component), "a failed service is not misreported as an empty location");
ok(/seasonal look-alike/.test(component), "thin rails render the approved honest empty state");
ok(/actionsReadOnly=\{isEvent\}/.test(component), "dated events do not render dead place reactions");
ok(/sponsored: true/.test(component) && /commerce_cta_clicked/.test(component), "affiliate tickets are disclosed and measured");
ok(/cta\.sponsored \? "sponsored nofollow noopener"/.test(card), "the shared card emits sponsored rel on paid outbound links");

if (failures.length) {
  console.error("test-fall-intent-rails: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}
console.log(`test-fall-intent-rails: OK — ${pass} assertions`);
