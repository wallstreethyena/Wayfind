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

process.env.WF_SUPPRESS_ANALYTICS = "1";

import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
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
  // Sold-out Clipp merchants (Pizza Kitchen, Marco's Pizza - Riverview) are quarantined everywhere
  for (const id of ["clipp-m-pizza-kitchen", "clipp-m-marcos-riverview"]) {
    ok(QUARANTINED_PARTNER_OFFERS.includes(id), `${id} is in QUARANTINED_PARTNER_OFFERS`);
    ok(isQuarantinedPartnerOffer(id), `${id} is quarantined`);
    ok(isBlockedPartnerOffer(id), `${id} is blocked`);
    eq(clippOfferById(id), null, `clippOfferById excludes sold-out ${id}`);
    const qRec = quarantinedClippOfferById(id);
    ok(qRec && qRec.status === "SOLD_OUT", `quarantinedClippOfferById records ${id} as SOLD_OUT`);
  }
  ok(HELD_PARTNER_OFFERS.length >= 5 && isHeldPartnerOffer("gurnee-hook-six-flags"), "HELD_PARTNER_OFFERS remains intact");
  eq(couponForPlace({ place_id: "ChIJrd5cMw_DwogRgRc4JgnCIBw", name: "Pizza Kitchen" }, "2026-11-18"), null, "couponForPlace never serves sold-out Pizza Kitchen");
  const activeCoupons = liveCoupons("2026-11-18");
  ok(!activeCoupons.some((c) => c.id === "cpn-clipp-m-pizza-kitchen" || /Pizza Kitchen/i.test(c.business)), "liveCoupons excludes sold-out Pizza Kitchen");
  ok(!activeCoupons.some((c) => c.id === "cpn-clipp-m-marcos-riverview" || /Riverview/i.test(c.business)), "liveCoupons excludes sold-out Marco's Pizza - Riverview");

  // Almost Gone Clipp merchant carries ALMOST_GONE status and scarcity badge
  const fourthM = clippOfferById("clipp-m-4th-street-pizza");
  ok(fourthM && fourthM.status === OFFER_HEALTH_STATUS.ALMOST_GONE, "clipp-m-4th-street-pizza carries ALMOST_GONE status");
  const fourthStCoupon = COUPONS.find((c) => c.id === "cpn-clipp-m-4th-street-pizza");
  ok(fourthStCoupon && fourthStCoupon.status === "ALMOST_GONE", "4th Street Pizza coupon exposes ALMOST_GONE status");

  // In baseline catalogue on 2026-11-18, the 8 flash promo-drop merchants ended flash promo and reverted to ACTIVE
  const promoDropped = CLIPP_MERCHANT_OFFERS.filter((m) => m.status === "PRICE_CHANGED" && m.priceChangeKind === "promo_drop");
  eq(promoDropped.length, 0, "all 8 promo-drop Clipp merchants ended flash promo and reverted to standard 50%-off terms by 2026-11-18");
  const ismash = clippOfferById("clipp-m-ismash-brandon");
  ok(ismash && ismash.offerId === "clipp-m-ismash-brandon" && !ismash.livePrice, "iSmash Brandon carries standard 50%-off active terms in baseline");

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

// ── 7. Frontier Acceptance Ledger Polish (H1–H3, C1–C2, J1–J2) ─────────────
{
  // H1 (The Banyan House Restaurant bare "Lunch" + additive meal shifts)
  const banyanProse1 = toRegularOpeningHours(
    "Lunch 11:30am–2:30pm; dinner Sun–Thu 4pm–9pm, Fri–Sat 4pm–10pm"
  );
  ok(banyanProse1 && banyanProse1.periods.length === 14, "bare Lunch + split dinner parses to 14 periods");
  eq(
    banyanProse1.weekdayDescriptions[0],
    "Monday: 11:30 AM – 2:30 PM, 4:00 PM – 9:00 PM",
    "Monday includes additive Lunch + Dinner shift"
  );
  eq(
    banyanProse1.weekdayDescriptions[4],
    "Friday: 11:30 AM – 2:30 PM, 4:00 PM – 10:00 PM",
    "Friday includes additive Lunch + late Dinner shift"
  );

  const banyanProse2 = toRegularOpeningHours(
    "Lunch Tue–Sat 11am–2:30pm; Dinner Tue–Thu 4–9pm, Fri–Sat 4–10pm; Sun 11am–9pm; Mon closed"
  );
  ok(banyanProse2 && banyanProse2.periods.length === 11, "Tue-Sat lunch + meal splits parses to 11 periods");
  eq(banyanProse2.weekdayDescriptions[0], "Monday: Closed", "Monday is closed");
  eq(
    banyanProse2.weekdayDescriptions[1],
    "Tuesday: 11:00 AM – 2:30 PM, 4:00 PM – 9:00 PM",
    "Tuesday merges lunch + dinner periods"
  );

  const banyanPlace = atlasPlaceFor("ChIJy1RR0IpXw4gRCIehpFRKxbg");
  ok(
    banyanPlace && banyanPlace.oh && banyanPlace.oh.periods.length === 14,
    "The Banyan House Restaurant place in atlas allowlist parses to 14 periods"
  );

  // H2 (Sarasota Art Museum "p.m." sentence-boundary period before Closed Memorial Day...)
  const sarasotaArtMuseum = toRegularOpeningHours(
    "Mon–Sat 10 a.m.–5 p.m., Sun. 11 a.m.–5 p.m. Closed Memorial Day, Independence Day, Thanksgiving, Christmas Day, New Year's Day"
  );
  ok(sarasotaArtMuseum && sarasotaArtMuseum.periods.length === 7, "Sarasota Art Museum parses 7 daily periods");
  eq(
    sarasotaArtMuseum.weekdayDescriptions[6],
    "Sunday: 11:00 AM – 5:00 PM",
    "Sunday hours parse correctly despite sentence boundary period in p.m."
  );
  ok(
    sarasotaArtMuseum.specialHours && sarasotaArtMuseum.specialHours.length >= 5,
    "specialHours retains at least 5 holiday closures"
  );

  // H3 (Serving-level hours freshness, 30-day Google ToS eviction, & 90-day owned staleness + refresh queue)
  const { evaluateHoursFreshness } = await import("../lib/ownedHours.js");
  const { scoreHoursRefreshPriority } = await import("../lib/hoursFreshnessQueue.js");

  const google35d = {
    periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
  };
  const expParsed = parseOwnedHours(google35d, {
    source: "google_places",
    verifiedAt: "2026-10-10T12:00:00Z",
    nowMs: Date.parse("2026-11-14T12:00:00Z"),
  });
  ok(
    expParsed && expParsed.expired === true && expParsed.parseable === false && expParsed.periods === undefined,
    "parseOwnedHours sets expired: true, parseable: false, periods: undefined for >30d Google hours"
  );
  const expToReg = toRegularOpeningHours(google35d, {
    source: "google_places",
    verifiedAt: "2026-10-10T12:00:00Z",
    nowMs: Date.parse("2026-11-14T12:00:00Z"),
  });
  eq(expToReg, null, "toRegularOpeningHours returns null for >30d Google hours");

  const ownedStale = toRegularOpeningHours("Daily 9am–5pm", {
    source: "wayfind_editorial_hours",
    asOf: "2026-03",
    nowMs: Date.parse("2026-11-14T12:00:00Z"),
  });
  ok(
    ownedStale && ownedStale.stale === true && ownedStale.freshness === "stale" && ownedStale.needsRefresh === true,
    "toRegularOpeningHours sets stale: true, freshness: 'stale', needsRefresh: true for >90d owned hours"
  );

  const staleRefreshScore = scoreHoursRefreshPriority(
    {
      place_id: "test-place-90d",
      signals: {
        owned_hours: {
          periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
          verifiedAt: "2026-05-01T00:00:00Z",
        },
      },
      verifiedAt: "2026-05-01T00:00:00Z",
    },
    { nowMs: Date.parse("2026-11-14T12:00:00Z") }
  );
  eq(
    staleRefreshScore.needsRefresh,
    true,
    "scoreHoursRefreshPriority sets needsRefresh: true when owned hours record is >90 days old"
  );

  // C1 (Clipp offer freshness, hard audit expiry, & 24h/48h scarcity/promo decay)
  const { evaluateClippOfferFreshness } = await import("../lib/commerceHealth.js");
  const {
    ingestClippOfferEvidence,
    resetClippRuntimeEvidence,
  } = await import("../lib/clippOffers.js");

  const fourthFresh = clippOfferById("clipp-m-4th-street-pizza", { now: "2026-11-19T10:00:00Z" });
  ok(
    fourthFresh && fourthFresh.status === "ALMOST_GONE" && fourthFresh.health?.scarcityFresh === true,
    "4th Street Pizza has status ALMOST_GONE and scarcityFresh: true within 24h of 2026-11-18 audit"
  );
  const fourthDecayed = clippOfferById("clipp-m-4th-street-pizza", { now: "2026-11-20T01:00:00Z" });
  ok(
    fourthDecayed &&
      fourthDecayed.status === "ACTIVE" &&
      fourthDecayed.scarcityExpired === true &&
      fourthDecayed.health?.scarcityFresh === false &&
      fourthDecayed.health?.serveable === true,
    "4th Street Pizza decays to ACTIVE with scarcityExpired: true after 24h while remaining serveable"
  );

  try {
    ingestClippOfferEvidence(
      "clipp-m-ismash-brandon",
      {
        httpStatus: 200,
        html: "<title>iSmash Brandon, FL</title><div>Add to Cart Buy Now $28 for $80 of starter smash sessions</div>",
      },
      { now: new Date("2026-11-18T12:00:00Z") }
    );
    const ismashFresh = clippOfferById("clipp-m-ismash-brandon", { now: "2026-11-19T12:00:00Z" });
    ok(
      ismashFresh &&
        ismashFresh.status === "PRICE_CHANGED" &&
        ismashFresh.livePrice === 28,
      "iSmash Brandon carries PRICE_CHANGED and live price within 48h of ingestion"
    );
    const ismashDecayed = clippOfferById("clipp-m-ismash-brandon", { now: "2026-11-21T00:00:00Z" });
    ok(
      ismashDecayed &&
        ismashDecayed.status === "ACTIVE" &&
        ismashDecayed.livePrice === null &&
        ismashDecayed.promoExpired === true &&
        ismashDecayed.health?.serveable === true,
      "iSmash Brandon decays to ACTIVE with livePrice null and promoExpired: true after 48h while remaining serveable"
    );
  } finally {
    resetClippRuntimeEvidence();
  }

  const pastExpiry = "2026-11-25T12:00:00Z";
  eq(
    clippOfferById("clipp-m-chez-leon", { now: pastExpiry }),
    null,
    "clippOfferById returns null for chez leon past CLIPP_AUDIT_EXPIRY (2026-11-23)"
  );
  eq(
    clippOfferById("clipp-m-pizza-kitchen", { now: pastExpiry }),
    null,
    "clippOfferById continues returning null for sold-out pizza kitchen past audit expiry"
  );
  const soldOutFreshness = evaluateClippOfferFreshness({ status: "SOLD_OUT" }, { now: pastExpiry });
  ok(
    soldOutFreshness && soldOutFreshness.serveable === false && soldOutFreshness.reason === "protective_hold_retained",
    "evaluateClippOfferFreshness retains protective hold on SOLD_OUT past audit expiry"
  );

  // C2 (PRICE_CHANGED + 403 WAF firewall, runtime quarantine & evidence-backed recovery)
  const probe403PromoDrop = evaluateOfferHealthTransition({
    currentStatus: "PRICE_CHANGED",
    currentPriceChangeKind: "promo_drop",
    currentFailureCount: 0,
    probeResult: classifyClippLandingPage({ httpStatus: 403 }),
  });
  ok(
    probe403PromoDrop.serveable === true &&
      probe403PromoDrop.quarantined === false &&
      probe403PromoDrop.nextStatus === "PRICE_CHANGED" &&
      probe403PromoDrop.reverifyAt === null,
    "403 WAF response keeps promo_drop offer serveable, unquarantined, with reverifyAt null"
  );

  const probe403SoldOut = evaluateOfferHealthTransition({
    currentStatus: "SOLD_OUT",
    currentFailureCount: 1,
    probeResult: classifyClippLandingPage({ httpStatus: 403 }),
  });
  ok(
    probe403SoldOut.serveable === false &&
      probe403SoldOut.quarantined === true &&
      probe403SoldOut.nextStatus === "SOLD_OUT" &&
      probe403SoldOut.reverifyAt === null,
    "403 WAF response retains protective hold on SOLD_OUT offer with reverifyAt null"
  );

  try {
    // 1. Ingesting 403 on ismash keeps offer non-null and does not set runtimeVerifiedAt
    ingestClippOfferEvidence("clipp-m-ismash-brandon", { httpStatus: 403 });
    const ismashAfter403 = clippOfferById("clipp-m-ismash-brandon");
    ok(ismashAfter403 !== null, "clippOfferById keeps ismash non-null after 403");
    ok(!ismashAfter403.runtimeVerifiedAt, "403 evidence does not set runtimeVerifiedAt");

    // 2. Ingesting strong SOLD_OUT HTML on chez-leon immediately quarantines it
    ingestClippOfferEvidence("clipp-m-chez-leon", {
      httpStatus: 200,
      html: "<div>Chez Leon THIS DEAL IS SOLD OUT</div>",
    });
    eq(clippOfferById("clipp-m-chez-leon"), null, "strong SOLD_OUT HTML quarantines chez-leon from clippOfferById");
    ok(
      quarantinedClippOfferById("clipp-m-chez-leon") !== null,
      "quarantinedClippOfferById returns chez-leon record after quarantine"
    );

    // 3. Ingesting 403 on quarantined chez-leon does NOT release quarantine
    ingestClippOfferEvidence("clipp-m-chez-leon", { httpStatus: 403 });
    eq(
      clippOfferById("clipp-m-chez-leon"),
      null,
      "subsequent 403 does not release chez-leon from quarantine"
    );

    // 4. Ingesting strong ACTIVE HTML recovers chez-leon
    ingestClippOfferEvidence("clipp-m-chez-leon", {
      httpStatus: 200,
      html: "<title>Chez Leon Tampa, FL</title><div>Add to Cart Buy Now $15 for $30</div>",
    });
    ok(
      clippOfferById("clipp-m-chez-leon") !== null,
      "strong ACTIVE HTML restores chez-leon to clippOfferById"
    );
    eq(
      quarantinedClippOfferById("clipp-m-chez-leon"),
      null,
      "quarantinedClippOfferById returns null for recovered chez-leon"
    );
  } finally {
    resetClippRuntimeEvidence();
  }

  // J1 & J2 (End-to-end resolveOwnedHours & hydrateDetailHours Google >30d eviction and >90d staleness)
  const { resolveOwnedHours } = await import("../lib/ownedPlaceTruth.js");

  const resolvedExpiredGoogle = resolveOwnedHours({
    detail: {
      name: "Test",
      lat: 27.95,
      lng: -82.45,
      oh: {
        periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
        source: "google_places",
        verifiedAt: "2026-09-01T00:00:00Z",
      },
    },
    nowMs: Date.parse("2026-11-14T12:00:00Z"),
  });
  ok(
    resolvedExpiredGoogle.ok === false &&
      resolvedExpiredGoogle.expired === true &&
      resolvedExpiredGoogle.freshness === "expired",
    "resolveOwnedHours evicts >30d Google hours with ok: false, expired: true, freshness: 'expired'"
  );

  const resolvedStaleEditorial = resolveOwnedHours({
    detail: { name: "Test", lat: 27.95, lng: -82.45 },
    editorial: { hoursText: "Daily 9am–5pm", asOf: "2026-03" },
    nowMs: Date.parse("2026-11-14T12:00:00Z"),
  });
  ok(
    resolvedStaleEditorial.ok === true &&
      resolvedStaleEditorial.stale === true &&
      resolvedStaleEditorial.freshness === "stale" &&
      resolvedStaleEditorial.needsRefresh === true,
    "resolveOwnedHours returns ok: true, stale: true, freshness: 'stale', needsRefresh: true for >90d owned hours"
  );

  const hydratedStale = hydrateDetailHours(
    { name: "Test", lat: 27.95, lng: -82.45 },
    null,
    Date.parse("2026-11-14T12:00:00Z"),
    { hoursText: "Daily 9am–5pm", asOf: "2026-03" }
  );
  eq(
    hydratedStale?.oh?._stale,
    true,
    "hydrateDetailHours marks oh._stale === true for >90d owned hours"
  );
}

// ── 8. C3 Completion Contract: P1–P4 Durable Fresh-Process Lifecycle & Nov 18 Freshness ──
{
  // Nov 18 Source Freshness & Non-Extension Invariants
  const clippMod = await import("../lib/clippOffers.js");
  eq(clippMod.CLIPP_AUDIT_EXPIRY, "2026-11-23", "CLIPP_AUDIT_EXPIRY is 2026-11-23 (not blindly extended)");
  eq(clippMod.CLIPP_VERIFICATION_MODE, "manual", "CLIPP_VERIFICATION_MODE is manual");
  eq(clippMod.CLIPP_LAST_MANUAL_AUDIT_AT, "2026-11-18T23:19:12.000Z", "CLIPP_LAST_MANUAL_AUDIT_AT is 2026-11-18T23:19:12.000Z");
  ok(QUARANTINED_PARTNER_OFFERS.includes("clipp-m-pizza-kitchen"), "clipp-m-pizza-kitchen in QUARANTINED_PARTNER_OFFERS");
  ok(QUARANTINED_PARTNER_OFFERS.includes("clipp-m-marcos-riverview"), "clipp-m-marcos-riverview in QUARANTINED_PARTNER_OFFERS");
  eq(clippOfferById("clipp-m-pizza-kitchen"), null, "clippOfferById returns null for clipp-m-pizza-kitchen");
  eq(clippOfferById("clipp-m-marcos-riverview"), null, "clippOfferById returns null for clipp-m-marcos-riverview");
  ok(quarantinedClippOfferById("clipp-m-pizza-kitchen") !== null, "quarantinedClippOfferById non-null for pizza-kitchen");
  ok(quarantinedClippOfferById("clipp-m-marcos-riverview") !== null, "quarantinedClippOfferById non-null for marcos-riverview");

  const tmpFixturePath = path.join(os.tmpdir(), `clipp-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const tmpStorePath = path.join(os.tmpdir(), `clipp-store-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const tmpSnapPath = path.join(os.tmpdir(), `clipp-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  try {
    // P1: Producer CLI Dry-Run Proof
    fs.writeFileSync(
      tmpFixturePath,
      JSON.stringify([
        {
          offerId: "clipp-m-chez-leon",
          httpStatus: 200,
          finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12863814",
          title: "Chez Leon Tampa, FL",
          hasSoldOut: true,
          observedAt: "2026-11-18T23:00:00.000Z",
        },
      ]),
      "utf8"
    );

    const dryRunStdout = execFileSync(
      process.execPath,
      ["scripts/produce-clipp-evidence.mjs", "--dry-run", "--fixture", tmpFixturePath],
      { cwd: ROOT, encoding: "utf8" }
    );
    const dryRunParsed = JSON.parse(dryRunStdout);
    ok(dryRunParsed && dryRunParsed.ok === true && dryRunParsed.dryRun === true, "producer CLI dry run exits 0 with ok: true");

    // P1 + P2 + P3: Cron Execution Receipt & Durable Store Write (Process A)
    fs.writeFileSync(
      tmpSnapPath,
      JSON.stringify({
        observedAt: "2026-11-18T23:19:12.000Z",
        verificationMode: "manual",
        results: [
          {
            offerId: "clipp-m-chez-leon",
            httpStatus: 200,
            finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12863814",
            title: "Chez Leon Tampa, FL",
            html: "<title>Chez Leon Tampa, FL</title><div>Sold Out for Now</div>",
            hasSoldOut: true,
            hasAddToCart: false,
            hasBuyNow: false,
          },
          {
            offerId: "clipp-m-blind-goat",
            httpStatus: 200,
            finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
            title: "The Blind Goat Tampa, FL",
            html: "<title>The Blind Goat Tampa, FL</title><div>Add to Cart Buy Now $12 For $30 Worth Of Casual Dining</div>",
            hasSoldOut: false,
            hasAddToCart: true,
            hasBuyNow: true,
          },
          {
            offerId: "clipp-m-pizza-kitchen",
            httpStatus: 200,
            finalUrl: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12875835",
            title: "Pizza Kitchen Tampa, FL",
            html: "<title>Pizza Kitchen Tampa, FL</title><div>Add to Cart Buy Now $10 For $20 Worth Of Casual Dining</div>",
            hasSoldOut: false,
            hasAddToCart: true,
            hasBuyNow: true,
          },
          {
            offerId: "clipp-m-dip-and-happy",
            httpStatus: 403,
            finalUrl: "https://www.clipp.com/all-offers/40-casual-dining-tampa-fl-deal-12863594",
            title: "Access Denied",
            html: "Access Denied",
          },
          {
            offerId: "clipp-m-marcos-riverview",
            httpStatus: 403,
            finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-riverview-fl-deal-12853657",
            title: "Access Denied",
            html: "Access Denied",
          },
        ],
      }),
      "utf8"
    );

    const procACode = `
      import assert from "node:assert/strict";
      import fs from "node:fs";
      import { POST } from "./app/api/cron/verify-offers/route.js";

      const req = new Request("https://wayfind.test/api/cron/verify-offers", {
        method: "POST",
        headers: {
          authorization: "Bearer c3-test-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          snapshotPath: process.env.CLIPP_EVIDENCE_SNAPSHOT_PATH,
          storePath: process.env.WF_CLIPP_EVIDENCE_STORE_PATH,
        }),
      });

      const res = await POST(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.ok, true);
      assert.ok(json.quarantined >= 1, "quarantined >= 1");
      assert.ok(json.recovered >= 1, "recovered >= 1");
      assert.ok(json.inconclusive >= 2, "inconclusive >= 2");
      assert.ok(fs.existsSync(process.env.WF_CLIPP_EVIDENCE_STORE_PATH), "store file exists");
      console.log(JSON.stringify({ ok: true, quarantined: json.quarantined, recovered: json.recovered, inconclusive: json.inconclusive }));
    `;
    const procAStdout = execFileSync(process.execPath, ["--input-type=module", "-e", procACode], {
      cwd: ROOT,
      env: {
        ...process.env,
        CRON_SECRET: "c3-test-secret",
        WF_CLIPP_EVIDENCE_STORE_PATH: tmpStorePath,
        CLIPP_EVIDENCE_SNAPSHOT_PATH: tmpSnapPath,
        WF_SUPPRESS_ANALYTICS: "1",
      },
      encoding: "utf8",
    });
    const procAParsed = JSON.parse(procAStdout);
    ok(procAParsed && procAParsed.ok === true, "Process A POST /api/cron/verify-offers succeeds and writes durable store");
    ok(fs.existsSync(tmpStorePath), "tmpStorePath exists on disk after Process A");

    // P4: Real Serving & /api/commerce/go Redirect Proof After a Fresh Process Starts (Process B)
    const procBCode = `
      import assert from "node:assert/strict";
      import { getClippExecutionReceipts } from "./lib/clippDurableStore.js";
      import { clippOfferById } from "./lib/clippOffers.js";
      import { COUPONS, couponIsLive } from "./lib/coupons.js";
      import { GET as getHealth } from "./app/api/offers/health/route.js";
      import { GET as getRedirect } from "./app/api/commerce/go/route.js";

      // 1. Receipts in fresh Process B
      const receipts = getClippExecutionReceipts();
      assert.ok(receipts.length >= 1, "receipts present");
      const lastReceipt = receipts[receipts.length - 1];
      assert.equal(lastReceipt.job, "verify-offers:clipp");

      // 2. clipp-m-chez-leon (durably quarantined)
      assert.equal(clippOfferById("clipp-m-chez-leon"), null);
      const chezCoupon = COUPONS.find((c) => c.id === "cpn-clipp-m-chez-leon");
      assert.equal(couponIsLive(chezCoupon, "2026-11-18"), false);
      const healthRes = await getHealth();
      assert.equal(healthRes.status, 200);
      const healthJson = await healthRes.json();
      assert.equal(healthJson.clipp?.overlays?.["clipp-m-chez-leon"]?.quarantined, true);

      const chezReq = new Request("https://wayfind.test/api/commerce/go?provider=clipp&offer=clipp-m-chez-leon", {
        headers: { "user-agent": "WayfindVerify/1.0" },
      });
      const chezRedirect = await getRedirect(chezReq);
      assert.equal(chezRedirect.status, 302);
      assert.equal(chezRedirect.headers.get("location"), "https://wayfind.test/");

      // 3. clipp-m-pizza-kitchen (durably recovered)
      const pk = clippOfferById("clipp-m-pizza-kitchen");
      assert.ok(pk && pk.status === "ACTIVE");
      const pkReq = new Request("https://wayfind.test/api/commerce/go?provider=clipp&offer=clipp-m-pizza-kitchen", {
        headers: { "user-agent": "WayfindVerify/1.0" },
      });
      const pkRedirect = await getRedirect(pkReq);
      assert.equal(pkRedirect.status, 302);
      const pkLoc = pkRedirect.headers.get("location") || "";
      assert.ok(pkLoc.startsWith("https://www.dpbolvw.net/click-101643573-12174096"), "redirects to CJ affiliate destination");

      // 4. clipp-m-blind-goat (durably updated promo)
      const bg = clippOfferById("clipp-m-blind-goat");
      assert.ok(bg && bg.status === "PRICE_CHANGED" && bg.livePrice === 12);

      // 5. clipp-m-dip-and-happy & clipp-m-marcos-riverview (403 WAF firewall)
      const dh = clippOfferById("clipp-m-dip-and-happy");
      assert.ok(dh !== null);
      assert.equal(dh.runtimeVerifiedAt, undefined);
      assert.equal(clippOfferById("clipp-m-marcos-riverview"), null);

      console.log(JSON.stringify({ ok: true }));
    `;
    const procBStdout = execFileSync(process.execPath, ["--input-type=module", "-e", procBCode], {
      cwd: ROOT,
      env: {
        ...process.env,
        WF_CLIPP_EVIDENCE_STORE_PATH: tmpStorePath,
        WF_SUPPRESS_ANALYTICS: "1",
      },
      encoding: "utf8",
    });
    const procBParsed = JSON.parse(procBStdout);
    ok(procBParsed && procBParsed.ok === true, "Process B fresh cold process verified durable receipts, health route, redirect fail-closed and recovery");
  } finally {
    try { if (fs.existsSync(tmpFixturePath)) fs.unlinkSync(tmpFixturePath); } catch {}
    try { if (fs.existsSync(tmpSnapPath)) fs.unlinkSync(tmpSnapPath); } catch {}
    try { if (fs.existsSync(tmpStorePath)) fs.unlinkSync(tmpStorePath); } catch {}
  }
}

console.log(`test-self-healing-truth-engine: OK — ${assertions} assertions passed`);
