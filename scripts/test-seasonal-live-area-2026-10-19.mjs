// scripts/test-seasonal-live-area-2026-10-19.mjs
//
// Founder-approved 2026-10-19 live-area pass. Calls the real Fall pin, the
// Halloween regroup, the Christmas research merge and the Christmas composer.
// A row that loses its place_id, its date, or its rail fails here.
import assert from "node:assert/strict";
import RAW from "../data/christmas-2026-research.json" with { type: "json" };
import { FALL_LIVE_AREA_2026_10_19 } from "../lib/fallLiveArea20261019.js";
import { FALL_DISCOVERY_RAIL } from "../lib/fallDiscoveries2026.js";
import { fallEventRail, composeFallIntentRails, nextFallOccurrence, hasUpcomingFallOccurrence } from "../lib/fallIntentRails.js";
import { halloweenCardRail, composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { isTrusted } from "../lib/curatedEvents.js";
import { fallEventLive } from "../lib/fallPool.js";
import { fallEventCardImageSrc } from "../lib/fallEventImage.js";
import { occurrenceDatesFor } from "../lib/eventOccurrences.js";
import { mergeChristmasResearch, researchEvent } from "../lib/christmasResearch.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { composeChristmasIntentRails, christmasEventRail, inChristmasWindow } from "../lib/christmasIntentRails.js";

let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log("  OK  " + name); };
const TODAY = "2026-10-19";
const TAMPA = { lat: 27.9506, lng: -82.4572 };
const idsOf = (rails, railId) => (rails.find((rail) => rail.id === railId)?.cards || []).map((card) => card.event_id || card.id);

const FALL_RAIL = {
  "dinosaur-world-jurassic-haunt-2026": "family",
  "tampa-theatre-nightmare-on-franklin-2026": "festivals",
  "storytime-with-mother-boo-2026": "family",
  "mosi-fright-light-2026": "family",
  "ami-mangrove-murders-paddle-2026": "haunts",
};
const HALLOWEEN_RAIL = {
  "dinosaur-world-jurassic-haunt-2026": "family",
  "tampa-theatre-nightmare-on-franklin-2026": "festivals",
  "storytime-with-mother-boo-2026": "family",
  "mosi-fright-light-2026": "family",
  "ami-mangrove-murders-paddle-2026": "family",
};
const PLACE = {
  "dinosaur-world-jurassic-haunt-2026": "ChIJleFCpOE03YgR_W7zvLgzvVQ",
  "tampa-theatre-nightmare-on-franklin-2026": "ChIJ98cKiInEwogRfyDonUPi2bc",
  "storytime-with-mother-boo-2026": "ChIJQZRp15bDwogReY6sMTk-YWg",
  "mosi-fright-light-2026": "ChIJVZ5IfwDHwogRPN9rxQyX_L4",
  "ami-mangrove-murders-paddle-2026": "ChIJSzFosAERw4gRdoKp0B-JmGY",
};

check("five live-area rows are trusted, pinned, photo-backed and still upcoming on Oct 19", () => {
  assert.equal(FALL_LIVE_AREA_2026_10_19.length, 5);
  for (const row of FALL_LIVE_AREA_2026_10_19) {
    assert.equal(FALL_DISCOVERY_RAIL[row.event_id], FALL_RAIL[row.event_id], row.event_id);
    assert.equal(fallEventRail(row), FALL_RAIL[row.event_id], row.event_id);
    assert.equal(halloweenCardRail(row), HALLOWEEN_RAIL[row.event_id], row.event_id);
    assert.equal(row.place_id, PLACE[row.event_id]);
    assert.equal(row.city === "Florida" || row.state !== "FL", false);
    assert.notEqual(row.city, "Florida");
    assert.ok(isTrusted(row));
    assert.ok(fallEventLive(row, TODAY) && hasUpcomingFallOccurrence(row, TODAY));
    assert.match(fallEventCardImageSrc(row, 640, null), new RegExp("/api/photo\\?place=" + row.place_id));
    assert.match(row.official_event_url, /^https:\/\//);
  }
  const series = FALL_LIVE_AREA_2026_10_19.find((row) => row.event_id === "tampa-theatre-nightmare-on-franklin-2026");
  assert.doesNotMatch(series.event_name + " " + series.card_hook, /ghost[ -](?:tour|walk)/i);
  assert.equal(nextFallOccurrence(FALL_LIVE_AREA_2026_10_19.find((row) => row.event_id === "dinosaur-world-jurassic-haunt-2026"), TODAY), "2026-10-23");
  assert.equal(nextFallOccurrence(FALL_LIVE_AREA_2026_10_19.find((row) => row.event_id === "storytime-with-mother-boo-2026"), TODAY), "2026-10-21");
  assert.deepEqual(occurrenceDatesFor({ event_id: "storytime-with-mother-boo-2026" }), ["2026-10-14", "2026-10-21"]);
});

check("Tampa Fall and Halloween rails place each live-area card on its one shelf", () => {
  const fall = composeFallIntentRails(FALL_LIVE_AREA_2026_10_19, [], { ...TAMPA, today: TODAY, now: new Date("2026-10-19T16:00:00Z") });
  for (const [id, rail] of Object.entries(FALL_RAIL)) {
    assert.ok(idsOf(fall.rails, rail).includes(id), `${id} missing from Fall ${rail}`);
  }
  const halloween = composeHalloweenRails(fall.rails, TODAY);
  for (const [id, rail] of Object.entries(HALLOWEEN_RAIL)) {
    assert.ok(idsOf(halloween, rail).includes(id), `${id} missing from Halloween ${rail}`);
  }
  assert.ok(idsOf(halloween, "last-minute").includes("ami-mangrove-murders-paddle-2026"));
  assert.ok(idsOf(halloween, "last-minute").includes("storytime-with-mother-boo-2026"));
  assert.ok(!idsOf(halloween, "last-minute").includes("mosi-fright-light-2026"));
  assert.ok(!idsOf(halloween, "ghost-tours").includes("tampa-theatre-nightmare-on-franklin-2026"));
});

const XMAS = {
  "charlie-brown-christmas-ruth-eckerd-2026": { rail: "shows-outings", place: "ChIJ4YG1mE_uwogRqyKWxvI1tVY", city: "Clearwater", start: "2026-11-15" },
  "derek-hough-dance-for-the-holidays-2026": { rail: "shows-outings", place: "ChIJ4YG1mE_uwogRqyKWxvI1tVY", city: "Clearwater", start: "2026-11-22" },
  "kenny-g-miracles-holiday-ruth-eckerd-2026": { rail: "shows-outings", place: "ChIJ4YG1mE_uwogRqyKWxvI1tVY", city: "Clearwater", start: "2026-12-12" },
  "christmas-carol-ruth-eckerd-2026": { rail: "shows-outings", place: "ChIJ4YG1mE_uwogRqyKWxvI1tVY", city: "Clearwater", start: "2026-12-22" },
  "florida-orchestra-nightmare-before-christmas-2026": { rail: "shows-outings", place: "ChIJSWCg1pvhwogR-rDr1SAB-vY", city: "St. Petersburg", start: "2026-12-05" },
  "florida-orchestra-classical-christmas-2026": { rail: "shows-outings", place: "ChIJSWCg1pvhwogR-rDr1SAB-vY", city: "St. Petersburg", start: "2026-12-19" },
  "mosi-santa-in-space-2026": { rail: "theme-parks", place: "ChIJVZ5IfwDHwogRPN9rxQyX_L4", city: "Tampa", start: "2026-12-12" },
  "mosi-holiday-laser-2026": { rail: "shows-outings", place: "ChIJVZ5IfwDHwogRPN9rxQyX_L4", city: "Tampa", start: "2026-12-26" },
};

function xmasRails(today) {
  const want = new Set(Object.keys(XMAS));
  const rows = mergeChristmasResearch([]).filter((row) => want.has(row.event_id));
  assert.equal(rows.length, want.size);
  const cards = rows.map((row) => christmasEventCard(row, { today }));
  return composeChristmasIntentRails(cards, [], { ...TAMPA, today }).rails;
}

check("eight Christmas rows are confirmed, in the Nov 15 window, and photo-backed", () => {
  assert.equal(RAW.length, 760);
  for (const [id, expect] of Object.entries(XMAS)) {
    const raw = RAW.find((row) => row.id === id);
    assert.ok(raw, id);
    assert.equal(raw.state, "confirmed_dated");
    assert.equal(raw.place_id, expect.place);
    assert.equal(raw.city, expect.city);
    assert.equal(raw.start_date, expect.start);
    assert.equal(raw.primary_rail, expect.rail);
    const event = researchEvent(raw);
    assert.equal(christmasEventRail(event), expect.rail);
    assert.equal(inChristmasWindow(event), true);
    assert.ok(isTrusted(event));
    assert.match(fallEventCardImageSrc(event, 640, null), new RegExp("/api/photo\\?place=" + expect.place));
    assert.notEqual(event.city, "Florida");
  }
  const film = researchEvent(RAW.find((row) => row.id === "florida-orchestra-nightmare-before-christmas-2026"));
  assert.deepEqual(film.occurrence_dates, ["2026-12-05", "2026-12-06"]);
  assert.equal(film.start_time, null);
});

check("one card per venue per rail, and the next show takes the shelf when the sooner one ends", () => {
  const oct19 = xmasRails(TODAY);
  const shows = idsOf(oct19, "shows-outings");
  for (const id of ["charlie-brown-christmas-ruth-eckerd-2026", "florida-orchestra-nightmare-before-christmas-2026", "mosi-holiday-laser-2026"]) {
    assert.ok(shows.includes(id), id);
  }
  for (const id of ["derek-hough-dance-for-the-holidays-2026", "kenny-g-miracles-holiday-ruth-eckerd-2026", "christmas-carol-ruth-eckerd-2026", "florida-orchestra-classical-christmas-2026"]) {
    assert.ok(!shows.includes(id), id + " must wait behind the sooner show at the same hall");
  }
  assert.ok(idsOf(oct19, "theme-parks").includes("mosi-santa-in-space-2026"));
  assert.ok(idsOf(xmasRails("2026-11-16"), "shows-outings").includes("derek-hough-dance-for-the-holidays-2026"));
  assert.ok(!idsOf(xmasRails("2026-11-16"), "shows-outings").includes("charlie-brown-christmas-ruth-eckerd-2026"));
  assert.ok(idsOf(xmasRails("2026-12-07"), "shows-outings").includes("florida-orchestra-classical-christmas-2026"));
  assert.ok(idsOf(xmasRails("2026-12-13"), "shows-outings").includes("christmas-carol-ruth-eckerd-2026"));
  assert.ok(!idsOf(xmasRails("2026-12-13"), "theme-parks").includes("mosi-santa-in-space-2026"));
});

console.log(`test-seasonal-live-area-2026-10-19: ${n} checks passed`);
