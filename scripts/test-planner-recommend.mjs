#!/usr/bin/env node
// scripts/test-planner-recommend.mjs — the site AI answers exactly what was asked (owner 2026-11-28: "I ask for
// recommendations for one recommendation. It gives me three. It builds an itinerary for me without me even
// asking"; "It should know what the user location is"; "Make sure the AI knows the weather, and knows the time of
// the day, and knows that the business is open or closed").
//
// Pure functions are called directly; route and chat wiring is checked on source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAsk, askedCount, askedWhen, dayPart, rankRecommendations, recommendReply, DEFAULT_PICKS, STATUS_LABEL } from "../lib/plannerRecommend.js";
import { openStatusAt } from "../lib/plannerSameDay.js";
import { parseCurrentWeather, currentWeatherUrl } from "../lib/plannerWeather.js";
import { resolveSearchArea, AREA_STALE_MS } from "../lib/santaArea.js";
import { parsePlannerRequest } from "../lib/plannerParse.js";

let count = 0;
const ok = (v, m) => { assert.ok(v, m); count += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); count += 1; };

// ---- 1. what was asked -----------------------------------------------------------------------------------
eq(readAsk("give me one restaurant"), { kind: "picks", count: 1, countGiven: true, subject: "food" }, "one restaurant is one pick");
eq(readAsk("best brunch?"), { kind: "picks", count: DEFAULT_PICKS, countGiven: false, subject: "brunch" }, "no count: three brunch options");
eq(readAsk("plan my Saturday"), { kind: "plan" }, "plan my Saturday is a plan");
eq(readAsk("3 bars in St Pete"), { kind: "picks", count: 3, countGiven: true, subject: "bars" }, "3 bars is three bar picks");
eq(readAsk("one place for dinner").count, 1, "one place for dinner is one pick");
eq(readAsk("somewhere fun right now"), { kind: "picks", count: 3, countGiven: false, subject: "fun" }, "somewhere fun is a few fun picks, not a plan");
eq(readAsk("recommend a bar").count, 1, "recommend a bar is one");
eq(readAsk("top 5 beaches near Sarasota").count, 5, "top 5 is five");
eq(readAsk("a couple of coffee shops").count, 2, "a couple is two");
eq(readAsk("things to do in Orlando").kind, "picks", "things to do is picks");
eq(readAsk("build me a weekend in Tampa").kind, "plan", "build me a weekend is a plan");
eq(readAsk("make me an itinerary for Orlando").kind, "plan", "itinerary is a plan");
eq(readAsk("anything", { plannerIntent: true }).kind, "plan", "the planner reader's plan wins");
eq(readAsk("hi santa").kind, "other", "a greeting is not a pick request");
eq(readAsk("what is wayfind?").kind, "other", "a question about Wayfind is not a pick request");
eq(askedCount("dinner for 4 at 7"), null, "a party size is not a pick count");
eq(askedCount("2 restaurants for 6 people"), 2, "the pick count beats the party size");
eq(askedCount("brunch under $30"), null, "money is not a count");
eq(askedCount("12 bars"), 10, "counts are capped at 10");

// ---- 2. time ---------------------------------------------------------------------------------------------
eq(dayPart(8), "morning", "8 AM is morning"); eq(dayPart(13), "midday", "1 PM is midday"); eq(dayPart(19), "evening", "7 PM is evening"); eq(dayPart(1), "late", "1 AM is late");
eq(askedWhen("bars tonight", 14), { when: "tonight", hour: 19 }, "tonight asked at 2 PM checks hours at 7 PM");
eq(askedWhen("bars tonight", 21).when, "now", "tonight asked at 9 PM is now");
eq(askedWhen("brunch tomorrow", 10).when, "later", "tomorrow is later");

// ---- 3. open or closed, from verified hours only ---------------------------------------------------------
const NOW = Date.parse("2026-11-28T18:15:00Z"); // Saturday 1:15 PM Eastern
const week = (span) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => `${d}: ${span}`);
const place = (o) => ({ itemType: "place", lat: 27.4, lng: -82.45, hoursVerifiedAt: "2026-11-20T00:00:00Z", hoursSource: "google", ...o });
const lunch = place({ id: "a", name: "Noon Grill", type: "restaurant", tags: ["restaurant"], wfScore: 8.8, weekdayDescriptions: week("11:00 AM – 10:00 PM") });
const nightBar = place({ id: "b", name: "Late Bar", type: "bar", tags: ["bar"], wfScore: 9.4, weekdayDescriptions: week("5:00 PM – 2:00 AM") });
const noHours = place({ id: "c", name: "Mystery Kitchen", type: "restaurant", tags: ["restaurant"], wfScore: 9.0, weekdayDescriptions: null });
const beach = place({ id: "d", name: "Sunny Beach Park", type: "park", tags: ["beach", "park"], wfScore: 9.6, weekdayDescriptions: week("Open 24 hours") });
const museum = place({ id: "e", name: "Art Museum", type: "museum", tags: ["museum"], wfScore: 8.5, weekdayDescriptions: week("10:00 AM – 5:00 PM") });
eq(openStatusAt(lunch, NOW), "open", "a lunch place is open at 1:15 PM");
eq(openStatusAt(nightBar, NOW), "closed", "a 5 PM bar is closed at 1:15 PM");
eq(openStatusAt(nightBar, Date.parse("2026-11-29T00:30:00Z")), "open", "and open at 7:30 PM");
eq(openStatusAt(noHours, NOW), "unknown", "no hours is unknown, never open");
eq(openStatusAt({ ...lunch, hoursVerifiedAt: null }, NOW), "unknown", "unverified hours are unknown");
eq(openStatusAt({ ...lunch, businessStatus: "CLOSED_PERMANENTLY" }, NOW), "closed", "a closed business is closed");
// Wayfind's own verified hours with a "holiday hours may differ" note: an ordinary Saturday is still answered, a
// holiday eve stays unknown, a listed holiday closure is closed (live 2026-11-28: every pick read "Hours not listed").
const day7 = (d) => ({ open: { day: d, hour: 7, minute: 0 }, close: { day: d, hour: 14, minute: 30 } });
const owned = { schema: 1, periods: [0, 1, 2, 3, 4, 5, 6].map(day7), timezone: "America/New_York", source: "wayfind_editorial_hours", verifiedAt: "2026-11-13T15:00:00.000Z", expiresAt: null, specialHours: [{ date: "2026-11-26", closed: true }, { date: "2026-12-25", closed: true }], specialHoursUncertainty: "holiday_hours_may_differ" };
const breakfast = { id: "b1", name: "Breakfast Spot", itemType: "place", businessStatus: "OPERATIONAL", ownedHours: owned };
eq(openStatusAt(breakfast, Date.parse("2026-11-28T14:00:00Z")), "open", "owned hours with a holiday note: open Saturday 9 AM");
eq(openStatusAt(breakfast, Date.parse("2026-11-28T20:06:00Z")), "closed", "and closed Saturday 3:06 PM, after 2:30");
eq(openStatusAt(breakfast, Date.parse("2026-11-26T15:00:00Z")), "closed", "closed on the listed Thanksgiving closure");
eq(openStatusAt(breakfast, Date.parse("2026-12-24T15:00:00Z")), "unknown", "a holiday eve with no listed hours stays unknown");
eq(openStatusAt({ ...breakfast, ownedHours: { ...owned, verifiedAt: null } }, Date.parse("2026-11-28T14:00:00Z")), "unknown", "owned hours with no verified date are unknown");

// ---- 4. exactly the count, never closed now, weather and time aware ---------------------------------------
const origin = { lat: 27.4, lng: -82.45 };
const one = rankRecommendations([nightBar, lunch, noHours], { count: 1, subject: "food", nowMs: NOW, localHour: 13.25, origin });
eq(one.picks.length, 1, "one asked, one given");
eq(one.picks[0].name, "Noon Grill", "an open place beats one with unknown hours");
eq(one.picks[0].statusLabel, STATUS_LABEL.open, "it says Open now");
const bars = rankRecommendations([nightBar, lunch], { count: 3, subject: "bars", nowMs: NOW, localHour: 13.25, origin });
eq(bars.picks.length, 0, "a bar closed at 1 PM is never offered for now");
eq(bars.closedSkipped, 1, "and it is counted as skipped");
const tonight = rankRecommendations([nightBar], { count: 1, subject: "bars", nowMs: NOW, localHour: 13.25, origin, when: askedWhen("one bar tonight", 13.25) });
eq(tonight.picks.map((p) => p.status), ["open"], "asked for tonight, the bar is checked at 7 PM and is open");
const unknownOnly = rankRecommendations([noHours], { count: 1, subject: "food", nowMs: NOW, localHour: 13.25, origin });
eq(unknownOnly.picks[0].statusLabel, STATUS_LABEL.unknown, "unknown hours are said plainly, never guessed");
const dry = rankRecommendations([beach, museum], { count: 1, subject: "fun", nowMs: NOW, localHour: 13.25, origin, weather: { wet: false } });
const wet = rankRecommendations([beach, museum], { count: 1, subject: "fun", nowMs: NOW, localHour: 13.25, origin, weather: { wet: true } });
eq(dry.picks[0].name, "Sunny Beach Park", "dry: the top rated beach park");
eq(wet.picks[0].name, "Art Museum", "rain: indoor wins");
const far = place({ ...lunch, id: "f", name: "Far Grill", lat: 28.54, lng: -81.38 });
eq(rankRecommendations([far], { count: 1, subject: "food", nowMs: NOW, localHour: 13.25, origin }).picks.length, 0, "a place two hours away is not near you");
const five = rankRecommendations(Array.from({ length: 8 }, (_, i) => place({ ...lunch, id: "g" + i, name: "Grill " + i })), { count: 5, subject: "food", nowMs: NOW, localHour: 13.25, origin });
eq(five.picks.length, 5, "five asked, five given");

// ---- 5. the reply ----------------------------------------------------------------------------------------
const r1 = recommendReply({ picks: one.picks, count: 1, countGiven: true, subject: "food", areaLabel: "Lakewood Ranch", localHour: 13.25, dayIndex: 6, weather: { tempF: 73, words: "overcast", wet: false } });
ok(r1.startsWith("Here's one restaurant near Lakewood Ranch that's open now."), "one pick reads as one: " + r1);
ok(/It's Saturday 1:15 PM, 73° and overcast\./.test(r1), "it knows the day, time and weather: " + r1);
const r3 = recommendReply({ picks: unknownOnly.picks, count: 1, countGiven: true, subject: "food", areaLabel: "Tampa", localHour: 13.25, dayIndex: 6, weather: null });
ok(/hours aren't listed/i.test(r3), "unknown hours are called out");
const rWet = recommendReply({ picks: wet.picks, count: 1, countGiven: false, subject: "fun", areaLabel: "Tampa", localHour: 13.25, dayIndex: 6, weather: { tempF: 70, words: "rainy", wet: true } });
ok(/leaned indoors/.test(rWet), "rain is named as the reason");
const rNone = recommendReply({ picks: [], count: 3, countGiven: true, subject: "bars", areaLabel: "Tampa", localHour: 13.25, dayIndex: 6, closedSkipped: 2 });
ok(/couldn't find bars near Tampa open right now/.test(rNone) && /closed at this hour/.test(rNone), "an empty answer is honest: " + rNone);
const rShort = recommendReply({ picks: one.picks, count: 3, countGiven: true, subject: "food", areaLabel: "Tampa", localHour: 13.25, dayIndex: 6 });
ok(/You asked for 3/.test(rShort), "fewer than asked is said out loud");
ok(![r1, r3, rWet, rNone, rShort].some((t) => /[—–]/.test(t)), "replies have no dashes");

// ---- 6. weather now --------------------------------------------------------------------------------------
ok(/current=temperature_2m,precipitation,weather_code/.test(currentWeatherUrl({ lat: 27.4, lng: -82.4 })), "current conditions are read for the point");
eq(currentWeatherUrl(null), null, "no point, no weather call");
eq(parseCurrentWeather({ current: { temperature_2m: 72.6, weather_code: 3, precipitation: 0 }, daily: { precipitation_probability_max: [10] } }), { tempF: 73, words: "overcast", wet: false, rainPct: 10 }, "73 and overcast");
eq(parseCurrentWeather({ current: { temperature_2m: 70, weather_code: 63, precipitation: 1.2 } }).wet, true, "rain is wet");
eq(parseCurrentWeather({}), null, "no reading, no weather");

// ---- 7. the city the visitor picked ----------------------------------------------------------------------
const T = Date.parse("2026-11-28T18:00:00Z");
const pickedOld = resolveSearchArea({ text: "one place for dinner", storedPoint: { lat: 27.42, lng: -82.4, loc: "Lakewood Ranch, FL", manual: true, ts: T - AREA_STALE_MS * 3 }, nowMs: T });
eq([pickedOld.source, pickedOld.label], ["stored_location", "Lakewood Ranch, FL"], "a city picked weeks ago is still the visitor's city");
const autoOld = resolveSearchArea({ text: "one place for dinner", storedPoint: { lat: 27.42, lng: -82.4, loc: "Lakewood Ranch, FL", ts: T - AREA_STALE_MS * 3 }, nowMs: T });
eq(autoOld.source, "unknown", "an automatic point still goes stale");

// ---- 7b. "plan my Saturday" is that one Saturday, not a three day trip ----------------------------------
eq(parsePlannerRequest("plan my Saturday", { todayYmd: "2026-11-28", contextCity: "Lakewood Ranch, FL" }).dates.days, ["2026-11-28"], "plan my Saturday is one day");
eq(parsePlannerRequest("plan my Sunday in Tampa", { todayYmd: "2026-11-28" }).dates.days, ["2026-11-29"], "plan my Sunday is that Sunday");
eq(parsePlannerRequest("plan a weekend in Tampa", { todayYmd: "2026-11-28" }).dates.days.length, 2, "a weekend is still two days");

// ---- 8. wiring -------------------------------------------------------------------------------------------
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const route = strip(readFileSync(new URL("../app/api/planner/route.js", import.meta.url), "utf8"));
ok(route.indexOf("recommendPicks({") > 0 && route.indexOf("recommendPicks({") < route.indexOf('routed.kind === "reserve" || routed.kind === "find_food"'), "the server answers a pick request before any plan or reserve path");
ok(/mode: "recommend"/.test(route) && /planPrompt:/.test(route), "picks come back as picks with an optional plan prompt, never a proposed plan");
ok(/\.map\(\(c\) => withVerifiedHours\(c, nowMs\)\)/.test(route) && /resolveOwnedHoursSnapshot\(candidate\.id/.test(route), "every pick candidate gets Wayfind's verified hours when its search result had none");
ok(/fetchCurrentWeather\(area\)/.test(route) && /siteHourFloat\(now\)/.test(route) && /siteDayOfWeek\(now\)/.test(route), "the server reads weather, local time and weekday on every pick request");
ok(/body\?\.homeCity/.test(route) && /\|\| homeCity;/.test(route), "the picked city is the fallback for every request, plans included");
const sheet = strip(readFileSync(new URL("../app/components/WayfindPlannerSheet.js", import.meta.url), "utf8"));
ok(/homeCity: \(readStoredCenter\(\) \|\| \{\}\)\.loc/.test(sheet), "the chat sends the picked city");
ok(/routed\.kind === "find_food" && readAsk\(routed\.text \|\| text\)\.kind !== "picks"/.test(sheet), "a restaurant pick request goes to the server, not the three tables list");
const askSrc = readFileSync(new URL("../lib/plannerAsk.js", import.meta.url), "utf8");
ok(!/^\s*import\s/m.test(askSrc), "the ask reader imports nothing, so the browser can load it without server code");
ok(/from "\.\.\/\.\.\/lib\/plannerAsk\.js"/.test(sheet) && !/lib\/plannerRecommend/.test(sheet), "the chat sheet loads only the browser safe ask reader, never the server ranking");
ok(/role === "recs"/.test(sheet) && /onPlan=\{\(prompt\) => submitPlannerPrompt\(prompt\)\}/.test(sheet), "picks render with an optional plan button");
const recs = readFileSync(new URL("../app/components/PlannerRecs.js", import.meta.url), "utf8");
ok(/Turn this into a plan/.test(recs) && /Book a table/.test(recs), "the picks offer a plan and a table, as buttons");
ok(!/from "\.\/kit"/.test(recs), "the picks card stays out of the homepage card code, so the homepage download does not grow");

console.log(`test-planner-recommend: ${count} assertions passed`);
