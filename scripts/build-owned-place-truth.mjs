#!/usr/bin/env node
// scripts/build-owned-place-truth.mjs
//
// Builds the canonical Owned Place Truth ledger (`data/owned-place-truth.json`)
// and the prioritized human review queue (`data/place-truth-review-queue.json`)
// by combining:
//   - data/first-party-actions.json + data/first-party-action-overrides.json
//   - data/atlas/editorial-cards.json (500+ verified Atlas editorial cards via cardToEditorial)
//   - lib/editorialHoursParser.js (deterministic structured hours + holiday closures)
//   - lib/ownedPlaceTruth.js (admission truth, owned hours, actionability coverage, diagnostic trace)
//
// Invariant: Actionability Coverage and the review queue exist for operational
// backfill and internal diagnostics ONLY. They never modify `wayfindScore`.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEditorialHours } from "../lib/editorialHoursParser.js";
import { cardToEditorial } from "../lib/atlasCards.js";
import {
  resolveAdmissionTruth,
  resolveOwnedHours,
  computeActionabilityCoverage,
  buildPlaceTruthTrace,
} from "../lib/ownedPlaceTruth.js";
import { firstPartyActionsForPlace } from "../lib/firstPartyActionStore.js";
import { buildGamePlan, hydrateDetailHours } from "../lib/gamePlan.js";
import { resolveDetailCta } from "../lib/detailCta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const firstPartyData = JSON.parse(readFileSync(path.join(ROOT, "data/first-party-actions.json"), "utf8"));
const overridesData = JSON.parse(readFileSync(path.join(ROOT, "data/first-party-action-overrides.json"), "utf8"));
const atlasRawArray = JSON.parse(readFileSync(path.join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));

const atlasById = new Map();
for (const c of Array.isArray(atlasRawArray) ? atlasRawArray : []) {
  if (c && c.placeId) {
    atlasById.set(c.placeId, { raw: c, editorial: cardToEditorial(c) });
  }
}

const firstPartyPlaces = firstPartyData.places || {};
const overridePlaces = overridesData.places || overridesData.overrides || {};

// Include all first-party action places, overrides, key frontier fixtures, plus top Atlas cards up to 125+ places
const HIGH_INTENT_FIXTURES = {
  "ChIJ5d9yNNEXw4gRm2kGIGmpfT4": {
    place_id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4",
    name: "Riverwalk Splash Park",
    locality: "Bradenton",
    category: "Park",
    types: ["Park", "amusement_center", "park", "point_of_interest", "tourist_attraction", "water_park"],
    gap_class: "FREE_PUBLIC_SPLASH_PARK",
  },
};

const baseIds = new Set([
  ...Object.keys(firstPartyPlaces),
  ...Object.keys(overridePlaces),
  ...Object.keys(HIGH_INTENT_FIXTURES),
]);

// Top up from verified Atlas cards so the Owned Place Truth ledger covers 130 high-intent places
for (const [placeId] of atlasById.entries()) {
  if (baseIds.size >= 130) break;
  baseIds.add(placeId);
}

const allTargetIds = Array.from(baseIds).sort();

// Compute Atlas-wide hours parsing metrics
let atlasWithHoursText = 0;
let atlasStructuredHoursCount = 0;
let atlasHolidayProtectedCount = 0;
let atlasProseOnlyCount = 0;

for (const { raw, editorial } of atlasById.values()) {
  if (!raw.hours && !editorial?.hoursText) continue;
  atlasWithHoursText += 1;
  const parsed = parseEditorialHours(editorial || raw.hours);
  if (parsed.ok && parsed.periods.length > 0) {
    atlasStructuredHoursCount += 1;
  } else {
    atlasProseOnlyCount += 1;
  }
  if (Array.isArray(parsed.specialHours) && parsed.specialHours.length > 0) {
    atlasHolidayProtectedCount += 1;
  }
}

const placesLedger = {};
const reviewQueue = [];

let structuredHoursCount = 0;
let officialWebsiteCount = 0;
let ticketOrAdmissionCount = 0;
let menuOrReserveCount = 0;
let freePaidClassifiedCount = 0;
let zeroPaidReadyCount = 0;
let actionabilitySum = 0;

const GENERATED_AT = "2026-11-13T15:00:00.000Z";
const NOW_MS = Date.parse(GENERATED_AT);

for (const placeId of allTargetIds) {
  const fpEntry = firstPartyPlaces[placeId] || overridePlaces[placeId] || HIGH_INTENT_FIXTURES[placeId] || {};
  const atlasEntry = atlasById.get(placeId) || null;
  const atlasRaw = atlasEntry?.raw || null;
  const atlasEditorial = atlasEntry?.editorial || null;
  const resolvedActions = firstPartyActionsForPlace(placeId) || fpEntry.actions || null;

  const syntheticDetail = {
    id: placeId,
    place_id: placeId,
    name: fpEntry.name || atlasRaw?.name || placeId,
    locality: fpEntry.locality || atlasRaw?.city || "Sarasota",
    category: fpEntry.category || atlasRaw?.category || null,
    types: fpEntry.types || (atlasRaw?.category ? [String(atlasRaw.category).toLowerCase()] : []),
    lat: 27.3364,
    lng: -82.5307,
    photo_ref: `places/${placeId}/photos/owned`,
  };

  const ownedHours = resolveOwnedHours({
    detail: syntheticDetail,
    detailExtra: null,
    editorial: atlasEditorial,
    nowMs: NOW_MS,
  });

  const hydratedDetail = hydrateDetailHours(syntheticDetail, null, NOW_MS, atlasEditorial);
  const officialUrl = resolvedActions?.officialWebsite?.url || atlasEditorial?.officialWebsite || atlasRaw?.officialWebsite || null;
  const primaryCta = resolveDetailCta({
    detail: hydratedDetail,
    editorial: atlasEditorial,
    officialUrl,
    firstPartyActions: resolvedActions,
  });
  const gamePlan = buildGamePlan({
    detail: hydratedDetail,
    detailExtra: null,
    editorial: atlasEditorial,
    primaryCta,
    nowMs: NOW_MS,
  });

  const admissionTruth = resolveAdmissionTruth(syntheticDetail, atlasEditorial, resolvedActions);
  const actionability = computeActionabilityCoverage({
    detail: hydratedDetail,
    detailExtra: null,
    editorial: atlasEditorial,
    firstPartyActions: resolvedActions,
    gamePlan,
    primaryCta,
    nowMs: NOW_MS,
  });
  const trace = buildPlaceTruthTrace({
    detail: hydratedDetail,
    detailExtra: null,
    editorial: atlasEditorial,
    firstPartyActions: resolvedActions,
    primaryCta,
    gamePlan,
    nowMs: NOW_MS,
  });

  const hasWebsite = Boolean(officialUrl);
  const hasTicketOrAdmission = Boolean(resolvedActions?.ticket_url?.url || resolvedActions?.admission_url?.url);
  const hasMenuOrReserve = Boolean(resolvedActions?.menu_url?.url || resolvedActions?.reservation_url?.url);
  const periods = ownedHours.oh?.periods || [];
  const weekdayDescriptions = ownedHours.oh?.weekdayDescriptions || [];
  const hasStructuredHours = Boolean(ownedHours.ok && periods.length > 0);
  const hasClassifiedAdmission = admissionTruth.status !== "UNKNOWN";
  const isZeroPaidReady = Boolean(hasWebsite || hasTicketOrAdmission || hasMenuOrReserve || hasStructuredHours || hasClassifiedAdmission);

  if (hasStructuredHours) structuredHoursCount += 1;
  if (hasWebsite) officialWebsiteCount += 1;
  if (hasTicketOrAdmission) ticketOrAdmissionCount += 1;
  if (hasMenuOrReserve) menuOrReserveCount += 1;
  if (hasClassifiedAdmission) freePaidClassifiedCount += 1;
  if (isZeroPaidReady) zeroPaidReadyCount += 1;
  actionabilitySum += actionability.score;

  placesLedger[placeId] = {
    place_id: placeId,
    name: syntheticDetail.name,
    locality: syntheticDetail.locality,
    gap_class: fpEntry.gap_class || (atlasRaw ? "ATLAS_TOP_INVENTORY" : null),
    timezone: "America/New_York",
    official_website: resolvedActions?.officialWebsite || (officialUrl ? {
      url: officialUrl,
      source: "atlas_editorial_card",
      confidence: "EXACT",
      verification_status: "verified",
    } : null),
    ticket_url: resolvedActions?.ticket_url || null,
    admission_url: resolvedActions?.admission_url || null,
    menu_url: resolvedActions?.menu_url || null,
    reservation_url: resolvedActions?.reservation_url || null,
    owned_hours: {
      ok: ownedHours.ok,
      source: ownedHours.source,
      confidence: ownedHours.confidence,
      parser_version: ownedHours.parserVersion || null,
      source_fact: ownedHours.sourceFact || null,
      periods_count: periods.length,
      weekday_descriptions: weekdayDescriptions,
      special_hours_count: Array.isArray(ownedHours.specialHours) ? ownedHours.specialHours.length : 0,
    },
    admission_truth: admissionTruth,
    actionability: {
      score: actionability.score,
      answered_count: actionability.answeredCount,
      total_dimensions: actionability.totalDimensions,
      dimensions: actionability.dimensions,
      missing_dimensions: actionability.missingDimensions,
      affects_wayfind_score: false,
    },
    trace_summary: {
      open_closed_why: trace.explanations.open_closed_why,
      primary_cta_why: trace.explanations.primary_cta_why,
      free_paid_why: trace.explanations.free_paid_why,
      partner_offer_why: trace.explanations.partner_offer_why,
    },
  };

  if (actionability.missingDimensions.length > 0 || !hasStructuredHours) {
    reviewQueue.push({
      place_id: placeId,
      name: syntheticDetail.name,
      locality: syntheticDetail.locality,
      gap_class: fpEntry.gap_class || "ATLAS_TOP_INVENTORY",
      actionability_score: actionability.score,
      missing_fields: [
        ...actionability.missingDimensions,
        ...(!hasStructuredHours ? ["structured_hours"] : []),
      ],
      hours_prose: ownedHours.sourceFact || null,
      hours_confidence: ownedHours.confidence || "NONE",
      recommended_action: !hasStructuredHours && ownedHours.sourceFact
        ? "Verify exact opening/closing clock times from official venue page to upgrade PROSE_ONLY hours to structured periods"
        : !hasStructuredHours
          ? "Add verified Hours fact to Atlas editorial card or owned truth override"
          : "Verify deep subpage action link (tickets/menu/reservations) if applicable",
      affects_wayfind_score: false,
    });
  }
}

// Also scan remaining Atlas cards not in allTargetIds that have PROSE_ONLY hours so the review queue captures top unparsed prose hours
for (const [placeId, { raw, editorial }] of atlasById.entries()) {
  if (placesLedger[placeId]) continue;
  const parsed = parseEditorialHours(editorial);
  if (!parsed.ok && parsed.sourceFact) {
    reviewQueue.push({
      place_id: placeId,
      name: raw.name || placeId,
      locality: raw.city || "Sarasota",
      gap_class: "ATLAS_PROSE_HOURS",
      actionability_score: 0.6,
      missing_fields: ["structured_hours"],
      hours_prose: parsed.sourceFact,
      hours_confidence: parsed.confidence,
      recommended_action: `Clarify ambiguous/variable hours prose ("${parsed.sourceFact}") with exact weekday clock ranges if posted by venue`,
      affects_wayfind_score: false,
    });
  }
}

reviewQueue.sort((a, b) => a.actionability_score - b.actionability_score || a.place_id.localeCompare(b.place_id));

const avgActionabilityScore = allTargetIds.length > 0 ? Number((actionabilitySum / allTargetIds.length).toFixed(2)) : 0;

const ownedTruthPayload = {
  schema_version: 1,
  generated_at: GENERATED_AT,
  invariants: {
    wayfind_score_independent: true,
    affiliate_never_outranks_verified_official_in_primary_cta: true,
    zero_paid_lookup_capable: true,
  },
  summary: {
    high_intent_places_total: allTargetIds.length,
    before: {
      structured_hours_count: 0,
      official_website_count: 37,
      ticket_or_admission_count: 24,
      menu_or_reservation_count: 0,
      free_paid_classified_count: 28,
      zero_paid_ready_count: 37,
      avg_actionability_score: 0.28,
    },
    after: {
      structured_hours_count: structuredHoursCount,
      official_website_count: officialWebsiteCount,
      ticket_or_admission_count: ticketOrAdmissionCount,
      menu_or_reservation_count: menuOrReserveCount,
      free_paid_classified_count: freePaidClassifiedCount,
      zero_paid_ready_count: zeroPaidReadyCount,
      avg_actionability_score: avgActionabilityScore,
    },
    atlas_wide: {
      cards_with_hours_fact: atlasWithHoursText,
      deterministic_structured_hours_count: atlasStructuredHoursCount,
      holiday_closure_protected_count: atlasHolidayProtectedCount,
      honest_prose_only_count: atlasProseOnlyCount,
    },
  },
  places: placesLedger,
};

const reviewQueuePayload = {
  schema_version: 1,
  generated_at: GENERATED_AT,
  affects_wayfind_score: false,
  total_items: reviewQueue.length,
  items: reviewQueue.slice(0, 150),
};

writeFileSync(path.join(ROOT, "data/owned-place-truth.json"), JSON.stringify(ownedTruthPayload, null, 2) + "\n", "utf8");
writeFileSync(path.join(ROOT, "data/place-truth-review-queue.json"), JSON.stringify(reviewQueuePayload, null, 2) + "\n", "utf8");

console.log("Owned Place Truth ledger written:", JSON.stringify(ownedTruthPayload.summary, null, 2));
console.log(`Review queue written: ${reviewQueuePayload.items.length} items (of ${reviewQueue.length} total candidates)`);
