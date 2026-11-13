#!/usr/bin/env node
/**
 * scripts/test-game-plan.mjs — Red-Team & Regression Guard for YOUR GAME PLAN
 * on Wayfind place detail (`lib/gamePlan.js`, `lib/detailCta.js`, `lib/trips.js`,
 * `lib/editorialRule.js`, `lib/atlasCards.js`, `app/components/shareIntentSheet.js`,
 * `app/components/sheets/Detail.js`).
 *
 * Executes all 13 Red-Team scenarios against live functions and rendered
 * React components (never structural-only regex):
 *   1. Closed place
 *   2. Free place
 *   3. Paid place (incl. The Ringling blank-CTA regression)
 *   4. Missing hours
 *   5. Missing editorial & zero empty shells
 *   6. Stale event filtering
 *   7. Rainy & hot weather context + indoor backup elevation
 *   8. No partner offer (honest official menu / reserve / directions)
 *   9. Wrong partner candidate rejected
 *  10. Multiple partner candidates -> deterministic exact pin, merit-only pairing
 *  11. Missing parking + Florida park-name false-positive trap
 *  12. Mobile progressive disclosure (<=3 visible rows) & section hierarchy
 *  13. Slow connection progressive hydration + canonical itinerary + Ask someone
 */
process.env.WF_SUPPRESS_ANALYTICS = "1";

import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  buildGamePlan,
  buildGamePlanVerdict,
  extractParkingIntel,
  extractVerifiedDuration,
  filterEligibleVenueEvents,
  findIndoorBackup,
  hydrateDetailHours,
  isTicketedPlace,
  isVerifiedFreePlace,
} from "../lib/gamePlan.js";
import {
  DETAIL_CTA_TYPES,
  detailCtaLabel,
  detailVerdict,
  resolveDetailCta,
} from "../lib/detailCta.js";
import { addPlaceToTrips, parseCityState } from "../lib/trips.js";
import { mapWfEditorial } from "../lib/editorialRule.js";
import { cardToEditorial } from "../lib/atlasCards.js";
import { ADMISSION_STATUS, resolveAdmissionTruth } from "../lib/ownedPlaceTruth.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const detailMod = await loadComponent(
  fileURLToPath(new URL("../app/components/sheets/Detail.js", import.meta.url)),
  REPO,
);
const DetailSheet = detailMod.default;
const YourGamePlan = detailMod.YourGamePlan;
const BookingCtaMod = await loadComponent(
  fileURLToPath(new URL("../app/components/BookingCTA.js", import.meta.url)),
  REPO,
);
const BookingCTA = BookingCtaMod.default;

function hasForbiddenPlaceholder(html) {
  return /\b(Unknown|TBD|N\/A|Not available)\b/i.test(String(html || ""));
}
// Positive control for every placeholder-absence assertion below:
ok(hasForbiddenPlaceholder("<div>Best time: Unknown</div>") === true, "control: placeholder detector catches Unknown");
ok(hasForbiddenPlaceholder("<div>Cost: TBD</div>") === true, "control: placeholder detector catches TBD");

function makeDetailCtx(overrides = {}) {
  const baseDetail = overrides.detail || {
    id: "ChIJ6y2dx9g_w4gRWoZIRhLk-JI",
    name: "The John and Mable Ringling Museum of Art",
    types: ["museum", "tourist_attraction"],
    postalCity: "Sarasota",
    address: "5401 Bay Shore Rd, Sarasota, FL 34243, USA",
    lat: 27.3816,
    lng: -82.5605,
    rating: 4.8,
    reviews: 9400,
    wfScore: 9.4,
    photo: "/guide-photos/sarasota-ringling.jpg",
    _liveDone: true,
  };
  return {
    detail: baseDetail,
    setDetail: () => {},
    detailExtra: null,
    setLightbox: () => {},
    reviewsOpen: false,
    setReviewsOpen: () => {},
    hoursOpen: false,
    setHoursOpen: () => {},
    venueEvents: null,
    venueEventsLoading: false,
    venueEventsOpen: false,
    setVenueEventsOpen: () => {},
    videos: null,
    videosLoading: false,
    beachCond: null,
    beachCondLoading: false,
    insight: { why_wayfind_picked_this: "Bayfront Ca' d'Zan mansion, Old Master galleries, and banyan-shaded grounds in one waterfront estate." },
    insightLoading: false,
    insightFull: null,
    insightFullLoading: false,
    showMore: false,
    viaTours: [],
    debugOn: false,
    placeComments: {},
    setPlaceComments: () => {},
    commentType: "Review",
    setCommentType: () => {},
    placePosts: [],
    setPlacePosts: () => {},
    confirmDel: false,
    setConfirmDel: () => {},
    taInfo: {},
    insider: {},
    detailContext: null,
    myVotes: {},
    communityVotes: {},
    galleryRef: { current: null },
    noteRef: { current: null },
    scrollGallery: () => {},
    loadFullInsight: () => {},
    addReservation: () => {},
    handleVote: () => {},
    loadVenueEvents: () => {},
    placeShareUrl: (p) => "https://www.gowayfind.com/p/" + encodeURIComponent(p.id),
    FeaturedTag: () => null,
    curatedNote: () => null,
    curatedFor: () => null,
    wayfindNotes: () => null,
    betterAlternatives: () => [],
    similarPlaces: () => [],
    relatedPicks: () => [],
    detailGuides: [],
    placeKind: (p) => {
      const t = (p && p.types) || [];
      if (t.includes("museum")) return "museum";
      if (t.includes("park") || t.includes("botanical_garden")) return "nature";
      if (t.includes("restaurant") || t.includes("cafe")) return "dining";
      return "entertainment";
    },
    isBeach: (p) => Boolean(p && (p.types || []).includes("beach")),
    suggested: [],
    places: [],
    offers: {},
    locName: "Sarasota, FL",
    blurbs: {},
    blurbLine: () => "",
    liked: {},
    disliked: {},
    user: null,
    authReady: true,
    sheetDragStart: () => {},
    sheetDragMove: () => {},
    sheetDragEnd: () => {},
    quickSaveFavorite: () => {},
    isSaved: () => false,
    toggleLike: () => {},
    toggleDislike: () => {},
    addShared: () => {},
    giveawayMark: () => {},
    logEvent: () => {},
    openExternal: () => {},
    openCuisine: () => {},
    openExperience: () => {},
    openDetail: () => {},
    setAuthOpen: () => {},
    ticketUrl: (u) => u,
    formatEventDate: (d) => ({ wd: "Fri", mo: "Nov", day: "20", time: d || "" }),
    shareLink: () => true,
    showToast: () => {},
    dedupePlaces: (xs) => xs || [],
    primaryCategory: () => "Museum",
    experienceBadges: () => [],
    Critter: () => null,
    FallbackImg: (props) => createElement("img", { src: props.src || "", alt: "" }),
    liveOpen: (p) => (p && typeof p.openNow === "boolean" ? p.openNow : null),
    weather: null,
    isSharedPlaceArrival: false,
    isOnTrip: () => false,
    addToItinerary: () => {},
    BUILD_ID: "test",
    ...overrides,
  };
}

// ── CASE 1: CLOSED PLACE ───────────────────────────────────────────────────
{
  // Wednesday 7:30 AM EST -> 2026-11-11T12:30:00Z; opens at 10:00 AM daily.
  const closedNow = new Date("2026-11-11T12:30:00Z").getTime();
  const closedPlace = {
    id: "ChIJ6y2dx9g_w4gRWoZIRhLk-JI",
    name: "The Ringling",
    types: ["museum", "tourist_attraction"],
    postalCity: "Sarasota",
    lat: 27.3816,
    lng: -82.5605,
    openNow: false,
    oh: {
      periods: [
        { open: { day: 3, hour: 10, minute: 0 }, close: { day: 3, hour: 17, minute: 0 } },
        { open: { day: 4, hour: 10, minute: 0 }, close: { day: 4, hour: 17, minute: 0 } },
      ],
    },
  };
  const cta = resolveDetailCta({ detail: closedPlace, kind: "museum", openState: false, locName: "Sarasota, FL" });
  ok(cta.type === DETAIL_CTA_TYPES.plan && cta.label === "Add to my trip", "Case 1 (Closed): primary CTA becomes Add to my trip");
  const gp = buildGamePlan({ detail: closedPlace, primaryCta: cta, nowMs: closedNow });
  ok(gp.openState === false, "Case 1 (Closed): openState resolves false from structured periods");
  ok(gp.verdict && gp.verdict.tone === "wait" && /Wait — closed now · opens at 10 AM/.test(gp.verdict.text),
    `Case 1 (Closed): verdict states wait + exact opening hour (got ${JSON.stringify(gp.verdict)})`);
  ok(!/Go now/i.test(gp.verdict.text), "Case 1 (Closed): closed place never claims Go now");
  // Positive control: at 1:00 PM EST same day, the exact same place IS Go now.
  const openNow = new Date("2026-11-11T18:00:00Z").getTime();
  const gpOpen = buildGamePlan({ detail: { ...closedPlace, openNow: true }, primaryCta: { type: "directions" }, nowMs: openNow });
  ok(gpOpen.verdict && gpOpen.verdict.tone === "go" && /Go now · open until 5 PM/.test(gpOpen.verdict.text),
    `Case 1 control (Open): open place with closing period states Go now · open until 5 PM (got ${JSON.stringify(gpOpen.verdict)})`);
}

// ── CASE 2: FREE PLACE ─────────────────────────────────────────────────────
{
  const freePlace = {
    id: "ChIJyWJV1WxAw4gRv8El830m2PY",
    name: "Sarasota Farmers Market",
    types: ["market", "tourist_attraction", "point_of_interest"],
    postalCity: "Sarasota",
    openNow: true,
  };
  const freeEd = {
    goodToKnow: "Free admission every Saturday morning from 7 AM to 1 PM along Lemon Avenue.",
    insiderMove: "Arrive before 8:30 AM for peak produce and easy street parking on 1st Street.",
  };
  ok(isVerifiedFreePlace(freePlace, freeEd) === true, "Case 2 (Free): verified free admission detected");
  const cta = resolveDetailCta({
    detail: freePlace,
    kind: "market",
    openState: true,
    locName: "Sarasota, FL",
    websiteHref: "https://www.sarasotafarmersmarket.org/",
    editorial: freeEd,
  });
  ok(cta.type === DETAIL_CTA_TYPES.directions && cta.monetized === false,
    `Case 2 (Free): free market keeps Directions primary instead of ticket CTA (got ${cta.type})`);
  const gp = buildGamePlan({ detail: freePlace, editorial: freeEd, primaryCta: cta, websiteHref: "https://www.sarasotafarmersmarket.org/" });
  const costRow = gp.rows.find((r) => r.key === "cost");
  ok(costRow && /^Free admission\b/.test(costRow.text), `Case 2 (Free): cost row states Free admission (got ${JSON.stringify(costRow)})`);
}

// ── CASE 3: PAID PLACE (INCL. THE RINGLING BLANK-CTA REGRESSION) ───────────
{
  const ringling = {
    id: "ChIJ6y2dx9g_w4gRWoZIRhLk-JI",
    name: "The John and Mable Ringling Museum of Art",
    types: ["museum", "tourist_attraction"],
    postalCity: "Sarasota",
    address: "5401 Bay Shore Rd, Sarasota, FL 34243, USA",
    openNow: true,
  };
  const ringlingEd = {
    why: "Waterfront museum estate with Old Master galleries, Ca' d'Zan mansion, and 66 acres of bayfront gardens.",
    goodToKnow: "Adults $30; Art Museum admission is free on Mondays. Plan 3 to 4 hours to cover the galleries and grounds.",
    officialWebsite: "https://www.ringling.org/",
  };
  ok(isVerifiedFreePlace(ringling, ringlingEd) === false,
    "Case 3 (Paid): paid museum with conditional 'free on Mondays' copy is NOT misclassified as unconditionally free");
  ok(isTicketedPlace(ringling, ringlingEd) === true, "Case 3 (Paid): museum recognized as ticketed");

  // 3a: Before website verdict completes, Ringling must NEVER resolve to a blank ticketnetwork search wrapper!
  const ctaPending = resolveDetailCta({ detail: ringling, kind: "museum", openState: true, locName: "Sarasota, FL", websiteHref: null, editorial: ringlingEd });
  ok(ctaPending.type === DETAIL_CTA_TYPES.directions && ctaPending.monetized === false,
    `Case 3a (Paid pending website): Ringling resolves cleanly to non-blank Directions, never dead ticketnetwork search (got ${JSON.stringify(ctaPending)})`);

  // 3b: Once /api/outbound/verdict confirms official website alive, Ringling upgrades to honest See admission!
  const ctaAlive = resolveDetailCta({
    detail: ringling,
    kind: "museum",
    openState: true,
    locName: "Sarasota, FL",
    websiteHref: "https://www.ringling.org/",
    editorial: ringlingEd,
  });
  ok(ctaAlive.type === DETAIL_CTA_TYPES.admission && ctaAlive.label === "See admission" && ctaAlive.href === "https://www.ringling.org/" && ctaAlive.monetized === false,
    `Case 3b (Paid official site): Ringling upgrades to honest See admission (got ${JSON.stringify(ctaAlive)})`);

  // 3c: Explicit ticket page upgrades to Official tickets
  const selby = {
    id: "ChIJPTvxtmpAw4gReToYD5mTNwE",
    name: "Marie Selby Botanical Gardens",
    types: ["botanical_garden", "museum", "tourist_attraction"],
    postalCity: "Sarasota",
    openNow: true,
  };
  const ctaOfficialTickets = resolveDetailCta({
    detail: selby,
    kind: "nature",
    openState: true,
    locName: "Sarasota, FL",
    websiteHref: "https://selby.org/visit/tickets/",
    editorial: { goodToKnow: "Timed tickets available online." },
  });
  ok(ctaOfficialTickets.type === DETAIL_CTA_TYPES.officialTickets && ctaOfficialTickets.label === "Official tickets" && ctaOfficialTickets.monetized === false,
    `Case 3c (Official tickets URL): upgrades to Official tickets (got ${JSON.stringify(ctaOfficialTickets)})`);

  // 3d: Exact real Ringling wf_editorial row ("Go Monday, when general admission is free." + "Budget several hours...")
  const ringlingRealDbEd = mapWfEditorial({
    verified: true,
    why_here: "John and Mable Ringling's waterfront estate combines an art museum, circus museum, Ca' d'Zan mansion, and bayfront grounds.",
    best_time: "Go Monday, when general admission is free.",
    know_before: "Open daily 10am-5pm, closed Thanksgiving, Christmas, and New Year's Day. Budget several hours — the art museum, mansion, and circus museum are separate experiences on one campus.",
  });
  ok(isVerifiedFreePlace(ringling, ringlingRealDbEd) === false,
    "Case 3d (Real Ringling DB row): 'Go Monday, when general admission is free.' is NOT treated as unconditional free admission");
  const gpRinglingReal = buildGamePlan({
    detail: ringling,
    editorial: ringlingRealDbEd,
    primaryCta: ctaAlive,
    websiteHref: "https://www.ringling.org/",
  });
  const ringlingCost = gpRinglingReal.rows.find((r) => r.key === "cost");
  const ringlingDur = gpRinglingReal.rows.find((r) => r.key === "duration");
  ok(ringlingCost && !/^Free admission/i.test(ringlingCost.text) && /Paid admission/i.test(ringlingCost.text),
    `Case 3d (Real Ringling DB row): cost row shows Paid admission, never Free admission (got ${JSON.stringify(ringlingCost)})`);
  ok(ringlingDur && /Budget several hours/i.test(ringlingDur.text),
    `Case 3d (Real Ringling DB row): extracts qualitative editorial duration 'Budget several hours...' (got ${JSON.stringify(ringlingDur)})`);

  // 3e: Exact real Selby Gardens Atlas card + poisoned LLM insightFull.caveat rejection
  const selbyAtlasEd = cardToEditorial({
    placeId: selby.id,
    name: selby.name,
    verdict: "Bayfront orchid and banyan sanctuary right on Sarasota Bay.",
    hours: "Daily 10am–5pm (closed Christmas); Downtown admission $28 adult, $12 ages 5–17, under 5 free",
    insiderMove: "Park free in the LEAF garage off Mound Street (the entrance moved there), catch the Museum of Botany & the Arts before its earlier 4:30pm close, and consider pairing Downtown with Historic Spanish Point in Osprey on a combo ticket.",
    foodMove: "Lunch at the Green Orchid by Michael's On East inside the gardens",
    officialWebsite: "https://selby.org/",
  });
  const gpSelbyReal = buildGamePlan({
    detail: selby,
    editorial: selbyAtlasEd,
    primaryCta: ctaOfficialTickets,
    websiteHref: "https://selby.org/",
    insightFull: {
      caveat: "Marie Selby Botanical Gardens is a botanical garden rather than a food venue, and the facts provided do not describe its food offerings.",
    },
  });
  const selbyJoined = gpSelbyReal.rows.map((r) => r.text).join(" | ");
  ok(!/rather than a food|facts provided/i.test(selbyJoined),
    `Case 3e (Selby LLM refusal guard): LLM insightFull.caveat prompt echo never enters Game Plan (got ${selbyJoined})`);
  const selbyParking = gpSelbyReal.rows.find((r) => r.key === "parking");
  const selbyInsider = gpSelbyReal.rows.find((r) => r.key === "insider_move");
  const selbyCost = gpSelbyReal.rows.find((r) => r.key === "cost");
  ok(selbyParking && /LEAF garage off Mound Street/i.test(selbyParking.text) && !/Museum of Botany/i.test(selbyParking.text),
    `Case 3e (Selby compound split): parking row isolates garage clause cleanly (got ${JSON.stringify(selbyParking)})`);
  ok(selbyInsider && /Catch the Museum of Botany/i.test(selbyInsider.text),
    `Case 3e (Selby compound split): insider move preserves remaining non-parking tip (got ${JSON.stringify(selbyInsider)})`);
  ok(selbyCost && /\$28 adult/i.test(selbyCost.text) && !/^Daily 10am/i.test(selbyCost.text),
    `Case 3e (Selby semicolon split): cost row extracts '$28 adult...' without repeating hours prefix (got ${JSON.stringify(selbyCost)})`);

  // Render full DetailSheet for Ringling and prove primary button is non-blank
  const ringlingHtml = renderToStaticMarkup(createElement(DetailSheet, {
    ctx: makeDetailCtx({ detail: { ...ringling, photo: "/guide-photos/sarasota-ringling.jpg", _liveDone: true }, initialEditorial: ringlingEd }),
  }));
  ok(ringlingHtml.includes("Your Game Plan") && ringlingHtml.includes("data-game-plan"), "Case 3f: DetailSheet renders Your Game Plan for Ringling");
  ok(!hasForbiddenPlaceholder(ringlingHtml), "Case 3f: Ringling DetailSheet contains zero placeholder strings");
}

// ── CASE 4: MISSING HOURS ──────────────────────────────────────────────────
{
  const unknownHoursPlace = {
    id: "ChIJMissingHours00000000001",
    name: "Quiet Courtyard Gallery",
    types: ["art_gallery", "point_of_interest"],
    postalCity: "Orlando",
    openNow: null,
    oh: null,
  };
  const gp = buildGamePlan({
    detail: unknownHoursPlace,
    detailExtra: null,
    editorial: { insiderMove: "Enter through the south courtyard gate off Park Ave." },
    weather: { temp: 76, wet: false, rain: 0 },
  });
  ok(gp.openState === null, "Case 4 (Missing hours): openState stays null when no hours exist");
  ok(!gp.verdict || (!/Go now/i.test(gp.verdict.text) && !/\bopen\b/i.test(gp.verdict.text)),
    `Case 4 (Missing hours): never claims Go now or Open when hours are unknown (got ${JSON.stringify(gp.verdict)})`);
  ok(!hasForbiddenPlaceholder(JSON.stringify(gp.rows)), "Case 4 (Missing hours): zero Unknown hours text in rows");
}

// ── CASE 5: MISSING EDITORIAL & ZERO EMPTY SHELLS ──────────────────────────
{
  const barePlace = {
    id: "ChIJBarePlace0000000000002",
    name: "Corner Landmark",
    types: ["point_of_interest"],
    postalCity: "Tampa",
    openNow: null,
  };
  const gpEmpty = buildGamePlan({ detail: barePlace, editorial: null, detailExtra: null });
  ok(gpEmpty.rows.length === 0, "Case 5a (Missing editorial): bare place produces 0 rows rather than filler");
  const emptyCardHtml = renderToStaticMarkup(createElement(YourGamePlan, {
    plan: gpEmpty,
    expanded: false,
    onToggleExpand: () => {},
    onOpenPlace: () => {},
    openExternal: () => {},
    isEvent: false,
    onTrip: false,
    onAddToItinerary: () => {},
    onAskSomeone: () => {},
  }));
  ok(emptyCardHtml === "", "Case 5a (Missing editorial): YourGamePlan returns null (empty markup) when 0 rows exist");

  // 2-row partial place -> renders 2 rows, no toggle, zero Unknown shells
  const twoFactPlace = {
    id: "ChIJTwoFactPlace0000000003",
    name: "Neighborhood Bistro",
    types: ["restaurant"],
    postalCity: "Orlando",
    priceNum: 2,
    openNow: true,
  };
  const gpTwo = buildGamePlan({
    detail: twoFactPlace,
    editorial: { goodToKnow: "Free garage parking validated for 2 hours on Central Blvd." },
    primaryCta: { type: "menu", href: "https://bistro.example/menu", monetized: false },
  });
  ok(gpTwo.rows.length === 2 && gpTwo.hasMore === false, `Case 5b (2 facts): builds 2 rows without toggle (got ${gpTwo.rows.length})`);
  const twoHtml = renderToStaticMarkup(createElement(YourGamePlan, {
    plan: gpTwo,
    expanded: false,
    onToggleExpand: () => {},
    onOpenPlace: () => {},
    openExternal: () => {},
    isEvent: false,
    onTrip: false,
    onAddToItinerary: () => {},
    onAskSomeone: () => {},
  }));
  ok((twoHtml.match(/data-game-plan-row=/g) || []).length === 2, "Case 5b: renders exactly 2 rows");
  ok(!twoHtml.includes("data-game-plan-toggle"), "Case 5b: hides expand toggle when <=3 rows");
  ok(!hasForbiddenPlaceholder(twoHtml), "Case 5b: zero Unknown/TBD shells in rendered partial Game Plan");
}

// ── CASE 6: STALE EVENT FILTERING ──────────────────────────────────────────
{
  const selbyVenue = {
    id: "ChIJPTvxtmpAw4gReToYD5mTNwE",
    name: "Marie Selby Botanical Gardens",
    types: ["botanical_garden", "tourist_attraction"],
    postalCity: "Sarasota",
    openNow: true,
  };
  const events = [
    {
      id: "ev-stale",
      place_id: selbyVenue.id,
      event_name: "October Pumpkin Nights",
      start_date: "2026-10-15",
      end_date: "2026-10-31",
      event_status: "scheduled",
      source_tier: 1,
      verification_confidence: "high",
      card_hook: "Autumn garden walk.",
      city: "Sarasota",
    },
    {
      id: "ev-lowconf",
      place_id: selbyVenue.id,
      event_name: "Unverified Draft Show",
      start_date: "2026-11-20",
      end_date: "2026-12-05",
      event_status: "scheduled",
      source_tier: 2,
      verification_confidence: "low",
      card_hook: "Draft event.",
      city: "Sarasota",
    },
    {
      id: "ev-live",
      place_id: selbyVenue.id,
      event_name: "Lights in Bloom",
      slug: "lights-in-bloom-sarasota",
      start_date: "2026-11-20",
      end_date: "2027-01-03",
      event_status: "scheduled",
      source_tier: 1,
      verification_confidence: "high",
      card_hook: "Two million lights across the bayfront tropical gardens.",
      city: "Sarasota",
      duration_recommendation: "Allow 90 minutes to walk the illuminated bayfront gardens.",
      parking_tip: "Free event parking on Mound St lot; arrive by 5:45 PM.",
    },
  ];
  const refNow = new Date("2026-11-12T17:00:00Z");
  const eligible = filterEligibleVenueEvents(events, selbyVenue, { now: refNow });
  ok(eligible.length === 1 && eligible[0].id === "ev-live",
    `Case 6 (Stale event): drops past & low-confidence events, keeps active/upcoming Lights in Bloom (got ${eligible.map((e) => e.id).join(",")})`);
  const gp = buildGamePlan({
    detail: selbyVenue,
    curatedEvents: events,
    nowMs: refNow.getTime(),
  });
  const allText = gp.rows.map((r) => r.text).join(" | ");
  ok(allText.includes("Lights in Bloom"), "Case 6 (Stale event): upcoming Lights in Bloom surfaces in Game Plan");
  ok(!allText.includes("October Pumpkin Nights") && !allText.includes("Unverified Draft Show"),
    "Case 6 (Stale event): stale and low-confidence events never leak into Game Plan");
}

// ── CASE 7: RAINY & HOT CONTEXT + INDOOR BACKUP ELEVATION ──────────────────
{
  const outdoorGarden = {
    id: "ChIJPTvxtmpAw4gReToYD5mTNwE",
    name: "Marie Selby Botanical Gardens",
    types: ["botanical_garden", "park", "tourist_attraction"],
    postalCity: "Sarasota",
    lat: 27.3268,
    lng: -82.5407,
    openNow: true,
  };
  const indoorMuseum = {
    id: "ChIJRyOEfAo5w4gR664aD_YYBLU",
    name: "Mote Science Education Aquarium",
    types: ["aquarium", "museum", "tourist_attraction"],
    postalCity: "Sarasota",
    lat: 27.3450,
    lng: -82.5440,
    wfScore: 9.2,
    openNow: true,
  };
  const middayMs = new Date("2026-11-12T18:30:00Z").getTime(); // 1:30 PM EST
  const backup = findIndoorBackup(outdoorGarden, [indoorMuseum], middayMs);
  ok(backup && backup.place.id === indoorMuseum.id, "Case 7a (Rainy): findIndoorBackup locates open nearby indoor aquarium/museum");

  const gpRain = buildGamePlan({
    detail: outdoorGarden,
    editorial: {
      bestTime: "Early morning right at 10 AM opening before midday sun.",
      goodToKnow: "Plan 2 hours to walk the bayfront conservatory and banyan groves. Free surface parking lot on site.",
      insiderMove: "Start at the Tropical Conservatory first, then loop out to the Mangrove Walkway.",
    },
    weather: { wet: true, rain: 85, temp: 75 },
    nearbyPlaces: [indoorMuseum],
    primaryCta: { type: "admission", href: "https://selby.org/", monetized: false },
    nowMs: middayMs,
  });
  ok(gpRain.verdict && gpRain.verdict.tone === "wait" && /Rainy now · indoor backup available/i.test(gpRain.verdict.text),
    `Case 7a (Rainy outdoor): verdict warns Rainy now · indoor backup available (got ${JSON.stringify(gpRain.verdict)})`);
  const top3Keys = gpRain.rows.slice(0, gpRain.visibleCount).map((r) => r.key);
  const nextRow = gpRain.rows.find((r) => r.key === "what_next");
  ok(top3Keys.includes("what_next") && nextRow && nextRow.text.includes("Mote Science Education Aquarium") && nextRow.action && nextRow.action.type === "place",
    `Case 7a (Rainy outdoor): rain elevates indoor backup into top 3 visible rows (top3=${top3Keys.join(",")})`);

  // Indoor museum in rain -> Go tone!
  const vIndoorRain = buildGamePlanVerdict({
    detail: indoorMuseum,
    openState: true,
    weather: { wet: true, rain: 80, temp: 74 },
    nowMs: middayMs,
  });
  ok(vIndoorRain && vIndoorRain.tone === "go" && /indoor rain-safe pick/i.test(vIndoorRain.text),
    `Case 7b (Rainy indoor): indoor museum gets indoor rain-safe pick verdict (got ${JSON.stringify(vIndoorRain)})`);

  // Hot 95F on outdoor park -> heat advisory!
  const vHot = buildGamePlanVerdict({
    detail: outdoorGarden,
    openState: true,
    weather: { wet: false, rain: 10, temp: 95 },
    nowMs: middayMs,
  });
  ok(vHot && vHot.tone === "wait" && /very hot/i.test(vHot.text),
    `Case 7c (Heat outdoor): 95F outdoor place warns very hot (got ${JSON.stringify(vHot)})`);
}

// ── CASE 8: NO PARTNER OFFER (HONEST MENU / RESERVE / DIRECTIONS) ──────────
{
  const restaurant = {
    id: "ChIJS0fk0SviwogRVpPveF0qH9w",
    name: "Hawkers Asian Street Food",
    types: ["restaurant", "food"],
    postalCity: "Orlando",
    priceNum: 2,
    openNow: true,
  };
  const ctaMenu = resolveDetailCta({
    detail: restaurant,
    kind: "dining",
    openState: true,
    locName: "Orlando, FL",
    websiteHref: "https://eathawkers.com/locations/orlando-mills-50/",
    editorial: { why: "Lively Mills 50 street-food kitchen known for roti canai and wok-seared noodles." },
  });
  ok(ctaMenu.type === DETAIL_CTA_TYPES.menu && ctaMenu.label === "See menu" && ctaMenu.href === "https://eathawkers.com/locations/orlando-mills-50/" && ctaMenu.monetized === false,
    `Case 8a (No partner restaurant): uses verified official website for See menu instead of Google Maps search (got ${JSON.stringify(ctaMenu)})`);
  ok(!/Book/i.test(ctaMenu.label), "Case 8a: never invents a Book button");

  const fineDining = {
    id: "ChIJReserveSpot00000000008",
    name: "Capa Steakhouse",
    types: ["restaurant", "steak_house"],
    postalCity: "Orlando",
    priceNum: 4,
    openNow: true,
  };
  const ctaReserve = resolveDetailCta({
    detail: fineDining,
    kind: "dining",
    openState: true,
    locName: "Orlando, FL",
    websiteHref: "https://www.opentable.com/r/capa-orlando",
    editorial: { insiderMove: "Reservations essential — book 30 minutes before fireworks." },
  });
  ok(ctaReserve.type === DETAIL_CTA_TYPES.reserve && ctaReserve.label === "Reserve" && ctaReserve.monetized === false,
    `Case 8b (Reservation restaurant): upgrades to honest Reserve CTA (got ${JSON.stringify(ctaReserve)})`);
}

// ── CASE 9: WRONG PARTNER CANDIDATE REJECTED ───────────────────────────────
{
  const wrongCityMuseum = {
    id: "ChIJBoiseMuseum00000000009",
    name: "Boise Art Museum",
    types: ["museum", "tourist_attraction"],
    postalCity: "Boise",
    address: "670 Julia Davis Dr, Boise, ID 83702, USA",
    openNow: true,
  };
  // Even if visitor locName is "Orlando, FL", place's own city is Boise -> must NOT attach Orlando partner tickets!
  const ctaWrong = resolveDetailCta({
    detail: wrongCityMuseum,
    kind: "museum",
    openState: true,
    locName: "Orlando, FL",
    viaTours: [{ title: "Orlando Museum Pass", url: "https://www.viator.com/tours/Orlando/pass/d663-1234" }],
  });
  ok(ctaWrong.monetized === false && ctaWrong.type === DETAIL_CTA_TYPES.directions,
    `Case 9 (Wrong partner candidate): out-of-market museum refuses Orlando partner tickets (got ${JSON.stringify(ctaWrong)})`);
}

// ── CASE 10: MULTIPLE PARTNER PRODUCTS -> EXACT PIN WINS, MERIT RANKING ────
{
  const orlandoEye = {
    id: "ChIJU7bqHVV-54gRJAwZAp5qCpk",
    name: "The Orlando Eye",
    types: ["tourist_attraction", "amusement_park"],
    postalCity: "Orlando",
    address: "8375 International Dr, Orlando, FL 32819, USA",
    openNow: true,
  };
  const ctaExact = resolveDetailCta({
    detail: orlandoEye,
    kind: "entertainment",
    openState: true,
    locName: "Orlando, FL",
    viaTours: [
      { title: "Generic Orlando Bus Tour", productCode: "99999P1" },
      { title: "Another Orlando Tour", productCode: "88888P2" },
    ],
  });
  ok(ctaExact.type === DETAIL_CTA_TYPES.tickets && ctaExact.exact === true && ctaExact.provider === "tiqets" && ctaExact.offerId === "orlando-hook-orlando-eye",
    `Case 10 (Multiple partner products): exact Tiqets venue pin deterministically beats generic tour candidates (got ${JSON.stringify(ctaExact)})`);
  ok(/Tickets at Tiqets/.test(ctaExact.label), `Case 10: exact partner ticket names merchant (${ctaExact.label})`);
  ok(detailCtaLabel(DETAIL_CTA_TYPES.tickets) === "Get tickets", "Case 10: canonical tickets verb is Get tickets, never Book");

  // BookingCTA primary click invokes onPrimaryClick once without throwing
  let primaryClicked = 0;
  const bookingHtml = renderToStaticMarkup(createElement(BookingCTA, {
    variant: "primary",
    detail: { id: "ChIJ_37IauQ_w4gRz03lc0QInIE", name: "Sarasota Jungle Gardens", types: ["zoo", "tourist_attraction"], postalCity: "Sarasota" },
    kind: "wildlife",
    viaTours: [{ title: "Sarasota Sightseeing", productCode: "5555P1" }],
    locName: "Sarasota, FL",
    logEvent: () => {},
    addReservation: () => {},
    openExternal: () => {},
    onPrimaryClick: () => { primaryClicked++; },
  }));
  ok(typeof bookingHtml === "string" && primaryClicked === 0, "Case 10: BookingCTA accepts onPrimaryClick prop cleanly on render");

  // Supermarkets carrying secondary 'bakery' type (e.g. Publix) must NEVER be suggested as a dessert pairing
  const yoders = {
    id: "ChIJIwZqEutAw4gR-1cOUgiln24",
    name: "Yoder's Restaurant",
    types: ["restaurant"],
    postalCity: "Sarasota",
    lat: 27.3195,
    lng: -82.4981,
    openNow: true,
  };
  const publix = {
    id: "ChIJPublix000000000000010",
    name: "Publix Super Market at Town and Country Shopping Center",
    primaryType: "supermarket",
    types: ["supermarket", "grocery_store", "bakery", "food", "store"],
    lat: 27.3350,
    lng: -82.5050,
    wfScore: 8.8,
    openNow: true,
  };
  const realGelato = {
    id: "ChIJGelato000000000000011",
    name: "Rise & Nye's Ice Cream",
    primaryType: "ice_cream_shop",
    types: ["ice_cream_shop", "dessert_shop", "cafe"],
    lat: 27.3360,
    lng: -82.5400,
    wfScore: 9.0,
    openNow: true,
  };
  const gpYoders = buildGamePlan({
    detail: yoders,
    nearbyPlaces: [publix, realGelato],
    nowMs: new Date("2026-11-12T23:30:00Z").getTime(),
  });
  const yodersNext = gpYoders.rows.find((r) => r.key === "what_next");
  ok(yodersNext && /Rise & Nye's/.test(yodersNext.text) && !/Publix/i.test(yodersNext.text),
    `Case 10 (Utility errand filter): skips Publix supermarket bakery and pairs with real dessert shop (got ${JSON.stringify(yodersNext)})`);
}

// ── CASE 11: MISSING PARKING + FLORIDA PARK-NAME FALSE-POSITIVE TRAP ───────
{
  const blueSpring = {
    id: "ChIJyYEUav8P54gRatuv_zQzm20",
    name: "Blue Spring State Park",
    types: ["park", "tourist_attraction"],
    postalCity: "Orange City",
    address: "2100 W French Ave, Orange City, FL 32763, USA",
  };
  const trapEditorial = {
    why: "Crystal-clear 72-degree manatee refuge in Blue Spring State Park, an easy morning drive from Winter Park and ICON Park.",
    insiderMove: "Walk the shaded boardwalk all the way to the spring boil, then compare with a theme park afternoon.",
  };
  const falsePositive = extractParkingIntel(blueSpring, trapEditorial, [], null);
  ok(falsePositive === null,
    `Case 11a (Park-name trap): State Park / Winter Park / ICON Park / theme park never misclassified as car parking (got ${JSON.stringify(falsePositive)})`);

  // Positive control: genuine parking guidance IS extracted and linked to #wf-place-parking-map
  const realParkingText = extractParkingIntel(
    blueSpring,
    { goodToKnow: "Free surface lot at the main entrance fills by 8:30 AM on winter manatee mornings." },
    [],
    null,
  );
  const gpWithParking = buildGamePlan({
    detail: blueSpring,
    editorial: { goodToKnow: "Free surface lot at the main entrance fills by 8:30 AM on winter manatee mornings." },
    nearbyParking: [{ id: "lot-1", name: "Main Entrance Lot" }],
  });
  const pRow = gpWithParking.rows.find((r) => r.key === "parking");
  ok(realParkingText && /Free surface lot/.test(realParkingText) && pRow && pRow.action && pRow.action.type === "scroll_parking",
    `Case 11b (Real parking control): genuine lot/garage guidance extracted with map jump (got ${JSON.stringify(pRow)})`);
}

// ── CASE 12: MOBILE PROGRESSIVE DISCLOSURE & SECTION HIERARCHY ─────────────
{
  const richPlace = {
    id: "ChIJ_37IauQ_w4gRz03lc0QInIE",
    name: "Sarasota Jungle Gardens",
    types: ["zoo", "tourist_attraction"],
    postalCity: "Sarasota",
    address: "3701 Bay Shore Rd, Sarasota, FL 34234, USA",
    lat: 27.3688,
    lng: -82.5535,
    wfScore: 9.0,
    openNow: true,
    photo: "/guide-photos/sarasota-jungle.jpg",
    _liveDone: true,
  };
  const richEd = {
    why: "Classic 1939 Old Florida tropical garden where hand-fed flamingos roam open walkways.",
    bestTime: "Arrive by 10 AM for the first bird and reptile shows before midday heat.",
    goodToKnow: "Plan 2 to 3 hours for the trails and shows. Free on-site parking lot right at the entrance.",
    insiderMove: "Buy flamingo food at the admission counter — they walk right up to you on the lagoon path.",
    officialWebsite: "https://sarasotajunglegardens.com/",
  };
  // Role "dinner" pairs with role "outing" across morning, afternoon, AND night dayparts.
  const nearbyBistro = {
    id: "ChIJNearbyBistro0000000012",
    name: "Bayfront Bistro",
    types: ["restaurant"],
    postalCity: "Sarasota",
    lat: 27.3695,
    lng: -82.5520,
    wfScore: 9.1,
    rating: 4.8,
    reviews: 410,
    openNow: true,
    photo: "/guide-photos/cafe.jpg",
  };
  ok(extractVerifiedDuration(richEd, []) !== null, "Case 12a: verified duration extracted from editorial");

  const cta = resolveDetailCta({
    detail: richPlace,
    kind: "wildlife",
    openState: true,
    locName: "Sarasota, FL",
    websiteHref: "https://sarasotajunglegardens.com/tickets/",
    editorial: richEd,
  });
  const gp = buildGamePlan({
    detail: richPlace,
    editorial: richEd,
    primaryCta: cta,
    websiteHref: "https://sarasotajunglegardens.com/tickets/",
    nearbyPlaces: [nearbyBistro],
  });
  ok(gp.rows.length >= 5, `Case 12a (Rich Game Plan): synthesizes >=5 verified rows (got ${gp.rows.length}: ${gp.rows.map((r) => r.key).join(",")})`);
  ok(gp.visibleCount === 3 && gp.hasMore === true && gp.hiddenCount === gp.rows.length - 3,
    "Case 12a (Progressive disclosure): caps initial view at 3 rows and exposes hiddenCount");

  const collapsedHtml = renderToStaticMarkup(createElement(YourGamePlan, {
    plan: gp,
    expanded: false,
    onToggleExpand: () => {},
    onOpenPlace: () => {},
    openExternal: () => {},
    isEvent: false,
    onTrip: false,
    onAddToItinerary: () => {},
    onAskSomeone: () => {},
  }));
  const expandedHtml = renderToStaticMarkup(createElement(YourGamePlan, {
    plan: gp,
    expanded: true,
    onToggleExpand: () => {},
    onOpenPlace: () => {},
    openExternal: () => {},
    isEvent: false,
    onTrip: true,
    onAddToItinerary: () => {},
    onAskSomeone: () => {},
  }));
  ok((collapsedHtml.match(/data-game-plan-row=/g) || []).length === 3, "Case 12b: collapsed mobile view renders at most 3 rows");
  ok((expandedHtml.match(/data-game-plan-row=/g) || []).length === gp.rows.length, "Case 12b: expanded view reveals all verified rows");
  ok(collapsedHtml.includes("More before you go") && expandedHtml.includes("Fewer details"), "Case 12b: toggle copy updates cleanly");
  ok(collapsedHtml.includes("+ Add to itinerary") && expandedHtml.includes("✓ On itinerary"), "Case 12b: canonical itinerary state reflects onTrip");
  ok(collapsedHtml.includes("Ask someone") && collapsedHtml.includes("data-game-plan-ask"), "Case 12b: Ask someone button rendered");

  // Full DetailSheet hierarchy check: Primary Action -> Your Game Plan -> Decision Content -> Parking -> Creator/Upload/Review
  const fullHtml = renderToStaticMarkup(createElement(DetailSheet, {
    ctx: makeDetailCtx({
      detail: richPlace,
      initialEditorial: richEd,
      places: [nearbyBistro],
      suggested: [nearbyBistro],
    }),
  }));
  const idxDock = fullHtml.indexOf("data-detail-secondary-actions");
  const idxGamePlan = fullHtml.indexOf("data-game-plan");
  const idxWhyPicked = fullHtml.indexOf("Why Wayfind picked this");
  const idxWhereNext = fullHtml.indexOf("data-where-to-go-next");
  const idxParkingMap = fullHtml.indexOf("wf-place-parking-map");
  const idxBeenHere = fullHtml.indexOf("Been here?");
  const idxCommunity = fullHtml.indexOf("wf-community-takes");
  ok(idxDock > 0 && idxGamePlan > idxDock, "Case 12c (Hierarchy): YOUR GAME PLAN sits immediately below primary action dock");
  ok(idxWhyPicked > idxGamePlan && idxWhereNext > idxGamePlan && idxParkingMap > idxGamePlan,
    "Case 12c (Hierarchy): YOUR GAME PLAN precedes deeper editorial, Where to go next, and full parking map");
  ok(idxBeenHere > idxWhereNext && idxBeenHere > idxParkingMap && idxCommunity > idxBeenHere,
    "Case 12c (Hierarchy): review/upload nudges sit BELOW decision intelligence, pairings, and parking");
}

// ── CASE 13: SLOW CONNECTION + DATA PIPELINES + ITINERARY + ASK SOMEONE ────
{
  // 13a: Slow connection (detailExtra=null, editorial=null, websiteHref=null, openState=null)
  const slowPlace = {
    id: "ChIJRyOEfAo5w4gR664aD_YYBLU",
    name: "Mote Science Education Aquarium",
    types: ["aquarium", "museum", "tourist_attraction"],
    postalCity: "Sarasota",
    lat: 27.3450,
    lng: -82.5440,
    wfScore: 9.2,
    openNow: null,
    oh: null,
    _liveDone: true,
  };
  const slowHtml = renderToStaticMarkup(createElement(DetailSheet, {
    ctx: makeDetailCtx({ detail: slowPlace, detailExtra: null, initialEditorial: null, insight: null }),
  }));
  ok(slowHtml.includes("Mote Science Education Aquarium") && slowHtml.includes("Hours unavailable"),
    "Case 13a (Slow connection): renders cleanly while async detailExtra and editorial are still in flight");
  ok(!hasForbiddenPlaceholder(slowHtml) && !slowHtml.includes("Go now"),
    "Case 13a (Slow connection): never flashes Go now or Unknown placeholders on slow connection");

  // When detailExtra arrives with Google periods, hydrateDetailHours unlocks structured timing
  const hydrated = hydrateDetailHours(slowPlace, {
    oh: { periods: [{ open: { day: 4, hour: 9, minute: 30 }, close: { day: 4, hour: 17, minute: 0 } }], weekdayDescriptions: ["Thursday: 9:30 AM – 5:00 PM"] },
  });
  ok(hydrated.oh && Array.isArray(hydrated.oh.periods) && hydrated.oh.periods.length === 1,
    "Case 13b (Hydration): hydrateDetailHours attaches detailExtra.oh.periods when wf_inventory card lacked periods");

  // Editorial pipeline preserves facts + officialWebsite + hoursText
  const mappedWf = mapWfEditorial({
    verified: true,
    why_here: "Brand-new aquarium campus with multi-story Gulf habitats.",
    facts: [{ claim: "Plan 2 to 3 hours for all three floors." }, { claim: "Free parking in the Nathan Benderson lot." }],
  });
  ok(mappedWf && Array.isArray(mappedWf.facts) && mappedWf.facts.length === 2,
    "Case 13c (wf_editorial): mapWfEditorial preserves verified facts[] claims");
  const mappedAtlas = cardToEditorial({
    whyItStandsOut: "Historic bayfront gardens.",
    hours: "Daily 10 AM – 5 PM",
    officialWebsite: "https://selby.org/",
  });
  ok(mappedAtlas.officialWebsite === "https://selby.org/" && mappedAtlas.hoursText === "Daily 10 AM – 5 PM",
    "Case 13c (Atlas): cardToEditorial exposes officialWebsite and hoursText");

  // 13d: Canonical itinerary filing (wf_inventory postalCity without comma-formatted address)
  ok(parseCityState({}).city === null && parseCityState({}).state === null,
    "Case 13d control: empty place still parses to null city/state");
  const parsedSarasota = parseCityState({ postalCity: "Sarasota", lat: 27.3364, lng: -82.5307 });
  ok(parsedSarasota.city === "Sarasota" && parsedSarasota.state === "FL",
    `Case 13d (Canonical itinerary): postalCity + FL coords resolves Sarasota, FL (got ${JSON.stringify(parsedSarasota)})`);
  const filed = addPlaceToTrips({}, slowPlace);
  ok(Boolean(filed.fl_sarasota && filed.fl_sarasota.city === "Sarasota" && filed.fl_sarasota.state === "FL" && filed.fl_sarasota.items[0].id === slowPlace.id),
    `Case 13d (Canonical itinerary): wf_inventory place files into Sarasota, FL trip instead of Unsorted (got ${JSON.stringify(filed)})`);

  // 13e: Ask someone direct invite mode (`startInInvite: true` + `geo` fallback)
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  try {
    const appended = [];
    const makeEl = (tag) => {
      let _txt = "";
      return {
        tag,
        style: {},
        children: [],
        get textContent() { return _txt; },
        set textContent(v) { _txt = String(v ?? ""); this.children = []; },
        value: "",
        appendChild(c) { this.children.push(c); return c; },
        setAttribute() {},
        addEventListener() {},
        remove() {},
        focus() {},
      };
    };
    globalThis.document = {
      getElementById: () => null,
      createElement: makeEl,
      addEventListener: () => {},
      removeEventListener: () => {},
      body: { appendChild(el) { appended.push(el); return el; } },
    };
    globalThis.window = { location: { origin: "https://www.gowayfind.com" } };
    const shareSheetMod = await loadComponent(
      fileURLToPath(new URL("../app/components/shareIntentSheet.js", import.meta.url)),
      REPO,
    );
    const { askShareIntent } = shareSheetMod;
    const collectText = (n) => [n.textContent || "", ...(n.children || []).map(collectText)].join(" ");
    // Positive control: default share button shows 'Just share it'
    askShareIntent({
      name: "Marie Selby Botanical Gardens",
      city: "Sarasota",
      id: "ChIJPTvxtmpAw4gReToYD5mTNwE",
      kind: ["explore"],
      startInInvite: false,
      onPlain: () => {},
      onInvite: () => true,
    });
    const plainModalText = appended.map(collectText).join(" ");
    ok(plainModalText.includes("Just share it"), "Case 13e control: default share shows Just share it");

    appended.length = 0;
    let invitedUrl = null;
    askShareIntent({
      name: "Marie Selby Botanical Gardens",
      city: "Sarasota",
      id: "ChIJPTvxtmpAw4gReToYD5mTNwE",
      kind: ["explore"],
      geo: [27.3268, -82.5407],
      startInInvite: true,
      onPlain: () => {},
      onInvite: (u) => { invitedUrl = u; return true; },
    });
    const modalText = appended.map(collectText).join(" ");
    ok(modalText.includes("Who are you asking?") && !modalText.includes("Just share it"),
      `Case 13e (Ask someone): startInInvite opens directly on 'Who are you asking?' (got ${JSON.stringify(modalText.trim())})`);
    ok(invitedUrl === null, "Case 13e: waits for synchronous user tap before firing share sheet");
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
}

// ── CASE 14: OPTIONAL PAID TOURS REMAIN DISTINCT FROM FREE PARK ADMISSION ──
{
  const PlacePageBookLinkMod = await loadComponent(
    fileURLToPath(new URL("../app/components/PlacePageBookLink.js", import.meta.url)),
    REPO,
  );
  const PlacePageBookLink = PlacePageBookLinkMod.default;

  const freeParkWithTourCases = [
    {
      id: "ChIJ5_NkHLUcw4gRndvLQGe_Ox8",
      name: "Shell Key Preserve",
      postalCity: "Tierra Verde",
      types: ["park", "tourist_attraction", "point_of_interest"],
      lat: 27.6648,
      lng: -82.7393,
      openNow: true,
      _liveDone: true,
    },
    {
      id: "ChIJJ3XVfEhrw4gRY3oXQ874Cco",
      name: "Ted Sperling Park",
      postalCity: "Sarasota",
      types: ["park", "tourist_attraction", "point_of_interest"],
      lat: 27.3025,
      lng: -82.5675,
      openNow: true,
      _liveDone: true,
    },
  ];

  for (const park of freeParkWithTourCases) {
    const adm = resolveAdmissionTruth(park, null);
    ok(adm.status === ADMISSION_STATUS.FREE && adm.requiresTicket === false,
      `Case 14a (${park.name}): admission truth remains FREE with requiresTicket=false (got ${adm.status} / ${adm.requiresTicket})`);

    const cta = resolveDetailCta({
      detail: park,
      kind: "nature",
      openState: true,
      locName: `${park.postalCity}, FL`,
    });
    ok(cta.product === "tour" && /Tours at Viator/.test(cta.label) && !/Tickets/i.test(cta.label),
      `Case 14b (${park.name}): resolveDetailCta preserves product='tour' and Tours label, never Tickets (got ${cta.product} / ${cta.label})`);

    const gp = buildGamePlan({
      detail: park,
      editorial: { goodToKnow: "Arrive before 9:30 AM for calm water and easy launch parking." },
      primaryCta: cta,
      openState: true,
    });
    const costRow = gp.rows.find((r) => r.key === "cost");
    ok(costRow && costRow.label === "Admission & tours" && costRow.text === "Free park entry · Optional guided tours via Viator" && costRow.action && costRow.action.kind === "partner_tour",
      `Case 14c (${park.name}): Game Plan distinguishes free park entry from optional guided tour (got ${JSON.stringify(costRow)})`);

    const sheetHtml = renderToStaticMarkup(createElement(DetailSheet, {
      ctx: makeDetailCtx({
        detail: park,
        initialEditorial: { goodToKnow: "Arrive before 9:30 AM for calm water and easy launch parking." },
        locName: `${park.postalCity}, FL`,
      }),
    }));
    ok(sheetHtml.includes(`aria-label="Tours for ${park.name} via Viator"`) && !sheetHtml.includes(`aria-label="Tickets for ${park.name}`),
      `Case 14d (${park.name}): DetailSheet primary CTA aria-label says Tours, never Tickets`);
    ok(sheetHtml.includes("Free park entry · Optional guided tours via Viator") && sheetHtml.includes("We may earn a commission if you book through them. It never changes our rankings."),
      `Case 14e (${park.name}): DetailSheet renders explicit free-entry note alongside FTC partner disclosure`);

    const placePageCtaHtml = renderToStaticMarkup(createElement(PlacePageBookLink, {
      provider: cta.provider,
      offerId: cta.offerId,
      contentId: park.id,
      merchant: cta.merchant,
      product: cta.product,
    }));
    ok(placePageCtaHtml.includes("Tours at Viator") && !placePageCtaHtml.includes("Tickets at Viator"),
      `Case 14f (${park.name}): PlacePageBookLink renders Tours at Viator, never Tickets at Viator`);
  }

  // Commercial tour operator control: Get Up and Go Kayaking - Shell Key Preserve is NOT a free public park,
  // and its Game Plan cost row describes tours rather than venue admission tickets.
  const kayakOperator = {
    id: "ChIJk04qcKEdw4gRHykY4WhCYBI",
    name: "Get Up and Go Kayaking - Shell Key Preserve",
    postalCity: "Tierra Verde",
    types: ["tour_agency", "tourist_attraction", "point_of_interest"],
    lat: 27.6815,
    lng: -82.7244,
    openNow: true,
  };
  const opAdm = resolveAdmissionTruth(kayakOperator, null);
  ok(opAdm.status !== ADMISSION_STATUS.FREE,
    `Case 14g (Commercial operator control): tour_agency with park name in title is not marked FREE public park (got ${opAdm.status})`);
  const opCta = resolveDetailCta({ detail: kayakOperator, kind: "entertainment", openState: true, locName: "Tierra Verde, FL" });
  const opGp = buildGamePlan({
    detail: kayakOperator,
    editorial: { goodToKnow: "Plan 2.5 hours on the water." },
    primaryCta: opCta,
    openState: true,
  });
  const opCost = opGp.rows.find((r) => r.key === "cost");
  ok(opCost && opCost.label === "Tours & pricing" && opCost.text === "Guided tours available via Viator",
    `Case 14h (Commercial operator control): tour operator uses Tours & pricing copy, never tickets (got ${JSON.stringify(opCost)})`);
}

if (fail.length) {
  console.error(`test-game-plan: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-game-plan: OK — ${pass} assertions across all 13 red-team scenarios + rendered DetailSheet hierarchy`);
