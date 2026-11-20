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

  // Almost Gone Clipp merchant carries ALMOST_GONE status and scarcity badge.
  // Evaluated at a FIXED time inside the 24h scarcity window after the last
  // manual audit (2026-11-18T23:19:12Z). Reading it at wall-clock time made this
  // a clock bomb: at 2026-11-19T23:19Z the claim correctly expired and every
  // build failed (production deploys of unrelated PRs errored).
  const SCARCITY_AUDIT_MS = Date.parse("2026-11-18T23:19:12.000Z");
  const fourthM = clippOfferById("clipp-m-4th-street-pizza", { now: new Date(SCARCITY_AUDIT_MS + 3600000) });
  ok(fourthM && fourthM.status === OFFER_HEALTH_STATUS.ALMOST_GONE, "clipp-m-4th-street-pizza carries ALMOST_GONE status within 24h of its audit");
  // Control: the same claim is NOT shown once 24h have passed (stale scarcity is never served).
  const fourthLate = clippOfferById("clipp-m-4th-street-pizza", { now: new Date(SCARCITY_AUDIT_MS + 25 * 3600000) });
  ok(fourthLate && fourthLate.status === OFFER_HEALTH_STATUS.ACTIVE && fourthLate.scarcityExpired === true, "ALMOST_GONE reverts to ACTIVE after the 24h scarcity window");
  const fourthStCoupon = COUPONS.find((c) => c.id === "cpn-clipp-m-4th-street-pizza");
  ok(fourthStCoupon && fourthStCoupon.status === "ALMOST_GONE", "4th Street Pizza coupon exposes ALMOST_GONE status");

  // In baseline catalogue on 2026-11-18, the 8 flash promo-drop merchants ended flash promo and reverted to ACTIVE
  const promoDropped = CLIPP_MERCHANT_OFFERS.filter((m) => m.status === "PRICE_CHANGED" && m.priceChangeKind === "promo_drop");
  eq(promoDropped.length, 0, "all 8 promo-drop Clipp merchants ended flash promo and reverted to standard 50%-off terms by 2026-11-18");
  const ismash = clippOfferById("clipp-m-ismash-brandon", { now: "2026-11-19T12:00:00.000Z" });
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
    const c2Now = "2026-11-19T12:00:00.000Z";
    // 1. Ingesting 403 on ismash keeps offer non-null and does not set runtimeVerifiedAt
    ingestClippOfferEvidence("clipp-m-ismash-brandon", { httpStatus: 403 }, { now: c2Now });
    const ismashAfter403 = clippOfferById("clipp-m-ismash-brandon", { now: c2Now });
    ok(ismashAfter403 !== null, "clippOfferById keeps ismash non-null after 403");
    ok(!ismashAfter403.runtimeVerifiedAt, "403 evidence does not set runtimeVerifiedAt");

    // 2. Ingesting strong SOLD_OUT HTML on chez-leon immediately quarantines it
    ingestClippOfferEvidence(
      "clipp-m-chez-leon",
      {
        httpStatus: 200,
        html: "<div>Chez Leon THIS DEAL IS SOLD OUT</div>",
      },
      { now: c2Now }
    );
    eq(clippOfferById("clipp-m-chez-leon", { now: c2Now }), null, "strong SOLD_OUT HTML quarantines chez-leon from clippOfferById");
    ok(
      quarantinedClippOfferById("clipp-m-chez-leon") !== null,
      "quarantinedClippOfferById returns chez-leon record after quarantine"
    );

    // 3. Ingesting 403 on quarantined chez-leon does NOT release quarantine
    ingestClippOfferEvidence("clipp-m-chez-leon", { httpStatus: 403 }, { now: c2Now });
    eq(
      clippOfferById("clipp-m-chez-leon", { now: c2Now }),
      null,
      "subsequent 403 does not release chez-leon from quarantine"
    );

    // 4. Ingesting strong ACTIVE HTML recovers chez-leon
    ingestClippOfferEvidence(
      "clipp-m-chez-leon",
      {
        httpStatus: 200,
        html: "<title>Chez Leon Tampa, FL</title><div>Add to Cart Buy Now $15 for $30</div>",
      },
      { now: c2Now }
    );
    ok(
      clippOfferById("clipp-m-chez-leon", { now: c2Now }) !== null,
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
  eq(clippOfferById("clipp-m-pizza-kitchen", { now: "2026-11-19T12:00:00.000Z" }), null, "clippOfferById returns null for clipp-m-pizza-kitchen");
  eq(clippOfferById("clipp-m-marcos-riverview", { now: "2026-11-19T12:00:00.000Z" }), null, "clippOfferById returns null for clipp-m-marcos-riverview");
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
          observedAt: "2026-11-19T11:55:00.000Z",
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
        observedAt: "2026-11-19T12:00:00.000Z",
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
          now: "2026-11-19T12:05:00.000Z",
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

      const PINNED_NOW = "2026-11-19T12:05:00.000Z";

      // 1. Receipts in fresh Process B
      const receipts = getClippExecutionReceipts();
      assert.ok(receipts.length >= 1, "receipts present");
      const lastReceipt = receipts[receipts.length - 1];
      assert.equal(lastReceipt.job, "verify-offers:clipp");

      // 2. clipp-m-chez-leon (durably quarantined)
      assert.equal(clippOfferById("clipp-m-chez-leon", { now: PINNED_NOW }), null);
      const chezCoupon = COUPONS.find((c) => c.id === "cpn-clipp-m-chez-leon");
      assert.equal(couponIsLive(chezCoupon, "2026-11-19"), false);
      const healthRes = await getHealth(new Request("https://wayfind.test/api/offers/health?now=" + PINNED_NOW));
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
      const pk = clippOfferById("clipp-m-pizza-kitchen", { now: PINNED_NOW });
      assert.ok(pk && pk.status === "ACTIVE");
      const pkReq = new Request("https://wayfind.test/api/commerce/go?provider=clipp&offer=clipp-m-pizza-kitchen", {
        headers: { "user-agent": "WayfindVerify/1.0" },
      });
      const pkRedirect = await getRedirect(pkReq);
      assert.equal(pkRedirect.status, 302);
      const pkLoc = pkRedirect.headers.get("location") || "";
      assert.ok(pkLoc.startsWith("https://www.dpbolvw.net/click-101643573-12174096"), "redirects to CJ affiliate destination");

      // 4. clipp-m-blind-goat (durably updated promo)
      const bg = clippOfferById("clipp-m-blind-goat", { now: PINNED_NOW });
      assert.ok(bg && bg.status === "PRICE_CHANGED" && bg.livePrice === 12);
      assert.equal(bg.runtimeVerifiedAt, "2026-11-19T12:00:00.000Z");

      // 5. clipp-m-dip-and-happy & clipp-m-marcos-riverview (403 WAF firewall)
      const dh = clippOfferById("clipp-m-dip-and-happy", { now: PINNED_NOW });
      assert.ok(dh !== null);
      assert.equal(dh.runtimeVerifiedAt, undefined);
      assert.equal(clippOfferById("clipp-m-marcos-riverview", { now: PINNED_NOW }), null);

      console.log(JSON.stringify({ ok: true }));
    `;
    const procBStdout = execFileSync(process.execPath, ["--input-type=module", "-e", procBCode], {
      cwd: ROOT,
      env: {
        ...process.env,
        WF_CLIPP_EVIDENCE_STORE_PATH: tmpStorePath,
        WF_COMMERCE_TEST_NOW: "2026-11-19T12:05:00.000Z",
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

// ── 9. C3 Activation Readiness: Schedule, Expiry Parity, Stale/Fixture/Challenge Safety & Host Locks ──
{
  const { isClippAuditExpiredEt } = await import("../lib/commerceHealth.js");
  const { validateClippRuntimeOverlay, ingestClippOfferEvidence, resetClippRuntimeEvidence } = await import("../lib/clippOffers.js");
  const { COUPONS, resolveLiveCoupon } = await import("../lib/coupons.js");
  const { GET: getHealth } = await import("../app/api/offers/health/route.js");
  const { GET: getRedirect } = await import("../app/api/commerce/go/route.js");
  const { POST: postVerifyOffers } = await import("../app/api/cron/verify-offers/route.js");

  // 1. Defect #1: launchd schedule & timezone ordering proof (01:45 AM ET < 08:00Z UTC + 09:15 AM ET catch-up + 18h interval)
  const plistPath = path.join(ROOT, "ops", "launchd", "com.gowayfind.clipp-evidence-producer.plist");
  const plistXml = fs.readFileSync(plistPath, "utf8");
  ok(
    /<key>Hour<\/key>\s*<integer>1<\/integer>\s*<key>Minute<\/key>\s*<integer>45<\/integer>/.test(plistXml),
    "launchd plist schedules primary pre-cron run at 01:45 AM America/New_York (06:45Z EST / 05:45Z EDT < 08:00Z)"
  );
  ok(
    /<key>Hour<\/key>\s*<integer>9<\/integer>\s*<key>Minute<\/key>\s*<integer>15<\/integer>/.test(plistXml) &&
      /<key>RunAtLoad<\/key>\s*<true\/>/.test(plistXml) &&
      plistXml.includes("--min-interval-hours") &&
      plistXml.includes("<string>18</string>"),
    "launchd plist includes 09:15 AM America/New_York daytime catch-up + RunAtLoad + 18h min interval guard"
  );
  ok(
    plistXml.includes("<string>/Users/gabrielpereira/Projects/wf-clipp-producer</string>") &&
      plistXml.includes("/Users/gabrielpereira/Library/Application Support/Wayfind/clipp/clipp-browser-evidence.json") &&
      !plistXml.includes("/tmp/"),
    "launchd plist uses persistent Application Support and wf-clipp-producer paths (zero /tmp paths)"
  );

  // 2. Defect #3: Exact America/New_York expiry boundary across health, coupon cards, clippOfferById, and /api/commerce/go
  const justBeforeExpiryUtc = "2026-11-24T04:59:59.000Z"; // 2026-11-23 23:59:59 EST
  const exactExpiryUtc = "2026-11-24T05:00:00.000Z"; // 2026-11-24 00:00:00 EST
  eq(isClippAuditExpiredEt("2026-11-23", justBeforeExpiryUtc), false, "2026-11-24T04:59:59.000Z (23:59:59 EST Nov 23) is NOT expired");
  eq(isClippAuditExpiredEt("2026-11-23", exactExpiryUtc), true, "2026-11-24T05:00:00.000Z (00:00:00 EST Nov 24) IS expired");

  const blindGoatCoupon = COUPONS.find((c) => c.id === "cpn-clipp-m-blind-goat");
  ok(
    resolveLiveCoupon(blindGoatCoupon, { now: justBeforeExpiryUtc }) !== null,
    "resolveLiveCoupon serves Clipp card at 2026-11-24T04:59:59.000Z (23:59:59 EST Nov 23)"
  );
  eq(
    resolveLiveCoupon(blindGoatCoupon, { now: exactExpiryUtc }),
    null,
    "resolveLiveCoupon returns null at 2026-11-24T05:00:00.000Z (00:00:00 EST Nov 24)"
  );
  ok(
    clippOfferById("clipp-m-blind-goat", { now: justBeforeExpiryUtc }) !== null,
    "clippOfferById serves Clipp offer at 2026-11-24T04:59:59.000Z"
  );
  eq(
    clippOfferById("clipp-m-blind-goat", { now: exactExpiryUtc }),
    null,
    "clippOfferById returns null at 2026-11-24T05:00:00.000Z"
  );

  const healthBeforeRes = await getHealth(new Request(`https://wayfind.test/api/offers/health?now=${encodeURIComponent(justBeforeExpiryUtc)}`));
  const healthBeforeJson = await healthBeforeRes.json();
  ok(
    healthBeforeJson.clipp?.todayEt === "2026-11-23" &&
      healthBeforeJson.clipp?.auditExpired === false &&
      healthBeforeJson.clipp?.serveable === true &&
      healthBeforeJson.clipp?.activeCount === 37,
    "/api/offers/health reports serveable: true and activeCount: 37 at 2026-11-24T04:59:59.000Z"
  );

  const healthAfterRes = await getHealth(new Request(`https://wayfind.test/api/offers/health?now=${encodeURIComponent(exactExpiryUtc)}`));
  const healthAfterJson = await healthAfterRes.json();
  ok(
    healthAfterJson.clipp?.todayEt === "2026-11-24" &&
      healthAfterJson.clipp?.auditExpired === true &&
      healthAfterJson.clipp?.serveable === false &&
      healthAfterJson.clipp?.activeCount === 0,
    "/api/offers/health reports auditExpired: true, serveable: false, activeCount: 0 at 2026-11-24T05:00:00.000Z"
  );

  try {
    process.env.WF_SUPPRESS_ANALYTICS = "1";
    process.env.WF_COMMERCE_TEST_NOW = justBeforeExpiryUtc;
    const goBeforeRes = await getRedirect(
      new Request("https://wayfind.test/api/commerce/go?provider=clipp&offer=clipp-m-blind-goat", {
        headers: { "user-agent": "WayfindVerify/1.0" },
      })
    );
    ok(
      goBeforeRes.status === 302 &&
        (goBeforeRes.headers.get("location") || "").startsWith("https://www.dpbolvw.net/click-101643573-12174096"),
      "/api/commerce/go redirects Clipp offer to CJ affiliate link at 2026-11-24T04:59:59.000Z"
    );

    process.env.WF_COMMERCE_TEST_NOW = exactExpiryUtc;
    const goAfterRes = await getRedirect(
      new Request("https://wayfind.test/api/commerce/go?provider=clipp&offer=clipp-m-blind-goat", {
        headers: { "user-agent": "WayfindVerify/1.0" },
      })
    );
    ok(
      goAfterRes.status === 302 &&
        goAfterRes.headers.get("location") === "https://wayfind.test/",
      "/api/commerce/go fails closed to https://wayfind.test/ at 2026-11-24T05:00:00.000Z"
    );
  } finally {
    delete process.env.WF_COMMERCE_TEST_NOW;
  }

  // 3. Defect #4: 200 HTML missing purchase CTAs ("Add to Cart" / "Buy Now") -> INCONCLUSIVE, never ACTIVE
  const challenge200 = classifyClippLandingPage({
    httpStatus: 200,
    finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
    expectedDealId: "12868827",
    expectedMerchant: "The Blind Goat",
    expectedCity: "Tampa",
    html: "<html><head><title>The Blind Goat Tampa, FL</title></head><body><div>Please verify you are a human to continue browsing The Blind Goat in Tampa, FL.</div></body></html>",
  });
  ok(
    challenge200.status === "UNVERIFIED" &&
      challenge200.evidence === "inconclusive" &&
      challenge200.reason === "purchase_cta_absent_or_challenge",
    "HTTP 200 merchant page missing Add to Cart / Buy Now is classified INCONCLUSIVE (purchase_cta_absent_or_challenge)"
  );

  const marketChallenge200 = classifyClippLandingPage({
    httpStatus: 200,
    finalUrl: "https://www.clipp.com/states/fl/cities/tampa",
    expectedMerchant: "Tampa",
    expectedCity: "Tampa",
    html: "<html><head><title>Tampa, FL</title></head><body><div>Security Challenge Interstitial</div></body></html>",
  });
  ok(
    marketChallenge200.status === "UNVERIFIED" &&
      marketChallenge200.evidence === "inconclusive" &&
      marketChallenge200.reason === "market_inventory_absent_or_challenge",
    "HTTP 200 city market page missing inventory markers is classified INCONCLUSIVE (market_inventory_absent_or_challenge)"
  );

  // 4. Defect #4: Fresh observedAt preserved + Stale snapshot rejected + Fixture payload rejected
  const tmpC3Store = path.join(os.tmpdir(), `wf-c3-readiness-store-${Date.now()}.json`);
  try {
    process.env.CRON_SECRET = "c3-readiness-secret";
    process.env.WF_SUPPRESS_ANALYTICS = "1";
    resetClippRuntimeEvidence();

    // 4a. Fresh snapshot (<24h) preserves actual observedAt in runtimeVerifiedAt instead of cron execution nowIso
    const freshObsIso = "2026-11-19T06:45:00.000Z";
    const cronExecIso = "2026-11-19T08:00:00.000Z";
    const freshIngest = ingestClippOfferEvidence(
      "clipp-m-blind-goat",
      {
        httpStatus: 200,
        finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
        html: "<title>The Blind Goat Tampa, FL</title><div>Add to Cart Buy Now $12 for $30</div>",
        observedAt: freshObsIso,
        verificationMode: "automated_chrome_producer",
      },
      { now: cronExecIso, persist: false }
    );
    ok(
      freshIngest.ok === true &&
        freshIngest.overlay?.runtimeVerifiedAt === freshObsIso &&
        freshIngest.overlay?.updatedAt === freshObsIso,
      "fresh snapshot (<24h) preserves actual observedAt timestamp in runtimeVerifiedAt rather than cron execution time"
    );

    // 4b. Stale snapshot (>24h old) is rejected
    const staleOver24h = ingestClippOfferEvidence(
      "clipp-m-blind-goat",
      {
        httpStatus: 200,
        finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
        html: "<title>The Blind Goat Tampa, FL</title><div>THIS DEAL IS SOLD OUT</div>",
        observedAt: "2026-11-18T06:00:00.000Z",
      },
      { now: cronExecIso, persist: false }
    );
    ok(
      staleOver24h.ok === false && staleOver24h.stale === true && staleOver24h.reason === "stale_snapshot_rejected",
      "stale snapshot (>24h old) is rejected with stale_snapshot_rejected"
    );

    // 4c. Snapshot older than existing runtimeVerifiedAt (<24h old, but older than 06:45Z) cannot overwrite newer 06:45Z state
    const olderThanRuntime = ingestClippOfferEvidence(
      "clipp-m-blind-goat",
      {
        httpStatus: 200,
        finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
        html: "<title>The Blind Goat Tampa, FL</title><div>THIS DEAL IS SOLD OUT</div>",
        observedAt: "2026-11-19T05:00:00.000Z",
      },
      { now: cronExecIso, persist: false }
    );
    ok(
      olderThanRuntime.ok === false &&
        olderThanRuntime.stale === true &&
        clippOfferById("clipp-m-blind-goat", { now: cronExecIso })?.status === "PRICE_CHANGED",
      "snapshot older than existing runtimeVerifiedAt is rejected and cannot overwrite newer state"
    );

    // 4d. Stale snapshot on or before manual quarantine timestamp cannot unquarantine a quarantined offer
    const staleUnquarantine = ingestClippOfferEvidence(
      "clipp-m-pizza-kitchen",
      {
        httpStatus: 200,
        finalUrl: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12875835",
        html: "<title>Pizza Kitchen Tampa, FL</title><div>Add to Cart Buy Now $10 for $20</div>",
        observedAt: "2026-11-18T23:19:12.000Z",
      },
      { now: cronExecIso, persist: false }
    );
    ok(
      staleUnquarantine.ok === false &&
        staleUnquarantine.stale === true &&
        clippOfferById("clipp-m-pizza-kitchen", { now: cronExecIso }) === null,
      "snapshot from on/before quarantine timestamp cannot unquarantine clipp-m-pizza-kitchen"
    );

    // 4e. Fixture payload is rejected from ingestClippOfferEvidence, validateClippRuntimeOverlay, and POST /api/cron/verify-offers
    const fixtureIngest = ingestClippOfferEvidence(
      "clipp-m-chez-leon",
      {
        httpStatus: 200,
        finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12863814",
        html: "<title>Chez Leon Tampa, FL</title><div>THIS DEAL IS SOLD OUT</div>",
        verificationMode: "fixture",
      },
      { now: cronExecIso, persist: false }
    );
    ok(
      fixtureIngest.ok === false && fixtureIngest.reason === "fixture_evidence_rejected",
      "ingestClippOfferEvidence rejects fixture payload with fixture_evidence_rejected"
    );
    eq(
      validateClippRuntimeOverlay("clipp-m-chez-leon", { status: "SOLD_OUT", quarantined: true, verificationMode: "fixture" }),
      null,
      "validateClippRuntimeOverlay rejects fixture overlay"
    );

    const cronFixtureRes = await postVerifyOffers(
      new Request("https://wayfind.test/api/cron/verify-offers", {
        method: "POST",
        headers: {
          authorization: "Bearer c3-readiness-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          now: cronExecIso,
          storePath: tmpC3Store,
          verificationMode: "fixture",
          isFixture: true,
          clippEvidence: [
            {
              offerId: "clipp-m-chez-leon",
              httpStatus: 200,
              finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12863814",
              title: "Chez Leon Tampa, FL",
              hasSoldOut: true,
            },
          ],
        }),
      })
    );
    const cronFixtureJson = await cronFixtureRes.json();
    ok(
      cronFixtureJson.ok === true &&
        cronFixtureJson.checked === 0 &&
        cronFixtureJson.skipped === 1 &&
        cronFixtureJson.results?.[0]?.reason === "fixture_evidence_rejected" &&
        clippOfferById("clipp-m-chez-leon", { now: cronExecIso }) !== null,
      "POST /api/cron/verify-offers rejects fixture evidence batch without mutating offer health"
    );
  } finally {
    resetClippRuntimeEvidence();
    delete process.env.CRON_SECRET;
    try { if (fs.existsSync(tmpC3Store)) fs.unlinkSync(tmpC3Store); } catch {}
  }

  // 5. Defect #2 & #4: Producer CLI PID lockfile overlap guard & non-loopback dry-run push guard
  const tmpLockFile = path.join(os.tmpdir(), `wf-c3-lock-${Date.now()}.lock`);
  const tmpFixtureForLock = path.join(os.tmpdir(), `wf-c3-lock-fixture-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpLockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), "utf8");
    fs.writeFileSync(tmpFixtureForLock, JSON.stringify([]), "utf8");
    const lockedOut = JSON.parse(
      execFileSync(
        process.execPath,
        ["scripts/produce-clipp-evidence.mjs", "--dry-run", "--fixture", tmpFixtureForLock, "--lock-file", tmpLockFile],
        { cwd: ROOT, encoding: "utf8" }
      )
    );
    ok(
      lockedOut.ok === true &&
        lockedOut.skipped === true &&
        lockedOut.reason === "already_running_pid_lock" &&
        lockedOut.holderPid === process.pid,
      "produce-clipp-evidence.mjs exits cleanly when PID lockfile is held by a live process"
    );

    fs.unlinkSync(tmpLockFile);
    const blockedPushOut = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "scripts/produce-clipp-evidence.mjs",
          "--dry-run",
          "--fixture",
          tmpFixtureForLock,
          "--push",
          "https://www.gowayfind.com/api/cron/verify-offers",
        ],
        { cwd: ROOT, encoding: "utf8" }
      )
    );
    ok(
      blockedPushOut.ok === true &&
        blockedPushOut.push?.pushed === false &&
        blockedPushOut.push?.blocked === true &&
        blockedPushOut.push?.reason === "dry_run_only_allows_loopback_push",
      "produce-clipp-evidence.mjs --dry-run blocks non-loopback push URLs"
    );
  } finally {
    try { if (fs.existsSync(tmpLockFile)) fs.unlinkSync(tmpLockFile); } catch {}
    try { if (fs.existsSync(tmpFixtureForLock)) fs.unlinkSync(tmpFixtureForLock); } catch {}
  }

  // 6. Multi-process cold restart + client applyOfferHealthSnapshot precedence after subsequent 403 and 200 challenge probes
  const tmpPrecedenceStore = path.join(os.tmpdir(), `wf-c3-precedence-store-${Date.now()}.json`);
  try {
    const writeProcCode = `
      import assert from "node:assert/strict";
      import { POST } from "./app/api/cron/verify-offers/route.js";

      // Step 1: Conclusive batch quarantines chez-leon (SOLD_OUT) and updates blind-goat (PRICE_CHANGED $12)
      const res1 = await POST(new Request("https://wayfind.test/api/cron/verify-offers", {
        method: "POST",
        headers: { authorization: "Bearer c3-prec-secret", "content-type": "application/json" },
        body: JSON.stringify({
          now: "2026-11-19T13:00:00.000Z",
          observedAt: "2026-11-19T12:55:00.000Z",
          verificationMode: "automated_chrome_producer",
          storePath: process.env.WF_CLIPP_EVIDENCE_STORE_PATH,
          clippEvidence: [
            {
              offerId: "clipp-m-chez-leon",
              httpStatus: 200,
              finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12863814",
              html: "<title>Chez Leon Tampa, FL</title><div>THIS DEAL IS SOLD OUT</div>",
            },
            {
              offerId: "clipp-m-blind-goat",
              httpStatus: 200,
              finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
              html: "<title>The Blind Goat Tampa, FL</title><div>Add to Cart Buy Now $12 for $30</div>",
            },
          ],
        }),
      }));
      assert.equal(res1.status, 200);

      // Step 2: Subsequent probe returns HTTP 403 and 200 challenge-without-CTA on both offers
      const res2 = await POST(new Request("https://wayfind.test/api/cron/verify-offers", {
        method: "POST",
        headers: { authorization: "Bearer c3-prec-secret", "content-type": "application/json" },
        body: JSON.stringify({
          now: "2026-11-19T14:00:00.000Z",
          observedAt: "2026-11-19T13:55:00.000Z",
          verificationMode: "automated_http_probe",
          storePath: process.env.WF_CLIPP_EVIDENCE_STORE_PATH,
          clippEvidence: [
            {
              offerId: "clipp-m-chez-leon",
              httpStatus: 403,
              finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12863814",
              html: "Access Denied",
            },
            {
              offerId: "clipp-m-blind-goat",
              httpStatus: 200,
              finalUrl: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
              html: "<title>The Blind Goat Tampa, FL</title><body>Please verify you are a human</body>",
            },
          ],
        }),
      }));
      assert.equal(res2.status, 200);
      console.log(JSON.stringify({ ok: true }));
    `;
    execFileSync(process.execPath, ["--input-type=module", "-e", writeProcCode], {
      cwd: ROOT,
      env: {
        ...process.env,
        CRON_SECRET: "c3-prec-secret",
        WF_CLIPP_EVIDENCE_STORE_PATH: tmpPrecedenceStore,
        WF_SUPPRESS_ANALYTICS: "1",
      },
      encoding: "utf8",
    });

    const readProcCode = `
      import assert from "node:assert/strict";
      import { clippOfferById } from "./lib/clippOffers.js";
      import { COUPONS, applyOfferHealthSnapshot, couponIsLive, resolveLiveCoupon } from "./lib/coupons.js";
      import { GET as getHealth } from "./app/api/offers/health/route.js";
      import { GET as getRedirect } from "./app/api/commerce/go/route.js";

      const PINNED_NOW = "2026-11-19T14:05:00.000Z";

      // Cold server process hydration check
      assert.equal(clippOfferById("clipp-m-chez-leon", { now: PINNED_NOW }), null, "chez-leon remains quarantined after 403 on cold restart");
      const bg = clippOfferById("clipp-m-blind-goat", { now: PINNED_NOW });
      assert.ok(bg !== null, "blind-goat remains serveable after 200 challenge on cold restart");
      assert.equal(bg.status, "PRICE_CHANGED");
      assert.equal(bg.livePrice, 12);
      assert.equal(bg.runtimeVerifiedAt, "2026-11-19T12:55:00.000Z");

      const goChez = await getRedirect(new Request("https://wayfind.test/api/commerce/go?provider=clipp&offer=clipp-m-chez-leon", {
        headers: { "user-agent": "WayfindVerify/1.0" },
      }));
      assert.equal(goChez.headers.get("location"), "https://wayfind.test/");

      // Client applyOfferHealthSnapshot hydration check
      const healthRes = await getHealth(new Request("https://wayfind.test/api/offers/health?now=" + PINNED_NOW));
      const healthJson = await healthRes.json();
      assert.equal(applyOfferHealthSnapshot(healthJson), true);

      const chezCpn = COUPONS.find((c) => c.id === "cpn-clipp-m-chez-leon");
      const bgCpn = COUPONS.find((c) => c.id === "cpn-clipp-m-blind-goat");
      assert.equal(couponIsLive(chezCpn, "2026-11-19"), false, "client couponIsLive keeps chez-leon hidden after subsequent 403");
      assert.equal(resolveLiveCoupon(chezCpn, { now: PINNED_NOW }), null);

      const resolvedBg = resolveLiveCoupon(bgCpn, { now: PINNED_NOW });
      assert.ok(resolvedBg !== null, "client resolveLiveCoupon keeps blind-goat live after subsequent challenge");
      assert.equal(resolvedBg.status, "PRICE_CHANGED");
      assert.equal(resolvedBg.livePrice, 12);
      assert.equal(resolvedBg.verifiedAt, "2026-11-19T12:55:00.000Z");

      console.log(JSON.stringify({ ok: true }));
    `;
    const readProcOut = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", readProcCode], {
        cwd: ROOT,
        env: {
          ...process.env,
          WF_CLIPP_EVIDENCE_STORE_PATH: tmpPrecedenceStore,
          WF_COMMERCE_TEST_NOW: "2026-11-19T14:05:00.000Z",
          WF_SUPPRESS_ANALYTICS: "1",
        },
        encoding: "utf8",
      })
    );
    ok(
      readProcOut && readProcOut.ok === true,
      "cold server restart and client applyOfferHealthSnapshot preserve SOLD_OUT quarantine and PRICE_CHANGED runtimeVerifiedAt after subsequent 403 and 200 challenge probes"
    );
  } finally {
    try { if (fs.existsSync(tmpPrecedenceStore)) fs.unlinkSync(tmpPrecedenceStore); } catch {}
  }
}

console.log(`test-self-healing-truth-engine: OK — ${assertions} assertions passed`);
