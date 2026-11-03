#!/usr/bin/env node
/**
 * check-this-week-events - the homepage "This week in Florida" strip.
 * Executes the data helper (lib/thisWeekEvents.js thisWeekEventCards) with a FIXED date
 * and asserts on its RETURN: the next-10-days window, ordering, series de-dupe, the
 * /florida-events/<slug> link, the 8 card cap and the under-2 renders-nothing rule. The
 * component and the page wiring are asserted by rendering/AST-lite checks on the real files.
 * Off-box: the Supabase read (lib/thisWeekEventsServer.js) is NOT executed here.
 */
import { readFileSync } from "node:fs";
import { thisWeekEventCards, thisWeekDateLabel, addDaysStr, THIS_WEEK_WINDOW_DAYS, THIS_WEEK_MAX } from "../lib/thisWeekEvents.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const TODAY = "2026-11-03";

const row = (slug, start, end, extra = {}) => ({
  event_id: slug, slug, event_name: slug.toUpperCase(), event_status: "scheduled", source_tier: 2,
  verification_confidence: "high", card_hook: "A hook.", city: "Sarasota", state: "FL", lat: 27.3, lng: -82.5,
  start_date: start, end_date: end, editorial_score: 50, hero_image: "/x/" + slug + ".webp", ...extra,
});
const rows = [
  row("festival-of-the-skeletons", "2026-11-06", "2026-11-07", { city: "Bradenton", editorial_score: 60 }),
  row("savor-st-pete", "2026-11-07", "2026-11-08", { editorial_score: 90 }),
  row("sarasota-medieval-fair", "2026-11-07", "2026-12-06", { editorial_score: 80 }),
  row("siesta-key-crystal-classic", "2026-11-13", "2026-11-16"),
  row("past-event", "2026-10-30", "2026-11-02"),
  row("starts-day-11", "2026-11-14", "2026-11-15"),
  row("running-now", "2026-10-20", "2026-11-05"),
  row("tomorrow-dup-a", "2026-11-04", "2026-11-04", { event_series_id: "series-1", editorial_score: 10 }),
  row("tomorrow-dup-b", "2026-11-04", "2026-11-04", { event_series_id: "series-1", editorial_score: 99 }),
  row("not-scheduled", "2026-11-05", "2026-11-05", { event_status: "cancelled" }),
  row("low-confidence", "2026-11-05", "2026-11-05", { verification_confidence: "low" }),
  row("chicago", "2026-11-05", "2026-11-05", { state: "IL", lat: 41.8, lng: -87.6 }),
];
const cards = thisWeekEventCards(rows, TODAY);
const slugs = cards.map((c) => c.slug);

ok(THIS_WEEK_WINDOW_DAYS === 10 && addDaysStr(TODAY, THIS_WEEK_WINDOW_DAYS) === "2026-11-13", "the window is the next 10 days: 2026-11-03 + 10 = 2026-11-13");
ok(slugs.includes("siesta-key-crystal-classic"), "Siesta Key Crystal Classic (Nov 13 to 16) shows on Nov 3: the last day of the 10 day window is inclusive");
ok(!slugs.includes("starts-day-11"), "an event starting on day 11 (Nov 14) is outside the window");
ok(!slugs.includes("past-event"), "an event that ended yesterday is excluded");
ok(slugs.includes("running-now") && slugs.includes("sarasota-medieval-fair"), "events already running (end on or after today) are included");
ok(!slugs.includes("not-scheduled") && !slugs.includes("low-confidence") && !slugs.includes("chicago"), "untrusted status, low confidence and non Florida rows never reach the strip");
ok(slugs.filter((s) => s.startsWith("tomorrow-dup")).join() === "tomorrow-dup-b", "one card per event_series_id, keeping the higher editorial_score row");
ok(cards.every((c) => c.href === "/florida-events/" + c.slug), "every card links /florida-events/<slug>");
ok(JSON.stringify(cards).indexOf("price") === -1 && cards.every((c) => !("price" in c)), "no prices on cards");
const starts = cards.map((c) => rows.find((r) => r.slug === c.slug).start_date);
ok(starts.every((s, i) => i === 0 || starts[i - 1] <= s), "ordered by start_date");
const sameDay = cards.filter((c) => ["savor-st-pete", "sarasota-medieval-fair"].includes(c.slug)).map((c) => c.slug);
ok(sameDay.join() === "savor-st-pete,sarasota-medieval-fair", "same start day: higher editorial_score first");
ok(cards.length <= THIS_WEEK_MAX, "never more than 8 cards");
const many = Array.from({ length: 12 }, (_, i) => row("e" + i, "2026-11-05", "2026-11-05"));
ok(thisWeekEventCards(many, TODAY).length === 8, "12 qualifying events are capped at 8");
ok(thisWeekEventCards([rows[0]], TODAY).length === 0 && thisWeekEventCards([], TODAY).length === 0, "fewer than 2 qualifying events renders nothing");
ok(thisWeekEventCards(rows, "2026-11-13").some((c) => c.slug === "starts-day-11") && !thisWeekEventCards(rows, "2026-11-20").some((c) => c.slug === "siesta-key-crystal-classic"), "the window moves with the passed date, and Siesta Key is gone by Nov 20");
let threw = false; try { thisWeekEventCards(rows, "tomorrow"); } catch { threw = true; }
ok(threw, "a malformed date throws instead of silently using UTC today");
const label = (a, b) => thisWeekDateLabel({ start_date: a, end_date: b });
ok(label("2026-11-07", "2026-11-07") === "Sat Nov 7" && label("2026-11-07", null) === "Sat Nov 7", `single day label (got ${label("2026-11-07", "2026-11-07")})`);
ok(label("2026-11-06", "2026-11-08") === "Nov 6 to 8", `same month run label (got ${label("2026-11-06", "2026-11-08")})`);
ok(label("2026-11-28", "2026-12-02") === "Nov 28 to Dec 2", `cross month run label (got ${label("2026-11-28", "2026-12-02")})`);
ok(cards.every((c) => !/[‒-―]| - /.test(c.when)), "labels carry no dashes");

// Wiring, on the real files (static: Home cannot be rendered under plain node).
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

if (fail.length) { console.error("check-this-week-events: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`check-this-week-events: OK - ${pass} assertions (10 day window executed with fixed date ${TODAY}; Supabase read not executed)`);
