// lib/ownedPlaceTruth.js — Canonical Owned Place Truth Architecture for Wayfind.
//
// Lets Wayfind answer the core local-decision questions ("Can I go now?",
// "When should I go?", "What does it cost?", "Do I need tickets / where do I
// get them?", "How long?", "Where do I park?", "What should I know?", "What
// next?") from Wayfind's OWN VERIFIED DATA even when live paid Google Place
// Details / Atmosphere lookups are budget-gated (503), slow, or disabled
// (Zero-Paid-Lookup Mode).
//
// Core laws:
//   1. Organic integrity: Actionability Coverage and partner offers NEVER
//      import or alter `wayfindScore` or organic search ranking.
//   2. Free vs. Paid honesty: distinguishes FREE, PAID, DONATION,
//      PARKING_FEE_ONLY, SEASONAL_FEE, EVENT_DEPENDENT, and UNKNOWN.
//      Eliminates false paid-admission claims on municipal splash pads and
//      city parks tagged by Google with `water_park`.
//   3. Provenance & conflict resolution: every truth field carries `value`,
//      `source`, `verified_at`, `confidence`, `freshness`, `manual_override`,
//      and `source_url`.
//   4. Safari <16.4 bundle safety: zero regex lookbehinds (`(?<=` or `(?<!`).

import { businessStatus } from "./businessStatus.js";
import { tzForPoint, utcOffsetMinutesForTz } from "./nowContext.js";
import { parseEditorialHours, usHolidaysForYear } from "./editorialHoursParser.js";
import { siteTodayStr } from "./siteTime.js";
import { isBeachPlace, placePartnerPick } from "./placePartnerPicks.js";
import { hasStoredPlacePhoto } from "./placePhoto.js";
import * as Tags from "./tags.js";

export const ADMISSION_STATUS = Object.freeze({
  FREE: "FREE",
  PAID: "PAID",
  DONATION: "DONATION",
  PARKING_FEE_ONLY: "PARKING_FEE_ONLY",
  SEASONAL_FEE: "SEASONAL_FEE",
  EVENT_DEPENDENT: "EVENT_DEPENDENT",
  UNKNOWN: "UNKNOWN",
});

export const TRUTH_CONFIDENCE = Object.freeze({
  EXACT: "EXACT",
  HIGH_CONFIDENCE: "HIGH_CONFIDENCE",
  PROSE_ONLY: "PROSE_ONLY",
  AMBIGUOUS: "AMBIGUOUS",
  UNKNOWN: "UNKNOWN",
});

const MUNICIPAL_SPLASH_OR_PUBLIC_PARK_NAME_RX = /\b(splash\s*(?:pad|park|ground|zone|play)|spray\s*(?:ground|park|pad)|riverwalk|city\s+park|county\s+park|community\s+park|linear\s+park|neighborhood\s+park|veterans\s+park|memorial\s+park|regional\s+park|dog\s+park|skate\s+park|playground|bayfront\s+park|lake\s+eola\s+park|curtis\s+hixon|celery\s+fields|robinson\s+preserve|emerson\s+point|fort\s+de\s+soto\s+park|shell\s+key\s+preserve|ted\s+sperling\s+(?:nature\s+)?park|ballast\s+point\s+park|philippe\s+park|vinoy\s+park|straub\s+park|largo\s+central\s+park|sims\s+park|crane\s+park|payne\s+park|gt\s+bray|g\.t\.\s+bray|urfer\s+family\s+park|benderson\s+park|nathan\s+benderson)\b/i;

const COMMERCIAL_WATER_OR_THEME_PARK_NAME_RX = /\b(adventure\s+island|typhoon\s+lagoon|blizzard\s+beach|volcano\s+bay|aquatica|legoland|busch\s+gardens|seaworld|magic\s+kingdom|epcot|hollywood\s+studios|animal\s+kingdom|universal\s+studios|islands\s+of\s+adventure|epic\s+universe|discovery\s+cove|island\s+h2o|rapids\s+water\s+park|shipwreck\s+island|sun\s+splash\s+family\s+waterpark|buccaneer\s+bay|sunsplash)\b/i;

function normalizeTypes(detail) {
  if (!detail || typeof detail !== "object") return [];
  return [
    ...(Array.isArray(detail.types) ? detail.types : []),
    ...(Array.isArray(detail.google_types) ? detail.google_types : []),
    detail.primaryType,
    detail.primary_type,
    detail.type,
    detail.category,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase().trim());
}

function collectEditorialStrings(editorial) {
  if (!editorial || typeof editorial !== "object") return [];
  return [
    editorial.why,
    editorial.whyGo,
    editorial.currentUsefulDetail,
    editorial.goodToKnow,
    editorial.watchOut,
    editorial.insiderMove,
    editorial.proMove,
    editorial.hoursText,
    editorial.hours,
    editorial.proof,
    ...(Array.isArray(editorial.facts)
      ? editorial.facts.map((f) => (typeof f === "string" ? f : (f && (f.value || f.claim))))
      : []),
  ]
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim());
}

/**
 * True when a venue is a free municipal splash pad, sprayground, riverwalk, or
 * public city/county park — even if Google tagged it with `water_park`.
 */
export function isMunicipalSplashOrPublicPark(detail, editorial = null) {
  if (!detail || typeof detail !== "object") return false;
  const name = String(detail.name || detail.title || detail.observed_name || "").trim();
  if (COMMERCIAL_WATER_OR_THEME_PARK_NAME_RX.test(name)) return false;

  const types = normalizeTypes(detail);
  const hasThemeOrAmusement = types.includes("theme_park") || types.includes("amusement_park");
  const isCommercialOperator = types.includes("tour_agency") || types.includes("boat_tour_agency") || types.includes("sightseeing_tour_agency") || types.includes("travel_agency") || /\b(?:kayak(?:ing)?|adventures?|tours?|charters?|rentals?)\b/i.test(name);
  const hasWaterPark = types.includes("water_park");
  const hasPark = types.includes("park") || types.includes("city_park") || types.includes("playground") || types.includes("dog_park") || types.includes("skate_park");

  if (MUNICIPAL_SPLASH_OR_PUBLIC_PARK_NAME_RX.test(name) && !hasThemeOrAmusement && !isCommercialOperator) {
    return true;
  }

  // Google frequently tags municipal splash pads in public parks with both "park" and "water_park"
  if (hasWaterPark && hasPark && !hasThemeOrAmusement) {
    const texts = collectEditorialStrings(editorial).join(" ");
    if (!/\b(admission\s+\$\d|tickets?\s+\$\d|day\s+pass\s+\$\d)\b/i.test(texts)) {
      return true;
    }
  }

  return false;
}

/**
 * Classify a place's true admission model:
 *   FREE | PAID | DONATION | PARKING_FEE_ONLY | SEASONAL_FEE | EVENT_DEPENDENT | UNKNOWN
 */
export function resolveAdmissionTruth(detail, editorial = null, firstPartyActions = null) {
  if (!detail || typeof detail !== "object") {
    return {
      status: ADMISSION_STATUS.UNKNOWN,
      label: null,
      priceText: null,
      isFree: false,
      requiresTicket: false,
      confidence: TRUTH_CONFIDENCE.UNKNOWN,
      source: "none",
      reason: "no-place",
    };
  }

  const texts = collectEditorialStrings(editorial);
  const joined = texts.join(" · ");

  // 1. Beaches are free public access (unless parking-fee-only is explicitly noted)
  if (isBeachPlace(detail)) {
    const parkingFeeClause = texts.find((t) => /\$\d+\s*(?:per\s+vehicle|parking|hourly\s+parking)/i.test(t));
    if (parkingFeeClause) {
      return {
        status: ADMISSION_STATUS.PARKING_FEE_ONLY,
        label: "Free beach access · paid parking",
        priceText: parkingFeeClause,
        isFree: true,
        requiresTicket: false,
        confidence: TRUTH_CONFIDENCE.EXACT,
        source: "wayfind_editorial",
        reason: "free-beach-with-parking-fee",
      };
    }
    return {
      status: ADMISSION_STATUS.FREE,
      label: "Free admission",
      priceText: "Free admission",
      isFree: true,
      requiresTicket: false,
      confidence: TRUTH_CONFIDENCE.EXACT,
      source: "wayfind_beach_policy",
      reason: "public-beach",
    };
  }

  // 2. Vehicle / parking-fee-only parks (e.g. "$5 per vehicle", "Free admission; $5 parking")
  for (const t of texts) {
    if (/\$\d+(?:\.\d{2})?\s+per\s+(?:vehicle|car)\b/i.test(t) && !/\b(adults?\s+\$\d+|general\s+admission\s+\$\d+)\b/i.test(t)) {
      const m = /([^.;]*\$\d+(?:\.\d{2})?\s+per\s+(?:vehicle|car)[^.;]*)/i.exec(t);
      const clause = m ? m[1].trim() : t;
      return {
        status: ADMISSION_STATUS.PARKING_FEE_ONLY,
        label: clause,
        priceText: clause,
        isFree: false,
        requiresTicket: false,
        confidence: TRUTH_CONFIDENCE.EXACT,
        source: "wayfind_editorial",
        reason: "vehicle-entry-fee-only",
      };
    }
    if (/\bfree\s+(?:admission|entry)\b/i.test(t) && /\b(?:paid\s+parking|\$\d+\s+parking)\b/i.test(t)) {
      return {
        status: ADMISSION_STATUS.PARKING_FEE_ONLY,
        label: t,
        priceText: t,
        isFree: true,
        requiresTicket: false,
        confidence: TRUTH_CONFIDENCE.EXACT,
        source: "wayfind_editorial",
        reason: "free-entry-paid-parking",
      };
    }
  }

  // 3. Donation-based entry
  if (/\b(?:suggested\s+donation|admission\s+by\s+donation|free\s*\(\s*donations?\s+welcome)\b/i.test(joined)) {
    return {
      status: ADMISSION_STATUS.DONATION,
      label: "Admission by donation",
      priceText: "Suggested donation",
      isFree: true,
      requiresTicket: false,
      confidence: TRUTH_CONFIDENCE.EXACT,
      source: "wayfind_editorial",
      reason: "donation-based",
    };
  }

  // 4. Explicit paid admission price in editorial facts
  for (const t of texts) {
    for (const clause of t.split(/\s*;\s*/)) {
      if (/\$\d+/.test(clause) && /\b(admission|tickets?|adults?|children|child|kids?|per\s+(?:person|rider|guest)|entry|tours?|pass(?:es)?)\b/i.test(clause)) {
        return {
          status: ADMISSION_STATUS.PAID,
          label: clause.trim(),
          priceText: clause.trim(),
          isFree: false,
          requiresTicket: true,
          confidence: TRUTH_CONFIDENCE.EXACT,
          source: "wayfind_editorial",
          reason: "explicit-admission-price",
        };
      }
    }
  }

  // 5. Municipal splash pads / public city parks
  if (isMunicipalSplashOrPublicPark(detail, editorial)) {
    return {
      status: ADMISSION_STATUS.FREE,
      label: "Free admission",
      priceText: "Free admission",
      isFree: true,
      requiresTicket: false,
      confidence: TRUTH_CONFIDENCE.HIGH_CONFIDENCE,
      source: "wayfind_public_park_classifier",
      reason: "municipal-splash-or-public-park",
    };
  }

  // 6. Explicit unconditional free admission in editorial or detail signals
  if (detail.priceNum === 0 || detail.price === "Free" || detail.price_level === 0 || detail.priceLevel === "FREE") {
    if (!Tags.requiresParkAdmission(detail.types)) {
      return {
        status: ADMISSION_STATUS.FREE,
        label: "Free admission",
        priceText: "Free admission",
        isFree: true,
        requiresTicket: false,
        confidence: TRUTH_CONFIDENCE.EXACT,
        source: "place_price_signal",
        reason: "price-level-free",
      };
    }
  }

  for (const t of texts) {
    const sentences = String(t).split(/[.!?;]+\s+/).filter(Boolean);
    for (const s of sentences) {
      if (/\$\d/.test(s)) continue;
      if (!/\b(free\s+admission|free\s+entry|free\s+to\s+(?:enter|visit|walk)|no\s+(?:admission|entry)\s+fee|admission\s+is\s+free|free\s*\(\s*no\s+fishing\s+license|^free$)\b/i.test(s.trim())) {
        continue;
      }
      if (/\b(not\s+free|requires?\s+(?:paid\s+)?admission|admission\s+required|when|if|except|unless|only|under\s+\d|ages?\s+\d|after\s+\d|first\s+(?:mon|tue|wed|thu|fri|sat|sun)|kids|children|members?|residents?|seniors?|military|students?)\b/i.test(s)) {
        continue;
      }
      return {
        status: ADMISSION_STATUS.FREE,
        label: "Free admission",
        priceText: "Free admission",
        isFree: true,
        requiresTicket: false,
        confidence: TRUTH_CONFIDENCE.EXACT,
        source: "wayfind_editorial",
        reason: "editorial-free-statement",
      };
    }
  }

  // 7. Event-dependent venue (stadiums, arenas, performing arts halls without daily admission)
  const types = normalizeTypes(detail);
  if (types.some((t) => /^(stadium|arena|performing_arts_theater|concert_hall|opera_house|comedy_club|event_venue)$/.test(t))) {
    return {
      status: ADMISSION_STATUS.EVENT_DEPENDENT,
      label: "Ticketed by event or performance",
      priceText: null,
      isFree: false,
      requiresTicket: true,
      confidence: TRUTH_CONFIDENCE.HIGH_CONFIDENCE,
      source: "venue_type_classifier",
      reason: "event-dependent-venue",
    };
  }

  // 8. Verified first-party ticket URL or exact partner admission ticket (never optional tours/transfers/storage)
  const partnerPick = placePartnerPick(detail);
  const hasVerifiedTicket = Boolean(
    (firstPartyActions && (firstPartyActions.ticket_url || firstPartyActions.admission_url)) ||
    (partnerPick && partnerPick.product !== "tour" && partnerPick.product !== "storage" && partnerPick.product !== "transfer")
  );
  if (hasVerifiedTicket || COMMERCIAL_WATER_OR_THEME_PARK_NAME_RX.test(String(detail.name || ""))) {
    return {
      status: ADMISSION_STATUS.PAID,
      label: "Paid admission",
      priceText: null,
      isFree: false,
      requiresTicket: true,
      confidence: TRUTH_CONFIDENCE.HIGH_CONFIDENCE,
      source: hasVerifiedTicket ? "verified_action_ledger" : "commercial_park_identity",
      reason: "verified-ticketed-venue",
    };
  }

  return {
    status: ADMISSION_STATUS.UNKNOWN,
    label: null,
    priceText: null,
    isFree: false,
    requiresTicket: false,
    confidence: TRUTH_CONFIDENCE.UNKNOWN,
    source: "none",
    reason: "no-admission-evidence",
  };
}

/**
 * Resolve structured owned hours with provenance (`google_live` > `owned_override` > `editorial_parsed`)
 * and holiday-uncertainty protection.
 */
export function resolveOwnedHours({ detail = null, detailExtra = null, editorial = null, nowMs = Date.now() } = {}) {
  const ts = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  const effectiveNowMs = Number.isFinite(ts) ? ts : Date.now();
  const tz = detail && Number.isFinite(Number(detail.lat)) && Number.isFinite(Number(detail.lng))
    ? tzForPoint(detail.lat, detail.lng)
    : "America/New_York";
  const utcOffset = detail && detail.utcOffset != null
    ? detail.utcOffset
    : utcOffsetMinutesForTz(tz, effectiveNowMs);

  const parsedEd = parseEditorialHours(editorial);
  const specialHours = [
    ...(detail && Array.isArray(detail.specialHours) ? detail.specialHours : []),
    ...(parsedEd && Array.isArray(parsedEd.specialHours) ? parsedEd.specialHours : []),
  ];

  let oh = null;
  let source = "none";
  let confidence = TRUTH_CONFIDENCE.UNKNOWN;
  let parserVersion = null;
  let sourceFact = null;

  if (detail && detail.oh && Array.isArray(detail.oh.periods) && detail.oh.periods.length > 0) {
    oh = detail.oh;
    source = detail.oh.source || "place_cached_hours";
    confidence = detail.oh.confidence || TRUTH_CONFIDENCE.EXACT;
    parserVersion = detail.oh.parserVersion || null;
  } else if (detailExtra && detailExtra.ok !== false && detailExtra.oh && Array.isArray(detailExtra.oh.periods) && detailExtra.oh.periods.length > 0) {
    oh = {
      ...detailExtra.oh,
      ...(Array.isArray(detailExtra.hours) && detailExtra.hours.length > 0 ? { weekdayDescriptions: detailExtra.hours } : {}),
    };
    source = "google_live_details";
    confidence = TRUTH_CONFIDENCE.EXACT;
  } else if (parsedEd && parsedEd.ok && Array.isArray(parsedEd.periods) && parsedEd.periods.length > 0) {
    oh = {
      periods: parsedEd.periods,
      weekdayDescriptions: parsedEd.weekdayDescriptions || [],
      source: "wayfind_editorial_hours",
      confidence: parsedEd.confidence,
      parserVersion: parsedEd.parserVersion,
      sourceFact: parsedEd.sourceFact,
    };
    source = "wayfind_editorial_hours";
    confidence = parsedEd.confidence;
    parserVersion = parsedEd.parserVersion;
    sourceFact = parsedEd.sourceFact;
  }

  // Check if today in venue-local time is a major US holiday
  const localDate = new Date(effectiveNowMs + utcOffset * 60000);
  const localIso = `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, "0")}-${String(localDate.getUTCDate()).padStart(2, "0")}`;
  const holidays = usHolidaysForYear(localDate.getUTCFullYear());
  const todayHoliday = Object.values(holidays).find((h) => h.date === localIso) || null;
  const explicitSpecialToday = specialHours.find((s) => s && s.date === localIso) || null;

  let holidayWarning = null;
  if (todayHoliday) {
    if (explicitSpecialToday && explicitSpecialToday.closed) {
      holidayWarning = `Closed today for ${todayHoliday.name}`;
    } else if (!explicitSpecialToday) {
      holidayWarning = `${todayHoliday.name} may affect regular hours`;
    }
  }

  const candidatePlace = detail
    ? {
        ...detail,
        ...(oh ? { oh } : {}),
        ...(specialHours.length > 0 ? { specialHours } : {}),
        utcOffset,
        hoursAsOf: detail.hoursAsOf != null ? detail.hoursAsOf : effectiveNowMs,
      }
    : null;

  const business = candidatePlace ? businessStatus(candidatePlace, effectiveNowMs) : null;

  return {
    ok: Boolean(oh && Array.isArray(oh.periods) && oh.periods.length > 0),
    oh,
    specialHours,
    utcOffset,
    timezone: tz,
    source,
    confidence: oh ? confidence : (parsedEd && parsedEd.sourceFact ? TRUTH_CONFIDENCE.PROSE_ONLY : TRUTH_CONFIDENCE.UNKNOWN),
    parserVersion,
    sourceFact: sourceFact || (parsedEd ? parsedEd.sourceFact : null),
    business,
    openState: business ? business.open : null,
    holidayWarning,
  };
}

/**
 * Compute Actionability Coverage (`0..1`) across the 10 operational decision
 * dimensions for a place. Strictly separate from `wayfindScore`.
 */
export function computeActionabilityCoverage({
  detail = null,
  detailExtra = null,
  editorial = null,
  firstPartyActions = null,
  gamePlan = null,
  primaryCta = null,
  nowMs = Date.now(),
} = {}) {
  const hoursTruth = resolveOwnedHours({ detail, detailExtra, editorial, nowMs });
  const admissionTruth = resolveAdmissionTruth(detail, editorial, firstPartyActions);
  const rows = (gamePlan && Array.isArray(gamePlan.rows)) ? gamePlan.rows : [];
  const hasRow = (key) => rows.some((r) => r && r.key === key && r.text);

  const canGoNow = Boolean(hoursTruth.openState === true || hoursTruth.openState === false || (gamePlan && gamePlan.verdict && gamePlan.verdict.text));
  const whenToGo = Boolean(hasRow("when") || hoursTruth.ok || (editorial && (editorial.bestTime || editorial.hoursText)));
  const cost = Boolean(hasRow("cost") || admissionTruth.status !== ADMISSION_STATUS.UNKNOWN || (detail && (detail.priceNum != null || detail.price_level != null)));
  const needsTickets = Boolean(admissionTruth.status !== ADMISSION_STATUS.UNKNOWN);
  const whereToGetTickets = admissionTruth.requiresTicket
    ? Boolean(
        (primaryCta && ["tickets", "official_tickets", "admission"].includes(primaryCta.type) && primaryCta.href) ||
        (firstPartyActions && (firstPartyActions.ticket_url || firstPartyActions.admission_url || firstPartyActions.officialWebsite))
      )
    : true; // Not applicable / already satisfied when free or walk-in
  const duration = Boolean(hasRow("duration") || (editorial && editorial.duration));
  const parking = Boolean(hasRow("parking") || (detail && Number.isFinite(Number(detail.lat)) && Number.isFinite(Number(detail.lng))));
  const whatToKnow = Boolean(hasRow("insider_move") || (editorial && (editorial.why || editorial.insiderMove || editorial.goodToKnow)));
  const whatNext = Boolean(hasRow("what_next") || (gamePlan && (gamePlan.indoorBackup || gamePlan.activeEvent)));
  const canPlanShare = Boolean(detail && detail.id && detail.name);

  const dimensions = {
    canGoNow,
    whenToGo,
    cost,
    needsTickets,
    whereToGetTickets,
    duration,
    parking,
    whatToKnow,
    whatNext,
    canPlanShare,
  };

  const keys = Object.keys(dimensions);
  const answeredCount = keys.filter((k) => dimensions[k]).length;
  const missingDimensions = keys.filter((k) => !dimensions[k]);

  return {
    score: Number((answeredCount / keys.length).toFixed(2)),
    answeredCount,
    totalDimensions: keys.length,
    dimensions,
    missingDimensions,
  };
}

/**
 * Build the internal diagnostic truth trace explaining for any place:
 *   1. Why Wayfind thinks it is open/closed
 *   2. Why a specific primary CTA was chosen
 *   3. Where the official website / ticket / menu / reservation URL came from
 *   4. Why it is classified free/paid
 *   5. Why a photo is showing (or placeholder tile)
 *   6. Why a partner offer was accepted or rejected
 */
export function buildPlaceTruthTrace({
  detail = null,
  detailExtra = null,
  editorial = null,
  firstPartyActions = null,
  primaryCta = null,
  gamePlan = null,
  nowMs = Date.now(),
} = {}) {
  const hours = resolveOwnedHours({ detail, detailExtra, editorial, nowMs });
  const admission = resolveAdmissionTruth(detail, editorial, firstPartyActions);
  const partnerPick = detail ? placePartnerPick(detail) : null;
  const actionability = computeActionabilityCoverage({
    detail,
    detailExtra,
    editorial,
    firstPartyActions,
    gamePlan,
    primaryCta,
    nowMs,
  });

  const todayIso = siteTodayStr(new Date(nowMs));
  const makeFieldMeta = (val, src, conf = TRUTH_CONFIDENCE.EXACT, url = null, manual = false) => ({
    value: val ?? null,
    source: src || "none",
    verified_at: todayIso,
    confidence: val != null ? conf : TRUTH_CONFIDENCE.UNKNOWN,
    freshness: val != null ? "fresh" : "missing",
    manual_override: Boolean(manual),
    source_url: url || null,
  });

  const fpaSite = firstPartyActions && firstPartyActions.officialWebsite;
  const fpaTicket = firstPartyActions && firstPartyActions.ticket_url;
  const fpaAdmission = firstPartyActions && firstPartyActions.admission_url;
  const fpaMenu = firstPartyActions && firstPartyActions.menu_url;
  const fpaReserve = firstPartyActions && firstPartyActions.reservation_url;

  return {
    place_id: detail ? (detail.id || detail.place_id || null) : null,
    name: detail ? (detail.name || null) : null,
    generated_at: new Date(nowMs).toISOString(),
    zero_paid_ready: Boolean(hours.ok || admission.status !== ADMISSION_STATUS.UNKNOWN || firstPartyActions),
    explanations: {
      open_closed_why: hours.ok
        ? `Status=${hours.openState === true ? "OPEN" : hours.openState === false ? "CLOSED" : "UNKNOWN"} from ${hours.source} (${hours.confidence}${hours.parserVersion ? `, ${hours.parserVersion}` : ""})${hours.holidayWarning ? ` [${hours.holidayWarning}]` : ""}`
        : `Status=UNKNOWN (no structured periods; prose=${hours.sourceFact ? "present" : "none"})`,
      primary_cta_why: primaryCta
        ? `CTA=${primaryCta.type} ("${primaryCta.label}") via ${primaryCta.actionSource || (primaryCta.monetized ? "partner" : "organic")} -> ${primaryCta.href || "in-app"}`
        : "CTA unresolved",
      official_links_why: {
        officialWebsite: fpaSite ? `${fpaSite.source} (${fpaSite.confidence})` : (editorial && editorial.officialWebsite ? "editorial.officialWebsite" : "none"),
        ticket_url: fpaTicket ? `${fpaTicket.source} (${fpaTicket.confidence})` : "none",
        admission_url: fpaAdmission ? `${fpaAdmission.source} (${fpaAdmission.confidence})` : "none",
        menu_url: fpaMenu ? `${fpaMenu.source} (${fpaMenu.confidence})` : "none",
        reservation_url: fpaReserve ? `${fpaReserve.source} (${fpaReserve.confidence})` : "none",
      },
      free_paid_why: `Admission=${admission.status} (${admission.reason}) via ${admission.source}`,
      photo_why: detail && hasStoredPlacePhoto(detail)
        ? "Owned or validated same-place stored photo present"
        : (detail && (detail.photo || detail.image) ? `Surface photo (${detail.photo || detail.image})` : "Designed fallback tile (no unverified hotlink/404)"),
      partner_offer_why: partnerPick
        ? (admission.isFree && partnerPick.product !== "tour"
            ? `Partner offer ${partnerPick.offerId} REJECTED because place is free`
            : `Exact verified partner offer ${partnerPick.offerId} (${partnerPick.merchant}) matched`)
        : "No exact partner pin; organic/official action ladder used",
    },
    fields: {
      official_website: makeFieldMeta(
        (fpaSite && fpaSite.url) || (editorial && editorial.officialWebsite) || null,
        (fpaSite && fpaSite.source) || (editorial && editorial.officialWebsite ? "wayfind_editorial" : "none"),
        (fpaSite && fpaSite.confidence) || TRUTH_CONFIDENCE.HIGH_CONFIDENCE,
        (fpaSite && fpaSite.url) || (editorial && editorial.officialWebsite) || null,
        fpaSite && fpaSite.verification_status === "manual_verified"
      ),
      ticket_url: makeFieldMeta(
        fpaTicket && fpaTicket.url,
        fpaTicket && fpaTicket.source,
        fpaTicket && fpaTicket.confidence,
        fpaTicket && fpaTicket.url,
        fpaTicket && fpaTicket.verification_status === "manual_verified"
      ),
      admission_url: makeFieldMeta(
        fpaAdmission && fpaAdmission.url,
        fpaAdmission && fpaAdmission.source,
        fpaAdmission && fpaAdmission.confidence,
        fpaAdmission && fpaAdmission.url,
        fpaAdmission && fpaAdmission.verification_status === "manual_verified"
      ),
      menu_url: makeFieldMeta(
        fpaMenu && fpaMenu.url,
        fpaMenu && fpaMenu.source,
        fpaMenu && fpaMenu.confidence,
        fpaMenu && fpaMenu.url,
        fpaMenu && fpaMenu.verification_status === "manual_verified"
      ),
      reservation_url: makeFieldMeta(
        fpaReserve && fpaReserve.url,
        fpaReserve && fpaReserve.source,
        fpaReserve && fpaReserve.confidence,
        fpaReserve && fpaReserve.url,
        fpaReserve && fpaReserve.verification_status === "manual_verified"
      ),
      regular_hours: makeFieldMeta(
        hours.oh ? hours.oh.weekdayDescriptions : null,
        hours.source,
        hours.confidence,
        null,
        false
      ),
      structured_periods: makeFieldMeta(
        hours.oh ? hours.oh.periods : null,
        hours.source,
        hours.confidence,
        null,
        false
      ),
      admission_status: makeFieldMeta(
        admission.status,
        admission.source,
        admission.confidence,
        null,
        false
      ),
      admission_price: makeFieldMeta(
        admission.priceText,
        admission.source,
        admission.confidence,
        null,
        false
      ),
    },
    actionability,
  };
}
