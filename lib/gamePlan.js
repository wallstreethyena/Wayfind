// lib/gamePlan.js — Pure, deterministic synthesis engine for "Your Game Plan"
// on Wayfind place detail.
//
// Core laws:
//   1. Truth-gated: NEVER fabricate live conditions, hours, prices, durations,
//      parking claims, or booking buttons. Missing rows disappear cleanly.
//   2. One Clock (lib/siteTime.js + lib/nowContext.js): all date/daypart cutoffs
//      use venue-local time, never UTC or viewer wall clock.
//   3. One Price Source (lib/price.js + lib/dining.js): qualitative price tiers
//      flow through canonical helpers, never custom dollar-glyph maps.
//   4. Organic integrity: affiliate commission NEVER alters row selection,
//      nearby pairing order, or indoor backup ranking.
//   5. Safari <16.4 bundle safety: zero regex lookbehinds ((?<= or (?<!).

import { siteTodayStr } from "./siteTime.js";
import { tzForPoint, siteHourFloat, utcOffsetMinutesForTz } from "./nowContext.js";
export { utcOffsetMinutesForTz };
import { businessStatus, isOpenNow } from "./businessStatus.js";
import { isAfterDark, isDaylightOnlyPlace } from "./daylight.js";
import * as Ranking from "./ranking.js";
import * as Dining from "./dining.js";
import { priceLabel, priceLevelOf } from "./price.js";
import * as Tags from "./tags.js";
import * as Aff from "./affiliates.js";
import { isBeachPlace } from "./placePartnerPicks.js";
import { pairsWellWith } from "./pairsWellWith.js";
import { detailDistanceMi } from "./detailNearby.js";
import { safeUrl } from "./links.js";
import { hasParkingCoordinate } from "./appleParking.js";
import { isExcluded, isGroceryMarket } from "./placeCategory.js";
import { parseEditorialHours } from "./editorialHoursParser.js";
import { isMunicipalSplashOrPublicPark } from "./ownedPlaceTruth.js";

export const GAME_PLAN_CONFIDENCE = Object.freeze({
  CONFIRMED: "CONFIRMED",
  LIKELY: "LIKELY",
  UNKNOWN: "UNKNOWN",
});

const DISPLAYABLE_EVENT_STATUS = new Set(["scheduled", "sold_out"]);

const TICKETED_PLACE_TYPES = new Set([
  "museum",
  "art_museum",
  "history_museum",
  "science_museum",
  "childrens_museum",
  "zoo",
  "aquarium",
  "botanical_garden",
  "amusement_park",
  "theme_park",
  "water_park",
  "performing_arts_theater",
  "concert_hall",
  "opera_house",
  "philharmonic_hall",
  "comedy_club",
  "tour_agency",
  "boat_tour_agency",
  "sightseeing_tour_agency",
  "indoor_playground",
  "ferris_wheel",
  "planetarium",
  "observation_deck",
  "visitor_center",
  "adventure_sports_center",
]);

const FREE_PUBLIC_TYPES = new Set([
  "farmers_market",
  "dog_park",
  "skate_park",
  "playground",
  "plaza",
  "neighborhood",
]);

const META_REFUSAL_RX = /\b(facts?\s+provided|reviews?\s+provided|rather\s+than\s+a\s+food|not\s+a\s+food\s+venue|do(?:es)?\s+not\s+describe|no\s+information\s+provided|refresh\s+before\s+display|as\s+an\s+ai)\b/i;
const FALSE_PARK_NOUN_RX = /\b(state|national|county|city|memorial|theme|amusement|water|dog|skate|rv|trailer|industrial|office|business|central|winter|icon|hyde|lake\s+eola|myakka|wekiwa|kelly|sperling)\s+park\b/gi;
const PARKING_SIGNAL_RX = /\b(parking|garage|valet|trailhead\s+lot|surface\s+lot|free\s+lot|paid\s+lot|(?:main\s+)?lot\s+(?:fills|hits\s+capacity|closes|opens|at\s+\d)|street\s+meters?|metered\s+(?:spaces?|spots?|street)|free\s+trolley|park\s+(?:free|in|at|along|behind|under|for\s+free)\b)/i;
const COMPOUND_TIP_SPLIT_RX = /,\s+(?:and\s+)?(?=(?:catch|bring|arrive|start|head|grab|buy|ask|book|check|don't|skip|walk|take|consider|save|pair)\b)/i;

const UTILITY_ERRAND_TYPE_RX = /^(grocery_store|supermarket|grocery_or_supermarket|food_store|health_food_store|convenience_store|warehouse_store|discount_store|department_store|drugstore|pharmacy|gas_station|hardware_store|home_goods_store|home_improvement_store|auto_parts_store|liquor_store)$/;
const UTILITY_ERRAND_NAME_RX = /\b(publix|walmart|target|winn[- ]?dixie|aldi|kroger|whole\s+foods|trader\s+joe'?s|costco|sam'?s\s+club|bj'?s\s+wholesale|cvs|walgreens|7[- ]?eleven|circle\s+k|wawa|racetrac|speedway|dollar\s+(?:general|tree)|family\s+dollar|bodega|bodeguita|mini\s*mart|food\s*mart|meat\s*market)\b/i;

function isUtilityErrandPlace(p) {
  if (!p || typeof p !== "object") return true;
  if (isExcluded(p)) return true;
  const pt = String(p.primaryType || p.primary_type || "").toLowerCase().trim();
  const arr = (Array.isArray(p.types) ? p.types : []).map((t) => String(t || "").toLowerCase().trim());
  const isFarmersMkt = pt === "farmers_market" || arr.includes("farmers_market") || /\bfarmers'?s?\s+market\b/i.test(String(p.name || ""));
  if (!isFarmersMkt && isGroceryMarket(p)) return true;
  if (pt && UTILITY_ERRAND_TYPE_RX.test(pt) && !isFarmersMkt) return true;
  if (!isFarmersMkt && arr.some((t) => /^(supermarket|grocery_store|grocery_or_supermarket|food_store|convenience_store|gas_station|drugstore|pharmacy|warehouse_store)$/.test(t))) {
    return true;
  }
  if (UTILITY_ERRAND_NAME_RX.test(String(p.name || ""))) return true;
  return false;
}

function cleanText(v) {
  if (typeof v !== "string") return "";
  const trimmed = v
    .replace(/\s*\(Live menu below\.\)\s*/gi, " ")
    .replace(/\s*\(?verified\s+[^.;)]+\)?[.;]?\s*(?:refresh\s+before\s+display\.?)?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed || META_REFUSAL_RX.test(trimmed)) return "";
  return trimmed;
}

function normVenueName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2019'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|at|in|of|and|downtown|florida|fl)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  const raw = cleanText(text);
  if (!raw) return [];
  const DOT = "\u0000";
  const safe = raw
    .replace(/\b([ap])\.m\./gi, "$1" + DOT + "m" + DOT)
    .replace(/\bU\.S\./gi, "U" + DOT + "S" + DOT)
    .replace(/\b(St|Dr|Mr|Mrs|Ms|Jr|Sr|Ft|Mt|vs|No|Inc|Co|Rd|Ave|Blvd|ca|approx)\./gi, "$1" + DOT)
    .replace(/(\d)\.(\d)/g, "$1" + DOT + "$2");
  const out = [];
  let start = 0;
  for (let i = 0; i < safe.length; i++) {
    const ch = safe[i];
    if ((ch === "." || ch === "!" || ch === "?") && (i === safe.length - 1 || /\s/.test(safe[i + 1]))) {
      const seg = safe.slice(start, i + 1).split(DOT).join(".").trim();
      if (seg) out.push(seg);
      start = i + 1;
    }
  }
  if (start < safe.length) {
    const tail = safe.slice(start).split(DOT).join(".").trim();
    if (tail) out.push(tail);
  }
  return out;
}

function conciseLine(text, maxChars = 155) {
  const clean = cleanText(text);
  if (!clean) return null;
  if (clean.length <= maxChars) return clean;
  const sentences = splitSentences(clean);
  if (sentences.length > 0 && sentences[0].length <= maxChars && sentences[0].length >= 18) {
    if (sentences.length > 1 && (sentences[0].length + 1 + sentences[1].length) <= maxChars) {
      return sentences[0] + " " + sentences[1];
    }
    return sentences[0];
  }
  const clauses = clean.split(/\s*[;—–]\s*/);
  if (clauses[0] && clauses[0].length >= 20 && clauses[0].length <= maxChars) {
    return /[.!?]$/.test(clauses[0]) ? clauses[0] : clauses[0] + ".";
  }
  const cut = clean.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, "") + "…";
}

function textSignature(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 64);
}

function overlapsShown(candidate, usedSet) {
  if (!candidate) return true;
  const sig = textSignature(candidate);
  if (!sig) return true;
  for (const prev of usedSet) {
    if (!prev) continue;
    if (prev === sig || prev.includes(sig.slice(0, 36)) || sig.includes(prev.slice(0, 36))) return true;
  }
  return false;
}

function collectEditorialTexts(editorial) {
  if (!editorial || typeof editorial !== "object") return [];
  const list = [
    editorial.goodToKnow,
    editorial.watchOut,
    editorial.insiderMove,
    editorial.proMove,
    editorial.hoursText,
    editorial.proof,
    ...(Array.isArray(editorial.facts) ? editorial.facts : []),
  ];
  return list.map(cleanText).filter(Boolean);
}

/**
 * Return a non-mutating copy of `detail` hydrated with structured `oh` periods
 * from `detailExtra.oh` (when `detailExtra.ok !== false`) or Wayfind's owned
 * editorial hours (`parseEditorialHours(editorial)`), plus a venue-local
 * `utcOffset` and holiday `specialHours`. Never fabricates hours when periods are absent.
 */
function parseVerificationEpochMs(raw) {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}$/.test(s)) {
    const ms = Date.parse(`${s}-01T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

export function hydrateDetailHours(detail, detailExtra, nowMs = Date.now(), editorial = null) {
  if (!detail || typeof detail !== "object") return detail;
  const hasBasePeriods = !!(detail.oh && Array.isArray(detail.oh.periods) && detail.oh.periods.length > 0);
  const liveExtraOh = detailExtra && detailExtra.ok !== false && detailExtra.oh && Array.isArray(detailExtra.oh.periods) && detailExtra.oh.periods.length > 0
    ? detailExtra.oh
    : null;
  const editorialOh = !hasBasePeriods && !liveExtraOh && editorial && editorial.oh && Array.isArray(editorial.oh.periods) && editorial.oh.periods.length > 0
    ? {
        ...editorial.oh,
        source: editorial.oh.source || "wayfind_editorial_hours",
        _asOf: editorial.oh._asOf || editorial.asOf || null,
      }
    : null;
  const parsedEd = editorial
    ? parseEditorialHours(editorial, { venueName: detail.name || (editorial && editorial.name) || null })
    : null;
  const edOh = !hasBasePeriods && !liveExtraOh && !editorialOh && parsedEd && parsedEd.ok && Array.isArray(parsedEd.periods) && parsedEd.periods.length > 0
    ? {
        periods: parsedEd.periods,
        weekdayDescriptions: parsedEd.weekdayDescriptions || [],
        source: parsedEd.source || "wayfind_editorial_hours",
        confidence: parsedEd.confidence,
        parserVersion: parsedEd.parserVersion,
        sourceFact: parsedEd.sourceFact,
        verifiedAt: parsedEd.verifiedAt || null,
        freshness: parsedEd.freshness || "unverified_timestamp",
        exceptions: Array.isArray(parsedEd.exceptions) ? parsedEd.exceptions : [],
        _asOf: (editorial && editorial.asOf) || parsedEd.verifiedAt || null,
      }
    : null;
  const proseOh = !hasBasePeriods && !liveExtraOh && !editorialOh && !edOh
    ? (editorial && editorial.oh && Array.isArray(editorial.oh.weekdayDescriptions) && editorial.oh.weekdayDescriptions.length > 0
        ? {
            ...editorial.oh,
            source: editorial.oh.source || "wayfind_editorial_hours",
            _asOf: editorial.oh._asOf || editorial.asOf || null,
          }
        : (parsedEd && parsedEd.sourceFact
            ? {
                weekdayDescriptions: [parsedEd.sourceFact],
                source: "wayfind_editorial_hours",
                confidence: parsedEd.confidence,
                parserVersion: parsedEd.parserVersion,
                sourceFact: parsedEd.sourceFact,
                _asOf: editorial && editorial.asOf ? editorial.asOf : null,
                _parseable: false,
              }
            : null))
    : null;
  const specialHours = [
    ...(Array.isArray(detail.specialHours) ? detail.specialHours : []),
    ...(parsedEd && Array.isArray(parsedEd.specialHours) ? parsedEd.specialHours : []),
  ];
  if (!hasBasePeriods && !liveExtraOh && !editorialOh && !edOh && !proseOh && !specialHours.length) return detail;
  const oh = hasBasePeriods ? detail.oh : (liveExtraOh || editorialOh || edOh || proseOh || detail.oh || null);
  let utcOffset = detail.utcOffset;
  if (utcOffset == null && ((oh && Array.isArray(oh.periods) && oh.periods.length > 0) || specialHours.length > 0)) {
    const tz = Number.isFinite(Number(detail.lat)) && Number.isFinite(Number(detail.lng))
      ? tzForPoint(detail.lat, detail.lng)
      : "America/New_York";
    utcOffset = utcOffsetMinutesForTz(tz, nowMs);
  }
  const verifiedMs = parseVerificationEpochMs(
    detail.hoursAsOf ??
    detail._ownedHoursVerifiedAt ??
    (oh && (oh._asOf || oh.verifiedAt || oh.asOf)) ??
    (editorial && editorial.asOf)
  );
  const hoursAsOf = detail.hoursAsOf != null
    ? detail.hoursAsOf
    : liveExtraOh
      ? nowMs
      : verifiedMs;
  return {
    ...detail,
    ...(oh ? { oh } : {}),
    ...(specialHours.length > 0 ? { specialHours } : {}),
    ...(utcOffset != null ? { utcOffset } : {}),
    ...(hoursAsOf != null ? { hoursAsOf } : {}),
  };
}

/**
 * Strictly filter `wf_events` rows to trusted, non-stale events belonging to
 * `detail` (by exact `place_id` or normalized exact venue name in same city).
 */
export function filterEligibleVenueEvents(rows, detail, { now = new Date() } = {}) {
  if (!Array.isArray(rows) || !rows.length || !detail) return [];
  const today = siteTodayStr(now);
  const targetId = String(detail.id || detail.placeId || "").trim();
  const targetVenue = normVenueName(detail.name);

  return rows
    .filter((e) => {
      if (!e || typeof e !== "object") return false;
      if (!DISPLAYABLE_EVENT_STATUS.has(e.event_status)) return false;
      if (!e.source_tier || Number(e.source_tier) < 1 || Number(e.source_tier) > 4) return false;
      if (!e.verification_confidence || e.verification_confidence === "low") return false;
      if (!e.card_hook || !e.city) return false;
      const end = e.end_date || e.start_date;
      if (!end || String(end) < today) return false;
      if (targetId && e.place_id && String(e.place_id).trim() === targetId) return true;
      if (e.place_id && targetId && String(e.place_id).trim() !== targetId) return false;
      const evVenue = normVenueName(e.venue);
      return Boolean(targetVenue && evVenue && targetVenue.length >= 5 && evVenue === targetVenue);
    })
    .sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")));
}

/**
 * True only when Wayfind holds explicit venue-specific evidence that general
 * entry is free. A park or splash-park name alone NEVER establishes free
 * admission. Conditional free days ("Go Monday, when general admission is free",
 * "Free on first Sundays", "Kids under 5 free", "Members free") are NEVER
 * treated as unconditional free admission.
 */
export function isVerifiedFreePlace(detail, editorial) {
  if (!detail) return false;
  if (
    (editorial && editorial.admissionTruth && editorial.admissionTruth.status === "FREE") ||
    (detail && detail.admissionTruth && detail.admissionTruth.status === "FREE")
  ) {
    return true;
  }
  if (detail.priceNum === 0 || detail.price === "Free" || detail.price_level === 0 || detail.priceLevel === "FREE") {
    if (!Tags.requiresParkAdmission(detail.types)) return true;
  }
  const allTypes = [
    ...(Array.isArray(detail.types) ? detail.types : []),
    detail.primaryType,
    detail.type,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase().trim());
  const isTicketedType = allTypes.some((t) => TICKETED_PLACE_TYPES.has(t));

  const texts = collectEditorialTexts(editorial);
  if (texts.some((t) => /\b(adults?|general\s+admission|tickets?)\s+\$\d|\$\d+\s*(?:–|-|to)\s*\$\d+/i.test(t))) {
    return false;
  }
  for (const t of texts) {
    const sentences = String(t).split(/[.!?;]+\s+/).filter(Boolean);
    for (const s of sentences) {
      if (/\$\d/.test(s)) continue;
      if (!/\b(free\s+admission|free\s+entry|free\s+to\s+(?:enter|visit|walk)|no\s+(?:admission|entry)\s+fee|admission\s+is\s+free|free\s*\(\s*no\s+fishing\s+license|^free$)\b/i.test(s.trim())) {
        continue;
      }
      if (/\b(not\s+free|requires?\s+(?:paid\s+)?admission|admission\s+required)\b/i.test(s)) continue;
      if (/\b(when|if|except|unless|only)\b/i.test(s)) continue;
      if (/\b(?:under|ages?)\s+\d/i.test(s)) continue;
      if (/\bafter\s+\d/i.test(s)) continue;
      if (/\bfirst\s+(?:mon|tue|wed|thu|fri|sat|sun|week|weekend)/i.test(s)) continue;
      if (/\b(kids|children|members?|residents?|seniors?|military|students?|toddlers?|infants?|veterans?|holders?)\b/i.test(s)) continue;
      if (/\bon\s+(?:mon|tue|wed|thu|fri|sat|sun)\w*/i.test(s)) continue;
      if (isTicketedType && /\b(mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)\b/i.test(s)) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * True when a venue is an admission/ticketed experience where an official
 * first-party admission or ticket action is truthful and appropriate.
 */
export function isTicketedPlace(detail, editorial) {
  if (!detail || detail._event) return false;
  if (Aff.isNeverBookable(detail)) return false;
  if (isBeachPlace(detail)) return false;
  if (isMunicipalSplashOrPublicPark(detail, editorial)) return false;
  if (isVerifiedFreePlace(detail, editorial)) return false;

  const allTypes = [
    ...(Array.isArray(detail.types) ? detail.types : []),
    detail.primaryType,
    detail.type,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase().trim());

  if (allTypes.some((t) => FREE_PUBLIC_TYPES.has(t))) return false;
  if (Tags.requiresParkAdmission(detail.types)) return true;
  if (allTypes.some((t) => TICKETED_PLACE_TYPES.has(t))) return true;

  const texts = collectEditorialTexts(editorial);
  for (const t of texts) {
    if (/\b(tickets?\s+(?:start|cost|are|required|sold)|general\s+admission\s+\$\d|timed[- ]entry\s+tickets?|box\s+office)\b/i.test(t) &&
        !/\b(free\s+admission|free\s+entry|no\s+tickets?\s+needed)\b/i.test(t)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract a single verified parking/arrival tip without confusing Florida park
 * names ("Winter Park", "Blue Spring State Park", "ICON Park", "theme park")
 * with vehicle parking.
 */
export function extractParkingIntel(detail, editorial, curatedEvents = [], curatedNotes = null, insider = null) {
  if (editorial && editorial.beachExtras && typeof editorial.beachExtras.parking === "string" && editorial.beachExtras.parking.trim()) {
    return conciseLine(editorial.beachExtras.parking, 150);
  }
  const candidates = [];
  if (editorial && typeof editorial === "object") {
    candidates.push(editorial.watchOut, editorial.insiderMove, editorial.proMove, editorial.goodToKnow);
    if (Array.isArray(editorial.facts)) candidates.push(...editorial.facts);
  }
  if (insider && typeof insider === "object") {
    candidates.push(insider.tip, insider.parking);
  }
  if (Array.isArray(curatedNotes)) {
    for (const n of curatedNotes) {
      const txt = typeof n === "string" ? n : (n && n.text);
      if (txt) candidates.push(txt);
    }
  }
  if (Array.isArray(curatedEvents) && curatedEvents[0] && curatedEvents[0].parking_tip) {
    candidates.push(curatedEvents[0].parking_tip);
  }

  for (const block of candidates) {
    const cleanedBlock = cleanText(block);
    if (!cleanedBlock) continue;
    for (const sentence of splitSentences(cleanedBlock)) {
      const scrubbed = sentence.replace(FALSE_PARK_NOUN_RX, "venue");
      if (PARKING_SIGNAL_RX.test(scrubbed)) {
        if (sentence.length > 105 && COMPOUND_TIP_SPLIT_RX.test(sentence)) {
          const clauses = sentence.split(COMPOUND_TIP_SPLIT_RX);
          const parkingClause = clauses.find((c) => PARKING_SIGNAL_RX.test(c.replace(FALSE_PARK_NOUN_RX, "venue")));
          if (parkingClause && parkingClause.trim().length >= 20) {
            const trimmed = parkingClause.trim();
            return conciseLine(/[.!?]$/.test(trimmed) ? trimmed : trimmed + ".", 150);
          }
        }
        return conciseLine(sentence, 150);
      }
    }
  }

  const labels = Array.isArray(detail && detail.labels) ? detail.labels : [];
  const labelHit = labels.find((l) => typeof l === "string" && /\b(free|paid|valet|street|garage)\s+parking\b/i.test(l));
  if (labelHit) return labelHit;

  return null;
}

export function extractSupportedParking({ detail = null, editorial = null, insider = null, curatedEvents = [], curatedNotes = null } = {}) {
  const val = extractParkingIntel(detail, editorial, curatedEvents, curatedNotes, insider);
  if (!val) return null;
  return {
    value: val,
    sub: null,
    confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
  };
}

/**
 * Extract explicit, verified visit duration from Wayfind editorial or active
 * curated venue event. Never guesses from category.
 */
export function extractVerifiedDuration(editorial, curatedEvents = [], insider = null, wayfindNotesList = null) {
  const extra = [
    editorial && editorial.bestFor,
    editorial && editorial.why,
    insider && insider.tip,
    insider && insider.bestTime,
    ...(Array.isArray(wayfindNotesList)
      ? wayfindNotesList.map((n) => (typeof n === "string" ? n : n && n.text))
      : []),
  ].map(cleanText).filter(Boolean);
  const texts = [...collectEditorialTexts(editorial), ...extra];

  for (const block of texts) {
    for (const s of splitSentences(block)) {
      if (/\bwalk\s+\d+\s*(?:minutes?|mins?)\s+(?:north|south|east|west|from|past)\b/i.test(s)) continue;
      const m1 = /\b(?:plan(?:\s+for|\s+on|\s+about)?|allow(?:\s+about)?|budget(?:\s+about)?|takes(?:\s+about)?|spend(?:\s+about)?|set\s+aside)\s+(?:about\s+|around\s+|at\s+least\s+)?((?:\d+(?:\.\d+)?(?:\s*(?:hours?|hrs?|minutes?|mins?))?(?:\s*(?:–|-|to)\s*\d+(?:\.\d+)?)?\s*(?:hours?|hrs?|minutes?|mins?))|(?:a\s+)?half[- ]day|(?:a\s+)?full[- ]day|half\s+a\s+day|a\s+full\s+day)\b/i.exec(s);
      if (m1) {
        const span = m1[1].replace(/\bhrs?\b/gi, "hours").replace(/\bmins?\b/gi, "minutes").trim();
        return /^(?:a\s+)?(?:half|full)/i.test(span) ? `Plan ${span.toLowerCase()}` : `Plan about ${span}`;
      }
      const mQual = /\b(?:plan|allow|budget|expect|set\s+aside)\s+(several\s+hours|a\s+couple(?:\s+of)?\s+hours|a\s+few\s+hours)\b/i.exec(s);
      if (mQual) {
        return conciseLine(s, 130);
      }
      const m2 = /\b(\d+(?:\.\d+)?(?:\s*(?:–|-|to)\s*\d+(?:\.\d+)?)?)(?:-|\s+)(hour|minute)s?\s+(?:guided\s+|scenic\s+|narrated\s+|boat\s+|pontoon\s+|airboat\s+|kayak\s+|walking\s+|tram\s+)?(tour|cruise|ride|paddle|show|trail|loop|visit|walk)\b/i.exec(s);
      if (m2) {
        return `About ${m2[1]} ${m2[2].toLowerCase()}${Number(m2[1]) === 1 ? "" : "s"} (${m2[3].toLowerCase()})`;
      }
    }
  }

  if (Array.isArray(curatedEvents) && curatedEvents[0] && typeof curatedEvents[0].duration_recommendation === "string") {
    const d = cleanText(curatedEvents[0].duration_recommendation);
    if (d) return conciseLine(/^(plan|allow|about)/i.test(d) ? d : `Plan ${d}`, 95);
  }
  return null;
}

export function extractSupportedDuration({ editorial = null, insider = null, wayfindNotesList = null, curatedEvents = [] } = {}) {
  const val = extractVerifiedDuration(editorial, curatedEvents, insider, wayfindNotesList);
  if (!val) return null;
  return {
    value: val,
    sub: null,
    confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
  };
}

function formatShortDateRange(ev, todayIso) {
  if (!ev) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmt = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return "";
    const mo = months[Number(m[2]) - 1] || "";
    return `${mo} ${Number(m[3])}`;
  };
  const s = ev.start_date;
  const e = ev.end_date;
  if (s && e && s <= todayIso && e >= todayIso) return `Now–${fmt(e)}`;
  if (s && (!e || s === e)) return s === todayIso ? "Today" : fmt(s);
  if (s && e) return `${fmt(s)}–${fmt(e)}`;
  return "";
}

function extractBestTime({ detail, detailExtra, editorial, insider, curatedEvents = [], todayIso, usedSet = new Set(), formatEventDate, eventWhenLabel }) {
  if (detail && detail._event) {
    const ev = detail._event;
    const ef = typeof formatEventDate === "function" ? formatEventDate(ev.date, ev.time) : {};
    const rel = typeof eventWhenLabel === "function" ? eventWhenLabel(ev) : "";
    const whenText = rel
      ? rel + (ef && ef.time ? " · " + ef.time : "")
      : (ef && ef.wd ? `${ef.wd}, ${ef.mo} ${ef.day}${ef.time ? " · " + ef.time : ""}` : (ev.time || ev.date || ""));
    if (whenText) return conciseLine(whenText, 145);
  }

  if (editorial && typeof editorial.bestTime === "string" && editorial.bestTime.trim()) {
    const bt = conciseLine(editorial.bestTime.trim(), 145);
    if (bt && !overlapsShown(bt, usedSet)) return bt;
  }

  if (insider && typeof insider.bestTime === "string" && insider.bestTime.trim()) {
    const ibt = conciseLine(insider.bestTime.trim(), 145);
    if (ibt && !overlapsShown(ibt, usedSet)) return ibt;
  }

  if (editorial && typeof editorial.goodToKnow === "string" && editorial.goodToKnow.trim()) {
    const g = cleanText(editorial.goodToKnow);
    if (g && !/^open\s+and\s+operating\s+as\s+of\s+this\s+check\b/i.test(g) && !/\bred\s+tide\s+was\s+clear\b/i.test(g)) {
      const timeSentences = splitSentences(g).filter((s) =>
        !overlapsShown(s, usedSet) &&
        /\b(morning|afternoon|evening|night|sunset|sunrise|dawn|dusk|golden\s+hour|weekday|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|early|before\s+\d|after\s+\d|\d\s*(?:am|pm|a\.m\.|p\.m\.)|crowd|peak|season|winter|summer|spring|fall|daily|open|arrive|schedule|depart|tour|tide|low\s+tide|high\s+tide)\b/i.test(s)
      );
      if (timeSentences.length > 0) {
        const line = conciseLine(timeSentences[0], 145);
        if (line && !overlapsShown(line, usedSet)) return line;
      }
    }
  }

  for (const field of [editorial && editorial.proMove, editorial && editorial.insiderMove, editorial && editorial.watchOut, ...(Array.isArray(editorial && editorial.facts) ? editorial.facts : [])]) {
    const cleaned = cleanText(field);
    if (!cleaned) continue;
    for (const s of splitSentences(cleaned)) {
      if (/\b(best\s+time|arrive\s+(?:before|by|early)|come\s+early|get\s+there\s+by|before\s+(?:the\s+midday\s+heat|\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))|after\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|sunset|sunrise|tours?\s+(?:leave|depart|run)\s+every)\b/i.test(s)) {
        const line = conciseLine(s, 145);
        if (line && !overlapsShown(line, usedSet)) return line;
      }
    }
  }

  if (editorial && typeof editorial.hoursText === "string" && editorial.hoursText.trim()) {
    const hoursOnly = editorial.hoursText
      .split(/\s*;\s*/)
      .filter((clause) => !/\$\d+/.test(clause))
      .join("; ")
      .trim();
    const h = conciseLine(hoursOnly || editorial.hoursText, 130);
    if (h && !overlapsShown(h, usedSet)) return h;
  }

  if (Array.isArray(curatedEvents) && curatedEvents.length > 0) {
    const ev = curatedEvents[0];
    const span = formatShortDateRange(ev, todayIso);
    const title = ev.short_title || ev.event_name;
    if (title && span) {
      const note = ev.schedule_note ? ` (${conciseLine(ev.schedule_note, 55)})` : "";
      const line = `${title}: ${span}${note}`;
      if (!overlapsShown(line, usedSet)) return conciseLine(line, 145);
    }
  }

  return null;
}

export function extractSupportedWhen({ detail = null, editorial = null, insider = null, detailExtra = null, openState = null, curatedEvents = [], formatEventDate = null, eventWhenLabel = null } = {}) {
  const val = extractBestTime({
    detail,
    detailExtra,
    editorial,
    insider,
    curatedEvents,
    todayIso: siteTodayStr(new Date()),
    usedSet: new Set(),
    formatEventDate,
    eventWhenLabel,
  });
  if (!val) return null;
  return {
    value: val,
    sub: openState === true ? "Open now" : openState === false ? "Closed right now" : null,
    confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
  };
}

function extractAdmissionPriceFact(editorial, wayfindNotesList = null) {
  const noteTexts = Array.isArray(wayfindNotesList)
    ? wayfindNotesList.map((n) => (typeof n === "string" ? n : n && n.text)).map(cleanText).filter(Boolean)
    : [];
  const texts = [...collectEditorialTexts(editorial), ...noteTexts];
  for (const block of texts) {
    for (const s of splitSentences(block)) {
      for (const clause of s.split(/\s*;\s*/)) {
        if (/\$\d+/.test(clause) && /\b(admission|tickets?|adults?|children|child|kids?|vehicles?|per\s+(?:person|car|boat|rider|guest)|entry|tours?|pass(?:es)?|grounds)\b/i.test(clause)) {
          return conciseLine(clause, 135);
        }
      }
    }
  }
  return null;
}

function resolveCostRow({ detail, editorial, wayfindNotesList = null, primaryCta = null, websiteHref = null, viaTours = null, offers = null }) {
  if (!detail) return null;
  const beach = isBeachPlace(detail);
  const priceFact = extractAdmissionPriceFact(editorial, wayfindNotesList);

  // Beaches are free public access; never attach a paid ticket CTA.
  if (beach) {
    if (priceFact) return { text: priceFact, value: priceFact, action: null };
    if (isVerifiedFreePlace(detail, editorial)) return { text: "Free admission", value: "Free admission", action: null };
    return null;
  }

  const hasVerifiedOfficialCta = !!(primaryCta && !primaryCta.monetized && (primaryCta.type === "official_tickets" || primaryCta.type === "admission") && primaryCta.href);
  const officialActionHref = hasVerifiedOfficialCta ? primaryCta.href : websiteHref;
  const officialActionKind = (primaryCta && primaryCta.type === "official_tickets" && primaryCta.href) ? "official_tickets" : "official_admission";
  const officialActionObj = officialActionHref && (isTicketedPlace(detail, editorial) || hasVerifiedOfficialCta)
    ? {
      type: "url",
      kind: officialActionKind,
      label: officialActionKind === "official_tickets" ? "Official tickets ↗" : "Official site ↗",
      href: officialActionHref,
      monetized: false,
    }
    : null;

  // Priority 1: Verified Wayfind partner ticket where it genuinely matches.
  if (primaryCta && primaryCta.monetized && primaryCta.type === "tickets" && primaryCta.href) {
    const vt = viaTours && detail.id && viaTours[detail.id];
    const topTour = vt && !vt.loading && Array.isArray(vt.items) ? vt.items[0] : null;
    const tourPrice = topTour && Number.isFinite(Number(topTour.price)) && Number(topTour.price) > 0
      ? `from $${Math.round(Number(topTour.price))}`
      : null;
    const seller = primaryCta.merchant || (primaryCta.provider === "booking" ? "Viator" : null);
    const partnerAction = {
      type: "url",
      kind: "partner_ticket",
      label: primaryCta.label || "Get tickets",
      href: primaryCta.href,
      provider: primaryCta.provider || null,
      offerId: primaryCta.offerId || null,
      merchant: seller,
      monetized: true,
    };
    if (priceFact) return { text: priceFact, value: priceFact, action: partnerAction };
    const text = tourPrice && seller
      ? `Tickets ${tourPrice} via ${seller}`
      : seller
        ? `Verified tickets available via ${seller}`
        : "Verified advance tickets available";
    return { text, value: text, action: partnerAction };
  }

  // Priority 2: Official first-party ticket / admission information.
  if (priceFact) {
    return {
      text: priceFact,
      value: priceFact,
      ...(officialActionObj ? { action: officialActionObj } : {}),
    };
  }

  if (isTicketedPlace(detail, editorial) || hasVerifiedOfficialCta) {
    if (officialActionHref) {
      const text = "Paid admission · check official rates & timed entry";
      return {
        text,
        value: text,
        action: {
          type: "url",
          kind: officialActionKind,
          label: officialActionKind === "official_tickets" ? "Official tickets ↗" : "See admission ↗",
          href: officialActionHref,
          monetized: false,
        },
      };
    }
  }

  // Priority 3: Verified unconditional free admission information.
  if (isVerifiedFreePlace(detail, editorial)) {
    const texts = collectEditorialTexts(editorial);
    const paidParking = texts.find((t) => /\bfree\s+(?:admission|entry)\b/i.test(t) && /\bpaid\s+parking|\$\d+\s+parking\b/i.test(t));
    const text = paidParking ? conciseLine(paidParking, 130) : "Free admission";
    return { text, value: text };
  }

  // Priority 4: Verified dining cost / canonical price band (never invented).
  const isFoodOrDrink = ["Food", "Nightlife"].includes(Ranking.coarseCat(detail) || "");
  if (isFoodOrDrink) {
    const forTwo = Dining.costForTwo(detail);
    if (forTwo && forTwo.listed && forTwo.text) return { text: forTwo.text, value: forTwo.text };
  }
  const rawPrice = detail.priceNum != null
    ? detail.priceNum
    : (detail.price_level != null ? detail.price_level : detail.priceLevel);
  if (rawPrice != null && rawPrice !== "" && Number(rawPrice) > 0) {
    const lvl = priceLevelOf(rawPrice);
    const lbl = lvl ? priceLabel(lvl) : null;
    if (lvl && lbl) {
      const text = `${"$".repeat(lvl)} · ${lbl}`;
      return { text, value: text };
    }
  }

  const offer = offers && detail.id ? offers[detail.id] : null;
  if (offer && offer.title) {
    const text = conciseLine(`Deal: ${offer.title}`, 120);
    if (text) return { text, value: text };
  }

  return null;
}

export function extractSupportedCost({ detail = null, editorial = null, wayfindNotesList = null, primaryCta = null, websiteHref = null, viaTours = null, offers = null } = {}) {
  const row = resolveCostRow({ detail, editorial, wayfindNotesList, primaryCta, websiteHref, viaTours, offers });
  if (!row) return null;
  return {
    value: row.value,
    sub: null,
    confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
    action: row.action || null,
  };
}

function selectInsiderMove({ detail, editorial, insider = null, curatedNotes = null, curatedNoteText = null, curatedEvents = [], usedSet = new Set() }) {
  const pool = [];
  if (editorial && typeof editorial === "object") {
    pool.push(editorial.insiderMove, editorial.proMove, editorial.watchOut);
    if (["Food", "Nightlife"].includes(Ranking.coarseCat(detail) || "")) {
      pool.push(editorial.foodMove, editorial.drinkMove);
    } else if (typeof editorial.foodMove === "string" && /\b(inside\s+the|on[- ]site|cafe|bistro|garden\s+restaurant)\b/i.test(editorial.foodMove)) {
      pool.push(editorial.foodMove);
    }
    pool.push(editorial.move);
  }
  if (insider && typeof insider === "object") {
    pool.push(insider.tip, insider.dontMiss);
  }
  if (Array.isArray(curatedNotes)) {
    for (const n of curatedNotes) {
      const txt = typeof n === "string" ? n : (n && n.text);
      if (txt) pool.push(txt);
    }
  }
  if (typeof curatedNoteText === "string" && curatedNoteText.trim()) pool.push(curatedNoteText);
  if (Array.isArray(curatedEvents) && curatedEvents[0] && curatedEvents[0].insider_tip) {
    pool.push(curatedEvents[0].insider_tip);
  }

  for (const raw of pool) {
    const cleaned = cleanText(raw);
    if (!cleaned) continue;
    const sentences = splitSentences(cleaned);
    const unused = [];
    for (const s of sentences) {
      if (!overlapsShown(s, usedSet)) {
        unused.push(s);
      } else if (COMPOUND_TIP_SPLIT_RX.test(s)) {
        const remaining = s
          .split(COMPOUND_TIP_SPLIT_RX)
          .map((c) => c.trim())
          .filter((c) => c && !overlapsShown(c, usedSet));
        if (remaining.length > 0) {
          const joined = remaining.join(", ");
          unused.push(joined.charAt(0).toUpperCase() + joined.slice(1));
        }
      }
    }
    const chosen = unused.length > 0 ? unused.join(" ") : cleaned;
    const line = conciseLine(chosen, 160);
    if (line && !overlapsShown(line, usedSet)) return line;
  }
  return null;
}

export function extractSupportedInsiderMove({ detail = null, editorial = null, insider = null, usedSentences = new Set() } = {}) {
  const usedSet = new Set();
  for (const s of usedSentences) usedSet.add(textSignature(s));
  const val = selectInsiderMove({ detail, editorial, insider, usedSet });
  if (!val) return null;
  return {
    value: val,
    sub: editorial && editorial.bestFor ? cleanText(editorial.bestFor) : null,
    confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
  };
}

/**
 * Find the highest-governed-score indoor place within 5 miles that is not
 * known-closed right now. Organic score order only; affiliate pins never affect rank.
 */
export function findIndoorBackup(detail, nearbyPlaces = [], nowMs = Date.now()) {
  if (!detail || !Array.isArray(nearbyPlaces) || !nearbyPlaces.length) return null;
  const candidates = [];
  for (const p of nearbyPlaces) {
    if (!p || !p.id || p.id === detail.id) continue;
    if (isUtilityErrandPlace(p)) continue;
    const lean = Ranking.venueLean(p);
    if (!lean || lean.lean !== "indoor" || lean.water) continue;
    const open = isOpenNow(p, nowMs);
    if (open === false || (open == null && p.openNow === false)) continue;
    const dist = detailDistanceMi(detail, p);
    if (dist != null && (dist <= 0 || dist > 5)) continue;
    const score = Number(p.governed_score ?? p.wfScore ?? 0);
    candidates.push({ place: p, distMi: dist != null ? dist : 1, score });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.score - a.score) || (a.distMi - b.distMi));
  return candidates[0];
}

/**
 * Synthesize the live GO / WAIT verdict with concrete transition times and
 * weather/daylight context. Never claims "Go now" when openState is null.
 */
export function buildGamePlanVerdict({ detail, weather, openState, business, hasIndoorBackup = false, hasActiveNightEvent = false, nowMs = Date.now() }) {
  if (!detail) return null;
  const next = business && business.nextTransition ? business.nextTransition : null;

  if (openState === false) {
    if (next && next.type === "open" && next.label) {
      const cleanOpen = String(next.label).replace(/^Opens\s+/i, "").trim();
      const phrase = next.today ? `opens at ${cleanOpen}` : `opens ${cleanOpen}`;
      return { text: `Wait — closed now · ${phrase}`, tone: "wait", code: "closed_with_open" };
    }
    return { text: "Wait — closed now", tone: "wait", code: "closed" };
  }

  if (!hasActiveNightEvent && isDaylightOnlyPlace(detail) && Number.isFinite(Number(detail.lat)) && Number.isFinite(Number(detail.lng)) && isAfterDark(Number(detail.lat), Number(detail.lng), new Date(nowMs))) {
    return { text: "After sunset · best in daylight", tone: "wait", code: "after_dark" };
  }

  const hoursKnown = openState === true;
  const regime = Ranking.weatherRegime(weather);
  const { lean, water } = Ranking.venueLean(detail);

  if (regime === "wet") {
    if (lean === "indoor") {
      return {
        text: hoursKnown ? "Go now · indoor rain-safe pick" : "Good indoor weather",
        tone: "go",
        code: "wet_indoor",
      };
    }
    return {
      text: hasIndoorBackup ? "Rainy now · indoor backup available" : "Wait — rain now",
      tone: "wait",
      code: hasIndoorBackup ? "wet_outdoor_backup" : "wet_outdoor",
    };
  }

  if (regime === "showery" && lean === "outdoor" && !water) {
    return {
      text: hasIndoorBackup ? "Showers likely · indoor backup nearby" : "Wait — showers likely",
      tone: "wait",
      code: "showery_outdoor",
    };
  }

  if (regime === "hot" && lean === "outdoor" && !water) {
    const tz = tzForPoint(detail.lat, detail.lng);
    const hour = siteHourFloat(new Date(nowMs), tz);
    const closesLate = !(next && next.type === "close" && Number.isFinite(next.hour) && next.hour <= 18);
    if (hour >= 11.5 && hour < 17 && closesLate) {
      return { text: "Very hot now · better after 5 PM", tone: "wait", code: "hot_afternoon" };
    }
    return { text: "Wait — very hot right now", tone: "wait", code: "hot_outdoor" };
  }

  if (regime === "cold" && water) {
    return { text: "Wait — cold for water right now", tone: "wait", code: "cold_water" };
  }

  if (hoursKnown) {
    if (next && next.type === "close" && next.label) {
      const closeAt = String(next.label).replace(/^Closes\s+/i, "").trim();
      if (next.soon && Number.isFinite(next.inMinutes) && next.inMinutes <= 45) {
        return { text: `Closing soon · closes at ${closeAt}`, tone: "wait", code: "closing_soon" };
      }
      return { text: `Go now · open until ${closeAt}`, tone: "go", code: "open_until" };
    }
    return { text: "Go now", tone: "go", code: "open" };
  }

  return null;
}

/**
 * Main entry point: build the truthful, deduplicated, progressive-disclosure
 * "Your Game Plan" brief for a place detail sheet.
 */
export function buildGamePlan({
  detail,
  detailExtra = null,
  editorial = null,
  curatedEvents = [],
  verdict: callerVerdict = null,
  weather = null,
  openState: initialOpenState = null,
  insider = null,
  wayfindNotesList = null,
  primaryCta = null,
  websiteHref = null,
  curatedNotes = null,
  curatedNoteText = null,
  nearbyPlaces = [],
  nearbyPool = null,
  nearbyPicks = null,
  nearbyParking = [],
  viaTours = null,
  offers = null,
  formatEventDate = null,
  eventWhenLabel = null,
  nowMs = Date.now(),
} = {}) {
  if (!detail || typeof detail !== "object") {
    return {
      show: false,
      verdict: null,
      openState: null,
      business: null,
      rows: [],
      primaryRows: [],
      secondaryRows: [],
      visibleCount: 0,
      hasMore: false,
      hiddenCount: 0,
      officialAction: null,
      weatherPivot: null,
      indoorBackup: null,
      activeEvent: null,
    };
  }

  const ts = nowMs instanceof Date ? nowMs.getTime() : Number(nowMs);
  const effectiveNowMs = Number.isFinite(ts) ? ts : Date.now();
  const nowDate = new Date(effectiveNowMs);
  const todayIso = siteTodayStr(nowDate);
  const hydrated = hydrateDetailHours(detail, detailExtra, effectiveNowMs, editorial);
  const business = businessStatus(hydrated, effectiveNowMs);
  const openState = business && typeof business.open === "boolean"
    ? business.open
    : (typeof initialOpenState === "boolean"
        ? initialOpenState
        : (typeof detail.openNow === "boolean" ? detail.openNow : null));

  const placeInsider = insider && detail.id && insider[detail.id] && !insider[detail.id].none
    ? insider[detail.id]
    : (insider && typeof insider.tip === "string" ? insider : null);
  const mergedNotes = curatedNotes || wayfindNotesList || null;

  const eligibleEvents = filterEligibleVenueEvents(curatedEvents, detail, { now: nowDate });
  const activeNightEvent = eligibleEvents.some((ev) => {
    const s = ev.start_date;
    const e = ev.end_date || s;
    return s && s <= todayIso && e >= todayIso && /\b(night|lights|evening|pm|p\.m\.|glow|dazzling|lantern)\b/i.test(`${ev.event_name || ""} ${ev.schedule_note || ""} ${ev.start_time || ""}`);
  });

  const combinedPool = Array.isArray(nearbyPool) && nearbyPool.length > 0 ? nearbyPool : nearbyPlaces;
  const indoorBackup = findIndoorBackup(detail, combinedPool, effectiveNowMs);
  const computedVerdict = buildGamePlanVerdict({
    detail: hydrated,
    weather,
    openState,
    business,
    hasIndoorBackup: Boolean(indoorBackup),
    hasActiveNightEvent: activeNightEvent,
    nowMs: effectiveNowMs,
  });

  // Guard callerVerdict so closed/unknown-hours places never claim "Go now".
  let safeCallerVerdict = null;
  if (callerVerdict && callerVerdict.text) {
    if (openState === false) {
      safeCallerVerdict = computedVerdict || { text: "Wait — closed now", tone: "wait", code: "closed" };
    } else if (openState !== true) {
      const stripped = String(callerVerdict.text).replace(/\bGo now\s*[—·:-]?\s*/i, "").trim() || "Check hours before heading out";
      safeCallerVerdict = { text: stripped, tone: callerVerdict.tone === "go" ? "neutral" : (callerVerdict.tone || "neutral"), code: "hours_unconfirmed" };
    } else {
      safeCallerVerdict = callerVerdict;
    }
  }
  const verdict = safeCallerVerdict || computedVerdict;

  const usedSignatures = new Set();
  const addUsed = (txt) => {
    if (!txt) return;
    for (const s of splitSentences(txt)) usedSignatures.add(textSignature(s));
    usedSignatures.add(textSignature(txt));
  };

  const parkingText = extractParkingIntel(hydrated, editorial, eligibleEvents, mergedNotes, placeInsider);
  if (parkingText) addUsed(parkingText);

  const costObj = resolveCostRow({
    detail: hydrated,
    editorial,
    wayfindNotesList: mergedNotes,
    primaryCta,
    websiteHref,
    viaTours,
    offers,
  });
  if (costObj && costObj.text) addUsed(costObj.text);

  const durationText = extractVerifiedDuration(editorial, eligibleEvents, placeInsider, mergedNotes);
  if (durationText) addUsed(durationText);

  const bestTimeText = extractBestTime({
    detail: hydrated,
    detailExtra,
    editorial,
    insider: placeInsider,
    curatedEvents: eligibleEvents,
    todayIso,
    usedSet: usedSignatures,
    formatEventDate,
    eventWhenLabel,
  });
  if (bestTimeText) addUsed(bestTimeText);

  const insiderText = selectInsiderMove({
    detail: hydrated,
    editorial,
    insider: placeInsider,
    curatedNotes: mergedNotes,
    curatedNoteText,
    curatedEvents: eligibleEvents,
    usedSet: usedSignatures,
  });
  if (insiderText) addUsed(insiderText);

  // Next move: wet-weather indoor backup -> active venue event -> complementary nearby pairing.
  const regime = Ranking.weatherRegime(weather);
  const { lean, water } = Ranking.venueLean(hydrated);
  const isWetOutdoor = (regime === "wet" || regime === "showery") && (lean === "outdoor" || water);

  let weatherPivot = null;
  let nextStopRow = null;
  if (isWetOutdoor && indoorBackup && indoorBackup.place) {
    weatherPivot = indoorBackup.place;
    const d = Number.isFinite(indoorBackup.distMi)
      ? (indoorBackup.distMi < 0.2 ? "steps away" : `${indoorBackup.distMi.toFixed(1)} mi away`)
      : null;
    const text = callerVerdict
      ? indoorBackup.place.name
      : `Rain backup: ${indoorBackup.place.name}${d ? ` (${d})` : ""}`;
    nextStopRow = {
      key: "what_next",
      label: callerVerdict ? "Rain backup nearby" : "Next move",
      value: indoorBackup.place.name,
      text,
      sub: "Indoor option nearby while it's wet outside",
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      targetPlace: indoorBackup.place,
      action: { type: "place", label: "Open backup →", place: indoorBackup.place },
    };
  } else if (Array.isArray(eligibleEvents) && eligibleEvents.length > 0 && !hydrated._event) {
    const ev = eligibleEvents[0];
    const span = formatShortDateRange(ev, todayIso);
    const title = ev.short_title || ev.event_name;
    const href = ev.slug ? `/florida-events/${encodeURIComponent(ev.slug)}` : safeUrl(ev.official_event_url || ev.official_ticket_url);
    if (title) {
      const text = `${span ? span + ": " : "Upcoming: "}${title}`;
      nextStopRow = {
        key: "what_next",
        label: "Next move",
        value: text,
        text,
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
        ...(href ? { action: { type: "url", label: "See event →", href, monetized: false, sameOrigin: href.startsWith("/") } } : {}),
      };
    }
  } else if (Array.isArray(nearbyPicks) && nearbyPicks.length > 0) {
    const validPick = nearbyPicks.find((x) => x && (x.p || x) && !isUtilityErrandPlace(x.p || x));
    const p = validPick && (validPick.p || validPick);
    if (p && p.name) {
      const why = validPick.reason ? ` — ${validPick.reason.charAt(0).toLowerCase() + validPick.reason.slice(1)}` : "";
      nextStopRow = {
        key: "what_next",
        label: callerVerdict ? "Pairs well with" : "Next move",
        value: p.name,
        text: `Pair with ${p.name}${why}`,
        sub: validPick.reason || null,
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
        targetPlace: p,
        action: { type: "place", label: "View spot →", place: p },
      };
    }
  } else {
    const rawPool = (Array.isArray(combinedPool) ? combinedPool : []).filter((p) => !isUtilityErrandPlace(p));
    const filteredPool = regime === "wet"
      ? rawPool.filter((p) => {
          const l = Ranking.venueLean(p);
          return l && l.lean !== "outdoor" && !l.water;
        })
      : rawPool;
    const tz = tzForPoint(hydrated.lat, hydrated.lng);
    const hour = siteHourFloat(new Date(effectiveNowMs), tz);
    const bucket = hour >= 6 && hour < 11.5 ? "morning" : (hour >= 11.5 && hour < 17.5 ? "afternoon" : "night");
    const picks = pairsWellWith(hydrated, filteredPool, { bucket, max: 3, radiusMi: 5 })
      .filter((pick) => pick && pick.p && isOpenNow(pick.p, effectiveNowMs) !== false && pick.p.openNow !== false);
    if (picks.length > 0) {
      const best = picks[0];
      const dist = Number.isFinite(best.pairDistMi)
        ? (best.pairDistMi < 0.2 ? "steps away" : `${best.pairDistMi.toFixed(1)} mi`)
        : null;
      const why = best.reason ? ` — ${best.reason.charAt(0).toLowerCase() + best.reason.slice(1)}` : "";
      const text = `Pair with ${best.p.name}${dist ? ` (${dist})` : ""}${why}`;
      nextStopRow = {
        key: "what_next",
        label: "Next move",
        value: best.p.name,
        text,
        sub: best.reason || null,
        confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
        targetPlace: best.p,
        action: { type: "place", label: "View spot →", place: best.p },
      };
    }
  }

  const rows = [];
  if (callerVerdict && verdict && verdict.text) {
    rows.push({
      key: "should_go",
      label: "Should I go?",
      tone: openState === false ? "wait" : (verdict.tone || "go"),
      value: verdict.text,
      text: verdict.text,
      sub: editorial && editorial.bestFor ? cleanText(editorial.bestFor) : null,
      confidence: openState === true || openState === false ? GAME_PLAN_CONFIDENCE.CONFIRMED : GAME_PLAN_CONFIDENCE.LIKELY,
    });
  }
  if (bestTimeText) {
    rows.push({
      key: "when",
      label: "When to go",
      value: bestTimeText,
      text: bestTimeText,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
    });
  }
  if (durationText) {
    rows.push({
      key: "duration",
      label: "How long",
      value: durationText,
      text: durationText,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
    });
  }
  if (costObj && costObj.text) {
    rows.push({
      key: "cost",
      label: "Cost & tickets",
      value: costObj.value,
      text: costObj.text,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      ...(costObj.action ? { action: costObj.action } : {}),
    });
  }
  if (insiderText) {
    rows.push({
      key: "insider_move",
      label: "Insider move",
      value: insiderText,
      text: insiderText,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
    });
  }
  if (parkingText) {
    const canJumpMap = hasParkingCoordinate(hydrated) || (Array.isArray(nearbyParking) && nearbyParking.length > 0);
    rows.push({
      key: "parking",
      label: "Parking & arrival",
      value: parkingText,
      text: parkingText,
      confidence: GAME_PLAN_CONFIDENCE.CONFIRMED,
      ...(canJumpMap ? { action: { type: "scroll_parking", label: "Map & lots ↓" } } : {}),
    });
  }
  if (nextStopRow) {
    rows.push(nextStopRow);
  }

  // Only show when at least one substantive planning row exists beyond a bare open/closed pill.
  const substantiveRows = rows.filter((r) => r.key !== "should_go");
  const hasSubstantiveSignal = substantiveRows.length > 0 || !!(editorial && editorial.bestFor);
  if (!hasSubstantiveSignal) {
    return {
      show: false,
      verdict,
      openState,
      business,
      rows: [],
      primaryRows: [],
      secondaryRows: [],
      visibleCount: 0,
      hasMore: false,
      hiddenCount: 0,
      officialAction: null,
      weatherPivot: null,
      indoorBackup: indoorBackup ? indoorBackup.place : null,
      activeEvent: eligibleEvents[0] || null,
    };
  }

  // During active rain on an outdoor place, elevate `what_next` (the indoor
  // backup) into the top 3 immediately visible rows.
  if (!callerVerdict && verdict && verdict.code === "wet_outdoor_backup" && rows.length > 3) {
    const idx = rows.findIndex((r) => r.key === "what_next");
    if (idx >= 3) {
      const [backupRow] = rows.splice(idx, 1);
      rows.splice(2, 0, backupRow);
    }
  }

  const MAX_INITIAL_ROWS = 3;
  const visibleCount = Math.min(rows.length, MAX_INITIAL_ROWS);
  const hiddenCount = Math.max(0, rows.length - visibleCount);
  const primaryRows = rows.slice(0, 4);
  const secondaryRows = rows.slice(4);
  const officialAction = costObj && costObj.action && costObj.action.kind === "official_admission"
    ? costObj.action
    : null;

  return {
    show: rows.length > 0,
    verdict,
    openState,
    business,
    rows,
    primaryRows,
    secondaryRows,
    visibleCount,
    hasMore: hiddenCount > 0,
    hiddenCount,
    officialAction,
    weatherPivot,
    indoorBackup: indoorBackup ? indoorBackup.place : null,
    activeEvent: eligibleEvents[0] || null,
  };
}
