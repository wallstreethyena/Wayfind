// lib/experienceEntityResolution.js — Deterministic entity-resolution pipeline
// connecting wf_experiences, PARTNER_OFFER_REGISTRY, PLACE_PARTNER_PICKS, and
// VENUE_OFFERS to Wayfind places (wf_inventory).
//
// Confidence tiers:
//   - EXACT:           Safe for primary CTA (exact venue/operator match + same
//                      market/metro + live/serveable + non-beach + not pass-by).
//   - HIGH_CONFIDENCE: Safe for secondary / nearby experience section (same
//                      market + strong title/token overlap, but not venue admission).
//   - AMBIGUOUS:       Hold for human review (partial token overlap or missing
//                      market verification). Never auto-wired to primary CTA.
//   - WRONG:           Permanently blocked (beach, wrong city/state, retired/dead
//                      SKU, pass-by trolley/segway tour, or launch-site mismatch).

import { isHeldPartnerOffer } from "./partnerOfferHolds.js";
import {
  PLACE_PARTNER_PICKS,
  RETIRED_VIATOR_PINS,
  isBeachPlace,
  pinServeability,
} from "./placePartnerPicks.js";
import { VENUE_OFFERS } from "./venueOffers.js";

export const ENTITY_RESOLUTION_TIERS = Object.freeze({
  EXACT: "EXACT",
  HIGH_CONFIDENCE: "HIGH_CONFIDENCE",
  AMBIGUOUS: "AMBIGUOUS",
  WRONG: "WRONG",
});

// Explicit launch-site / pass-by exclusions learned from live audits:
//   - The Ringling: Viator trolley/city tours only drive past; never admission.
//   - Kelly Park - Rock Springs: Clear kayak tour (123164P1) launches at Kings
//     Landing (5722 Baptist Camp Rd), not inside Kelly Park's tubing gate.
//   - Sunken Gardens: Segway tour only passes by; not garden admission.
//   - Mallory Square: Free public square; pass-by tours sell the wrong thing.
export const PERMANENT_ENTITY_EXCLUSIONS = Object.freeze([
  { placeName: "The Ringling", reason: "pass-by-trolley-not-admission" },
  { placeName: "Kelly Park - Rock Springs", reason: "launches-at-kings-landing-not-park-gate" },
  { placeName: "Sunken Gardens", reason: "pass-by-segway-not-admission" },
  { placeName: "Mallory Square", reason: "free-public-square" },
  { placeName: "TreeUmph! Adventure Course", reason: "retired-unavailable-sku" },
]);

const METRO_GROUPS = Object.freeze([
  new Set(["sarasota", "bradenton", "palmetto", "anna maria", "anna maria island", "holmes beach", "bradenton beach", "longboat key", "siesta key", "lido key", "venice", "nokomis", "osprey", "englewood", "north port", "lakewood ranch", "ellenton", "parrish", "cortez"]),
  new Set(["tampa", "st petersburg", "saint petersburg", "st pete", "clearwater", "clearwater beach", "st pete beach", "treasure island", "madeira beach", "indian rocks beach", "dunedin", "safety harbor", "tarpon springs", "brandon", "riverview", "plant city", "apollo beach", "ruskin", "tierra verde", "ybor city"]),
  new Set(["orlando", "kissimmee", "winter park", "apopka", "sanford", "lake buena vista", "celebration", "clermont", "altamonte springs", "maitland", "oviedo", "st cloud", "kenansville", "winter haven", "davenport"]),
  new Set(["cocoa beach", "merritt island", "cape canaveral", "titusville", "melbourne", "palm bay", "kennedy space center"]),
  new Set(["miami", "miami beach", "coral gables", "coconut grove", "key biscayne", "homestead", "doral", "hialeah", "aventura", "sunny isles beach", "fort lauderdale", "davie", "weston", "hollywood", "sunrise", "pompano beach"]),
  new Set(["st augustine", "saint augustine", "st augustine beach", "ponte vedra"]),
  new Set(["key west", "islamorada", "key largo", "marathon", "big pine key", "tavernier"]),
  new Set(["crystal river", "homosassa", "dunnellon", "weeki wachee", "inverness", "lecanto"]),
  new Set(["new york", "new york city", "nyc", "manhattan", "brooklyn", "queens", "bronx"]),
  new Set(["chicago", "gurnee", "evanston", "oak park"]),
]);

const STOP_TOKENS = new Set([
  "the", "and", "for", "with", "from", "near", "tour", "tours", "ticket",
  "tickets", "admission", "pass", "day", "trip", "guided", "experience",
  "adventure", "adventures", "florida", "park", "state", "city", "downtown",
]);

export function normalizeEntityText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantTokens(value) {
  return normalizeEntityText(value)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

function extractPlaceCity(place) {
  if (!place) return "";
  for (const raw of [place.postalCity, place.locality, place.city]) {
    const c = normalizeEntityText(String(raw || "").split(",")[0]);
    if (c) return c;
  }
  if (typeof place.address === "string" && place.address.includes(",")) {
    const parts = place.address.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[parts.length - 2].replace(/\b(?:FL|NY|IL|CA|NV|NC|GA|TX|DC|USA)\b/gi, "").trim();
      const norm = normalizeEntityText(candidate);
      if (norm && !/^\d+$/.test(norm)) return norm;
    }
  }
  return "";
}

function extractPlaceState(place) {
  if (!place) return "";
  if (typeof place.state === "string" && place.state.trim()) {
    return place.state.trim().toUpperCase();
  }
  if (typeof place.address === "string") {
    const m = place.address.match(/,\s*([A-Z]{2})(?:\s+\d{5})?(?:,\s*USA)?\s*$/);
    if (m) return m[1].toUpperCase();
  }
  return "";
}

export function sameMetroOrMarket(cityA, cityB) {
  const a = normalizeEntityText(String(cityA || "").split(",")[0]);
  const b = normalizeEntityText(String(cityB || "").split(",")[0]);
  if (!a || !b) return false;
  if (a === b) return true;
  for (const group of METRO_GROUPS) {
    if (group.has(a) && group.has(b)) return true;
  }
  return false;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isBareFreePark(place) {
  if (!place) return false;
  const types = Array.isArray(place.types) ? place.types.map((t) => String(t).toLowerCase()) : [];
  const name = normalizeEntityText(place.name);
  const hasCommercialType = types.some((t) =>
    /amusement_park|water_park|theme_park|zoo|aquarium|museum|performing_arts_theater|stadium|arena|botanical_garden|tour|kayak|boat/.test(t)
  );
  if (hasCommercialType) return false;
  if (/\b(?:kayak|tours?|charters?|ferry|cruise|rentals?|adventures?|museum|zoo|aquarium|gardens?|speedway|stadium|arena|ballpark|theatre|theater)\b/.test(name)) {
    return false;
  }
  return types.includes("park") || types.includes("dog_park") || types.includes("playground") || /\b(?:neighborhood\s+park|community\s+park|dog\s+park|skate\s+park|playground)\b/.test(name);
}

/**
 * Classify a candidate experience/offer against a Wayfind place into one of:
 *   EXACT | HIGH_CONFIDENCE | AMBIGUOUS | WRONG
 *
 * @param {object} place  Wayfind place ({ id, name, address, city, lat, lng, types, category })
 * @param {object} offer  Candidate offer ({ offerId, productCode, provider, title, city, market, lat, lng, link_ok, operator, aliases })
 * @param {object} [catalog] Optional Viator catalog snapshot
 * @returns {{ tier: string, reason: string, score: number }}
 */
export function resolveExperienceEntityMatch(place, offer, catalog) {
  if (!place || !place.name || !offer) {
    return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "missing-input", score: 0 };
  }

  // 1. Beach & bare free park veto: never attach a paid ticket to free sand or a neighborhood playground.
  if (isBeachPlace(place)) {
    return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "beach-never-bookable", score: 0 };
  }

  const placeNameNorm = normalizeEntityText(place.name);
  for (const excl of PERMANENT_ENTITY_EXCLUSIONS) {
    if (normalizeEntityText(excl.placeName) === placeNameNorm) {
      return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: excl.reason, score: 0 };
    }
  }

  // 2. Dead / retired / held offer veto.
  const code = String(offer.offerId || offer.productCode || offer.product_code || "").trim();
  const provider = String(offer.provider || "viator").toLowerCase();
  if (code && isHeldPartnerOffer(code)) {
    return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "held-partner-offer", score: 0 };
  }
  if (offer.link_ok === false) {
    return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "offer-link-dead", score: 0 };
  }
  if (provider === "viator" && code) {
    const serve = pinServeability({ provider: "viator", offerId: code }, catalog);
    if (!serve.serveable) {
      return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: serve.reason || "unserveable-pin", score: 0 };
    }
  }

  // 3. Geographic / cross-metro / cross-state boundary check.
  const placeCity = extractPlaceCity(place);
  const placeState = extractPlaceState(place);
  const offerCities = Array.isArray(offer.market)
    ? offer.market
    : [offer.city, offer.searchCity, offer.region].filter(Boolean);

  if (placeState && offer.state && placeState !== String(offer.state).toUpperCase()) {
    return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "cross-state-mismatch", score: 0 };
  }

  // Coordinate distance check when both carry valid coordinates
  const pLat = place.lat != null && place.lat !== "" ? Number(place.lat) : NaN;
  const pLng = place.lng != null && place.lng !== "" ? Number(place.lng) : NaN;
  const oLat = offer.lat != null && offer.lat !== "" ? Number(offer.lat) : NaN;
  const oLng = offer.lng != null && offer.lng !== "" ? Number(offer.lng) : NaN;
  if (Number.isFinite(pLat) && Number.isFinite(pLng) && Number.isFinite(oLat) && Number.isFinite(oLng)) {
    const distKm = haversineKm(pLat, pLng, oLat, oLng);
    if (distKm > 45) {
      return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "coordinate-distance-exceeded", score: 0 };
    }
  }

  if (placeCity && offerCities.length > 0) {
    const marketMatches = offerCities.some((m) => sameMetroOrMarket(placeCity, m));
    if (!marketMatches) {
      return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "wrong-city-or-metro", score: 0 };
    }
  }

  // 4. Pass-by trolley / bus / segway veto when the target place is a museum/garden/park
  const offerTitleNorm = normalizeEntityText(offer.title || offer.name || "");
  if (
    /\b(?:hop\s+on\s+hop\s+off|trolley\s+tour|segway\s+tour|city\s+sightseeing\s+bus)\b/.test(offerTitleNorm) &&
    !/\b(?:trolley|segway|bus)\b/.test(placeNameNorm)
  ) {
    return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "pass-by-transit-not-venue-admission", score: 0 };
  }

  // 5. Exact alias / placeId match in verified registries
  const registryAliases = [];
  if (code) {
    for (const row of PLACE_PARTNER_PICKS) {
      if (String(row.offerId || "").toUpperCase() === code.toUpperCase() && Array.isArray(row.aliases)) {
        registryAliases.push(...row.aliases);
      }
    }
    for (const row of VENUE_OFFERS) {
      if (String(row.offerId || "").toUpperCase() === code.toUpperCase() && Array.isArray(row.names)) {
        registryAliases.push(...row.names);
      }
    }
  }
  const aliases = [
    ...(Array.isArray(offer.aliases) ? offer.aliases : []),
    ...(Array.isArray(offer.names) ? offer.names : []),
    ...registryAliases,
    offer.operator,
    offer.venueName,
  ]
    .filter(Boolean)
    .map(normalizeEntityText);

  const placeIdMatch =
    place.id &&
    Array.isArray(offer.placeIds) &&
    offer.placeIds.includes(String(place.id));

  const exactAliasMatch =
    aliases.includes(placeNameNorm) ||
    (offerTitleNorm && offerTitleNorm === placeNameNorm);

  if (placeIdMatch || exactAliasMatch) {
    if (isBareFreePark(place) && !aliases.includes(placeNameNorm)) {
      return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "bare-free-park-no-ticket", score: 0, eligibleForPrimaryCta: false };
    }
    return {
      tier: ENTITY_RESOLUTION_TIERS.EXACT,
      reason: placeIdMatch ? "verified-place-id-match" : "verified-exact-alias-match",
      score: 1.0,
      eligibleForPrimaryCta: true,
    };
  }

  if (isBareFreePark(place)) {
    return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "bare-free-park-no-ticket", score: 0, eligibleForPrimaryCta: false };
  }

  // 6. Token similarity & operator/title containment check
  const pTokens = significantTokens(place.name);
  const oTokens = new Set([
    ...significantTokens(offer.title || ""),
    ...significantTokens(offer.operator || ""),
    ...aliases.flatMap((a) => significantTokens(a)),
  ]);

  if (pTokens.length === 0 || oTokens.size === 0) {
    return { tier: ENTITY_RESOLUTION_TIERS.WRONG, reason: "insufficient-tokens", score: 0 };
  }

  const hits = pTokens.filter((t) => oTokens.has(t));
  const overlap = hits.length / pTokens.length;

  // Full phrase containment in title + confirmed same metro
  const titleContainsPlace =
    placeNameNorm.length >= 6 &&
    offerTitleNorm.includes(placeNameNorm) &&
    placeCity &&
    offerCities.some((m) => sameMetroOrMarket(placeCity, m));

  if (titleContainsPlace && overlap >= 0.8) {
    return {
      tier: ENTITY_RESOLUTION_TIERS.HIGH_CONFIDENCE,
      reason: "title-names-venue-in-same-metro",
      score: Number(overlap.toFixed(2)),
    };
  }

  if (overlap >= 0.6 && hits.length >= 2) {
    return {
      tier: ENTITY_RESOLUTION_TIERS.AMBIGUOUS,
      reason: "partial-token-overlap-hold-for-review",
      score: Number(overlap.toFixed(2)),
    };
  }

  return {
    tier: ENTITY_RESOLUTION_TIERS.WRONG,
    reason: "unrelated-entity",
    score: Number(overlap.toFixed(2)),
  };
}

/**
 * Audit a batch of candidate places against PLACE_PARTNER_PICKS, VENUE_OFFERS,
 * and optional wf_experiences rows, returning bucketed resolution results.
 */
export function auditEntityResolutionBatch(places = [], extraExperiences = [], catalog = undefined) {
  const results = {
    EXACT: [],
    HIGH_CONFIDENCE: [],
    AMBIGUOUS: [],
    WRONG: [],
  };

  const retiredSet = new Set(RETIRED_VIATOR_PINS.map((r) => String(r.offerId).toUpperCase()));

  for (const place of Array.isArray(places) ? places : []) {
    if (!place || !place.name) continue;
    let best = null;

    for (const row of PLACE_PARTNER_PICKS) {
      if (row.provider === "viator" && retiredSet.has(String(row.offerId).toUpperCase())) continue;
      const res = resolveExperienceEntityMatch(place, row, catalog);
      if (res.tier === ENTITY_RESOLUTION_TIERS.EXACT) {
        best = { place: place.name, offerId: row.offerId, provider: row.provider, ...res };
        break;
      }
    }

    if (!best) {
      for (const row of VENUE_OFFERS) {
        const res = resolveExperienceEntityMatch(place, row, catalog);
        if (res.tier === ENTITY_RESOLUTION_TIERS.EXACT) {
          best = { place: place.name, offerId: row.offerId, provider: row.provider, ...res };
          break;
        }
      }
    }

    if (!best) {
      for (const exp of Array.isArray(extraExperiences) ? extraExperiences : []) {
        const res = resolveExperienceEntityMatch(place, exp, catalog);
        if (!best || res.score > best.score) {
          best = {
            place: place.name,
            offerId: exp.offerId || exp.product_code || exp.productCode || null,
            provider: exp.provider || "viator",
            ...res,
          };
        }
      }
    }

    if (!best) {
      best = {
        place: place.name,
        offerId: null,
        provider: null,
        tier: ENTITY_RESOLUTION_TIERS.WRONG,
        reason: "no-matching-inventory",
        score: 0,
      };
    }

    results[best.tier].push(best);
  }

  return results;
}
