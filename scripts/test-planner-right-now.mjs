// Locks the planner's right now layer and its gap report (owner order
// 2026-11-27): the forecast can only lean a plan indoors from a real number it
// names, gap rows never keep a visitor's words or personal data, the end of day
// report never states a lead as a fact, and the web search lead lookup pays its
// full per call fee out of the capped AI engine budget. No network: every I/O
// path runs on an injected fake.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  forecastUrl, dailyByDate, weatherLean, weatherNote, leanParsed, fetchForecast, RAIN_LEAN_PCT, HEAT_LEAN_F,
} from "../lib/plannerWeather.js";
import {
  gapRow, cleanGapName, cleanRequestedCity, uncoveredCityMessage, summarizeGaps, reportText, pickLeadUrl, readLeadAnswer, leadQuestion, logGap,
} from "../lib/plannerGaps.js";
import { engineSearch, searchUnits, citedUrls, worstCaseCallUsd, SEARCH_CALL_USD, ENGINE_SKU, engineDailyCap } from "../lib/aiEngine.js";

let count = 0;
const ok = (v, m) => { assert.ok(v, m); count += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); count += 1; };

// ── forecast ──────────────────────────────────────────────────────────────
const tampa = { slug: "tampa", name: "Tampa", lat: 27.9506, lng: -82.4572 };
ok(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=27\.9506&longitude=-82\.4572&/.test(forecastUrl(tampa)), "the forecast is read for the city's own coordinates");
eq(forecastUrl({ lat: "x", lng: 1 }), null, "bad coordinates ask for nothing");
eq(forecastUrl(null), null, "no city asks for nothing");
const json = { daily: { time: ["2026-11-28", "2026-11-29", "bad"], precipitation_probability_max: [70, 10, 50], apparent_temperature_max: [80, 97, 70] } };
const byDate = dailyByDate(json);
eq(byDate["2026-11-28"], { rainPct: 70, feelsHighF: 80 }, "daily values are read by date");
eq(Object.keys(byDate).length, 2, "a malformed date is dropped");
eq(dailyByDate({ daily: { time: ["2026-11-28"], precipitation_probability_max: [180] } })["2026-11-28"].rainPct, null, "an impossible rain chance is dropped, never trusted");
eq(dailyByDate(null), {}, "no forecast reads as nothing");
eq(weatherLean(byDate, ["2026-11-28"]).lean, "rain", `${RAIN_LEAN_PCT}% or more rain leans indoors`);
eq(weatherLean(byDate, ["2026-11-29"]).lean, "heat", `a feels like high of ${HEAT_LEAN_F}°F or more leans indoors`);
eq(weatherLean({ "2026-11-30": { rainPct: 49, feelsHighF: 94 } }, ["2026-11-30"]).lean, null, "below both lines changes nothing");
eq(weatherLean(byDate, ["2026-12-25"]), null, "a day with no forecast says nothing");
eq(weatherLean(byDate, ["2026-11-29", "2026-11-28"]).date, "2026-11-28", "a weekend plan acts on its wettest day first");
const rainNote = weatherNote({ lean: "rain", date: "2026-11-28", rainPct: 70 }, "Tampa", "2026-11-27");
eq(rainNote, "Rain is likely in Tampa tomorrow (70% chance), so this plan leans indoors.", "the note names the forecast number it acted on");
ok(/today/.test(weatherNote({ lean: "heat", date: "2026-11-27", feelsHighF: 97 }, "Tampa", "2026-11-27")), "a same day note says today");
ok(/on Monday/.test(weatherNote({ lean: "rain", date: "2026-11-30", rainPct: 60 }, "Tampa", "2026-11-27")), "a later day is named by weekday");
eq(weatherNote({ lean: null }, "Tampa", "2026-11-27"), null, "no lean, no note");
ok(!/[—–]/.test(rainNote), "the note has no dashes");
const parsed = { destination: tampa, dates: { days: ["2026-11-28"], dayCount: 1 }, preferences: { interests: ["food"], kids: 2, partyType: "family", budget: "cheap" } };
eq(leanParsed(parsed, { lean: "rain" }).preferences.interests, ["food", "indoors"], "a lean adds indoors and keeps the visitor's interests");
ok(leanParsed(parsed, { lean: null }) === parsed, "no lean leaves the request untouched");
eq(parsed.preferences.interests, ["food"], "the original request is never mutated");
eq(await fetchForecast(tampa, async () => { throw new Error("down"); }), {}, "a failed forecast fetch changes nothing");
eq(await fetchForecast(tampa, async () => ({ ok: false })), {}, "a forecast error changes nothing");
eq((await fetchForecast(tampa, async () => ({ ok: true, json: async () => json })))["2026-11-29"].feelsHighF, 97, "a good forecast is read");

// ── gap rows: privacy line ────────────────────────────────────────────────
eq(cleanGapName("Bern's Steak House"), "Bern's Steak House", "a place name is kept");
eq(cleanGapName("call me at 813-555-0100"), null, "a phone number is never kept");
eq(cleanGapName("jane@example.com's party"), null, "an email is never kept");
eq(cleanGapName("www.example.com"), null, "a link is never kept");
eq(cleanGapName("Zoo Lights (no open day in this plan)"), "Zoo Lights", "the planner's note is stripped from a name");
eq(cleanGapName("ab"), null, "a fragment is dropped");
eq(cleanRequestedCity("Pensacola"), "Pensacola", "an uncovered city is kept");
eq(cleanRequestedCity("Port St. Lucie"), "Port St. Lucie", "a city with a dot is kept");
eq(cleanRequestedCity("my house at 12 Main St"), null, "an address is never kept");
eq(cleanRequestedCity("x".repeat(41)), null, "a long string is dropped");
ok(/We couldn't find Gainesville among the Florida cities Wayfind plans for yet\./.test(uncoveredCityMessage("Gainesville")), "a named but uncovered city is told so, not asked for a city again");
ok(/check the spelling/.test(uncoveredCityMessage("Gainesville")) && !/[—–]/.test(uncoveredCityMessage("Gainesville")), "the message allows for a misspelling and has no dashes");
eq(uncoveredCityMessage(null), null, "no city name falls back to asking for one");
eq(uncoveredCityMessage("Florida"), null, "the state alone is not a city");
eq(uncoveredCityMessage("12 Main St"), null, "an address is never echoed back");
const full = gapRow({ mode: "notes", outcome: "OK", parsed, stopCount: 5, dayCount: 1, unmatched: [] });
eq(full, null, "a full plan with nothing missing is not logged");
const named = gapRow({ mode: "notes", outcome: "OK", parsed, stopCount: 5, dayCount: 1, unmatched: ["Bern's Steak House", "call 813-555-0100"], weatherLean: "rain" });
eq(named.unmatched, ["Bern's Steak House"], "only clean names are logged");
eq(named.outcome, "OK", "a full plan with a missing name stays OK");
eq([named.metro, named.kids, named.party, named.budget, named.weather_lean], ["tampa", true, "family", "cheap", "rain"], "the structured reading is kept");
eq(Object.keys(named).sort(), ["budget", "day_count", "interests", "kids", "metro", "mode", "outcome", "party", "requested_city", "stop_count", "unmatched", "weather_lean"], "a gap row has no field for the visitor's words, IP or account");
eq(gapRow({ mode: "picks", outcome: "OK", parsed, stopCount: 2, dayCount: 1 }).outcome, "THIN", "under three stops a day is a thin plan");
eq(gapRow({ mode: "notes", outcome: "NEED_CITY", requestedCity: "Pensacola" }).requested_city, "Pensacola", "an uncovered city is logged");
eq(gapRow({ mode: "x", outcome: "WEIRD" }).outcome, "UNAVAILABLE", "an unknown outcome is stored as unavailable");
eq(gapRow({ mode: "x", outcome: "NO_PLAN" }).mode, "picks", "an unknown mode is stored as picks");
const sent = [];
ok(await logGap(named, { env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }, fetchImpl: async (u, o) => { sent.push([u, JSON.parse(o.body)]); return { ok: true }; } }), "a gap row is stored");
eq(sent[0][0], "https://x.supabase.co/rest/v1/wf_planner_gaps", "gap rows go to their own table");
eq(await logGap(named, { env: {} }), false, "no database means nothing stored, no error");
eq(await logGap(named, { env: { SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k" }, fetchImpl: async () => { throw new Error("x"); } }), false, "a failed store never throws");
eq(await logGap(null), false, "nothing to store stores nothing");

// ── the end of day report ─────────────────────────────────────────────────
const rows = [
  { outcome: "NEED_CITY", requested_city: "Pensacola", interests: [], unmatched: [] },
  { outcome: "NEED_CITY", requested_city: "Pensacola", interests: [], unmatched: [] },
  { outcome: "OK", metro: "tampa", interests: ["food"], unmatched: ["Bern's Steak House"] },
  { outcome: "OK", metro: "tampa", interests: ["food"], unmatched: ["bern's steak house"], weather_lean: "rain" },
  { outcome: "THIN", metro: "sarasota", interests: ["indoors"], kids: true, unmatched: [] },
];
const sum = summarizeGaps(rows);
eq(sum.requests, 5, "every row is counted");
eq(sum.uncoveredCities, [{ city: "Pensacola", count: 2 }], "uncovered cities are counted");
eq(sum.missingPlaces, [{ name: "Bern's Steak House", metro: "tampa", count: 2 }], "a missing place is counted across spellings");
eq(sum.thinSpots, [{ spot: "sarasota · indoors · kids", count: 1 }], "thin spots name the city and what was wanted");
eq(sum.weatherLeans, { rain: 1 }, "weather leans are counted");
const leads = [{ name: "Bern's Steak House", answer: "yes", url: "https://bernssteakhouse.com/", official: true }];
const text = reportText("2026-11-27", sum, leads);
ok(text.startsWith("Planner gap report for 2026-11-27: 5 requests needed attention."), "the report opens with the count");
ok(/Pensacola \(2\)/.test(text), "the report lists uncovered cities");
ok(/Bern's Steak House near tampa, asked 2x\. Lead: https:\/\/bernssteakhouse\.com\//.test(text), "a lead shows its page");
ok(/Leads are web pages to check, not facts/.test(text), "the report says leads are not facts");
ok(!/[—–]/.test(text), "the report has no dashes");
ok(/not the official site/.test(reportText("d", sum, [{ name: "Bern's Steak House", answer: "yes", url: "https://www.yelp.com/biz/x", official: false }])), "a non official page is labeled as such");
ok(/Web check found no match/.test(reportText("d", sum, [{ name: "Bern's Steak House", answer: "no" }])), "a no answer is reported as no match");
ok(reportText("d", summarizeGaps([]), []).startsWith("Planner gap report for d: 0 requests"), "an empty day still makes a report");
eq(pickLeadUrl(["https://www.yelp.com/biz/a", "https://bernssteakhouse.com/?utm_source=x"]), { url: "https://bernssteakhouse.com/", official: true }, "the place's own site wins over a review site and loses tracking tags");
eq(pickLeadUrl(["https://www.tripadvisor.com/x"]), { url: "https://www.tripadvisor.com/x", official: false }, "a review site alone is a lead, not official");
eq(pickLeadUrl(["http://insecure.example", "javascript:alert(1)"]), { url: null, official: false }, "only https pages are kept");
eq([readLeadAnswer("YES, it is on Main St."), readLeadAnswer("No such place."), readLeadAnswer("Maybe")], ["yes", "no", "unclear"], "the yes or no is read from the first word only");
ok(leadQuestion("Zoo Lights", "Tampa").includes('"Zoo Lights" in or near Tampa, Florida'), "the question names the place and city");
ok(leadQuestion("Zoo Lights", null).includes("in Florida"), "no city asks about Florida");

// ── web search pays its full fee from the capped budget ───────────────────
const units = searchUnits({});
ok(units * worstCaseCallUsd() >= SEARCH_CALL_USD, "one search takes at least its per call fee in grants");
const W = { OPENAI_ENGINE_WEEKLY_USD: "80", OPENAI_API_KEY: "sk-test-key-0000000000" };
const takes = [];
const reqs = [];
const fakeSearch = async (req, lane) => {
  reqs.push({ req, lane });
  return new Response(JSON.stringify({ choices: [{ message: { content: "YES, it exists.", annotations: [{ type: "url_citation", url_citation: { url: "https://bernssteakhouse.com/" } }, { type: "url_citation", url_citation: { url: "http://x.example" } }] } }] }), { status: 200 });
};
let s = await engineSearch(leadQuestion("Bern's Steak House", "Tampa"), { env: W, request: fakeSearch, take: async (sku, cap, n) => { takes.push([sku, cap, n]); return true; } });
eq([s.ok, s.text, s.urls], [true, "YES, it exists.", ["https://bernssteakhouse.com/"]], "a search returns its answer and only https citations");
ok(/^openai_engine_d\d{8}$/.test(takes[0][0]) && takes[0][1] === engineDailyCap(W) && takes[0][2] === units, "the daily grant takes every unit of the search");
eq([takes[1][0], takes[1][2]], [ENGINE_SKU, units - 1], "the monthly lane takes the rest beyond the request's own grant");
eq(reqs[0].req.model, "gpt-4o-mini-search-preview", "searches use the search model");
eq(reqs[0].req.body.web_search_options, { search_context_size: "low" }, "searches use the cheapest context size");
s = await engineSearch("is there a place for jane@example.com", { env: W, request: fakeSearch, take: async () => true });
eq(s.reason, "personal_data_in_prompt:email", "a search with personal data never leaves");
s = await engineSearch("x".repeat(601), { env: W, request: fakeSearch, take: async () => true });
eq(s.reason, "invalid_request", "an oversized search is refused");
s = await engineSearch("Is there a zoo in Tampa?", { env: W, request: fakeSearch, take: async () => false });
eq(s.reason, "daily_cap_reached_or_ledger_unavailable", "a spent day makes no search");
s = await engineSearch("Is there a zoo in Tampa?", { env: { OPENAI_API_KEY: "k" }, request: fakeSearch, take: async () => true });
eq(s.reason, "missing_or_invalid_OPENAI_ENGINE_BUDGET", "no budget, no search");
eq(reqs.length, 1, "refused searches reached nothing");
eq(citedUrls({ choices: [{ message: {} }] }), [], "a reply with no citations has no urls");

// ── wiring: the planner and the report use these pieces ───────────────────
const route = readFileSync(new URL("../app/api/plan-my-day/route.js", import.meta.url), "utf8");
ok(/weatherFor\(parsedNotes\.parsed, today\)/.test(route) && /weatherFor\(parsed0, today\)/.test(route), "both planner paths read the forecast");
ok((route.match(/recordGap\(gapRow\(/g) || []).length >= 3, "the planner logs gaps on its failure paths");
ok(/uncoveredCityMessage\(askedCity\) \|\| parsedNotes\.clarify/.test(route), "the planner says when a named city is not covered");
ok(/const \{ _gap, \.\.\.rest \} = v/.test(route), "the private gap field never leaves in a cached answer");
ok(/waitUntil\(p\)/.test(route), "gap logging runs after the response");
const cron = readFileSync(new URL("../app/api/cron/planner-gap-report/route.js", import.meta.url), "utf8");
ok(/MAX_LEADS = 8/.test(cron) && /engineSearch\(leadQuestion/.test(cron), "the report looks up at most 8 leads through the capped engine");
ok(!/wf_inventory|wf_events|wf_place_photo/.test(cron), "the report never writes places, events or photos");
const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
ok(vercel.crons.some((c) => c.path === "/api/cron/planner-gap-report"), "the report runs on a schedule");
const ui = readFileSync(new URL("../app/plan-my-day/ItineraryBuilder.js", import.meta.url), "utf8");
ok(/wf_planner_prefs_v1/.test(ui) && /try \{ window\.localStorage\.setItem\(PREFS_KEY/.test(ui), "the last request is remembered in this browser only, safely");
ok(/state\.weather && state\.weather\.note/.test(ui), "the weather note is shown when the plan leaned");
ok((ui.match(/setMode\("(notes|picks)"\); setError\(""\)/g) || []).length === 2, "switching tabs clears an old error");

console.log(`test-planner-right-now: ${count} assertions passed`);
