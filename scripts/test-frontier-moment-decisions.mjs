#!/usr/bin/env node
// scripts/test-frontier-moment-decisions.mjs
//
// Execution guard for the Wayfind Frontier moment-of-decision upgrades:
//   1. Moment Search (all 5 canonical moment queries + Nov 8 user queries + negative controls + hours honesty)
//   2. singularQuery / singularWord & splitCityQualifier ("near", "in", comma-qualified names)
//   3. Active Event Logic (ACTIVE NOW / UPCOMING / ENDED across multi-week, recurring, beginning tonight, ending tonight, future, ended)
//   4. Weather Date-Night Logic (valid weather, slow >650ms weather, weather failure, marine failure, rain, poor beach conditions -> conservative Museums fallback)
//   5. Paid Landing Pages (/go/[city] across all 22 LANDING_CITIES + Jacksonville: zero Orlando copy/link/intent leakage)
//   6. Redirect Attribution (UTMs, loc/city/near, web click IDs, WayfindNative click-ID stripping, normal URLs, self-redirect loop guard)
//   7. Trip Filing (full street + ZIP, city/state only, covered FL city, unknown location, out-of-state location) & Map SantaDock clearance

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

import { parseMomentConstraints } from "../lib/searchConstraints.js";
import { resolveSearchIntent } from "../lib/searchIntent.js";
import { singularQuery } from "../lib/searchRank.js";
import { singularWord } from "../lib/searchFoodTerms.js";
import { splitCityQualifier } from "../lib/directSearch.js";
import { searchLibrary } from "../lib/unifiedSearch.js";
import { searchResultCards, eventActiveOnDay } from "../lib/searchCards.js";
import { GET as searchRoute } from "../app/api/search/route.js";
import { eventInWindow } from "../lib/eventsList.js";
import { eventVisitStatus } from "../lib/eventVisitFacts.js";
import { raceWithWeatherBudget } from "../app/api/date-night/route.js";
import { composeDateNightRails } from "../lib/dateNightIntent.js";
import { nowContext } from "../lib/nowContext.js";
import { LANDING_CITIES } from "../lib/landingCities.js";
import { resolveGoSlug } from "../lib/goShortlinks.js";
import { preserveRedirectParams } from "../lib/preserveRedirectParams.js";
import { parseCityState, tripMetaForPlace } from "../lib/trips.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SARASOTA = { lat: 27.3364, lng: -82.5307 };
const ORLANDO = { lat: 28.5384, lng: -81.3789 };
const QUIET = { WAYFIND_SEARCH_UNDERSTAND: "" };

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

// ── 1. Moment Search (all 5 canonical queries + Nov 8 user queries + negative controls) ──
{
  const q1 = resolveSearchIntent("something fun tonight near me", SARASOTA);
  eq([q1.recognized, q1.id, q1.city.slug, q1.constraints.when], [true, "things-to-do", "sarasota", "tonight"], "something fun tonight near me resolves to Sarasota things-to-do tonight");

  const q2 = resolveSearchIntent("cheap date tonight near Sarasota", {});
  eq([q2.recognized, q2.id, q2.city.slug, q2.constraints.budget, q2.constraints.when, q2.constraints.audience], [true, "date-night", "sarasota", "cheap", "tonight", "couple"], "cheap date tonight near Sarasota extracts city + budget + time + couple");

  const q3 = resolveSearchIntent("kids are bored and it's raining", SARASOTA);
  eq([q3.recognized, q3.id, q3.constraints.indoor, q3.constraints.weather, q3.constraints.audience], [true, "rainy", true, "rain", "family"], "kids are bored and it's raining resolves to rainy indoor family intent");

  const q4 = resolveSearchIntent("Christmas stuff open now", ORLANDO);
  eq([q4.recognized, q4.id, q4.result.href, q4.constraints.openNow, q4.constraints.when], [true, "christmas", "/christmas-in-florida", true, "now"], "Christmas stuff open now resolves to christmas with openNow=true");

  const q5 = resolveSearchIntent("3 hours with toddlers indoor", SARASOTA);
  eq([q5.recognized, q5.id, q5.constraints.ageGroup, q5.constraints.indoor, q5.constraints.durationMaxMin], [true, "rainy", "toddlers", true, 180], "3 hours with toddlers indoor parses 180m duration + toddlers + indoor");

  const q6 = resolveSearchIntent("Where can i go right now for something chritmas themed", SARASOTA);
  eq([q6.recognized, q6.id, q6.constraints.openNow], [true, "christmas", true], "real Nov 8 user feedback query resolves to open-now christmas");

  const q7 = resolveSearchIntent("Where can i go jiw?", SARASOTA);
  eq([q7.recognized, q7.id, q7.constraints.openNow], [true, "things-to-do", true], "real Nov 8 typo query ('jiw') resolves to immediate things-to-do");

  for (const neg of [
    "free things to do in gastonia",
    "free date night",
    "free pizza",
    "best tacos",
    "Rainforest Cafe",
    "Christmas Lane",
    "pizza",
    "top",
  ]) {
    eq(resolveSearchIntent(neg, {}).recognized, false, `negative control stays unrecognized: ${neg}`);
  }
  eq(parseMomentConstraints("free date night").intentId, null, "parseMomentConstraints never widens 'free'");

  // End-to-end /api/search route verification across all 5 canonical moment queries:
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
  process.env.WAYFIND_SEARCH_UNDERSTAND = "";
  try {
    const rFun = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=something%20fun%20tonight%20near%20me&lat=27.3364&lng=-82.5307"))).json();
    eq([rFun.status, rFun.results[0].city_slug, rFun.results[0].href], ["ok", "sarasota", "/things-to-do/sarasota"], "something fun tonight near me returns Sarasota things-to-do on /api/search");

    const rDate = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=cheap%20date%20tonight%20near%20Sarasota"))).json();
    eq([rDate.status, rDate.results[0].city_slug, rDate.results[0].href], ["ok", "sarasota", "/date-night?city=Sarasota"], "cheap date tonight near Sarasota leads with Sarasota date-night");

    const rRain = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=kids%20are%20bored%20and%20it%27s%20raining&lat=27.3364&lng=-82.5307"))).json();
    eq([rRain.status, rRain.results[0].city_slug, rRain.results[0].href], ["ok", "sarasota", "/things-to-do/sarasota"], "kids are bored and it's raining leads with Sarasota indoor/things-to-do");

    const rXmas = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=Christmas%20stuff%20open%20now&lat=28.5384&lng=-81.3789"))).json();
    eq([rXmas.status, rXmas.results[0].href], ["ok", "/christmas-in-florida"], "Christmas stuff open now leads with /christmas-in-florida");

    const rToddlers = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=3%20hours%20with%20toddlers%20indoor&lat=27.3364&lng=-82.5307"))).json();
    eq([rToddlers.status, rToddlers.results[0].city_slug, rToddlers.results[0].href], ["ok", "sarasota", "/things-to-do/sarasota"], "3 hours with toddlers indoor succeeds on /api/search");
  } finally {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.WAYFIND_SEARCH_UNDERSTAND;
  }

  // Card-level moment proofs across all 5 canonical queries (including hours honesty: no "Open now" without hours):
  const momentPool = [
    { place_id: "ringling", name: "The Ringling", lat: SARASOTA.lat, lng: SARASOTA.lng, category: "attractions", primary_type: "art_museum", tags: ["museum", "indoor"], signals: { rating: 4.8, reviews: 9800, priceNum: 2 } },
    { place_id: "mote", name: "Mote Marine Laboratory & Aquarium", lat: SARASOTA.lat, lng: SARASOTA.lng, category: "family", primary_type: "aquarium", tags: ["kids", "indoor", "toddlers"], signals: { rating: 4.6, reviews: 14200, priceNum: 2 } },
    { place_id: "toddler-play", name: "Little Sprouts Indoor Play", lat: SARASOTA.lat, lng: SARASOTA.lng, category: "family", primary_type: "amusement_center", tags: ["toddlers", "indoor"], signals: { rating: 4.8, reviews: 420, priceNum: 1 } },
    { place_id: "splurge", name: "Luxury Steakhouse", lat: SARASOTA.lat, lng: SARASOTA.lng, category: "food", primary_type: "steak_house", tags: ["dinner", "romantic"], signals: { rating: 4.9, reviews: 2500, priceNum: 4, dineIn: true, servesWine: true } },
    { place_id: "affordable-wine", name: "Cozy Wine & Tapas", lat: SARASOTA.lat, lng: SARASOTA.lng, category: "nightlife", primary_type: "wine_bar", tags: ["bars", "romantic"], signals: { rating: 4.7, reviews: 640, priceNum: 2, servesWine: true } },
    { place_id: "affordable-bistro", name: "Neighborhood Trattoria", lat: SARASOTA.lat, lng: SARASOTA.lng, category: "food", primary_type: "italian_restaurant", tags: ["dinner"], signals: { rating: 4.6, reviews: 510, priceNum: 2, dineIn: true, servesWine: true } },
  ];

  const funTonightCards = await searchResultCards({
    query: "something fun tonight near me",
    ...SARASOTA,
    today: "2026-11-12",
    places: momentPool,
    events: [{ event_id: "future-fest", slug: "dec-fest", event_name: "December Winter Fest", city: "Sarasota", category: "festival", start_date: "2026-12-10", end_date: "2026-12-12", lat: SARASOTA.lat, lng: SARASOTA.lng }],
    guides: [],
    env: QUIET,
    fetchImpl: async () => new Response("[]", { status: 200 }),
  });
  ok(funTonightCards.cards.length > 0, "something fun tonight near me returns non-empty valid inventory");
  ok(!funTonightCards.cards.some((c) => c.href === "/florida-events/dec-fest"), "something fun tonight near me excludes future-only December event");
  ok(funTonightCards.cards.every((c) => c.openNow !== true && !/open now/i.test(JSON.stringify(c))), "cards without structured hours never fabricate an 'Open now' claim");

  const rainyKidsCards = await searchResultCards({
    query: "kids are bored and it's raining",
    ...SARASOTA,
    today: "2026-11-12",
    places: momentPool,
    events: [],
    guides: [],
    env: QUIET,
    fetchImpl: async () => new Response("[]", { status: 200 }),
  });
  ok(rainyKidsCards.cards.some((c) => c.id === "mote" || c.id === "ringling"), "kids are bored and it's raining surfaces indoor museum/aquarium inventory");

  const cheapDate = await searchResultCards({
    query: "cheap date tonight near Sarasota",
    places: momentPool,
    events: [],
    guides: [],
    env: QUIET,
    fetchImpl: async () => new Response("[]", { status: 200 }),
  });
  const cheapIds = cheapDate.cards.map((c) => c.id);
  ok(cheapIds.includes("affordable-wine") && cheapIds.includes("affordable-bistro"), "cheap date tonight keeps <= $$ date rooms");
  ok(!cheapIds.includes("splurge"), "cheap date tonight excludes $$$$ steakhouse");

  const regularDate = await searchResultCards({
    query: "date night in Sarasota",
    places: momentPool,
    events: [],
    guides: [],
    env: QUIET,
    fetchImpl: async () => new Response("[]", { status: 200 }),
  });
  ok(regularDate.cards.some((c) => c.id === "splurge"), "unconstrained date night still includes the $$$$ steakhouse");

  const toddlerIndoor = await searchResultCards({
    query: "3 hours with toddlers indoor",
    ...SARASOTA,
    places: momentPool,
    events: [],
    guides: [],
    env: QUIET,
    fetchImpl: async () => new Response("[]", { status: 200 }),
  });
  ok(toddlerIndoor.cards.some((c) => c.id === "toddler-play"), "3 hours with toddlers indoor surfaces family:toddlers indoor venues");
}

// ── 2. singularQuery / singularWord & splitCityQualifier ───────────────────
{
  eq(singularQuery("christmas"), "christmas", "christmas is not mangled to christma");
  eq(singularQuery("tapas"), "tapas", "tapas is not mangled to tapa");
  eq(singularQuery("texas"), "texas", "texas is not mangled to texa");
  eq(singularQuery("pizzas"), "pizza", "pizzas still singularizes to pizza");
  eq(singularQuery("fajitas"), "fajita", "fajitas still singularizes to fajita");
  eq(singularWord("christmas"), "christmas", "singularWord keeps christmas intact");
  eq(singularWord("tapas"), "tapas", "singularWord keeps tapas intact");
  eq(singularWord("tacos"), "taco", "singularWord still folds tacos -> taco");

  const nearCity = splitCityQualifier("sushi near Sarasota");
  eq([nearCity.text, nearCity.city?.name], ["sushi", "Sarasota"], "splitCityQualifier strips trailing 'near' before city");
  const inCity = splitCityQualifier("ramen in Orlando, FL");
  eq([inCity.text, inCity.city?.name], ["ramen", "Orlando"], "splitCityQualifier strips trailing 'in' before city");
  const commaCity = splitCityQualifier("Dolce & Bake, Orlando, FL");
  eq([commaCity.text, commaCity.city?.name], ["dolce and bake", "Orlando"], "splitCityQualifier preserves comma-qualified business names");
}

// ── 3. Active Event Logic (all 6 states: multi-week, recurring, beginning tonight, ending tonight, future, ended) ──
{
  const thuAfternoon = new Date("2026-11-12T21:00:00Z"); // Thu Nov 12, 2026 4:00 PM EST
  const thuEvening = new Date("2026-11-13T00:00:00Z");   // Thu Nov 12, 2026 7:00 PM EST
  const thuLate = new Date("2026-11-13T03:30:00Z");      // Thu Nov 12, 2026 10:30 PM EST
  const friEvening = new Date("2026-11-14T00:00:00Z");   // Fri Nov 13, 2026 7:00 PM EST

  // (a) Multi-week active event (with hours -> ACTIVE NOW; without hours -> In season, NEVER "Open now"):
  const multiWeekWithHours = {
    event_id: "mw-lights",
    slug: "orlando-holiday-lights",
    event_name: "Orlando Holiday Lights Walk",
    city: "Orlando",
    category: "holiday",
    start_date: "2026-11-08",
    end_date: "2026-12-31",
    date: "2026-11-08",
    endDate: "2026-12-31",
    timezone: "America/New_York",
    visit_schedule: { timezone: "America/New_York", weekday_hours: { 0: [["17:00", "22:00"]], 1: [["17:00", "22:00"]], 2: [["17:00", "22:00"]], 3: [["17:00", "22:00"]], 4: [["17:00", "22:00"]], 5: [["17:00", "22:00"]], 6: [["17:00", "22:00"]] } },
    lat: ORLANDO.lat,
    lng: ORLANDO.lng,
  };
  const multiWeekNoHours = {
    start_date: "2026-11-08",
    end_date: "2026-12-31",
    timezone: "America/New_York",
  };
  ok(eventInWindow(multiWeekWithHours, "tonight", thuEvening), "multi-week active event is in tonight window");
  eq(eventVisitStatus(multiWeekWithHours, thuEvening)?.label, "Open now", "multi-week event with active session hours is ACTIVE NOW ('Open now')");
  eq(eventVisitStatus(multiWeekNoHours, thuEvening)?.label, "In season", "multi-week event without session hours says 'In season' — never fabricates 'Open now'");

  // (b) Recurring Fri-Sun event (select nights):
  const recurringWeekendOnly = {
    event_id: "rec-train",
    slug: "weekend-christmas-train",
    event_name: "Christmas Train Nights",
    city: "Orlando",
    category: "holiday",
    start_date: "2026-11-01",
    end_date: "2026-12-27",
    date: "2026-11-01",
    endDate: "2026-12-27",
    timezone: "America/New_York",
    visit_schedule: { timezone: "America/New_York", weekday_hours: { 0: [["17:00", "21:00"]], 1: [], 2: [], 3: [], 4: [], 5: [["17:00", "22:00"]], 6: [["17:00", "22:00"]] } },
    lat: ORLANDO.lat,
    lng: ORLANDO.lng,
  };
  ok(!eventInWindow(recurringWeekendOnly, "tonight", thuEvening), "recurring Fri-Sun event is excluded from Thursday tonight");
  ok(eventInWindow(recurringWeekendOnly, "this-weekend", thuEvening), "recurring Fri-Sun event IS included in this-weekend");
  eq(eventVisitStatus(recurringWeekendOnly, thuEvening)?.label, "Closed now", "recurring Fri-Sun event on Thursday reports Closed now (upcoming Nov 13)");
  eq(eventVisitStatus(recurringWeekendOnly, friEvening)?.label, "Open now", "recurring Fri-Sun event on Friday 7pm reports Open now (ACTIVE NOW)");

  // (c) Event beginning tonight (Thu Nov 12):
  const beginningTonight = {
    event_id: "begin-tonight",
    slug: "opening-night-festival",
    event_name: "Opening Night Tree Lighting",
    city: "Orlando",
    category: "holiday",
    start_date: "2026-11-12",
    end_date: "2026-11-12",
    date: "2026-11-12",
    endDate: "2026-11-12",
    start_time: "18:00",
    end_time: "22:00",
    timezone: "America/New_York",
    lat: ORLANDO.lat,
    lng: ORLANDO.lng,
  };
  ok(eventInWindow(beginningTonight, "tonight", thuAfternoon), "event beginning tonight is in tonight window");
  eq(eventVisitStatus(beginningTonight, thuAfternoon)?.label, "Opens today", "event beginning tonight at 4pm is UPCOMING ('Opens today')");
  eq(eventVisitStatus(beginningTonight, thuEvening)?.label, "Open now", "event beginning tonight at 7pm is ACTIVE NOW ('Open now')");

  // (d) Event ending tonight (multi-day run ending Thu Nov 12):
  const endingTonight = {
    event_id: "ending-tonight",
    slug: "closing-night-market",
    event_name: "Autumn Night Market Finale",
    city: "Orlando",
    category: "holiday",
    start_date: "2026-11-05",
    end_date: "2026-11-12",
    date: "2026-11-05",
    endDate: "2026-11-12",
    occurrence_dates: ["2026-11-05", "2026-11-12"],
    start_time: "17:30",
    end_time: "21:30",
    timezone: "America/New_York",
    lat: ORLANDO.lat,
    lng: ORLANDO.lng,
  };
  ok(eventInWindow(endingTonight, "tonight", thuEvening), "event ending tonight is included in tonight on its final night");
  eq(eventVisitStatus(endingTonight, thuEvening)?.label, "Open now", "event ending tonight is ACTIVE NOW during its final session");
  eq(eventVisitStatus(endingTonight, thuLate)?.label, "Closed today", "event ending tonight transitions out of Open now once final session ends at 9:30pm");
  ok(!eventInWindow(endingTonight, "tonight", friEvening), "event ending Thu night is excluded from Friday tonight");
  eq(eventVisitStatus(endingTonight, friEvening)?.label, "Ended", "event ending Thu night is ENDED on Friday");

  // (e) Future event (Dec 12):
  const futureEvent = {
    event_id: "dec-only-parade",
    slug: "december-christmas-parade",
    event_name: "December Christmas Boat Parade",
    city: "Orlando",
    category: "holiday",
    start_date: "2026-12-12",
    end_date: "2026-12-12",
    date: "2026-12-12",
    endDate: "2026-12-12",
    timezone: "America/New_York",
    lat: ORLANDO.lat,
    lng: ORLANDO.lng,
  };
  ok(!eventInWindow(futureEvent, "tonight", thuEvening), "future Dec 12 event is excluded from tonight");
  ok(eventInWindow(futureEvent, "this-month", thuEvening), "future Dec 12 event IS included in this-month (+31d)");
  eq(eventVisitStatus(futureEvent, thuEvening)?.tone, "soon", "future Dec 12 event has UPCOMING ('soon') status");

  // (f) Ended event (Nov 1-10):
  const endedEvent = {
    event_id: "ended-fest",
    slug: "ended-fall-fest",
    event_name: "Early November Harvest Fest",
    city: "Orlando",
    category: "holiday",
    start_date: "2026-11-01",
    end_date: "2026-11-10",
    date: "2026-11-01",
    endDate: "2026-11-10",
    timezone: "America/New_York",
    lat: ORLANDO.lat,
    lng: ORLANDO.lng,
  };
  ok(!eventInWindow(endedEvent, "tonight", thuEvening), "ended event is excluded from tonight");
  ok(!eventInWindow(endedEvent, "this-weekend", thuEvening), "ended event is excluded from this-weekend");
  ok(!eventInWindow(endedEvent, "this-month", thuEvening), "ended event is excluded from this-month");
  eq([eventVisitStatus(endedEvent, thuEvening)?.label, eventVisitStatus(endedEvent, thuEvening)?.expired], ["Ended", true], "ended event has ENDED (expired=true) status");

  // Search card + library openNow gating across all event classes:
  const xmasEvents = [multiWeekWithHours, recurringWeekendOnly, beginningTonight, endingTonight, futureEvent, endedEvent];
  const openNowCards = await searchResultCards({
    query: "Christmas stuff open now",
    ...ORLANDO,
    today: "2026-11-12",
    places: [],
    guides: [],
    events: xmasEvents,
    env: QUIET,
    fetchImpl: async () => new Response("[]", { status: 200 }),
  });
  const openHrefs = openNowCards.cards.map((c) => c.href);
  ok(openHrefs.includes("/florida-events/orlando-holiday-lights"), "multi-week active event is in 'Christmas stuff open now'");
  ok(openHrefs.includes("/florida-events/opening-night-festival"), "event beginning tonight is in 'Christmas stuff open now'");
  ok(!openHrefs.includes("/florida-events/weekend-christmas-train"), "recurring Fri-Sun event is excluded on Thursday from 'Christmas stuff open now'");
  ok(!openHrefs.includes("/florida-events/december-christmas-parade"), "future Dec 12 event is excluded from 'Christmas stuff open now'");
  ok(!openHrefs.includes("/florida-events/ended-fall-fest"), "ended Nov 10 event is excluded from 'Christmas stuff open now'");

  const allXmasCards = await searchResultCards({
    query: "christmas",
    ...ORLANDO,
    today: "2026-11-12",
    places: [],
    guides: [],
    events: xmasEvents,
    env: QUIET,
    fetchImpl: async () => new Response("[]", { status: 200 }),
  });
  ok(allXmasCards.cards.some((c) => c.href === "/florida-events/december-christmas-parade"), "plain 'christmas' search still surfaces upcoming December events");
  eq(eventActiveOnDay({ kind: "event", startDate: null, endDate: null, occurrenceDates: null }, "2026-11-12"), null, "undated fixture event returns null (unknown), never false");

  const libOpenNow = await searchLibrary({
    query: "Christmas stuff open now",
    ...ORLANDO,
    today: "2026-11-12",
    env: QUIET,
    fetchImpl: async () => new Response("[]", { status: 200 }),
    extraDocuments: [
      { kind: "event", title: "Christmas Open Tonight", href: "/florida-events/open-tonight", city_slug: "orlando", start_date: "2026-11-10", end_date: "2026-12-30", keywords: ["christmas"] },
      { kind: "event", title: "Christmas Starting Dec 15", href: "/florida-events/dec-15", city_slug: "orlando", start_date: "2026-12-15", end_date: "2026-12-24", keywords: ["christmas"] },
      { kind: "event", title: "Christmas Ended Nov 5", href: "/florida-events/nov-5", city_slug: "orlando", start_date: "2026-11-01", end_date: "2026-11-05", keywords: ["christmas"] },
    ],
  });
  const libHrefs = libOpenNow.results.map((r) => r.href);
  ok(libHrefs.includes("/florida-events/open-tonight"), "searchLibrary keeps active Christmas event");
  ok(!libHrefs.includes("/florida-events/dec-15"), "searchLibrary drops upcoming Dec 15 Christmas event when openNow is requested");
  ok(!libHrefs.includes("/florida-events/nov-5"), "searchLibrary drops ended Nov 5 Christmas event");
}

// ── 4. Weather Date-Night Logic (650ms budget + all 6 weather/marine states) ──
{
  const datePool = [
    { id: "siesta-beach", name: "Siesta Key Beach", rating: 4.9, reviews: 38000, distMi: 4.2, primaryType: "beach", types: ["beach", "natural_feature"] },
    { id: "ringling-museum", name: "The Ringling Museum of Art", rating: 4.8, reviews: 14500, distMi: 3.5, primaryType: "art_museum", types: ["art_museum", "museum"] },
  ];

  async function evalDateNightWeather({ wxDelayMs = 10, weatherPayload = null, wxThrows = false, marinePayload = { show: true }, marineThrows = false, budgetMs = 650 }) {
    let wxSignals = { weatherKnown: false, outdoorOK: false, beachShow: false };
    const wxReady = new Promise((resolve) => {
      const t = setTimeout(resolve, wxDelayMs);
      if (t.unref) t.unref();
    }).then(() => {
      const weather = wxThrows ? null : weatherPayload;
      const beachCond = marineThrows ? { show: false } : marinePayload;
      const ctx = nowContext({ ...SARASOTA, city: "Sarasota", weather, hour: 18 });
      wxSignals = {
        weatherKnown: !!(ctx.weather && ctx.weather.known),
        outdoorOK: ctx.outdoorOK === true,
        beachShow: !!(beachCond && beachCond.show === true),
      };
    });
    const t0 = Date.now();
    await raceWithWeatherBudget(wxReady, budgetMs);
    const elapsed = Date.now() - t0;
    const composed = composeDateNightRails(datePool, wxSignals);
    return { elapsed, wxSignals, beachOk: composed.beachOk, railIds: composed.rails.map((r) => r.id), hidden: composed.hidden };
  }

  const clearWarmWx = {
    current: { temperature_2m: 76, apparent_temperature: 76, relative_humidity_2m: 62, weather_code: 1, wind_speed_10m: 7, dew_point_2m: 62 },
    daily: { precipitation_probability_max: [10] },
  };
  const rainyWx = {
    current: { temperature_2m: 72, apparent_temperature: 72, relative_humidity_2m: 90, weather_code: 63, wind_speed_10m: 14, dew_point_2m: 69 },
    daily: { precipitation_probability_max: [85] },
  };

  // (a) Valid clear weather + calm marine -> Beach shown, Museums hidden:
  const validCase = await evalDateNightWeather({ wxDelayMs: 15, weatherPayload: clearWarmWx, marinePayload: { show: true } });
  eq([validCase.beachOk, validCase.railIds, validCase.hidden.includes("museums")], [true, ["beach"], true], "valid clear evening + calm marine enables Date Night Beach rail");

  // (b) Slow weather response (> budget) -> bounded wait, conservative fallback to Museums:
  const slowCase = await evalDateNightWeather({ wxDelayMs: 2000, weatherPayload: clearWarmWx, marinePayload: { show: true }, budgetMs: 45 });
  ok(slowCase.elapsed < 400, `slow weather response is bounded by budget (${slowCase.elapsed}ms)`);
  eq([slowCase.beachOk, slowCase.railIds, slowCase.hidden.includes("beach")], [false, ["museums"], true], "slow weather falls back conservatively to Museums");

  // (c) Weather failure -> conservative fallback to Museums:
  const wxFailCase = await evalDateNightWeather({ wxDelayMs: 5, wxThrows: true, marinePayload: { show: true } });
  eq([wxFailCase.beachOk, wxFailCase.railIds], [false, ["museums"]], "weather failure falls back conservatively to Museums");

  // (d) Marine failure -> conservative fallback to Museums:
  const marineFailCase = await evalDateNightWeather({ wxDelayMs: 5, weatherPayload: clearWarmWx, marineThrows: true });
  eq([marineFailCase.beachOk, marineFailCase.railIds], [false, ["museums"]], "marine failure falls back conservatively to Museums");

  // (e) Rain -> conservative fallback to Museums:
  const rainCase = await evalDateNightWeather({ wxDelayMs: 5, weatherPayload: rainyWx, marinePayload: { show: true } });
  eq([rainCase.beachOk, rainCase.railIds], [false, ["museums"]], "rainy weather falls back conservatively to Museums");

  // (f) Poor beach conditions (marine show: false, e.g. high surf / red tide / cold wind) -> Museums:
  const poorBeachCase = await evalDateNightWeather({ wxDelayMs: 5, weatherPayload: clearWarmWx, marinePayload: { show: false } });
  eq([poorBeachCase.beachOk, poorBeachCase.railIds], [false, ["museums"]], "poor beach conditions fall back conservatively to Museums");
}

// ── 5. Paid Landing Pages (/go/[city] across all 22 LANDING_CITIES + Jacksonville) ──
{
  const paidPath = path.join(ROOT, "app/components/PaidLanding.js");
  const { default: PaidLanding } = await loadComponent(paidPath, ROOT);
  const goRouteSrc = readFileSync(path.join(ROOT, "app/go/[city]/page.js"), "utf8");
  ok(goRouteSrc.includes('citySlug === "orlando"'), "app/go/[city]/page.js scopes DEV_PREVIEW strictly to citySlug === 'orlando'");

  const samplePlaces = [
    { id: "p1", name: "Bayfront Botanical Gardens", rating: 4.8, reviews: 9500, distMi: 1.1, openNow: true, types: ["park"] },
    { id: "p2", name: "Coastal Art Museum", rating: 4.7, reviews: 6200, distMi: 2.3, openNow: null, types: ["museum"] },
    { id: "p3", name: "Harbor Sunset Cruise", rating: 4.9, reviews: 3100, distMi: 1.8, openNow: true, types: ["tourist_attraction"] },
  ];

  // Sweep EVERY published /go/[city] city (including Tampa, Sarasota, Orlando, Miami) + Jacksonville component render:
  const citiesToVerify = [
    ...Object.entries(LANDING_CITIES).map(([slug, city]) => ({ slug, city, publishedGo: true })),
    { slug: "jacksonville", city: { name: "Jacksonville", state: "FL", lat: 30.3322, lng: -81.6557 }, publishedGo: false },
  ];

  for (const { slug, city, publishedGo } of citiesToVerify) {
    const html = renderToStaticMarkup(React.createElement(PaidLanding, { city, places: samplePlaces }));
    ok(html.includes(`Your ${city.name} plan starts here.`), `/go/${slug} renders '${city.name}' headline`);
    ok(html.includes(`${city.name} icons`), `/go/${slug} renders '${city.name} icons' intent chip`);
    ok(html.includes(`Or explore the full ${city.name} guide`), `/go/${slug} renders '${city.name}' skip guide copy`);
    if (slug !== "orlando") {
      ok(!/orlando|epcot|lake eola/i.test(html), `/go/${slug} contains zero Orlando copy, image src, alt text, or intent leakage`);
    } else {
      ok(html.includes("orlando-epcot-portrait.jpg") && html.includes("Orlando icons"), "/go/orlando preserves supplied Orlando hero art and intent");
    }

    const resolved = resolveGoSlug(slug);
    if (publishedGo) {
      eq([resolved.kind, resolved.city.name], ["city", city.name], `/go/${slug} resolves to ${city.name} in goShortlinks`);
    } else {
      // Jacksonville is in EVERGREEN_CITIES (zero-spend organic only), so resolveGoSlug fails closed (404).
      eq(resolved.kind, "not-found", `/go/${slug} stays closed-namespace not-found per zero-spend evergreen contract`);
    }
  }
}

// ── 6. Redirect Attribution (UTMs, loc/city/near, click IDs, native strip, loop prevention) ──
{
  const prevNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (iPhone) Safari/605" },
      configurable: true,
      writable: true,
    });
    const fullWeb = preserveRedirectParams(
      "/?place=ChIJ123#photos",
      "?utm_source=ig&utm_medium=paid_social&utm_campaign=xmas&utm_content=reel1&utm_term=lights&loc=Sarasota&city=Sarasota&near=34236&fbclid=FB_9&ttclid=TT_8&gclid=GC_7&gbraid=GB_6&wbraid=WB_5&msclkid=MS_4&evil=https://bad.example&email=a@b.com",
      "/s/abc123",
    );
    eq(
      fullWeb,
      "/?place=ChIJ123&utm_source=ig&utm_medium=paid_social&utm_campaign=xmas&utm_content=reel1&utm_term=lights&loc=Sarasota&city=Sarasota&near=34236&fbclid=FB_9&ttclid=TT_8&gclid=GC_7&gbraid=GB_6&wbraid=WB_5&msclkid=MS_4#photos",
      "web redirect preserves all UTMs, loc/city/near, and web click IDs + hash while dropping URLs/emails/unknowns",
    );
    eq(preserveRedirectParams("/?place=ChIJ123&city=Orlando", "?city=Tampa&utm_campaign=xmas", "/l/date-night"), "/?place=ChIJ123&city=Orlando&utm_campaign=xmas", "existing destination params are never overwritten");
    eq(preserveRedirectParams("https://example.com/out", "?utm_source=ig", "/s/abc"), "https://example.com/out", "external URLs are untouched");
    eq(preserveRedirectParams("/guides/sarasota", "", "/s/abc"), "/guides/sarasota", "normal internal destination URL without query params is untouched");

    // Self-redirect loop prevention:
    eq(preserveRedirectParams("/s/abc", "?utm_source=ig&city=Tampa", "/s/abc"), "/?utm_source=ig&city=Tampa", "self-redirect to same pathname rewrites safely to '/' with preserved attribution");
    eq(preserveRedirectParams("/s/abc/?list=foo", "", "/s/abc"), "/", "self-redirect with trailing slash and no incoming search rewrites safely to '/'");

    // Inside WayfindNative iOS shell: click IDs are NEVER forwarded.
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (iPhone) WayfindNative/1.0" },
      configurable: true,
      writable: true,
    });
    const nativeOut = preserveRedirectParams(
      "/?place=ChIJ123",
      "?utm_source=ig&loc=Tampa&city=Tampa&near=33602&gclid=G_1&fbclid=FB_1&ttclid=TT_1&gbraid=GB_1&wbraid=WB_1&msclkid=MS_1",
      "/s/abc123",
    );
    eq(nativeOut, "/?place=ChIJ123&utm_source=ig&loc=Tampa&city=Tampa&near=33602", "WayfindNative strips all 6 restricted click IDs while keeping UTM + loc/city/near");
  } finally {
    if (prevNav) Object.defineProperty(globalThis, "navigator", prevNav);
  }
}

// ── 7. Trip Filing (all 5 categories) & Map SantaDock clearance ─────────────
{
  // (a) Full street + ZIP:
  eq(tripMetaForPlace({ address: "1234 Main St, Sarasota, FL 34236, USA" }), { key: "fl_sarasota", city: "Sarasota", state: "FL" }, "full street + ZIP files into Sarasota, FL");
  // (b) City/state only:
  eq(tripMetaForPlace({ address: "Tampa, FL, USA" }), { key: "fl_tampa", city: "Tampa", state: "FL" }, "city/state address files into Tampa, FL");
  eq(tripMetaForPlace({ locality: "Sarasota", state: "FL" }), { key: "fl_sarasota", city: "Sarasota", state: "FL" }, "locality + state files into Sarasota, FL");
  // (c) Covered Florida city:
  eq(tripMetaForPlace({ city: "Orlando" }), { key: "fl_orlando", city: "Orlando", state: "FL" }, "covered Florida city resolves Orlando, FL");
  eq(tripMetaForPlace({ postalCity: "Dunedin", lat: 28.0197, lng: -82.7718 }), { key: "fl_dunedin", city: "Dunedin", state: "FL" }, "structured postalCity + FL coordinates resolves Dunedin, FL");
  // (d) Unknown location (must NEVER guess Florida):
  eq(tripMetaForPlace({}), { key: "xx_unsorted", city: "Unsorted", state: null }, "empty stop stays Unsorted");
  eq(tripMetaForPlace({ address: "123 Main St" }), { key: "xx_unsorted", city: "Unsorted", state: null }, "street-only address without city/state stays Unsorted");
  eq(tripMetaForPlace({ address: "Downtown", lat: 27.3364, lng: -82.5307 }), { key: "xx_unsorted", city: "Unsorted", state: null }, "vague single-token 'Downtown' address stays Unsorted even with FL coords");
  eq(tripMetaForPlace({ address: "London, UK" }), { key: "xx_unsorted", city: "Unsorted", state: null }, "foreign address stays Unsorted");
  eq(tripMetaForPlace({ city: "Venice", country: "IT" }), { key: "xx_unsorted", city: "Unsorted", state: null }, "Venice, IT never files into Venice, FL");
  // (e) Out-of-state location (must file into actual state or Unsorted, NEVER Florida):
  eq(tripMetaForPlace({ address: "6801 Hollywood Blvd, Hollywood, CA 90028, USA" }), { key: "ca_hollywood", city: "Hollywood", state: "CA" }, "Hollywood, CA street + ZIP files into ca_hollywood, never fl_hollywood");
  eq(tripMetaForPlace({ city: "Hollywood", state: "CA" }), { key: "ca_hollywood", city: "Hollywood", state: "CA" }, "Hollywood, CA structured fields file into ca_hollywood");
  eq(tripMetaForPlace({ city: "Hollywood", lat: 34.0928, lng: -118.3287 }), { key: "xx_unsorted", city: "Unsorted", state: null }, "Hollywood with California coords never files into Hollywood, FL");
  eq(tripMetaForPlace({ locality: "Austin", regionCode: "TX" }), { key: "tx_austin", city: "Austin", state: "TX" }, "out-of-state locality + regionCode files into tx_austin");
  eq(tripMetaForPlace({ address: "Asheville, NC" }), { key: "nc_asheville", city: "Asheville", state: "NC" }, "out-of-state city/state only files into nc_asheville");

  const mapSrc = readFileSync(path.join(ROOT, "app/components/screens/Map.js"), "utf8");
  ok(mapSrc.includes('html.wf-santa-docked .wf-scrollarea[data-analytics-page="map"] { padding-bottom: calc(78px + env(safe-area-inset-bottom)) !important; }') && mapSrc.includes('@media (min-width: 1024px) { html.wf-santa-docked .wf-scrollarea[data-analytics-page="map"] { padding-bottom: calc(118px + env(safe-area-inset-bottom)) !important; } }'), "MapScreen coordinates container padding-bottom with SantaDock lift (78px mobile/tablet, 118px desktop) so all overlays and attribution bands rise together");
  const bottom76Count = (mapSrc.match(/\bbottom:\s*76\b/g) || []).length;
  eq(bottom76Count, 4, "empty/recovery pill, place preview, event preview, and Browse-list pill all sit at bottom: 76 without double-offsetting");

  const homeSrc = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
  ok(!/^import\s+\{[^}]*resolveSearchIntent[^}]*\}\s+from/m.test(homeSrc), "app/home.js lazy-loads resolveSearchIntent out of the eager homepage bundle");
  ok(homeSrc.includes('await import("../lib/searchIntent.js")'), "app/home.js dynamically imports resolveSearchIntent inside runSearch");
  ok(homeSrc.includes('item.kind === "place" || (!options.placeIntent && isSafeSearchHref(item.href))'), "home.js includes safe non-place library results in fallback search choices");
}

console.log(`test-frontier-moment-decisions: OK — ${checks} assertions passed`);
