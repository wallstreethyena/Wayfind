// lib/searchSemantics.js — Missions 11, 12 & 23 Semantic Search Eligibility,
// Confidence/Provenance Scoring & Controlled Self-Healing Overrides.
//
// SERVER-ONLY (0 client bundle bytes). Separates:
//   - Category taxonomy (`lib/searchTaxonomy.js`)
//   - Multi-dimensional venue semantics (`OUTING_WORTHY`, `INDOOR`, `OUTDOOR`,
//     `FAMILY`, `TODDLER_SAFE`, `NIGHTLIFE`, `FOOD`, `CLINICAL`, `ERRAND`,
//     `SHOPPING`, `TOUR`, `ATTRACTION`, `MUSEUM`, `PARK`, `BEACH`, `EVENT`,
//     `LOW_WALKING`, `QUIET`)
//   - Confidence & provenance (`confirmed` | `probable` | `mixed` | `unknown`)
//   - Moment eligibility gating (hard rejections vs soft confidence penalties)

import { isNotPublicPlace } from "./notPublicPlaces.js";
import { overrideFor } from "./placeOverrides.js";
import { isUsableOwnedHours, evaluateOwnedHoursStatus } from "./ownedHours.js";

export const SEMANTIC_DIMENSIONS = Object.freeze([
  "OUTING_WORTHY",
  "INDOOR",
  "OUTDOOR",
  "FAMILY",
  "TODDLER_SAFE",
  "NIGHTLIFE",
  "FOOD",
  "CLINICAL",
  "ERRAND",
  "SHOPPING",
  "TOUR",
  "ATTRACTION",
  "MUSEUM",
  "PARK",
  "BEACH",
  "EVENT",
  "LOW_WALKING",
  "QUIET",
]);

export const SEMANTIC_CONFIDENCE = Object.freeze({
  CONFIRMED: "confirmed",
  PROBABLE: "probable",
  MIXED: "mixed",
  UNKNOWN: "unknown",
});

// Aggregate telemetry for Mission 21 Operations Observability (zero PII)
const REJECTION_TELEMETRY = Object.create(null);
let TOTAL_EVALUATED = 0;
let TOTAL_REJECTED = 0;

export function recordSearchRejectionReason(reason) {
  const key = String(reason || "unspecified");
  REJECTION_TELEMETRY[key] = (REJECTION_TELEMETRY[key] || 0) + 1;
  TOTAL_REJECTED += 1;
}

export function getSearchRejectionTelemetry() {
  return {
    totalEvaluated: TOTAL_EVALUATED,
    totalRejected: TOTAL_REJECTED,
    byReason: { ...REJECTION_TELEMETRY },
  };
}

export function resetSearchRejectionTelemetryForTests() {
  for (const k of Object.keys(REJECTION_TELEMETRY)) delete REJECTION_TELEMETRY[k];
  TOTAL_EVALUATED = 0;
  TOTAL_REJECTED = 0;
}

// Mission 23 Controlled Evidence-Gated Semantic Overrides Registry
const EVIDENCE_GATED_OVERRIDES = new Map();

/**
 * Controlled self-healing override registration (Mission 23).
 * Refuses blind/unverified guesses: requires non-empty `evidenceSource` and `reason`.
 */
export function registerVerifiedSemanticOverride({
  placeId,
  dimensions = {},
  excludeFromOutings = false,
  evidenceSource,
  reason,
  verifiedAt = new Date().toISOString(),
} = {}) {
  const id = String(placeId || "").trim();
  const src = String(evidenceSource || "").trim();
  const why = String(reason || "").trim();
  if (!id || !src || why.length < 6) {
    return { ok: false, error: "evidenceSource and descriptive reason (>=6 chars) required" };
  }
  const cleanDims = {};
  for (const [dim, val] of Object.entries(dimensions || {})) {
    if (!SEMANTIC_DIMENSIONS.includes(dim)) continue;
    const state = typeof val === "string" ? val : val?.state;
    if (!Object.values(SEMANTIC_CONFIDENCE).includes(state) && state !== "false") continue;
    cleanDims[dim] = { state, provenance: `verified_override:${src}` };
  }
  const entry = {
    placeId: id,
    dimensions: cleanDims,
    excludeFromOutings: Boolean(excludeFromOutings),
    evidenceSource: src,
    reason: why,
    verifiedAt,
  };
  EVIDENCE_GATED_OVERRIDES.set(id, entry);
  return { ok: true, entry };
}

export function getVerifiedSemanticOverride(placeId) {
  return EVIDENCE_GATED_OVERRIDES.get(String(placeId || "").trim()) || null;
}

export function clearVerifiedSemanticOverridesForTests() {
  EVIDENCE_GATED_OVERRIDES.clear();
}

// ── Pattern & Type Dictionaries ──────────────────────────────────────────────
const CLINICAL_RX =
  /\b(med\s*spa|medspa|aesthetics?|botox|dermal\s*filler|laser\s*hair|iv\s*(?:hydration|therapy|drip|lounge)|weight\s*loss|hormone|cryotherapy|chiropract|dental|dentist|orthodont|optometr|lasik|urgent\s*care|medical\s*clinic|wellness\s*clinic|skin\s*care\s*clinic|plastic\s*surg|dermatolog|physical\s*therapy|rehab\s*center|veterinar|animal\s*hospital|pharmacy|drugstore)\b/i;

const CLINICAL_TYPES = new Set([
  "medical_spa", "skin_care_clinic", "medical_clinic", "wellness_clinic", "doctor",
  "dentist", "dental_clinic", "hospital", "physiotherapist", "chiropractor",
  "medical_lab", "pharmacy", "drugstore", "veterinary_care", "optometrist",
]);

const ERRAND_RX =
  /\b(self\s*storage|u-?haul|auto\s*repair|oil\s*change|car\s*wash|tire\s*shop|dry\s*clean|laundromat|tax\s*service|insurance\s*agency|law\s*firm|real\s*estate|locksmith|plumb|hvac|roofing|moving\s*company|post\s*office|dmv|bank\b|atm\b|nail\s*salon|hair\s*salon|barber\s*shop|waxing|lash\s*bar|brow\s*bar)\b/i;

const ERRAND_TYPES = new Set([
  "storage", "self_storage", "moving_company", "car_repair", "car_wash", "car_dealer",
  "gas_station", "insurance_agency", "real_estate_agency", "lawyer", "accounting",
  "bank", "atm", "laundry", "dry_cleaner", "post_office", "courthouse", "nail_salon",
  "hair_care", "beauty_salon", "barber_shop", "tanning_salon", "parking", "parking_lot",
]);

const PERSONAL_CARE_SPA_TYPES = new Set(["spa", "massage", "wellness_center", "sauna"]);
const PERSONAL_CARE_SPA_RX = /\b(day\s*spa|massage|facial|wellness\s*center|head\s*spa|body\s*sculpt)\b/i;

const INDOOR_CONFIRMED_TYPES = new Set([
  "museum", "art_gallery", "science_museum", "history_museum", "children_museum",
  "childrens_museum", "aquarium", "planetarium", "library", "bowling_alley",
  "movie_theater", "performing_arts_theater", "concert_hall", "comedy_club",
  "escape_room", "indoor_playground", "roller_skating_rink", "ice_skating_rink",
  "shopping_mall", "book_store", "arcade",
]);

const INDOOR_PROBABLE_TYPES = new Set([
  "restaurant", "fine_dining_restaurant", "italian_restaurant", "french_restaurant",
  "sushi_restaurant", "japanese_restaurant", "steak_house", "american_restaurant",
  "seafood_restaurant", "mexican_restaurant", "cafe", "coffee_shop", "bakery",
  "tea_house", "wine_bar", "cocktail_bar", "speakeasy", "bar", "pub", "brewery",
  "night_club", "karaoke", "amusement_center", "casino",
]);

const OUTDOOR_CONFIRMED_TYPES = new Set([
  "beach", "park", "city_park", "state_park", "national_park", "nature_preserve",
  "hiking_area", "dog_park", "playground", "botanical_garden", "zoo", "water_park",
  "marina", "golf_course", "campground", "picnic_ground", "skateboard_park",
]);

const OUTDOOR_NAME_RX =
  /\b(beach|state\s*park|nature\s*preserve|trailhead|boardwalk|pier\b|kayak|paddleboard|airboat|boat\s*tour|botanical\s*garden|splash\s*pad|dog\s*park|wildlife\s*refuge)\b/i;

const INDOOR_NAME_RX =
  /\b(museum|aquarium|planetarium|cinema|movie\s*theater|bowling|escape\s*room|indoor\s*play|children['’]?s\s*museum|library|art\s*gallery|arcade|comedy\s*club|symphony|opera\s*house)\b/i;

const KIDS_PLAY_CENTER_RX =
  /\b(indoor\s*play|play\s*cafe|play\s*center|little\s*sprouts|kids?\s*empire|chuck\s*e\.?\s*cheese|bounce\s*house|jump\s*park|trampoline|pump\s*it\s*up|monkey\s*joe|we\s*rock\s*the\s*spectrum|soft\s*play|toddler\s*gym|splash\s*pad)\b/i;

const TODDLER_UNSAFE_RX =
  /\b(trampoline|axe\s*throw|paintball|airsoft|escape\s*room|go[\s-]*kart|rage\s*room|haunted\s*house|nightclub|speakeasy|cigar|hookah|kava)\b/i;

const TODDLER_SAFE_RX =
  /\b(children['’]?s\s*museum|toddler|aquarium|zoo\b|library|playground|splash\s*pad|indoor\s*play|carousel|petting\s*farm|storytime|botanical\s*garden)\b/i;

const THEME_PARK_TYPES = new Set(["amusement_park", "theme_park", "water_park"]);
const THEME_PARK_RX =
  /\b(theme\s*park|amusement\s*park|magic\s*kingdom|epcot|hollywood\s*studios|animal\s*kingdom|walt\s*disney\s*world|universal\s*studios|islands\s*of\s*adventure|epic\s*universe|seaworld|busch\s*gardens|legoland|fun\s*spot\s*america|adventure\s*island|aquatica|volcano\s*bay|typhoon\s*lagoon|blizzard\s*beach)\b/i;

const HIGH_WALKING_RX =
  /\b(hike|hiking|trailhead|nature\s*trail|state\s*forest|theme\s*park|amusement\s*park|water\s*park|trampoline|climb|ropes\s*course|zip\s*line|paintball|golf\s*course|zoo\b)\b/i;

const LOW_WALKING_TYPES = new Set([
  "performing_arts_theater", "movie_theater", "concert_hall", "comedy_club",
  "planetarium", "boat_tour", "fine_dining_restaurant", "wine_bar",
  "italian_restaurant", "french_restaurant", "tea_house", "art_gallery", "museum",
]);

const LOW_WALKING_RX =
  /\b(boat\s*tour|sunset\s*cruise|dinner\s*cruise|sightseeing\s*cruise|scenic\s*drive|drive[\s-]*thru\s*lights|theater|theatre|symphony|orchestra|comedy|jazz|planetarium|cinema|tea\s*room|wine\s*bar)\b/i;

const LOUD_ROWDY_TYPES = new Set([
  "night_club", "sports_bar", "karaoke", "bowling_alley", "amusement_center",
  "amusement_park", "theme_park", "water_park", "stadium", "arena",
  "live_music_venue", "indoor_playground", "playground",
]);

const LOUD_ROWDY_RX =
  /\b(arcade|bowling|sports\s*bar|night\s*club|nightclub|karaoke|trampoline|indoor\s*play|fun\s*center|laser\s*tag|go[\s-]*kart|honky\s*tonk|dueling\s*piano|stadium|arena|chuck\s*e)\b/i;

const QUIET_FAVORED_TYPES = new Set([
  "wine_bar", "fine_dining_restaurant", "french_restaurant", "italian_restaurant",
  "japanese_restaurant", "sushi_restaurant", "fondue_restaurant", "tea_house",
  "art_gallery", "museum", "book_store", "botanical_garden",
]);

const QUIET_FAVORED_RX =
  /\b(wine\s*bar|tea\s*house|tea\s*room|art\s*gallery|museum|speakeasy|bookshop|bookstore|intimate|jazz\s*lounge|bistro|omakase)\b/i;

function normSet(doc) {
  const raw = [
    doc?.primaryType,
    doc?.primary_type,
    ...(Array.isArray(doc?.types) ? doc.types : []),
    ...(Array.isArray(doc?.google_types) ? doc.google_types : []),
  ];
  return new Set(raw.map((x) => String(x || "").toLowerCase().trim()).filter(Boolean));
}

function dim(state, provenance) {
  return { state, provenance };
}

/**
 * Compute multi-dimensional venue semantics with explicit confidence & provenance.
 */
export function deriveVenueSemantics(doc) {
  const title = String(doc?.title || doc?.cardName || doc?.name || "").trim();
  const primary = String(doc?.primaryType || doc?.primary_type || "").toLowerCase().trim();
  const types = normSet(doc);
  const tags = new Set((Array.isArray(doc?.tags) ? doc.tags : []).map((t) => String(t || "").toLowerCase().trim()));
  const keywordsBlob = [title, ...(Array.isArray(doc?.keywords) ? doc.keywords : []), ...(doc?.tags || [])].join(" ");
  const navCat = String(doc?.category || doc?.nav?.category || "").toLowerCase();
  const navSub = String(doc?.nav?.sub || "").toLowerCase();
  const isEvent = doc?.kind === "event";
  const isGuide = doc?.kind === "guide";

  const staticOv = overrideFor({ name: title });
  const verifiedOv = doc?.id ? getVerifiedSemanticOverride(doc.id) : null;

  // Clinical & Errand detection
  const isClinicalType = CLINICAL_TYPES.has(primary) || [...types].some((t) => CLINICAL_TYPES.has(t));
  const isClinicalName = CLINICAL_RX.test(title);
  // Protect The Turtle Hospital (explicit tourist_attraction)
  const hasGenuineAttraction = types.has("tourist_attraction") && /\bturtle\s*hospital\b/i.test(title);

  const clinical = !hasGenuineAttraction && (isClinicalType || isClinicalName)
    ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, isClinicalType ? "google_types" : "name_signal")
    : dim("false", "none");

  const isErrandType = ERRAND_TYPES.has(primary);
  const isErrandName = ERRAND_RX.test(title) && !/\b(museum|park|beach|bar|brewing|restaurant)\b/i.test(title);
  const errand = isErrandType || isErrandName
    ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, isErrandType ? "primary_type" : "name_signal")
    : dim("false", "none");

  // Indoor vs Outdoor semantics
  let indoor = dim(SEMANTIC_CONFIDENCE.UNKNOWN, "none");
  let outdoor = dim(SEMANTIC_CONFIDENCE.UNKNOWN, "none");

  const hasConfirmedIndoor = INDOOR_CONFIRMED_TYPES.has(primary) || [...types].some((t) => INDOOR_CONFIRMED_TYPES.has(t)) || INDOOR_NAME_RX.test(title) || tags.has("indoor") || tags.has("rainy");
  const hasProbableIndoor = INDOOR_PROBABLE_TYPES.has(primary) || [...types].some((t) => INDOOR_PROBABLE_TYPES.has(t));
  const hasConfirmedOutdoor = OUTDOOR_CONFIRMED_TYPES.has(primary) || [...types].some((t) => OUTDOOR_CONFIRMED_TYPES.has(t)) || OUTDOOR_NAME_RX.test(title) || navSub === "beaches" || navSub === "outdoors";

  if (hasConfirmedIndoor && hasConfirmedOutdoor) {
    indoor = dim(SEMANTIC_CONFIDENCE.MIXED, "type_and_name");
    outdoor = dim(SEMANTIC_CONFIDENCE.MIXED, "type_and_name");
  } else if (hasConfirmedIndoor) {
    indoor = dim(SEMANTIC_CONFIDENCE.CONFIRMED, INDOOR_CONFIRMED_TYPES.has(primary) ? "primary_type" : "type_or_name");
    outdoor = dim("false", "inferred_from_indoor");
  } else if (hasConfirmedOutdoor) {
    outdoor = dim(SEMANTIC_CONFIDENCE.CONFIRMED, OUTDOOR_CONFIRMED_TYPES.has(primary) ? "primary_type" : "type_or_name");
    indoor = dim("false", "inferred_from_outdoor");
  } else if (hasProbableIndoor) {
    indoor = dim(SEMANTIC_CONFIDENCE.PROBABLE, "primary_type");
    outdoor = dim(SEMANTIC_CONFIDENCE.UNKNOWN, "none");
  } else if (isEvent) {
    if (/\b(indoor|theater|theatre|symphony|arena|museum|hall|auditorium|library)\b/i.test(keywordsBlob)) {
      indoor = dim(SEMANTIC_CONFIDENCE.PROBABLE, "event_metadata");
    } else if (/\b(park|beach|parade|outdoor|stroll|bayfront|riverwalk|garden|market|festival|lights)\b/i.test(keywordsBlob)) {
      outdoor = dim(SEMANTIC_CONFIDENCE.PROBABLE, "event_metadata");
    }
  }

  // Category/domain dimensions
  const isFood = navCat === "food" || /_restaurant$/.test(primary) || ["restaurant", "cafe", "coffee_shop", "bakery", "ice_cream_shop", "fast_food_restaurant"].includes(primary);
  const isShopping = navCat === "shopping" || /_store$|_shop$/.test(primary) && !["coffee_shop", "ice_cream_shop", "sandwich_shop", "donut_shop", "bagel_shop", "dessert_shop"].includes(primary) || ["shopping_mall", "market", "farmers_market", "flea_market", "store", "gift_shop", "clothing_store", "department_store"].includes(primary);
  const isNightlife = navCat === "nightlife" || ["bar", "cocktail_bar", "wine_bar", "night_club", "pub", "brewery", "speakeasy", "sports_bar", "karaoke", "live_music_venue"].includes(primary);
  const isMuseum = primary === "museum" || primary === "art_gallery" || types.has("museum") || types.has("art_gallery") || /\b(museum|planetarium|science\s*center|art\s*gallery)\b/i.test(title);
  const isPark = primary === "park" || primary === "state_park" || primary === "national_park" || primary === "nature_preserve" || types.has("park");
  const isBeach = !staticOv?.noWater && (primary === "beach" || types.has("beach") || navSub === "beaches");
  const isTour = primary === "boat_tour" || types.has("tour_agency") || navSub === "tours" || /\b(tour|cruise|charter|kayak|airboat)\b/i.test(title);
  const isThemePark = THEME_PARK_TYPES.has(primary) || [...types].some((t) => THEME_PARK_TYPES.has(t)) || THEME_PARK_RX.test(title);
  const isKidsPlayCenter = KIDS_PLAY_CENTER_RX.test(title) || types.has("indoor_playground");
  const isPersonalSpa = PERSONAL_CARE_SPA_TYPES.has(primary) || PERSONAL_CARE_SPA_RX.test(title);

  const isToddlerUnsafe = isNightlife || TODDLER_UNSAFE_RX.test(title) || clinical.state === SEMANTIC_CONFIDENCE.CONFIRMED;
  const isToddlerPositive = !isToddlerUnsafe && (TODDLER_SAFE_RX.test(title) || tags.has("toddlers") || types.has("children_museum") || types.has("aquarium") || types.has("playground") || types.has("library"));

  const isFamilyPositive = !isNightlife && clinical.state !== SEMANTIC_CONFIDENCE.CONFIRMED && (
    navCat === "family" || isToddlerPositive || isMuseum || isPark || isBeach || isThemePark || tags.has("kids") || tags.has("family") || /\b(family|kids?|zoo|aquarium|bowling|mini\s*golf|arcade)\b/i.test(keywordsBlob)
  );

  const isHighWalking =
    isThemePark ||
    types.has("hiking_area") ||
    types.has("zoo") ||
    types.has("state_park") ||
    types.has("national_park") ||
    HIGH_WALKING_RX.test(title);
  const isLowWalking = !isHighWalking && (LOW_WALKING_TYPES.has(primary) || LOW_WALKING_RX.test(keywordsBlob));

  const isLoud = isKidsPlayCenter || LOUD_ROWDY_TYPES.has(primary) || [...types].some((t) => LOUD_ROWDY_TYPES.has(t)) || LOUD_ROWDY_RX.test(title);
  const isQuiet = !isLoud && (QUIET_FAVORED_TYPES.has(primary) || QUIET_FAVORED_RX.test(keywordsBlob));

  const outingWorthy =
    clinical.state === SEMANTIC_CONFIDENCE.CONFIRMED ||
    errand.state === SEMANTIC_CONFIDENCE.CONFIRMED ||
    verifiedOv?.excludeFromOutings
      ? dim("false", "hard_exclusion")
      : isGuide || isEvent || isMuseum || isBeach || isPark || isTour || isFood || isNightlife || navCat === "attractions" || navCat === "family"
        ? dim(isPersonalSpa ? SEMANTIC_CONFIDENCE.MIXED : SEMANTIC_CONFIDENCE.CONFIRMED, "category_and_type")
        : dim(SEMANTIC_CONFIDENCE.UNKNOWN, "none");

  const dimensions = {
    OUTING_WORTHY: outingWorthy,
    INDOOR: indoor,
    OUTDOOR: outdoor,
    FAMILY: isFamilyPositive ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "type_or_tag") : dim(isNightlife ? "false" : SEMANTIC_CONFIDENCE.UNKNOWN, "none"),
    TODDLER_SAFE: isToddlerUnsafe ? dim("false", "safety_veto") : isToddlerPositive ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "toddler_signal") : dim(SEMANTIC_CONFIDENCE.UNKNOWN, "none"),
    NIGHTLIFE: isNightlife ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "primary_type") : dim("false", "none"),
    FOOD: isFood ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "primary_type") : dim("false", "none"),
    CLINICAL: clinical,
    ERRAND: errand,
    SHOPPING: isShopping ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "primary_type") : dim("false", "none"),
    TOUR: isTour ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "type_or_name") : dim("false", "none"),
    ATTRACTION: (navCat === "attractions" || isMuseum || isThemePark || isTour) && !isPersonalSpa ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "taxonomy") : dim("false", "none"),
    MUSEUM: isMuseum ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "type_or_name") : dim("false", "none"),
    PARK: isPark ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "type_or_name") : dim("false", "none"),
    BEACH: isBeach ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "type_or_name") : dim("false", "none"),
    EVENT: isEvent ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "kind") : dim("false", "none"),
    LOW_WALKING: isHighWalking ? dim("false", "exertion_veto") : isLowWalking ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "seated_or_scenic") : dim(SEMANTIC_CONFIDENCE.UNKNOWN, "none"),
    QUIET: isLoud ? dim("false", "noise_veto") : isQuiet ? dim(SEMANTIC_CONFIDENCE.CONFIRMED, "room_type") : dim(SEMANTIC_CONFIDENCE.UNKNOWN, "none"),
  };

  // Apply explicit static or verified overrides (Mission 23)
  if (staticOv?.semantics && typeof staticOv.semantics === "object") {
    for (const [k, v] of Object.entries(staticOv.semantics)) {
      if (dimensions[k]) dimensions[k] = dim(v, "static_place_override");
    }
  }
  if (verifiedOv?.dimensions) {
    for (const [k, v] of Object.entries(verifiedOv.dimensions)) {
      if (dimensions[k]) dimensions[k] = v;
    }
  }

  return {
    dimensions,
    flags: {
      isThemePark,
      isKidsPlayCenter,
      isPersonalSpa,
      isHighWalking,
      isLoud,
    },
  };
}

/**
 * Evaluate whether `ownedHours` confirms the venue stays open past `afterHour` (0-23)
 * on the target day of week (`0 = Sunday .. 6 = Saturday`).
 */
export function checkOpenAfterHour(ownedHours, afterHour, { dayOfWeek = null, nowMs = Date.now() } = {}) {
  if (!Number.isFinite(afterHour)) return { state: "not_requested" };
  if (!isUsableOwnedHours(ownedHours, nowMs)) {
    return { state: "unknown", reason: "hours_unavailable" };
  }
  const tz = ownedHours.timezone || "America/New_York";
  const dow =
    dayOfWeek != null
      ? dayOfWeek
      : (() => {
          const short = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(nowMs)).toLowerCase();
          return { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }[short.slice(0, 3)] ?? new Date(nowMs).getUTCDay();
        })();

  const targetMinutes = afterHour * 60 + 30; // Must remain open at least 30 mins past `afterHour`
  let openToday = false;
  let maxCloseMinutes = -1;

  for (const p of ownedHours.periods || []) {
    if (!p?.open) continue;
    if (!p.close) return { state: "confirmed_late", closesAtMin: 24 * 60 }; // 24/7
    if (p.open.day === p.close.day && p.open.hour === p.close.hour && p.open.minute === p.close.minute) {
      return { state: "confirmed_late", closesAtMin: 24 * 60 };
    }
    if (p.open.day !== dow) continue;
    openToday = true;
    const oMin = (p.open.hour || 0) * 60 + (p.open.minute || 0);
    let cMin = (p.close.hour || 0) * 60 + (p.close.minute || 0);
    if (p.close.day !== dow || cMin <= oMin) cMin += 24 * 60; // wraps past midnight!
    if (cMin > maxCloseMinutes) maxCloseMinutes = cMin;
  }

  if (!openToday) return { state: "closed_that_day", closesAtMin: 0 };
  if (maxCloseMinutes >= targetMinutes) return { state: "confirmed_late", closesAtMin: maxCloseMinutes };
  return { state: "closes_too_early", closesAtMin: maxCloseMinutes };
}

/**
 * Evaluate full semantic & temporal eligibility of a candidate search document
 * against the parsed moment intent and constraints.
 */
export function evaluateMomentSemanticEligibility(
  doc,
  { intentId = null, constraints = {}, nowMs = Date.now(), checkRealTimeOpen = false } = {},
) {
  TOTAL_EVALUATED += 1;
  const hardRejectReasons = [];
  const boostReasons = [];
  let boostPoints = 0;
  let confidencePenalty = 0;

  if (!doc) {
    recordSearchRejectionReason("null_doc");
    return { eligible: false, hardRejectReasons: ["null_doc"], boostPoints: 0, confidencePenalty: 0, boostReasons, semantics: null, hoursCheck: null };
  }

  // 0. Public place suppression choke point (`Indigenous Restaurant`, closed/non-public places)
  if (doc.kind === "place" && isNotPublicPlace({ place_id: doc.id, id: doc.id, name: doc.title || doc.cardName })) {
    hardRejectReasons.push("not_public_or_closed_permanently");
  }

  const sem = deriveVenueSemantics(doc);
  const D = sem.dimensions;

  // 1. Clinical & Errand Firewall (Med Spas, IV Clinics, Storage, Contractors)
  if (D.CLINICAL.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
    hardRejectReasons.push("clinical_or_medspa");
  }
  if (D.ERRAND.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
    hardRejectReasons.push("errand_or_service");
  }

  // 2. General Outing Spa Noise Filter:
  // Day spas / massage studios belong on `attractions:spa`, NEVER on "something fun tonight" / family / rainy outings
  const isMomentOuting = Boolean(
    intentId ||
    constraints.when ||
    constraints.indoor ||
    constraints.outdoor ||
    constraints.audience ||
    constraints.lowWalking ||
    constraints.excludeFood ||
    constraints.excludeShopping,
  );
  if (isMomentOuting && sem.flags.isPersonalSpa && constraints.venueFocus !== "spa") {
    hardRejectReasons.push("personal_care_spa_on_outing_query");
  }

  // 3. Indoor / Rain Constraint ("my 2 year old is losing it and it's pouring", "quiet date indoors")
  if (constraints.indoor === true && doc.kind !== "guide") {
    if (D.INDOOR.state === "false" || (D.OUTDOOR.state === SEMANTIC_CONFIDENCE.CONFIRMED && D.INDOOR.state !== SEMANTIC_CONFIDENCE.MIXED)) {
      hardRejectReasons.push("outdoor_venue_on_indoor_query");
    } else if (D.INDOOR.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
      boostPoints += 95;
      boostReasons.push("confirmed_indoor");
    } else if (D.INDOOR.state === SEMANTIC_CONFIDENCE.PROBABLE) {
      boostPoints += 40;
      boostReasons.push("probable_indoor");
    } else {
      confidencePenalty += 55;
    }
  }

  // 4. Outdoor / Before-Sunset Constraint ("outdoor thing before sunset")
  if (constraints.outdoor === true && doc.kind !== "guide") {
    if (D.OUTDOOR.state === "false" || (D.INDOOR.state === SEMANTIC_CONFIDENCE.CONFIRMED && D.OUTDOOR.state !== SEMANTIC_CONFIDENCE.MIXED)) {
      hardRejectReasons.push("indoor_only_on_outdoor_query");
    } else if (D.OUTDOOR.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
      boostPoints += 110;
      boostReasons.push("confirmed_outdoor");
    } else if (D.OUTDOOR.state === SEMANTIC_CONFIDENCE.PROBABLE) {
      boostPoints += 45;
      boostReasons.push("probable_outdoor");
    } else {
      confidencePenalty += 60;
    }
  }

  // 5. Toddler & Family Suitability ("my 2 year old is losing it and it's pouring")
  if (constraints.ageGroup === "toddlers" && doc.kind !== "guide") {
    if (D.TODDLER_SAFE.state === "false" || D.NIGHTLIFE.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
      hardRejectReasons.push("unsafe_or_unsuitable_for_toddlers");
    } else if (D.TODDLER_SAFE.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
      boostPoints += 130;
      boostReasons.push("confirmed_toddler_safe");
    } else {
      confidencePenalty += 45;
    }
  } else if (constraints.audience === "family" && doc.kind !== "guide") {
    if (D.NIGHTLIFE.state === SEMANTIC_CONFIDENCE.CONFIRMED && D.FOOD.state !== SEMANTIC_CONFIDENCE.CONFIRMED) {
      hardRejectReasons.push("adult_nightlife_on_family_query");
    } else if (D.FAMILY.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
      boostPoints += 75;
      boostReasons.push("confirmed_family_fit");
    }
  }

  // 6. Couple / Date Suitability ("cheap indoor date after 9 tonight", "quiet date indoors near Sarasota")
  if ((intentId === "date-night" || constraints.audience === "couple") && doc.kind !== "guide") {
    if (sem.flags.isKidsPlayCenter || (D.TODDLER_SAFE.state === SEMANTIC_CONFIDENCE.CONFIRMED && !D.MUSEUM.state.startsWith("conf") && !D.PARK.state.startsWith("conf"))) {
      hardRejectReasons.push("kids_venue_on_date_query");
    }
  }

  // 7. Quiet Constraint ("quiet date indoors near Sarasota")
  if (constraints.quiet === true && doc.kind !== "guide") {
    if (D.QUIET.state === "false" || sem.flags.isLoud) {
      hardRejectReasons.push("loud_venue_on_quiet_query");
    } else if (D.QUIET.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
      boostPoints += 115;
      boostReasons.push("confirmed_quiet_atmosphere");
    } else {
      confidencePenalty += 40;
    }
  }

  // 8. Low-Walking / Mobility Constraint ("my parents can't walk much, what can we do tonight")
  if (constraints.lowWalking === true && doc.kind !== "guide") {
    if (D.LOW_WALKING.state === "false" || sem.flags.isHighWalking) {
      hardRejectReasons.push("high_walking_on_mobility_query");
    } else if (D.LOW_WALKING.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
      boostPoints += 120;
      boostReasons.push("confirmed_low_walking");
    } else {
      confidencePenalty += 40;
    }
  }

  // 9. Explicit Category Negations ("no theme parks", "isn't food or shopping")
  if (constraints.excludeThemeParks === true && sem.flags.isThemePark) {
    hardRejectReasons.push("excluded_theme_park");
  }
  if (constraints.excludeFood === true && D.FOOD.state === SEMANTIC_CONFIDENCE.CONFIRMED && D.ATTRACTION.state !== SEMANTIC_CONFIDENCE.CONFIRMED) {
    hardRejectReasons.push("excluded_food");
  }
  if (constraints.excludeShopping === true && D.SHOPPING.state === SEMANTIC_CONFIDENCE.CONFIRMED) {
    hardRejectReasons.push("excluded_shopping");
  }

  // 10. Specific Venue Focus ("museum open late")
  if (constraints.venueFocus === "museum" && doc.kind !== "guide") {
    if (D.MUSEUM.state !== SEMANTIC_CONFIDENCE.CONFIRMED) {
      hardRejectReasons.push("not_a_museum");
    } else {
      boostPoints += 100;
      boostReasons.push("confirmed_museum");
    }
  }

  // 11. Owned Hours Verification for `afterHour` / `lateNight` & `openNow` + `durationMaxMin`
  let hoursCheck = null;
  if (doc.kind === "place" && Number.isFinite(constraints.afterHour)) {
    hoursCheck = checkOpenAfterHour(doc.ownedHours, constraints.afterHour, { nowMs });
    if (hoursCheck.state === "closes_too_early" || hoursCheck.state === "closed_that_day") {
      hardRejectReasons.push("closes_before_requested_hour");
    } else if (hoursCheck.state === "confirmed_late") {
      boostPoints += 145;
      boostReasons.push(`confirmed_open_after_${constraints.afterHour}h`);
    } else {
      confidencePenalty += 65;
    }
  } else if (doc.kind === "place" && checkRealTimeOpen && constraints.openNow === true && isUsableOwnedHours(doc.ownedHours, nowMs)) {
    const st = evaluateOwnedHoursStatus(doc.ownedHours, nowMs);
    hoursCheck = st;
    if (st.open === false) {
      hardRejectReasons.push("closed_right_now_by_owned_hours");
    } else if (st.open === true) {
      if (Number.isFinite(constraints.durationMaxMin) && st.nextTransition?.inMinutes != null && st.nextTransition.inMinutes < Math.min(30, constraints.durationMaxMin)) {
        hardRejectReasons.push("closing_before_minimum_visit_window");
      } else {
        boostPoints += 90;
        boostReasons.push("confirmed_open_now");
      }
    }
  }

  // Duration penalty for full-day parks on short <= 120m windows
  if (Number.isFinite(constraints.durationMaxMin) && constraints.durationMaxMin <= 120 && sem.flags.isThemePark) {
    confidencePenalty += 120;
  }

  if (hardRejectReasons.length > 0) {
    for (const r of hardRejectReasons) recordSearchRejectionReason(r);
    return {
      eligible: false,
      hardRejectReasons,
      boostPoints: 0,
      confidencePenalty: 0,
      boostReasons: [],
      semantics: sem,
      hoursCheck,
    };
  }

  const positiveConfidences = Object.values(D).map((x) => x.state);
  const summaryConfidence = positiveConfidences.includes(SEMANTIC_CONFIDENCE.CONFIRMED)
    ? SEMANTIC_CONFIDENCE.CONFIRMED
    : positiveConfidences.includes(SEMANTIC_CONFIDENCE.PROBABLE)
      ? SEMANTIC_CONFIDENCE.PROBABLE
      : SEMANTIC_CONFIDENCE.UNKNOWN;

  return {
    eligible: true,
    hardRejectReasons: [],
    boostPoints,
    confidencePenalty,
    boostReasons,
    summaryConfidence,
    semantics: sem,
    hoursCheck,
  };
}
