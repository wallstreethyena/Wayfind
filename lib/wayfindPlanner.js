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

import { personaVoiceRule, personaPlanReply, plannerPersona } from "./plannerPersona.js";
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

      // Keep candidates within reasonable metro reach when coordinates exist;
      // when coordinates are absent, require a known city matching the target destination/metro.
      if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng) && cand.lat != null && cand.lng != null) {
        const km = haversineKm(destination, cand);
        if (km != null && km > maxRadiusKm) continue;
        cand.distFromCenterKm = Number(km.toFixed(2));
      } else if (destination) {
        if (!destination.name || !cand.city) continue;
        const cLow = cand.city.toLowerCase();
        const dLow = destination.name.toLowerCase();
        const orlandoMetro = new Set(["orlando", "winter park", "kissimmee", "lake buena vista", "celebration", "altamonte springs", "sanford", "mount dora"]);
        const tampaMetro = new Set(["tampa", "st. petersburg", "st petersburg", "st. pete beach", "st pete beach", "north redington beach", "clearwater", "largo", "dunedin", "brandon", "wesley chapel"]);
        const sarasotaMetro = new Set(["sarasota", "bradenton", "bradenton beach", "holmes beach", "siesta key", "longboat key", "anna maria", "anna maria island", "venice", "nokomis", "osprey", "north port", "warm mineral springs", "lakewood ranch", "university park", "waterside place", "palmetto", "parrish", "ellenton", "cortez", "myakka city", "duette"]);
        const miamiMetro = new Set(["miami", "miami beach", "coral gables", "coconut grove", "pinecrest", "fort lauderdale", "hollywood", "doral"]);
        const palmBeachMetro = new Set(["west palm beach", "palm beach", "boca raton", "delray beach", "jupiter"]);
        const jaxMetro = new Set(["jacksonville", "jacksonville beach", "st. augustine", "st augustine", "ponte vedra", "amelia island"]);
        const swflMetro = new Set(["naples", "fort myers", "fort myers beach", "sanibel", "captiva", "bonita springs", "marco island", "cape coral"]);
        const sameMetro =
          cLow === dLow
          || (orlandoMetro.has(dLow) && orlandoMetro.has(cLow))
          || (tampaMetro.has(dLow) && tampaMetro.has(cLow))
          || (sarasotaMetro.has(dLow) && sarasotaMetro.has(cLow))
          || (miamiMetro.has(dLow) && miamiMetro.has(cLow))
          || (palmBeachMetro.has(dLow) && palmBeachMetro.has(cLow))
          || (jaxMetro.has(dLow) && jaxMetro.has(cLow))
          || (swflMetro.has(dLow) && swflMetro.has(cLow));
        if (!sameMetro) continue;
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
export function enrichPlanDays(days, catalogMap) {
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

    const ordered = orderDayStopsGeographically(rawStops);
    const eveningHeavy = ordered.length <= 3 && ordered.some((s) => classifyCandidateBucket(s.place).isChristmas);
    const defaultSlots = suggestedSlotLabels(ordered.length, { eveningHeavy: dIdx === 0 && eveningHeavy });

    const finalStops = ordered.map((s, idx) => {
      const entity = s.place;
      const conf = evaluateStopConfidence(entity, dateYmd);
      if (conf.level === "confirmed") confirmedCount += 1;
      else checkHoursCount += 1;
      const next = ordered[idx + 1] ? ordered[idx + 1].place : null;
      const travelToNext = next ? stopTravelRelationship(entity, next) : null;

      return {
        id: entity.id,
        name: entity.name,
        slotLabel: s.slotLabel || entity.startTime || defaultSlots[idx] || null,
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
        travelToNext,
      };
    });

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
      explanation: String(obj.reply || "").trim().slice(0, 360),
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
