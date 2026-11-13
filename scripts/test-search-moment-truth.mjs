#!/usr/bin/env node
// scripts/test-search-moment-truth.mjs — Comprehensive Guard for Moment Truth
// Verifies all 5 red-team repairs:
// Case A: Museum open late hard-rejects daytime museums with unverified/daytime hours and guides
// Case B: Cheap indoor date after 9 ranks Oak & Stone #1 ahead of unknown-hours peers with honest metadata
// Case C: Requested visit duration enforces closing buffer and holiday closures
// Case D: Seasonal research rejects unconfirmed, future, and daytime retail shops on evening queries
// Case E: Contradictory guides hard-rejected and generic guides demoted on moment queries

import assert from "node:assert/strict";
import { searchResultCards } from "../lib/searchCards.js";
import { resolveSearchIntent } from "../lib/searchIntent.js";
import { buildOwnedHoursRecord } from "../lib/ownedHours.js";

const SARASOTA = { lat: 27.3364, lng: -82.5307 };
const TAMPA = { lat: 27.9506, lng: -82.4572 };
const ORLANDO = { lat: 28.5384, lng: -81.3789 };
const QUIET_ENV = { WAYFIND_SEARCH_UNDERSTAND: "" };
const NO_NET = async () => {
  throw new Error("network disabled in deterministic test-search-moment-truth guard");
};

// Fixed Friday evening: 2026-11-13 18:00 EST = 2026-11-13T23:00:00Z
const FRI_6PM_MS = Date.parse("2026-11-13T23:00:00Z");
const TODAY = "2026-11-13";

let assertions = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  assertions++;
}
function eq(a, b, msg) {
  assert.deepEqual(a, b, msg);
  assertions++;
}

function makeHours(lines, specialHours = null) {
  const rec = buildOwnedHoursRecord({
    weekdayDescriptions: lines,
    lat: 27.3364,
    lng: -82.5307,
    source: "test",
    verifiedAt: "2026-11-13T00:00:00Z",
  });
  if (specialHours && rec) rec.specialHours = specialHours;
  return rec;
}

const HOURS_CLOSES_1700 = makeHours([
  "Monday: 10:00 AM – 5:00 PM",
  "Tuesday: 10:00 AM – 5:00 PM",
  "Wednesday: 10:00 AM – 5:00 PM",
  "Thursday: 10:00 AM – 5:00 PM",
  "Friday: 10:00 AM – 5:00 PM",
  "Saturday: 10:00 AM – 5:00 PM",
  "Sunday: 10:00 AM – 5:00 PM",
]);

const HOURS_CLOSES_2130 = makeHours([
  "Monday: 11:00 AM – 9:30 PM",
  "Tuesday: 11:00 AM – 9:30 PM",
  "Wednesday: 11:00 AM – 9:30 PM",
  "Thursday: 11:00 AM – 9:30 PM",
  "Friday: 11:00 AM – 9:30 PM",
  "Saturday: 11:00 AM – 9:30 PM",
  "Sunday: 11:00 AM – 9:30 PM",
]);

const HOURS_OPEN_UNTIL_MIDNIGHT = makeHours([
  "Monday: 11:00 AM – 11:00 PM",
  "Tuesday: 11:00 AM – 11:00 PM",
  "Wednesday: 11:00 AM – 11:00 PM",
  "Thursday: 11:00 AM – 11:00 PM",
  "Friday: 11:00 AM – 12:00 AM",
  "Saturday: 10:00 AM – 12:00 AM",
  "Sunday: 10:00 AM – 11:00 PM",
]);

const HOURS_CLOSING_IN_45MIN = makeHours([
  "Monday: 8:00 AM – 6:45 PM",
  "Tuesday: 8:00 AM – 6:45 PM",
  "Wednesday: 8:00 AM – 6:45 PM",
  "Thursday: 8:00 AM – 6:45 PM",
  "Friday: 8:00 AM – 6:45 PM",
  "Saturday: 8:00 AM – 6:45 PM",
  "Sunday: 8:00 AM – 6:45 PM",
]);

const HOURS_OPEN_LATE_PARK = makeHours([
  "Monday: 6:00 AM – 10:00 PM",
  "Tuesday: 6:00 AM – 10:00 PM",
  "Wednesday: 6:00 AM – 10:00 PM",
  "Thursday: 6:00 AM – 10:00 PM",
  "Friday: 6:00 AM – 10:00 PM",
  "Saturday: 6:00 AM – 10:00 PM",
  "Sunday: 6:00 AM – 10:00 PM",
]);

// ── Case A: "museum open late" (Sarasota) ────────────────────────────────────
{
  const q = "museum open late";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.constraints.venueFocus, intent.constraints.openNow, intent.constraints.lateNight, intent.constraints.afterHour],
    [true, "museum", true, true, 20],
    "Case A: Intent extracts venueFocus=museum, openNow=true, lateNight=true, afterHour=20",
  );

  const res = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [
      { id: "guide:sarasota-museums", title: "Top 10 Sarasota Museums Guide", keywords: ["museum", "art", "culture"], region: "Sarasota", href: "/guide/sarasota-museums" },
    ],
    events: [],
    places: [
      { id: "p-ringling", name: "The Ringling Museum of Art", primary_type: "museum", category: "attractions", lat: 27.381, lng: -82.563, rating: 4.8, reviews: 11200, ownedHours: HOURS_CLOSES_1700 },
      { id: "ChIJpXGK53VC24gRWMneFVtK6hY", name: "Ca' d'Zan", primary_type: "museum", category: "attractions", lat: 27.382, lng: -82.564, rating: 4.8, reviews: 3500 },
      { id: "p-tibbals", name: "Tibbals Learning Center", primary_type: "museum", category: "attractions", lat: 27.381, lng: -82.563, rating: 4.7, reviews: 1200, ownedHours: null },
      { id: "p-art-museum", name: "Sarasota Art Museum", primary_type: "art_museum", category: "attractions", lat: 27.324, lng: -82.532, rating: 4.6, reviews: 800, ownedHours: null },
      { id: "p-art-center", name: "Art Center Sarasota", primary_type: "art_gallery", category: "attractions", lat: 27.337, lng: -82.545, rating: 4.6, reviews: 450, ownedHours: null },
      { id: "p-holiday-closed", name: "Bishop Museum of Science and Nature", primary_type: "museum", category: "attractions", lat: 27.498, lng: -82.571, rating: 4.7, reviews: 2900, ownedHours: makeHours(["Friday: 10:00 AM – 10:00 PM"], [{ date: TODAY, closed: true }]) },
    ],
  });

  eq(res.cards, [], "Case A: Returns honest empty [] when zero museums are verified open late");
  const reasons = res._trace.rejections.byReason;
  ok(reasons.unverified_late_hours_for_daytime_venue >= 3, "Case A: Unverified daytime museums rejected as unverified_late_hours_for_daytime_venue");
  ok(reasons.closed_right_now_by_owned_hours >= 1 || reasons.closes_before_requested_hour >= 1, "Case A: Daytime closing museums rejected");
  ok(reasons.closed_for_holiday >= 1, "Case A: Holiday-closed museum rejected");
  ok(reasons.not_a_museum >= 1, "Case A: Museum guide rejected as not_a_museum on venue focus query");
}

// ── Case B: "cheap indoor date after 9 tonight" ──────────────────────────────
{
  const q = "cheap indoor date after 9 tonight";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.constraints.budget, intent.constraints.indoor, intent.constraints.afterHour, intent.constraints.lateNight],
    [true, "cheap", true, 21, true],
    "Case B: Intent extracts cheap budget, indoor, afterHour=21, lateNight=true",
  );

  const res = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "p-oak-stone", name: "Oak & Stone", primary_type: "restaurant", google_types: ["restaurant", "bar"], category: "food", priceNum: 2, lat: 27.389, lng: -82.463, rating: 4.5, reviews: 2515, ownedHours: HOURS_OPEN_UNTIL_MIDNIGHT },
      { id: "p-utamaro", name: "Utamaro Sushi Bar", primary_type: "sushi_restaurant", google_types: ["sushi_restaurant", "restaurant"], category: "food", priceNum: 2, lat: 27.336, lng: -82.541, rating: 4.6, reviews: 920, ownedHours: null },
      { id: "p-dry-dock", name: "Dry Dock Waterfront Grill", primary_type: "seafood_restaurant", category: "food", priceNum: 2, lat: 27.339, lng: -82.589, rating: 4.7, reviews: 5078, ownedHours: HOURS_CLOSES_2130 },
      { id: "p-tiki-bar", name: "O'Leary's Tiki Bar & Grill", primary_type: "restaurant", category: "food", priceNum: 2, lat: 27.334, lng: -82.545, rating: 4.5, reviews: 6500, ownedHours: HOURS_OPEN_UNTIL_MIDNIGHT },
      { id: "p-pricey", name: "Maison Blanche Fine Dining", primary_type: "french_restaurant", category: "food", priceNum: 4, lat: 27.336, lng: -82.531, rating: 4.9, reviews: 1200, ownedHours: HOURS_OPEN_UNTIL_MIDNIGHT },
    ],
  });

  const ids = res.cards.map((c) => c.id);
  eq(ids[0], "p-oak-stone", "Case B: Oak & Stone ranks #1 with confirmed late-night hours");
  ok(!ids.includes("p-dry-dock"), "Case B: Venue closing at 9:30 PM rejected on lateNight query");
  ok(!ids.includes("p-tiki-bar"), "Case B: Outdoor tiki bar rejected on indoor query");
  ok(!ids.includes("p-pricey"), "Case B: Expensive venue rejected on cheap query");
  eq(ids[1], "p-utamaro", "Case B: Unknown-hours peer ranked behind verified late-night venue");

  const oakCard = res.cards.find((c) => c.id === "p-oak-stone");
  eq([oakCard.hoursVerified, oakCard.hoursState, oakCard.openNow], [true, "confirmed_open", true], "Case B: Oak & Stone card carries honest confirmed_open metadata");

  const utamaroCard = res.cards.find((c) => c.id === "p-utamaro");
  eq([utamaroCard.hoursVerified, utamaroCard.hoursState, utamaroCard.openNow], [false, "unknown", undefined], "Case B: Utamaro card carries unknown hoursState without false openNow");
}

// ── Case C: "something free open for 90 minutes near me" ─────────────────────
{
  const q = "something free open for 90 minutes near me";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.free, intent.constraints.openNow, intent.constraints.durationMaxMin],
    [true, true, true, 90],
    "Case C: Intent extracts free=true, openNow=true, durationMaxMin=90",
  );

  const res = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "c-park-closing-soon", name: "Payne Park", primary_type: "park", category: "attractions", is_free: true, free: true, lat: 27.333, lng: -82.525, rating: 4.7, reviews: 2400, ownedHours: HOURS_CLOSING_IN_45MIN },
      { id: "c-park-holiday-closed", name: "Urfer Family Park", primary_type: "park", category: "attractions", is_free: true, free: true, lat: 27.284, lng: -82.463, rating: 4.8, reviews: 1900, ownedHours: makeHours(["Friday: 6:00 AM – 10:00 PM"], [{ date: TODAY, closed: true }]) },
      { id: "c-museum-daytime-closed", name: "Closed Historical Center", primary_type: "museum", category: "attractions", is_free: true, free: true, lat: 27.336, lng: -82.531, rating: 4.5, reviews: 300, ownedHours: HOURS_CLOSES_1700 },
      { id: "c-park-open-late", name: "Bayfront Park", primary_type: "park", category: "attractions", is_free: true, free: true, lat: 27.334, lng: -82.544, rating: 4.8, reviews: 4200, ownedHours: HOURS_OPEN_LATE_PARK },
      { id: "c-beach-unknown", name: "Siesta Beach Public Access", primary_type: "beach", category: "attractions", is_free: true, free: true, lat: 27.265, lng: -82.553, rating: 4.9, reviews: 32000, ownedHours: null },
    ],
  });

  const ids = res.cards.map((c) => c.id);
  ok(!ids.includes("c-park-closing-soon"), "Case C: Park closing in 45 min rejected on 90 min visit query");
  ok(!ids.includes("c-park-holiday-closed"), "Case C: Park closed for holiday rejected");
  ok(!ids.includes("c-museum-daytime-closed"), "Case C: Closed venue rejected by owned hours");
  eq(ids[0], "c-park-open-late", "Case C: Confirmed open park with ample buffer ranks #1 ahead of unknown-hours beach");
  ok(ids.includes("c-beach-unknown"), "Case C: Free beach with unknown hours remains eligible behind confirmed peer");

  const parkCard = res.cards.find((c) => c.id === "c-park-open-late");
  eq([parkCard.hoursVerified, parkCard.hoursState, parkCard.openNow], [true, "confirmed_open", true], "Case C: Confirmed park has hoursVerified=true and openNow=true");
}

// ── Case D: Seasonal Christmas research truth ────────────────────────────────
{
  // Part 1: "Christmas tonight with kids but no theme parks"
  const q1 = "Christmas tonight with kids but no theme parks";
  const intent1 = resolveSearchIntent(q1, ORLANDO);
  eq(
    [intent1.recognized, intent1.id, intent1.constraints.when, intent1.constraints.audience, intent1.constraints.excludeThemeParks],
    [true, "christmas", "tonight", "family", true],
    "Case D: Intent extracts christmas + tonight + family + excludeThemeParks=true",
  );

  const res1 = await searchResultCards({
    query: q1,
    ...ORLANDO,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    places: [
      { id: "x-mk", name: "Magic Kingdom Christmas", primary_type: "theme_park", category: "attractions", lat: 28.417, lng: -81.581, rating: 4.8, reviews: 95000 },
      { id: "ChIJYybWKcrvwogRT8I06QALhdI", name: "Robert's Christmas Wonderland", primary_type: "gift_shop", category: "shopping", lat: 27.96, lng: -82.715, rating: 4.6, reviews: 3100 },
      { id: "x-enander", name: "Enander's Winter Wonderland", primary_type: "tourist_attraction", category: "attractions", lat: 27.156, lng: -82.436, rating: 4.7, reviews: 1200 },
    ],
    events: [
      { event_id: "x-bar-crawl", slug: "krampus-cocktails", event_name: "Late Night Holiday Cocktail Bar Crawl", city: "Orlando", category: "nightlife", subcategory: "bar crawl", start_date: "2026-11-10", end_date: "2026-12-24", lat: 28.54, lng: -81.37 },
      { event_id: "x-family-active", slug: "winter-lights", event_name: "Lake Eola Family Holiday Lights Walk", city: "Orlando", category: "holiday", tags: ["family", "kids", "christmas"], start_date: "2026-11-10", end_date: "2026-12-30", lat: 28.543, lng: -81.373 },
    ],
  });

  const ids1 = res1.cards.map((c) => c.id);
  ok(!ids1.includes("x-mk"), "Case D: Theme park rejected on excludeThemeParks=true");
  ok(!ids1.includes("ChIJYybWKcrvwogRT8I06QALhdI"), "Case D: Robert's Christmas Wonderland retail shop closing at 5:30 PM rejected on tonight query");
  ok(!ids1.includes("x-enander"), "Case D: Enander's unconfirmed display rejected on needsActiveToday");
  ok(!ids1.includes("event:x-bar-crawl"), "Case D: Adult bar crawl rejected on family outing query");
  eq(ids1[0], "event:x-family-active", "Case D: Active non-theme-park family Christmas lights surfaces #1");

  // Part 2: "free Christmas lights tonight" returns honest [] when only unconfirmed or inactive exist
  const q2 = "free Christmas lights tonight";
  const res2 = await searchResultCards({
    query: q2,
    ...SARASOTA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    places: [
      { id: "ChIJYybWKcrvwogRT8I06QALhdI", name: "Robert's Christmas Wonderland", primary_type: "gift_shop", category: "shopping", lat: 27.96, lng: -82.715, rating: 4.6, reviews: 3100 },
      { id: "x-enander-2", name: "Enander's Winter Wonderland", primary_type: "tourist_attraction", category: "attractions", lat: 27.156, lng: -82.436, rating: 4.7, reviews: 1200 },
    ],
    events: [
      { event_id: "e-dec-tree", slug: "december-tree", event_name: "Annual December Christmas Tree Lighting", city: "Sarasota", category: "holiday", is_free: true, start_date: "2026-12-05", end_date: "2026-12-05", lat: 27.336, lng: -82.531 },
      { event_id: "e-paid-maze", slug: "paid-enchant", event_name: "Enchant Ticketed Light Maze", city: "St. Petersburg", category: "holiday", is_free: false, price_band: "$$$", start_date: "2026-11-10", end_date: "2026-12-28", lat: 27.768, lng: -82.653 },
    ],
  });
  eq(res2.cards, [], "Case D: Honest empty [] returned when zero free public Christmas lights are active tonight on 2026-11-13");
}

// ── Case E: Guide Consistency & Demotion on Moment Queries ──────────────────
{
  // Part 1: Contradictory guides hard-rejected
  const qOut = "outdoor thing before sunset";
  const resOut = await searchResultCards({
    query: qOut,
    ...SARASOTA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [
      { id: "guide:rainy-indoor-sarasota", title: "Rainy Day Indoor Guide to Sarasota", keywords: ["rainy", "indoor"], region: "Sarasota", href: "/guide/rainy-indoor-sarasota" },
      { id: "guide:outdoor-nature-sarasota", title: "Best Outdoor Parks and Preserves", keywords: ["parks", "outdoors", "nature"], region: "Sarasota", href: "/guide/outdoor-nature-sarasota" },
    ],
    events: [],
    places: [
      { id: "e-causeway", name: "Ringling Bridge Causeway Park", primary_type: "park", category: "attractions", lat: 27.338, lng: -82.56, rating: 4.8, reviews: 3800 },
    ],
  });
  const outIds = resOut.cards.map((c) => c.id);
  ok(!outIds.includes("guide:rainy-indoor-sarasota"), "Case E: Rainy indoor guide rejected on outdoor query");
  ok(outIds.includes("e-causeway"), "Case E: Outdoor park surfaces on outdoor query");

  // Part 2: Generic guides lose +460 category boost and rank behind real places/events
  const qWalk = "my parents can’t walk much, what can we do tonight";
  const resWalk = await searchResultCards({
    query: qWalk,
    ...SARASOTA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [
      { id: "guide:sarasota-general-guide", title: "Things to Do in Sarasota: Complete Guide", keywords: ["things to do", "sarasota"], region: "Sarasota", href: "/guide/sarasota-general-guide" },
    ],
    events: [],
    places: [
      { id: "w-cruise", name: "Marina Jack Sunset Sightseeing Cruise", primary_type: "boat_tour", category: "attractions", lat: 27.334, lng: -82.544, rating: 4.8, reviews: 2100 },
      { id: "w-opera", name: "Sarasota Opera House", primary_type: "performing_arts_theater", category: "attractions", lat: 27.336, lng: -82.541, rating: 4.9, reviews: 1800 },
    ],
  });
  const walkIds = resWalk.cards.map((c) => c.id);
  ok(walkIds.slice(0, 2).includes("w-cruise") && walkIds.slice(0, 2).includes("w-opera"), "Case E: Real seated venues rank #1 and #2 on low-walking moment query");
  ok(!walkIds.slice(0, 2).includes("guide:sarasota-general-guide"), "Case E: Generic guide does not outrank real places/events on moment query");
}

// ── Coordinator Audit Leaks 1–4 Verification ────────────────────────────────

// ── Leak 1: "museum open late" in Tampa & Sarasota ──────────────────────────
{
  const q = "museum open late";
  const resTampa = await searchResultCards({
    query: q,
    ...TAMPA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "p-ybor-state-park", name: "Ybor City Museum State Park", primary_type: "state_park", google_types: ["state_park", "park"], category: "attractions", lat: 27.962, lng: -82.437, rating: 4.6, reviews: 1500, ownedHours: null },
      { id: "p-ybor-closed", name: "Ybor City Museum State Park (Closing 5pm)", primary_type: "state_park", google_types: ["state_park", "park"], category: "attractions", lat: 27.962, lng: -82.437, rating: 4.6, reviews: 1500, ownedHours: HOURS_CLOSES_1700 },
      { id: "p-publix", name: "Publix Super Market", primary_type: "supermarket", google_types: ["supermarket", "grocery_store", "store"], category: "shopping", lat: 27.96, lng: -82.44, rating: 4.6, reviews: 2000, ownedHours: makeHours(["Friday: 7:00 AM – 10:00 PM"]) },
      { id: "p-michelangelo", name: "Michelangelo 301 Pizza", primary_type: "pizza_restaurant", google_types: ["pizza_restaurant", "restaurant", "food"], category: "food", lat: 27.96, lng: -82.44, rating: 4.5, reviews: 800, ownedHours: makeHours(["Friday: 11:00 AM – 11:00 PM"]) },
      { id: "p-late-food", name: "Late Night Taco Diner", primary_type: "restaurant", google_types: ["restaurant", "food"], category: "food", lat: 27.96, lng: -82.44, rating: 4.5, reviews: 800, ownedHours: makeHours(["Friday: 11:00 AM – 2:00 AM"]) },
      { id: "p-arcade-monsters", name: "Arcade Monsters Lido Beach", primary_type: "amusement_center", google_types: ["amusement_center"], category: "attractions", lat: 27.317, lng: -82.578, rating: 4.8, reviews: 900, ownedHours: makeHours(["Friday: 10:00 AM – 2:00 AM"]) },
    ],
  });

  const ids = resTampa.cards.map((c) => c.id);
  ok(!ids.includes("p-ybor-state-park"), "Leak 1: Ybor City Museum State Park with unverified hours rejected as daytime institution");
  ok(!ids.includes("p-ybor-closed"), "Leak 1: Ybor City Museum State Park closing at 5pm rejected on late query");
  ok(!ids.includes("p-publix"), "Leak 1: Supermarket Publix never returned for 'museum open late'");
  ok(!ids.includes("p-michelangelo"), "Leak 1: Pizza restaurant Michelangelo never returned for 'museum open late'");
  ok(!ids.includes("p-late-food"), "Leak 1: Restaurant never returned for 'museum open late'");
  ok(
    resTampa.cards.every((c) => c.category !== "food" && c.category !== "shopping" && !/pizza|publix|market|grocery|restaurant/i.test(c.title || c.name || "")),
    "Leak 1: 'museum open late' results contain zero food/grocery/supermarket/restaurant cards",
  );
  eq(resTampa._trace.rejections.byReason.unverified_late_hours_for_daytime_venue >= 1, true, "Leak 1: Trace records unverified_late_hours_for_daytime_venue for state park museum");
  eq(resTampa._trace.rejections.byReason.not_a_museum >= 3, true, "Leak 1: Trace records not_a_museum rejections for non-museum candidates (supermarket, pizza, restaurant)");
}

// ── Leak 2: "my parents can't walk much, what can we do tonight" ────────────
{
  const q = "my parents can't walk much, what can we do tonight";
  const resParents = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "p-tibbals-tonight", name: "Tibbals Learning Center & Circus Museum at The Ringling", primary_type: "museum", category: "attractions", lat: 27.381, lng: -82.563, rating: 4.7, reviews: 1200, ownedHours: null },
      { id: "p-ringling-daytime", name: "The Ringling Museum of Art", primary_type: "museum", category: "attractions", lat: 27.381, lng: -82.563, rating: 4.8, reviews: 11200, ownedHours: HOURS_CLOSES_1700 },
      { id: "p-seated-open-tonight", name: "Marina Jack Sunset Sightseeing Cruise", primary_type: "boat_tour", category: "attractions", lat: 27.334, lng: -82.544, rating: 4.8, reviews: 2100, ownedHours: HOURS_OPEN_UNTIL_MIDNIGHT },
      { id: "p-seated-unknown-hours", name: "Sarasota Bayfront Stroll & Bench Seating", primary_type: "park", category: "attractions", lat: 27.336, lng: -82.541, rating: 4.6, reviews: 800, ownedHours: null },
    ],
  });

  const ids = resParents.cards.map((c) => c.id);
  ok(!ids.includes("p-tibbals-tonight"), "Leak 2: Tibbals unverified museum rejected on tonight query");
  ok(!ids.includes("p-ringling-daytime"), "Leak 2: Ringling museum closing at 5pm rejected on tonight query");
  eq(ids[0], "p-seated-open-tonight", "Leak 2: Confirmed-open tonight venue ranks #1 ahead of unknown-hours peers");
  const cruiseCard = resParents.cards.find((c) => c.id === "p-seated-open-tonight");
  eq([cruiseCard.hoursVerified, cruiseCard.hoursState], [true, "confirmed_open"], "Leak 2: Verified evening venue has confirmed_open state");
}

// ── Leak 3: "Christmas tonight with kids but no theme parks" (Orlando) ──────
{
  const q = "Christmas tonight with kids but no theme parks";
  const resChristmas = await searchResultCards({
    query: q,
    ...ORLANDO,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    places: [
      { id: "ChIJN3DIZgcK54gRMqXaoB5ateU", name: "Santa's Farm & Christmas Tree Forest", primary_type: "tourist_attraction", category: "attractions", lat: 28.847, lng: -81.571, rating: 4.6, reviews: 2800, ownedHours: null },
      { id: "p-raw-inventory-place", name: "Orlando Christmas House Lights", primary_type: "tourist_attraction", category: "attractions", lat: 28.538, lng: -81.378, rating: 4.7, reviews: 500, ownedHours: null },
      { id: "p-verified-late-display", name: "Lake Eola Christmas Tree & Light Display", primary_type: "park", category: "attractions", lat: 28.543, lng: -81.373, rating: 4.8, reviews: 3500, ownedHours: HOURS_OPEN_UNTIL_MIDNIGHT },
    ],
    events: [
      { event_id: "e-active-family-xmas", slug: "lake-eola-walk", event_name: "Lake Eola Family Holiday Lights Walk", city: "Orlando", category: "holiday", tags: ["family", "kids", "christmas"], start_date: "2026-11-10", end_date: "2026-12-30", lat: 28.543, lng: -81.373 },
    ],
  });

  const ids = resChristmas.cards.map((c) => c.id);
  ok(!ids.includes("ChIJN3DIZgcK54gRMqXaoB5ateU"), "Leak 3: Santa's Farm recurring_unconfirmed rejected on Christmas tonight query");
  ok(!ids.includes("p-raw-inventory-place"), "Leak 3: Raw inventory place with unverified dates and hours rejected on Christmas tonight query");
  ok(ids.includes("p-verified-late-display") || ids.includes("event:e-active-family-xmas"), "Leak 3: Verified evening display surfaces");
  eq(resChristmas._trace.rejections.byReason.seasonal_not_active_today >= 2, true, "Leak 3: Trace records seasonal_not_active_today for unconfirmed displays and raw unverified places");
}

// ── Leak 4: "my 2 year old is losing it and it's pouring" ────────────────────
{
  const q = "my 2 year old is losing it and it's pouring";
  const intent = resolveSearchIntent(q, SARASOTA);
  eq(
    [intent.recognized, intent.id, intent.constraints.ageGroup, intent.constraints.indoor],
    [true, "rainy", "toddlers", true],
    "Leak 4: Intent extracts rainy + toddlers + indoor",
  );

  const resToddler = await searchResultCards({
    query: q,
    ...SARASOTA,
    today: TODAY,
    nowMs: FRI_6PM_MS,
    includeTrace: true,
    env: QUIET_ENV,
    fetchImpl: NO_NET,
    guides: [],
    events: [],
    places: [
      { id: "p-ringling-art", name: "The Ringling Museum of Art", primary_type: "art_museum", category: "attractions", lat: 27.381, lng: -82.563, rating: 4.8, reviews: 11200 },
      { id: "ChIJpXGK53VC24gRWMneFVtK6hY", name: "Ca' d'Zan", primary_type: "museum", category: "attractions", lat: 27.382, lng: -82.564, rating: 4.8, reviews: 3500 },
      { id: "p-sarasota-art", name: "Sarasota Art Museum", primary_type: "art_museum", category: "attractions", lat: 27.324, lng: -82.532, rating: 4.6, reviews: 800 },
      { id: "p-art-center-srq", name: "Art Center Sarasota", primary_type: "art_gallery", category: "attractions", lat: 27.337, lng: -82.545, rating: 4.6, reviews: 450 },
      { id: "p-bishop-science", name: "The Bishop Museum of Science and Nature", primary_type: "science_museum", google_types: ["science_museum", "planetarium", "aquarium"], category: "attractions", lat: 27.498, lng: -82.571, rating: 4.7, reviews: 2900 },
      { id: "p-mote-marine", name: "Mote Marine Laboratory & Aquarium", primary_type: "aquarium", category: "attractions", lat: 27.333, lng: -82.578, rating: 4.7, reviews: 14500 },
      { id: "p-indoor-play", name: "Jumpin Fun Inflata Park", primary_type: "amusement_center", google_types: ["amusement_center", "indoor_playground"], category: "family", lat: 27.361, lng: -82.451, rating: 4.6, reviews: 1800 },
    ],
  });

  const ids = resToddler.cards.map((c) => c.id);
  ok(!ids.includes("p-ringling-art"), "Leak 4: Ringling adult art museum rejected for toddlers");
  ok(!ids.includes("ChIJpXGK53VC24gRWMneFVtK6hY"), "Leak 4: Ca' d'Zan mansion tour rejected for toddlers");
  ok(!ids.includes("p-sarasota-art"), "Leak 4: Sarasota Art Museum rejected for toddlers");
  ok(!ids.includes("p-art-center-srq"), "Leak 4: Art Center Sarasota gallery rejected for toddlers");
  ok(ids.includes("p-bishop-science"), "Leak 4: Bishop Museum of Science & Nature surfaces for toddlers");
  ok(ids.includes("p-mote-marine"), "Leak 4: Mote Aquarium surfaces for toddlers");
  ok(ids.includes("p-indoor-play"), "Leak 4: Indoor playground surfaces for toddlers");
  eq(resToddler._trace.rejections.byReason.not_toddler_friendly, 4, "Leak 4: Trace records 4 not_toddler_friendly rejections");
}

console.log(`test-search-moment-truth: OK — ${assertions} assertions passed proving all moment search truth repairs and leak closures`);
