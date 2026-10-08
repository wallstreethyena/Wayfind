#!/usr/bin/env node
// scripts/check-christmas-rails.mjs: the Christmas in Florida collection,
// EXECUTED. composeChristmasIntentRails is imported and invoked on fixture
// data; the assertions read what it returns, not what its source says.
//
// Owner-approved spec (2026-10-08): five rails in a fixed order, each event in
// exactly one rail or none, owned data only. The wiring checks at the bottom
// are static (a component cannot be rendered here) and say so.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHRISTMAS_INTENT_RAIL_DEFS, christmasEventRail, composeChristmasIntentRails,
} from "../lib/christmasIntentRails.js";
import { NO_EXACT_AFFILIATE_PRODUCT } from "../lib/eventTicketDeals.js";
import { CHRISTMAS_EVENT_VENUE_PLACE_IDS, enrichChristmasEvent, CHRISTMAS_PLACE_RAIL, CHRISTMAS_PLACE_TAKES, christmasEventTicket, CHRISTMAS_TICKET_DEAL_IDS } from "../lib/christmasPool.js";
import { CHRISTMAS_RAIL_GUIDE_SLUGS } from "../lib/christmasIntentRails.js";
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
  ["beaches", "Winter Beach Days", "Warm sand while everyone else is freezing."],
  // Decks 2 and 5 differ from the first spec draft: the standing deck law (lib/railDeckCopy.js) needs 5 to 8 words and no colon.
  ["theme-parks", "Theme Park Christmas", "Florida's biggest Christmas nights, at the parks."],
  ["nights-out", "Holiday Nights Out", "Light walks, tree lightings and markets near you."],
  ["manatees", "Manatees & Warm Springs", "Florida's gentle giants come in for the winter."],
  ["boat-parades", "Boat Parades & Waterfront Lights", "Christmas, Florida style, with lit boats."],
];
const SPEC_PLACES = {
  beaches: ["ChIJh8tXh-FBw4gR9kFzfZN_g60", "ChIJQR0CdIhqw4gR-BqidycQm8o", "ChIJV7hk7dQTw4gRNDR1PONlwis", "ChIJg7BBe7URw4gRIQTacN1Cla8", "ChIJgwiM83gFw4gRZQbHiDUoSIE", "ChIJ2wMEgdUCw4gRWcUhdrwmyVg", "ChIJOxaHOSX9wogRT6_58s6LWOY", "ChIJp6kyPa1Dw4gR5BhsSYE8pdo", "ChIJPfHzt4Nbw4gReInyfaTUn2Y", "ChIJ_4R4dXj0wogRhGK2MtUmBjI", "ChIJEU6v8Zgz24gRNkuw0EtKDt8", "ChIJu0jFtWc924gRf_9YuPnSc2w", "ChIJlb2_qywf24gRFYBsNGXcHW0", "ChIJxVcTIQ7i0IgRgYa6c5TNrgk", "ChIJYxGtrzGx0YgRO0FndRyfyLs", "ChIJT6PHOUbK2YgRamANgVMeFqk", "ChIJARLTeoy12YgRWrhf9BwKLXU"],
  manatees: ["ChIJjZq3rbFB6IgRb6e1zyAKbg4", "ChIJyYEUav8P54gRatuv_zQzm20", "ChIJpUJtM-_ZwogROGyfAWFNelo", "ChIJTTHiI8w_6IgR89hvVjSS-vc", "ChIJf9MKQU3U2IgR0Rp4MD467xw", "ChIJa1kHd4Vp24gRj7H2MiIoSwo", "ChIJyefyOo4f6YgR98DvEw2xLgA"],
  "nights-out": ["ChIJPTvxtmpAw4gReToYD5mTNwE", "ChIJlcQil-Pj2ogRZXbB55ldZcQ", "ChIJuyCMUy3G2YgRyrGn93iiGoM", "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8", "ChIJ-0qgNoF_3YgRg3Lh7xHDooU"],
};
const SELBY = "ChIJPTvxtmpAw4gReToYD5mTNwE";
const WRONG_VENICE = "ChIJpY1xybu6woAR";
const THEME_PARK_IDS = ["mvmcp-2026", "epcot-festival-holidays-2026", "universal-orlando-holidays-2026", "christmas-town-2026", "seaworld-orlando-christmas-2026", "legoland-fl-holidays-2026", "christmas-at-gaylord-palms-2026"];

const noDash = (s) => !/[—–]| - /.test(String(s || ""));

// ── 1. The definitions ──────────────────────────────────────────────────────
ok(Array.isArray(CHRISTMAS_INTENT_RAIL_DEFS) && Object.isFrozen(CHRISTMAS_INTENT_RAIL_DEFS), "rail definitions are a frozen array");
ok(CHRISTMAS_INTENT_RAIL_DEFS.length === 5, "exactly five rail definitions");
SPEC_RAILS.forEach(([id, title, deck], i) => {
  const def = CHRISTMAS_INTENT_RAIL_DEFS[i];
  ok(def && def.id === id && def.title === title && def.deck === deck, `definition ${i + 1} is ${id} / "${title}" / "${deck}" exactly (got ${JSON.stringify(def)})`);
  ok(noDash(title) && noDash(deck), `${id}: title and deck carry no dashes`);
  ok(deckProblems(deck, title).length === 0, `${id}: deck obeys the rail deck copy law (${deckProblems(deck, title).join(", ")})`);
});

// ── 2. Fixtures ─────────────────────────────────────────────────────────────
const TODAY = "2026-12-01";
const SARASOTA = { lat: 27.34, lng: -82.53 };
const ORLANDO = { lat: 28.42, lng: -81.58 };
const ev = (event_id, event_name, start_date, end_date, extra = {}) => ({
  event_id, event_name, start_date, end_date, ...SARASOTA, tags: [], ...extra,
});
const events = [
  ...THEME_PARK_IDS.map((id, i) => ev(id, `Park Holiday Night ${i + 1}`, "2026-11-13", "2027-01-03", { ...ORLANDO })),
  ev("sarasota-boat-parade-2026", "Sarasota Christmas Boat Parade", "2026-12-12", "2026-12-12"),
  ev("vets-boat-parade-2026", "Veterans Boat Parade", "2026-11-21", "2026-11-21"),
  ev("lighted-regatta-2026", "Lighted Holiday Regatta", "2026-12-19", "2026-12-19"),
  ev("both-words-2026", "Christmas Boat Parade and Holiday Lights", "2026-12-20", "2026-12-20"),
  ev("crystal-river-manatee-season-2026", "Crystal River Manatee Season", "2026-11-15", "2027-03-31", { lat: 28.9, lng: -82.59 }),
  ev("manatee-festival-2026", "Manatee Festival", "2026-12-05", "2026-12-06"),
  ev("tree-lighting-2026", "Downtown Tree Lighting", "2026-12-04", "2026-12-04"),
  ev("lights-walk-2026", "Holiday Lights Walk", "2026-12-10", "2027-01-02"),
  ev("nutcracker-2026", "The Nutcracker", "2026-12-18", "2026-12-20"),
  ev("jazz-holiday-2026", "Clearwater Jazz Holiday", "2026-12-03", "2026-12-06"),
  ev("halloween-lights-2026", "Halloween Lights Spooktacular", "2026-12-02", "2026-12-03"),
  ev("evan-hansen-2026", "Dear Evan Hansen", "2026-12-08", "2026-12-14"),
  ev("anastasia-2026", "Anastasia", "2026-12-08", "2026-12-14"),
  ev("winter-music-2026", "Florida Winter Music Festival", "2026-12-08", "2026-12-14"),
  ev("autumn-art-2026", "Winter Park Autumn Art Festival", "2026-12-08", "2026-12-14"),
  ev("expired-parade-2026", "Old Christmas Parade", "2026-11-28", "2026-11-30"),
  ev("expired-oneday-2026", "Yesterday Santa Visit", "2026-11-30", null),
];
const placeFixture = (rails = Object.keys(SPEC_PLACES)) => rails.flatMap((rail) => SPEC_PLACES[rail].map((id, i) => ({
  id, name: `Place ${id}`, kind: "place", ...SARASOTA, wfScore: 90 - i, take: CHRISTMAS_PLACE_TAKES[id] || null,
})));

// ── 3. Event classifier ─────────────────────────────────────────────────────
const classify = (id) => christmasEventRail(events.find((e) => e.event_id === id));
for (const id of THEME_PARK_IDS) ok(classify(id) === "theme-parks", `theme park event ${id} classifies as theme-parks (got ${classify(id)})`);
ok(classify("sarasota-boat-parade-2026") === "boat-parades", "a Christmas boat parade classifies as boat-parades");
ok(classify("lighted-regatta-2026") === "boat-parades", "a lighted regatta classifies as boat-parades");
ok(classify("both-words-2026") === "boat-parades", "an event matching boat parade AND lights is claimed once, by boat-parades");
ok(classify("vets-boat-parade-2026") === null, "Veterans Boat Parade is excluded");
ok(classify("crystal-river-manatee-season-2026") === "manatees", "Crystal River Manatee Season classifies as manatees");
ok(classify("manatee-festival-2026") === "manatees", "an in-season manatee festival classifies as manatees");
ok(classify("tree-lighting-2026") === "nights-out" && classify("lights-walk-2026") === "nights-out" && classify("nutcracker-2026") === "nights-out", "tree lighting, lights walk and Nutcracker classify as nights-out");
for (const id of ["jazz-holiday-2026", "halloween-lights-2026", "evan-hansen-2026", "anastasia-2026", "winter-music-2026", "autumn-art-2026"]) {
  ok(classify(id) === null, `${id} is excluded by the classifier (got ${classify(id)})`);
}
ok(christmasEventRail(ev("summer-lights", "Summer Lights Festival", "2026-07-04", "2026-07-04")) === null, "a holiday word outside Nov 15 to Jan 6 is not Christmas");
ok(christmasEventRail(null) === null, "null event classifies as null");

// ── 4. Composition ──────────────────────────────────────────────────────────
const composed = composeChristmasIntentRails(events, placeFixture(), { ...SARASOTA, today: TODAY });
ok(Array.isArray(composed.rails) && composed.rails.length === 5, "five rails come back");
SPEC_RAILS.forEach(([id, title, deck], i) => {
  const rail = composed.rails[i];
  ok(rail && rail.id === id && rail.title === title && rail.deck === deck, `rail ${i + 1} is ${id} with the exact title and deck`);
  ok(rail && Array.isArray(rail.cards) && typeof rail.fallbackUsed === "boolean", `${id}: cards array and fallbackUsed flag present`);
});
const railOf = (id) => composed.rails.find((r) => r.id === id);
const idsIn = (rail) => (railOf(rail)?.cards || []).map((c) => c.id);

for (const [rail, list] of Object.entries(SPEC_PLACES)) {
  // Smathers Beach (Key West) and its far neighbors are fixtures at the center, so every id must land.
  for (const id of list) ok(idsIn(rail).includes(id), `spec place ${id} lands in ${rail}`);
}
for (const id of THEME_PARK_IDS) ok(idsIn("theme-parks").includes(id), `theme park event ${id} lands in theme-parks`);
ok(idsIn("boat-parades").includes("sarasota-boat-parade-2026") && idsIn("boat-parades").includes("lighted-regatta-2026"), "boat parade events land in boat-parades");
ok(idsIn("manatees").includes("crystal-river-manatee-season-2026"), "Crystal River Manatee Season lands in manatees");
ok(["tree-lighting-2026", "lights-walk-2026", "nutcracker-2026"].every((id) => idsIn("nights-out").includes(id)), "nights-out events land in nights-out");

const all = composed.rails.flatMap((r) => r.cards);
const allIds = all.map((c) => c.id);
for (const bad of ["vets-boat-parade-2026", "jazz-holiday-2026", "halloween-lights-2026", "evan-hansen-2026", "anastasia-2026", "winter-music-2026", "autumn-art-2026"]) {
  ok(!allIds.includes(bad), `${bad} never renders`);
}
ok(!allIds.includes("expired-parade-2026"), "an expired dated event is dropped");
ok(!allIds.includes("expired-oneday-2026"), "an expired one day event (no end date) is dropped");
ok(!allIds.some((id) => String(id).startsWith(WRONG_VENICE)), "the Venice, California place id never appears");
ok(new Set(allIds).size === allIds.length, `no card appears in two rails (${allIds.length} cards, ${new Set(allIds).size} unique ids)`);
for (const r of composed.rails) ok(new Set(r.cards.map((c) => c.id)).size === r.cards.length, `${r.id}: no repeated card inside the rail`);
ok(composed.rails.every((r) => r.cards.every((c) => c.kind === "place" || c.kind === "event")), "every card is a place or an event");
ok(composed.rails.every((r) => r.fallbackUsed === false), "with local inventory in every rail, no rail used the statewide fallback");

// Ordering convention: soonest date first among events, then places.
const nights = railOf("nights-out").cards;
const firstPlace = nights.findIndex((c) => c.kind === "place");
const lastEvent = nights.map((c) => c.kind).lastIndexOf("event");
ok(firstPlace === -1 || lastEvent < firstPlace, "nights-out lists dated events before undated place cards");
const nightEvents = nights.filter((c) => c.kind === "event").map((c) => c.start_date);
ok(nightEvents.join() === nightEvents.slice().sort().join(), `nights-out events run soonest first (${nightEvents.join(", ")})`);
const beachScores = railOf("beaches").cards.map((c) => c.wfScore);
ok(beachScores.length === 17 && beachScores.every((s, i) => i === 0 || beachScores[i - 1] >= s), `beaches (places only, same distance) run by score, highest first (${beachScores.slice(0, 4).join(", ")}...)`);

// Venue anchors give way to a dated event at the same venue.
const withSelbyEvent = composeChristmasIntentRails(
  [...events, ev("selby-lights-2026", "Selby Gardens Holiday Lights", "2026-12-06", "2027-01-03", { place_id: SELBY })],
  placeFixture(), { ...SARASOTA, today: TODAY });
const nightsSelby = withSelbyEvent.rails.find((r) => r.id === "nights-out").cards.map((c) => c.id);
ok(nightsSelby.includes("selby-lights-2026") && !nightsSelby.includes(SELBY), "a dated event at Selby replaces the Selby place card");
ok(["ChIJlcQil-Pj2ogRZXbB55ldZcQ", "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8"].every((id) => nightsSelby.includes(id)), "other venue anchors stay");

// Radius and fallback: Jacksonville has no nights-out event inside 60 miles.
const JAX = { lat: 30.33, lng: -81.66 };
const far = composeChristmasIntentRails(events, placeFixture(), { ...JAX, today: TODAY });
ok(far.rails.length === 5, "five rails even when every rail is far away");
const farNights = far.rails.find((r) => r.id === "nights-out");
ok(farNights.fallbackUsed === true && farNights.cards.length > 0, "an empty rail falls back to the nearest statewide cards and says so");
ok(farNights.cards.every((c, i, a) => i === 0 || Number.isFinite(c.distMi)), "fallback cards carry a distance");
const noEvents = composeChristmasIntentRails([], [], { ...SARASOTA, today: TODAY });
ok(noEvents.rails.length === 5 && noEvents.rails.every((r) => r.cards.length === 0 && r.fallbackUsed === false), "no inventory still returns five empty rails, never fewer");
const noCenter = composeChristmasIntentRails(events, placeFixture(), { today: TODAY });
ok(noCenter.rails.length === 5, "no location still returns five rails");

// ── 5. Copy: no dashes anywhere a reader can see ────────────────────────────
for (const [id, take] of Object.entries(CHRISTMAS_PLACE_TAKES)) {
  ok(noDash(take) && !/\$|\d+ ?dollars|free admission/i.test(take), `take for ${id} has no dash and no price`);
  ok(!/guarantee|always see|you will see|sure to see/i.test(take), `take for ${id} makes no guaranteed sighting claim`);
}
ok(Object.keys(CHRISTMAS_PLACE_RAIL).length === Object.values(SPEC_PLACES).flat().length, "the pool holds exactly the spec place ids");
ok(Object.keys(CHRISTMAS_PLACE_RAIL).every((id) => CHRISTMAS_PLACE_TAKES[id]), "every pooled place has a take");
for (const [rail, list] of Object.entries(SPEC_PLACES)) for (const id of list) ok(CHRISTMAS_PLACE_RAIL[id] === rail, `pool maps ${id} to ${rail}`);
const copy = composed.rails.flatMap((r) => [r.title, r.deck, ...r.cards.flatMap((c) => [c.title, c.take, c.hook])]);
ok(copy.every(noDash), "no dash in any rendered title, deck or take");
const posterRow = railById("christmas");
ok(!!posterRow, "the christmas poster rail record exists");
ok(posterRow && posterRow.title === "Florida Christmas" && posterRow.short === "Beaches, lights, manatees & boat parades" && posterRow.cta === "Find your Christmas", "poster copy matches the spec");
ok(posterRow && ["title", "short", "sub", "cta", "axis", "emptyWhy"].every((k) => noDash(posterRow[k])), "poster copy has no dashes");
ok(posterRow && posterRow.art === "christmas" && !posterRow.href && !posterRow.posterHidden, "the poster wears christmas art, carries no href and is not hidden (a tap opens the drop)");
ok(RAILS.filter((r) => r.id === "christmas").length === 1, "exactly one christmas rail record");

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

// ── 6c. Each rail links its OWN guide (EXECUTED) ───────────────────────────
ok(Object.isFrozen(CHRISTMAS_RAIL_GUIDE_SLUGS), "the rail to guide map is frozen");
const EXPECT_SLUG = { beaches: "florida-winter-beaches-2026", "theme-parks": "florida-theme-park-christmas-2026", "nights-out": "florida-holiday-nights-out-2026", manatees: "florida-manatee-season-2026", "boat-parades": "florida-christmas-boat-parades-2026" };
const withGuides = withChristmasGuides(composed.rails, "2026-12-01");
ok(withGuides.length === 5 && withGuides.every((r, i) => r.id === composed.rails[i].id && r.cards === composed.rails[i].cards), "attaching guides keeps the five rails, order and cards");
for (const r of withGuides) {
  ok(!!r.guide && r.guide.slug === EXPECT_SLUG[r.id], `${r.id}: gets its own guide ${EXPECT_SLUG[r.id]} (got ${r.guide && r.guide.slug})`);
  ok(r.guide && !!GUIDES[r.guide.slug] && !!r.guide.image && !!r.guide.image.src, `${r.id}: the guide exists in GUIDES and carries a picture`);
  ok(r.guide && r.guide.href === "/guides/" + r.guide.slug && r.guide.title && r.guide.teaser, `${r.id}: guide has href, title and teaser`);
  ok(r.guide && !/[\u2014\u2013]| - /.test(r.guide.teaser), `${r.id}: guide teaser has no dash`);
}
ok(new Set(withGuides.map((r) => r.guide && r.guide.slug)).size === 5, "no two rails share a guide");
ok(christmasRailGuide("beaches", "2027-04-01") === null, "an archived guide (past endsOn) is omitted");
ok(christmasRailGuide("beaches", "2026-12-01", {}) === null, "a missing guide is omitted");
ok(christmasRailGuide("no-such-rail", "2026-12-01") === null, "an unknown rail gets no guide");

// ── 6d. Venue enrichment: rows with no place_id or coordinates (EXECUTED) ───
// Live rows for these events arrive with lat/lng null and no place_id; without
// enrichment the composer drops them. Inventory rows below mirror wf_inventory.
const INV = new Map([
  ["ChIJfyPWjCh-54gR1SvWozmef5k", { lat: 28.4110, lng: -81.4612 }],
  ["ChIJvRBCrN9-54gRGZuuaCLGrQE", { lat: 28.4724, lng: -81.4690 }],
  ["ChIJ38rlfogN3YgRGic46M9dbLw", { lat: 27.9899, lng: -81.6914 }],
  ["ChIJl0CYCGZ_3YgRL05pG5wZSsE", { lat: 28.3432, lng: -81.5260 }],
  ["ChIJhRo4DU_GwogRUgjhMAj-pag", { lat: 28.0371, lng: -82.4195 }],
  ["ChIJBQ5SjLHGwogRL4X19g4J5tI", { lat: 28.0138, lng: -82.4700 }],
]);
for (const id of THEME_PARK_IDS.filter((x) => x !== "mvmcp-2026" && x !== "epcot-festival-holidays-2026")) {
  const raw = { event_id: id, event_name: "Holiday Night", start_date: "2026-11-20", end_date: "2027-01-03", lat: null, lng: null, place_id: null, tags: [] };
  const out = enrichChristmasEvent(raw, INV);
  ok(!!out.place_id && Number.isFinite(out.lat) && Number.isFinite(out.lng), `theme park ${id} gets a place_id and coordinates through enrichment (got ${out.place_id}, ${out.lat}, ${out.lng})`);
  ok(raw.lat === null && raw.place_id === null, `${id}: enrichment does not mutate the source row`);
  const placed = composeChristmasIntentRails([{ ...out, event_name: "Park Holiday Night" }], [], { ...ORLANDO, today: TODAY }).rails.find((r) => r.id === "theme-parks");
  ok(placed.cards.some((c) => c.id === id), `${id}: once enriched it lands in theme-parks (was dropped as unplaceable before)`);
  const unplaced = composeChristmasIntentRails([{ ...raw, event_name: "Park Holiday Night" }], [], { ...ORLANDO, today: TODAY }).rails.find((r) => r.id === "theme-parks");
  ok(!unplaced.cards.some((c) => c.id === id), `${id}: without enrichment it is dropped (negative control, strict: no guessed coordinates)`);
}
ok(enrichChristmasEvent({ event_id: "x", lat: 1, lng: 2, place_id: "keep" }, INV).place_id === "keep" && enrichChristmasEvent({ event_id: "x", lat: 1, lng: 2, place_id: "keep" }, INV).lat === 1, "enrichment never overwrites values the event already has");
ok(enrichChristmasEvent({ event_id: "seaworld-orlando-christmas-2026", lat: null, lng: null }, new Map()).lat === null, "no inventory row means no coordinates (never guessed)");
ok(Object.isFrozen(CHRISTMAS_EVENT_VENUE_PLACE_IDS) && !CHRISTMAS_EVENT_VENUE_PLACE_IDS["tampa-riverwalk-boat-parade-2026"], "ambiguous venues (Tampa Riverwalk) stay out of the map");
// Classifier gaps found in live rows.
const live = (name, start, end, tags) => ev("x-" + name, name, start, end, { tags });
ok(christmasEventRail(live("St. Pete Indie Flea Fall/Winter Market", "2027-01-03", "2027-01-03", ["market"])) === null, "St. Pete Indie Flea is excluded (not Christmas)");
for (const n of ["Holiday Lights in Largo Central Park", "Holiday Fantasy of Lights", "Haven Holiday Market"]) {
  ok(christmasEventRail(live(n, "2026-11-21", "2027-01-02", ["festival", "holiday", "fall"])) === "nights-out", `${n}: a stray fall tag does not veto a holiday named event`);
}
ok(christmasEventRail(live("Fall Harvest Lights Night", "2026-11-21", "2026-11-21", ["fall"])) === null, "a fall tagged event with no holiday word in its name stays out");

// ── 7. Wiring (STATIC: a component and a route cannot be executed here) ─────
const route = read("app/api/events/christmas/route.js");
ok(/christmas-intents:v\d+:/.test(route), "the route has its own christmas cache key");
ok(!/googleapis|maps\.google|places\.googleapis|fetch\(/.test(route), "the route makes no network fetch and no Google call (owned Supabase reads only)");
ok(/\.from\("wf_inventory"\)/.test(route) && /fetchCuratedEvents\(/.test(route), "the route reads wf_inventory and wf_events");
ok(/rails\?\.length === 5/.test(route), "the route's cache gate requires exactly five rails");
const comp = read("app/components/ChristmasIntentRails.js");
ok(/result\.rails\.length !== RAIL_COUNT/.test(comp) && /RAIL_COUNT = 5/.test(comp), "the component requires exactly five rails");
ok(/<GuideDiscoveryCard guide=\{rail\.guide\}/.test(comp) && !/GuideRailCollection/.test(comp), "the component renders each rail's own guide card straight after the rail (static)");
ok(/guide_open/.test(comp) && /rail: rail\.id/.test(comp), "a guide click is tracked with the rail and slug (static)");
ok(/christmas-intents:v3:/.test(route) && /enrichChristmasEvent\(e, inventoryById\)/.test(route) && /withChristmasGuides\(composed\.rails, today\)/.test(route), "the route bumps its cache key and attaches guides server side (static)");
ok(!/directionsUrl|fallSkin|isSpookyCard|spookySkin|wf-fall/.test(comp), "the component wears no fall or spooky skin and no Directions button");
ok(/christmasEventTicket\(e\.event_id, byDealId\)/.test(route) && /ticket,\s*\n/.test(route), "the route attaches ticket to every event card (static)");
ok(/kind: TICKET_SURFACE/.test(comp) && /surface: TICKET_SURFACE/.test(comp) && /TICKET_SURFACE = "christmas_intent_rail"/.test(comp) && /cta=\{isEvent \? eventCta\(card, onTrack\)/.test(comp), "the component renders the CTA with tickets_out and commerce tracking (static)");
const rail = read("app/components/DaypartRail.js");
ok(/ChristmasIntentRails = dynamic\(/.test(rail) && /christmas: \(\) => import\("\.\/ChristmasIntentRails"\)/.test(rail), "DaypartRail lazy loads and prewarms the Christmas component");
ok(/selRail && selRail\.id === "christmas" \? \(\s*<ChristmasIntentRails/.test(rail), "the pop down mounts the Christmas component for the christmas poster");
ok(/selRail\.id === "christmas"/.test((rail.match(/const railOwnsItsOwnAnswer =[^;]+;/) || [""])[0]), "christmas owns its own answer, like fall");

console.log(`\ncheck-christmas-rails: ${fail ? "FAIL" : "OK"}: ${pass} assertions (executed composeChristmasIntentRails on ${events.length} fixture events and ${placeFixture().length} places; wiring checks are static)`);
process.exit(fail ? 1 : 0);
