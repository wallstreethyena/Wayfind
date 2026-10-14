#!/usr/bin/env node
// scripts/check-christmas-rails.mjs: the Christmas in Florida collection,
// EXECUTED. composeChristmasIntentRails, the registry merge and the enrichment
// are imported and invoked on fixture data; the assertions read what they
// return, not what their source says.
//
// Christmas v3 (lead packet, 2026-10-09): eight rails in a fixed order, each
// event in exactly one rail or none, the distance group ordering law, the
// verified 2026 registry merged at read time with the five owner authorized
// location corrections, pop up bars as honest season cards. The wiring checks
// at the bottom are static (a component cannot be rendered here) and say so.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHRISTMAS_INTENT_RAIL_DEFS, christmasEventRail, composeChristmasIntentRails,
  CHRISTMAS_RAIL_GUIDE_SLUGS, CHRISTMAS_CARD_LABELS, CHRISTMAS_DAY_TRIP_MAX, CHRISTMAS_LOCAL_ONLY_RAILS, isExceptional, CHRISTMAS_NEARBY_MI, CHRISTMAS_DAY_TRIP_MI,
  christmasDistanceLabel, christmasDistanceGroup, CHRISTMAS_STATEWIDE_RAILS,
} from "../lib/christmasIntentRails.js";
import { NO_EXACT_AFFILIATE_PRODUCT } from "../lib/eventTicketDeals.js";
import { CHRISTMAS_KNOWN_DUPLICATE_IDS, CHRISTMAS_EVENT_VENUE_PLACE_IDS, enrichChristmasEvent, christmasCityCentre, CHRISTMAS_PLACE_RAIL, christmasEventTicket, CHRISTMAS_TICKET_DEAL_IDS } from "../lib/christmasPool.js";
import { CHRISTMAS_EVENT_RAIL, CHRISTMAS_CITY_POINTS } from "../lib/christmasDiscoveries2026.js";
import { CHRISTMAS_HEADLINER_RESEARCH_IDS, CHRISTMAS_RESEARCH_CANONICAL, CHRISTMAS_PUBLISHED_RESEARCH, mergeChristmasResearch } from "../lib/christmasResearch.js";
import { isTrusted } from "../lib/curatedEvents.js";
import { eventPlaceholder } from "../lib/eventPlaceholder.js";
import { christmasRailGuide, withChristmasGuides } from "../lib/christmasGuides.js";
import { GUIDES } from "../lib/guides.js";
import { DAYPART_IDS, orderFor, christmasLeads } from "../lib/dayparts.js";
import { RAILS, railById } from "../lib/rails.js";
import { deckProblems } from "../lib/railDeckCopy.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── The spec, restated independently of the library ─────────────────────────
const SPEC_RAILS = [
  ["lights", "Lights & Glowing Gardens", "LIGHTS"],
  ["towns-markets", "Towns, Markets & Festive Walks", "TOWNS"],
  ["theme-parks", "Theme Parks, Snow, Trains & Santa", "THEME PARKS"],
  ["boat-parades", "Boat Parades & Coastal Traditions", "BOAT PARADES"],
  ["parades", "Christmas Parades", "PARADES"],
  ["shows-outings", "Shows, Historic Homes & Holiday Outings", "SHOWS"],
  ["popup-bars", "Christmas Pop Up Bars (21+)", "POP UP BARS"],
  ["parties", "Christmas Parties", "PARTIES"],
];
const SPEC_IDS = SPEC_RAILS.map(([id]) => id);
const WRONG_VENICE = "ChIJpY1xybu6woAR";
const THEME_PARK_IDS = ["epcot-festival-holidays-2026", "universal-orlando-holidays-2026", "christmas-town-2026", "seaworld-orlando-christmas-2026", "legoland-fl-holidays-2026"];
const noDash = (s) => !/[—–]| - /.test(String(s || ""));

// ── 1. The definitions ──────────────────────────────────────────────────────
ok(Array.isArray(CHRISTMAS_INTENT_RAIL_DEFS) && Object.isFrozen(CHRISTMAS_INTENT_RAIL_DEFS), "rail definitions are a frozen array");
ok(CHRISTMAS_INTENT_RAIL_DEFS.length === 8, "exactly eight rail definitions");
SPEC_RAILS.forEach(([id, title], i) => {
  const def = CHRISTMAS_INTENT_RAIL_DEFS[i];
  ok(def && def.id === id && def.title === title, `definition ${i + 1} is ${id} / "${title}" (got ${JSON.stringify(def)})`);
  ok(def && noDash(def.title) && noDash(def.deck) && !/-/.test(def.deck), `${id}: title and deck carry no dashes`);
  ok(def && deckProblems(def.deck, def.title).length === 0, `${id}: deck obeys the rail deck copy law, 5 to 8 words, no colon (${def && deckProblems(def.deck, def.title).join(", ")})`);
});
ok(!CHRISTMAS_INTENT_RAIL_DEFS.some((d) => d.id === "beaches" || d.id === "manatees" || d.id === "nights-out"), "beaches, manatees and the old nights-out rail are gone");

// ── 2. Fixtures ─────────────────────────────────────────────────────────────
const TODAY = "2026-12-01";
const SARASOTA = { lat: 27.34, lng: -82.53 };
const ORLANDO = { lat: 28.42, lng: -81.58 };
const ev = (event_id, event_name, start_date, end_date, extra = {}) => ({
  event_id, event_name, start_date, end_date, ...SARASOTA, tags: [], ...extra,
});
const events = [
  ...THEME_PARK_IDS.map((id, i) => ev(id, `Park Holiday Night ${i + 1}`, "2026-11-13", "2027-01-03", id === "christmas-town-2026" ? { lat: 28.037, lng: -82.419 } : { ...ORLANDO })),
  // explicit rails (registry or the map), one per rail that has no regex
  ev("x-show-2026", "Decorated Mansion Tour", "2026-12-04", "2026-12-20", { christmas_rail: "shows-outings" }),
  ev("x-party-2026", "Santa Brunch", "2026-12-13", "2026-12-13", { christmas_rail: "parties" }),
  ev("x-train-2026", "North Pole Train Ride", "2026-12-02", "2026-12-22", { christmas_rail: "theme-parks" }),
  // regex fallback (unmapped rows)
  ev("sarasota-boat-parade-2026", "Sarasota Christmas Boat Parade", "2026-12-12", "2026-12-12"),
  ev("vets-boat-parade-2026", "Veterans Boat Parade", "2026-11-21", "2026-11-21"),
  ev("lighted-regatta-2026", "Lighted Holiday Regatta", "2026-12-19", "2026-12-19"),
  ev("both-words-2026", "Christmas Boat Parade and Holiday Lights", "2026-12-20", "2026-12-20"),
  ev("town-parade-2026", "Downtown Christmas Parade", "2026-12-05", "2026-12-05"),
  ev("tree-lighting-x-2026", "Downtown Tree Lighting", "2026-12-04", "2026-12-04"),
  ev("lights-walk-2026", "Holiday Lights Walk", "2026-12-10", "2027-01-02"),
  ev("holiday-market-2026", "Holiday Market", "2026-12-06", "2026-12-06"),
  ev("naples-christmas-walk-2026", "Naples Christmas Walk", "2026-12-05", "2026-12-05", { lat: 26.142, lng: -81.7948 }),
  ev("jazz-holiday-2026", "Clearwater Jazz Holiday", "2026-12-03", "2026-12-06"),
  ev("halloween-lights-2026", "Halloween Lights Spooktacular", "2026-12-02", "2026-12-03"),
  ev("evan-hansen-2026", "Dear Evan Hansen", "2026-12-08", "2026-12-14"),
  ev("anastasia-2026", "Anastasia", "2026-12-08", "2026-12-14"),
  ev("winter-music-2026", "Florida Winter Music Festival", "2026-12-08", "2026-12-14"),
  ev("autumn-art-2026", "Winter Park Autumn Art Festival", "2026-12-08", "2026-12-14"),
  ev("expired-parade-2026", "Old Christmas Parade", "2026-11-28", "2026-11-30"),
  ev("expired-oneday-2026", "Yesterday Santa Visit", "2026-11-30", null),
  ev("x-expired-registry-2026", "Early Tree Lighting", "2026-11-12", "2026-11-12", { christmas_rail: "lights" }),
];
// The composer still accepts PLACE cards that carry a rail (christmasRail); the
// production pool is empty since v4 (the bars are research listings), so the
// fixture supplies three generic places to keep the place path executed.
const BAR_IDS = ["fixture-bar-a", "fixture-bar-b", "fixture-bar-c"];
const placeFixture = () => BAR_IDS.map((id, i) => ({
  id, name: `Bar ${i}`, title: `Fixture Bar ${i}`, kind: "place", ...SARASOTA, wfScore: 90 - i, take: "A fixture take.", christmasRail: "popup-bars",
}));

// ── 3. Event classifier ─────────────────────────────────────────────────────
const classify = (id) => christmasEventRail(events.find((e) => e.event_id === id));
for (const id of THEME_PARK_IDS) ok(classify(id) === "theme-parks", `theme park event ${id} classifies as theme-parks through the explicit map (got ${classify(id)})`);
ok(classify("x-show-2026") === "shows-outings" && classify("x-party-2026") === "parties" && classify("x-train-2026") === "theme-parks", "an explicit christmas_rail wins over the name");
ok(christmasEventRail(ev("x-bad-rail", "Christmas Lights", "2026-12-01", "2026-12-02", { christmas_rail: "beaches" })) === null, "an explicit rail that is not one of the eight is refused, never guessed");
ok(christmasEventRail(ev("x-spooky", "Halloween Trail", "2026-12-01", "2026-12-02", { christmas_rail: "lights" })) === null, "a Halloween name is refused even with an explicit rail");
ok(CHRISTMAS_EVENT_RAIL["mvmcp-2026"] === "theme-parks" && CHRISTMAS_EVENT_RAIL["jollywood-nights-2026"] === "theme-parks" && !Object.values(CHRISTMAS_EVENT_RAIL).filter((r) => r === "parties").length && CHRISTMAS_EVENT_RAIL["cocoa-beach-holiday-boat-parade-2026"] === "boat-parades" && CHRISTMAS_EVENT_RAIL["winter-park-christmas-parade-2026"] === "parades", "existing wf_events rows carry an explicit rail");
ok(Object.values(CHRISTMAS_EVENT_RAIL).every((r) => SPEC_IDS.includes(r)), "every mapped rail is one of the eight");
ok(classify("sarasota-boat-parade-2026") === "boat-parades" && classify("lighted-regatta-2026") === "boat-parades", "an unmapped boat parade or regatta falls back to boat-parades");
ok(classify("both-words-2026") === "boat-parades", "an event matching boat parade AND lights is claimed once, by boat-parades");
ok(classify("town-parade-2026") === "parades", "an unmapped Christmas parade falls back to parades");
ok(classify("lights-walk-2026") === "lights", "an unmapped lights walk falls back to lights");
ok(classify("tree-lighting-x-2026") === "towns-markets" && classify("holiday-market-2026") === "towns-markets", "an unmapped tree lighting or market falls back to towns-markets");
ok(classify("vets-boat-parade-2026") === null, "Veterans Boat Parade is excluded");
for (const id of ["jazz-holiday-2026", "halloween-lights-2026", "evan-hansen-2026", "anastasia-2026", "winter-music-2026", "autumn-art-2026"]) {
  ok(classify(id) === null, `${id} is excluded by the classifier (got ${classify(id)})`);
}
ok(christmasEventRail(ev("summer-lights", "Summer Lights Festival", "2026-07-04", "2026-07-04")) === null, "an unmapped holiday word outside Nov 15 to Jan 6 is not Christmas");
ok(christmasEventRail(null) === null, "null event classifies as null");

// ── 4. Composition ──────────────────────────────────────────────────────────
const composed = composeChristmasIntentRails(events, placeFixture(), { ...SARASOTA, today: TODAY });
ok(Array.isArray(composed.rails) && composed.rails.length === 8, "eight rails come back");
SPEC_RAILS.forEach(([id, title], i) => {
  const rail = composed.rails[i];
  ok(rail && rail.id === id && rail.title === title, `rail ${i + 1} is ${id} with the exact title`);
  ok(rail && Array.isArray(rail.cards) && typeof rail.fallbackUsed === "boolean", `${id}: cards array and fallbackUsed flag present`);
});
const railOf = (id) => composed.rails.find((r) => r.id === id);
const idsIn = (rail) => (railOf(rail)?.cards || []).map((c) => c.id);
for (const id of THEME_PARK_IDS) ok(idsIn("theme-parks").includes(id), `theme park event ${id} lands in theme-parks`);
ok(BAR_IDS.every((id) => idsIn("popup-bars").includes(id)), "a place card that carries a rail lands in that rail");
ok(idsIn("shows-outings").includes("x-show-2026") && idsIn("parties").includes("x-party-2026"), "explicit rail events land in their rail");
const all = composed.rails.flatMap((r) => r.cards);
const allIds = all.map((c) => c.id);
for (const bad of ["vets-boat-parade-2026", "jazz-holiday-2026", "halloween-lights-2026", "evan-hansen-2026", "anastasia-2026", "winter-music-2026", "autumn-art-2026"]) {
  ok(!allIds.includes(bad), `${bad} never renders`);
}
ok(!allIds.includes("expired-parade-2026"), "an expired dated event is dropped");
ok(!allIds.includes("expired-oneday-2026"), "an expired one day event (no end date) is dropped");
ok(!allIds.includes("x-expired-registry-2026"), "an expired registry row with an explicit rail is dropped too");
ok(!allIds.some((id) => String(id).startsWith(WRONG_VENICE)), "the Venice, California place id never appears");
ok(new Set(allIds).size === allIds.length, `no card appears in two rails (${allIds.length} cards, ${new Set(allIds).size} unique ids)`);
for (const r of composed.rails) ok(new Set(r.cards.map((c) => c.id)).size === r.cards.length, `${r.id}: no repeated card inside the rail`);
ok(composed.rails.every((r) => r.cards.every((c) => c.kind === "place" || c.kind === "event")), "every card is a place or an event");
const noEvents = composeChristmasIntentRails([], [], { ...SARASOTA, today: TODAY });
ok(noEvents.rails.length === 8 && noEvents.rails.every((r) => r.cards.length === 0 && r.fallbackUsed === false), "no inventory still returns eight empty rails, never fewer");
ok(composeChristmasIntentRails(events, placeFixture(), { today: TODAY }).rails.length === 8, "no location still returns eight rails");

// ── 4b. THE ORDERING LAW (EXECUTED) ─────────────────────────────────────────
// Nearby (<= 35 mi), Within reach (35 to 90), Day trip (> 90). Groups in that
// order; inside a group events by date then quality; places by score; Day trip
// only tops a rail up to 8 (theme parks stay statewide); never by affiliate.
{
  ok(CHRISTMAS_NEARBY_MI === 35 && CHRISTMAS_DAY_TRIP_MI === 90, "the group edges are 35 and 90 miles");
  ok(christmasDistanceGroup(18) === "nearby" && christmasDistanceGroup(35) === "nearby" && christmasDistanceGroup(35.1) === "within-reach" && christmasDistanceGroup(90) === "within-reach" && christmasDistanceGroup(91) === "day-trip" && christmasDistanceGroup(null) === null, "christmasDistanceGroup draws the three groups");
  const at = (mi) => ({ lat: SARASOTA.lat + mi / 69.05, lng: SARASOTA.lng }); // due north, ~69.05 mi per degree
  const L = (id, start, mi, extra = {}) => ev(id, "Glow " + id, start, start, { christmas_rail: "lights", ...at(mi), ...extra });
  const lawEvents = [
    L("far-early", "2026-12-02", 91, { exceptional: true }), L("near-late", "2026-12-24", 18), L("mid-early", "2026-12-03", 60), L("far-plain", "2026-12-02", 95),
    L("near-early", "2026-12-05", 30), L("mid-late", "2026-12-20", 40),
    L("same-day-tier1", "2026-12-10", 10, { source_tier: 1, verification_confidence: "high" }), L("same-day-tier3", "2026-12-10", 5, { source_tier: 3, verification_confidence: "medium" }),
    L("far-a", "2026-12-04", 150, { exceptional: true }), L("far-b", "2026-12-06", 100, { exceptional: true }), L("far-c", "2026-12-08", 300, { exceptional: true }),
    L("far-plain-160", "2026-12-03", 160), L("far-head-180", "2026-12-03", 180, { exceptional: true }), L("far-head-210", "2026-12-03", 210, { exceptional: true }),
  ];
  const rail = composeChristmasIntentRails(lawEvents, [], { ...SARASOTA, today: TODAY }).rails.find((r) => r.id === "lights");
  const order = rail.cards.map((c) => c.id);
  ok(order.indexOf("near-late") < order.indexOf("far-early"), `a 91 mi card never sits ahead of an 18 mi card, even with an earlier date (${order.join(", ")})`);
  const groups = rail.cards.map((c) => c.distanceGroup);
  const rank = { nearby: 0, "within-reach": 1, "day-trip": 2 };
  ok(groups.every((g, i) => i === 0 || rank[groups[i - 1]] <= rank[g]), `groups run Nearby, Within reach, Day trip (${groups.join(", ")})`);
  ok(rail.cards.every((c) => c.distanceGroup === christmasDistanceGroup(c.distMi)), "every card carries its distance group");
  const near = rail.cards.filter((c) => c.distanceGroup === "nearby").map((c) => c.id);
  ok(near.join() === "near-early,same-day-tier1,same-day-tier3,near-late", `inside Nearby, events run by date, then quality (better sourced first, even when farther) (${near.join(", ")})`);
  ok(rail.cards.filter((c) => c.distanceGroup === "within-reach").map((c) => c.id).join() === "mid-early,mid-late", "inside Within reach, events run by date");
  // Day trips (lead, 2026-10-09): any item 90 to 150 mi, headliners 150 to 200 mi, nothing past 200 mi,
  // nearest first, at most 6. far-early (91 mi) leads although far-a is sooner.
  const far = rail.cards.filter((c) => c.distanceGroup === "day-trip").map((c) => c.id);
  ok(far.join() === "far-early,far-plain,far-b,far-a,far-head-180", `the Day trip group: any item to 150 mi, headliners to 200 mi, nearest first (${far.join(", ")})`);
  ok(!order.includes("far-plain-160"), "an ordinary item past 150 mi never shows");
  ok(!order.includes("far-head-210") && !order.includes("far-c"), "the 200 mi hard cap holds even for headliners (210 and 300 mi stay out)");
  ok(rail.cards.every((c) => c.distMi <= 200), "no card in a non statewide rail is past 200 mi");
  ok(rail.fallbackUsed === false, "nothing is ever padded in (fallbackUsed stays false)");
  ok(CHRISTMAS_DAY_TRIP_MAX === 6, "at most 6 day trips per rail");
  const lots = composeChristmasIntentRails([1, 2, 3, 4, 5, 6, 7, 8].map((n) => L("ex-" + n, "2026-12-0" + n, 100 + n * 5)), [], { ...SARASOTA, today: TODAY }).rails.find((r) => r.id === "lights");
  ok(lots.cards.length === 6 && lots.cards.map((c) => c.id).join() === "ex-1,ex-2,ex-3,ex-4,ex-5,ex-6", `eight eligible day trips are capped at the nearest 6 (${lots.cards.map((c) => c.id).join(", ")})`);
  const thin = composeChristmasIntentRails([L("only-far-1", "2026-12-02", 199), L("only-far-2", "2026-12-03", 260, { exceptional: true })], [], { ...SARASOTA, today: TODAY }).rails.find((r) => r.id === "lights");
  ok(thin.cards.length === 0, "a rail with only an ordinary 199 mi item and a 260 mi headliner is empty for this viewer (the page hides it), never padded");
  ok(JSON.stringify(CHRISTMAS_LOCAL_ONLY_RAILS) === JSON.stringify(["parties", "popup-bars", "parades"]), "parties, pop up bars and parades are local only");
  for (const id of CHRISTMAS_LOCAL_ONLY_RAILS) {
    const local = composeChristmasIntentRails([ev("lo-near-" + id, "Local " + id, "2026-12-05", "2026-12-05", { christmas_rail: id, ...at(80) }), ev("lo-far-" + id, "Far " + id, "2026-12-05", "2026-12-05", { christmas_rail: id, exceptional: true, ...at(95) })], [], { ...SARASOTA, today: TODAY }).rails.find((r) => r.id === id);
    ok(local.cards.map((c) => c.id).join() === "lo-near-" + id, `${id}: shows items within 90 mi only, even an exceptional one at 95 mi stays out`);
  }
  const { railRenderState, RAIL_RENDER_STATE } = await import("../lib/railVisibility.js");
  ok(railRenderState(thin.cards) === RAIL_RENDER_STATE.HIDDEN, "an empty rail renders HIDDEN (lib/railVisibility.js)");
  ok(/railRenderState\(items, \{ loading, error \}\)/.test(read("app/components/ChristmasIntentRails.js")) && /RAIL_RENDER_STATE\.HIDDEN\) return null/.test(read("app/components/ChristmasIntentRails.js")), "the Christmas rail section returns nothing when its rail is empty (static)");
  // Headliners: the research merge flags them; the composer only reads the flag.
  const canonicalIds = new Set(CHRISTMAS_RESEARCH_CANONICAL.map((r) => r.id));
  ok(CHRISTMAS_HEADLINER_RESEARCH_IDS.length >= 30 && CHRISTMAS_HEADLINER_RESEARCH_IDS.every((id) => canonicalIds.has(id)), `every headliner id is a canonical research row (${CHRISTMAS_HEADLINER_RESEARCH_IDS.length})`);
  for (const id of ["nights-of-lights-staug-2026", "gaylord-palms-ice-2026", "winterfest-boat-parade-2026", "selby-lights-in-bloom-2026", "pensacola-winterfest-2026", "frrm-north-pole-express-2026", "key-west-harbor-walk-of-lights-2026", "magic-of-lights-daytona-2026"]) {
    ok(CHRISTMAS_PUBLISHED_RESEARCH.some((r) => r.event_id === id && r.exceptional === true), `${id} is a flagged headliner`);
  }
  const selby = mergeChristmasResearch([{ event_id: "selby-lights-in-bloom-2026", event_name: "Lights in Bloom", city: "Sarasota" }]).find((r) => r.event_id === "selby-lights-in-bloom-2026");
  ok(selby.exceptional === true && isExceptional(selby) && !isExceptional({ event_id: "tree-lighting-2026" }) && !isExceptional({ event_id: "selby-lights-in-bloom-2026" }), "the merge flags headliners; an id alone is never read as a headliner");
  // Theme parks: statewide, still grouped.
  ok(CHRISTMAS_STATEWIDE_RAILS.length === 1 && CHRISTMAS_STATEWIDE_RAILS[0] === "theme-parks", "only theme parks are statewide");
  const parks = [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ev("park-near-" + n, "Park Night " + n, "2026-12-0" + n, "2026-12-0" + n, { christmas_rail: "theme-parks", ...at(5 + n) })), ev("park-far", "Far Park Night", "2026-12-01", "2026-12-30", { christmas_rail: "theme-parks", ...at(200) })];
  const tp = composeChristmasIntentRails(parks, [], { ...SARASOTA, today: TODAY }).rails.find((r) => r.id === "theme-parks");
  ok(tp.cards.length === 10 && tp.cards[tp.cards.length - 1].id === "park-far" && tp.cards[tp.cards.length - 1].distanceGroup === "day-trip", "theme parks keep every park statewide (a 200 mi park, not flagged, still shows), grouped and labeled");
  // Places by score inside a group, events before places; affiliate data never moves a card.
  const bars = composeChristmasIntentRails([], [
    { id: "b-low", name: "Low", kind: "place", christmasRail: "popup-bars", wfScore: 70, ...at(5) },
    { id: "b-high", name: "High", kind: "place", christmasRail: "popup-bars", wfScore: 95, ...at(30) },
    { id: "b-far", name: "Far", kind: "place", christmasRail: "popup-bars", wfScore: 99, ...at(60) },
  ], { ...SARASOTA, today: TODAY }).rails.find((r) => r.id === "popup-bars");
  ok(bars.cards.map((c) => c.id).join() === "b-high,b-low,b-far", `places run by score inside a group, groups first (${bars.cards.map((c) => c.id).join(", ")})`);
  const withTicket = lawEvents.map((e) => e.event_id === "near-late" ? { ...e, ticket: { href: "/api/commerce/go?x" }, affiliate: true } : e);
  const ticketed = composeChristmasIntentRails(withTicket, [], { ...SARASOTA, today: TODAY }).rails.find((r) => r.id === "lights").cards.map((c) => c.id);
  ok(ticketed.join() === order.join(), "an affiliate ticket never changes the order");
  const src = read("lib/christmasIntentRails.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/ticket|affiliate|commerce|deal/i.test(src), "the composer source never reads ticket, affiliate, commerce or deal data");
  // The law is Christmas only.
  for (const other of ["lib/fallIntentRails.js", "lib/todayDiscoveryRails.js", "lib/nightOutIntent.js"]) {
    ok(!/christmasOrder|christmasDistanceGroup|CHRISTMAS_NEARBY_MI/.test(read(other)), `${other} does not use the Christmas ordering law`);
  }
}

// ── 4c. The research data (EXECUTED; deep checks in check-christmas-research) ─
{
  ok(CHRISTMAS_PUBLISHED_RESEARCH.length >= 450 && CHRISTMAS_PUBLISHED_RESEARCH.every((r) => SPEC_IDS.includes(christmasEventRail(r))), `every published research listing carries one of the eight rails (${CHRISTMAS_PUBLISHED_RESEARCH.length})`);
  ok(Object.keys(CHRISTMAS_CITY_POINTS).length > 200 && Object.values(CHRISTMAS_CITY_POINTS).every(([la, ln]) => la > 24.3 && la < 31.1 && ln > -87.7 && ln < -79.8), "the Census city points are all in Florida");
  ok(Object.values(CHRISTMAS_EVENT_RAIL).every((r) => SPEC_IDS.includes(r)), "the fallback rail map only names the eight rails");
}

// ── 5. Copy (EXECUTED) ──────────────────────────────────────────────────────
{
  ok(Object.keys(CHRISTMAS_PLACE_RAIL).length === 0, "the production place pool is empty: pop up bars are research listings, one card each");
  const copy = composed.rails.flatMap((r) => [r.title, r.deck, ...r.cards.flatMap((c) => [c.title, c.take, c.hook])]);
  ok(copy.every(noDash), "no dash in any rendered title, deck or take");
  const posterRow = railById("christmas");
  ok(!!posterRow, "the christmas poster rail record exists");
  // The art reads only "Florida Christmas / Beautifully Curated" and names no rail, so the copy
  // follows the eight rails; check-rail-art-matches-copy re-pins the copy hash (2026-10-09).
  ok(posterRow && posterRow.title === "Florida Christmas" && posterRow.short === "Lights, parades, parties & pop up bars" && posterRow.cta === "Find your Christmas", "poster copy matches the eight rails");
  ok(posterRow && !/beach|manatee/i.test([posterRow.short, posterRow.sub, posterRow.axis, posterRow.emptyWhy].join(" ")), "the poster no longer promises beaches or manatees");
  ok(posterRow && ["title", "short", "sub", "cta", "axis", "emptyWhy"].every((k) => noDash(posterRow[k])), "poster copy has no dashes");
  ok(posterRow && posterRow.art === "christmas" && !posterRow.href && !posterRow.posterHidden, "the poster wears christmas art, carries no href and is not hidden (a tap opens the drop)");
  ok(RAILS.filter((r) => r.id === "christmas").length === 1, "exactly one christmas rail record");
  const pending = existsSync(path.join(ROOT, "docs/christmas-2026-pending.md")) ? read("docs/christmas-2026-pending.md") : "";
  ok(/watchlist/i.test(pending) && /Excluded/.test(pending) && (pending.match(/^\| /gm) || []).length >= 150, "docs/christmas-2026-pending.md lists every watchlist and excluded row with its reason");
}

// ── 6. Poster position ──────────────────────────────────────────────────────
const ids = RAILS.map((r) => r.id);
// Owner slot rule (2026-10-08): 2nd in the morning, lunch and at night, 3rd in
// the afternoon (behind tonight); 1st all day from the morning after
// Thanksgiving through Jan 6.
const LIVE_SLOT = { morning: 1, lunch: 1, afternoon: 2, night: 1 };
for (const band of DAYPART_IDS) {
  const live = orderFor(band, ids, "2026-10-08");
  ok(live[0] === "augtober" && live.indexOf("christmas") === LIVE_SLOT[band], `${band}: while fall is live, christmas is poster ${LIVE_SLOT[band] + 1} (got ${live.slice(0, 4).join(", ")})`);
  const noDate = orderFor(band, ids);
  ok(noDate.indexOf("christmas") === LIVE_SLOT[band], `${band}: with no date the static order keeps the same slot`);
  for (const d of ["2026-11-27", "2026-12-25", "2027-01-06"]) {
    const after = orderFor(band, ids, d); // Thanksgiving 2026 is Nov 26
    ok(after[0] === "christmas", `${band} ${d}: christmas is the first poster (got ${after.slice(0, 3).join(", ")})`);
    ok(new Set(after).size === ids.length && after.length === ids.length, `${band} ${d}: nothing is dropped or duplicated`);
  }
  const thanksgiving = orderFor(band, ids, "2026-11-26");
  ok(thanksgiving[0] === "augtober", `${band}: Thanksgiving Day itself still leads with fall`);
}
ok(christmasLeads("2026-11-27") && !christmasLeads("2026-11-26") && !christmasLeads("2026-07-15") && christmasLeads("2026-12-31") && christmasLeads("2027-01-06") && !christmasLeads("2027-01-07") && christmasLeads("2025-11-28") && !christmasLeads("2025-11-27"), "christmasLeads follows the fall season law (Thanksgiving computed per year) through Jan 6");

// ── 6b. Revenue: ticketed events carry the affiliate CTA (EXECUTED) ────────
// Healthy wf_deals rows for every UT entry, as the route would read them (a missing row means "not servable", exactly as in Fall).
const LIVE = new Map(CHRISTMAS_TICKET_DEAL_IDS.map((id) => [id, { id, active: true, link_ok: true }]));
const TICKETED = ["mvmcp-2026", "christmas-town-2026", "seaworld-orlando-christmas-2026", "legoland-fl-holidays-2026", "epcot-festival-holidays-2026", "universal-orlando-holidays-2026"];
// ZooTampa Christmas in the Wild has NO verified bookable partner product yet (lib/eventTicketDeals.js NO_EXACT_AFFILIATE_PRODUCT,
// re-check due weekly). Until mapped it must carry that reviewed decision; once mapped it must carry a real CTA.
const zt = christmasEventTicket("zootampa-christmas-wild-2026", LIVE);
ok(zt ? /^\/api\/commerce\/go\?/.test(zt.href) : !!NO_EXACT_AFFILIATE_PRODUCT["zootampa-christmas-wild-2026"], "zootampa-christmas-wild-2026: either a /api/commerce/go CTA, or a reviewed no-exact-product decision (never silently unmapped)");
for (const id of TICKETED) {
  const cta = christmasEventTicket(id, LIVE);
  ok(!!cta && /^\/api\/commerce\/go\?/.test(cta.href) && cta.href.includes("surface=christmas_intent_rail") && cta.href.includes("content=" + id),
    `${id}: ticket CTA goes through /api/commerce/go on surface christmas_intent_rail (got ${cta && cta.href})`);
  ok(cta && !/^https?:/.test(cta.href), `${id}: the CTA is never a raw partner URL`);
  ok(cta && typeof cta.label === "string" && cta.label.length > 0, `${id}: the CTA has a button label`);
}
ok(Array.isArray(CHRISTMAS_TICKET_DEAL_IDS) && CHRISTMAS_TICKET_DEAL_IDS.length > 0, "the route bulk reads wf_deals health for Undercover Tourist entries");
ok(christmasEventTicket("no-such-event-2026") === null, "an event with no ticket mapping gets no CTA");
const utId = TICKETED.map((id) => christmasEventTicket(id, LIVE)).find((c) => c && c.provider === "undercover_tourist");
if (utId) {
  const dead = new Map([[utId.offer_id, { id: utId.offer_id, active: true, link_ok: false }]]);
  ok(christmasEventTicket(TICKETED.find((id) => christmasEventTicket(id, LIVE)?.offer_id === utId.offer_id), LIVE) !== null, "positive control: the same event with a healthy deal row keeps its CTA");
  const evId = TICKETED.find((id) => christmasEventTicket(id, LIVE)?.offer_id === utId.offer_id);
  ok(christmasEventTicket(evId, dead) === null, "a dead Undercover Tourist deal (link_ok false) drops the CTA");
}

// ── 6c. Each rail links its OWN guide, or none (EXECUTED) ─────────────────
ok(Object.isFrozen(CHRISTMAS_RAIL_GUIDE_SLUGS), "the rail to guide map is frozen");
const EXPECT_SLUG = { lights: "florida-holiday-nights-out-2026", "theme-parks": "florida-theme-park-christmas-2026", "boat-parades": "florida-christmas-boat-parades-2026" };
ok(JSON.stringify(CHRISTMAS_RAIL_GUIDE_SLUGS) === JSON.stringify(EXPECT_SLUG), "lights, theme parks and boat parades link their guide; the other rails have none");
const withGuides = withChristmasGuides(composed.rails, "2026-12-01");
ok(withGuides.length === 8 && withGuides.every((r, i) => r.id === composed.rails[i].id && r.cards === composed.rails[i].cards), "attaching guides keeps the eight rails, order and cards");
for (const r of withGuides) {
  if (!EXPECT_SLUG[r.id]) { ok(!r.guide, `${r.id}: no guide`); continue; }
  ok(!!r.guide && r.guide.slug === EXPECT_SLUG[r.id], `${r.id}: gets its own guide ${EXPECT_SLUG[r.id]} (got ${r.guide && r.guide.slug})`);
  ok(r.guide && !!GUIDES[r.guide.slug] && !!r.guide.image && !!r.guide.image.src, `${r.id}: the guide exists in GUIDES and carries a picture`);
  ok(r.guide && r.guide.href === "/guides/" + r.guide.slug && r.guide.title && r.guide.teaser, `${r.id}: guide has href, title and teaser`);
  ok(r.guide && !/[\u2014\u2013]| - /.test(r.guide.teaser), `${r.id}: guide teaser has no dash`);
}
const slugs = withGuides.map((r) => r.guide && r.guide.slug).filter(Boolean);
ok(slugs.length === 3 && new Set(slugs).size === 3, "no two rails share a guide");
ok(!!GUIDES["florida-winter-beaches-2026"] && !!GUIDES["florida-manatee-season-2026"], "the beaches and manatees guides stay published (only unmapped)");
ok(christmasRailGuide("lights", "2027-04-01") === null, "an archived guide (past endsOn) is omitted");
ok(christmasRailGuide("lights", "2026-12-01", {}) === null, "a missing guide is omitted");
ok(christmasRailGuide("no-such-rail", "2026-12-01") === null && christmasRailGuide("parades", "2026-12-01") === null, "an unknown or unmapped rail gets no guide");

// ── 6d. Venue enrichment: rows with no place_id or coordinates (EXECUTED) ───
const INV = new Map([
  ["ChIJfyPWjCh-54gR1SvWozmef5k", { lat: 28.4110, lng: -81.4612 }],
  ["ChIJvRBCrN9-54gRGZuuaCLGrQE", { lat: 28.4724, lng: -81.4690 }],
  ["ChIJ38rlfogN3YgRGic46M9dbLw", { lat: 27.9899, lng: -81.6914 }],
  ["ChIJhRo4DU_GwogRUgjhMAj-pag", { lat: 28.0371, lng: -82.4195 }],
]);
for (const id of ["seaworld-orlando-christmas-2026", "universal-orlando-holidays-2026", "legoland-fl-holidays-2026", "christmas-town-2026"]) {
  const raw = { event_id: id, event_name: "Holiday Night", start_date: "2026-11-20", end_date: "2027-01-03", lat: null, lng: null, place_id: null, tags: [] };
  const out = enrichChristmasEvent(raw, INV);
  ok(!!out.place_id && Number.isFinite(out.lat) && Number.isFinite(out.lng) && !out.approxLocation, `theme park ${id} gets a place_id and exact coordinates through enrichment`);
  ok(raw.lat === null && raw.place_id === null, `${id}: enrichment does not mutate the source row`);
  const placed = composeChristmasIntentRails([{ ...out, event_name: "Park Holiday Night" }], [], { ...ORLANDO, today: TODAY }).rails.find((r) => r.id === "theme-parks");
  ok(placed.cards.some((c) => c.id === id), `${id}: once enriched it lands in theme-parks`);
  const unplaced = composeChristmasIntentRails([{ ...raw, event_name: "Park Holiday Night" }], [], { ...ORLANDO, today: TODAY }).rails.find((r) => r.id === "theme-parks");
  ok(!unplaced.cards.some((c) => c.id === id), `${id}: without enrichment it is dropped (negative control, strict: no guessed coordinates)`);
}
ok(enrichChristmasEvent({ event_id: "x", lat: 1, lng: 2, place_id: "keep" }, INV).place_id === "keep" && enrichChristmasEvent({ event_id: "x", lat: 1, lng: 2, place_id: "keep" }, INV).lat === 1, "enrichment never overwrites values the event already has");
ok(enrichChristmasEvent({ event_id: "seaworld-orlando-christmas-2026", lat: null, lng: null }, new Map()).lat === null, "no inventory row and no city means no coordinates (never guessed)");
ok(Object.isFrozen(CHRISTMAS_EVENT_VENUE_PLACE_IDS) && CHRISTMAS_EVENT_VENUE_PLACE_IDS["tampa-riverwalk-boat-parade-2026"] === "ChIJxYFS48fFwogRHog4kPPOB5c", "Tampa Riverwalk resolves to the downtown row only");
ok(!Object.values(CHRISTMAS_EVENT_VENUE_PLACE_IDS).some((id) => id === "ChIJ97epfgDFwogR64olsB0w6TU" || id === "ChIJL_dfJozEwogRF_55TezQpYo"), "neither ambiguous Tampa Riverwalk row is mapped");
const live = (name, start, end, tags) => ev("x-" + name, name, start, end, { tags });
ok(christmasEventRail(live("St. Pete Indie Flea Fall/Winter Market", "2027-01-03", "2027-01-03", ["market"])) === null, "St. Pete Indie Flea is excluded (not Christmas)");
for (const n of ["Holiday Lights Spectacular", "Haven Holiday Market"]) {
  ok(christmasEventRail(live(n, "2026-11-21", "2027-01-02", ["festival", "holiday", "fall"])) !== null, `${n}: a stray fall tag does not veto a holiday named event`);
}
ok(christmasEventRail(live("Fall Harvest Lights Night", "2026-11-21", "2026-11-21", ["fall"])) === null, "a fall tagged event with no holiday word in its name stays out");

// ── 6e. Christmas card skin (owner art, 2026-10-08) ────────────────────────
// CSS is loaded by EXECUTING app/components/css.js (jsxLoad) and its rules are
// parsed; the component wrapper is asserted on comment stripped source because
// ChristmasIntentRails needs a live fetch to render its rails.
{
  const { loadComponent } = await import("./lib/jsxLoad.mjs");
  const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(ROOT, "app/components/css.js"), ROOT);
  const { PLACE_CARD_SKIN_EXCEPTIONS } = await import("../lib/placeCardStandard.js");
  const rules = (cssText) => [...String(cssText).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const SCOPES = [/^\.wf-christmas \.wf-place-card:not\(\.wf-guide-card\)/, /^\.wf-place-card\.wf-christmas-card:not\(\.wf-guide-card\)/];
  // A rule is Christmas skin when it names the scope class or paints the Christmas art.
  const leaks = (cssText) => rules(cssText).filter((r) => /wf-christmas|\/christmas\//.test(r.sel + r.body))
    .flatMap((r) => r.sel.split(",").map((one) => one.trim()).filter((one) => !SCOPES.some((rx) => rx.test(one))).map((one) => one + " {" + r.body.slice(0, 60) + "}"));
  ok(leaks(".wf-place-card{background:url(/christmas/card-bg-640.webp)}").length === 1, "POSITIVE CONTROL: a bare .wf-place-card rule painting the Christmas art is caught");
  ok(leaks(".wf-christmas .wf-place-card:not(.wf-guide-card) .wf-place-card-name{color:#FFF}").length === 0, "NEGATIVE CONTROL: a scoped rule passes");
  const xmasRules = rules(WF_PLACE_CARD_CSS).filter((r) => /wf-christmas/.test(r.sel));
  ok(xmasRules.length >= 15, `the Christmas skin rules exist in the shipped place card CSS (${xmasRules.length} rules)`);
  const leaked = leaks(WF_PLACE_CARD_CSS);
  ok(leaked.length === 0, `every Christmas skin selector is scoped to the Christmas collection or .wf-christmas-card, never a bare card (leaks: ${leaked.slice(0, 3).join(" | ")})`);
  const has = (selRx, bodyRx, label) => ok(xmasRules.some((r) => selRx.test(r.sel) && bodyRx.test(r.body)), label);
  has(/\.wf-place-card:not\(\.wf-guide-card\)(?:,|$)/, /#5A0712 url\(\/christmas\/card-bg-top-640\.webp\?v=3/, "every Christmas card defaults to the safe art (line art only in the band empty on every card)");
  has(/:not\(:has\(\.wf-rail-card-cta\)\):not\(:has\(\.wf-place-card-book\)\)/, /card-bg-640\.webp\?v=3/, "the lower band art (gift, tree) only shows on cards with no ticket or book button");
  ok(!xmasRules.some((r) => /card-bg-640\.webp|card-bg-1100\.webp/.test(r.body) && !/:not\(:has\(\.wf-rail-card-cta\)\)/.test(r.sel)), "the full art is never the unconditional background (it would sit behind a Tickets button)");
  ok(!xmasRules.some((r) => /wayfind-score-badge>span:first-child|wf-rail-when-rail/.test(r.sel) && /background/.test(r.body)), "the score badge keeps its truthful tier colour segment (the skin never repaints it)");
  has(/\.wayfind-score-badge(?:,|$)/, /border-color:#E8B48A/, "the score badge frame is rose gold");
  has(/\.wf-place-card:not\(\.wf-guide-card\)(?:,|$)/, /right top\/auto 100%/, "the art is sized to the card height and anchored right, so desktop cards keep the bands empty");
  ok(/url\(\/christmas\/card-bg-1100\.webp/.test(WF_PLACE_CARD_CSS), "high density screens get the 1100 background");
  has(/:not\(\.is-liked\):not\(\.is-disliked\)/, /border:1px solid rgba\(232,180,138/, "the rose gold border yields to liked and disliked states");
  has(/button:not\(\.is-active\)/, /#4A0610[\s\S]*rgba\(232,180,138/, "resting buttons are dark maroon with a rose gold outline; an active control is never repainted");
  ok(!xmasRules.some((r) => /(^|,|\s)button(\s*,|\s*$)/.test(r.sel)), "no blanket button rule without :not(.is-active)");
  has(/wf-place-card-category:before/, /1F384/, "the category pill carries the tree glyph");
  has(/wf-place-card-category(?!:)/, /#4A0610[\s\S]*#E8B48A|#E8B48A[\s\S]*#4A0610/, "the category label is a dark maroon pill with a rose gold outline");
  has(/wf-place-card-highlights>span/, /#4A0610[\s\S]*rgba\(232,180,138/, "chips are dark maroon pills with a rose gold outline");
  has(/wf-rail-card-cta/, /#D3172F[\s\S]*#E8B48A/, "the primary ticket CTA is a brighter red with a rose gold outline");
  ok(!xmasRules.some((r) => /wf-place-card-media/.test(r.sel) && /background-image|url\(/.test(r.body)), "no decoration is painted over the photo column");
  const xmas = PLACE_CARD_SKIN_EXCEPTIONS.find((x) => x.id === "christmas");
  ok(PLACE_CARD_SKIN_EXCEPTIONS.length === 3 && !!xmas && xmas.approved === "2026-10-08", "Christmas is registered as the third owner approved skin exception");
  for (const [file, cap] of [["public/christmas/card-bg-640.webp", 60 * 1024], ["public/christmas/card-bg-1100.webp", 120 * 1024], ["public/christmas/card-bg-top-640.webp", 60 * 1024], ["public/christmas/card-bg-top-1100.webp", 120 * 1024]]) {
    const full = path.join(ROOT, file);
    ok(existsSync(full) && statSync(full).size > 1000 && statSync(full).size <= cap, `${file} exists and is under ${cap / 1024}KB (${existsSync(full) ? statSync(full).size : "missing"} bytes)`);
  }
  const comp = read("app/components/ChristmasIntentRails.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const wraps = comp.match(/className="wf-rail wf-rail-exploding wf-christmas" data-rail=\{railId\}/g) || [];
  ok(wraps.length === 1, `the rail that holds every Christmas card carries .wf-christmas exactly once (found ${wraps.length})`);
  ok(!/wf-christmas/.test(read("app/components/FallIntentRails.js")) && !/wf-christmas/.test(read("app/components/RailCard.js")), "no other collection or the shared card opts into the Christmas skin");
}

// ── 6f. Short card labels: the red pill never truncates ────────────────────
{
  ok(Object.isFrozen(CHRISTMAS_CARD_LABELS) && Object.keys(CHRISTMAS_CARD_LABELS).length === 8, "eight frozen card labels");
  for (const [id, , want] of SPEC_RAILS) {
    const label = CHRISTMAS_CARD_LABELS[id];
    ok(label === want && label.length <= 14, `${id}: card label is the short "${want}" (<= 14 chars; got "${label}")`);
  }
  const compSrc = read("app/components/ChristmasIntentRails.js");
  ok(/eyebrow=\{CHRISTMAS_CARD_LABELS\[rail\.id\]/.test(compSrc), "cards wear the short label, not the full rail title (static)");
}

// ── 6h. Events with no photo get the designed tile; approximate locations ──
ok(eventPlaceholder("community", { name: "Tampa Riverwalk Holiday Lighted Boat Parade" }).label === "Boat parade", "a boat parade with no photo gets the boat parade tile");
ok(eventPlaceholder("community", { name: "Holiday Lights in Largo Central Park" }).label === "Holiday lights", "a holiday lights event gets the holiday lights tile");
ok(eventPlaceholder("community", { name: "Christmas on Las Olas" }).label === "Christmas event", "a Christmas event gets the Christmas tile");
ok(eventPlaceholder("community", { name: "Clearwater Jazz Holiday" }).label !== "Christmas event", "the October jazz festival does not get a Christmas tile");
ok(eventPlaceholder("community", { name: "Downtown Christmas Event", christmasRail: "parades" }).label === "Parade", "a parade gets the Parade tile by its rail");
ok(eventPlaceholder("community", { name: "Ugly Sweater Crawl", christmasRail: "parties" }).label === "Christmas party", "a party gets the Christmas party tile by its rail");
ok(eventPlaceholder("community", { name: "Miracle", christmasRail: "popup-bars" }).label === "Pop up bar", "a pop up bar gets the Pop up bar tile by its rail");
ok(eventPlaceholder("community", { name: "Halloween Party", christmasRail: "parties" }).label === "Halloween", "a Halloween name still wins over any Christmas rail tile");
ok(/placeholder: image \? null : eventPlaceholder\("community", \{[^}]*christmasRail: rail \}\)/.test(read("lib/christmasCards.js")) && /const rail = christmasEventRail\(e\)/.test(read("lib/christmasCards.js")) && /\(event\.image \|\| event\.placeholder\)/.test(read("app/api/events/christmas/route.js")), "the shared card picks the tile by the event's rail and the route keeps a no photo event (static)");
ok(/placeholder=\{isEvent && !card\.image \? card\.placeholder/.test(read("app/components/ChristmasIntentRails.js")), "the card renders the designed tile (static)");
{
  const tl = enrichChristmasEvent({ event_id: "x", city: "Tallahassee", state: "FL", lat: null, lng: null }, new Map());
  ok(tl.approxLocation === true && Number.isFinite(tl.lat) && Number.isFinite(tl.lng), "an event with only a covered Florida city gets that city's vetted centre, marked approximate");
  const wp = enrichChristmasEvent({ event_id: "y", city: "Winter Park", lat: null, lng: null }, new Map());
  ok(wp.approxLocation === true && wp.lat === CHRISTMAS_CITY_POINTS["Winter Park"][0], "a city outside the landing table uses its Census point, marked approximate");
  ok(enrichChristmasEvent({ event_id: "y2", city: "Atlantis On Mars", lat: null, lng: null }, new Map()).lat === null, "an unknown city stays unplaced (never invented)");
  ok(christmasCityCentre("Naples", "GA") === null, "a non Florida state never borrows a Florida centre");
  ok(enrichChristmasEvent({ event_id: "z", city: "Naples", lat: 26.1, lng: -81.8 }, new Map()).approxLocation === undefined, "an event with its own coordinates is never marked approximate");
}

// ── 6i. One destination, one card; honest distances ───────────────────────
{
  ok(CHRISTMAS_KNOWN_DUPLICATE_IDS.length === 3 && CHRISTMAS_KNOWN_DUPLICATE_IDS.every((id) => !CHRISTMAS_PLACE_RAIL[id] && !Object.values(CHRISTMAS_EVENT_VENUE_PLACE_IDS).includes(id)), "the three EXCLUDED Coquina Beach duplicate pins are never pooled");
  const extraFixture = [
    ...events,
    ev("selby-dup-a-2026", "Selby Holiday Lights Night A", "2026-12-06", "2026-12-06", { place_id: "ChIJPTvxtmpAw4gReToYD5mTNwE", christmas_rail: "lights" }),
    ev("selby-dup-b-2026", "Selby Garden Christmas Glow", "2026-12-07", "2026-12-07", { place_id: "ChIJPTvxtmpAw4gReToYD5mTNwE", christmas_rail: "lights" }),
    ev("series-a-2026", "Harbor Lighted Boat Parade", "2026-12-10", "2026-12-10", { event_series_id: "harbor", lat: 30.3, lng: -81.6 }),
    ev("series-b-2026", "Harbor Lighted Boat Parade Encore", "2026-12-17", "2026-12-17", { event_series_id: "harbor", lat: 30.3, lng: -81.6 }),
    ev("tagdup-2026", "Holiday Lights Walk", "2026-12-11", "2027-01-02", { tags: ["christmas", "lights", "parade"] }),
  ];
  for (const [label, at] of [["Sarasota", SARASOTA], ["Naples", { lat: 26.142, lng: -81.7948 }], ["Jacksonville", { lat: 30.33, lng: -81.66 }]]) {
    const out = composeChristmasIntentRails(extraFixture, placeFixture(), { ...at, today: TODAY });
    for (const r of out.rails) {
      ok(r.cards.every((c) => c.kind === "event" ? christmasEventRail(c) === r.id : c.christmasRail === r.id), `${label} ${r.id}: every card (top up included) belongs to this rail by the same classifier`);
      const venues = r.cards.map((c) => c.kind === "event" ? c.place_id : c.id).filter(Boolean);
      ok(new Set(venues).size === venues.length, `${label} ${r.id}: no venue appears twice`);
      const series = r.cards.map((c) => c.event_series_id).filter(Boolean);
      ok(new Set(series).size === series.length, `${label} ${r.id}: no event series appears twice`);
      const names = r.cards.map((c) => String(c.name || c.event_name || "").toLowerCase());
      ok(new Set(names).size === names.length, `${label} ${r.id}: no name appears twice (tags never create a second card)`);
      ok(r.cards.every((c) => c.distanceGroup === christmasDistanceGroup(c.distMi)), `${label} ${r.id}: every card's group matches its distance`);
    }
    const allOut = out.rails.flatMap((r) => r.cards.map((c) => String(c.id)));
    ok(new Set(allOut).size === allOut.length, `${label}: topping up never repeats a card across rails`);
  }
  ok(christmasDistanceLabel({ distMi: 8.1 }) === "8.1 mi" && christmasDistanceLabel({ distMi: 74.6 }) === "75 mi", "a Nearby or Within reach card shows its true distance");
  ok(christmasDistanceLabel({ distMi: 90 }) === "90 mi" && christmasDistanceLabel({ distMi: 118.2 }) === "118 mi · Day trip", `over ${CHRISTMAS_DAY_TRIP_MI} mi a card is clearly labeled Day trip`);
  ok(christmasDistanceLabel({ distMi: 12.4, approxLocation: true }) === "~12 mi" && christmasDistanceLabel({ distMi: 140, approxLocation: true }) === "~140 mi · Day trip", "a city centre location keeps ~N mi");
  ok(christmasDistanceLabel({}) === null, "no distance, no label");
  ok(/christmasDistanceLabel\(card\)/.test(read("app/components/ChristmasIntentRails.js")), "both card kinds render christmasDistanceLabel (static)");
  const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const f = path.join(dir, n); if (statSync(f).isDirectory()) { if (!/node_modules|\.next|\.wf-jsx/.test(f)) walk(f, out); } else if (/\.m?js$/.test(n)) out.push(f); } return out; };
  const uses = [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "app"))].filter((f) => /\b(?:CHRISTMAS_DAY_TRIP_MAX|christmasDistanceLabel|christmasDistanceGroup|CHRISTMAS_DAY_TRIP_MI)\b/.test(readFileSync(f, "utf8")));
  ok(uses.length > 0 && uses.every((f) => /christmas/i.test(path.basename(f))), `distance grouping lives only in Christmas files (${uses.map((f) => path.relative(ROOT, f)).join(", ")})`);
  for (const other of ["lib/lunchBreakRails.js", "lib/nightOutIntent.js", "lib/todayDiscoveryRails.js", "lib/worthEatingRails.js", "lib/breakfastRails.js", "lib/fallIntentRails.js", "lib/dateNightIntent.js", "lib/birthdayIntent.js"]) {
    ok(!/christmasIntentRails|topped? up to/i.test(readFileSync(path.join(ROOT, other), "utf8")), `${other} has no Christmas style top up or distance grouping`);
  }
}

// ── 6j. Photoless events: decorative artwork, never a fake photo (EXECUTED) ─
{
  const { loadComponent: lc } = await import("./lib/jsxLoad.mjs");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const RailCard = (await lc(path.join(ROOT, "app/components/RailCard.js"), ROOT)).default;
  const names = ["Holiday Lights in Largo Central Park", "Tampa Riverwalk Holiday Lighted Boat Parade", "Christmas on Las Olas", "Haven Holiday Market", "Some Unnamed Night"];
  for (const n of names) {
    const tile = eventPlaceholder("community", { name: n });
    ok(!!tile && !!tile.label && /gradient/.test(tile.tint) && !/\.(jpe?g|png|webp|avif)|https?:/.test(JSON.stringify(tile)), `"${n}": a photoless event always gets a designed tile (never hidden, never a photo)`);
    const html = renderToStaticMarkup(React.createElement(RailCard, { title: n, photo: "", placeholder: tile }));
    ok(/role="img"/.test(html) && html.includes(`aria-label="${tile.label} illustration"`) && /data-artwork="illustration"/.test(html), `"${n}": the tile is announced as an illustration`);
    ok(!/<img/.test(html) && !/wf-place-card-photo-attr/.test(html), `"${n}": no image element and no photo credit on the tile`);
  }
  const withPhoto = renderToStaticMarkup(React.createElement(RailCard, { title: "x", photo: "/api/photo?place=ChIJx&w=640", placeholder: eventPlaceholder("community", { name: "Christmas on Las Olas" }) }));
  ok(/<img/.test(withPhoto) && !/wf-event-placeholder/.test(withPhoto), "a real venue photo always wins over the tile");
  const routeSrc = read("app/api/events/christmas/route.js");
  ok(/placeholder: image \? null : eventPlaceholder\(/.test(read("lib/christmasCards.js")) && /\.filter\(\(event\) => \(event\.image \|\| event\.placeholder\) && \(event\.url \|\| event\.place_id \|\| event\.detailHref\)\)/.test(routeSrc), "the route keeps every photoless event that has a destination (static)");
  const css = (await lc(path.join(ROOT, "app/components/css.js"), ROOT)).WF_PLACE_CARD_CSS;
  ok(/\.wf-event-placeholder:after\{display:none\}/.test(css), "the tile drops the monogram ring, so it reads as flat artwork");
}

// ── 7. Wiring (STATIC: a component and a route cannot be executed here) ─────
const route = read("app/api/events/christmas/route.js");
ok(/christmas-intents:v\d+:/.test(route), "the route has its own christmas cache key");
ok(!/googleapis|maps\.google|places\.googleapis|fetch\(/.test(route), "the route makes no network fetch and no Google call (owned Supabase reads only)");
ok(/\.from\("wf_inventory"\)/.test(route) && /fetchCuratedEvents\(/.test(route), "the route reads wf_inventory and wf_events");
ok(/rails\?\.length === 8/.test(route), "the route's cache gate requires exactly eight rails");
const comp = read("app/components/ChristmasIntentRails.js");
ok(/result\.rails\.length !== RAIL_COUNT/.test(comp) && /RAIL_COUNT = 8/.test(comp), "the component requires exactly eight rails");
ok(/<RailGuideSlot railId=\{rail\.id\} guide=\{rail\.guide/.test(comp) && !/GuideRailCollection|<aside/.test(comp), "each rail puts its own guide third inside its own track, nothing between rails (static; owner rule 2026-10-08)");
ok(/onTrack=\{onTrack\}/.test(comp) && /"guide_open", props/.test(read("app/components/RailGuideSlot.js")) && /rail: railId/.test(read("app/components/RailGuideSlot.js")), "a guide click is tracked as guide_open with the rail and slug (static)");
ok(/christmas-intents:v6:/.test(route) && /mergeChristmasResearch\(rows \|\| \[\]\)/.test(route) && /mergedRows\.filter\(/.test(route) && /enrichChristmasEvent\(e, inventoryById\)/.test(route) && /withChristmasGuides\(composed\.rails, today\)/.test(route), "the route bumps its cache key, merges the research data at read time, enriches and attaches guides server side (static)");
ok(/christmasEventCard\(e, \{ today, inventory: inventoryById\.get\(e\.place_id\) \|\| null, pageSlugs, byDealId \}\)/.test(route), "every event card is built by the shared christmasEventCard (static; executed in check-christmas-research)");
ok(/from "\.\.\/\.\.\/lib\/christmasCardCopy\.js"/.test(comp) && !/lib\/christmasIntentRails|lib\/christmasDiscoveries2026|lib\/christmasPool/.test(comp) && !/^\s*import/m.test(read("lib/christmasCardCopy.js")), "the client component imports only the client safe card copy, so the registry never ships to the browser (static; production chunks are swept after the build)");
ok(!/directionsUrl|fallSkin|isSpookyCard|spookySkin|wf-fall/.test(comp), "the component wears no fall or spooky skin and no Directions button");
ok(/christmasEventTicket\(e\.event_id, byDealId\)/.test(read("lib/christmasCards.js")) && /ticket,\s*\n/.test(read("lib/christmasCards.js")) && /byDealId \}\)/.test(route), "the shared card attaches the ticket and the route passes the live deals (static)");
ok(/kind: TICKET_SURFACE/.test(comp) && /surface: TICKET_SURFACE/.test(comp) && /TICKET_SURFACE = "christmas_intent_rail"/.test(comp) && /cta=\{isEvent \? eventCta\(card, onTrack\)/.test(comp), "the component renders the CTA with tickets_out and commerce tracking (static)");
const rail = read("app/components/DaypartRail.js");
ok(/ChristmasIntentRails = dynamic\(/.test(rail) && /christmas: \(\) => import\("\.\/ChristmasIntentRails"\)/.test(rail), "DaypartRail lazy loads and prewarms the Christmas component");
ok(/selRail && selRail\.id === "christmas" \? \(\s*<ChristmasIntentRails/.test(rail), "the pop down mounts the Christmas component for the christmas poster");
ok(/selRail\.id === "christmas"/.test((rail.match(/const railOwnsItsOwnAnswer =[^;]+;/) || [""])[0]), "christmas owns its own answer, like fall");

console.log(`\ncheck-christmas-rails: ${fail ? "FAIL" : "OK"}: ${pass} assertions (executed composeChristmasIntentRails on ${events.length} fixture events, ${placeFixture().length} fixture places and the ${CHRISTMAS_PUBLISHED_RESEARCH.length} published research listings; wiring checks are static)`);
process.exit(fail ? 1 : 0);
