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

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEditorialHours } from "../lib/editorialHoursParser.js";
import { cardToEditorial } from "../lib/atlasCards.js";
import { RAINY_DAY_2026_GUIDES } from "../lib/guidesRainyDay2026.js";
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

// Load verified editorial packs (`docs/editorial/*/pack-*.json`)
const editorialPackById = new Map();
const editorialDocsRoot = path.join(ROOT, "docs/editorial");
if (existsSync(editorialDocsRoot)) {
  for (const dirName of readdirSync(editorialDocsRoot).sort()) {
    const dirPath = path.join(editorialDocsRoot, dirName);
    let files = [];
    try {
      files = readdirSync(dirPath).filter((f) => /^pack-\d+\.json$/.test(f)).sort();
    } catch {
      continue;
    }
    for (const fileName of files) {
      try {
        const pack = JSON.parse(readFileSync(path.join(dirPath, fileName), "utf8"));
        for (const cand of Array.isArray(pack?.candidates) ? pack.candidates : []) {
          if (cand && cand.place_id && !editorialPackById.has(cand.place_id)) {
            const edObj = cand.editorial || cand;
            editorialPackById.set(cand.place_id, {
              raw: cand,
              editorial: {
                name: cand.name || edObj.name || null,
                know_before: edObj.know_before || null,
                watchOut: edObj.know_before || null,
                facts: Array.isArray(edObj.facts) ? edObj.facts : [],
              },
            });
          }
        }
      } catch {
        // Ignore malformed pack files
      }
    }
  }
}

// Load verified Rainy Day Guide 2026 picks (`lib/guidesRainyDay2026.js`)
const guideEditorialById = new Map();
for (const guide of Object.values(RAINY_DAY_2026_GUIDES || {})) {
  for (const pickItem of Array.isArray(guide?.picks) ? guide.picks : []) {
    if (!pickItem?.placeId || typeof pickItem.blurb !== "string") continue;
    for (const sentence of pickItem.blurb.split(/\.\s+/)) {
      const trimmed = sentence.trim().replace(/\.$/, "");
      if (
        /^(?:open|galleries\s+open)\b/i.test(trimmed) &&
        !/\b(?:school\s+year|summer|box\s+office|ticket\s+office)\b/i.test(trimmed)
      ) {
        guideEditorialById.set(pickItem.placeId, {
          hoursText: trimmed,
          hours: trimmed,
        });
      }
    }
  }
}

const firstPartyPlaces = firstPartyData.places || {};
const overridePlaces = overridesData.places || overridesData.overrides || {};

// Include all first-party action places, overrides, key frontier fixtures, plus verified wf_editorial_servable / wf_inventory editorial hours facts
const HIGH_INTENT_FIXTURES = {
  "ChIJ5d9yNNEXw4gRm2kGIGmpfT4": {
    place_id: "ChIJ5d9yNNEXw4gRm2kGIGmpfT4",
    name: "Riverwalk Splash Park",
    locality: "Bradenton",
    category: "Water Park",
    types: ["water_park", "amusement_park", "point_of_interest", "establishment"],
    gap_class: "MUNICIPAL_SPLASH_PARK",
  },
  "ChIJ6y2dx9g_w4gRWoZIRhLk-JI": {
    editorial: {
      hoursText: "The museum is open daily 10am-5pm, with general admission free on Mondays; it is closed Thanksgiving, Christmas Day, and New Year's Day.",
    },
  },
  "ChIJAdipByc9w4gR2lYv8gezcWM": {
    editorial: {
      hoursText: "Hours are 11:00 AM – 9:00 PM daily",
    },
  },
  "ChIJIZt3d7DFwogRQ5Lg2tPMXyk": {
    editorial: {
      hoursText: "Hours are Mon-Thu 5:00 PM-12:30 AM, Fri 5:00 PM-2:30 AM, Sat 3:00 PM-2:30 AM, and Sun 2:00 PM-12:30 AM.",
    },
  },
  "ChIJOdY8qlHEwogRXPbXY1cq2xo": {
    editorial: {
      hoursText: "Hours are Sunday 4pm-3am, Monday-Tuesday closed, Wednesday-Thursday 7pm-3am, Friday 6pm-3am, and Saturday 4pm-3am.",
    },
  },
  "ChIJPd6UAfJ_3YgRP-V0GS5jS8I": {
    editorial: {
      hoursText: "Open 10 AM–11 PM Monday–Thursday, 10 AM–11:30 PM Friday–Saturday, 10 AM–11 PM Sunday.",
    },
  },
  "ChIJjwUZ8htHw4gR6-xAgrevYLM": {
    editorial: {
      hoursText: "The Sarasota location's official page lists hours of 11 a.m.-midnight Sunday-Thursday and 11 a.m.-1 a.m. Friday-Saturday.",
    },
  },
  "ChIJkTDP2OLFwogR9W0EjRYIL-0": {
    editorial: {
      hoursText: "Open Mon–Thu 11 AM–9:30 PM, Fri–Sat 11 AM–10:30 PM, Sun 11:30 AM–9 PM.",
    },
  },
  "ChIJq2_lAFHEwogRRCeJJ77fHgg": {
    editorial: {
      hoursText: "Bad Monkey is a sports bar in Ybor City at 1717 E 7th Ave, Tampa, FL 33605, open daily noon to 3 AM.",
    },
  },
  "ChIJv4dyuXnPwogRMK5yN-Ke2Iw": {
    editorial: {
      hoursText: "Hours are Monday-Friday 5 p.m.-3 a.m. and Saturday-Sunday 7 p.m.-3 a.m.",
    },
  },
};

function classifyQueueItemSchedule({ hasStructuredHours, sourceFact, parsedReason }) {
  if (hasStructuredHours) return "STRUCTURED_HOURS_RESOLVED_ACTION_GAP";
  const fact = String(sourceFact || "").trim();
  const reason = String(parsedReason || "").trim();
  if (!fact) return "UNPOSTED_OR_NO_CARD";
  if (
    reason === "seasonal-hours-require-verification" ||
    /\b(?:seasonal|seasonally|june\s*[–-]\s*september|october\s*[–-]\s*may|sept(?:ember)?\s+\d+\s*[–-]\s*feb(?:ruary)?\s+\d+|winter\s+(?:season|hours)|summer\s+(?:season|hours)|reduced\s+summer\s+hours)\b|^\s*(?:summer|winter)\s*:/i.test(fact)
  ) {
    return "SEASONAL_VARIABLE";
  }
  if (reason === "daylight-bound-prose-hours" || /\b(?:sunrise|sunset|sundown|dawn|dusk)\b/i.test(fact)) {
    return "DAYLIGHT_BOUND";
  }
  if (
    reason === "lodging-checkin-not-operating-hours" ||
    /\b(?:night\s+minimum\s+by\s+unit|check[- ]in|check[- ]out)\b/i.test(fact)
  ) {
    return "LODGING_CHECKIN_ONLY";
  }
  if (
    reason === "box-office-not-venue-hours" ||
    reason === "subfacility-not-venue-hours" ||
    /^\s*(?:box\s+office|rooftop\s+bar|ticket\s+office|office\/front\s+desk|office\s+mon|front\s+desk|fuel\s+dock|fuel\/bait)\b|\bfuel\/bait\b|\bfuel\s+dock\b/i.test(fact)
  ) {
    return "SUBFACILITY_OR_BOX_OFFICE_ONLY";
  }
  if (/\b(?:official\s+clocks\s+disagree|also\s+says|still\s+says)\b/i.test(fact)) {
    return "CONFLICTING_OFFICIAL_CLOCKS";
  }
  if (
    /\b(?:event[- ]based|by\s+appointment|train\s+rides\s+weekends\s+only|call\s+to\s+confirm|check\s+ahead|confirm\s+(?:the\s+current\s+week|before)|hours?\s+vary|vary\s+by\s+day|hours?\s+aren'?t\s+posted|not\s+posted|does\s+not\s+print|closed\s+for\s+summer|made\s+to\s+order|weddings\s+can\s+close|free\s+sunday\s+shows|on\s+site\s+only\s+for\s+a\s+charter|^call\s*;)\b/i.test(fact)
  ) {
    return "VARIABLE_OR_UNPOSTED";
  }
  if (
    reason.startsWith("incomplete-week-schedule") ||
    /\b(?:from\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|daily\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*;\s*kitchen\s+closes|third\s+thursday|late[- ]night\s+hours\s+on\s+fridays|saturday\s+docent\s+tours)\b/i.test(fact)
  ) {
    return "PARTIAL_WEEK_OR_MISSING_CLOSE";
  }
  return "AMBIGUOUS_PROSE";
}

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
  const parsed = parseEditorialHours(editorial || raw.hours, { venueName: raw.name || editorial?.name || null });
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
let fallbackReadinessSum = 0;

const GENERATED_AT = "2026-11-13T15:00:00.000Z";
const NOW_MS = Date.parse(GENERATED_AT);

for (const placeId of allTargetIds) {
  const fpEntry = firstPartyPlaces[placeId] || overridePlaces[placeId] || HIGH_INTENT_FIXTURES[placeId] || {};
  const fixtureEditorial = HIGH_INTENT_FIXTURES[placeId]?.editorial || null;
  const atlasEntry = atlasById.get(placeId) || null;
  const packEntry = editorialPackById.get(placeId) || null;
  const guideEditorial = guideEditorialById.get(placeId) || null;
  const atlasRaw = atlasEntry?.raw || null;
  const baseEditorial = atlasEntry?.editorial || packEntry?.editorial || null;
  const fallbackHoursText =
    fixtureEditorial?.hoursText ||
    guideEditorial?.hoursText ||
    packEntry?.editorial?.hoursText ||
    null;
  const fallbackFacts =
    (Array.isArray(packEntry?.editorial?.facts) && packEntry.editorial.facts.length > 0 ? packEntry.editorial.facts : null) ||
    (Array.isArray(fixtureEditorial?.facts) && fixtureEditorial.facts.length > 0 ? fixtureEditorial.facts : null) ||
    null;
  const atlasEditorial = baseEditorial
    ? {
        ...baseEditorial,
        ...(!baseEditorial.hoursText && fallbackHoursText ? { hoursText: fallbackHoursText } : {}),
        ...(!baseEditorial.hours && fallbackHoursText ? { hours: fallbackHoursText } : {}),
        ...(!baseEditorial.know_before && packEntry?.editorial?.know_before ? { know_before: packEntry.editorial.know_before } : {}),
        ...((!Array.isArray(baseEditorial.facts) || baseEditorial.facts.length === 0) && fallbackFacts
          ? { facts: fallbackFacts }
          : {}),
      }
    : (fixtureEditorial || guideEditorial || null);
  const resolvedActions = firstPartyActionsForPlace(placeId) || fpEntry.actions || null;

  const syntheticDetail = {
    id: placeId,
    place_id: placeId,
    name: fpEntry.name || atlasRaw?.name || packEntry?.raw?.name || placeId,
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
  fallbackReadinessSum += actionability.fallbackReadiness.score;

  placesLedger[placeId] = {
    place_id: placeId,
    name: syntheticDetail.name,
    locality: syntheticDetail.locality,
    gap_class: fpEntry.gap_class || (atlasRaw ? "ATLAS_TOP_INVENTORY" : null),
    timezone: ownedHours.timezone || "America/New_York",
    official_website: resolvedActions?.officialWebsite || (officialUrl ? {
      url: officialUrl,
      source: "atlas_editorial_card",
      confidence: "EXACT",
      verification_status: "verified",
      verified_at: atlasRaw?.verified_at || null,
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
      timezone: ownedHours.timezone || "America/New_York",
      verified_at: ownedHours.verifiedAt || null,
      freshness: ownedHours.freshness || "unverified_timestamp",
      exceptions: Array.isArray(ownedHours.exceptions) ? ownedHours.exceptions : [],
      periods_count: periods.length,
      periods: hasStructuredHours ? periods : [],
      weekday_descriptions: weekdayDescriptions,
      special_hours_count: Array.isArray(ownedHours.specialHours) ? ownedHours.specialHours.length : 0,
      special_hours: Array.isArray(ownedHours.specialHours) ? ownedHours.specialHours : [],
    },
    admission_truth: admissionTruth,
    actionability: {
      score: actionability.score,
      answered_count: actionability.answeredCount,
      total_dimensions: actionability.totalDimensions,
      dimensions: actionability.dimensions,
      missing_dimensions: actionability.missingDimensions,
      verified_coverage: actionability.verifiedCoverage,
      fallback_readiness: actionability.fallbackReadiness,
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
    const parsedForReason = atlasEditorial ? parseEditorialHours(atlasEditorial, { venueName: syntheticDetail.name }) : null;
    const scheduleClassification = classifyQueueItemSchedule({
      hasStructuredHours,
      sourceFact: ownedHours.sourceFact || parsedForReason?.sourceFact || null,
      parsedReason: parsedForReason?.reason || null,
    });
    reviewQueue.push({
      place_id: placeId,
      name: syntheticDetail.name,
      locality: syntheticDetail.locality,
      gap_class: fpEntry.gap_class || "ATLAS_TOP_INVENTORY",
      schedule_classification: scheduleClassification,
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

// Also scan remaining Atlas cards not in allTargetIds that have PROSE_ONLY hours so the review queue captures all unparsed prose hours
for (const [placeId, { raw, editorial }] of atlasById.entries()) {
  if (placesLedger[placeId]) continue;
  const parsed = parseEditorialHours(editorial, { venueName: raw.name || null });
  if (!parsed.ok && parsed.sourceFact) {
    const scheduleClassification = classifyQueueItemSchedule({
      hasStructuredHours: false,
      sourceFact: parsed.sourceFact,
      parsedReason: parsed.reason,
    });
    reviewQueue.push({
      place_id: placeId,
      name: raw.name || placeId,
      locality: raw.city || "Sarasota",
      gap_class: "ATLAS_PROSE_HOURS",
      schedule_classification: scheduleClassification,
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

const classificationSummary = {};
for (const item of reviewQueue) {
  const cls = item.schedule_classification || "UNCLASSIFIED";
  classificationSummary[cls] = (classificationSummary[cls] || 0) + 1;
}

const avgActionabilityScore = allTargetIds.length > 0 ? Number((actionabilitySum / allTargetIds.length).toFixed(2)) : 0;
const avgFallbackReadinessScore = allTargetIds.length > 0 ? Number((fallbackReadinessSum / allTargetIds.length).toFixed(2)) : 0;

const ownedTruthPayload = {
  schema_version: 1,
  generated_at: GENERATED_AT,
  invariants: {
    wayfind_score_independent: true,
    affiliate_never_outranks_verified_official_in_primary_cta: true,
    zero_paid_lookup_capable: true,
    fallback_readiness_separate_from_verified_coverage: true,
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
      avg_verified_coverage_score: avgActionabilityScore,
      avg_fallback_readiness_score: avgFallbackReadinessScore,
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
  classification_summary: classificationSummary,
  items: reviewQueue,
};

writeFileSync(path.join(ROOT, "data/owned-place-truth.json"), JSON.stringify(ownedTruthPayload, null, 2) + "\n", "utf8");
writeFileSync(path.join(ROOT, "data/place-truth-review-queue.json"), JSON.stringify(reviewQueuePayload, null, 2) + "\n", "utf8");

console.log("Owned Place Truth ledger written:", JSON.stringify(ownedTruthPayload.summary, null, 2));
console.log("Review queue classification summary:", JSON.stringify(classificationSummary, null, 2));
console.log(`Review queue written: ${reviewQueuePayload.items.length} items (of ${reviewQueue.length} total candidates)`);
