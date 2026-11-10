#!/usr/bin/env node
/**
 * check-this-week-events - the homepage "This week in Florida" strip.
 * Executes lib/thisWeekEvents.js with FIXED dates and asserts on the RETURN, in two parts
 * that mirror the module's two decisions:
 *   ELIGIBILITY (thisWeekOccurrence): the seven day window, an event's real occurrence day
 *     from its day list / schedule note / envelope, the final-day end time in ET, an ended
 *     event, a cancelled row, a seasonal attraction open since August (ELIGIBLE), a weekly
 *     market on its stated day, a select-nights run with no stated days (opening day only).
 *   RANKING (thisWeekRank, thisWeekEventCards): dated before seasons, assessed score vs the
 *     neutral prior for a never-assessed row, age as a tie breaker, one card per day dealt
 *     across the window, series de-dupe, the cap, the under-2 renders-nothing rule.
 * Component and page wiring are asserted on the real files. Off-box: the Supabase read
 * (lib/thisWeekEventsServer.js) is NOT executed here.
 */
import { readFileSync } from "node:fs";
import { siteTodayStr } from "../lib/siteTime.js";
import { VERIFIED_OCCURRENCES_2026_11 } from "../lib/eventOccurrencesVerified202611.js";
import {
  thisWeekEventCards, thisWeekOccurrence, thisWeekRank, rankingScore, isAssessed, thisWeekDateLabel, addDaysStr, siteClockStr,
  THIS_WEEK_WINDOW_DAYS, THIS_WEEK_MAX, THIS_WEEK_MIN, THIS_WEEK_MAX_RUN_DAYS, UNASSESSED_SCORE_PRIOR,
} from "../lib/thisWeekEvents.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const TODAY = "2026-11-03"; // a Tuesday
const LAST = addDaysStr(TODAY, THIS_WEEK_WINDOW_DAYS);

const row = (slug, start, end, extra = {}) => ({
  event_id: slug, slug, event_name: slug.toUpperCase(), event_status: "scheduled", source_tier: 2,
  verification_confidence: "high", card_hook: "A hook.", city: "Sarasota", state: "FL", lat: 27.3, lng: -82.5,
  start_date: start, end_date: end, editorial_score: 0, select_nights: false, hero_image: "/x/" + slug + ".webp", ...extra,
});
const occ = (r, opts) => thisWeekOccurrence(r, TODAY, opts);

/* ------------------------------------------------------------ window */
ok(THIS_WEEK_WINDOW_DAYS === 6 && LAST === "2026-11-09", `"This week" is seven days: ${TODAY} (Tue) through ${LAST} (Mon)`);
ok(occ(row("day-7", "2026-11-09", "2026-11-09")) === "2026-11-09", "the seventh day is inside the window");
ok(occ(row("day-8", "2026-11-10", "2026-11-10")) === null, "day eight is outside the window");

/* ------------------------------------------------------------ eligibility cases */
// Case: a seasonal attraction that opened more than 30 days ago and is still operating.
const epcot = row("epcot-food-and-wine", "2026-08-27", "2026-11-21", { editorial_score: 8.4 });
ok(occ(epcot) === TODAY, "a continuous season open since August has a real occurrence TODAY (eligible, never age-excluded)");
// Case: an event that has actually ended.
ok(occ(row("ended-yesterday", "2026-10-30", "2026-11-02")) === null, "an event whose last day was yesterday is not eligible");
ok(occ(row("cancelled", "2026-11-05", "2026-11-05", { event_status: "cancelled" })) === null, "a cancelled row is never eligible");
ok(occ(row("postponed", "2026-11-05", "2026-11-05", { event_status: "postponed" })) === null, "a postponed row is never eligible");
// Case: a recurring market that operates on particular days.
const satSunFair = row("medieval-fair", "2026-11-07", "2026-12-06", { select_nights: true, schedule_note: "Saturdays and Sundays only, November 7 through December 6, 9:45am-5:30pm." });
ok(occ(satSunFair) === "2026-11-07", "a Sat/Sun run is placed on Saturday Nov 7, its first stated day in the window");
ok(thisWeekOccurrence(satSunFair, "2026-11-10") === "2026-11-14", "on Tuesday Nov 10 the same Sat/Sun run is placed on Saturday Nov 14, not on Tuesday");
const tuesdayBingo = row("bingo-tuesdays", "2026-10-06", "2026-12-15", { select_nights: true, schedule_note: "Every Tuesday, 6:30-8:30pm. Cash prizes." });
ok(occ(tuesdayBingo) === TODAY, "a weekly Tuesday series is placed on today (a Tuesday)");
ok(thisWeekOccurrence(tuesdayBingo, "2026-11-04") === "2026-11-10", "on Wednesday the Tuesday series is placed on next Tuesday");
const listed = row("jollywood", "2026-11-07", "2027-01-05", { select_nights: true, schedule_note: "15 select nights only, not a continuous run: Nov 7, 14, 16, 21, 23, 28 and Dec 5, 7, 12, 14, 19, 21, 23 2026, plus Jan 3 and Jan 5 2027. 7:30pm to 12:30am." });
ok(occ(listed) === "2026-11-07" && thisWeekOccurrence(listed, "2026-11-08") === "2026-11-14" && thisWeekOccurrence(listed, "2026-11-15") === "2026-11-16", "an explicit date list places the event on its listed nights only (Nov 7; from Nov 8 the next is Nov 14; from Nov 15 it is Nov 16)");
const ownList = row("own-list", "2026-11-01", "2026-11-30", { occurrence_dates: ["2026-11-01", "2026-11-08", "2026-11-15"] });
ok(occ(ownList) === "2026-11-08", "a row's own occurrence_dates win: Nov 1 is past, so Nov 8");
const vagueSelect = row("vague-select", "2026-10-20", "2026-11-20", { select_nights: true, schedule_note: "Select nights, 6-10 p.m. Timed entry." });
ok(occ(vagueSelect) === null, "an ONGOING select-nights run whose note states no days is undated: not placed (never 'today' by inference)");
const openingSelect = row("opening-select", "2026-11-06", "2026-12-20", { select_nights: true, schedule_note: "Select dates through December 20." });
ok(occ(openingSelect) === "2026-11-06", "a select-nights run OPENING in the window counts on its opening day");
// Case: an event near the local midnight boundary.
const tonight = row("tonight", TODAY, TODAY, { start_time: "19:00:00", end_time: "22:00:00" });
ok(occ(tonight, { clock: "21:30" }) === TODAY, "at 9:30 PM ET an event ending 10 PM tonight is still on");
ok(occ(tonight, { clock: "22:00" }) === null, "at 10:00 PM ET an event that ended at 10 PM tonight is over");
ok(occ(tonight, { clock: "23:59" }) === null && occ(row("tonight-2", TODAY, TODAY, { end_time: "22:00:00" }), { clock: null }) === TODAY, "with no clock the day governs (never guess), with a clock the end time governs");
const lateNight = row("late", TODAY, TODAY, { start_time: "21:00:00", end_time: "01:00:00" });
ok(occ(lateNight, { clock: "23:00" }) === TODAY, "an end time of 01:00 after a 21:00 start reads as past midnight: not cut at 01:00 the same evening");
const twoNight = row("two-night", "2026-11-02", TODAY, { start_time: "19:00:00", end_time: "23:00:00" });
ok(occ(twoNight, { clock: "20:00" }) === TODAY && occ(twoNight, { clock: "23:30" }) === null, "a two night event is on its second night until its end time passes");
ok(/^\d{2}:\d{2}$/.test(siteClockStr(new Date("2026-11-03T20:30:00Z"))) && siteClockStr(new Date("2026-11-03T20:30:00Z")) === "15:30", `siteClockStr reads America/New_York (20:30Z on Nov 3 is 15:30 EST), got ${siteClockStr(new Date("2026-11-03T20:30:00Z"))}`);
ok(siteClockStr(new Date("2026-07-03T20:30:00Z")) === "16:30", "and is DST aware (20:30Z on Jul 3 is 16:30 EDT)");
// Case: trust gates are the hub's.
ok(occ(row("low-confidence", "2026-11-05", "2026-11-05", { verification_confidence: "low" })) === null && occ(row("chicago", "2026-11-05", "2026-11-05", { state: "IL", lat: 41.8, lng: -87.6 })) === null, "low confidence and non Florida rows never get a day");


/* ------------------------------------------------------------ restricted schedules never fall back to the envelope */
// Owner, 2026-11-04: a CONTINUOUS row (select_nights false) whose note restricts its days
// was placed on closed weekdays. Every row now uses its note's rule.
const W = "2026-11-04"; // a Wednesday
const pintosRow = row("pintos", "2026-09-19", "2026-11-08", { schedule_note: "September 19–November 8. Thursdays and Fridays run 2–7 PM; Saturdays and Sundays run 9 AM–7 PM." });
ok(thisWeekOccurrence(pintosRow, W) === "2026-11-05", "a continuous Thu to Sun farm is NOT placed on Wednesday: Thu Nov 5");
const sweetRow = row("sweet-season", "2026-09-26", "2026-11-08", { schedule_note: "Sat 9am-5pm, Sun 11am-5pm; night maze Fri Oct 23 & 30, 6-10pm; closed weekdays" });
ok(thisWeekOccurrence(sweetRow, W) === "2026-11-07", "'closed weekdays' plus a hint list of past Fridays: Sat Nov 7");
const louiseRow = row("aunt-louise", "2026-09-19", "2026-11-15", { schedule_note: "Saturdays 10am-6pm, Sundays 2-6pm" });
ok(thisWeekOccurrence(louiseRow, W) === "2026-11-07" && thisWeekOccurrence(louiseRow, "2026-11-09") === "2026-11-14", "a weekend farm on Wed is placed on Sat; on Mon on the next Sat");
const vagueRun = row("vague-run", "2026-09-12", "2026-11-20", { schedule_note: "Select nights into early November." });
ok(thisWeekOccurrence(vagueRun, W) === null, "a continuous row whose note says 'select nights' but names none is undated, not 'today'");
const notEvery = row("not-every", "2026-11-01", "2026-11-08", { schedule_note: "Race days are not every day of the window." });
ok(thisWeekOccurrence(notEvery, W) === null, "'not every day' is a restriction, never read as daily");
const closedDay = row("closed-day", "2026-11-12", "2027-01-04", { schedule_note: "Mon-Thu 5-11PM, Fri-Sat 5PM-midnight, Sun 4-10PM; closed Nov 16, Nov 30, Dec 7" });
ok(thisWeekOccurrence(closedDay, "2026-11-16") === "2026-11-17", "a stated closed date is skipped (Mon Nov 16 closed: Tue Nov 17)");
// Structured occurrence data where the note cannot be read: the checked-in organizer registry.
const keyWest = row("key-west-offshore-world-championship-2026", "2026-11-01", "2026-11-08", { event_id: "key-west-offshore-worlds-2026", schedule_note: "November 1 through 8, 2026. Race days are not every day of the window." });
ok(thisWeekOccurrence(keyWest, W) === W && thisWeekOccurrence(keyWest, "2026-11-05") === "2026-11-06" && thisWeekOccurrence(keyWest, "2026-11-07") === "2026-11-08", "Key West uses its verified race days (Nov 4, 6, 8): never Nov 5 or 7");
const thirteenth = row("13th-floor", "2026-09-12", "2026-11-07", { event_id: "fl26-13th-floor-haunted-house-2026", select_nights: true, schedule_note: "Select nights into early November" });
ok(thisWeekOccurrence(thirteenth, W) === "2026-11-07", "13th Floor uses its verified last night (Nov 7)");
ok(VERIFIED_OCCURRENCES_2026_11.length >= 9 && VERIFIED_OCCURRENCES_2026_11.every((v) => /^https:\/\//.test(v.source_url) && /^T[1-4]$/.test(v.tier) && v.quote && /^\d{4}-\d{2}-\d{2}$/.test(v.checked) && v.occurrence_dates.length && v.occurrence_dates.every((d, i, a) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (i === 0 || a[i - 1] < d))), "every verified record names its source URL, tier, quote and check date, with sorted ISO days");
// A recurring session that is over today moves to its NEXT occurrence, not to tomorrow.
const tueNight = row("tue-trivia", "2026-10-06", "2026-12-15", { schedule_note: "Every Tuesday and Thursday, 6:30-8:30pm.", start_time: "18:30:00", end_time: "20:30:00" });
ok(occ(tueNight, { clock: "20:00" }) === TODAY && occ(tueNight, { clock: "20:30" }) === "2026-11-05", "a Tue/Thu session that ended tonight moves to Thursday, not to Wednesday");
const tueOnly = row("tue-only", "2026-10-06", "2026-12-15", { schedule_note: "Every Tuesday, 6:30-8:30pm.", start_time: "18:30:00", end_time: "20:30:00" });
ok(occ(tueOnly, { clock: "20:30" }) === null, "a Tuesday-only session over tonight has no other day in the seven day window (next Tuesday is day eight)");
ok(thisWeekOccurrence(pintosRow, "2026-11-05", { clock: "19:30" }) === "2026-11-05", "a row with no end_time is never cut by the clock");

/* ------------------------------------------------------------ Eastern time, DST and local midnight */
ok(siteTodayStr(new Date("2026-11-04T04:30:00Z")) === "2026-11-03" && siteTodayStr(new Date("2026-11-04T05:00:00Z")) === "2026-11-04", "ET midnight under EST: 04:30Z is still Nov 3, 05:00Z is Nov 4");
ok(siteTodayStr(new Date("2026-07-04T03:59:00Z")) === "2026-07-03" && siteTodayStr(new Date("2026-07-04T04:00:00Z")) === "2026-07-04", "ET midnight under EDT: 03:59Z is Jul 3, 04:00Z is Jul 4");
ok(siteTodayStr(new Date("2026-11-01T05:30:00Z")) === "2026-11-01" && siteClockStr(new Date("2026-11-01T05:30:00Z")) === "01:30" && siteClockStr(new Date("2026-11-01T06:30:00Z")) === "01:30", "fall back (Nov 1, 2026): 05:30Z and 06:30Z both read 01:30 ET on Nov 1");
ok(siteClockStr(new Date("2027-03-14T06:59:00Z")) === "01:59" && siteClockStr(new Date("2027-03-14T07:00:00Z")) === "03:00", "spring forward (Mar 14, 2027): 01:59 EST is followed by 03:00 EDT");
ok(siteClockStr(new Date("2026-11-03T20:59:59.9Z")) === "15:59", "the clock rounds down to the minute and never prints :60");
ok(addDaysStr("2026-10-31", 1) === "2026-11-01" && addDaysStr("2026-11-01", 6) === "2026-11-07" && addDaysStr("2027-03-13", 1) === "2027-03-14" && addDaysStr("2026-12-28", 6) === "2027-01-03", "calendar days are counted by date, unaffected by DST and the year end");
const dst = thisWeekEventCards([row("dst-a", "2026-11-01", "2026-11-01"), row("dst-b", "2026-11-07", "2026-11-07"), row("dst-c", "2026-11-08", "2026-11-08")], "2026-11-01", { now: new Date("2026-11-01T06:30:00Z") });
ok(dst.map((c) => c.day).join() === "2026-11-01,2026-11-07", `on the fall-back day the window is Nov 1 through Nov 7, seven calendar days (got ${dst.map((c) => c.day)})`);

/* ------------------------------------------------------------ ranking cases */
// Case: a newly published event without an editorial assessment.
const fresh = row("fresh-unassessed", "2026-11-07", "2026-11-08", { editorial_score: 0 });
ok(!isAssessed(fresh) && !isAssessed({ editorial_score: null }) && isAssessed({ editorial_score: 6 }), "0 and null mean not yet assessed; 6 means assessed");
ok(UNASSESSED_SCORE_PRIOR === 7 && rankingScore(fresh) === 7, "an unassessed row ranks at the neutral prior 7.0, never at 0");
ok(thisWeekRank(row("assessed-82", "2026-11-07", "2026-11-08", { editorial_score: 8.2 }), fresh, TODAY) < 0, "an assessed 8.2 outranks the prior");
ok(thisWeekRank(fresh, row("assessed-6", "2026-11-07", "2026-11-08", { editorial_score: 6 }), TODAY) < 0, "the prior outranks an assessed 6 (assessed low stays below not yet assessed)");
ok(thisWeekRank(row("assessed-7", "2026-11-07", "2026-11-08", { editorial_score: 7 }), fresh, TODAY) < 0, "at an equal score the assessed row comes first");
// Dated before seasons; age as a tie breaker among seasons.
const seasonOld = row("season-aug", "2026-08-27", "2026-11-21", { editorial_score: 9 });
const seasonNew = row("season-oct", "2026-10-25", "2026-12-20", { editorial_score: 9 });
ok(thisWeekRank(fresh, seasonOld, TODAY) < 0, "a dated unassessed festival outranks a season-long run scored 9");
ok(thisWeekRank(seasonNew, seasonOld, TODAY) < 0, "between two seasons with equal scores the one that opened more recently ranks first (age signal)");
ok(thisWeekRank(ownList, seasonOld, TODAY) < 0, "a long run WITH an exact day list is a dated event, not a season");
ok(thisWeekRank(row("t1", "2026-11-05", "2026-11-05", { source_tier: 1 }), row("t2", "2026-11-05", "2026-11-05", { source_tier: 2 }), TODAY) < 0, "unassessed tie: organizer-verified (tier 1) before press-verified (tier 2)");
ok(thisWeekRank(row("pic", "2026-11-05", "2026-11-05"), row("nopic", "2026-11-05", "2026-11-05", { hero_image: null }), TODAY) < 0, "unassessed tie: a row with a real photo before one without");

/* ------------------------------------------------------------ the dealt strip */
const rows = [
  row("running-now", "2026-10-20", "2026-11-05", { editorial_score: 7.2 }),
  row("tomorrow-dup-a", "2026-11-04", "2026-11-04", { event_series_id: "series-1", editorial_score: 6 }),
  row("tomorrow-dup-b", "2026-11-04", "2026-11-04", { event_series_id: "series-1", editorial_score: 8 }),
  row("festival-of-the-skeletons", "2026-11-06", "2026-11-07", { city: "Bradenton" }),
  row("savor-st-pete", "2026-11-07", "2026-11-08"),
  satSunFair,
  row("christmas-party-opens-nov-7", "2026-11-07", "2027-01-05", { editorial_score: 9.9 }),
  row("sunday-market", "2026-11-08", "2026-11-08"),
  epcot, seasonOld, vagueSelect,
  row("past-event", "2026-10-30", "2026-11-02"),
  row("next-week", "2026-11-11", "2026-11-12"),
  row("cancelled", "2026-11-05", "2026-11-05", { event_status: "cancelled" }),
];
const cards = thisWeekEventCards(rows, TODAY);
const slugs = cards.map((c) => c.slug);
ok(cards.every((c) => c.href === "/florida-events/" + c.slug && /^\d{4}-\d{2}-\d{2}$/.test(c.day)), "every card links /florida-events/<slug> and carries its occurrence day");
ok(!slugs.includes("past-event") && !slugs.includes("next-week") && !slugs.includes("cancelled") && !slugs.includes("vague-select") && !slugs.includes("tomorrow-dup-a"), "ended, outside the window, cancelled, undated select-nights and series duplicates are not dealt");
ok(slugs.includes("epcot-food-and-wine") && slugs.includes("season-aug"), "seasons that are open are eligible and DO appear (ranked, not excluded)");
const dayOrder = cards.map((c) => c.day);
const distinct = new Set(dayOrder).size;
ok(dayOrder.slice(0, distinct).every((d, i) => i === 0 || dayOrder[i - 1] < d), `round one deals one card per day in day order (got ${dayOrder.slice(0, distinct).join(" ")})`);
ok(slugs[0] === "running-now", `today's best is a dated run under way (7.2), ahead of the seasons open today (got ${slugs[0]})`);
ok(slugs.indexOf("sunday-market") < slugs.indexOf("epcot-food-and-wine"), "Sunday's only event is dealt before today's second (the weekend is never crowded out)");
ok(slugs.indexOf("medieval-fair") < slugs.indexOf("savor-st-pete") && slugs.indexOf("savor-st-pete") < slugs.indexOf("christmas-party-opens-nov-7"), "Nov 7: assessed 8.4 fair, then the unassessed festival, then the season opening that day (score 9.9 does not buy a season the slot)");
ok(JSON.stringify(cards).indexOf("price") === -1, "no prices on cards");
ok(THIS_WEEK_MAX === 10 && cards.length <= THIS_WEEK_MAX && THIS_WEEK_MIN === 2, "never more than 10 cards; nothing under 2");
const many = Array.from({ length: 15 }, (_, i) => row("e" + i, "2026-11-05", "2026-11-05"));
ok(thisWeekEventCards(many, TODAY).length === 10, "15 qualifying events are capped at 10");
ok(thisWeekEventCards([rows[0]], TODAY).length === 0 && thisWeekEventCards([], TODAY).length === 0, "fewer than 2 qualifying events renders nothing");
ok(thisWeekEventCards(rows, "2026-11-11").some((c) => c.slug === "next-week") && !thisWeekEventCards(rows, "2026-11-20").some((c) => c.slug === "savor-st-pete"), "the window moves with the passed date");
ok(thisWeekEventCards([tonight, row("other", TODAY, TODAY)], TODAY, { now: new Date("2026-11-04T03:30:00Z") }).length === 0, "with a real clock (03:30Z = 22:30 ET on Nov 3) the 10 PM event drops and the strip falls under 2");
let threw = false; try { thisWeekEventCards(rows, "tomorrow"); } catch { threw = true; }
ok(threw, "a malformed date throws instead of silently using UTC today");
ok(THIS_WEEK_MAX_RUN_DAYS === 30, "the season threshold is 30 days (a rank signal, not an exclusion)");
const label = (a, b) => thisWeekDateLabel({ start_date: a, end_date: b });
ok(label("2026-11-07", "2026-11-07") === "Sat Nov 7" && label("2026-11-06", "2026-11-08") === "Nov 6 to 8" && label("2026-11-28", "2026-12-02") === "Nov 28 to Dec 2", "labels: single day, same month run, cross month run");
ok(cards.every((c) => !/[‒-―]| - /.test(c.when)), "labels carry no dashes");

/* ------------------------------------------------------------ wiring, on the real files */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const comp = strip(readFileSync(new URL("../app/components/ThisWeekEvents.js", import.meta.url), "utf8"));
const page = strip(readFileSync(new URL("../app/page.js", import.meta.url), "utf8"));
const home = strip(readFileSync(new URL("../app/home.js", import.meta.url), "utf8"));
ok(/<a key=\{e\.slug\} href=\{e\.href\}/.test(comp), "component renders each card as a real anchor on card.href");
ok(/This week in Florida/.test(comp) && /Dated events with verified pages/.test(comp) && /href="\/florida-events"[^>]*>See all events</.test(comp), "heading, subline and See all events link present");
ok(/cards\.length < 2\) return null/.test(comp), "component renders nothing under 2 events");
ok(/await thisWeekEventsForHome\(siteTodayStr\(\)\)/.test(page) && /<Home [^>]*thisWeekEvents=\{thisWeekEvents\}/.test(page), "page.js fetches with siteTodayStr() and passes thisWeekEvents to Home");
ok(/<ThisWeekEvents events=\{thisWeekEvents\} guide=\{thisWeekGuide\} \/>/.test(home) && /<PageInner [^>]*thisWeekEvents=\{thisWeekEvents\}/.test(home), "home.js threads the prop to a rendered <ThisWeekEvents>");
// Weekly trend guide leads the strip (owner, 2026-11-04).
{
  const { weeklyTrendGuideCard } = await import("../lib/thisWeekEvents.js");
  const img = { src: "/guides/x.webp", credit: "Ken Lund", source: "https://commons.wikimedia.org/x" };
  const g = weeklyTrendGuideCard([
    { slug: "trending-in-florida-this-week-oct-19-2026", title: "Old", updated: "2026-10-20", image: img },
    { slug: "trending-in-florida-this-week-nov-2-2026", title: "Trending in Florida This Week", updated: "2026-11-04", mins: 7, image: img },
    { slug: "tampa-restaurants", title: "Tampa", updated: "2026-12-01", image: img },
  ]);
  ok(g && g.href === "/guides/trending-in-florida-this-week-nov-2-2026" && g.credit === "Ken Lund", "weekly guide card picks the newest trending week guide and keeps its photo credit");
  ok(!/[‒-―]| - /.test(g.name + g.when + g.city), "weekly guide card copy carries no dashes");
  ok(weeklyTrendGuideCard([{ slug: "trending-in-florida-this-week-nov-2-2026", title: "T", updated: "2026-11-04", image: null }]) === null, "no hero photo means no guide card");
  ok(/thisWeekGuide=\{thisWeekGuide\}/.test(page) && /weeklyTrendGuideCard\(guideDiscoveryIndex\(currentGuides\(GUIDES\)\)\)/.test(page), "page.js builds the weekly guide card on the server from current guides");
}
// Christmas hub card rides the same strip while the Christmas poster is in season.
{
  const { existsSync } = await import("node:fs");
  const { christmasHubStripCard, CHRISTMAS_HUB_HREF, CHRISTMAS_HUB_PHOTO_KEY, CHRISTMAS_HUB_ACCENT } = await import("../lib/christmasHubCard.js");
  const { EDITORIAL_CONTEXT_PHOTOS } = await import("../lib/editorialContextPhotos.js");
  const record = EDITORIAL_CONTEXT_PHOTOS.find((asset) => asset.key === CHRISTMAS_HUB_PHOTO_KEY);
  const live = christmasHubStripCard("2026-11-09");
  const copy = live ? live.name + " " + live.when + " " + live.city : "";
  ok(!!record && record.src && record.credit && record.topics.includes("holiday-lights") && record.locationRestriction === "Sarasota", "the Christmas hub photo key is a reviewed Florida holiday lights record");
  ok(!!live && live.href === CHRISTMAS_HUB_HREF && live.slug === "christmas-in-florida" && live.hub === true, "on Nov 9 the strip card opens /christmas-in-florida");
  ok(!!live && live.image === record.src && live.credit === record.credit && live.creditHref === record.creditHref && existsSync(new URL("../public" + record.src, import.meta.url)), "the card uses that record's file, credit and source, and the file is in public/");
  ok(!!live && live.accent === CHRISTMAS_HUB_ACCENT && CHRISTMAS_HUB_ACCENT === "#F97316", "the card accent is the site orange");
  ok(!!live && !/[‒–—―]| - /.test(copy) && !/\bbest\b/i.test(copy) && !/real time|right now/i.test(copy) && !/purple/i.test(copy), "hub card copy has no dash, no best, no real time, no right now");
  ok(christmasHubStripCard("2026-10-13") && christmasHubStripCard("2026-01-01") && christmasHubStripCard("2026-10-12") === null && christmasHubStripCard("2026-01-02") === null && christmasHubStripCard("2026-07-01") === null && christmasHubStripCard("tomorrow") === null, "the card is on only for the Christmas poster window, and a bad date returns null");
  ok(/christmasHubStripCard\(siteTodayStr\(\)\)/.test(page) && /christmasHubCard && thisWeekRows\.length >= 2 \? \[christmasHubCard, \.\.\.thisWeekRows\]/.test(page), "page.js prepends the hub card only when the dated strip already has events");
  ok(/e\.accent \|\| "#FF8A3D"/.test(comp) && /data-hub=\{e\.hub \? e\.slug : undefined\}/.test(comp) && /fontFamily: "var\(--wf-sans\)"/.test(comp), "the strip paints the hub accent on the existing card and keeps the site face");
}
const server = strip(readFileSync(new URL("../lib/thisWeekEventsServer.js", import.meta.url), "utf8"));
ok(/fetchCuratedEvents\(\{[^}]*upcomingFrom: today/.test(server), "the server read passes upcomingFrom: today (Eastern) to fetchCuratedEvents");
ok(/thisWeekEventCards\(await cachedUpcoming\(today\), today, \{ now: new Date\(\) \}\)/.test(server), "the server passes a real clock so a final-day end time is honoured");

// /events (14 day page) is a server page that imports next/cache, so it is checked by source,
// not executed: its day comes from the verified list or nextOpenDay, never "start < today ? today : start".
const eventsPage = strip(readFileSync(new URL("../app/events/page.js", import.meta.url), "utf8"));
const efw = eventsPage.slice(eventsPage.indexOf("function eventsForWindow("), eventsPage.indexOf("const S = {"));
ok(efw.length > 200 && /occurrenceDatesFor\(e\)/.test(efw) && /nextOpenDay\(e, today, last\)/.test(efw) && !/start < today \? today : start/.test(efw), "/events files each event under its first real open day (verified list or the note rule), never under today by envelope");

if (fail.length) { console.error("check-this-week-events: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`check-this-week-events: OK - ${pass} assertions (eligibility and ranking executed with fixed dates around ${TODAY}; Supabase read not executed)`);
