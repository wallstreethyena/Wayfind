// Red-team guard for Place Detail "Your Game Plan" decision brief (lib/gamePlan.js),
// Commerce Entity-Resolution guard (lib/experienceEntityResolution.js), and
// real DetailSheet rendering + telemetry wiring.
//
// Enforces:
//   1. Closed places and unknown-hours places NEVER receive "Go now".
//   2. Missing data NEVER fabricates duration, cost, timing, or parking prose.
//   3. Supported duration, timing, cost, parking, and insider moves extract cleanly
//      without sentence duplication.
//   4. Beaches and bare free parks NEVER receive paid ticket CTAs.
//   5. Pass-by tours (The Ringling), launch-site mismatches (Kelly Park vs Kings Landing),
//      and cross-city/cross-state offers fail closed (tier === "WRONG" / null).
//   6. Verified EXACT pins (108117P1, 123164P1, 123164P2, 5642110P1,
//      staugustine-hook-old-town-trolley, orlando-budget-iride-trolley) resolve
//      cleanly through placePartnerPick, venueOfferFor, and resolveDetailCta.
//   7. Tickety attractions without an affiliate pin surface Official site & admission
//      when a verified websiteHref is available.
//   8. Wet weather on an outdoor venue with an indoor nearby option surfaces a
//      Rain backup nearby pivot.
//   9. Affiliate / partner status never alters wfScore organic ranking.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  GAME_PLAN_CONFIDENCE,
  extractSupportedDuration,
  extractSupportedWhen,
  extractSupportedParking,
  extractSupportedCost,
  extractSupportedInsiderMove,
  buildGamePlan,
} from "../lib/gamePlan.js";
import {
  ENTITY_RESOLUTION_TIERS,
  resolveExperienceEntityMatch,
  auditEntityResolutionBatch,
} from "../lib/experienceEntityResolution.js";
import { placePartnerPick } from "../lib/placePartnerPicks.js";
import { venueOfferFor } from "../lib/venueOffers.js";
import { resolveDetailCta, detailVerdict } from "../lib/detailCta.js";
import { wayfindScore } from "../lib/wayfindScore.js";
import { conditionsAdjust } from "../lib/ranking.js";

let checks = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  checks += 1;
}

// ── 1. CLOSED & UNKNOWN HOURS NEVER SAY "GO NOW" ──────────────────────────
{
  const place = {
    id: "ca-dzan",
    name: "Ca' d'Zan",
    city: "Sarasota",
    state: "FL",
    types: ["museum", "tourist_attraction"],
  };
  const vClosed = detailVerdict({ detail: place, weather: { temp: 78, code: 0 }, openState: false });
  ok(vClosed && vClosed.tone === "wait" && !/go now/i.test(vClosed.text), "detailVerdict returns wait and never Go now when openState is false");

  const gpClosed = buildGamePlan({
    detail: place,
    editorial: {
      bestFor: "Architecture & bayfront history",
      goodToKnow: "Arrive before 10:30 AM for the first docent entry. Allow 90 minutes for the mansion and terrace.",
      watchOut: "$25 adult admission; grounds included with museum ticket.",
      insiderMove: "Walk out to the marble terrace before the midday tour groups arrive.",
    },
    verdict: { text: "Go now — great weather", tone: "go" }, // adversarial caller input
    openState: false,
    weather: { temp: 78, code: 0 },
  });
  ok(gpClosed.show === true, "closed place with rich editorial still shows Game Plan for trip planning");
  const shouldGoClosed = gpClosed.rows.find((r) => r.key === "should_go");
  ok(shouldGoClosed && shouldGoClosed.tone === "wait", "closed place sets should_go tone to wait");
  ok(!/go now/i.test(shouldGoClosed.value), "closed place never says Go now even if adversarial verdict passed");
  ok(/closed now/i.test(shouldGoClosed.value), "closed place explicitly states closed now");

  const gpUnknownHours = buildGamePlan({
    detail: place,
    editorial: {
      bestFor: "Bayfront mansion visit",
      goodToKnow: "Plan about 2 hours for the mansion and grounds.",
    },
    verdict: { text: "Go now — clear skies", tone: "go" },
    openState: null,
  });
  const shouldGoUnknown = gpUnknownHours.rows.find((r) => r.key === "should_go");
  ok(shouldGoUnknown && !/go now/i.test(shouldGoUnknown.value), "unknown hours (openState=null) strips Go now");
}

// ── 2. MISSING DATA NEVER FABRICATES PROSE ────────────────────────────────
{
  const barePlace = {
    id: "bare-place",
    name: "Neighborhood Corner Spot",
    city: "Sarasota",
    types: ["point_of_interest"],
  };
  const gpBare = buildGamePlan({
    detail: barePlace,
    editorial: null,
    detailExtra: null,
    verdict: { text: "Open now — good time to go", tone: "go" },
    openState: true,
    weather: null,
    insider: {},
    wayfindNotesList: null,
    primaryCta: { type: "directions", label: "Get directions", monetized: false },
    websiteHref: null,
    nearbyPicks: [],
    nearbyPool: [],
  });
  ok(gpBare.show === false, "bare place with only openNow status and no substantive planning facts hides Game Plan");
  ok(gpBare.rows.length === 0, "bare place emits zero fabricated rows");
  ok(extractSupportedDuration({ editorial: { hook: "Great local vibe with 2 patios and 3 dining rooms." } }) === null, "numbers without time units are never mistaken for visit duration");
  ok(extractSupportedDuration({ editorial: { goodToKnow: "Walk 10 minutes north of the bridge." } }) === null, "walking distance in minutes is not mistaken for total visit duration");
}

// ── 3. SUPPORTED DURATION, TIMING, COST, PARKING & INSIDER EXTRACTION ─────
{
  const richPlace = {
    id: "selby-gardens",
    name: "Marie Selby Botanical Gardens",
    city: "Sarasota",
    state: "FL",
    types: ["botanical_garden", "tourist_attraction"],
  };
  const gpRich = buildGamePlan({
    detail: richPlace,
    editorial: {
      bestFor: "Bayfront orchids, banyans & shade walk",
      goodToKnow: "Arrive before 10 AM to beat the tour buses. Allow 1.5 to 2 hours to walk the bayfront loop and conservatory. Free parking in the surface lot across Mound Street.",
      watchOut: "Tickets are $28 for adults; children under 5 enter free.",
      insiderMove: "Start at the mangrove boardwalk on Sarasota Bay before heading into the Tropical Conservatory.",
    },
    verdict: { text: "Go now — 76° and clear", tone: "go" },
    openState: true,
    weather: { temp: 76, code: 0 },
    primaryCta: { type: "directions", label: "Get directions", monetized: false },
    websiteHref: "https://selby.org",
    nearbyPicks: [{ p: { id: "bay-park", name: "The Bay Park", lat: 27.339, lng: -82.548 }, reason: "Free sunset bayfront walk 5 mins north" }],
  });
  ok(gpRich.show === true, "rich place shows Game Plan");
  ok(gpRich.primaryRows.length === 4, "progressive disclosure caps initial visible rows at 4");
  ok(gpRich.secondaryRows.length >= 2, "remaining verified rows live in secondaryRows behind progressive disclosure");

  const byKey = Object.fromEntries(gpRich.rows.map((r) => [r.key, r]));
  ok(byKey.should_go && /Go now/i.test(byKey.should_go.value), "open place with clear weather preserves Go now");
  ok(byKey.when && /10 AM/i.test(byKey.when.value), "extracts supported arrival window");
  ok(byKey.duration && /1\.5 to 2 hours/i.test(byKey.duration.value), "extracts supported visit duration");
  ok(byKey.cost && /\$28/i.test(byKey.cost.value), "extracts supported admission cost fact");
  ok(byKey.cost.action && byKey.cost.action.kind === "official_admission" && byKey.cost.action.href === "https://selby.org", "attaches verified official admission link when tickety venue lacks affiliate pin");
  ok(byKey.parking && /Free parking/i.test(byKey.parking.value), "extracts supported parking logistics");
  ok(byKey.insider_move && /mangrove boardwalk/i.test(byKey.insider_move.value), "extracts distinct insider move without repeating timing/parking sentence");
  ok(byKey.what_next && byKey.what_next.value === "The Bay Park", "includes geographically paired next stop");
}

// ── 4. FREE BEACHES & PARKS NEVER RECEIVE PAID TICKET CTAS ────────────────
{
  const siesta = {
    id: "siesta-beach",
    name: "Siesta Beach",
    city: "Sarasota",
    state: "FL",
    types: ["beach", "natural_feature", "park"],
    lat: 27.2658,
    lng: -82.5518,
  };
  ok(placePartnerPick(siesta) === null, "placePartnerPick returns null for Siesta Beach");
  ok(venueOfferFor(siesta.name, "Sarasota") === null, "venueOfferFor returns null for Siesta Beach");

  const beachMatch = resolveExperienceEntityMatch(siesta, {
    product_code: "136885P1",
    title: "Electric Bike Siesta Key Sunset Tour",
    city: "Sarasota",
    link_ok: true,
    fail_count: 0,
  });
  ok(beachMatch.tier === ENTITY_RESOLUTION_TIERS.WRONG && beachMatch.reason === "beach-never-bookable", "entity resolution vetoes paid tour attachment to a beach");

  const gpBeach = buildGamePlan({
    detail: siesta,
    editorial: {
      bestFor: "Quartz-sand sunset & swimming",
      beachExtras: { parking: "Main lot fills by 10 AM on weekends — use the free trolley from Siesta Village." },
    },
    verdict: { text: "Go now — 82° beach weather", tone: "go" },
    openState: true,
    primaryCta: { type: "tickets", label: "Check availability", monetized: true, provider: "viator", merchant: "Viator" }, // even if passed adversarially
  });
  const beachCost = gpBeach.rows.find((r) => r.key === "cost");
  ok(!beachCost || !/partner|viator|ticket/i.test(beachCost.value), "buildGamePlan never renders a paid partner ticket row on a beach");
  const beachParking = gpBeach.rows.find((r) => r.key === "parking");
  ok(beachParking && /Main lot fills by 10 AM/i.test(beachParking.value), "buildGamePlan reads editorial.beachExtras.parking for beaches");
}

// ── 5. ENTITY RESOLUTION NEGATIVE CONTROLS (RINGLING, KELLY PARK, CROSS-CITY) ──
{
  const ringling = {
    id: "the-ringling",
    name: "The Ringling",
    city: "Sarasota",
    state: "FL",
    types: ["museum", "tourist_attraction"],
    lat: 27.3815,
    lng: -82.5631,
  };
  const ringlingTrolley = resolveExperienceEntityMatch(ringling, {
    product_code: "454941P1",
    title: "Discover Sarasota Tours Sightseeing Trolley",
    city: "Sarasota",
    link_ok: true,
    fail_count: 0,
  });
  ok(ringlingTrolley.tier === ENTITY_RESOLUTION_TIERS.WRONG, "The Ringling pass-by trolley is rejected as WRONG");

  const kellyPark = {
    id: "kelly-park",
    name: "Kelly Park - Rock Springs",
    city: "Apopka",
    state: "FL",
    types: ["park", "tourist_attraction"],
    lat: 28.7564,
    lng: -81.5015,
  };
  const kellyKayak = resolveExperienceEntityMatch(kellyPark, {
    product_code: "123164P1",
    title: "Clear Kayak Tours in Rock Springs",
    city: "Orlando",
    link_ok: true,
    fail_count: 0,
  });
  ok(kellyKayak.tier === ENTITY_RESOLUTION_TIERS.WRONG, "Kelly Park county tubing park is kept separate from Kings Landing clear kayak launch (123164P1)");
  ok(placePartnerPick(kellyPark) === null, "placePartnerPick keeps Kelly Park - Rock Springs unpinned");

  const crossState = resolveExperienceEntityMatch(
    { name: "Sea Life Kayak Adventures", city: "Boise", state: "ID", types: ["tourist_attraction"] },
    { product_code: "108117P1", title: "Mangrove Tunnel Kayak Tour", city: "Sarasota", state: "FL", link_ok: true }
  );
  ok(crossState.tier === ENTITY_RESOLUTION_TIERS.WRONG && crossState.reason === "cross-state-mismatch", "Idaho venue never matches a Florida experience");

  const crossMetro = resolveExperienceEntityMatch(
    { name: "Historic Walking Tour", city: "Miami", state: "FL", types: ["tourist_attraction"] },
    { product_code: "5642110P1", title: "Historic Ybor City Food and Culture Walking Tour", city: "Tampa", state: "FL", link_ok: true }
  );
  ok(crossMetro.tier === ENTITY_RESOLUTION_TIERS.WRONG && crossMetro.reason === "wrong-city-or-metro", "Miami venue never matches a Tampa experience");
}

// ── 6. VERIFIED EXACT PINS RESOLVE ACROSS ALL COMMERCE SURFACES ───────────
{
  const verifiedCases = [
    {
      place: { id: "sea-life-srq", name: "Sea Life Kayak Adventures", city: "Sarasota", state: "FL", types: ["tourist_attraction"], lat: 27.3025, lng: -82.5675 },
      offerId: "108117P1",
      provider: "viator",
      title: "Mangrove Tunnel Kayak Tour",
    },
    {
      place: { id: "ted-sperling", name: "Ted Sperling Park at South Lido Beach", city: "Sarasota", state: "FL", types: ["park", "tourist_attraction"], lat: 27.3025, lng: -82.5675 },
      offerId: "108117P1",
      provider: "viator",
      title: "Mangrove Tunnel Kayak Tour",
    },
    {
      place: { id: "gug-rock-springs", name: "Get Up And Go Kayaking - Rock Springs", city: "Apopka", state: "FL", types: ["tourist_attraction"], lat: 28.7495, lng: -81.5038 },
      offerId: "123164P1",
      provider: "viator",
      title: "Clear Kayak Tours in Rock Springs",
    },
    {
      place: { id: "kings-landing", name: "Kings Landing", city: "Apopka", state: "FL", types: ["tourist_attraction"], lat: 28.7495, lng: -81.5038 },
      offerId: "123164P1",
      provider: "viator",
      title: "Clear Kayak Tours in Rock Springs",
    },
    {
      place: { id: "gug-merritt", name: "Get Up And Go Kayaking - Merritt Island", city: "Titusville", state: "FL", types: ["tourist_attraction"], lat: 28.612, lng: -80.728 },
      offerId: "123164P2",
      provider: "viator",
      title: "Bioluminescent Clear Kayak Tours in Titusville",
    },
    {
      place: { id: "ybor-museum", name: "Ybor City Museum State Park", city: "Tampa", state: "FL", types: ["museum", "tourist_attraction"], lat: 27.9614, lng: -82.4381 },
      offerId: "5642110P1",
      provider: "viator",
      title: "Historic Ybor City Food and Culture Walking Tour",
    },
    {
      place: { id: "ott-sta", name: "Old Town Trolley Tours St. Augustine", city: "St. Augustine", state: "FL", types: ["tourist_attraction"], lat: 29.8978, lng: -81.3145 },
      offerId: "staugustine-hook-old-town-trolley",
      provider: "tiqets",
      title: "Old Town Trolley Tours St. Augustine",
    },
    {
      place: { id: "iride-orl", name: "I-Ride Trolley Orlando", city: "Orlando", state: "FL", types: ["tourist_attraction"], lat: 28.4442, lng: -81.4701 },
      offerId: "orlando-budget-iride-trolley",
      provider: "tiqets",
      title: "I-Ride Trolley Orlando",
    },
  ];

  for (const c of verifiedCases) {
    const pick = placePartnerPick(c.place);
    ok(pick && pick.offerId === c.offerId && pick.provider === c.provider, `placePartnerPick resolves ${c.place.name} -> ${c.offerId}`);
    if (c.provider === "tiqets") {
      const vOffer = venueOfferFor(c.place.name, c.place.city);
      ok(vOffer && vOffer.offerId === c.offerId && vOffer.provider === c.provider, `venueOfferFor resolves ${c.place.name} -> ${c.offerId}`);
    }
    const cta = resolveDetailCta({
      detail: c.place,
      kind: "entertainment",
      viaTours: {},
      locName: c.place.city,
      offers: {},
      openState: true,
    });
    ok(cta && cta.monetized === true && cta.exact === true && cta.offerId === c.offerId, `resolveDetailCta promotes exact monetized CTA for ${c.place.name}`);
    const entityRes = resolveExperienceEntityMatch(c.place, {
      product_code: c.offerId,
      provider: c.provider,
      title: c.title,
      city: c.place.city,
      state: "FL",
      link_ok: true,
      fail_count: 0,
    });
    ok(entityRes.tier === ENTITY_RESOLUTION_TIERS.EXACT && entityRes.eligibleForPrimaryCta === true, `resolveExperienceEntityMatch scores ${c.place.name} as EXACT`);
  }

  const batchAudit = auditEntityResolutionBatch(verifiedCases.map((c) => c.place));
  ok(batchAudit.EXACT.length === verifiedCases.length && batchAudit.WRONG.length === 0, "auditEntityResolutionBatch confirms all 8 verified mappings are EXACT");
}

// ── 7. WET WEATHER SURFACES INDOOR NEARBY PIVOT ───────────────────────────
{
  const outdoorGarden = {
    id: "outdoor-park",
    name: "Bayfront Park",
    city: "Sarasota",
    types: ["park", "tourist_attraction"],
    lat: 27.331,
    lng: -82.545,
  };
  const indoorMuseum = {
    id: "indoor-museum",
    name: "Sarasota Art Museum",
    city: "Sarasota",
    types: ["museum", "art_gallery"],
    lat: 27.326,
    lng: -82.531,
  };
  const gpWet = buildGamePlan({
    detail: outdoorGarden,
    editorial: {
      bestFor: "Bayfront views",
      goodToKnow: "Allow 1 hour for the loop.",
    },
    verdict: { text: "Wait for a dry window", tone: "wait" },
    openState: true,
    weather: { temp: 74, wet: true, rain: 85 },
    nearbyPool: [indoorMuseum],
  });
  ok(gpWet.show === true && gpWet.weatherPivot && gpWet.weatherPivot.id === "indoor-museum", "wet weather on outdoor place surfaces indoor rain backup");
  const rainRow = gpWet.rows.find((r) => r.key === "what_next");
  ok(rainRow && rainRow.label === "Rain backup nearby" && rainRow.value === "Sarasota Art Museum", "Rain backup nearby row names the indoor museum");
}

// ── 8. ORGANIC RANKING INDEPENDENCE (WAYFINDSCORE & CONDITIONSADJUST NEVER READ AFFILIATE PINS) ──
{
  const unmonetized = {
    id: "test-venue-a",
    name: "Unmonetized Botanical Sanctuary",
    rating: 4.8,
    reviews: 1200,
    types: ["tourist_attraction", "park"],
  };
  const monetized = {
    ...unmonetized,
    id: "test-venue-b",
    name: "Get Up And Go Kayaking - Rock Springs",
  };
  ok(placePartnerPick(unmonetized) === null && placePartnerPick(monetized) !== null, "control check: one place is unmonetized and one is monetized");
  ok(
    wayfindScore(unmonetized.rating, unmonetized.reviews) === wayfindScore(monetized.rating, monetized.reviews),
    "wayfindScore is 100% identical regardless of partner/affiliate status"
  );
  ok(
    conditionsAdjust(unmonetized, { weather: { temp: 78, wet: false }, hour: 11, isWeekend: false }) ===
      conditionsAdjust(monetized, { weather: { temp: 78, wet: false }, hour: 11, isWeekend: false }),
    "conditionsAdjust ranking delta is 100% identical regardless of partner/affiliate status"
  );
}

// ── 9. REAL DETAIL SHEET RENDER INCLUDES YOUR GAME PLAN ABOVE CONTRIBUTION ─
{
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { default: DetailSheet } = await loadComponent(
    fileURLToPath(new URL("../app/components/sheets/Detail.js", import.meta.url)),
    root
  );
  const noop = () => {};
  const nothing = () => null;
  const carriedPlace = {
    id: "srq-cadzan",
    name: "Ca' d'Zan",
    city: "Sarasota",
    state: "FL",
    lat: 27.3815,
    lng: -82.5631,
    wfScore: 95,
    rating: 4.8,
    reviews: 3200,
    types: ["museum", "tourist_attraction"],
    photos: [],
    editorial: {
      bestFor: "John & Mable Ringling's Venetian Gothic bayfront mansion",
      goodToKnow: "Arrive before 10:30 AM for the first docent entry. Plan 90 minutes to 2 hours for the mansion and bayfront terrace.",
      watchOut: "$25 adult admission; grounds included with museum ticket.",
      insiderMove: "Step out onto the marble bayfront terrace before the midday tour groups arrive.",
    },
  };
  const ctx = {
    detail: carriedPlace,
    detailExtra: { website: "https://www.ringling.org", hours: ["Monday: 10:00 AM – 5:00 PM"] },
    places: [],
    suggested: [],
    locName: "Sarasota, FL",
    commentType: "Tip",
    placeComments: {},
    taInfo: {},
    viaTours: {},
    offers: {},
    liked: {},
    disliked: {},
    myVotes: {},
    communityVotes: {},
    placePosts: [],
    videos: [],
    venueEvents: [],
    galleryRef: { current: null },
    noteRef: { current: null },
    insight: null,
    insightFull: null,
    insider: {},
    detailContext: {},
    blurbs: {},
    isBeach: () => false,
    placeKind: () => "entertainment",
    primaryCategory: () => "Museum",
    dedupePlaces: (rows) => rows,
    experienceBadges: () => [],
    similarPlaces: () => [],
    betterAlternatives: () => [],
    relatedPicks: () => [],
    liveOpen: () => true,
    isSaved: () => false,
    FeaturedTag: nothing,
    Critter: nothing,
    FallbackImg: nothing,
    curatedNote: nothing,
    curatedFor: nothing,
    wayfindNotes: nothing,
    blurbLine: nothing,
    setDetail: noop,
    setLightbox: noop,
    logEvent: noop,
    openDetail: noop,
    quickSaveFavorite: noop,
    toggleLike: noop,
    toggleDislike: noop,
    sheetDragStart: noop,
    sheetDragMove: noop,
    sheetDragEnd: noop,
    formatEventDate: () => ({}),
    ticketUrl: (u) => u,
  };
  const html = renderToStaticMarkup(createElement(DetailSheet, { ctx }));
  ok(html.includes("data-game-plan"), "DetailSheet renders data-game-plan section when carried editorial decision data is present");
  ok(html.includes("Your Game Plan"), "DetailSheet renders Your Game Plan heading");
  ok(html.includes("90 minutes to 2 hours"), "DetailSheet Game Plan renders verified visit duration");
  ok(html.includes("$25 adult admission"), "DetailSheet Game Plan renders verified cost & admission details");
  const gpIdx = html.indexOf("data-game-plan");
  const communityIdx = html.indexOf('id="wf-community-takes"');
  ok(gpIdx > 0 && communityIdx > gpIdx, "Your Game Plan renders above the community review composer (wf-community-takes)");
}

console.log(`test-game-plan-and-entity-resolution: OK — ${checks} assertions passed`);
