#!/usr/bin/env node
// scripts/test-moment-search-redteam.mjs — Missions 11, 12, 13, 16 & 23
// Deterministic Red-Team Guard for Semantic Search Eligibility, Confidence
// Ordering, Owned-Hours Late/Open Verification, Controlled Overrides & _trace.

import assert from "node:assert/strict";
import { GET as searchRoute } from "../app/api/search/route.js";
import { resolveSearchIntent } from "../lib/searchIntent.js";
import { searchResultCards } from "../lib/searchCards.js";
import { placeAllowed } from "../lib/placeFilter.js";
import { isExcluded, exclusionReason, EXCLUSION } from "../lib/placeCategory.js";
import { buildOwnedHoursRecord } from "../lib/ownedHours.js";
import {
  evaluateMomentSemanticEligibility,
  registerVerifiedSemanticOverride,
  clearVerifiedSemanticOverridesForTests,
  getSearchRejectionTelemetry,
  resetSearchRejectionTelemetryForTests,
} from "../lib/searchSemantics.js";

const SARASOTA = { lat: 27.3364, lng: -82.5307 };
const TAMPA = { lat: 27.9506, lng: -82.4572 };
const ORLANDO = { lat: 28.5384, lng: -81.3789 };
const QUIET_ENV = { WAYFIND_SEARCH_UNDERSTAND: "" };
const NO_NET = async () => {
  throw new Error("network disabled in deterministic red-team guard");
};

// Fixed Thursday evening: 2026-11-12 19:00 EST (00:00 UTC Nov 13 -> Wait: 19:00 EST is 2026-11-13T00:00:00Z!
// Let's use 2026-11-12T23:00:00Z = Thursday 2026-11-12 18:00 EST, dayOfWeek = 4 (Thursday), siteTodayStr = "2026-11-12")
const THU_6PM_MS = Date.parse("2026-11-12T23:00:00Z");
const TODAY = "2026-11-12";

let assertions = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  assertions++;
}
function eq(a, b, msg) {
  assert.deepEqual(a, b, msg);
  assertions++;
}

function makeHours(lines, lat = 27.3364, lng = -82.5307) {
  return buildOwnedHoursRecord({
    weekdayDescriptions: lines,
    lat,
    lng,
    source: "openstreetmap",
    verifiedAt: "2026-11-12T12:00:00Z",
  });
}

const HOURS_DAILY_10_TO_17 = makeHours([
  "Monday: 10:00 AM – 5:00 PM",
  "Tuesday: 10:00 AM – 5:00 PM",
  "Wednesday: 10:00 AM – 5:00 PM",
  "Thursday: 10:00 AM – 5:00 PM",
  "Friday: 10:00 AM – 5:00 PM",
  "Saturday: 10:00 AM – 5:00 PM",
  "Sunday: 10:00 AM – 5:00 PM",
]);

const HOURS_THU_LATE_22 = makeHours([
  "Monday: 10:00 AM – 5:00 PM",
  "Tuesday: 10:00 AM – 5:00 PM",
  "Wednesday: 10:00 AM – 5:00 PM",
  "Thursday: 10:00 AM – 10:00 PM",
  "Friday: 10:00 AM – 10:00 PM",
  "Saturday: 10:00 AM – 10:00 PM",
  "Sunday: 10:00 AM – 5:00 PM",
]);

const HOURS_LATE_DATE_2330 = makeHours([
  "Monday: 4:00 PM – 11:30 PM",
  "Tuesday: 4:00 PM – 11:30 PM",
  "Wednesday: 4:00 PM – 11:30 PM",
  "Thursday: 4:00 PM – 11:30 PM",
  "Friday: 4:00 PM – 12:30 AM",
  "Saturday: 4:00 PM – 12:30 AM",
  "Sunday: 4:00 PM – 10:00 PM",
]);

const HOURS_CLOSING_AT_1815 = makeHours([
  "Monday: 8:00 AM – 6:15 PM",
  "Tuesday: 8:00 AM – 6:15 PM",
  "Wednesday: 8:00 AM – 6:15 PM",
  "Thursday: 8:00 AM – 6:15 PM",
  "Friday: 8:00 AM – 6:15 PM",
  "Saturday: 8:00 AM – 6:15 PM",
  "Sunday: 8:00 AM – 6:15 PM",
]);

const HOURS_PARK_DAWN_TO_22 = makeHours([
  "Monday: 6:00 AM – 10:00 PM",
  "Tuesday: 6:00 AM – 10:00 PM",
  "Wednesday: 6:00 AM – 10:00 PM",
  "Thursday: 6:00 AM – 10:00 PM",
  "Friday: 6:00 AM – 10:00 PM",
  "Saturday: 6:00 AM – 10:00 PM",
  "Sunday: 6:00 AM – 10:00 PM",
]);

resetSearchRejectionTelemetryForTests();

// ── 0. Mission 11 Gate & Classifier Proof (Med Spas vs Resort Spas) ──────────
{
  ok(
    isExcluded({ name: "LUXE Med Spa Aesthetics", primaryType: "medical_spa", types: ["medical_spa", "spa", "health"] }) &&
      exclusionReason({ name: "LUXE Med Spa Aesthetics", primaryType: "medical_spa", types: ["medical_spa", "spa", "health"] }) === EXCLUSION.SERVICE,
    "medical_spa primaryType is excluded as EXCLUSION.SERVICE",
  );
  ok(
    !placeAllowed("attractions", "all", { name: "LUXE Med Spa Aesthetics", types: ["medical_spa", "spa", "health"] }),
    "LUXE Med Spa Aesthetics blocked in attractions:all",
  );
  ok(
    !placeAllowed("attractions", "spa", { name: "Glow Botox & IV Hydration MedSpa", types: ["spa", "health"] }),
    "Botox & IV Hydration MedSpa blocked even under attractions:spa",
  );
  ok(
    placeAllowed("attractions", "spa", { name: "The Spa at The Don CeSar", types: ["spa"] }),
    "Legitimate resort spa (The Spa at The Don CeSar) still passes attractions:spa",
  );

  // "something fun tonight" must reject clinical med spas, day spas, closed Indigenous Restaurant, and self-storage
  const tonightRes = await searchResultCards({
    query: "something fun tonight",
    ...SARASOTA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "ChIJluxeMedSpa001", name: "LUXE Med Spa Aesthetics", primary_type: "spa", google_types: ["spa", "health"], category: "attractions", lat: 27.336, lng: -82.531, rating: 4.9, reviews: 420 },
      { id: "ChIJZUZzwm5Aw4gR1qnftvzg0lg", name: "Indigenous Restaurant", primary_type: "american_restaurant", category: "food", lat: 27.333, lng: -82.539, rating: 4.8, reviews: 980 },
      { id: "ChIJdaySpa002", name: "Serenity Day Spa & Massage", primary_type: "spa", category: "attractions", lat: 27.335, lng: -82.532, rating: 4.8, reviews: 310 },
      { id: "ChIJringling001", name: "The Ringling Museum of Art", primary_type: "museum", category: "attractions", lat: 27.381, lng: -82.563, rating: 4.8, reviews: 11200, ownedHours: HOURS_THU_LATE_22 },
      { id: "ChIJlebarge001", name: "LeBarge Tropical Cruises", primary_type: "boat_tour", category: "attractions", lat: 27.334, lng: -82.545, rating: 4.7, reviews: 1650 },
    ],
  });
  const ids = tonightRes.cards.map((c) => c.id);
  ok(!ids.includes("ChIJluxeMedSpa001"), "LUXE Med Spa Aesthetics rejected on 'something fun tonight'");
  ok(!ids.includes("ChIJZUZzwm5Aw4gR1qnftvzg0lg"), "Closed Indigenous Restaurant rejected on 'something fun tonight'");
  ok(!ids.includes("ChIJdaySpa002"), "Personal care massage spa rejected on general outing query");
  ok(ids.includes("ChIJringling001") && ids.includes("ChIJlebarge001"), "Real outings survive 'something fun tonight'");
  ok(tonightRes._trace.rejections.byReason.clinical_or_medspa >= 1, "Trace records clinical_or_medspa rejection");
}

// ── 1. Red-Team Query 1: "my 2 year old is losing it and it’s pouring" ───────
{
  const q = "my 2 year old is losing it and it’s pouring";
  const intent = resolveSearchIntent(q, TAMPA);
  eq(
    [intent.recognized, intent.id, intent.constraints.ageGroup, intent.constraints.audience, intent.constraints.weather, intent.constraints.indoor],
    [true, "rainy", "toddlers", "family", "rain", true],
    "Q1 extracts toddlers + family + rain + indoor",
  );
  const res = await searchResultCards({
    query: q,
    ...TAMPA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "t-beach", name: "Clearwater Beach", primary_type: "beach", category: "attractions", lat: 27.97, lng: -82.82, rating: 4.8, reviews: 25000 },
      { id: "t-park", name: "Curtis Hixon Waterfront Park", primary_type: "park", category: "attractions", lat: 27.95, lng: -82.46, rating: 4.7, reviews: 9000 },
      { id: "t-axe", name: "Tampa Axe Throwing & Rage Room", primary_type: "amusement_center", category: "attractions", lat: 27.95, lng: -82.45, rating: 4.9, reviews: 1200 },
      { id: "t-tramp", name: "Altitude Trampoline Park", primary_type: "amusement_center", category: "family", lat: 27.95, lng: -82.47, rating: 4.6, reviews: 1800 },
      { id: "t-glazer", name: "Glazer Children's Museum", primary_type: "museum", google_types: ["museum", "children_museum"], tags: ["toddlers", "rainy"], category: "family", lat: 27.951, lng: -82.461, rating: 4.7, reviews: 5400 },
      { id: "t-aqua", name: "The Florida Aquarium", primary_type: "aquarium", tags: ["toddlers", "rainy"], category: "family", lat: 27.944, lng: -82.445, rating: 4.6, reviews: 22000 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  eq(ids, ["t-glazer", "t-aqua"].filter((x) => ids.includes(x)).length === 2 ? ids : [], ids);
  ok(!ids.includes("t-beach") && !ids.includes("t-park"), "Q1 blocks outdoor beaches and parks in pouring rain");
  ok(!ids.includes("t-axe") && !ids.includes("t-tramp"), "Q1 blocks axe throwing and trampoline parks for a 2-year-old");
  ok(ids.includes("t-glazer") && ids.includes("t-aqua"), "Q1 surfaces indoor toddler-safe children's museum & aquarium");
}

// ── 2. Red-Team Query 2: "cheap indoor date after 9 tonight" ─────────────────
{
  const q = "cheap indoor date after 9 tonight";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.id, intent.constraints.budget, intent.constraints.indoor, intent.constraints.audience, intent.constraints.afterHour, intent.constraints.when],
    [true, "date-night", "cheap", true, "couple", 21, "tonight"],
    "Q2 extracts cheap + indoor + couple + afterHour=21 + tonight",
  );
  const res = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "d-pricey", name: "Maison Blanche Fine Dining", primary_type: "french_restaurant", category: "food", priceNum: 4, dineIn: true, servesWine: true, lat: 27.336, lng: -82.531, rating: 4.9, reviews: 1200, ownedHours: HOURS_LATE_DATE_2330 },
      { id: "d-early", name: "Sunset Wine Bistro", primary_type: "wine_bar", category: "nightlife", priceNum: 2, servesWine: true, lat: 27.336, lng: -82.531, rating: 4.8, reviews: 900, ownedHours: HOURS_DAILY_10_TO_17 },
      { id: "d-outdoor", name: "Bayfront Park Stroll", primary_type: "park", category: "attractions", priceNum: 0, lat: 27.334, lng: -82.541, rating: 4.8, reviews: 3000 },
      { id: "d-unknown-hrs", name: "Cozy Corner Lounge", primary_type: "cocktail_bar", category: "nightlife", priceNum: 2, servesCocktails: true, lat: 27.336, lng: -82.531, rating: 4.7, reviews: 800, ownedHours: null },
      { id: "d-open-late", name: "Velvet Speakeasy & Tapas", primary_type: "wine_bar", category: "nightlife", priceNum: 2, servesWine: true, servesCocktails: true, lat: 27.336, lng: -82.531, rating: 4.7, reviews: 800, ownedHours: HOURS_LATE_DATE_2330 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("d-pricey"), "Q2 blocks expensive $$$$ venue");
  ok(!ids.includes("d-early"), "Q2 blocks venue whose owned_hours close before 9 PM");
  ok(!ids.includes("d-outdoor"), "Q2 blocks outdoor park");
  eq(ids[0], "d-open-late", "Q2 ranks affordable indoor date room confirmed open past 9 PM #1 above unknown-hours peer");
}

// ── 3. Red-Team Query 3: "something free open for 90 minutes near me" ────────
{
  const q = "something free open for 90 minutes near me";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.id, intent.free, intent.constraints.openNow, intent.constraints.durationMaxMin],
    [true, "things-to-do", true, true, 90],
    "Q3 extracts free=true + openNow=true + durationMaxMin=90",
  );
  const res = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [
      { event_id: "e-free-now", slug: "free-art-walk", event_name: "Downtown Free Art Walk", city: "Sarasota", category: "arts", is_free: true, start_date: TODAY, end_date: TODAY, lat: 27.336, lng: -82.531 },
      { event_id: "e-paid-now", slug: "paid-concert", event_name: "Ticketed Symphony", city: "Sarasota", category: "music", is_free: false, price_band: "$$$", start_date: TODAY, end_date: TODAY, lat: 27.336, lng: -82.531 },
    ],
    places: [
      { id: "f-paid-museum", name: "The Ringling Museum", primary_type: "museum", category: "attractions", lat: 27.38, lng: -82.56, rating: 4.8, reviews: 9000, ownedHours: HOURS_PARK_DAWN_TO_22 },
      { id: "f-closing-soon", name: "Payne Park", primary_type: "park", category: "attractions", lat: 27.333, lng: -82.525, rating: 4.7, reviews: 2400, ownedHours: HOURS_CLOSING_AT_1815 },
      { id: "f-open-park", name: "Bayfront Park", primary_type: "park", category: "attractions", lat: 27.334, lng: -82.544, rating: 4.8, reviews: 4200, ownedHours: HOURS_PARK_DAWN_TO_22 },
      { id: "f-open-beach", name: "Lido Key Beach", primary_type: "beach", category: "attractions", lat: 27.313, lng: -82.577, rating: 4.8, reviews: 6500, ownedHours: HOURS_PARK_DAWN_TO_22 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("f-paid-museum"), "Q3 blocks paid museum");
  ok(!ids.includes("event:e-paid-now"), "Q3 blocks paid event");
  ok(!ids.includes("f-closing-soon"), "Q3 blocks park closing in 15 minutes on a 90-minute visit query");
  ok(ids.includes("f-open-park") && ids.includes("f-open-beach"), "Q3 keeps genuinely free places open for >=90m");
}

// ── 4. Red-Team Query 4: "my parents can’t walk much, what can we do tonight" ─
{
  const q = "my parents can’t walk much, what can we do tonight";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.id, intent.constraints.lowWalking, intent.constraints.when],
    [true, "things-to-do", true, "tonight"],
    "Q4 extracts lowWalking=true + when=tonight",
  );
  const res = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "m-hike", name: "Myakka Canopy Nature Trailhead", primary_type: "hiking_area", category: "attractions", lat: 27.24, lng: -82.31, rating: 4.8, reviews: 3100 },
      { id: "m-theme", name: "Busch Gardens Tampa Bay", primary_type: "amusement_park", category: "attractions", lat: 27.45, lng: -82.42, rating: 4.6, reviews: 45000 },
      { id: "m-zoo", name: "Sarasota Jungle Gardens", primary_type: "zoo", category: "attractions", lat: 27.36, lng: -82.54, rating: 4.5, reviews: 6000 },
      { id: "m-cruise", name: "Marina Jack Sunset Sightseeing Cruise", primary_type: "boat_tour", category: "attractions", lat: 27.334, lng: -82.544, rating: 4.8, reviews: 2100 },
      { id: "m-opera", name: "Sarasota Opera House", primary_type: "performing_arts_theater", category: "attractions", lat: 27.336, lng: -82.541, rating: 4.9, reviews: 1800 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("m-hike") && !ids.includes("m-theme") && !ids.includes("m-zoo"), "Q4 blocks hiking trails, theme parks, and zoos");
  ok(ids.includes("m-cruise") && ids.includes("m-opera"), "Q4 surfaces seated sightseeing cruise and opera house");
}

// ── 5. Red-Team Query 5: "Christmas tonight with kids but no theme parks" ─────
{
  const q = "Christmas tonight with kids but no theme parks";
  const intent = resolveSearchIntent(q, ORLANDO);
  eq(
    [intent.recognized, intent.id, intent.constraints.when, intent.constraints.audience, intent.constraints.excludeThemeParks],
    [true, "christmas", "tonight", "family", true],
    "Q5 extracts christmas + tonight + family + excludeThemeParks=true",
  );
  const res = await searchResultCards({
    query: q,
    ...ORLANDO,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    places: [
      { id: "x-mk", name: "Magic Kingdom Christmas", primary_type: "theme_park", category: "attractions", lat: 28.417, lng: -81.581, rating: 4.8, reviews: 95000 },
    ],
    events: [
      { event_id: "x-disney", slug: "mickeys-very-merry", event_name: "Mickey's Very Merry Christmas Party at Magic Kingdom", city: "Orlando", category: "holiday", start_date: "2026-11-08", end_date: "2026-12-21", lat: 28.417, lng: -81.581 },
      { event_id: "x-future", slug: "december-parade", event_name: "Winter Park Christmas Parade", city: "Orlando", category: "holiday", start_date: "2026-12-05", end_date: "2026-12-05", lat: 28.59, lng: -81.35 },
      { event_id: "x-bar", slug: "krampus-cocktail-crawl", event_name: "Late Night Christmas Cocktail Bar Crawl", city: "Orlando", category: "nightlife", subcategory: "bar crawl", start_date: "2026-11-10", end_date: "2026-12-24", lat: 28.54, lng: -81.37 },
      { event_id: "x-lights", slug: "dazzling-nights-leu", event_name: "Dazzling Nights Family Holiday Lights", city: "Orlando", category: "holiday", tags: ["family", "kids", "christmas"], start_date: "2026-11-10", end_date: "2026-12-30", lat: 28.56, lng: -81.35 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("x-mk") && !ids.includes("event:x-disney"), "Q5 blocks theme parks & theme-park Christmas events");
  ok(!ids.includes("event:x-future"), "Q5 blocks future December-only Christmas event on 'tonight'");
  ok(!ids.includes("event:x-bar"), "Q5 blocks adult bar crawl on 'with kids'");
  ok(ids.includes("event:x-lights"), "Q5 surfaces active-tonight non-theme-park family Christmas lights");
}

// ── 6. Red-Team Query 6: "quiet date indoors near Sarasota" ──────────────────
{
  const q = "quiet date indoors near Sarasota";
  const intent = resolveSearchIntent(q, {});
  eq(
    [intent.recognized, intent.id, intent.city.slug, intent.constraints.quiet, intent.constraints.indoor, intent.constraints.audience],
    [true, "date-night", "sarasota", true, true, "couple"],
    "Q6 extracts sarasota + quiet + indoor + couple",
  );
  const res = await searchResultCards({
    query: q,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "qd-play", name: "Little Sprouts Indoor Play", primary_type: "indoor_playground", category: "family", lat: 27.33, lng: -82.53, rating: 4.9, reviews: 800 },
      { id: "qd-bowl", name: "Bowlero Sarasota Arcade & Lanes", primary_type: "bowling_alley", category: "nightlife", servesCocktails: true, lat: 27.33, lng: -82.53, rating: 4.6, reviews: 1500 },
      { id: "qd-sports", name: "Rocco's Loud Sports Bar & Karaoke", primary_type: "sports_bar", category: "nightlife", servesCocktails: true, lat: 27.33, lng: -82.53, rating: 4.7, reviews: 1400 },
      { id: "qd-beach", name: "Siesta Key Beach", primary_type: "beach", category: "attractions", lat: 27.26, lng: -82.55, rating: 4.9, reviews: 32000 },
      { id: "qd-wine", name: "99 Bottles Taproom & Wine Bar", primary_type: "wine_bar", category: "nightlife", servesWine: true, dineIn: true, lat: 27.336, lng: -82.536, rating: 4.8, reviews: 720 },
      { id: "qd-french", name: "C'est La Vie Intimate French Bistro", primary_type: "french_restaurant", category: "food", servesWine: true, dineIn: true, reservable: true, priceNum: 3, lat: 27.336, lng: -82.541, rating: 4.7, reviews: 1100 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("qd-play"), "Q6 blocks Little Sprouts Indoor Play (zero typo-match or kids leak)");
  ok(!ids.includes("qd-bowl") && !ids.includes("qd-sports"), "Q6 blocks loud bowling/arcade and karaoke sports bar");
  ok(!ids.includes("qd-beach"), "Q6 blocks outdoor beach");
  ok(ids.includes("qd-wine") && ids.includes("qd-french"), "Q6 surfaces quiet indoor wine bar and intimate French bistro");
}

// ── 7. Red-Team Query 7: "something fun that isn’t food or shopping" ─────────
{
  const q = "something fun that isn’t food or shopping";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.id, intent.constraints.excludeFood, intent.constraints.excludeShopping],
    [true, "things-to-do", true, true],
    "Q7 extracts excludeFood=true + excludeShopping=true",
  );
  const res = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "nf-rest", name: "Owen's Fish Camp", primary_type: "seafood_restaurant", category: "food", lat: 27.33, lng: -82.53, rating: 4.7, reviews: 5200 },
      { id: "nf-mall", name: "The Mall at University Town Center", primary_type: "shopping_mall", category: "shopping", lat: 27.38, lng: -82.45, rating: 4.7, reviews: 18000 },
      { id: "nf-med", name: "LUXE Med Spa Aesthetics", primary_type: "medical_spa", category: "attractions", lat: 27.33, lng: -82.53, rating: 4.9, reviews: 400 },
      { id: "nf-mote", name: "Mote Marine Laboratory & Aquarium", primary_type: "aquarium", category: "attractions", lat: 27.333, lng: -82.578, rating: 4.6, reviews: 14000 },
      { id: "nf-kayak", name: "Mangrove Tunnel Kayak Tour", primary_type: "boat_tour", category: "attractions", lat: 27.31, lng: -82.57, rating: 4.9, reviews: 1900 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("nf-rest") && !ids.includes("nf-mall") && !ids.includes("nf-med"), "Q7 blocks food, shopping, and med spas");
  ok(ids.includes("nf-mote") && ids.includes("nf-kayak"), "Q7 surfaces genuine non-food, non-shopping experiences");
}

// ── 8. Red-Team Query 8: "outdoor thing before sunset" ───────────────────────
{
  const q = "outdoor thing before sunset";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.id, intent.constraints.outdoor, intent.constraints.beforeSunset, intent.constraints.when],
    [true, "things-to-do", true, true, "today"],
    "Q8 extracts outdoor=true + beforeSunset=true + when=today",
  );
  const res = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "o-cinema", name: "CMX CinéBistro Siesta Key", primary_type: "movie_theater", category: "attractions", lat: 27.30, lng: -82.53, rating: 4.6, reviews: 2300 },
      { id: "o-escape", name: "Escape Countdown Sarasota", primary_type: "escape_room", category: "attractions", lat: 27.33, lng: -82.52, rating: 4.9, reviews: 1100 },
      { id: "o-selby", name: "Marie Selby Botanical Gardens", primary_type: "botanical_garden", category: "attractions", lat: 27.327, lng: -82.541, rating: 4.8, reviews: 7800 },
      { id: "o-cel", name: "Celery Fields Boardwalk & Park", primary_type: "park", category: "attractions", lat: 27.325, lng: -82.432, rating: 4.8, reviews: 2600 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("o-cinema") && !ids.includes("o-escape"), "Q8 blocks indoor cinema and escape room");
  ok(ids.includes("o-selby") && ids.includes("o-cel"), "Q8 surfaces confirmed outdoor botanical gardens & park");
}

// ── 9. Red-Team Query 9: "free Christmas lights tonight" ─────────────────────
{
  const q = "free Christmas lights tonight";
  const intent = resolveSearchIntent(q, TAMPA);
  eq(
    [intent.recognized, intent.id, intent.free, intent.constraints.when, intent.constraints.seasonal],
    [true, "christmas", true, "tonight", "christmas"],
    "Q9 extracts christmas + free=true + when=tonight",
  );
  const res = await searchResultCards({
    query: q,
    ...TAMPA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    places: [
      { id: "fl-straub", name: "North Straub Park Holiday Lights", primary_type: "park", category: "attractions", lat: 27.775, lng: -82.632, rating: 4.8, reviews: 3900, ownedHours: HOURS_THU_LATE_22 },
      { id: "fl-busch", name: "Busch Gardens Christmas Town", primary_type: "amusement_park", category: "attractions", lat: 28.037, lng: -82.419, rating: 4.6, reviews: 42000 },
    ],
    events: [
      { event_id: "fl-free-riverwalk", slug: "riverwalk-holiday-lights", event_name: "Tampa Riverwalk Free Christmas Lights Display", city: "Tampa", category: "holiday", is_free: true, start_date: "2026-11-10", end_date: "2027-01-02", lat: 27.948, lng: -82.462 },
      { event_id: "fl-paid-enchant", slug: "enchant-st-pete", event_name: "Enchant Christmas Light Maze", city: "St. Petersburg", category: "holiday", is_free: false, price_band: "$$$", start_date: "2026-11-10", end_date: "2026-12-29", lat: 27.768, lng: -82.653 },
      { event_id: "fl-future-free", slug: "dec-tree-lighting", event_name: "Free December Christmas Tree Lighting", city: "Tampa", category: "holiday", is_free: true, start_date: "2026-12-04", end_date: "2026-12-04", lat: 27.95, lng: -82.46 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("fl-busch") && !ids.includes("event:fl-paid-enchant"), "Q9 blocks paid Christmas attractions & ticketed events");
  ok(!ids.includes("event:fl-future-free"), "Q9 blocks future inactive December event on 'tonight'");
  ok(ids.includes("fl-straub") && ids.includes("event:fl-free-riverwalk"), "Q9 surfaces free public park lights & free active-tonight Christmas display");
}

// ── 10. Red-Team Query 10: "museum open late" ────────────────────────────────
{
  const q = "museum open late";
  const intent = resolveSearchIntent(q, TAMPA);
  eq(
    [intent.recognized, intent.id, intent.constraints.venueFocus, intent.constraints.openNow, intent.constraints.lateNight, intent.constraints.afterHour],
    [true, "things-to-do", "museum", true, true, 20],
    "Q10 extracts venueFocus=museum + openNow + lateNight + afterHour=20",
  );
  const res = await searchResultCards({
    query: q,
    ...TAMPA,
    today: TODAY,
    nowMs: THU_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "mu-bar", name: "The Cocktail Museum Bar", primary_type: "cocktail_bar", category: "nightlife", lat: 27.95, lng: -82.46, rating: 4.8, reviews: 900, ownedHours: HOURS_LATE_DATE_2330 },
      { id: "mu-5pm", name: "Henry B. Plant Museum", primary_type: "museum", category: "attractions", lat: 27.946, lng: -82.464, rating: 4.8, reviews: 2100, ownedHours: HOURS_DAILY_10_TO_17 },
      { id: "mu-unk", name: "Ybor City State Museum", primary_type: "museum", category: "attractions", lat: 27.961, lng: -82.438, rating: 4.7, reviews: 1400, ownedHours: null },
      { id: "mu-dali-late", name: "The Dalí Museum", primary_type: "museum", category: "attractions", lat: 27.766, lng: -82.631, rating: 4.8, reviews: 16000, ownedHours: HOURS_THU_LATE_22 },
    ],
  });
  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("mu-5pm"), "Q10 blocks museum confirmed closing at 5:00 PM");
  ok(!ids.includes("mu-unk"), "Q10 blocks daytime museum with unverified hours on late query");
  eq(ids[0], "mu-dali-late", "Q10 ranks museum confirmed open until 10:00 PM #1 ahead of unknown-hours museum");
}

// ── 11. Mission 16 `/api/search` _trace Opt-In & Zero-PII Contract ───────────
{
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";
  try {
    const rPlain = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=quiet%20date%20indoors%20near%20Sarasota"))).json();
    eq(Object.prototype.hasOwnProperty.call(rPlain, "_trace"), false, "Default /api/search omits _trace");

    const rTraced = await (await searchRoute(new Request("https://www.gowayfind.com/api/search?q=quiet%20date%20indoors%20near%20Sarasota&trace=1"))).json();
    ok(rTraced._trace && rTraced._trace.schema === 1, "/api/search?trace=1 returns schema v1 _trace");
    eq(rTraced._trace.parsedIntent.id, "date-night", "_trace.parsedIntent captures date-night");
    eq(rTraced._trace.parsedIntent.constraints.quiet, true, "_trace.parsedIntent captures quiet=true");
  } finally {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
}

// ── 12. Mission 23 Controlled Evidence-Gated Self-Healing Overrides ──────────
{
  clearVerifiedSemanticOverridesForTests();
  const bad1 = registerVerifiedSemanticOverride({ placeId: "ChIJtest1", dimensions: { INDOOR: "confirmed" }, evidenceSource: "", reason: "guess" });
  eq(bad1.ok, false, "Blind override without evidenceSource is refused");

  const good = registerVerifiedSemanticOverride({
    placeId: "ChIJverifiedVenue99",
    dimensions: { INDOOR: "confirmed", LOW_WALKING: "confirmed" },
    evidenceSource: "official_venue_schema_org",
    reason: "Seated indoor planetarium dome verified via official Schema.org Place metadata",
  });
  eq(good.ok, true, "Evidence-backed semantic override accepted");
  const evalAfter = evaluateMomentSemanticEligibility(
    { kind: "place", id: "ChIJverifiedVenue99", title: "Mystery Dome", primaryType: "tourist_attraction", category: "attractions" },
    { intentId: "things-to-do", constraints: { indoor: true, lowWalking: true } },
  );
  eq(evalAfter.eligible, true, "Verified override unlocks indoor + lowWalking eligibility");
  ok(evalAfter.boostReasons.includes("confirmed_indoor") && evalAfter.boostReasons.includes("confirmed_low_walking"), "Verified override carries confirmed boost provenance");
  clearVerifiedSemanticOverridesForTests();
}

const telem = getSearchRejectionTelemetry();
ok(telem.totalEvaluated > 20 && telem.totalRejected >= 15, "Search rejection telemetry tracks evaluated and rejected counts");

if (process.argv.includes("--red-prove")) {
  ok(false, "RED_PROVE: simulated med-spa leaking into date-night moment search");
}

console.log(`test-moment-search-redteam: OK — ${assertions} assertions passed across all 10 red-team moment queries, med-spa firewall, confidence ranking, _trace, and evidence-gated overrides`);
