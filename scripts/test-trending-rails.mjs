#!/usr/bin/env node
// test-trending-rails — the TRENDING NOW poster's five shelves (owner,
// 2026-11-05). Asserted by CALL: selectPosterEvents("trending") is invoked on
// fixture events and splitTrendingPlaces on fixture places.
import { selectPosterEvents } from "../lib/posterEvents.js";
import { localTrendingIntelligence, splitTrendingPlaces, trendingEventRail, trendingPlaceRail, trendRailFromTags, inTrendingWindow, TRENDING_RAIL_IDS } from "../lib/trendingRails.js";
import { orderFor } from "../lib/dayparts.js";
import { readFileSync } from "node:fs";

let pass = 0;
const ok = (c, m) => { if (!c) { console.error("test-trending-rails: FAIL — " + m); process.exit(1); } pass++; };

ok(JSON.stringify(TRENDING_RAIL_IDS) === JSON.stringify(["food", "festivals", "parties", "shows", "more"]), "five shelves in the owner's order");

const now = new Date("2026-11-05T17:00:00Z");
const base = { dest: "x", lat: 27.95, lng: -82.46, city: "Tampa", state: "FL", venue: "Venue", time: "18:00" };
const ev = (id, name, extra) => ({ ...base, id, name, date: "2026-11-07", ...extra });
const events = [
  ev("a", "Tampa Greek Festival", { segment: "Food", tags: ["wf-trending"] }),
  ev("b", "SAVOR St. Pete", { segment: "Food", tags: ["wf-trending", "trend-food"] }),
  ev("c", "Ed Sheeran LOOP Tour", { segment: "Music", popularity_score: 9 }),
  ev("d", "Quiet Library Talk", { segment: "Community" }),
  ev("e", "Rooftop Silent Disco Party", { segment: "", tags: ["wf-trending"] }),
  ev("f", "Far Future Fest", { segment: "Festival", tags: ["wf-trending"], date: "2026-12-20" }),
  ev("g", "Doja Cat - Tour Ma Vie World Tour", { segment: "Music", venue: "Benchmark International Arena" }),
  ev("h", "Tampa Bay Lightning vs. Detroit Red Wings", { segment: "Sports", venue: "Benchmark International Arena" }),
  ev("i", "Open Mic Songwriters", { segment: "Music", venue: "Corner Coffee Bar" }),
  ev("j", "Luxury & Suites: Miami Dolphins v Detroit Lions", { segment: "Sports", venue: "Hard Rock Stadium" }),
  ev("k", "Ride and Dine with Us! Speedboat Tours", { segment: "Miscellaneous", venue: "Hard Rock Cafe Miami" }),
  ev("l", "Trap Karaoke: Tampa", { segment: "Music", venue: "The Ritz Ybor" }),
  ev("m", "Lenny Pearce - Toddler Rave World Tour", { segment: "Music", venue: "Mahaffey Theater" }),
  ev("n1", "Rod Wave: Don't Look Down Tour", { segment: "Music", venue: "Kia Center" }),
  ev("n2", "Rod Wave: Don't Look Down Tour", { segment: "Music", venue: "Kia Center", date: "2026-11-08" }),
];
const rails = selectPosterEvents(events, { mode: "trending", center: { lat: 27.95, lng: -82.46 }, now });
const where = (id) => Object.keys(rails).find((k) => rails[k].some((e) => e.id === id)) || null;
ok(Object.keys(rails).length === 5, "trending mode returns the five shelves");
// If validateEvent rejects the fixture shape, every assertion below would pass vacuously: positive control first.
ok(where("a") === "festivals", `a scout-tagged festival lands on Festivals (got ${where("a")})`);
ok(where("b") === "food", "a trend-food tag pins the row to Food even though its name is a festival-free food event");
ok(where("c") === "shows", "a concert with a measured demand signal lands on Shows and Events");
ok(where("d") === null, "a happening with no scout tag and no demand signal is NOT called trending");
ok(where("e") === "parties", "a party lands on Parties");
ok(where("f") === null, "a happening outside the 10-day window is not on this week's shelves");
ok(where("g") === "shows", `an arena concert with no score is trending on Shows (got ${where("g")})`);
ok(where("h") === "shows", `a pro game in an arena is trending on Shows (got ${where("h")})`);
ok(where("i") === null, "a small-room show with no tag and no score is NOT trending");
ok(where("j") === null, "a suite upsell at a stadium is not the event and is NOT trending");
ok(where("k") === null, "a cafe tour package at a Hard Rock is NOT trending");
ok(where("m") === "shows", `a toddler rave is a family show, not nightlife (got ${where("m")})`);
ok(where("n1") === "shows" && where("n2") === null, "a two-night run shows once, its first night");
ok(where("l") === "parties", `a karaoke night in a marquee club lands on Parties (got ${where("l")})`);

ok(trendRailFromTags(["trend-shows"]) === "shows" && trendRailFromTags(["trend-bogus"]) === null, "only real shelf ids can be pinned by tag");
ok(trendingEventRail({ name: "Badass Beer Fest" }) === "festivals", "a beer fest is a festival");
ok(inTrendingWindow({ date: "2026-11-01", endDate: "2026-11-08" }, "2026-11-05") && !inTrendingWindow({ date: "2026-11-01", endDate: "2026-11-04" }, "2026-11-05"), "a running multi-day event counts, a finished one does not");

const split = splitTrendingPlaces([
  { id: "1", name: "Bar", types: ["bar"] }, { id: "2", name: "Cafe", types: ["cafe"] },
  { id: "3", name: "Theater", primaryType: "performing_arts_theater" }, { id: "4", name: "Museum", types: ["museum"] },
  { id: "2", name: "dupe", types: ["cafe"] },
]);
ok(split.parties.length === 1 && split.food.length === 1 && split.shows.length === 1 && split.more.length === 1 && split.festivals.length === 0,
  "places sort onto Parties / Food / Shows / Everything Else, never Festivals, deduped");
ok(trendingPlaceRail({ types: ["restaurant", "bar"] }) === "parties", "a bar restaurant reads as nightlife");

const today = "2026-11-23";
const nearbyEvent = {
  kind: "event", name: "Florida Turkey Trot", scope: "local", distMi: 14.8,
  startDate: "2026-11-26", endDate: "2026-11-26", isHolidayMatch: true,
  facts: "A Thanksgiving 5K around the rowing lake.",
  why: "Unnecessary editorial rewrite", href: "/florida-events/no-published-page",
};
const nearbyPlace = { kind: "place", scope: "local", distMi: 27, placeId: "p1", sourcesCount: 2, why: "An actual sourced reason." };
const options = { today, radiusMi: 27 };
const packet = {
  ok: true, stale: false, today,
  trendingPicks: [
    { ...nearbyEvent, scope: "statewide", name: "Far-away Turkey Trot" },
    { ...nearbyEvent, endDate: "2026-11-22", name: "Finished event" },
    { ...nearbyEvent, distMi: null, name: "Unknown location" },
    { ...nearbyEvent, isHolidayMatch: false, name: "Uncorroborated calendar row" },
    nearbyEvent,
    { ...nearbyPlace, placeId: "too-far", distMi: 27.1 },
    { ...nearbyPlace, placeId: "review-only", sourcesCount: 0 },
    nearbyPlace,
    { ...nearbyPlace, why: "Duplicate does not override the first source." },
  ],
};
const intel = localTrendingIntelligence(packet, options);
ok(intel.leadEvent?.name === nearbyEvent.name && intel.leadEvent.why === nearbyEvent.facts && !intel.leadEvent.href,
  "a current nearby event leads with verified facts and never exposes an unpublished URL");
ok(localTrendingIntelligence({ ...packet, trendingPicks: [{ ...nearbyEvent, aiGrounded: true, why: "A grounded local event explanation." }] }, options).leadEvent?.why === "A grounded local event explanation.",
  "the event lead can use validated intelligence even if there is no nearby venue match");
ok(intel.whyByPlaceId.size === 1 && intel.whyByPlaceId.get("p1") === nearbyPlace.why,
  "only locally measured place evidence is indexed by exact place ID, without duplicate overrides");
for (const rejected of [{ ...packet, stale: true }, { ...packet, today: "2026-11-22" }, { ...packet, ok: false }, null]) {
  const result = localTrendingIntelligence(rejected, options);
  ok(!result.available && !result.leadEvent && !result.whyByPlaceId.size, "an absent, failed, stale or previous-day packet cannot produce a lead or place note");
}
// 2026-11-27 (owner: "No placecard for medieval?"): the lead carries the
// published curated slug so the shelf can render the real event card.
const fair = { ...nearbyEvent, name: "Sarasota Medieval Fair", slug: "sarasota-medieval-fair-2026", href: "/florida-events/sarasota-medieval-fair-2026" };
const fairLead = localTrendingIntelligence({ ...packet, trendingPicks: [fair] }, options).leadEvent;
ok(fairLead?.slug === fair.slug && fairLead.href === fair.href, "a published curated event lead carries its slug and its own page link");
ok(localTrendingIntelligence({ ...packet, trendingPicks: [{ ...fair, href: "https://evil.example/x" }] }, options).leadEvent?.href === null,
  "an href that is not the slug's own /florida-events page is never carried");
ok(localTrendingIntelligence({ ...packet, trendingPicks: [{ ...fair, slug: "../x", href: "/florida-events/../x" }] }, options).leadEvent?.slug === null,
  "a malformed slug is dropped");
ok(localTrendingIntelligence({ ...packet, trendingPicks: [] }, options).available,
  "a healthy feed with no candidates is distinct from a failed feed");
ok(localTrendingIntelligence({ ...packet, trendingPicks: [nearbyEvent] }, options).leadEvent?.name === nearbyEvent.name,
  "the nearby lead is available with events only, without a place pool or AI-generated copy");

const order = orderFor("afternoon", ["augtober", "christmas", "break", "trending", "season"], "2026-11-05");
ok(order[0] === "christmas" && order[1] === "augtober" && order[2] === "trending", `Trending Now sits immediately right of Fall in Florida, Christmas first (got ${order.slice(0, 3)})`);
const noFall = orderFor("afternoon", ["christmas", "break", "trending", "season"], "2026-11-30");
ok(noFall[0] === "christmas" && noFall[1] === "trending", `with Fall off the track Trending Now is right next to Christmas (got ${noFall.slice(0, 3)})`);
const summer = orderFor("afternoon", ["augtober", "christmas", "break", "trending", "season"], "2026-07-05");
ok(summer[0] !== "christmas", "outside the Christmas window the static order is untouched");

const dpr = readFileSync("app/components/DaypartRail.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
ok(/selRail\.id === "trending" \? \(\s*<TrendingRails[\s/>]/.test(dpr), "the trending drop mounts TrendingRails");
ok(/<TrendingRails\s+active\s+center=\{center\?\.hasLocalOrigin \? center : null\}/.test(dpr),
  "the open poster passes an actual local center to intelligence, never a bootstrap point");
const home = readFileSync("app/home.js", "utf8");
ok(/hasLocalOrigin:\s*Boolean\(locResolved && center && \(\s*!isSeedCenter\(center\) \|\| manualRef\.current \|\| \(deviceLoc\?\.lat === center\.lat && deviceLoc\?\.lng === center\.lng\)/.test(home),
  "the default point can only qualify after an explicit selection or a matching device fix");
const surface = readFileSync("app/components/TrendingRails.js", "utf8");
ok(/intelUrl = active &&/.test(surface) && /fetchJsonWithDeadline\(intelUrl\)/.test(surface),
  "the bounded read runs only for the open poster with a valid center");
ok(/if \(current\) setIntelligence/.test(surface) && /return \(\) => \{ current = false; \}/.test(surface) && /intelligence\?\.url === intelUrl/.test(surface),
  "a closed or superseded request cannot write and a previous center cannot display");
const surfaceCode = surface.replace(/^\s*\/\/.*$/gm, "");
ok(!/<aside[^>]*Coming up nearby/.test(surfaceCode) && !/leadEvent \? "Coming up nearby"/.test(surfaceCode),
  "the event lead is never a plain-text aside again");
ok(/eventSurface\.leadCard\(leadEvent\.slug\)/.test(surfaceCode) && /\{leadCard\.node\}/.test(surfaceCode),
  "the lead renders the feed's real event card when the feed holds it");
ok(/href=\{leadLink\}/.test(surfaceCode) && /!!\(leadCard \|\| leadLink\)/.test(surfaceCode),
  "otherwise it links to the event page, and with neither it is not shown");
ok(/withoutLead\(Array\.isArray\(eventsByRail\[rail\.id\]\)/.test(surfaceCode), "the lead card is not repeated on its shelf");
ok(/leadCard: mode === "trending" \? \(slug\) =>/.test(home) && /row\.curatedSlug === slug && row\.dest/.test(home),
  "home hands Trending a lead card lookup by curated slug");
// 2026-11-27 (owner screenshot): Dry Dock's #1 Trending Food card showed only
// sky because a centered crop of its wide cover photo fills a 96 x 268 column.
{
  const { placeCardPhotoPosition, PLACE_CARD_PHOTO_POSITION } = await import("../lib/placeCardPhotoPosition.js");
  const DRY = "ChIJ38CBz8Vqw4gRg0oFYUGBU_s";
  ok(placeCardPhotoPosition(DRY, `/api/photo?ref=places%2F${DRY}%2Fphotos%2Fwfplacediscovery&g=2&w=640`) === "80% 50%",
    "Dry Dock's own Google photo aims at the dock and diners");
  ok(placeCardPhotoPosition(DRY, `/api/photo?place=${DRY}&g=2&w=640`) === "80% 50%", "the same-place retry keeps the focal point");
  ok(placeCardPhotoPosition(DRY, "/api/photo?ref=places%2FChIJother%2Fphotos%2Fx") === null && placeCardPhotoPosition(DRY, "https://cdn.example/x.jpg") === null,
    "another photo (fallback, other venue) keeps the default crop");
  ok(placeCardPhotoPosition("ChIJnotlisted", `/api/photo?place=ChIJnotlisted`) === null && placeCardPhotoPosition("__proto__", "x") === null, "unlisted places are untouched");
  ok(Object.values(PLACE_CARD_PHOTO_POSITION).every((v) => /^\d{1,3}% \d{1,3}%$/.test(v)), "every entry is a plain percentage position");
  const rc = readFileSync("app/components/RailCard.js", "utf8").replace(/^\s*\/\/.*$/gm, "");
  ok(/placeCardPhotoPosition\(place\.id, displayedPhoto\)/.test(rc) && /objectPosition: shownPhotoPosition/.test(rc),
    "RailCard applies the reviewed focal point to the photo it paints");
}
console.log(`test-trending-rails: OK — ${pass} assertions (shelf routing, evidence gate incl. marquee venues, window, place split, poster order) by CALL`);
