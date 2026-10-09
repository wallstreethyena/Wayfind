// scripts/test-fall-tampa-picks-2026-10-08.mjs
//
// Owner, 2026-10-08: "make sure to include these places into Wayfind,
// especially in the fall poster" (24 Tampa names). Measured that morning on
// /api/events/fall at downtown Tampa: Guppyween and the Armature Works patch
// were missing, the Crawl With US crawl named only its check-in bar, and two
// live dated rows (Eli Brown at The Ritz Ybor, Halloween Rock the Bay on Yacht
// StarShip) were invisible because their seed carried no venue identity.
// This guard calls the real merge, image law and rail composer.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { FALL_TAMPA_PICKS_2026_10_08 } from "../lib/fallTampaPicks20261008.js";
import { FALL_DISCOVERY_RAIL } from "../lib/fallDiscoveries2026.js";
import { fallEventRail, composeFallIntentRails, hasUpcomingFallOccurrence } from "../lib/fallIntentRails.js";
import { isTrusted } from "../lib/curatedEvents.js";
import { fallEventLive } from "../lib/fallPool.js";
import { mergeFallDiscoveryRows, fallEventCardImageSrc, FALL_EVENT_VENUE_PLACE_IDS } from "../lib/fallEventImage.js";

let n = 0;
const check = async (name, fn) => { await fn(); n += 1; console.log("  OK  " + name); };
const TODAY = "2026-10-08";
const NOW = new Date("2026-10-08T18:00:00-04:00");
const TAMPA = { lat: 27.9506, lng: -82.4572 };

const EXPECT_RAIL = {
  "florida-aquarium-guppyween-2026": "family",
  "armature-works-pumpkin-patch-2026": "farms",
  "armature-works-9th-annual-fall-fest-2026": "festivals",
  "tampa-terrors-ghost-tour-2026": "date-night",
  "the-halloween-party-the-hollywood-undead-2026": "date-night",
  "tampa-halloween-bar-crawl-2026": "date-night",
};

// The two production rows exactly as wf_events held them on 2026-10-08
// (place_id null), trimmed to the fields the rail reads.
const DB_ROWS = [
  {
    event_id: "eli-brown-halloween-night-2026", slug: "eli-brown-halloween-night-2026",
    event_name: "Eli Brown Halloween Night", venue: "The RITZ Ybor", address: "1503 E 7th Ave, Tampa, FL 33605",
    city: "Tampa", state: "FL", lat: 27.9601, lng: -82.4428, place_id: null, hero_image: null,
    start_date: "2026-10-31", end_date: "2026-10-31", start_time: "22:00:00",
    event_status: "scheduled", source_tier: 1, verification_confidence: "high",
    category: "nightlife", subcategory: "halloween-event", tags: ["halloween", "music", "dj", "21-plus"],
    audience: ["adults"], minimum_age: 21, card_hook: "Eli Brown headlines Halloween night at The Ritz Ybor.",
    official_event_url: "https://www.theritzybor.com/event/halloween2026/", editorial_score: 6,
    uniqueness_score: 6, popularity_score: 6, last_verified_at: "2026-10-04T22:47:00Z",
  },
  {
    event_id: "halloween-rock-the-bay-2026", slug: "halloween-rock-the-bay-2026",
    event_name: "Halloween Rock the Bay", venue: "Yacht StarShip", address: "603 Channelside Dr, Tampa, FL 33602",
    city: "Tampa", state: "FL", lat: 27.9422, lng: -82.4482, place_id: null, hero_image: null,
    start_date: "2026-10-31", end_date: "2026-10-31", start_time: "21:00:00",
    event_status: "scheduled", source_tier: 1, verification_confidence: "high",
    category: "nightlife", subcategory: "halloween-event", tags: ["halloween", "costume-party", "cruise", "21-plus"],
    audience: ["adults"], minimum_age: 21, card_hook: "A two-hour Halloween party cruise with DJs and a costume contest.",
    official_event_url: "https://yachtstarship.com/event/halloween-rock-the-bay/", editorial_score: 6,
    uniqueness_score: 6, popularity_score: 6, last_verified_at: "2026-10-04T22:47:00Z",
  },
];

await check("each new row is trusted, dated, live, image-backed and on its one pinned shelf", () => {
  assert.equal(FALL_TAMPA_PICKS_2026_10_08.length, 6, "exactly six rows (positive control)");
  for (const row of FALL_TAMPA_PICKS_2026_10_08) {
    const want = EXPECT_RAIL[row.event_id];
    assert.ok(want, `${row.event_id} is an expected row`);
    assert.equal(FALL_DISCOVERY_RAIL[row.event_id], want, `${row.event_id} pinned`);
    assert.equal(fallEventRail(row), want, `${row.event_id} classified by the live classifier`);
    assert.ok(isTrusted(row), `${row.event_id} passes isTrusted`);
    assert.ok(fallEventLive(row, TODAY) && hasUpcomingFallOccurrence(row, TODAY), `${row.event_id} live on ${TODAY}`);
    assert.match(String(row.place_id), /^ChIJ/, `${row.event_id} carries an exact owned venue identity`);
    assert.ok(fallEventCardImageSrc(row, 640, null), `${row.event_id} resolves a card image`);
    assert.match(String(row.official_event_url), /^https:\/\//);
    assert.equal(row.year, 2026);
  }
});

await check("the Crawl With US card names all five organizer-listed bars", () => {
  const crawl = FALL_TAMPA_PICKS_2026_10_08.find((row) => row.event_id === "tampa-halloween-bar-crawl-2026");
  for (const bar of ["MacDinton's", "Grove Soho", "Bulla Gastrobar", "LALA Tampa", "Tiny Tap Tavern"]) {
    assert.ok(crawl.schedule_note.includes(bar), `schedule names ${bar}`);
  }
  assert.equal(crawl.minimum_age, 21);
  assert.match(crawl.official_ticket_url, /^https:\/\/www\.eventbrite\.com\/e\/[^?]*1583901996509$/, "public sales page, not an order link");
});

await check("Armature Fall Fest carries both organizer weekends, nothing else", () => {
  const fest = FALL_TAMPA_PICKS_2026_10_08.find((row) => row.event_id === "armature-works-9th-annual-fall-fest-2026");
  assert.deepEqual(fest.occurrence_dates, ["2026-10-10", "2026-10-11", "2026-10-24", "2026-10-25"]);
  assert.ok(hasUpcomingFallOccurrence(fest, "2026-10-12"), "still upcoming between the weekends");
  assert.ok(!hasUpcomingFallOccurrence(fest, "2026-10-26"), "gone after the last session");
});

await check("the two hidden live rows regain their exact venue and a card image", () => {
  const merged = mergeFallDiscoveryRows(DB_ROWS, []);
  const byId = new Map(merged.map((row) => [row.event_id, row]));
  for (const db of DB_ROWS) {
    const row = byId.get(db.event_id);
    assert.equal(row.place_id, FALL_EVENT_VENUE_PLACE_IDS[db.event_id], `${db.event_id} venue identity`);
    assert.ok(fallEventCardImageSrc(row, 640, null), `${db.event_id} resolves a card image`);
    assert.equal(fallEventRail(row), "date-night", `${db.event_id} files under Spooky Date Night`);
  }
  // Negative control: the same row without the map entry stays image-less.
  assert.ok(!fallEventCardImageSrc({ ...DB_ROWS[0], event_id: "not-mapped" }, 640, null), "unmapped twin stays image-less");
});

await check("a downtown Tampa visitor sees every Tampa pass card on its shelf", () => {
  const rows = mergeFallDiscoveryRows(DB_ROWS, FALL_TAMPA_PICKS_2026_10_08);
  const { rails } = composeFallIntentRails(rows, [], { ...TAMPA, today: TODAY, now: NOW, full: true });
  const onShelf = (rail, id) => (rails.find((r) => r.id === rail)?.cards || []).some((card) => card.event_id === id);
  for (const [id, rail] of Object.entries(EXPECT_RAIL)) assert.ok(onShelf(rail, id), `${id} on ${rail}`);
  for (const db of DB_ROWS) assert.ok(onShelf("date-night", db.event_id), `${db.event_id} on date-night`);
});

await check("Fall Fest's four days read the same on the page and the Events calendar (calls the real helpers)", async () => {
  const { occurrenceDatesFor, occurrenceDatesLabel, eventDatesLabel } = await import("../lib/eventOccurrences.js");
  // The database row as stored: first and last day only, no day list.
  const db = { event_id: "armature-works-9th-annual-fall-fest-2026", start_date: "2026-10-10", end_date: "2026-10-25", select_nights: true };
  assert.deepEqual(occurrenceDatesFor(db), ["2026-10-10", "2026-10-11", "2026-10-24", "2026-10-25"], "registry days reach a DB-only row");
  assert.equal(eventDatesLabel(db, "Oct 10–25"), "Oct 10, 11, 24 & 25", "page never prints the continuous range");
  assert.equal(occurrenceDatesLabel(["2026-10-31", "2026-11-01"]), "Oct 31 & Nov 1");
  assert.equal(eventDatesLabel({ event_id: "no-such-row" }, "Oct 7–31"), "Oct 7–31", "rows without a day list keep their range");
  const ev = await loadComponent(fileURLToPath(new URL("../app/components/screens/Events.js", import.meta.url)), fileURLToPath(new URL("..", import.meta.url)));
  assert.equal(typeof ev.eventRunsOn, "function", "Events helpers loaded (positive control)");
  {
    // The real feed mapper turns the stored row into the calendar's event.
    const feed = curatedToFeedEvent({ ...db, slug: "armature-works-9th-annual-fall-fest-2026", event_name: "Armature Works 9th Annual Fall Fest", city: "Tampa", state: "FL", lat: 27.9609, lng: -82.4643, event_status: "scheduled", source_tier: 1, verification_confidence: "high", tags: ["fall", "festival"], year: 2026 });
    assert.deepEqual(feed.occurrences, ["2026-10-10", "2026-10-11", "2026-10-24", "2026-10-25"], "feed event carries the day list");
    for (const d of ["2026-10-10", "2026-10-11", "2026-10-24", "2026-10-25"]) assert.ok(ev.eventRunsOn(feed, d), `calendar lists it on ${d}`);
    for (const d of ["2026-10-12", "2026-10-18", "2026-10-23", "2026-10-26"]) assert.ok(!ev.eventRunsOn(feed, d), `calendar never lists it on ${d}`);
    assert.equal(ev.effectiveEventDate(feed, "2026-10-13"), "2026-10-24", "between weekends it sorts to its next real day");
  }
});

await check("event pages read the same Tampa facts as the card (calls withTampaPassFacts)", async () => {
  const { withTampaPassFacts, eventVenueImageSrc } = await import("../lib/eventPageImage.js");
  // Stored rows as production held them: Fall Fest one weekend, party with no venue.
  const fest = withTampaPassFacts({ event_id: "armature-works-9th-annual-fall-fest-2026", slug: "armature-works-9th-annual-fall-fest-2026", start_date: "2026-10-10", end_date: "2026-10-11", schedule_note: "Sat Oct 10, noon to 5pm; Sun Oct 11, noon to 4pm.", link_ok: false, place_id: null });
  assert.equal(fest.end_date, "2026-10-25");
  assert.match(fest.schedule_note, /October 24.*October 25/);
  assert.equal(fest.link_ok, false, "stored link-health verdict survives the merge");
  assert.match(eventVenueImageSrc(fest), /place=ChIJYWj9iZ_PwogRQebjN7pJ_Nw/, "page shows the card's venue photo");
  const party = withTampaPassFacts({ event_id: "the-halloween-party-the-hollywood-undead-2026", slug: "the-halloween-party-the-hollywood-undead-2026", start_date: "2026-10-31", place_id: null, tags: [] });
  assert.equal(party.place_id, "ChIJNUw4wVrEwogREmFpX2Wfvw0", "page gets the Cuban Club identity");
  const other = { event_id: "not-in-the-tampa-pass", schedule_note: "x" };
  assert.equal(withTampaPassFacts(other), other, "no other event page changes");
});

await check("Tampa Terrors is a meeting-point tour, never a storefront or a dated Halloween event", async () => {
  const t = FALL_TAMPA_PICKS_2026_10_08.find((row) => row.event_id === "tampa-terrors-ghost-tour-2026");
  assert.equal(t.place_id, "ChIJ98cKiInEwogRfyDonUPi2bc", "Tampa Theatre identity (the published meeting point)");
  assert.match(t.venue, /meeting point/);
  assert.equal(t.end_date, null, "open run, no invented end date");
  assert.ok(!t.tags.includes("halloween"), "not dressed up as a Halloween event");
  const { eventDatesLabel } = await import("../lib/eventOccurrences.js");
  const { withTampaPassFacts } = await import("../lib/eventPageImage.js");
  const page = withTampaPassFacts({ event_id: t.event_id, slug: t.slug, start_date: "2026-10-08", end_date: null });
  assert.equal(eventDatesLabel(page, "Oct 8"), "Nightly, year-round", "the page never presents the nightly tour as one date");
});

console.log(`test-fall-tampa-picks-2026-10-08: ${n} checks passed`);
