#!/usr/bin/env node
// scripts/test-self-healing-truth-engine.mjs
//
// Behavioral regression & red-team suite for the Wayfind Self-Healing
// "Should I Go?" Truth Engine:
//   1. Truth & Provenance Model + Volatility Tiers + Source Conflict Resolution
//   2. Commerce Health State Machine + Automatic Offer Quarantine + Clipp Live Audit State
//   3. Owned Hours Parser + Atlas /p/[id] Skeleton Persistence + Open-State Red Team
//   4. 7-State Location Model + Cold-Start Wimauma/Parrish Elimination
//   5. Event Temporal Eligibility + Ended-Earlier-Today + Past-Event Ticket Suppression
//   6. Internal Actionability Coverage (Before -> After) + Demand Operations Queue

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VOLATILITY_TIERS,
  FACT_VOLATILITY_POLICY,
  createTruthFact,
  evaluateFactFreshness,
  resolveFactFromSources,
  formatHoursCertaintyCopy,
  buildDecisionTrace,
} from "../lib/truthModel.js";
import {
  OFFER_HEALTH_STATUS,
  EVIDENCE_STRENGTH,
  isOfferStatusServeable,
  classifyClippLandingPage,
  evaluateOfferHealthTransition,
} from "../lib/commerceHealth.js";
import {
  HELD_PARTNER_OFFERS,
  QUARANTINED_PARTNER_OFFERS,
  isHeldPartnerOffer,
  isBlockedPartnerOffer,
  isQuarantinedPartnerOffer,
} from "../lib/partnerOfferHolds.js";
import {
  CLIPP_MERCHANT_OFFERS,
  QUARANTINED_CLIPP_OFFERS,
  clippOfferById,
  quarantinedClippOfferById,
} from "../lib/clippOffers.js";
import { COUPONS, liveCoupons, couponForPlace } from "../lib/coupons.js";
import { parseOwnedHours, toRegularOpeningHours } from "../lib/ownedHours.js";
import { listPublishReadyAtlasIds, atlasPlaceFor, inventoryToSkeleton } from "../lib/atlasPlaceAllowlist.js";
import { hydrateDetailHours } from "../lib/gamePlan.js";
import { isOpenNow } from "../lib/businessStatus.js";
import {
  DEFAULT_CENTER,
  LOCATION_STATE_KINDS,
  classifyLocationState,
  centerAgreesWithLabel,
} from "../lib/locationHonesty.js";
import { eventInWindow } from "../lib/eventsList.js";
import { eventActiveOnDay } from "../lib/searchCards.js";
import { canScheduleOnDate } from "../lib/plannerGeo.js";
import { buildGroundedCandidatePool } from "../lib/wayfindPlanner.js";
import { eventDetailTicketAction } from "../lib/curatedEvents.js";
import {
  computeActionabilityCoverage,
  buildDemandOperationsQueue,
} from "../lib/actionabilityScore.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let assertions = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  assertions++;
};
const eq = (a, b, msg) => {
  assert.deepEqual(a, b, msg);
  assertions++;
};

// ── 1. Truth & Provenance Model + Source Escalation ────────────────────────
{
  eq(FACT_VOLATILITY_POLICY.offer_availability.tier, VOLATILITY_TIERS.VERY_VOLATILE, "offer_availability is VERY_VOLATILE");
  eq(FACT_VOLATILITY_POLICY.opening_hours.tier, VOLATILITY_TIERS.MODERATELY_VOLATILE, "opening_hours is MODERATELY_VOLATILE");
  eq(FACT_VOLATILITY_POLICY.coordinates.tier, VOLATILITY_TIERS.LOW_VOLATILITY, "coordinates is LOW_VOLATILITY");

  const nowMs = Date.parse("2026-11-13T12:00:00Z");
  const freshFact = createTruthFact({
    factType: "opening_hours",
    value: "Daily 9am-5pm",
    source: "atlas_editorial",
    source_type: "verified_wayfind_record",
    verified_at: "2026-11-12T12:00:00Z",
  });
  const freshEval = evaluateFactFreshness(freshFact, nowMs);
  eq([freshEval.usable, freshEval.certainty], [true, "verified"], "fresh owned hours fact is verified and usable");

  const expiredDeal = createTruthFact({
    factType: "offer_availability",
    value: "50% off",
    source: "clipp",
    source_type: "authorized_provider_api",
    verified_at: "2026-10-01T00:00:00Z",
    expires_at: "2026-10-02T00:00:00Z",
  });
  const expEval = evaluateFactFreshness(expiredDeal, nowMs);
  eq([expEval.usable, expEval.certainty], [false, "expired"], "VERY_VOLATILE offer_availability fact fails closed when expired");

  // Source conflict resolution: verified_wayfind_record / official_venue_data beats unverified_inference
  const resolved = resolveFactFromSources(
    [
      {
        value: "10am-6pm (Rumored)",
        source: "reddit",
        source_type: "unverified_inference",
        verified_at: "2026-11-13T10:00:00Z",
      },
      {
        value: "Daily 9am-5pm",
        source: "official_site",
        source_type: "official_venue_data",
        verified_at: "2026-11-12T10:00:00Z",
      },
    ],
    "opening_hours",
    nowMs
  );
  eq(resolved.winner.value, "Daily 9am-5pm", "official_venue_data beats unverified_inference in conflict resolution");
  eq(resolved.conflictDetected, true, "conflict between distinct candidate values is flagged");

  // UI freshness copy never says "Hours unavailable" when weekday / prose hours exist
  const copyWithProse = formatHoursCertaintyCopy({
    openState: null,
    proseHours: "8am-sunset, 365 days a year",
  });
  eq(copyWithProse, "See schedule · check before heading out", "prose hours without live openState renders 'See schedule · check before heading out'");

  const trace = buildDecisionTrace({
    entityId: "test-place",
    entityName: "The Ringling",
    hoursTrace: { openState: true, certainty: "verified", source: "atlas_editorial", hasPeriods: true },
    ctaTrace: { kind: "tickets", label: "Tickets", provider: "viator", offerId: "108117P1" },
    locationTrace: { stateKind: LOCATION_STATE_KINDS.USER_SELECTED_LOCATION, labelShown: "Sarasota" },
  });
  eq(
    [trace.whyOpenVerdict.openState, trace.whyLocationResolved.stateKind, trace.whyCtaChosen.winningKind],
    [true, "USER_SELECTED_LOCATION", "tickets"],
    "decision trace captures whyOpenVerdict, whyLocationResolved, and whyCtaChosen"
  );
}

// ── 2. Commerce Health & Automatic Offer Quarantine ────────────────────────
{
  // Sold-out Clipp merchant 12875835 (Pizza Kitchen, clipp-m-pizza-kitchen) is quarantined everywhere
  ok(QUARANTINED_PARTNER_OFFERS.includes("clipp-m-pizza-kitchen"), "clipp-m-pizza-kitchen is in QUARANTINED_PARTNER_OFFERS");
  ok(isQuarantinedPartnerOffer("clipp-m-pizza-kitchen"), "clipp-m-pizza-kitchen is quarantined");
  ok(isBlockedPartnerOffer("clipp-m-pizza-kitchen"), "clipp-m-pizza-kitchen is blocked");
  ok(HELD_PARTNER_OFFERS.length >= 5 && isHeldPartnerOffer("gurnee-hook-six-flags"), "HELD_PARTNER_OFFERS remains intact");
  eq(clippOfferById("clipp-m-pizza-kitchen"), null, "clippOfferById excludes sold-out clipp-m-pizza-kitchen");
  const qRec = quarantinedClippOfferById("clipp-m-pizza-kitchen");
  ok(qRec && qRec.status === "SOLD_OUT", "quarantinedClippOfferById records clipp-m-pizza-kitchen as SOLD_OUT");
  eq(couponForPlace({ place_id: "ChIJrd5cMw_DwogRgRc4JgnCIBw", name: "Pizza Kitchen" }, "2026-11-13"), null, "couponForPlace never serves sold-out Pizza Kitchen");
  const activeCoupons = liveCoupons("2026-11-13");
  ok(!activeCoupons.some((c) => c.id === "cpn-clipp-m-pizza-kitchen" || /Pizza Kitchen/i.test(c.business)), "liveCoupons excludes sold-out Pizza Kitchen");

  // Almost Gone Clipp merchants carry ALMOST_GONE status and scarcity badge
  for (const id of ["clipp-m-4th-street-pizza", "clipp-m-marcos-riverview"]) {
    const m = clippOfferById(id);
    ok(m && m.status === OFFER_HEALTH_STATUS.ALMOST_GONE, `merchant ${id} carries ALMOST_GONE status`);
  }
  const fourthStCoupon = COUPONS.find((c) => c.id === "cpn-clipp-m-4th-street-pizza");
  ok(fourthStCoupon && fourthStCoupon.status === "ALMOST_GONE", "4th Street Pizza coupon exposes ALMOST_GONE status");

  // Promo price-drop Clipp merchants carry PRICE_CHANGED metadata and livePrice
  const promoDropped = CLIPP_MERCHANT_OFFERS.filter((m) => m.status === "PRICE_CHANGED" && m.priceChangeKind === "promo_drop");
  eq(promoDropped.length, 8, "all 8 promo-drop Clipp merchants carry status PRICE_CHANGED and priceChangeKind promo_drop");
  const ismash = clippOfferById("clipp-m-ismash-brandon");
  eq([ismash.status, ismash.priceChangeKind, ismash.livePrice], ["PRICE_CHANGED", "promo_drop", 28], "iSmash Brandon carries PRICE_CHANGED promo_drop metadata with livePrice 28");

  // HTML classifier & evidence threshold transitions
  const soldOutClassification = classifyClippLandingPage({
    httpStatus: 200,
    finalUrl: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12875835",
    html: "<html><body>THIS DEAL IS SOLD OUT! Check back soon.</body></html>",
    expectedDealId: "12875835",
  });
  eq([soldOutClassification.status, soldOutClassification.evidence], [OFFER_HEALTH_STATUS.SOLD_OUT, EVIDENCE_STRENGTH.STRONG], "sold-out landing page classifies as STRONG SOLD_OUT");

  const immediateQuarantine = evaluateOfferHealthTransition({
    currentStatus: OFFER_HEALTH_STATUS.ACTIVE,
    currentFailureCount: 0,
    probeResult: soldOutClassification,
  });
  eq([immediateQuarantine.serveable, immediateQuarantine.quarantined, immediateQuarantine.nextStatus], [false, true, OFFER_HEALTH_STATUS.SOLD_OUT], "STRONG SOLD_OUT evidence quarantines immediately on first check");

  // Inconclusive probe (403 bot wall / timeout) preserves active offer without incrementing failureCount
  const inconclusive = evaluateOfferHealthTransition({
    currentStatus: OFFER_HEALTH_STATUS.ACTIVE,
    currentFailureCount: 0,
    probeResult: classifyClippLandingPage({ httpStatus: 403 }),
  });
  eq([inconclusive.serveable, inconclusive.quarantined, inconclusive.failureCount], [true, false, 0], "403 bot wall is INCONCLUSIVE and does not increment failureCount or quarantine");

  // Single weak failure (e.g. 404 without body confirmation) records 1 strike; 2nd consecutive weak failure quarantines
  const weak1 = evaluateOfferHealthTransition({
    currentStatus: OFFER_HEALTH_STATUS.ACTIVE,
    currentFailureCount: 0,
    probeResult: classifyClippLandingPage({ httpStatus: 404 }),
  });
  eq([weak1.serveable, weak1.quarantined, weak1.failureCount], [true, false, 1], "1st weak failure increments failureCount without false-positive quarantine");

  const weak2 = evaluateOfferHealthTransition({
    currentStatus: OFFER_HEALTH_STATUS.ACTIVE,
    currentFailureCount: 1,
    probeResult: classifyClippLandingPage({ httpStatus: 404 }),
  });
  eq([weak2.serveable, weak2.quarantined, weak2.nextStatus, weak2.failureCount], [false, true, OFFER_HEALTH_STATUS.QUARANTINED, 2], "2nd consecutive weak failure quarantines offer");
}

// ── 3. Owned Hours Persistence & Open-State Red Team ───────────────────────
{
  const allowlistedIds = listPublishReadyAtlasIds();
  eq(allowlistedIds.length, 481, "481 allowlisted Atlas place IDs");

  let withHours = 0;
  let withStructuredPeriods = 0;
  let withProseOnly = 0;
  let skeletonSurvived = 0;

  for (const id of allowlistedIds) {
    const place = atlasPlaceFor(id);
    if (place && Array.isArray(place.hours) && place.hours.length > 0) {
      withHours++;
      if (place.oh && Array.isArray(place.oh.periods) && place.oh.periods.length > 0) {
        withStructuredPeriods++;
      } else if (place.oh && Array.isArray(place.oh.weekdayDescriptions) && place.oh.weekdayDescriptions.length > 0) {
        withProseOnly++;
      }
      const skel = inventoryToSkeleton({ place_id: id, name: place.name || "Test", lat: 27.95, lng: -82.45 });
      if (skel && skel.signals && skel.signals.regularOpeningHours && Array.isArray(skel.signals.regularOpeningHours.weekdayDescriptions) && skel.signals.regularOpeningHours.weekdayDescriptions.length > 0) {
        skeletonSurvived++;
      }
    }
  }
  eq(withHours, 420, "420 of 481 Atlas cards carry visitor-clean owned hours (4 internal audit notes rejected)");
  ok(withStructuredPeriods >= 280, `at least 280 Atlas cards parse into structured periods (got ${withStructuredPeriods})`);
  eq(withStructuredPeriods + withProseOnly, 420, "every clean owned hours string produces either structured periods or prose weekdayDescriptions");
  eq(skeletonSurvived, 420, "100% of clean owned hours (420/420) survive inventoryToSkeleton for /p/[id] pages");
  eq(atlasPlaceFor("ChIJrdwEqrURw4gRLAb8rKRkYqQ")?.oh, null, "Skinny's Place internal conflict note is rejected and never leaks to visitors");

  // Edge cases in parseOwnedHours & businessStatus:
  // (a) Daily standard hours
  const daily = toRegularOpeningHours("Daily 9am–5pm", { asOf: "2026-03" });
  ok(daily && daily.periods.length === 7 && daily.weekdayDescriptions.length === 7, "Daily 9am-5pm produces 7 periods and 7 weekdayDescriptions");
  const openAtNoon = isOpenNow({ oh: daily, utcOffset: -300 }, Date.parse("2026-11-13T17:00:00Z")); // 12:00 PM EST
  eq(openAtNoon, true, "Daily 9am-5pm is Open now at 12:00 PM EST");
  const closedAt8pm = isOpenNow({ oh: daily, utcOffset: -300 }, Date.parse("2026-11-14T01:00:00Z")); // 8:00 PM EST
  eq(closedAt8pm, false, "Daily 9am-5pm is Closed at 8:00 PM EST");

  // (b) Midnight crossing ("Daily 5pm–2am")
  const overnight = toRegularOpeningHours("Daily 5pm–2am");
  ok(overnight && overnight.periods.length === 7, "Daily 5pm-2am parses overnight periods");
  const openAt1am = isOpenNow({ oh: overnight, utcOffset: -300 }, Date.parse("2026-11-14T06:00:00Z")); // Sat 1:00 AM EST
  eq(openAt1am, true, "Overnight bar (5pm-2am) is Open now at 1:00 AM EST");

  // (c) Closed today ("Tue–Sun 10am–5pm; closed Mondays")
  const closedMon = toRegularOpeningHours("Tue–Sun 10am–5pm; closed Mondays");
  ok(closedMon && closedMon.weekdayDescriptions[0] === "Monday: Closed", "closed Mondays marks Monday: Closed");
  const monNoon = isOpenNow({ oh: closedMon, utcOffset: -300 }, Date.parse("2026-11-16T17:00:00Z")); // Mon Nov 16 12:00 PM EST
  eq(monNoon, false, "Closed on Monday noon");

  // (d) 24-hour place ("Open 24 hours")
  const open24 = toRegularOpeningHours("Open 24 hours");
  const at3am = isOpenNow({ oh: open24, utcOffset: -300 }, Date.parse("2026-11-13T08:00:00Z"));
  eq(at3am, true, "24-hour place is Open now at 3:00 AM");

  // (e) Conditional / sunrise-sunset prose stays parseable:false so Open now is never fabricated
  const prose = toRegularOpeningHours("8am–sunset, 365 days a year");
  ok(prose && !prose.periods && prose.weekdayDescriptions.length === 1, "sunrise/sunset hours keep weekdayDescriptions without fabricating clock periods");
  eq(isOpenNow({ oh: prose, utcOffset: -300 }, Date.parse("2026-11-13T17:00:00Z")), null, "isOpenNow returns null on prose-only hours (never fabricates Open now)");

  // (f) hydrateDetailHours falls back to editorial.oh and preserves original asOf verification date (never stamping nowMs)
  const testNowMs = Date.parse("2026-11-13T17:00:00Z");
  const hydrated = hydrateDetailHours({ name: "Test" }, null, testNowMs, { oh: daily, asOf: "2026-03" });
  ok(hydrated.oh && hydrated.oh.periods.length === 7, "hydrateDetailHours hydrates oh from editorial.oh");
  eq(hydrated.hoursAsOf, Date.parse("2026-03-01T00:00:00Z"), "hydrateDetailHours preserves source verification date (2026-03) and does not refresh hoursAsOf to nowMs");
}

// ── 4. Cold-Location State Model & Wimauma/Parrish Leak Prevention ─────────
{
  const coldState = classifyLocationState({
    gotGPS: false,
    manual: false,
    locName: "",
    center: DEFAULT_CENTER,
  });
  eq([coldState.kind, coldState.displayCity], [LOCATION_STATE_KINDS.DEFAULT_BOOTSTRAP_CENTER, ""], "cold visitor with DEFAULT_CENTER has DEFAULT_BOOTSTRAP_CENTER and empty displayCity");

  const mapAreaState = classifyLocationState({
    gotGPS: false,
    manual: true,
    locName: "this map area",
    center: { lat: 27.95, lng: -82.45 },
  });
  eq([mapAreaState.kind, mapAreaState.displayCity], [LOCATION_STATE_KINDS.MAP_CENTER, ""], "'this map area' is classified as MAP_CENTER with empty displayCity");

  eq(centerAgreesWithLabel({ lat: 27.95, lng: -82.45 }, "this map area"), false, "centerAgreesWithLabel rejects 'this map area' so it never poisons localStorage.wf_center");
  eq(centerAgreesWithLabel({ lat: 27.95, lng: -82.45 }, ""), true, "centerAgreesWithLabel accepts coords-only stored pin with empty locName");
  eq(centerAgreesWithLabel(DEFAULT_CENTER, "Wimauma, FL"), false, "centerAgreesWithLabel rejects DEFAULT_CENTER paired with 'Wimauma, FL'");
  eq(centerAgreesWithLabel({ lat: 27.9506, lng: -82.4572 }, "Tampa, FL"), true, "centerAgreesWithLabel accepts valid Tampa pair");

  const homeSrc = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
  const ipFallbackMatch = homeSrc.match(/const ipFallback = async \(\) => \{([\s\S]*?)\n\s{4}\};/);
  ok(ipFallbackMatch && !/setLocName/.test(ipFallbackMatch[1]), "ipFallback in app/home.js never calls setLocName on unverified IP/seed fallback");
}

// ── 5. Event Temporal Eligibility & Past-Event Ticket Suppression ──────────
{
  const thu7pmEt = new Date("2026-11-13T00:00:00Z"); // Thu Nov 12, 2026 7:00 PM EST
  const morningMarket = {
    date: "2026-11-12",
    start_date: "2026-11-12",
    end_date: "2026-11-12",
    start_time: "09:00",
    end_time: "14:00",
    event_status: "scheduled",
  };
  eq(eventInWindow(morningMarket, "tonight", thu7pmEt), false, "daytime event (9am-2pm) that already ended earlier today is excluded from 'tonight' at 7pm ET");
  eq(
    eventActiveOnDay(
      { kind: "event", startDate: "2026-11-12", endDate: "2026-11-12", startTime: "09:00", endTime: "14:00" },
      "2026-11-12",
      { nowMs: thu7pmEt.getTime() }
    ),
    false,
    "eventActiveOnDay returns false at 7pm ET for an event that ended at 2pm ET today"
  );

  const overnightParty = {
    date: "2026-11-12",
    start_date: "2026-11-12",
    end_date: "2026-11-12",
    start_time: "20:00",
    end_time: "02:00",
    event_status: "scheduled",
  };
  eq(eventInWindow(overnightParty, "tonight", thu7pmEt), true, "overnight event (8pm-2am) remains in 'tonight' at 7pm ET");

  const cancelledEv = { date: "2026-11-12", status: "cancelled" };
  eq(eventInWindow(cancelledEv, "tonight", thu7pmEt), false, "cancelled event is excluded from eventInWindow");

  // Unenumerated select_nights (k === "r") is excluded from "tonight" on mid-run nights,
  // but remains visible in "this-month" and schedulable in planner with "Check select nights" badge
  const restrictedSelect = {
    id: "event:mystery-haunt",
    itemType: "event",
    date: "2026-11-01",
    endDate: "2026-11-30",
    start_date: "2026-11-01",
    end_date: "2026-11-30",
    selectNights: true,
    dayRule: { k: "r" },
    scheduleNote: "Select nights in November",
  };
  eq(eventInWindow(restrictedSelect, "tonight", new Date("2026-11-18T23:00:00Z")), false, "unenumerated select_nights event is excluded from 'tonight' on mid-run night");
  eq(eventInWindow(restrictedSelect, "this-month", new Date("2026-11-18T23:00:00Z")), true, "unenumerated select_nights event remains visible in 'this-month'");
  eq(canScheduleOnDate(restrictedSelect, "2026-11-18").allowed, true, "canScheduleOnDate keeps select_nights event schedulable on future date with confidence badge");
  const weekendSelect = {
    id: "event:weekend-lights",
    itemType: "event",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    scheduleNote: "Fridays and Saturdays only",
  };
  eq(canScheduleOnDate(weekendSelect, "2026-11-18").allowed, false, "canScheduleOnDate blocks Fri/Sat event on Wednesday 2026-11-18");

  // Past event excluded from buildGroundedCandidatePool and eventDetailTicketAction
  const pool = buildGroundedCandidatePool(
    [[{ id: "event:old", itemType: "event", name: "Old Fest", city: "Tampa", lat: 27.95, lng: -82.45, start_date: "2026-10-01", end_date: "2026-10-05" }]],
    { today: "2026-11-13" }
  );
  eq(pool.length, 0, "buildGroundedCandidatePool drops events whose end_date < today");

  const pastTicket = eventDetailTicketAction(
    {
      event_id: "past-concert-2026",
      event_status: "scheduled",
      start_date: "2026-10-01",
      end_date: "2026-10-01",
      official_ticket_url: "https://www.ticketmaster.com/event/123",
      price_min: 45,
      is_free: false,
      link_ok: true,
    },
    { today: "2026-11-13" }
  );
  eq(pastTicket, null, "eventDetailTicketAction returns null for past events so dead buy buttons never render");
}

// ── 6. Actionability Coverage (Before -> After) & Demand Queue ─────────────
{
  const cardsRaw = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
  let totalBefore = 0;
  let totalAfter = 0;
  let decisionReadyBefore = 0;
  let decisionReadyAfter = 0;

  for (const card of cardsRaw) {
    const place = atlasPlaceFor(card.placeId);
    const beforeCov = computeActionabilityCoverage(
      {
        place_id: card.placeId,
        name: place?.name || card.name || "Place",
        address: place?.address,
        website: place?.officialWebsite,
        price: card.priceBand || card.cost,
        duration: card.duration,
        bestTime: card.insiderMove || card.proMove,
        parking: card.watchOut || place?.address,
        hours: place?.hours ? place.hours.join("; ") : null,
      },
      { includeOwnedHours: false }
    );
    const afterCov = computeActionabilityCoverage(
      {
        place_id: card.placeId,
        name: place?.name || card.name || "Place",
        address: place?.address,
        website: place?.officialWebsite,
        regularOpeningHours: place?.oh,
        price: card.priceBand || card.cost,
        duration: card.duration,
        bestTime: card.insiderMove || card.proMove,
        parking: card.watchOut || place?.address,
        hours: place?.hours ? place.hours.join("; ") : null,
      },
      { includeOwnedHours: true }
    );
    totalBefore += beforeCov.score;
    totalAfter += afterCov.score;
    if (beforeCov.tier === "DECISION_READY") decisionReadyBefore++;
    if (afterCov.tier === "DECISION_READY") decisionReadyAfter++;
  }

  const avgBefore = Math.round((totalBefore / cardsRaw.length) * 10) / 10;
  const avgAfter = Math.round((totalAfter / cardsRaw.length) * 10) / 10;
  ok(avgAfter > avgBefore + 20, `average Atlas Actionability Coverage heuristic jumped by >20 points (${avgBefore} -> ${avgAfter}) from owned hours hydration`);
  ok(decisionReadyAfter >= decisionReadyBefore, `DECISION_READY count non-decreasing (${decisionReadyBefore} -> ${decisionReadyAfter})`);
  console.log(`  [actionability] Atlas 464 avg score: ${avgBefore} -> ${avgAfter} | DECISION_READY: ${decisionReadyBefore}/464 -> ${decisionReadyAfter}/464`);

  const queue = buildDemandOperationsQueue([
    { id: "low-traffic-ok", name: "Quiet Park", views: 5, clicks: 0, lat: 27.9, lng: -82.4, hours: "Daily 8am-6pm", website: "https://example.com", price: "Free", duration: "1 hr", bestTime: "Morning", parking: "Free lot" },
    { id: "high-demand-failing", name: "Sold Out Deal Venue", views: 5000, clicks: 400, failedClicks: 3, onHomepage: true, hasCommercePotential: true, volatilityTier: "VERY_VOLATILE", lat: 27.9, lng: -82.4 },
  ]);
  eq(queue[0].id, "high-demand-failing", "buildDemandOperationsQueue ranks high-demand failing commerce entity #1");
  eq(queue[0].recommendedAction, "QUARANTINE_OR_REVERIFY_OFFER", "queue recommends QUARANTINE_OR_REVERIFY_OFFER on failing clicks");
}

console.log(`test-self-healing-truth-engine: OK — ${assertions} assertions passed`);
