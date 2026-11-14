// lib/actionabilityScore.js — SERVER-ONLY internal Actionability Coverage &
// Demand-Prioritized Operations Queue engine (Wayfind Self-Healing Truth Engine,
// Phases 7 & 8).
//
// HARD RULES:
//   1. This score measures INTERNAL DECISION READINESS (completeness, freshness,
//      and executability of verified facts). It must NEVER be exposed as or
//      blended into the public Wayfind Score (`lib/wayfindScore.js`).
//   2. Sponsorship or affiliate commission NEVER increases public Wayfind Score.
//   3. Quarantined, expired, or unverified facts contribute 0 to their dimension.
//   4. Never import this module from any `"use client"` component.

import { parseOwnedHours, toRegularOpeningHours } from "./ownedHours.js";
import { isOfferStatusServeable } from "./commerceHealth.js";

export const ACTIONABILITY_DIMENSIONS = Object.freeze({
  validHours: 18,
  validOpenState: 12,
  validOfficialLink: 10,
  validPrimaryAction: 12,
  validPriceOrFree: 10,
  validDuration: 8,
  validBestTime: 8,
  validParkingLogistics: 8,
  validCoordinates: 8,
  validCommerceOffer: 6,
});

/**
 * Computes the internal `ACTIONABILITY COVERAGE` (0-100) for a place, event,
 * guide, or offer entity.
 *
 * If `includeOwnedHours` is false (simulating the pre-fix pipeline where
 * `editorial-cards.json` hours strings were not parsed into `oh` and did not
 * survive `inventoryToSkeleton` / `/api/places/details`), string hours are
 * treated as unhydrated on the runtime detail path.
 */
export function computeActionabilityCoverage(entity, { includeOwnedHours = true } = {}) {
  if (!entity || typeof entity !== "object") {
    return {
      score: 0,
      maxScore: 100,
      coveragePct: 0,
      tier: "INCOMPLETE",
      dimensions: {},
      missingDimensions: Object.keys(ACTIONABILITY_DIMENSIONS),
    };
  }

  const kind = entity.kind || (entity.event_id || entity.start_date ? "event" : "place");

  // 1. Valid Hours & 2. Valid Current Open State
  let hasValidHours = false;
  let hasValidOpenState = false;

  if (kind === "event") {
    const start = entity.start_date || entity.date || null;
    const end = entity.end_date || entity.endDate || start;
    hasValidHours = Boolean(start && (entity.start_time || entity.time || entity.schedule_note || entity.scheduleNote || entity.visit_schedule));
    hasValidOpenState = Boolean(start && end && entity.event_status !== "unannounced" && entity.event_status !== "paused");
  } else {
    const ohObj = entity.regularOpeningHours || entity.oh || null;
    if (ohObj && Array.isArray(ohObj.weekdayDescriptions) && ohObj.weekdayDescriptions.length > 0) {
      hasValidHours = true;
      hasValidOpenState = Array.isArray(ohObj.periods) && ohObj.periods.length > 0;
    } else if (includeOwnedHours && typeof entity.hours === "string" && entity.hours.trim()) {
      const parsed = parseOwnedHours(entity.hours);
      hasValidHours = Boolean(parsed && parsed.weekdayDescriptions && parsed.weekdayDescriptions.length > 0);
      hasValidOpenState = Boolean(parsed && parsed.parseable && parsed.periods.length > 0);
    }
  }

  // 3. Valid Official Link
  const officialUrl = entity.website || entity.websiteUri || entity.official_event_url || entity.official_ticket_url || entity.url || null;
  const hasValidOfficialLink = Boolean(
    typeof officialUrl === "string" && /^https?:\/\//i.test(officialUrl.trim()) && entity.link_ok !== false
  );

  // 4. Valid Primary Action (directions with coords/address, ticket CTA, or official site)
  const lat = Number(entity.lat);
  const lng = Number(entity.lng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const hasAddress = Boolean(
    (typeof entity.official_address === "string" && entity.official_address.trim()) ||
    (typeof entity.address === "string" && entity.address.trim())
  );
  const hasValidPrimaryAction = Boolean(hasCoords || hasAddress || hasValidOfficialLink);

  // 5. Valid Price or Free Status
  const hasValidPriceOrFree = Boolean(
    entity.is_free === true ||
    entity.free === true ||
    entity.price_band != null ||
    entity.price_min != null ||
    entity.priceNum != null ||
    (typeof entity.price === "string" && entity.price.trim()) ||
    (typeof entity.admission === "string" && entity.admission.trim()) ||
    (typeof entity.cost === "string" && entity.cost.trim())
  );

  // 6. Valid Duration
  const hasValidDuration = Boolean(
    (typeof entity.duration === "string" && entity.duration.trim()) ||
    (typeof entity.duration_recommendation === "string" && entity.duration_recommendation.trim()) ||
    (Number.isFinite(Number(entity.durationMinutes)) && Number(entity.durationMinutes) > 0)
  );

  // 7. Valid Best Time to Go
  const hasValidBestTime = Boolean(
    (typeof entity.bestTime === "string" && entity.bestTime.trim()) ||
    (typeof entity.best_time === "string" && entity.best_time.trim()) ||
    (typeof entity.insider_tip === "string" && entity.insider_tip.trim()) ||
    (typeof entity.insiderTip === "string" && entity.insiderTip.trim())
  );

  // 8. Valid Parking / Logistics
  const hasValidParkingLogistics = Boolean(
    (typeof entity.parking === "string" && entity.parking.trim()) ||
    (typeof entity.parking_tip === "string" && entity.parking_tip.trim()) ||
    hasAddress
  );

  // 9. Valid Coordinates
  const hasValidCoordinates = hasCoords;

  // 10. Valid Commerce Offer (if applicable; non-commercial entities are not penalized)
  const commerceApplicable = Boolean(
    entity.commerceApplicable ||
    entity.partnerOffer ||
    entity.offerStatus ||
    entity.ticketUrl ||
    entity.dealEntry
  );
  const hasValidCommerceOffer = commerceApplicable
    ? Boolean(
        (!entity.offerStatus || isOfferStatusServeable(entity.offerStatus)) &&
        !entity.quarantined &&
        (entity.partnerOffer || entity.ticketUrl || entity.dealEntry || entity.offerStatus === "ACTIVE" || entity.offerStatus === "ALMOST_GONE" || entity.offerStatus === "PRICE_CHANGED")
      )
    : true;

  const dimensions = {
    validHours: hasValidHours,
    validOpenState: hasValidOpenState,
    validOfficialLink: hasValidOfficialLink,
    validPrimaryAction: hasValidPrimaryAction,
    validPriceOrFree: hasValidPriceOrFree,
    validDuration: hasValidDuration,
    validBestTime: hasValidBestTime,
    validParkingLogistics: hasValidParkingLogistics,
    validCoordinates: hasValidCoordinates,
    validCommerceOffer: hasValidCommerceOffer,
  };

  let score = 0;
  const missingDimensions = [];
  for (const [key, weight] of Object.entries(ACTIONABILITY_DIMENSIONS)) {
    if (dimensions[key]) score += weight;
    else missingDimensions.push(key);
  }

  const tier =
    score >= 85
      ? "DECISION_READY"
      : score >= 65
      ? "ACTIONABLE"
      : score >= 40
      ? "PARTIAL"
      : "NEEDS_ENRICHMENT";

  return {
    score,
    maxScore: 100,
    coveragePct: score,
    tier,
    dimensions,
    missingDimensions,
  };
}

/**
 * Builds the Demand-Prioritized Operations Queue (Phase 8).
 * Prioritizes verification, enrichment, and healing by:
 *   1. Top-viewed / high-impression entities
 *   2. Top-clicked / high-intent entities
 *   3. Entities on homepage / city / seasonal / guide pages
 *   4. Entities with commerce potential
 *   5. Entities expiring soon or with high volatility
 *   6. Entities with recent user bounces or failed clicks
 */
export function buildDemandOperationsQueue(entities = [], { nowMs = Date.now() } = {}) {
  if (!Array.isArray(entities)) return [];

  const scored = entities
    .filter((e) => e && typeof e === "object")
    .map((entity) => {
      const actionability = computeActionabilityCoverage(entity);
      const deficit = 100 - actionability.score;

      const views = Math.max(0, Number(entity.views || entity.impressions || 0));
      const clicks = Math.max(0, Number(entity.clicks || entity.outboundClicks || 0));
      const failedClicks = Math.max(0, Number(entity.failedClicks || entity.failureCount || 0));
      const surfaceBoost = entity.onHomepage || entity.onSeasonalHub || entity.onGuide
        ? 35
        : entity.onCityPage
        ? 20
        : 0;
      const commerceBoost = entity.hasCommercePotential || entity.commerceApplicable ? 30 : 0;

      let expiryUrgency = 0;
      if (entity.expiresAt) {
        const expMs = new Date(entity.expiresAt).getTime();
        if (Number.isFinite(expMs)) {
          const hoursLeft = (expMs - nowMs) / 3600000;
          if (hoursLeft <= 0) expiryUrgency = 60;
          else if (hoursLeft <= 24) expiryUrgency = 45;
          else if (hoursLeft <= 72) expiryUrgency = 25;
        }
      }
      if (entity.volatilityTier === "VERY_VOLATILE") expiryUrgency += 20;

      const demandScore =
        Math.min(40, Math.log10(views + 1) * 12) +
        Math.min(45, Math.log10(clicks + 1) * 18) +
        failedClicks * 25 +
        surfaceBoost +
        commerceBoost +
        expiryUrgency;

      const priorityScore = Math.round((demandScore * (1 + deficit / 100)) * 10) / 10;

      return {
        id: entity.id || entity.place_id || entity.event_id || entity.offerId || "unknown",
        name: entity.name || entity.event_name || entity.title || "Unnamed",
        kind: entity.kind || "place",
        priorityScore,
        actionabilityScore: actionability.score,
        tier: actionability.tier,
        missingDimensions: actionability.missingDimensions,
        recommendedAction:
          failedClicks > 0
            ? "QUARANTINE_OR_REVERIFY_OFFER"
            : expiryUrgency >= 45
            ? "REVERIFY_EXPIRING_FACT"
            : !actionability.dimensions.validHours
            ? "ENRICH_HOURS"
            : !actionability.dimensions.validOpenState
            ? "PARSE_STRUCTURED_HOURS"
            : "ROUTINE_AUDIT",
      };
    });

  return scored.sort((a, b) => b.priorityScore - a.priorityScore);
}
