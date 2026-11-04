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
ok(/<ThisWeekEvents events=\{thisWeekEvents\} \/>/.test(home) && /<PageInner [^>]*thisWeekEvents=\{thisWeekEvents\}/.test(home), "home.js threads the prop to a rendered <ThisWeekEvents>");
const server = strip(readFileSync(new URL("../lib/thisWeekEventsServer.js", import.meta.url), "utf8"));
ok(/fetchCuratedEvents\(\{[^}]*upcomingFrom: today/.test(server), "the server read passes upcomingFrom: today (Eastern) to fetchCuratedEvents");
ok(/thisWeekEventCards\(await cachedUpcoming\(today\), today, \{ now: new Date\(\) \}\)/.test(server), "the server passes a real clock so a final-day end time is honoured");

if (fail.length) { console.error("check-this-week-events: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`check-this-week-events: OK - ${pass} assertions (eligibility and ranking executed with fixed dates around ${TODAY}; Supabase read not executed)`);
