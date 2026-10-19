#!/usr/bin/env node
// 2026-10-19 site fixes (Script Director concept pack WF-CREATIVE-20261019-001):
//  1. beach / things-to-do / nightlife landing headers and /best-beaches no
//     longer claim "no ads" next to partner rails; the stay CTA on
//     /best-beaches carries the visible commission line; the FAQ JSON-LD says
//     "Rankings are never for sale."
//  2. A cached Ticketmaster start within 72 hours, or flagged TBD /
//     placeholder / "If Necessary", is re-read from Discovery. The Rays
//     ALCS Game 6 row stays 8:08 PM ET — Ticketmaster's 17:00 and 20:00
//     are not first pitch, and MLB's stats API is not called.
//  3. /best-beaches never ranks a charter, tour or other non-beach business.
//  4. /florida/[town] no longer sends a website reader "to the app".
//  5. The Siesta Key drum circle starts about an hour before sunset.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyFreshTicketmasterStarts, applyStoredStartCorrections, eventStartUncertain, needsTicketmasterStartRefresh, FRESH_START_WINDOW_MS } from "../lib/eventStartRefresh.js";
import { eventJsonLdDates } from "../lib/eventTime.js";
import { isRankableBeach, rankBeaches } from "../lib/beaches.js";
import { GUIDE_OFFER_COMMISSION_LINE } from "../lib/affiliateDisclosure.js";
import { GUIDES } from "../lib/guides.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
let fails = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };

// ── 1. honest merit copy ──────────────────────────────────────────────────
const landingPage = read("lib/landingPage.js");
const hero = (landingPage.match(/<PremiumIntentHero[\s\S]*?\/>/) || [""])[0];
ok(hero && !/no ads/i.test(hero), "landing hero (beaches / things-to-do / nightlife) makes no 'no ads' claim");
ok(/never for sale/.test(hero) && /commission/.test(hero), "landing hero says rankings are never for sale and partner links may earn a commission");
ok(!/no ads/i.test(read("lib/landing.js").slice(read("lib/landing.js").indexOf("export async function landingMetadata"))),
  "landingMetadata descriptions make no 'no ads' claim");
ok(!/no ads, no paid placement/i.test(landingPage), "landing FAQ JSON-LD makes no 'no ads' claim");
const bb = read("app/best-beaches/[metro]/page.js");
ok(/on the Wayfind Score\. Rankings are never for sale\."/.test(bb), "best-beaches FAQ JSON-LD says 'Rankings are never for sale.'");
ok(!/No ads, no paid placement/.test(bb), "best-beaches JSON-LD no longer says 'No ads, no paid placement'");
ok(!/no ads/i.test(read("app/best-beaches/[metro]/parts.js")), "best-beaches share text makes no 'no ads' claim");
const stayAt = bb.indexOf("Check rates ↗");
const lineAt = bb.indexOf("{GUIDE_OFFER_COMMISSION_LINE}", stayAt);
ok(stayAt > 0 && lineAt > stayAt && lineAt - stayAt < 900, "the commission line renders directly under the partner stay CTA");
ok(/<p data-stay-commission[^>]*>\{GUIDE_OFFER_COMMISSION_LINE\}<\/p>/.test(bb), "the stay commission line is visible text, not a title/hover");
ok(GUIDE_OFFER_COMMISSION_LINE === "Wayfind may earn a commission, which never changes our picks or their order.", "commission sentence is the approved wording");
// Policy pages stay untouched. /how-wayfind-ranks was rewritten on main
// (labeled sponsorships) and must not be restored to the old "no ads" line.
const ranks = read("app/how-wayfind-ranks/page.js");
ok(/Rankings, list order, guide picks, and the Wayfind Score are never paid for/.test(ranks) && !/no ads and no paid placement on Wayfind/.test(ranks), "/how-wayfind-ranks wording unchanged");
ok(/No ads, no paid placement\./.test(read("app/date-night/page.js")), "/date-night wording unchanged");
ok(/never paid for, and affiliate commission never changes them/.test(read("app/editorial-policy/page.js")), "/editorial-policy wording unchanged");

// ── 2. Ticketmaster start re-read + the one Rays correction ───────────────
const now = new Date("2026-10-19T14:32:00Z");
ok(FRESH_START_WINDOW_MS === 72 * 60 * 60 * 1000, "the re-read window is 72 hours");
const rays = { id: "tm_Z7r9jZ1AAZsP4", source: "Ticketmaster", name: "Cleveland Guardians at Tampa Bay Rays: ALCS (Home Game 3, If Necessary)", date: "2026-10-19", time: "17:00:00", venue: "Tropicana Field", lat: 27.768, lng: -82.653, status: "onsale" };
ok(eventStartUncertain(rays), "an If Necessary title is an uncertain start");
ok(needsTicketmasterStartRefresh(rays, now), "the cached Rays row must re-read Ticketmaster");
ok(needsTicketmasterStartRefresh({ id: "tm_far", source: "Ticketmaster", name: "Winter show (If Necessary)", date: "2026-12-01", time: "17:00:00" }, now), "a TBD/If Necessary event re-reads even when it is outside 72 hours");
ok(needsTicketmasterStartRefresh({ ...rays, id: "tm_tba", name: "Exhibition", timeTBA: true, date: "2026-12-01" }, now), "a timeTBA flag re-reads");
const tomorrow = { id: "tm_show", source: "Ticketmaster", name: "Breaking Benjamin", date: "2026-10-20", time: "19:00:00", lat: 27.95, lng: -82.46 };
ok(needsTicketmasterStartRefresh(tomorrow, now), "a Ticketmaster event inside 72 hours re-reads its start");
const later = { id: "tm_later", source: "Ticketmaster", name: "December concert", date: "2026-12-20", time: "19:00:00", lat: 27.95, lng: -82.46 };
ok(!needsTicketmasterStartRefresh(later, now), "a settled Ticketmaster event outside 72 hours keeps the cached start");
const seatgeek = { id: "sg_1", source: "SeatGeek", name: "Breaking Benjamin", date: "2026-10-19", time: "19:00:00" };
ok(!needsTicketmasterStartRefresh(seatgeek, now), "a non-Ticketmaster row is not sent back to the Ticketmaster feed");
const freshRays = { id: rays.id, name: "Cleveland Guardians at Tampa Bay Rays: ALCS (Home Game 3)", date: "2026-10-19", time: "20:00:00", status: "onsale" };
const freshShow = { id: tomorrow.id, name: tomorrow.name, date: tomorrow.date, time: "19:30:00", status: "onsale" };
const [fixed, moved, kept] = applyStoredStartCorrections(applyFreshTicketmasterStarts([rays, tomorrow, later], [freshRays, freshShow], now));
ok(fixed.time === "20:08:00", "the Rays placeholder becomes the stored 8:08 PM first pitch (got " + fixed.time + ")");
ok(fixed.name === "Cleveland Guardians at Tampa Bay Rays: ALCS Game 6", "the If Necessary title becomes the confirmed game");
ok(eventJsonLdDates(fixed).startDate === "2026-10-19T20:08:00-04:00", "JSON-LD startDate is Eastern with the -04:00 offset");
ok(fixed.id === rays.id && fixed.date === rays.date, "the Rays id and date are untouched");
ok(moved.time === "19:30:00" && moved.name === tomorrow.name, "another event inside 72 hours takes the fresh Ticketmaster time and keeps its name");
ok(kept === later, "an event outside the window is returned untouched");
ok(applyFreshTicketmasterStarts([seatgeek], [freshShow], now)[0] === seatgeek, "a non-Ticketmaster row is returned untouched");
ok(applyFreshTicketmasterStarts([rays], [], now)[0] === rays, "no fresh Discovery row leaves the cached event unchanged");
const missed = applyStoredStartCorrections(applyFreshTicketmasterStarts([rays], [], now));
ok(missed[0].time === "20:08:00" && missed[0].name.includes("ALCS Game 6"), "a missed re-read still applies the one stored Rays correction");
const route = read("app/api/events/route.js");
const refreshLib = read("lib/eventStartRefresh.js");
ok(/payload\.cached\) payload\.events = await refreshCachedTicketmasterStarts\(/.test(route), "a cached feed re-reads Ticketmaster starts before it is served");
ok(/startsOnly: true/.test(route), "the re-read is one existing Discovery query");
ok(/cset\(evK, events, 21 \* DAY\)/.test(route), "the 21-day event-feed cache rule is unchanged");
ok(!/mlbGameTimes|statsapi\.mlb\.com|reconcileMlbGames/.test(route + refreshLib + read("app/events/[city]/[slug]/page.js")), "the MLB stats API is not called");
const slugPage = read("app/events/[city]/[slug]/page.js");
ok(/return applyStoredStartCorrection\(e\)/.test(slugPage), "the event detail page applies the same stored start correction");
ok(/value: fmtClock\(e\.time\) \|\| "All day"/.test(slugPage) && !/e\.time\.slice\(0, 5\) : "All day"/.test(slugPage), "list cards print 12-hour time, not the raw 24-hour feed value");

// ── 3. beaches only ───────────────────────────────────────────────────────
ok(!isRankableBeach({ name: "Apollo Beach Fishing Charters", primary_type: "fishing_charter" }), "a fishing charter is not a beach");
ok(!isRankableBeach({ name: "Apollo Beach Fishing Charters", primary_type: "" }), "…even when its type is missing (name rule)");
ok(!isRankableBeach({ name: "Chadillac Adventures - Clearwater Beach", primary_type: "tour_agency" }), "a tour agency is not a beach");
ok(!isRankableBeach({ name: "Beach Town Yoga - St. Petersburg", primary_type: "yoga_studio" }), "a yoga studio is not a beach");
ok(!isRankableBeach({ name: "Cortez Beach, South Pier-", primary_type: "fishing_pier" }), "a fishing pier is not a beach");
for (const n of ["Siesta Beach", "North Beach At Fort DeSoto Park", "Treasure Island Beach", "Fort De Soto", "Davis Island Dog Beach", "Bean Point Beach"]) {
  ok(isRankableBeach({ name: n, primary_type: "beach" }), n + " stays rankable");
}
const rows = [
  { id: "a", name: "Apollo Beach Fishing Charters", primary_type: "fishing_charter", rating: 5, reviews: 921 },
  { id: "b", name: "North Beach At Fort DeSoto Park", primary_type: "beach", rating: 4.8, reviews: 4599 },
  { id: "c", name: "Treasure Island Beach", primary_type: "beach", rating: 4.8, reviews: 2728 },
  { id: "d", name: "Fort De Soto", primary_type: "beach", rating: 4.8, reviews: 2559 },
];
const before = rankBeaches(rows).map((b) => b.name).filter((n) => n !== "Apollo Beach Fishing Charters");
const after = rankBeaches(rows.filter(isRankableBeach)).map((b) => b.name);
ok(JSON.stringify(before) === JSON.stringify(after), "removing the charter keeps the real beaches in the same Wayfind Score order");
ok(/isRankableBeach\(\{ name: b\.name, primary_type: types\[b\.place_id\]/.test(bb), "/best-beaches applies the gate before ranking");

// ── 4. a website, not an app ──────────────────────────────────────────────
const town = read("app/florida/[town]/page.js");
ok(!/in the app|download the app/i.test(town.replace(/^\s*\/\/.*$/gm, "")), "/florida/[town] visible copy never says 'in the app'");
ok(!/no ads/i.test(town), "/florida/[town] makes no 'no ads' claim");

// ── 5. drum circle timing (Visit Sarasota, Siesta Key Chamber, Sarasota Magazine) ──
const drum = GUIDES["siesta-key-drum-circle"];
const drumText = JSON.stringify(drum);
ok(drum && !/two hours before sunset/i.test(drumText), "the drum circle guide no longer says two hours before sunset");
ok(/about an hour before sunset/.test(drum.intro) && /about an hour before sunset/.test(drum.faq[0].a) && /about an hour before sunset/.test(drum.picks[0].blurb), "intro, FAQ (JSON-LD) and pick all say about an hour before sunset");
ok(!/start at sunset/i.test(drum.teaser), "the teaser does not say the drums start at sunset");
ok(!/no ads|paid placement/i.test(drumText), "the drum circle guide makes no 'no ads' or 'no paid placement' claim");

if (fails) {
  console.error("test-site-fixes-20261019: FAIL — " + fails);
  process.exit(1);
}
console.log("test-site-fixes-20261019: OK — " + pass + " assertions");
