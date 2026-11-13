// lib/wayfindPlanner.js — Character-neutral Wayfind Planner brain.
//
// Separation of responsibilities:
//   - Deterministic code handles: date parsing, covered-city resolution,
//     candidate normalization, haversine clustering, intra-day route ordering,
//     travel-relationship labels, open/closed & occurrence-date validation,
//     duplicate prevention, price honesty, and canonical trip mutations.
//   - Claude (`paidAnthropicRequest` in `/api/planner`) handles: preference
//     nuance, candidate selection from the grounded pool, and brief human
//     explanation — using `voice: "santa" | "wayfind"` as a presentation skin
//     over the exact same planning engine.
//   - If Claude is unavailable, gated off, or returns an invalid payload, the
//     deterministic planner produces or edits the grounded itinerary cleanly.

import { personaVoiceRule, personaPlanReply, plannerPersona, stripDashes } from "./plannerPersona.js";
import { formatStopDate, normalizeStopDate, sortedItems } from "./tripDays.js";
import { haversineKm } from "./trips.js";
import { compactDayRule } from "./scheduleNoteDays.js";
import {
  parsePlannerRequest,
  enumerateDateSpan,
} from "./plannerParse.js";
import {
  canScheduleOnDate,
  evaluateStopConfidence,
  clusterCandidatesByZone,
  orderDayStopsGeographically,
  stopTravelRelationship,
  suggestedSlotLabels,
  distanceMiles,
} from "./plannerGeo.js";
import {
  PLANNER_ACTION_TYPES,
  validateProposedPlan,
  parseClockMinutes,
} from "./plannerActions.js";
import { wayfindScore } from "./wayfindScore.js";

const VALID_ID_RX = /^[A-Za-z0-9:_-]{2,200}$/;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function finiteOrNull(v) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function priceTierLabel(priceNum, rawPrice, isFree) {
  if (isFree === true) return "Free";
  if (typeof rawPrice === "string" && rawPrice.trim()) {
    const p = rawPrice.trim();
    if (!/not\s+announced|unknown/i.test(p)) return p;
  }
  if (priceNum === 0) return "Free";
  if (priceNum === 1) return "$";
  if (priceNum === 2) return "$$";
  if (priceNum === 3) return "$$$";
  if (priceNum === 4) return "$$$$";
  return null;
}

/**
 * Normalizes a place/card/event record from Wayfind's owned search or curated
 * event feeds into a single grounded candidate shape. Never fabricates ratings,
 * prices, hours, or coordinates.
 */
export function normalizeGroundedCandidate(raw, sourceKind = "owned") {
  if (!raw || typeof raw !== "object") return null;
  const rawId = raw.id || raw.place_id || raw.placeId || (raw.event_id ? `event:${raw.event_id}` : null);
  if (!rawId) return null;
  const id = String(rawId).trim();
  if (!VALID_ID_RX.test(id)) return null;
  if (id.startsWith("guide:")) return null; // Guides are editorial articles, not physical trip stops

  const name = String(
    (typeof raw.displayName === "object" && raw.displayName ? raw.displayName.text : raw.displayName)
      || raw.name
      || raw.cardName
      || raw.short_title
      || raw.event_name
      || raw.title
      || ""
  ).trim();
  if (!name) return null;

  const latRaw = raw.lat ?? (raw.location && (raw.location.latitude ?? raw.location.lat)) ?? raw.venue_lat;
  const lngRaw = raw.lng ?? (raw.location && (raw.location.longitude ?? raw.location.lng)) ?? raw.venue_lng;
  const lat = finiteOrNull(latRaw);
  const lng = finiteOrNull(lngRaw);

  const isEvent =
    raw.itemType === "event"
    || raw.kind === "event"
    || Boolean(raw.event_id)
    || id.startsWith("event:");

  const isFree =
    raw.is_free === true
    || raw.free === true
    || raw.price_band === "free"
    || (typeof raw.priceLabel === "string" && /^free\b/i.test(raw.priceLabel));

  const pNumRaw = finiteOrNull(raw.priceNum);
  const pMinRaw = finiteOrNull(raw.price_min);
  const priceNum =
    isFree
      ? 0
      : pNumRaw != null
      ? pNumRaw
      : pMinRaw != null
      ? (pMinRaw === 0 && isFree ? 0 : pMinRaw <= 20 ? 1 : pMinRaw <= 45 ? 2 : 3)
      : null;

  const price = priceTierLabel(priceNum, raw.price || raw.priceLabel || raw.costSummary, isFree);

  const ratingNum = finiteOrNull(raw.rating);
  const rating = !isEvent && ratingNum != null && ratingNum > 0 ? ratingNum : null;
  const reviewsNum = finiteOrNull(raw.reviews) ?? finiteOrNull(raw.userRatingCount);
  const reviews = !isEvent && reviewsNum != null && reviewsNum > 0 ? reviewsNum : 0;
  const rawScore = finiteOrNull(raw.wfScore);
  const wfScore = isEvent
    ? null
    : rawScore != null && rawScore > 0
    ? rawScore
    : rating != null
    ? wayfindScore(rating, reviews)
    : null;

  const city = String(raw.city || raw.locality || "").trim() || null;
  const address = String(raw.address || raw.formattedAddress || raw.venue || city || "").trim();

  const tags = [
    ...(Array.isArray(raw.tags) ? raw.tags : []),
    ...(Array.isArray(raw.cuisines) ? raw.cuisines : []),
    ...(Array.isArray(raw.christmas_categories) ? raw.christmas_categories : []),
    ...(Array.isArray(raw.types) ? raw.types : []),
    raw.category,
    raw.subcategory,
    raw.primaryType,
    raw.type,
    raw.christmas_rail,
  ].filter(Boolean).map((t) => String(t).toLowerCase());

  const detailHref = raw.detailHref
    || (typeof raw.href === "string" && raw.href.startsWith("/") ? raw.href : null)
    || (raw.slug && isEvent ? `/florida-events/${raw.slug}` : null)
    || (!isEvent && !id.includes(":") ? `/p/${id}` : null);

  const ticketObj = raw.ticket && typeof raw.ticket === "object" ? raw.ticket : null;
  const ticketUrl = raw.ticketUrl || (ticketObj && ticketObj.href) || raw.official_ticket_url || null;
  const ticketLabel = raw.ticketLabel || (ticketObj && ticketObj.label) || (ticketUrl ? "Tickets" : null);

  const weekdayDescriptions = Array.isArray(raw.weekdayDescriptions)
    ? raw.weekdayDescriptions
    : Array.isArray(raw.regularOpeningHours && raw.regularOpeningHours.weekdayDescriptions)
    ? raw.regularOpeningHours.weekdayDescriptions
    : Array.isArray(raw.hours && raw.hours.weekdayDescriptions)
    ? raw.hours.weekdayDescriptions
    : null;

  return {
    id,
    name,
    address,
    city,
    state: raw.state || "FL",
    lat,
    lng,
    photo: raw.photo || raw.photoUrl || raw.hero_image || raw.imageUrl || null,
    type: raw.type || raw.category || raw.primaryType || (isEvent ? "Seasonal Event" : "Place"),
    category: raw.category || null,
    primaryType: raw.primaryType || null,
    tags,
    rating,
    reviews,
    wfScore,
    price,
    priceNum,
    isFree,
    priceKnown: price !== null,
    itemType: isEvent ? "event" : "place",
    startDate: normalizeStopDate(raw.startDate || raw.start_date) || null,
    endDate: normalizeStopDate(raw.endDate || raw.end_date) || null,
    occurrenceDates: Array.isArray(raw.occurrence_dates || raw.occurrenceDates)
      ? (raw.occurrence_dates || raw.occurrenceDates).map(normalizeStopDate).filter(Boolean)
      : null,
    selectNights: Boolean(raw.select_nights ?? raw.selectNights),
    scheduleNote: raw.schedule_note || raw.scheduleNote || raw.seasonalWhen || null,
    dayRule: raw.dayRule !== undefined
      ? raw.dayRule
      : (isEvent && (raw.schedule_note || raw.scheduleNote || raw.select_nights || raw.selectNights)
          ? compactDayRule({
              start_date: normalizeStopDate(raw.startDate || raw.start_date),
              end_date: normalizeStopDate(raw.endDate || raw.end_date),
              select_nights: Boolean(raw.select_nights ?? raw.selectNights),
              schedule_note: raw.schedule_note || raw.scheduleNote || "",
            })
          : null),
    startTime: (() => {
      const rawTime = raw.start_time || raw.startTime || raw.time || null;
      if (!rawTime) return null;
      const str = String(rawTime).trim();
      const m24 = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (m24) {
        const h = Number(m24[1]);
        const mins = m24[2];
        if (h >= 0 && h <= 23) {
          const suffix = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 || 12;
          return `${h12}:${mins} ${suffix}`;
        }
      }
      return str;
    })(),
    weekdayDescriptions,
    url: raw.url || raw.websiteUri || raw.sourceUrl || null,
    detailHref,
    ticketUrl,
    ticketLabel,
    reservable: typeof raw.reservable === "boolean" ? raw.reservable : null,
    take: String(raw.take || raw.card_hook || raw.why_go || raw.line || "").trim().slice(0, 220) || null,
    sourceKind,
  };
}

export function isEntityInDestinationMetro(cand, destination, maxRadiusKm = 58) {
  if (!destination) return true;
  if (!cand) return false;

  const hasDestCoords = destination.lat != null && destination.lng != null && Number.isFinite(Number(destination.lat)) && Number.isFinite(Number(destination.lng));
  const hasCandCoords = cand.lat != null && cand.lng != null && Number.isFinite(Number(cand.lat)) && Number.isFinite(Number(cand.lng));

  if (hasDestCoords && hasCandCoords) {
    const km = haversineKm(destination, cand);
    return km != null && km <= maxRadiusKm;
  }

  if (!destination.name || !cand.city) return false;
  const cLow = String(cand.city).trim().toLowerCase();
  const dLow = String(destination.name).trim().toLowerCase();
  const orlandoMetro = new Set(["orlando", "winter park", "kissimmee", "lake buena vista", "celebration", "altamonte springs", "sanford", "mount dora"]);
  const tampaMetro = new Set(["tampa", "st. petersburg", "st petersburg", "st. pete beach", "st pete beach", "north redington beach", "clearwater", "largo", "dunedin", "brandon", "wesley chapel"]);
  const sarasotaMetro = new Set(["sarasota", "bradenton", "bradenton beach", "holmes beach", "siesta key", "longboat key", "anna maria", "anna maria island", "venice", "nokomis", "osprey", "north port", "warm mineral springs", "lakewood ranch", "university park", "waterside place", "palmetto", "parrish", "ellenton", "cortez", "myakka city", "duette"]);
  const miamiMetro = new Set(["miami", "miami beach", "coral gables", "coconut grove", "pinecrest", "fort lauderdale", "hollywood", "doral"]);
  const palmBeachMetro = new Set(["west palm beach", "palm beach", "boca raton", "delray beach", "jupiter"]);
  const jaxMetro = new Set(["jacksonville", "jacksonville beach", "st. augustine", "st augustine", "ponte vedra", "amelia island"]);
  const swflMetro = new Set(["naples", "fort myers", "fort myers beach", "sanibel", "captiva", "bonita springs", "marco island", "cape coral"]);

  return (
    cLow === dLow
    || (orlandoMetro.has(dLow) && orlandoMetro.has(cLow))
    || (tampaMetro.has(dLow) && tampaMetro.has(cLow))
    || (sarasotaMetro.has(dLow) && sarasotaMetro.has(cLow))
    || (miamiMetro.has(dLow) && miamiMetro.has(cLow))
    || (palmBeachMetro.has(dLow) && palmBeachMetro.has(cLow))
    || (jaxMetro.has(dLow) && jaxMetro.has(cLow))
    || (swflMetro.has(dLow) && swflMetro.has(cLow))
  );
}

/**
 * Deduplicates and ranks grounded candidates near the target destination.
 */
export function buildGroundedCandidatePool(rawGroups = [], { destination = null, maxRadiusKm = 58 } = {}) {
  const byId = new Map();
  const byNameCity = new Set();

  for (const group of rawGroups) {
    const items = Array.isArray(group) ? group : (group && Array.isArray(group.items) ? group.items : []);
    const sourceKind = (group && group.sourceKind) || "owned";
    for (const raw of items) {
      const cand = normalizeGroundedCandidate(raw, sourceKind);
      if (!cand) continue;
      if (byId.has(cand.id)) continue;

      if (!isEntityInDestinationMetro(cand, destination, maxRadiusKm)) continue;

      if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng) && cand.lat != null && cand.lng != null) {
        const km = haversineKm(destination, cand);
        if (km != null) {
          cand.distFromCenterKm = Number(km.toFixed(2));
        }
      }

      const dedupeNameKey = `${(cand.city || "").toLowerCase()}|${cand.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
      if (byNameCity.has(dedupeNameKey)) continue;
      byNameCity.add(dedupeNameKey);
      byId.set(cand.id, cand);
    }
  }

  return [...byId.values()];
}

/**
 * Generates up to 4 targeted owned-inventory search queries for a planning request.
 */
export function plannerInventoryQueries(parsed) {
  const city = parsed.destination ? parsed.destination.name : "";
  const citySuffix = city ? ` ${city}` : "";
  const queries = [];

  if (parsed.edit) {
    const e = parsed.edit;
    if (e.kind === "replace_stop" || e.kind === "add_stop") {
      const role = e.slotRole || "";
      if (role === "breakfast" || /\bbreakfast|coffee|bakery\b/i.test(parsed.raw)) {
        queries.push(`breakfast${citySuffix}`, `coffee bakery${citySuffix}`);
      } else if (role === "brunch") {
        queries.push(`brunch${citySuffix}`, `restaurants${citySuffix}`);
      } else if (role === "dinner" || /\bdinner|restaurant\b/i.test(parsed.raw)) {
        queries.push(`restaurants${citySuffix}`, `dinner${citySuffix}`);
      } else if (role === "drinks") {
        queries.push(`cocktail bar${citySuffix}`, `bars${citySuffix}`);
      } else if (role === "indoors" || e.indoors) {
        queries.push(`museums indoor${citySuffix}`, `restaurants${citySuffix}`);
      } else {
        queries.push(`things to do${citySuffix}`, `restaurants${citySuffix}`);
      }
      if (e.cheaper) queries.push(`casual food${citySuffix}`);
      return [...new Set(queries)].slice(0, 4);
    }
    if (e.kind === "revise_budget") {
      return [`free things to do${citySuffix}`, `parks gardens${citySuffix}`, `casual food${citySuffix}`].slice(0, 3);
    }
    if (e.kind === "revise_indoors") {
      return [`museums${citySuffix}`, `indoor things to do${citySuffix}`, `restaurants${citySuffix}`].slice(0, 3);
    }
  }

  const ints = new Set((parsed.preferences && parsed.preferences.interests) || []);
  if (ints.has("food") || ints.has("dinner") || ints.size === 0) {
    queries.push(`restaurants${citySuffix}`);
  }
  if (ints.has("breakfast") || ints.has("brunch") || (parsed.dates && parsed.dates.dayCount >= 2)) {
    queries.push(`breakfast coffee${citySuffix}`);
  }
  if (ints.has("bars")) {
    queries.push(`bars cocktails${citySuffix}`);
  }
  if (ints.has("indoors")) {
    queries.push(`museums${citySuffix}`);
  } else if (ints.has("beach")) {
    queries.push(`beaches waterfront${citySuffix}`);
  } else {
    queries.push(`things to do${citySuffix}`);
  }
  if (ints.has("christmas") || ints.has("lights")) {
    queries.push(`christmas lights${citySuffix}`);
  }

  return [...new Set(queries)].slice(0, 4);
}

function classifyCandidateBucket(cand) {
  const blob = `${cand.name} ${cand.type || ""} ${cand.category || ""} ${(cand.tags || []).join(" ")}`.toLowerCase();
  const isChristmas = /\b(?:christmas|holiday|lights|dazzling|santa|nutcracker|gaylord|tree\s+stroll|tree\s+lighting|jock\s+lindsey|miracle|lantern|holly|jingle)\b/.test(blob) || cand.sourceKind === "christmas";
  const isBreakfast = /\b(?:breakfast|bakery|coffee|cafe|bagel|donut|roaster|brunch)\b/.test(blob);
  const isFood = /\b(?:restaurant|food|dining|kitchen|bistro|grill|steak|seafood|taco|pizza|ramen|sushi|bbq|tavern|eatery|bar\s+and\s+grill|fish\s+camp|cuban)\b/.test(blob) || cand.category === "food";
  const isBar = /\b(?:bar|cocktail|speakeasy|brewery|pub|lounge|popup-bar|holiday\s+bar)\b/.test(blob) && !isBreakfast;
  const isIndoor = /\b(?:museum|aquarium|gallery|science|theater|ballet|concert|bowling|arcade|indoor|mall|spa|ice!)\b/.test(blob);
  return { isChristmas, isBreakfast, isFood, isBar, isIndoor };
}

function candidateQualityScore(cand, preferences = {}) {
  let s = 0;
  if (cand.wfScore) s += cand.wfScore * 0.8;
  else if (cand.rating) s += cand.rating * 14;
  else s += 52;

  if (cand.reviews > 200) s += 6;
  const bucket = classifyCandidateBucket(cand);
  const ints = new Set(preferences.interests || []);

  if ((ints.has("christmas") || ints.has("lights")) && bucket.isChristmas) s += 30;
  if (ints.has("food") && (bucket.isFood || bucket.isBreakfast)) s += 16;
  if (ints.has("bars") && bucket.isBar) s += 14;
  if (ints.has("indoors") && bucket.isIndoor) s += 22;

  const lowFitChainOrErrand = /\b(?:dog\s+park|spavia|starbucks|mcdonald|walgreens|cvs|car\s+wash|self\s+storage|dentist|urgent\s+care|dunkin)\b/i.test(cand.name || "");
  if (lowFitChainOrErrand && !ints.has("pets")) s -= 32;

  if (preferences.budget === "free") {
    if (cand.isFree) s += 40;
    else if (cand.priceNum != null && cand.priceNum >= 2) s -= 35;
  } else if (preferences.budget === "cheap") {
    if (cand.isFree) s += 28;
    else if (cand.priceNum === 1) s += 20;
    else if (cand.priceNum === 2) s += 4;
    else if (cand.priceNum != null && cand.priceNum >= 3) s -= 35;
  }
  return s;
}

/**
 * Enriches day stops with deterministic geographic order, slot labels,
 * confidence metadata, and coordinate-derived travel relationships.
 */
export function enrichPlanDays(days, catalogMap, options = {}) {
  const preserveOrder = Boolean(options && options.preserveOrder);
  const enrichedDays = [];
  let confirmedCount = 0;
  let checkHoursCount = 0;

  for (let dIdx = 0; dIdx < days.length; dIdx += 1) {
    const dayEntry = days[dIdx];
    const dateYmd = normalizeStopDate(dayEntry.date);
    const rawStops = (dayEntry.stops || [])
      .map((s) => {
        const entity = catalogMap.get(String(s.id || s.entityId));
        if (!entity) return null;
        return {
          ...s,
          id: entity.id,
          place: entity,
        };
      })
      .filter(Boolean);

    const shouldPreserve = preserveOrder && !dayEntry.optimizeOrder;
    const ordered = shouldPreserve ? rawStops : orderDayStopsGeographically(rawStops);
    const eveningHeavy = ordered.length <= 3 && ordered.some((s) => classifyCandidateBucket(s.place).isChristmas);
    const defaultSlots = suggestedSlotLabels(ordered.length, { eveningHeavy: dIdx === 0 && eveningHeavy });

    const fixedMins = [];
    const stopTimeAssignments = new Array(ordered.length).fill(null);

    for (let i = 0; i < ordered.length; i += 1) {
      const s = ordered[i];
      const explicit = (shouldPreserve && s.slotLabel) || s.slotLabel || null;
      const fixed = explicit || s.place?.startTime || null;
      if (fixed) {
        const mins = parseClockMinutes(fixed);
        if (mins != null) {
          fixedMins.push(mins);
          stopTimeAssignments[i] = fixed;
        }
      }
    }

    const fallbackSlotCandidates = [
      "9:30 AM", "11:00 AM", "1:30 PM", "3:30 PM", "5:30 PM", "7:30 PM", "9:00 PM"
    ];
    const candidateSlots = [...defaultSlots, ...fallbackSlotCandidates];
    const assignedMins = [...fixedMins];

    for (let i = 0; i < ordered.length; i += 1) {
      if (stopTimeAssignments[i]) continue;
      const chosenSlot = candidateSlots.find((slot) => {
        const mins = parseClockMinutes(slot);
        if (mins == null) return false;
        return !assignedMins.some((m) => Math.abs(m - mins) < 60);
      }) || defaultSlots[i] || null;

      if (chosenSlot) {
        const mins = parseClockMinutes(chosenSlot);
        if (mins != null) assignedMins.push(mins);
      }
      stopTimeAssignments[i] = chosenSlot;
    }

    let finalStops = ordered.map((s, idx) => {
      const entity = s.place;
      const conf = evaluateStopConfidence(entity, dateYmd);
      if (conf.level === "confirmed") confirmedCount += 1;
      else checkHoursCount += 1;

      return {
        id: entity.id,
        name: entity.name,
        slotLabel: stopTimeAssignments[idx] || null,
        why: String(s.why || s.note || entity.take || "").trim().slice(0, 180) || null,
        price: entity.price || null, // Strict price honesty: ONLY from canonical entity
        priceKnown: entity.priceKnown,
        wfScore: entity.wfScore,
        rating: entity.rating,
        reviews: entity.reviews,
        type: entity.type,
        address: entity.address,
        city: entity.city,
        lat: entity.lat,
        lng: entity.lng,
        photo: entity.photo,
        detailHref: entity.detailHref,
        ticketUrl: entity.ticketUrl,
        ticketLabel: entity.ticketLabel,
        confidence: conf,
      };
    });

    if (!shouldPreserve) {
      const hasTimes = finalStops.some((s) => parseClockMinutes(s.slotLabel) != null);
      if (hasTimes) {
        finalStops.sort((a, b) => {
          const ma = parseClockMinutes(a.slotLabel);
          const mb = parseClockMinutes(b.slotLabel);
          if (ma != null && mb != null) return ma - mb;
          return 0;
        });
      }
    }

    for (let i = 0; i < finalStops.length; i += 1) {
      const entity = catalogMap.get(String(finalStops[i].id));
      const nextEntity = finalStops[i + 1] ? catalogMap.get(String(finalStops[i + 1].id)) : null;
      finalStops[i].travelToNext = (entity && nextEntity) ? stopTravelRelationship(entity, nextEntity) : null;
    }

    enrichedDays.push({
      date: dateYmd,
      label: dateYmd ? formatStopDate(dateYmd, { heading: true }) : `Day ${dIdx + 1}`,
      shortLabel: dateYmd ? formatStopDate(dateYmd) : `Day ${dIdx + 1}`,
      areaSummary: dayEntry.areaSummary || null,
      stops: finalStops,
    });
  }

  return {
    days: enrichedDays,
    confidenceSummary: {
      confirmedCount,
      checkHoursCount,
      totalStops: confirmedCount + checkHoursCount,
    },
  };
}

/**
 * Deterministic multi-day plan builder using real Wayfind candidates, geographic
 * clustering (to minimize cross-city driving), date/closure rules, and preference scoring.
 */
export function buildDeterministicPlan(parsed, candidates, { voice = "wayfind", seedPlace = null } = {}) {
  const catalogMap = new Map(candidates.map((c) => [String(c.id), c]));
  if (seedPlace && seedPlace.id && !catalogMap.has(String(seedPlace.id))) {
    const normSeed = normalizeGroundedCandidate(seedPlace, "seed");
    if (normSeed) {
      catalogMap.set(normSeed.id, normSeed);
      candidates = [normSeed, ...candidates];
    }
  }

  const daysList = parsed.dates && parsed.dates.days && parsed.dates.days.length > 0
    ? parsed.dates.days
    : [null];
  const city = (parsed.destination && parsed.destination.name) || "Florida";
  const state = (parsed.destination && parsed.destination.state) || "FL";
  const prefs = parsed.preferences || {};
  const ints = new Set(prefs.interests || []);
  const stopsPerDay = prefs.pace === "relaxed" ? 3 : prefs.pace === "packed" ? 4 : (daysList.length >= 4 ? 3 : 3);

  // Rank candidates by preference fit & Wayfind quality
  const scored = [...catalogMap.values()]
    .map((c) => ({ cand: c, score: candidateQualityScore(c, prefs) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.cand);

  // Cluster geographically (~9.5 km zones) so each day stays tight and avoids cross-metro driving!
  const clusters = clusterCandidatesByZone(scored, prefs.minimizeDriving ? 8 : 11);
  const usedIds = new Set();

  // If user asked to build around a seedPlace, pin it to Day 1!
  if (seedPlace && catalogMap.has(String(seedPlace.id))) {
    usedIds.add(String(seedPlace.id));
  }

  const rawDays = [];

  for (let dIdx = 0; dIdx < daysList.length; dIdx += 1) {
    const dayYmd = daysList[dIdx];
    const dayStops = [];
    const dayTimedMinutes = [];

    const collidesWithDayEvents = (cand) => {
      if (!cand || cand.itemType !== "event") return false;
      const mins = parseClockMinutes(cand.startTime);
      if (mins == null) return false;
      return dayTimedMinutes.some((m) => Math.abs(m - mins) < 60);
    };
    const recordDayEventTime = (cand) => {
      if (!cand || cand.itemType !== "event") return;
      const mins = parseClockMinutes(cand.startTime);
      if (mins != null) dayTimedMinutes.push(mins);
    };

    if (dIdx === 0 && seedPlace && catalogMap.has(String(seedPlace.id))) {
      const seedEntity = catalogMap.get(String(seedPlace.id));
      if (!dayYmd || canScheduleOnDate(seedEntity, dayYmd).allowed) {
        recordDayEventTime(seedEntity);
        dayStops.push({ id: seedEntity.id, why: "Your anchor pick to build the day around." });
      }
    }

    // Pick the best cluster with unused candidates valid on `dayYmd`
    const clusterOrder = [
      ...clusters.slice(dIdx % Math.max(1, clusters.length)),
      ...clusters.slice(0, dIdx % Math.max(1, clusters.length)),
    ];

    const availableOnDay = (pool) =>
      pool.filter((c) => !usedIds.has(c.id) && (!dayYmd || canScheduleOnDate(c, dayYmd).allowed));

    const primaryPool = clusterOrder.length > 0 ? availableOnDay(clusterOrder[0].items) : [];
    const fallbackPool = availableOnDay(scored);

    const pickOne = (predicate) => {
      const fromCluster = primaryPool.find((c) => !usedIds.has(c.id) && !collidesWithDayEvents(c) && predicate(c));
      if (fromCluster) {
        usedIds.add(fromCluster.id);
        recordDayEventTime(fromCluster);
        return fromCluster;
      }
      // Prefer nearby from fallbackPool before going far across town
      const anchor = dayStops[0] ? catalogMap.get(dayStops[0].id) : (clusterOrder[0] && clusterOrder[0].center);
      const candidatesMatching = fallbackPool.filter((c) => !usedIds.has(c.id) && !collidesWithDayEvents(c) && predicate(c));
      if (!candidatesMatching.length) return null;
      if (anchor && Number.isFinite(Number(anchor.lat)) && Number.isFinite(Number(anchor.lng))) {
        candidatesMatching.sort((a, b) => {
          const da = distanceMiles(anchor, a) ?? 20;
          const db = distanceMiles(anchor, b) ?? 20;
          return (da - db) * 2 - (candidateQualityScore(a, prefs) - candidateQualityScore(b, prefs)) * 0.25;
        });
      }
      const chosen = candidatesMatching[0];
      usedIds.add(chosen.id);
      recordDayEventTime(chosen);
      return chosen;
    };

    // 1. Morning / daytime anchor (breakfast/coffee or daytime garden/attraction)
    if (dayStops.length < stopsPerDay && dIdx > 0) {
      const morning = pickOne((c) => {
        const b = classifyCandidateBucket(c);
        return b.isBreakfast || (!b.isBar && !b.isChristmas && !b.isFood);
      });
      if (morning) {
        dayStops.push({
          id: morning.id,
          why: morning.take || "Easy morning start in the same neighborhood cluster.",
        });
      }
    }

    // 2. Signature experience / seasonal / Christmas / indoor anchor
    if (dayStops.length < stopsPerDay) {
      const feature = pickOne((c) => {
        const b = classifyCandidateBucket(c);
        if (ints.has("christmas") || ints.has("lights")) return b.isChristmas || !b.isFood;
        if (ints.has("indoors")) return b.isIndoor;
        return !b.isFood || b.isChristmas;
      }) || pickOne(() => true);
      if (feature) {
        dayStops.push({
          id: feature.id,
          why: feature.take || (classifyCandidateBucket(feature).isChristmas ? "Signature seasonal highlight." : "Standout Wayfind pick nearby."),
        });
      }
    }

    // 3. Great food / dinner / holiday bar nearby
    if (dayStops.length < stopsPerDay) {
      const dining = pickOne((c) => {
        const b = classifyCandidateBucket(c);
        return b.isFood || b.isBar;
      }) || pickOne(() => true);
      if (dining) {
        dayStops.push({
          id: dining.id,
          why: dining.take || "Grouped nearby so you are not driving across town for dinner.",
        });
      }
    }

    // Fill up to stopsPerDay if needed
    while (dayStops.length < stopsPerDay) {
      const extra = pickOne(() => true);
      if (!extra) break;
      dayStops.push({
        id: extra.id,
        why: extra.take || "Nearby stop in the same area.",
      });
    }

    if (dayStops.length > 0) {
      const citiesInDay = [...new Set(dayStops.map((s) => catalogMap.get(s.id)?.city).filter(Boolean))];
      rawDays.push({
        date: dayYmd,
        areaSummary: citiesInDay.length ? citiesInDay.slice(0, 2).join(" & ") : city,
        stops: dayStops,
      });
    }
  }

  if (rawDays.length === 0) {
    return null;
  }

  const { days: enrichedDays, confidenceSummary } = enrichPlanDays(rawDays, catalogMap);
  const hasChristmas = ints.has("christmas") || ints.has("lights");
  const title = hasChristmas
    ? `${city} Christmas ${enrichedDays.length >= 3 ? "Getaway" : "Plan"}`
    : `${city} ${enrichedDays.length >= 3 ? `${enrichedDays.length} Day Trip` : "Itinerary"}`;

  const totalStops = enrichedDays.reduce((sum, d) => sum + d.stops.length, 0);
  const reply = personaPlanReply(voice, { days: enrichedDays.length, city, stops: totalStops, seed: parsed.raw || city });

  return {
    title,
    city,
    state,
    startDate: parsed.dates.startDate || (enrichedDays[0] && enrichedDays[0].date) || null,
    endDate: parsed.dates.endDate || (enrichedDays[enrichedDays.length - 1] && enrichedDays[enrichedDays.length - 1].date) || null,
    explanation: reply,
    days: enrichedDays,
    confidenceSummary,
  };
}

/**
 * Resolves conversational edit actions deterministically against `activeTrip` + `candidates`.
 */
export function resolveDeterministicEditActions(parsed, activeTrip, candidates, { voice = "wayfind" } = {}) {
  const edit = parsed && parsed.edit;
  if (!edit || !activeTrip || !activeTrip.key) return null;

  const tripKey = activeTrip.key;
  const existingIds = new Set((activeTrip.items || []).map((it) => String(it.id)));
  const prefs = edit.preferences || parsed.preferences || {};

  if (edit.kind === "move_stop") {
    const dayLabel = formatStopDate(edit.targetDay, { heading: true }) || edit.targetDay;
    return {
      actions: [
        {
          type: PLANNER_ACTION_TYPES.ASSIGN_STOP_DATE,
          tripKey,
          stopId: edit.stopId,
          date: edit.targetDay,
        },
      ],
      reply: plannerPersona(voice).moved(edit.stopName, dayLabel),
    };
  }

  if (edit.kind === "remove_stop") {
    return {
      actions: [
        {
          type: PLANNER_ACTION_TYPES.REMOVE_STOP,
          tripKey,
          stopId: edit.stopId,
        },
      ],
      reply: plannerPersona(voice).removed(edit.stopName),
    };
  }

  if (edit.kind === "optimize_trip") {
    const dayLabel = edit.targetDay ? formatStopDate(edit.targetDay, { heading: true }) : null;
    const organizeIntoDays = /\borganize\b[\s\S]*\bdays\b/i.test(parsed.raw || "");
    return {
      actions: [
        {
          type: PLANNER_ACTION_TYPES.OPTIMIZE_DAY,
          tripKey,
          date: edit.targetDay || null,
          ...(organizeIntoDays
            ? {
                organizeIntoDays: true,
                baseDate: (parsed.dates && parsed.dates.startDate) || null,
              }
            : {}),
        },
      ],
      reply: dayLabel
        ? `Reordered ${dayLabel} geographically to cut backtracking.`
        : organizeIntoDays
        ? `Organized your saved stops into neighborhood days to cut cross-town driving.`
        : `Optimized your stop order by neighborhood to reduce driving.`,
    };
  }

  if (edit.kind === "replace_stop") {
    const oldItem = (activeTrip.items || []).find((it) => String(it.id) === String(edit.stopId));
    if (!oldItem) return null;
    const targetDay = edit.targetDay || normalizeStopDate(oldItem.day);
    // Find geographical anchor on the same day (other stops on that day, else oldItem itself)
    const sameDayOthers = sortedItems(activeTrip, { today: null })
      .filter((it) => String(it.id) !== String(edit.stopId) && normalizeStopDate(it.day) === targetDay);
    const anchor = (sameDayOthers[0] && sameDayOthers[0].place) || oldItem.place || parsed.destination;

    const oldBucket = classifyCandidateBucket(normalizeGroundedCandidate(oldItem.place || { id: oldItem.id, name: edit.stopName }) || { name: edit.stopName });

    const eligible = candidates.filter((c) => {
      if (existingIds.has(String(c.id))) return false;
      if (targetDay && !canScheduleOnDate(c, targetDay).allowed) return false;
      if (edit.cheaper && c.priceNum != null && c.priceNum >= 3) return false;
      const b = classifyCandidateBucket(c);
      if (edit.indoors && !b.isIndoor && !b.isFood) return false;
      if (oldBucket.isFood && !edit.indoors) return b.isFood || b.isBar || b.isBreakfast;
      return true;
    });

    const pool = eligible.length > 0
      ? eligible
      : candidates.filter((c) => !existingIds.has(String(c.id)) && (!targetDay || canScheduleOnDate(c, targetDay).allowed));
    if (!pool.length) return null;

    pool.sort((a, b) => {
      const distA = anchor ? (distanceMiles(anchor, a) ?? 12) : 5;
      const distB = anchor ? (distanceMiles(anchor, b) ?? 12) : 5;
      const distWeight = edit.nearby ? 5.5 : 2.0;
      const scoreA = candidateQualityScore(a, prefs) - distA * distWeight;
      const scoreB = candidateQualityScore(b, prefs) - distB * distWeight;
      return scoreB - scoreA;
    });

    const chosen = pool[0];
    const distMi = anchor ? distanceMiles(anchor, chosen) : null;
    const distPhrase = distMi != null ? ` (${distMi.toFixed(1)} mi from your other stops)` : "";
    const pricePhrase = chosen.price ? ` · ${chosen.price}` : "";

    return {
      actions: [
        {
          type: PLANNER_ACTION_TYPES.REPLACE_STOP,
          tripKey,
          stopId: edit.stopId,
          newEntityId: chosen.id,
          date: targetDay,
          note: chosen.take || "Swapped in from nearby Wayfind inventory.",
        },
      ],
      reply: `Replaced ${edit.stopName} with ${chosen.name}${distPhrase}${pricePhrase}.`,
    };
  }

  if (edit.kind === "revise_budget" || edit.kind === "revise_indoors") {
    const allItems = sortedItems(activeTrip, { today: null });
    const targetDay = edit.targetDay || normalizeStopDate(allItems[0]?.day) || null;
    const dayItems = targetDay
      ? allItems.filter((it) => normalizeStopDate(it.day) === targetDay)
      : allItems;
    if (!dayItems.length) return null;

    // Pick the stop on that day that least fits the new constraint (e.g. highest price tier or unknown/paid when making cheaper; outdoor when making indoors)
    let stopToSwap = dayItems[dayItems.length - 1];
    if (edit.kind === "revise_budget") {
      const sortedByCost = [...dayItems].sort((a, b) => {
        const pa = a.place && a.place.priceNum != null ? Number(a.place.priceNum) : 2;
        const pb = b.place && b.place.priceNum != null ? Number(b.place.priceNum) : 2;
        return pb - pa;
      });
      stopToSwap = sortedByCost[0];
    }

    const anchor = (dayItems.find((it) => it.id !== stopToSwap.id) || stopToSwap).place || parsed.destination;
    const usedNow = new Set(existingIds);

    const replacementPool = candidates.filter((c) => {
      if (usedNow.has(String(c.id))) return false;
      if (targetDay && !canScheduleOnDate(c, targetDay).allowed) return false;
      if (edit.kind === "revise_budget") {
        // Strictly prefer verified Free or $ / $$ Wayfind listings; never claim an unknown price is cheap!
        return c.isFree === true || c.priceNum === 0 || c.priceNum === 1 || c.priceNum === 2;
      }
      const b = classifyCandidateBucket(c);
      return b.isIndoor || b.isFood;
    });

    const finalPool = replacementPool.length > 0
      ? replacementPool
      : candidates.filter((c) => !usedNow.has(String(c.id)) && (!targetDay || canScheduleOnDate(c, targetDay).allowed));
    if (!finalPool.length) return null;

    finalPool.sort((a, b) => {
      const distA = anchor ? (distanceMiles(anchor, a) ?? 10) : 5;
      const distB = anchor ? (distanceMiles(anchor, b) ?? 10) : 5;
      const freeBonusA = edit.kind === "revise_budget" ? (a.isFree ? 35 : a.priceNum === 1 ? 22 : a.priceNum === 2 ? 8 : -10) : 0;
      const freeBonusB = edit.kind === "revise_budget" ? (b.isFree ? 35 : b.priceNum === 1 ? 22 : b.priceNum === 2 ? 8 : -10) : 0;
      return (candidateQualityScore(b, prefs) + freeBonusB - distB * 2) - (candidateQualityScore(a, prefs) + freeBonusA - distA * 2);
    });

    const chosen = finalPool[0];
    const oldName = (stopToSwap.place && stopToSwap.place.name) || stopToSwap.id;
    const dayLabel = targetDay ? formatStopDate(targetDay, { heading: true }) : "your trip";
    const honestPriceNote = chosen.isFree
      ? `${chosen.name} is listed as Free on Wayfind`
      : chosen.price
      ? `${chosen.name} (${chosen.price} on Wayfind)`
      : `${chosen.name} (exact admission/menu pricing is not published on Wayfind — check before going)`;

    return {
      actions: [
        {
          type: PLANNER_ACTION_TYPES.REPLACE_STOP,
          tripKey,
          stopId: stopToSwap.id,
          newEntityId: chosen.id,
          date: targetDay,
          note: chosen.isFree ? "Free option on Wayfind." : (chosen.price ? `Wayfind price tier: ${chosen.price}.` : "Check venue site for current pricing."),
        },
      ],
      reply: edit.kind === "revise_budget"
        ? `Updated ${dayLabel} to bring costs down: swapped ${oldName} for ${honestPriceNote}.`
        : `Updated ${dayLabel} with an indoor friendly option: swapped ${oldName} for ${chosen.name}.`,
    };
  }

  if (edit.kind === "add_stop") {
    const allItems = sortedItems(activeTrip, { today: null });
    const targetDay = edit.targetDay
      || normalizeStopDate(activeTrip.startDate)
      || normalizeStopDate(allItems[0]?.day)
      || null;
    const sameDayItems = targetDay ? allItems.filter((it) => normalizeStopDate(it.day) === targetDay) : allItems;
    const anchor = (sameDayItems[0] && sameDayItems[0].place) || parsed.destination;

    const eligible = candidates.filter((c) => {
      if (existingIds.has(String(c.id))) return false;
      if (targetDay && !canScheduleOnDate(c, targetDay).allowed) return false;
      const b = classifyCandidateBucket(c);
      if (edit.slotRole === "breakfast") return b.isBreakfast || b.isFood;
      if (edit.slotRole === "brunch" || edit.slotRole === "lunch" || edit.slotRole === "dinner") return b.isFood;
      if (edit.slotRole === "drinks") return b.isBar || b.isFood;
      if (edit.slotRole === "indoors") return b.isIndoor;
      return true;
    });

    const indoorFallback = edit.slotRole === "indoors" && eligible.length === 0
      ? candidates.filter((c) => {
          if (existingIds.has(String(c.id))) return false;
          if (targetDay && !canScheduleOnDate(c, targetDay).allowed) return false;
          const b = classifyCandidateBucket(c);
          return b.isIndoor || b.isFood;
        })
      : [];

    const pool = eligible.length > 0
      ? eligible
      : indoorFallback.length > 0
      ? indoorFallback
      : candidates.filter((c) => !existingIds.has(String(c.id)) && (!targetDay || canScheduleOnDate(c, targetDay).allowed));
    if (!pool.length) return null;

    pool.sort((a, b) => {
      const distA = anchor ? (distanceMiles(anchor, a) ?? 10) : 5;
      const distB = anchor ? (distanceMiles(anchor, b) ?? 10) : 5;
      return (candidateQualityScore(b, prefs) - distB * 3) - (candidateQualityScore(a, prefs) - distA * 3);
    });

    const chosen = pool[0];
    const slotLabel = edit.slotRole === "breakfast" ? "9:00 AM"
      : edit.slotRole === "brunch" ? "11:00 AM"
      : edit.slotRole === "lunch" ? "12:30 PM"
      : edit.slotRole === "dinner" ? "7:30 PM"
      : edit.slotRole === "drinks" ? "8:30 PM"
      : null;
    const dayLabel = targetDay ? formatStopDate(targetDay, { heading: true }) : "your trip";

    return {
      actions: [
        {
          type: PLANNER_ACTION_TYPES.ADD_STOP,
          tripKey,
          entityId: chosen.id,
          date: targetDay,
          slotLabel,
          note: chosen.take || "",
        },
      ],
      reply: `Added ${chosen.name} to ${dayLabel}${chosen.price ? ` (${chosen.price})` : ""}.`,
    };
  }

  return null;
}

/**
 * Builds the compact grounded system + user prompt for Claude (`paidAnthropicRequest`).
 * Supports `voice: "santa" | "wayfind"` without forking schema or validation.
 */
export function buildPlannerClaudePrompt(parsed, candidates, { activeTrip = null, voice = "wayfind" } = {}) {
  const tripDays = (parsed.dates && Array.isArray(parsed.dates.days)) ? parsed.dates.days : [];
  const prefs = (parsed && parsed.preferences) || {};
  const rankedCandidates = [...candidates]
    .map((c) => {
      const validDays = tripDays.length > 0
        ? tripDays.filter((d) => canScheduleOnDate(c, d).allowed)
        : null;
      return { c, validDays, q: candidateQualityScore(c, prefs) };
    })
    .filter((entry) => !entry.validDays || entry.validDays.length > 0)
    .sort((a, b) => b.q - a.q);

  const topCandidates = rankedCandidates.slice(0, 32).map(({ c, validDays }) => ({
    id: c.id,
    name: c.name,
    kind: c.itemType,
    city: c.city,
    type: c.type,
    price: c.price || "unknown",
    score: c.wfScore || c.rating || null,
    lat: c.lat != null ? Number(c.lat.toFixed(3)) : null,
    lng: c.lng != null ? Number(c.lng.toFixed(3)) : null,
    validDays,
    startTime: c.startTime || null,
    hook: c.take ? c.take.slice(0, 80) : null,
  }));

  // Witty, in-character voice of the seasonal host (lib/plannerPersona.js).
  const voiceRule = personaVoiceRule(voice);

  const isEditMode = Boolean(parsed.edit && activeTrip && activeTrip.key);

  const system = [
    "You are Wayfind Planner, a grounded Florida & Hawaii trip-planning engine.",
    "STRICT GROUNDING RULES:",
    "1. You may ONLY select entity IDs that appear verbatim in CANDIDATES (or existing STOP_IDS when moving/removing).",
    "2. NEVER invent places, events, IDs, prices, opening hours, ticket availability, or exact travel minutes.",
    "3. If a candidate's price is 'unknown', NEVER claim a dollar price or call it free.",
    "4. Group each day's stops in the same city/lat-lng cluster so the visitor avoids cross-town driving.",
    "5. Schedule each stop ONLY on a date listed in its `validDays` (when provided), never repeat the same candidate `id` across the trip, and space timed slots on the same day at least 90 minutes apart (2 to 3 stops per day).",
    voiceRule,
    isEditMode
      ? 'Return ONLY valid JSON matching: {"reply":"string","actions":[{"type":"ASSIGN_STOP_DATE|REPLACE_STOP|ADD_STOP|REMOVE_STOP|OPTIMIZE_DAY","stopId":"optional","newEntityId":"optional","entityId":"optional","date":"YYYY-MM-DD or null","note":"short reason"}]}'
      : 'Return ONLY valid JSON matching: {"title":"string","reply":"string","days":[{"date":"YYYY-MM-DD","areaSummary":"string","stops":[{"id":"exact_candidate_id","slotLabel":"4:00 PM","why":"short 1-line reason"}]}]}',
  ].join("\n");

  const payload = {
    request: parsed.raw,
    destination: parsed.destination ? { name: parsed.destination.name, state: parsed.destination.state } : null,
    plannedDays: parsed.dates.days,
    preferences: parsed.preferences,
    ...(isEditMode
      ? {
          activeTrip: {
            tripKey: activeTrip.key,
            title: activeTrip.title,
            startDate: activeTrip.startDate,
            endDate: activeTrip.endDate,
            stops: sortedItems(activeTrip, { today: null }).map((it) => ({
              stopId: it.id,
              name: it.place && it.place.name,
              day: it.day,
              price: it.place && it.place.price,
            })),
          },
        }
      : {}),
    CANDIDATES: topCandidates,
  };

  return {
    system,
    user: JSON.stringify(payload),
  };
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validates a raw Claude text response for a newly generated multi-day plan.
 * Returns `{ ok: true, plan }` ONLY when every stop ID is grounded and valid on its date;
 * otherwise returns `{ ok: false, code, rejectedIds }` so no hallucinated stop ever slips through.
 */
export function parseAndValidateClaudePlan(rawModelText, parsed, candidates) {
  const obj = extractJsonObject(rawModelText);
  if (!obj || !Array.isArray(obj.days) || obj.days.length === 0) {
    return { ok: false, code: "INVALID_MODEL_JSON", rejectedIds: [] };
  }
  const catalogMap = new Map(candidates.map((c) => [String(c.id), c]));
  const candidatePlan = {
    title: String(obj.title || `${parsed.destination?.name || "Florida"} Trip`).trim().slice(0, 140),
    city: parsed.destination?.name || "Orlando",
    state: parsed.destination?.state || "FL",
    startDate: parsed.dates.startDate || normalizeStopDate(obj.days[0]?.date) || null,
    endDate: parsed.dates.endDate || normalizeStopDate(obj.days[obj.days.length - 1]?.date) || null,
    days: obj.days,
  };

  const validation = validateProposedPlan(candidatePlan, catalogMap);
  if (!validation.ok) {
    return validation;
  }

  const { days: enrichedDays, confidenceSummary } = enrichPlanDays(obj.days, catalogMap);
  return {
    ok: true,
    plan: {
      ...candidatePlan,
      explanation: stripDashes(String(obj.reply || "").trim()).slice(0, 360),
      days: enrichedDays,
      confidenceSummary,
    },
  };
}

/**
 * Validates raw Claude edit actions against `activeTrip` and `candidates`.
 */
export function parseAndValidateClaudeEdit(rawModelText, activeTrip, candidates) {
  const obj = extractJsonObject(rawModelText);
  if (!obj || !Array.isArray(obj.actions) || obj.actions.length === 0) {
    return { ok: false, code: "INVALID_MODEL_JSON", rejectedIds: [] };
  }
  const catalogMap = new Map(candidates.map((c) => [String(c.id), c]));
  const rejectedIds = [];
  const normalizedActions = [];

  for (const act of obj.actions) {
    if (!act || typeof act !== "object") continue;
    const type = String(act.type || "");
    if (type === PLANNER_ACTION_TYPES.ADD_STOP) {
      const eid = String(act.entityId || act.id || "");
      if (!catalogMap.has(eid)) {
        rejectedIds.push(eid || "unknown");
        continue;
      }
    } else if (type === PLANNER_ACTION_TYPES.REPLACE_STOP) {
      const nid = String(act.newEntityId || act.entityId || "");
      if (!catalogMap.has(nid)) {
        rejectedIds.push(nid || "unknown");
        continue;
      }
    }
    normalizedActions.push({
      ...act,
      tripKey: activeTrip.key,
    });
  }

  if (rejectedIds.length > 0) {
    return { ok: false, code: "UNGROUNDED_ENTITY_ID", rejectedIds };
  }
  if (!normalizedActions.length) {
    return { ok: false, code: "NO_VALID_ACTIONS", rejectedIds: [] };
  }

  return {
    ok: true,
    reply: String(obj.reply || "Updated your itinerary.").trim().slice(0, 320),
    actions: normalizedActions,
  };
}

function escapeRegex(str) {
  return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatClockMinutes(mins) {
  let m = mins % (24 * 60);
  if (m < 0) m += 24 * 60;
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const minStr = String(min).padStart(2, "0");
  return `${h12}:${minStr} ${suffix}`;
}

export function candidateMatchesCategory(cand, category) {
  if (!category || !cand) return false;
  const cat = String(category).toLowerCase().trim();
  const blob = `${cand.name} ${cand.type || ""} ${cand.category || ""} ${(cand.tags || []).join(" ")}`.toLowerCase();

  if (cat === "coffee" || cat === "coffee shop" || cat === "cafe" || cat === "bakery" || cat === "bakery cafe") {
    return /\b(?:coffee|cafe|roaster|bakery|espresso)\b/.test(blob);
  }
  if (cat === "breakfast") {
    return /\b(?:breakfast|brunch|bagel|pancake|bakery|donut)\b/.test(blob);
  }
  if (cat === "sushi" || cat === "japanese") {
    return /\b(?:sushi|japanese|ramen|izakaya|omakase)\b/.test(blob);
  }
  if (cat === "tacos" || cat === "taco" || cat === "mexican") {
    return /\b(?:taco|tacos|mexican|taqueria|cantina)\b/.test(blob);
  }
  if (cat === "seafood") {
    return /\b(?:seafood|fish|oyster|crab|shrimp|fish\s+camp)\b/.test(blob);
  }
  if (cat === "bar" || cat === "cocktails" || cat === "drinks") {
    return classifyCandidateBucket(cand).isBar;
  }
  if (cat === "indoor" || cat === "indoors" || cat === "museum") {
    return classifyCandidateBucket(cand).isIndoor;
  }
  if (cat === "park" || cat === "gardens" || cat === "nature") {
    return /\b(?:park|garden|botanical|nature|trail|arboretum|preserve)\b/.test(blob);
  }
  if (cat === "cheap") {
    return cand.isFree === true || cand.priceNum === 0 || cand.priceNum === 1;
  }
  if (cat === "romantic") {
    const isQuality = (cand.wfScore != null && cand.wfScore >= 75) || (cand.rating != null && cand.rating >= 4.4) || cand.sourceKind === "atlas_places";
    const notKidChain = !/\b(?:chuck\s+e|mcdonald|dunkin|family|arcade|bowling|kid|pizza\s+hut|burger\s+king)\b/i.test(blob);
    const isRomanticVenue = /\b(?:bistro|wine|cocktail|steak|seafood|fine\s+dining|garden|scenic|waterfront|lounge|rooftop)\b/i.test(blob);
    return isQuality && notKidChain && (isRomanticVenue || cand.category === "food");
  }
  return blob.includes(cat);
}

/**
 * Sanitizes raw conversation history to at most 4 safe messages (2 turns).
 */
export function sanitizeConversationHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  const out = [];
  for (const item of rawHistory) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "user" || item.role === "assistant" ? item.role : null;
    if (!role) continue;
    const rawText = typeof item.text === "string" ? item.text : (typeof item.content === "string" ? item.content : "");
    const cleaned = rawText
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    if (!cleaned) continue;
    out.push({ role, text: cleaned });
  }
  return out.slice(-4);
}

/**
 * Strips all untrusted client place fields from a proposed draft plan.
 */
export function sanitizeProposedPlanDraft(rawDraft) {
  if (!rawDraft || typeof rawDraft !== "object" || !Array.isArray(rawDraft.days) || rawDraft.days.length === 0) {
    return null;
  }
  const title = typeof rawDraft.title === "string" ? rawDraft.title.trim().slice(0, 140) : null;
  const city = typeof rawDraft.city === "string" ? rawDraft.city.trim().slice(0, 80) : null;
  const state = typeof rawDraft.state === "string" ? rawDraft.state.trim().slice(0, 8) : "FL";
  const startDate = typeof rawDraft.startDate === "string" ? rawDraft.startDate.trim().slice(0, 12) : null;
  const endDate = typeof rawDraft.endDate === "string" ? rawDraft.endDate.trim().slice(0, 12) : null;
  const explanation = typeof rawDraft.explanation === "string"
    ? rawDraft.explanation.trim().slice(0, 360)
    : (typeof rawDraft.reply === "string" ? rawDraft.reply.trim().slice(0, 360) : null);

  const days = rawDraft.days.slice(0, 10).map((d) => {
    if (!d || typeof d !== "object") return { date: null, areaSummary: null, stops: [] };
    const date = typeof d.date === "string" ? d.date.trim().slice(0, 12) : null;
    const areaSummary = typeof d.areaSummary === "string" ? d.areaSummary.trim().slice(0, 120) : null;
    const rawStops = Array.isArray(d.stops) ? d.stops.slice(0, 8) : [];
    const stops = rawStops.map((s) => {
      if (!s || typeof s !== "object") return null;
      const rawId = s.id || s.entityId || s.place_id || s.placeId;
      if (!rawId) return null;
      const id = String(rawId).trim();
      const slotLabel = typeof s.slotLabel === "string"
        ? s.slotLabel.trim().slice(0, 32)
        : (typeof s.time === "string" ? s.time.trim().slice(0, 32) : null);
      const why = typeof s.why === "string"
        ? s.why.trim().slice(0, 200)
        : (typeof s.note === "string" ? s.note.trim().slice(0, 200) : null);
      return {
        id,
        slotLabel: slotLabel || null,
        why: why || null,
      };
    }).filter(Boolean);

    return {
      date,
      areaSummary,
      stops,
    };
  });

  return {
    title,
    city,
    state,
    startDate,
    endDate,
    explanation,
    days,
  };
}

/**
 * Strictly revalidates an untrusted proposed itinerary draft against canonical inventory.
 */
export function revalidateProposedDraft(rawDraft, catalogOrCandidates, { destination = null, maxRadiusKm = 58 } = {}) {
  const sanitized = sanitizeProposedPlanDraft(rawDraft);
  if (!sanitized) {
    return { ok: false, code: "INVALID_PLAN_SHAPE", rejectedIds: [], errors: ["Missing or invalid proposedPlan."] };
  }

  if (sanitized.startDate && !normalizeStopDate(sanitized.startDate)) {
    return { ok: false, code: "INVALID_DATE_FORMAT", rejectedIds: [], errors: ["Invalid date format."] };
  }
  if (sanitized.endDate && !normalizeStopDate(sanitized.endDate)) {
    return { ok: false, code: "INVALID_DATE_FORMAT", rejectedIds: [], errors: ["Invalid date format."] };
  }
  for (const day of sanitized.days) {
    if (day.date && !normalizeStopDate(day.date)) {
      return { ok: false, code: "INVALID_DATE_FORMAT", rejectedIds: [], errors: ["Invalid date format."] };
    }
  }

  const catalogMap = new Map();
  if (catalogOrCandidates instanceof Map) {
    for (const [k, v] of catalogOrCandidates.entries()) {
      if (!v) continue;
      const ent = (v.priceKnown !== undefined && v.wfScore !== undefined) ? v : normalizeGroundedCandidate(v);
      if (ent) catalogMap.set(String(k), ent);
    }
  } else if (Array.isArray(catalogOrCandidates)) {
    for (const v of catalogOrCandidates) {
      if (!v) continue;
      const ent = (v.priceKnown !== undefined && v.wfScore !== undefined) ? v : normalizeGroundedCandidate(v);
      if (ent) catalogMap.set(String(ent.id), ent);
    }
  } else if (catalogOrCandidates && typeof catalogOrCandidates === "object") {
    for (const [k, v] of Object.entries(catalogOrCandidates)) {
      if (!v) continue;
      const ent = (v.priceKnown !== undefined && v.wfScore !== undefined) ? v : normalizeGroundedCandidate(v);
      if (ent) catalogMap.set(String(k), ent);
    }
  }

  const rejectedIds = [];
  for (const day of sanitized.days) {
    for (const stop of day.stops) {
      if (!catalogMap.has(String(stop.id))) {
        rejectedIds.push(String(stop.id));
      }
    }
  }
  if (rejectedIds.length > 0) {
    return {
      ok: false,
      code: "UNGROUNDED_ENTITY_ID",
      rejectedIds,
      errors: [`Stops not found in grounded inventory: ${rejectedIds.join(", ")}`],
    };
  }

  if (destination) {
    for (const day of sanitized.days) {
      for (const stop of day.stops) {
        const entity = catalogMap.get(String(stop.id));
        if (!isEntityInDestinationMetro(entity, destination, maxRadiusKm)) {
          return {
            ok: false,
            code: "WRONG_CITY_ENTITY",
            rejectedIds: [String(entity.id)],
            errors: [`Entity ${entity.name || entity.id} is outside ${destination.name || "the target"} destination metro.`],
          };
        }
      }
    }
  }

  const baseValidation = validateProposedPlan(sanitized, catalogMap);
  if (!baseValidation.ok) {
    return baseValidation;
  }

  for (const day of sanitized.days) {
    const dayTimed = [];
    for (const stop of day.stops) {
      const entity = catalogMap.get(String(stop.id));
      const rawTime = stop.slotLabel || entity.startTime || null;
      const mins = parseClockMinutes(rawTime);
      if (mins != null) {
        const conflict = dayTimed.find((prev) => Math.abs(prev.minutes - mins) < 60);
        if (conflict) {
          return {
            ok: false,
            code: "OVERLAPPING_TIMED_EVENTS",
            rejectedIds: [],
            errors: ["Stops on the same day have overlapping times (<60 min apart)."],
          };
        }
        dayTimed.push({ id: stop.id, minutes: mins });
      }
    }
  }

  const { days: enrichedDays, confidenceSummary } = enrichPlanDays(sanitized.days, catalogMap, { preserveOrder: true });

  const resolvedStartDate = sanitized.startDate || (enrichedDays[0] && enrichedDays[0].date) || null;
  const resolvedEndDate = sanitized.endDate || (enrichedDays[enrichedDays.length - 1] && enrichedDays[enrichedDays.length - 1].date) || null;

  return {
    ok: true,
    draft: {
      title: sanitized.title || (destination?.name ? `${destination.name} Trip` : "Florida Trip"),
      city: sanitized.city || destination?.name || "Orlando",
      state: sanitized.state || destination?.state || "FL",
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
      explanation: sanitized.explanation || null,
      days: enrichedDays,
      confidenceSummary,
    },
  };
}

/**
 * Parses user revision requests against a validated draft plan and recent conversation context.
 */
export function parseDraftRevisionIntent(message, validatedDraft, conversationHistory = [], options = {}) {
  const rawMsg = String(message || "").trim();

  const undoRx = /^\s*(?:actually\s+)?undo(?:\s+(?:that|it|the\s+last\s+(?:change|edit|revision)))?[.!?\s]*$/i;
  if (undoRx.test(rawMsg)) {
    return { kind: "undo", rawMessage: rawMsg };
  }

  const history = sanitizeConversationHistory(conversationHistory);

  const KNOWN_AREAS = [
    "Winter Park",
    "Disney Springs",
    "Lake Buena Vista",
    "Kissimmee",
    "International Drive",
    "downtown",
    "Universal",
    "Ybor City",
    "South Beach",
    "Brickell",
    "Wynwood",
    "Hyde Park",
  ];
  let carriedHotelArea = null;
  const hotelRx = /(?:staying\s+(?:at|in)|hotel\s+(?:at|in|is\s+in)?|near)\s+([A-Za-z0-9\s'-]+?)(?=[,.]|$|\b(?:for|with|and|on|at|during|from|until)\b)/i;
  const msgHotelMatch = hotelRx.exec(rawMsg);
  if (msgHotelMatch && msgHotelMatch[1]) {
    carriedHotelArea = msgHotelMatch[1].trim();
  } else {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const hMatch = hotelRx.exec(history[i].text);
      if (hMatch && hMatch[1]) {
        carriedHotelArea = hMatch[1].trim();
        break;
      }
    }
  }
  if (!carriedHotelArea) {
    for (const ka of KNOWN_AREAS) {
      if (new RegExp(`\\b${ka}\\b`, "i").test(rawMsg)) {
        carriedHotelArea = ka;
        break;
      }
    }
  }
  if (!carriedHotelArea) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      for (const ka of KNOWN_AREAS) {
        if (new RegExp(`\\b${ka}\\b`, "i").test(history[i].text)) {
          carriedHotelArea = ka;
          break;
        }
      }
      if (carriedHotelArea) break;
    }
  }
  if (carriedHotelArea) {
    const knownMatch = KNOWN_AREAS.find((ka) => new RegExp(`\\b${ka}\\b`, "i").test(carriedHotelArea));
    if (knownMatch) carriedHotelArea = knownMatch;
  }

  const dateToWeekday = new Map();
  const weekdayToDate = new Map();
  const draftDates = (validatedDraft && Array.isArray(validatedDraft.days))
    ? validatedDraft.days.map((d) => d && d.date).filter(Boolean)
    : [];

  (validatedDraft?.days || []).forEach((d) => {
    if (!d || !d.date) return;
    const dt = new Date(d.date + "T00:00:00Z");
    if (!Number.isNaN(dt.getTime())) {
      const wd = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][dt.getUTCDay()];
      dateToWeekday.set(d.date, wd);
      weekdayToDate.set(wd, d.date);
    }
  });

  const lockedDates = new Set();
  const lockedStopIds = new Set();
  const keepIdentityIds = new Set();
  let lockedIndices = null;
  let lockedIndicesDate = null;

  const firstStopsRx = /(?:keep|leave)\s+(?:the\s+)?first\s+(two|three|\d+)\s+stops?(?:\s+(?:on|for)\s+([a-z]+day))?/i;
  const firstStopsMatch = firstStopsRx.exec(rawMsg);
  if (firstStopsMatch) {
    const count = firstStopsMatch[1].toLowerCase() === "two" ? 2 : firstStopsMatch[1].toLowerCase() === "three" ? 3 : parseInt(firstStopsMatch[1], 10) || 2;
    const dayWord = (firstStopsMatch[2] || "").toLowerCase();
    const dayDate = weekdayToDate.get(dayWord) || draftDates[0];
    const dayObj = (validatedDraft.days || []).find((d) => d.date === dayDate);
    if (dayObj && Array.isArray(dayObj.stops)) {
      lockedIndices = [];
      lockedIndicesDate = dayDate;
      for (let i = 0; i < Math.min(count, dayObj.stops.length); i += 1) {
        lockedStopIds.add(String(dayObj.stops[i].id));
        lockedIndices.push(i);
      }
    }
  }

  const withoutChangingRx = /(?:without\s+(?:changing|removing))\s+([a-z]+day)(?:'s)?/gi;
  let wcMatch;
  while ((wcMatch = withoutChangingRx.exec(rawMsg)) !== null) {
    const wd = wcMatch[1].toLowerCase();
    const d = weekdayToDate.get(wd);
    if (d) lockedDates.add(d);
  }

  const keepDayRx = /(?:keep|leave|preserve)\s+([a-z]+day)(?:'s)?(?:\s+(?:as\s+is|alone|intact|exactly\s+as\s+it\s+is))?/gi;
  let kdMatch;
  while ((kdMatch = keepDayRx.exec(rawMsg)) !== null) {
    const wd = kdMatch[1].toLowerCase();
    const d = weekdayToDate.get(wd);
    const tail = rawMsg.slice(kdMatch.index + kdMatch[0].length);
    const isStopKeep = /^\s+(?:dinner|lunch|breakfast|morning|afternoon|evening|stop)\b/i.test(tail);
    if (!isStopKeep) {
      const modifiesSameDay = /^\s+but\s+(?:move|change|make|shift|retime)\b/i.test(tail) &&
        !new RegExp(`\\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\\b`, "i").test(tail);
      if (!modifiesSameDay && d) {
        lockedDates.add(d);
      }
    }
  }

  const keepIdentityRx = /keep\s+([^,]+?)\s+but\s+(?:move|change|make|shift|retime)/i;
  const kiMatch = keepIdentityRx.exec(rawMsg);
  if (kiMatch) {
    const targetPhrase = kiMatch[1].trim();
    for (const d of (validatedDraft?.days || [])) {
      for (const s of (d.stops || [])) {
        const wd = dateToWeekday.get(d.date) || "";
        const isDinner = s.slotLabel && parseClockMinutes(s.slotLabel) >= 16 * 60;
        if (targetPhrase.toLowerCase().includes(s.name.toLowerCase())
          || (targetPhrase.toLowerCase().includes("dinner") && targetPhrase.toLowerCase().includes(wd) && isDinner)
          || (targetPhrase.toLowerCase() === "dinner" && isDinner)
        ) {
          keepIdentityIds.add(String(s.id));
        }
      }
    }
  }

  for (const d of (validatedDraft?.days || [])) {
    for (const s of (d.stops || [])) {
      if (s.name && s.name.length >= 4) {
        const stopNameRx = new RegExp(`\\bkeep\\s+${escapeRegex(s.name)}\\b(?!\\s+but\\s+)`, "i");
        if (stopNameRx.test(rawMsg)) {
          lockedStopIds.add(String(s.id));
        }
      }
    }
  }

  let targetDate = null;
  let targetStopId = null;

  const weekdayMatches = [];
  const wdPattern = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi;
  let wdMatch;
  while ((wdMatch = wdPattern.exec(rawMsg)) !== null) {
    weekdayMatches.push(wdMatch[1].toLowerCase());
  }

  if (weekdayMatches.length > 0) {
    const nonLocked = weekdayMatches.filter((w) => {
      const d = weekdayToDate.get(w);
      if (!d) return false;
      if (lockedDates.has(d)) return false;
      if (lockedIndicesDate && lockedIndicesDate === d && weekdayMatches.length > 1) return false;
      return true;
    });
    if (nonLocked.length > 0) {
      targetDate = weekdayToDate.get(nonLocked[0]) || null;
    } else if (keepIdentityIds.size > 0 && weekdayMatches.length === 1) {
      targetDate = weekdayToDate.get(weekdayMatches[0]) || null;
    } else {
      targetDate = weekdayToDate.get(weekdayMatches[0]) || null;
    }
  }

  if (!targetDate) {
    const isoMatch = /\b\d{4}-\d{2}-\d{2}\b/.exec(rawMsg);
    if (isoMatch && draftDates.includes(isoMatch[0])) {
      targetDate = isoMatch[0];
    }
  }

  if (!targetDate) {
    const monthDayMatch = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i.exec(rawMsg);
    if (monthDayMatch) {
      const dayNum = String(parseInt(monthDayMatch[1], 10)).padStart(2, "0");
      const matchedDate = draftDates.find((d) => d.endsWith(`-${dayNum}`));
      if (matchedDate) targetDate = matchedDate;
    }
  }

  if (!targetDate) {
    const ordMatch = /\b(?:day\s+(\d+)|first\s+day|second\s+day|third\s+day|last\s+day)\b/i.exec(rawMsg);
    if (ordMatch) {
      const ordStr = ordMatch[0].toLowerCase();
      if (ordStr.includes("first")) targetDate = draftDates[0];
      else if (ordStr.includes("second")) targetDate = draftDates[1] || draftDates[0];
      else if (ordStr.includes("third")) targetDate = draftDates[2] || draftDates[0];
      else if (ordStr.includes("last")) targetDate = draftDates[draftDates.length - 1];
      else if (ordMatch[1]) {
        const idx = parseInt(ordMatch[1], 10) - 1;
        targetDate = draftDates[idx] || null;
      }
    }
  }

  for (const d of (validatedDraft?.days || [])) {
    for (const s of (d.stops || [])) {
      if (s.name && s.name.length >= 4) {
        if (new RegExp(`\\b${escapeRegex(s.name)}\\b`, "i").test(rawMsg)) {
          targetStopId = String(s.id);
          if (!targetDate) targetDate = d.date;
          break;
        }
      }
    }
    if (targetStopId) break;
  }

  if (!targetDate && validatedDraft?.days?.length === 1) {
    targetDate = validatedDraft.days[0].date;
  }

  if (!targetDate && /\b(that|it|that\s+day|move\s+it\s+earlier|make\s+it\s+earlier|closer\s+to\s+our\s+hotel|near\s+our\s+hotel)\b/i.test(rawMsg)) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const prevText = history[i].text;
      for (const wd of WEEKDAYS) {
        if (new RegExp(`\\b${wd}\\b`, "i").test(prevText)) {
          const d = weekdayToDate.get(wd);
          if (d) {
            targetDate = d;
            break;
          }
        }
      }
      if (targetDate) break;
      for (const d of (validatedDraft?.days || [])) {
        for (const s of (d.stops || [])) {
          if (s.name && s.name.length >= 4 && new RegExp(`\\b${escapeRegex(s.name)}\\b`, "i").test(prevText)) {
            targetStopId = String(s.id);
            targetDate = d.date;
            break;
          }
        }
        if (targetDate) break;
      }
      if (targetDate) break;
    }
  }

  let slotRole = null;
  if (/\b(?:dinner|evening|supper)\b/i.test(rawMsg)) slotRole = "dinner";
  else if (/\b(?:lunch|afternoon)\b/i.test(rawMsg)) slotRole = "afternoon";
  else if (/\b(?:breakfast|morning|coffee)\b/i.test(rawMsg)) slotRole = "breakfast";
  else if (/\bfirst\s+stop\b/i.test(rawMsg)) slotRole = "first";
  else if (/\bsecond\s+stop\b/i.test(rawMsg)) slotRole = "second";
  else if (/\bthird\s+stop\b/i.test(rawMsg)) slotRole = "third";
  else if (/\blast\s+stop\b/i.test(rawMsg)) slotRole = "last";

  if (targetDate && !targetStopId) {
    const targetDay = (validatedDraft?.days || []).find((d) => d.date === targetDate);
    if (targetDay && targetDay.stops?.length > 0) {
      if (slotRole === "dinner") {
        const eveningStops = targetDay.stops.filter((s) => {
          const m = parseClockMinutes(s.slotLabel);
          return m != null && m >= 16 * 60;
        });
        if (eveningStops.length > 0) {
          eveningStops.sort((a, b) => {
            const ma = parseClockMinutes(a.slotLabel);
            const mb = parseClockMinutes(b.slotLabel);
            return Math.abs(ma - 19 * 60) - Math.abs(mb - 19 * 60);
          });
          targetStopId = eveningStops[0].id;
        } else {
          targetStopId = targetDay.stops[targetDay.stops.length - 1].id;
        }
      } else if (slotRole === "afternoon") {
        const cand = targetDay.stops.find((s) => {
          const m = parseClockMinutes(s.slotLabel);
          return m != null && m >= 11 * 60 + 30 && m <= 16 * 60 + 30;
        }) || (targetDay.stops.length > 2 ? targetDay.stops[1] : targetDay.stops[0]);
        targetStopId = cand.id;
      } else if (slotRole === "breakfast") {
        const cand = targetDay.stops.find((s) => {
          const m = parseClockMinutes(s.slotLabel);
          return m != null && m < 11 * 60 + 30;
        }) || targetDay.stops[0];
        targetStopId = cand.id;
      } else if (slotRole === "first") {
        targetStopId = targetDay.stops[0]?.id;
      } else if (slotRole === "second") {
        targetStopId = targetDay.stops[1]?.id;
      } else if (slotRole === "third") {
        targetStopId = targetDay.stops[2]?.id;
      } else if (slotRole === "last") {
        targetStopId = targetDay.stops[targetDay.stops.length - 1]?.id;
      }
    }
  }

  // Ambiguity check
  if (!targetDate && (validatedDraft?.days || []).length > 1) {
    const isRetime = /\b(?:move|retime|change|shift|push)\b[\s\S]*\b(?:to\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|earlier|later)\b/i.test(rawMsg);
    const isSwap = /\b(?:swap|replace|change|switch)\b/i.test(rawMsg);
    if (isRetime || isSwap || slotRole) {
      const dayNames = (validatedDraft.days || []).map((d, i) => {
        const wd = dateToWeekday.get(d.date);
        if (wd) return wd.charAt(0).toUpperCase() + wd.slice(1);
        return `Day ${i + 1}`;
      });
      let daysListStr = "";
      if (dayNames.length === 2) daysListStr = `${dayNames[0]} or ${dayNames[1]}`;
      else if (dayNames.length > 2) daysListStr = `${dayNames.slice(0, -1).join(", ")}, or ${dayNames[dayNames.length - 1]}`;
      else daysListStr = dayNames[0] || "that day";

      let clarificationQuestion = "";
      const timeMatch = /\b(?:(?:to|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)|(\d{1,2}:\d{2}\s*(?:am|pm)?)|(\d{1,2}\s*(?:am|pm)))\b/i.exec(rawMsg);
      let timeStr = null;
      if (timeMatch) {
        const rawTimeStr = timeMatch[1] || timeMatch[2] || timeMatch[3];
        const mins = parseClockMinutes(rawTimeStr);
        timeStr = mins != null ? formatClockMinutes(mins) : rawTimeStr.toUpperCase();
      }

      if (slotRole === "dinner" && timeStr) {
        clarificationQuestion = `Which day's dinner would you like moved to ${timeStr} — ${daysListStr}?`;
      } else if (slotRole === "dinner") {
        clarificationQuestion = `Which day's dinner would you like changed — ${daysListStr}?`;
      } else if (slotRole === "afternoon" && /\bcoffee\b/i.test(rawMsg)) {
        clarificationQuestion = `Which day's afternoon stop would you like swapped for coffee — ${daysListStr}?`;
      } else if (slotRole === "afternoon") {
        clarificationQuestion = `Which day's afternoon stop would you like to update — ${daysListStr}?`;
      } else {
        clarificationQuestion = `Which day's stop would you like to update — ${daysListStr}?`;
      }

      return { kind: "ambiguous", clarificationQuestion, rawMessage: rawMsg };
    }
  }

  // Classification 1: retime_stop
  const retimeRx = /\b(?:move|retime|change|shift|push)\b[\s\S]*\b(?:to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)|earlier|later)\b/i;
  const keepRetimeRx = /\bkeep\b[\s\S]*\bbut\s+move\s+it\s+(?:earlier|later|to\s+([\d:]+\s*(?:am|pm)?))\b/i;
  const earlierLaterRx = /\b(?:move|make|push|shift)\s+it\s+(earlier|later)\b/i;

  const retimeMatch = retimeRx.exec(rawMsg) || keepRetimeRx.exec(rawMsg) || earlierLaterRx.exec(rawMsg);
  if (retimeMatch) {
    let newSlotLabel = null;
    const explicitTime = retimeMatch[1] || retimeMatch[2];
    if (explicitTime && /\d/.test(explicitTime)) {
      const mins = parseClockMinutes(explicitTime);
      newSlotLabel = mins != null ? formatClockMinutes(mins) : explicitTime.trim();
    } else {
      const isEarlier = /\bearlier\b/i.test(rawMsg);
      let currentMins = null;
      if (targetDate && targetStopId) {
        const targetDay = (validatedDraft?.days || []).find((d) => d.date === targetDate);
        const st = targetDay?.stops?.find((s) => s.id === targetStopId);
        currentMins = st ? parseClockMinutes(st.slotLabel) : null;
      }
      if (currentMins == null) currentMins = 19 * 60;
      const shifted = isEarlier ? Math.max(8 * 60, currentMins - 90) : Math.min(22 * 60, currentMins + 90);
      newSlotLabel = formatClockMinutes(shifted);
    }

    return {
      kind: "retime_stop",
      targetDate: targetDate || draftDates[0] || null,
      targetStopId,
      newSlotLabel,
      lockedDates,
      lockedStopIds,
      keepIdentityIds,
      lockedIndices,
      lockedIndicesDate,
      rawMessage: rawMsg,
    };
  }

  // Classification 2: optimize_day
  if (/\b(?:reduce|cut|less|minimize)\s+(?:the\s+)?driving\b/i.test(rawMsg)
    || /\boptimize\s+(?:the\s+)?(?:route|day|driving)\b/i.test(rawMsg)
    || /\broute\s+optimization\b/i.test(rawMsg)) {
    return {
      kind: "optimize_day",
      targetDate: targetDate || draftDates[0] || null,
      lockedDates,
      lockedStopIds,
      lockedIndices,
      lockedIndicesDate,
      rawMessage: rawMsg,
    };
  }

  // Classification 3: swap_stop
  const swapRx = /\b(?:swap|replace|change|switch)\b/i;
  const closerRx = /\b(?:find\s+something\s+closer|closer\s+to\s+(?:our\s+)?hotel)\b/i;
  if (swapRx.test(rawMsg) || closerRx.test(rawMsg)) {
    let requestedCategory = null;
    const forMatch = /(?:for|with)\s+(?:a |an )?([a-z\s]+?)(?=[.!?,;]|$|\s+(?:but|and\s+(?:keep|leave)|without|while|on|in|instead|closer|near)\b)/i.exec(rawMsg);
    if (forMatch && forMatch[1]) {
      const phrase = forMatch[1].trim().toLowerCase();
      if (phrase.includes("coffee") || phrase.includes("cafe") || phrase.includes("bakery")) requestedCategory = "coffee";
      else if (phrase.includes("sushi")) requestedCategory = "sushi";
      else if (phrase.includes("taco")) requestedCategory = "tacos";
      else if (phrase.includes("seafood")) requestedCategory = "seafood";
      else if (phrase.includes("breakfast")) requestedCategory = "breakfast";
      else if (phrase.includes("bar") || phrase.includes("cocktail")) requestedCategory = "bar";
      else if (phrase.includes("indoor") || phrase.includes("museum")) requestedCategory = "indoor";
      else if (phrase.includes("park") || phrase.includes("garden")) requestedCategory = "park";
      else if (phrase.includes("cheap")) requestedCategory = "cheap";
      else if (phrase.includes("romantic")) requestedCategory = "romantic";
      else requestedCategory = phrase;
    } else {
      if (/\b(?:coffee|cafe|bakery)\b/i.test(rawMsg)) requestedCategory = "coffee";
      else if (/\bsushi\b/i.test(rawMsg)) requestedCategory = "sushi";
      else if (/\btacos?\b/i.test(rawMsg)) requestedCategory = "tacos";
      else if (/\bseafood\b/i.test(rawMsg)) requestedCategory = "seafood";
      else if (/\bbreakfast\b/i.test(rawMsg)) requestedCategory = "breakfast";
      else if (/\bbar|cocktails?\b/i.test(rawMsg)) requestedCategory = "bar";
      else if (/\bindoors?|museum\b/i.test(rawMsg)) requestedCategory = "indoor";
    }

    const closerToAnchor = closerRx.test(rawMsg) || /\bhotel\b/i.test(rawMsg)
      ? (carriedHotelArea || options.point || null)
      : null;

    return {
      kind: "swap_stop",
      targetDate: targetDate || draftDates[0] || null,
      targetStopId,
      requestedCategory,
      closerToAnchor,
      lockedDates,
      lockedStopIds,
      keepIdentityIds,
      lockedIndices,
      lockedIndicesDate,
      rawMessage: rawMsg,
    };
  }

  // Classification 4: revise_day_vibe
  const vibeRx = /\b(?:make\s+(?:[a-z0-9\s'-]{1,24}?\s+)?(?:more\s+)?|more\s+)(romantic|cheaper|cheap|indoors|indoor|family[\s-]friendly|kid[\s-]friendly|upscale|festive)\b/i;
  const vibeMatch = vibeRx.exec(rawMsg);
  if (vibeMatch) {
    return {
      kind: "revise_day_vibe",
      targetDate: targetDate || draftDates[0] || null,
      vibe: vibeMatch[1].toLowerCase(),
      lockedDates,
      lockedStopIds,
      lockedIndices,
      lockedIndicesDate,
      rawMessage: rawMsg,
    };
  }

  return {
    kind: "swap_stop",
    targetDate: targetDate || draftDates[0] || null,
    targetStopId,
    requestedCategory: null,
    closerToAnchor: carriedHotelArea || options.point || null,
    lockedDates,
    lockedStopIds,
    keepIdentityIds,
    lockedIndices,
    lockedIndicesDate,
    rawMessage: rawMsg,
  };
}

/**
 * Applies deterministic revisions to a validated draft without external model calls.
 */
export function applyDeterministicDraftRevision(intent, validatedDraft, candidates, { voice = "wayfind", point = null, destination = null } = {}) {
  const catalogMap = new Map();
  for (const c of (candidates || [])) {
    catalogMap.set(String(c.id), c);
  }

  if (intent.kind === "undo") {
    return {
      ok: true,
      changed: false,
      mode: "no_change",
      revisionStatus: "unchanged",
      reply: "Use Undo on your draft to step back to the previous version, or tell me which stop you'd like changed.",
      proposedPlan: validatedDraft,
      changedStopIds: [],
    };
  }

  if (intent.kind === "ambiguous") {
    return {
      ok: true,
      changed: false,
      mode: "clarify",
      revisionStatus: "clarify",
      reply: intent.clarificationQuestion,
      clarificationQuestion: intent.clarificationQuestion,
      proposedPlan: validatedDraft,
      changedStopIds: [],
    };
  }

  if (intent.kind === "retime_stop") {
    const targetDate = intent.targetDate;
    const targetStopId = intent.targetStopId;
    const newSlotLabel = intent.newSlotLabel;

    if (!targetDate || !targetStopId || !newSlotLabel) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "Could not identify which stop or time to update. Draft kept unchanged.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const newDays = validatedDraft.days.map((d) => {
      if (d.date !== targetDate) return d;
      return {
        ...d,
        stops: d.stops.map((s) => {
          if (s.id !== targetStopId) return s;
          return { ...s, slotLabel: newSlotLabel };
        }),
      };
    });

    const reval = revalidateProposedDraft({ ...validatedDraft, days: newDays }, catalogMap, { destination });
    if (!reval.ok) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: reval.code === "OVERLAPPING_TIMED_EVENTS"
          ? "That time conflicts with another scheduled stop on that day (stops must be at least 60 minutes apart). Your draft was kept unchanged."
          : "Could not apply that time change without schedule conflicts. Your draft was kept unchanged.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const stopObj = catalogMap.get(targetStopId);
    const stopName = stopObj ? stopObj.name : "that stop";
    const reply = voice === "santa"
      ? `Ho ho! I moved ${stopName} to ${newSlotLabel} and left the rest of your trip untouched.`
      : `Moved ${stopName} to ${newSlotLabel}. Everything else on your trip stayed untouched.`;

    return {
      ok: true,
      changed: true,
      mode: "revise_plan",
      revisionStatus: "revised",
      reply,
      proposedPlan: reval.draft,
      changedStopIds: [targetStopId],
    };
  }

  if (intent.kind === "swap_stop") {
    const targetDate = intent.targetDate;
    let targetStopId = intent.targetStopId;
    const lockedDates = intent.lockedDates instanceof Set ? intent.lockedDates : new Set(intent.lockedDates || []);
    const lockedStopIds = intent.lockedStopIds instanceof Set ? intent.lockedStopIds : new Set(intent.lockedStopIds || []);

    if (!targetDate || lockedDates.has(targetDate)) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "That stop or day is locked and cannot be swapped.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const targetDayIndex = validatedDraft.days.findIndex((d) => d.date === targetDate);
    if (targetDayIndex < 0) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "Target day not found in draft.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const targetDay = validatedDraft.days[targetDayIndex];
    if (!targetStopId) {
      const unlocked = (targetDay.stops || []).filter((s) => !lockedStopIds.has(String(s.id)));
      if (!unlocked.length) {
        return {
          ok: true,
          changed: false,
          mode: "no_change",
          revisionStatus: "unchanged",
          reply: "All stops on that day are locked and cannot be swapped.",
          proposedPlan: validatedDraft,
          changedStopIds: [],
        };
      }
      if (intent.closerToAnchor) {
        let anchorCoords = null;
        if (typeof intent.closerToAnchor === "object" && intent.closerToAnchor.lat != null) {
          anchorCoords = intent.closerToAnchor;
        } else if (typeof intent.closerToAnchor === "string") {
          const areaLow = intent.closerToAnchor.toLowerCase();
          const candInArea = (candidates || []).find((c) => c.city && c.city.toLowerCase() === areaLow && c.lat != null);
          if (candInArea) anchorCoords = { lat: candInArea.lat, lng: candInArea.lng };
        }
        if (anchorCoords) {
          unlocked.sort((a, b) => {
            const da = distanceMiles(anchorCoords, catalogMap.get(String(a.id)) || a) ?? 0;
            const db = distanceMiles(anchorCoords, catalogMap.get(String(b.id)) || b) ?? 0;
            return db - da; // Furthest from anchor first
          });
        }
      } else {
        unlocked.sort((a, b) => {
          const ea = catalogMap.get(String(a.id))?.itemType === "event" ? 1 : 0;
          const eb = catalogMap.get(String(b.id))?.itemType === "event" ? 1 : 0;
          return ea - eb; // Non-events first
        });
      }
      targetStopId = unlocked[0].id;
    }

    if (lockedStopIds.has(targetStopId)) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "That stop or day is locked and cannot be swapped.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const oldStop = targetDay.stops.find((s) => s.id === targetStopId);
    if (!oldStop) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "Target stop not found on that day.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const usedIds = new Set((validatedDraft.days || []).flatMap((d) => d.stops.map((s) => String(s.id))));
    usedIds.delete(String(targetStopId));

    const timedMinutesOnDay = targetDay.stops
      .filter((s) => s.id !== targetStopId)
      .map((s) => parseClockMinutes(s.slotLabel || catalogMap.get(s.id)?.startTime))
      .filter((m) => m != null);

    if (intent.requestedCategory) {
      const anyMatchingCat = (candidates || []).some((c) => candidateMatchesCategory(c, intent.requestedCategory));
      if (!anyMatchingCat) {
        return {
          ok: true,
          changed: false,
          mode: "no_change",
          revisionStatus: "unchanged",
          reply: `I don't have a verified ${intent.requestedCategory} stop in Wayfind's inventory for that area, so I kept your draft unchanged.`,
          proposedPlan: validatedDraft,
          changedStopIds: [],
        };
      }
    }

    const eligible = (candidates || []).filter((c) => {
      if (usedIds.has(c.id)) return false;
      if (!canScheduleOnDate(c, targetDate).allowed) return false;
      if (!isEntityInDestinationMetro(c, destination)) return false;
      if (intent.requestedCategory && !candidateMatchesCategory(c, intent.requestedCategory)) return false;
      const cMins = parseClockMinutes(c.startTime);
      if (cMins != null && timedMinutesOnDay.some((m) => Math.abs(m - cMins) < 60)) return false;
      return true;
    });

    if (!eligible.length) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: `I couldn't find a matching verified replacement in Wayfind's inventory for that request. Kept draft unchanged.`,
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    let anchorCoords = null;
    if (intent.closerToAnchor) {
      if (typeof intent.closerToAnchor === "object" && intent.closerToAnchor.lat != null) {
        anchorCoords = intent.closerToAnchor;
      } else if (typeof intent.closerToAnchor === "string") {
        const areaLow = intent.closerToAnchor.toLowerCase();
        const candInArea = (candidates || []).find((c) => c.city && c.city.toLowerCase() === areaLow && c.lat != null);
        if (candInArea) anchorCoords = { lat: candInArea.lat, lng: candInArea.lng };
      }
    }
    if (!anchorCoords) {
      const sameDayOther = targetDay.stops.find((s) => s.id !== targetStopId && catalogMap.get(s.id)?.lat != null);
      if (sameDayOther) {
        const ent = catalogMap.get(sameDayOther.id);
        anchorCoords = { lat: ent.lat, lng: ent.lng };
      }
    }

    eligible.sort((a, b) => {
      if (anchorCoords) {
        const da = distanceMiles(anchorCoords, a) ?? 20;
        const db = distanceMiles(anchorCoords, b) ?? 20;
        if (Math.abs(da - db) > 1.5) return da - db;
      }
      const sa = a.wfScore || (a.rating ? a.rating * 15 : 50);
      const sb = b.wfScore || (b.rating ? b.rating * 15 : 50);
      return sb - sa;
    });

    const chosen = eligible[0];
    const newSlotLabel = chosen.startTime || oldStop.slotLabel || null;

    const newStops = targetDay.stops.map((s) => {
      if (s.id !== targetStopId) return s;
      return {
        id: chosen.id,
        slotLabel: newSlotLabel,
        why: chosen.take || `Swapped in from verified Wayfind inventory.`,
      };
    });

    const newDays = validatedDraft.days.map((d, idx) => {
      if (idx !== targetDayIndex) return d;
      return { ...d, stops: newStops };
    });

    const reval = revalidateProposedDraft({ ...validatedDraft, days: newDays }, catalogMap, { destination });
    if (!reval.ok) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "Could not swap that stop without schedule or time conflicts. Draft kept unchanged.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const distPhrase = anchorCoords && distanceMiles(anchorCoords, chosen) != null
      ? ` (${(distanceMiles(anchorCoords, chosen)).toFixed(1)} mi away)`
      : "";
    const pricePhrase = chosen.price ? ` · ${chosen.price}` : "";
    const reply = voice === "santa"
      ? `Ho ho! I swapped in ${chosen.name}${distPhrase}${pricePhrase} and kept the rest of your trip intact.`
      : `Replaced ${oldStop.name || "that stop"} with ${chosen.name}${distPhrase}${pricePhrase}.`;

    return {
      ok: true,
      changed: true,
      mode: "revise_plan",
      revisionStatus: "revised",
      reply,
      proposedPlan: reval.draft,
      changedStopIds: [chosen.id],
    };
  }

  if (intent.kind === "optimize_day") {
    const targetDate = intent.targetDate || (validatedDraft.days[0] && validatedDraft.days[0].date);
    const lockedDates = intent.lockedDates instanceof Set ? intent.lockedDates : new Set(intent.lockedDates || []);
    const lockedStopIds = intent.lockedStopIds instanceof Set ? intent.lockedStopIds : new Set(intent.lockedStopIds || []);

    const targetDayIndex = validatedDraft.days.findIndex((d) => d.date === targetDate);
    if (targetDayIndex < 0 || lockedDates.has(targetDate)) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "That day is locked or not found in the draft.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const dayEntry = validatedDraft.days[targetDayIndex];
    let dayStops = [...dayEntry.stops].map((s) => {
      const entity = catalogMap.get(String(s.id));
      return { ...s, place: entity || s };
    });

    const usedIds = new Set((validatedDraft.days || []).flatMap((d) => d.stops.map((s) => String(s.id))));
    const otherStopsOnDay = (dayStops.length > 1) ? dayStops : [];
    let changedStopIds = [];

    if (otherStopsOnDay.length >= 2) {
      for (let sIdx = 0; sIdx < dayStops.length; sIdx += 1) {
        const currentStop = dayStops[sIdx];
        if (lockedStopIds.has(currentStop.id) || currentStop.place?.itemType === "event") continue;
        const others = dayStops.filter((_, idx) => idx !== sIdx && _.place?.lat != null && _.place?.lng != null);
        if (!others.length || currentStop.place?.lat == null || currentStop.place?.lng == null) continue;
        const avgDist = others.reduce((sum, o) => sum + (distanceMiles(currentStop.place, o.place) ?? 0), 0) / others.length;
        if (avgDist > 8) {
          const currentBucket = classifyCandidateBucket(currentStop.place);
          const center = others[0].place;
          const closerCandidate = (candidates || []).find((c) => {
            if (usedIds.has(c.id)) return false;
            if (!canScheduleOnDate(c, targetDate).allowed) return false;
            if (!isEntityInDestinationMetro(c, destination)) return false;
            const b = classifyCandidateBucket(c);
            const bucketMatch = (currentBucket.isFood && b.isFood) || (currentBucket.isBreakfast && b.isBreakfast) || (currentBucket.isBar && b.isBar) || (!currentBucket.isFood && !b.isFood);
            if (!bucketMatch) return false;
            const d = distanceMiles(center, c);
            return d != null && d < 4;
          });
          if (closerCandidate) {
            dayStops[sIdx] = {
              id: closerCandidate.id,
              slotLabel: currentStop.slotLabel,
              why: closerCandidate.take || "Closer stop to reduce driving.",
              place: closerCandidate,
            };
            changedStopIds.push(closerCandidate.id);
            break;
          }
        }
      }
    }

    const reorderedStops = orderDayStopsGeographically(dayStops);
    const orderChanged = reorderedStops.some((s, idx) => s.id !== dayEntry.stops[idx]?.id);

    const defaultSlots = suggestedSlotLabels(reorderedStops.length);
    const finalStops = reorderedStops.map((s, idx) => {
      const entity = s.place || catalogMap.get(String(s.id));
      const fixedTime = entity?.startTime || (orderChanged ? null : s.slotLabel);
      return {
        id: s.id,
        slotLabel: fixedTime || defaultSlots[idx] || s.slotLabel || null,
        why: s.why || null,
      };
    });

    const newDays = validatedDraft.days.map((d, idx) => {
      if (idx !== targetDayIndex) return d;
      return {
        ...d,
        stops: finalStops,
      };
    });

    const reval = revalidateProposedDraft({ ...validatedDraft, days: newDays }, catalogMap, { destination });
    if (!reval.ok) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "Could not optimize that day's route without time conflicts. Kept draft unchanged.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const dayLabel = formatStopDate(targetDate, { heading: true }) || "that day";
    return {
      ok: true,
      changed: true,
      mode: "revise_plan",
      revisionStatus: "revised",
      reply: voice === "santa"
        ? `Ho ho! I reordered ${dayLabel} by neighborhood to cut backtracking and save driving time.`
        : `Optimized ${dayLabel}'s route geographically to cut cross-town driving.`,
      proposedPlan: reval.draft,
      changedStopIds,
    };
  }

  if (intent.kind === "revise_day_vibe") {
    const targetDate = intent.targetDate || (validatedDraft.days[0] && validatedDraft.days[0].date);
    const lockedDates = intent.lockedDates instanceof Set ? intent.lockedDates : new Set(intent.lockedDates || []);
    const lockedStopIds = intent.lockedStopIds instanceof Set ? intent.lockedStopIds : new Set(intent.lockedStopIds || []);

    const targetDayIndex = validatedDraft.days.findIndex((d) => d.date === targetDate);
    if (targetDayIndex < 0 || lockedDates.has(targetDate)) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "That day is locked or not found in the draft.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const dayEntry = validatedDraft.days[targetDayIndex];
    const usedIds = new Set((validatedDraft.days || []).flatMap((d) => d.stops.map((s) => String(s.id))));
    const vibe = String(intent.vibe || "").toLowerCase();

    const matching = (candidates || []).filter((c) => {
      if (usedIds.has(c.id)) return false;
      if (!canScheduleOnDate(c, targetDate).allowed) return false;
      if (!isEntityInDestinationMetro(c, destination)) return false;
      if (vibe.includes("romantic")) {
        return candidateMatchesCategory(c, "romantic");
      }
      if (vibe.includes("cheap")) {
        return c.isFree === true || (c.priceNum != null && c.priceNum <= 1);
      }
      if (vibe.includes("indoor")) {
        return classifyCandidateBucket(c).isIndoor;
      }
      return true;
    });

    if (!matching.length) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: `Wayfind has no verified listings fitting that vibe in that area on that date, so your draft was kept unchanged.`,
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    matching.sort((a, b) => {
      const sa = (a.wfScore || (a.rating ? a.rating * 15 : 50)) + (a.isFree ? 20 : 0);
      const sb = (b.wfScore || (b.rating ? b.rating * 15 : 50)) + (b.isFree ? 20 : 0);
      return sb - sa;
    });

    const changedStopIds = [];
    const newStops = dayEntry.stops.map((s) => {
      if (lockedStopIds.has(s.id) || changedStopIds.length >= 1) return s;
      const replacement = matching.find((m) => !usedIds.has(m.id));
      if (replacement) {
        usedIds.add(replacement.id);
        changedStopIds.push(replacement.id);
        return {
          id: replacement.id,
          slotLabel: s.slotLabel,
          why: replacement.take || `Selected for a more ${vibe} vibe.`,
        };
      }
      return s;
    });

    if (!changedStopIds.length) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "No unlocked stops could be revised on that day. Draft kept unchanged.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const newDays = validatedDraft.days.map((d, idx) => {
      if (idx !== targetDayIndex) return d;
      return { ...d, stops: newStops };
    });

    const reval = revalidateProposedDraft({ ...validatedDraft, days: newDays }, catalogMap, { destination });
    if (!reval.ok) {
      return {
        ok: true,
        changed: false,
        mode: "no_change",
        revisionStatus: "unchanged",
        reply: "Could not apply that revision without time or schedule conflicts. Draft kept unchanged.",
        proposedPlan: validatedDraft,
        changedStopIds: [],
      };
    }

    const dayLabel = formatStopDate(targetDate, { heading: true }) || "that day";
    return {
      ok: true,
      changed: true,
      mode: "revise_plan",
      revisionStatus: "revised",
      reply: voice === "santa"
        ? `Ho ho! I revised ${dayLabel} to be more ${vibe} while keeping the rest of your trip intact.`
        : `Updated ${dayLabel} for a more ${vibe} itinerary while leaving your other days untouched.`,
      proposedPlan: reval.draft,
      changedStopIds,
    };
  }

  return {
    ok: true,
    changed: false,
    mode: "no_change",
    revisionStatus: "unchanged",
    reply: "I couldn't identify a matching update for that request. Your draft was kept unchanged.",
    proposedPlan: validatedDraft,
    changedStopIds: [],
  };
}

/**
 * Builds the compact Claude prompt for grounded draft revisions.
 */
export function buildDraftRevisionClaudePrompt(intent, validatedDraft, candidates, conversationHistory = [], { voice = "wayfind" } = {}) {
  const voiceRule = voice === "santa"
    ? "Write `reply` in warm, crisp Wayfind Santa holiday voice (1 to 2 short sentences, no hyphens or em-dashes)."
    : "Write `reply` in concise, helpful Wayfind Planner editorial voice (1 to 2 short sentences).";

  const system = [
    "You are Wayfind Planner, revising an existing grounded Florida or Hawaii itinerary draft.",
    "STRICT GROUNDING & SCOPE RULES:",
    "1. You may ONLY use candidate entity IDs provided in CANDIDATES or existing stop IDs already in CURRENT_DRAFT.",
    "2. NEVER invent places, IDs, prices, hours, dates, availability, or travel times.",
    "3. SCOPE PRESERVATION INVARIANT: You MUST preserve all locked dates and locked stops verbatim.",
    "   - Days in LOCKED_DATES and days not targeted for revision MUST have identical stop IDs in identical order.",
    "   - Stops in LOCKED_STOPS and KEEP_IDENTITY_IDS MUST remain on their original day.",
    "   - For retiming, stop IDs must remain identical; only slotLabel may change.",
    "   - For swapping a stop, only that single targeted stop ID on the target day may change.",
    "4. All stops on the same day must be at least 60 minutes apart if timed.",
    "5. If the request is ambiguous across multiple days/stops, return {\"status\":\"clarify\",\"reply\":\"1-sentence clarification question naming the days/options\"}.",
    "When locks.targetDate is non-null, the target day is ALREADY resolved — do NOT return status:\"clarify\".",
    "6. If no verified candidate fits the requested category, return {\"status\":\"unchanged\",\"reply\":\"honest explanation that Wayfind has no verified match\"}.",
    voiceRule,
    'Return ONLY valid JSON matching: {"status":"revised"|"clarify"|"unchanged","reply":"string","days":[{"date":"YYYY-MM-DD","areaSummary":"string","stops":[{"id":"exact_candidate_id","slotLabel":"string","why":"string"}]}]}',
  ].join("\n");

  const targetCat = intent ? (intent.requestedCategory || intent.vibe || null) : null;
  const draftStopIds = new Set(
    (validatedDraft?.days || []).flatMap((d) => (d.stops || []).map((s) => String(s.id)))
  );
  const unusedCandidates = (candidates || []).filter((c) => c && c.id && !draftStopIds.has(String(c.id)));

  let prioritized = [];
  let remaining = [];
  if (targetCat) {
    for (const c of unusedCandidates) {
      if (candidateMatchesCategory(c, targetCat)) {
        prioritized.push(c);
      } else {
        remaining.push(c);
      }
    }
    prioritized.sort((a, b) => candidateQualityScore(b) - candidateQualityScore(a));
    remaining.sort((a, b) => candidateQualityScore(b) - candidateQualityScore(a));
  } else {
    remaining = [...unusedCandidates].sort((a, b) => candidateQualityScore(b) - candidateQualityScore(a));
  }

  const selectedCandidates = [...prioritized, ...remaining].slice(0, 28);
  const selectedSet = new Set(selectedCandidates.map((c) => String(c.id)));
  for (const c of (candidates || [])) {
    if (selectedCandidates.length >= 28) break;
    if (c && c.id && !selectedSet.has(String(c.id))) {
      selectedCandidates.push(c);
      selectedSet.add(String(c.id));
    }
  }

  const validCandidates = selectedCandidates.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    type: c.type,
    price: c.price || "unknown",
    score: c.wfScore || c.rating || null,
    lat: c.lat != null ? Number(c.lat.toFixed(3)) : null,
    lng: c.lng != null ? Number(c.lng.toFixed(3)) : null,
    startTime: c.startTime || null,
    hook: c.take ? c.take.slice(0, 80) : null,
  }));

  const payload = {
    request: intent.rawMessage || intent.message || "",
    recentTurns: sanitizeConversationHistory(conversationHistory),
    currentDraft: {
      title: validatedDraft.title,
      city: validatedDraft.city,
      state: validatedDraft.state,
      startDate: validatedDraft.startDate,
      endDate: validatedDraft.endDate,
      days: (validatedDraft.days || []).map((d) => ({
        date: d.date,
        areaSummary: d.areaSummary,
        stops: (d.stops || []).map((s) => ({
          id: s.id,
          name: s.name,
          slotLabel: s.slotLabel,
          why: s.why,
        })),
      })),
    },
    locks: {
      targetDate: intent.targetDate || null,
      targetStopId: intent.targetStopId || null,
      lockedDates: Array.from(intent.lockedDates || []),
      lockedStopIds: Array.from(intent.lockedStopIds || []),
      keepIdentityIds: Array.from(intent.keepIdentityIds || []),
      lockedIndices: intent.lockedIndices || null,
      lockedIndicesDate: intent.lockedIndicesDate || null,
    },
    CANDIDATES: validCandidates,
  };

  return {
    system,
    user: JSON.stringify(payload),
  };
}

/**
 * Validates Claude draft revision response enforcing all scope invariants.
 */
export function parseAndValidateClaudeDraftRevision(rawModelText, intent, validatedDraft, candidates, { destination = null } = {}) {
  const obj = extractJsonObject(rawModelText);
  if (!obj || typeof obj !== "object") {
    return { ok: false, code: "INVALID_MODEL_JSON", rejectedIds: [] };
  }

  const reply = String(obj.reply || "").trim().slice(0, 320);

  if (obj.status === "clarify") {
    if (intent && intent.kind !== "ambiguous" && intent.targetDate) {
      return { ok: false, code: "SPURIOUS_CLARIFY", rejectedIds: [] };
    }
    return {
      ok: true,
      mode: "clarify",
      revisionStatus: "clarify",
      reply: reply || "Which stop or day would you like to update?",
      clarificationQuestion: reply || "Which stop or day would you like to update?",
      proposedPlan: validatedDraft,
      changedStopIds: [],
    };
  }

  if (obj.status === "unchanged") {
    return {
      ok: true,
      mode: "no_change",
      revisionStatus: "unchanged",
      reply: reply || "Kept your itinerary draft unchanged.",
      proposedPlan: validatedDraft,
      changedStopIds: [],
    };
  }

  if (!Array.isArray(obj.days) || obj.days.length === 0) {
    return { ok: false, code: "INVALID_MODEL_JSON", rejectedIds: [] };
  }

  // 1. Same day count & exact same dates in order as validatedDraft
  if (obj.days.length !== validatedDraft.days.length) {
    return { ok: false, code: "REVISION_SCOPE_VIOLATION", rejectedIds: [] };
  }
  for (let i = 0; i < validatedDraft.days.length; i += 1) {
    if (obj.days[i].date !== validatedDraft.days[i].date) {
      return { ok: false, code: "REVISION_SCOPE_VIOLATION", rejectedIds: [] };
    }
  }

  const lockedDates = intent.lockedDates instanceof Set ? intent.lockedDates : new Set(intent.lockedDates || []);
  const lockedStopIds = intent.lockedStopIds instanceof Set ? intent.lockedStopIds : new Set(intent.lockedStopIds || []);
  const keepIdentityIds = intent.keepIdentityIds instanceof Set ? intent.keepIdentityIds : new Set(intent.keepIdentityIds || []);

  // 2. Every day in intent.lockedDates AND every day !== intent.targetDate (when intent.targetDate is set)
  // MUST have the exact same ordered stop IDs as validatedDraft!
  for (let i = 0; i < validatedDraft.days.length; i += 1) {
    const origDay = validatedDraft.days[i];
    const newDay = obj.days[i];
    const origIds = (origDay.stops || []).map((s) => String(s.id));
    const newIds = (newDay.stops || []).map((s) => String(s.id || s.entityId));

    const isLockedDay = lockedDates.has(origDay.date);
    const isUntargetedDay = intent.targetDate && origDay.date !== intent.targetDate;

    if (isLockedDay || isUntargetedDay) {
      if (origIds.length !== newIds.length || origIds.some((id, idx) => id !== newIds[idx])) {
        return { ok: false, code: "REVISION_SCOPE_VIOLATION", rejectedIds: [] };
      }
    }
  }

  // 3. Every stop ID in intent.lockedStopIds and intent.keepIdentityIds MUST still be present on its original day (and at its exact index if first two stops locked)!
  for (let i = 0; i < validatedDraft.days.length; i += 1) {
    const origDay = validatedDraft.days[i];
    const newDay = obj.days[i];
    const origStops = origDay.stops || [];
    const newIds = (newDay.stops || []).map((s) => String(s.id || s.entityId));

    for (let idx = 0; idx < origStops.length; idx += 1) {
      const s = origStops[idx];
      const id = String(s.id);
      if (lockedStopIds.has(id) || keepIdentityIds.has(id)) {
        const isIndexLocked = intent.lockedIndices
          && (!intent.lockedIndicesDate || intent.lockedIndicesDate === origDay.date)
          && intent.lockedIndices.includes(idx);

        if (isIndexLocked) {
          if (newIds[idx] !== id) {
            return { ok: false, code: "REVISION_SCOPE_VIOLATION", rejectedIds: [id] };
          }
        } else if (!newIds.includes(id)) {
          return { ok: false, code: "REVISION_SCOPE_VIOLATION", rejectedIds: [id] };
        }
      }
    }
  }

  // 4. For intent.kind === "swap_stop" with targetStopId, ONLY that single stop position on targetDate may change ID!
  if (intent.kind === "swap_stop" && intent.targetDate && intent.targetStopId) {
    const targetOrigDay = validatedDraft.days.find((d) => d.date === intent.targetDate);
    const targetNewDay = obj.days.find((d) => d.date === intent.targetDate);
    if (targetOrigDay && targetNewDay) {
      const origStops = targetOrigDay.stops || [];
      const newStops = targetNewDay.stops || [];
      if (origStops.length !== newStops.length) {
        return { ok: false, code: "REVISION_SCOPE_VIOLATION", rejectedIds: [] };
      }
      for (let sIdx = 0; sIdx < origStops.length; sIdx += 1) {
        const origId = String(origStops[sIdx].id);
        const newId = String(newStops[sIdx].id || newStops[sIdx].entityId);
        if (origId === intent.targetStopId) {
          // Allowed to change
        } else if (origId !== newId) {
          return { ok: false, code: "REVISION_SCOPE_VIOLATION", rejectedIds: [] };
        }
      }
    }
  }

  // 5. For intent.kind === "retime_stop", ALL stop IDs across all days must be identical to validatedDraft!
  if (intent.kind === "retime_stop") {
    for (let i = 0; i < validatedDraft.days.length; i += 1) {
      const origDay = validatedDraft.days[i];
      const newDay = obj.days[i];
      const origIds = (origDay.stops || []).map((s) => String(s.id));
      const newIds = (newDay.stops || []).map((s) => String(s.id || s.entityId));
      if (origIds.length !== newIds.length || origIds.some((id, idx) => id !== newIds[idx])) {
        return { ok: false, code: "REVISION_SCOPE_VIOLATION", rejectedIds: [] };
      }
    }
  }

  const reval = revalidateProposedDraft({ ...validatedDraft, days: obj.days }, candidates, { destination });
  if (!reval.ok) {
    return reval;
  }

  const origStopIdSet = new Set((validatedDraft.days || []).flatMap((d) => (d.stops || []).map((s) => String(s.id))));
  const changedStopIds = [];
  for (const d of reval.draft.days) {
    for (const s of d.stops) {
      if (!origStopIdSet.has(String(s.id))) {
        changedStopIds.push(s.id);
      }
    }
  }

  if (intent && (intent.kind === "swap_stop" || intent.kind === "revise_day_vibe") && changedStopIds.length === 0) {
    return { ok: false, code: "NO_OP_REVISION", rejectedIds: [] };
  }

  if (intent && intent.kind === "swap_stop" && intent.requestedCategory) {
    const catalogMap = new Map();
    for (const c of (candidates || [])) {
      if (c && c.id) catalogMap.set(String(c.id), c);
    }
    for (const id of changedStopIds) {
      const ent = catalogMap.get(String(id));
      if (!ent || !candidateMatchesCategory(ent, intent.requestedCategory)) {
        return { ok: false, code: "CATEGORY_MISMATCH", rejectedIds: changedStopIds };
      }
    }
  }

  return {
    ok: true,
    mode: "revise_plan",
    revisionStatus: "revised",
    reply: reply || "Updated your itinerary draft.",
    proposedPlan: reval.draft,
    changedStopIds,
  };
}
