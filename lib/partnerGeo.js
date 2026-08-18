// lib/partnerGeo.js — city-rail admission for partner/affiliate offers.
//
// THE RULE: a product is in a city's events/experiences rail only when we can
// prove it belongs to that city with a destination ID or coordinates. Title
// tokens are never evidence. "The Big Apple Coaster / Mad Apple at New York
// New York Hotel and Casino" is a Las Vegas product (Viator d684). Matching
// the word "York" against "New York City" is how it leaked into NYC rails.
//
// Fail closed: no dest id and no coords → not in the rail.
// If the offer's dest id (or coords) names a different city than the one
// requested, hide the affiliate offer. Ranking is never for sale; this only
// decides geography.

const DEST_NORM = (id) => String(id || "").replace(/^d/i, "").toLowerCase().trim();

const CITY_RADIUS_MI = 40;

function toRad(d) { return (d * Math.PI) / 180; }

export function milesBetween(aLat, aLng, bLat, bLng) {
  const R = 3958.8;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function offerDestIds(offer) {
  if (!offer) return [];
  const raw = [];
  if (Array.isArray(offer.destinations)) {
    for (const d of offer.destinations) {
      if (!d) continue;
      raw.push(d.ref, d.destinationId, d.id, d.destId);
    }
  }
  raw.push(offer.destId, offer.destinationId, offer.destinationRef);
  return [...new Set(raw.filter(Boolean).map(DEST_NORM).filter(Boolean))];
}

export function offerCoords(offer) {
  if (!offer) return null;
  const c = offer.coordinates || offer.geo || {};
  const lat = Number(offer.lat ?? offer.latitude ?? c.lat ?? c.latitude);
  const lng = Number(offer.lng ?? offer.longitude ?? c.lng ?? c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function requestedDest(requested) {
  return DEST_NORM(requested && (requested.destId || requested.destinationId));
}

function requestedCenter(requested) {
  if (!requested) return null;
  const lat = Number(requested.lat ?? requested.latitude);
  const lng = Number(requested.lng ?? requested.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function requestedRadius(requested) {
  const n = Number(requested && requested.radiusMi);
  return Number.isFinite(n) && n > 0 ? n : CITY_RADIUS_MI;
}

/**
 * True only when the offer belongs to the requested city by destination ID
 * and/or coordinates. Title is ignored. Organic-city / offer-city disagreement
 * hides the affiliate offer.
 */
export function offerBelongsToRequestedCity(offer, requested) {
  if (!offer || !requested) return false;
  const reqDest = requestedDest(requested);
  const ids = offerDestIds(offer);
  const coords = offerCoords(offer);
  const center = requestedCenter(requested);
  const radius = requestedRadius(requested);

  const destMatch = !!(reqDest && ids.includes(reqDest));
  const destConflict = ids.length > 0 && !!reqDest && !ids.includes(reqDest);
  const coordMatch = !!(coords && center && milesBetween(coords.lat, coords.lng, center.lat, center.lng) <= radius);
  const coordConflict = !!(coords && center && milesBetween(coords.lat, coords.lng, center.lat, center.lng) > radius);

  // Hide affiliate offers when organic city and offer city disagree.
  if (destConflict) return false;
  if (coordConflict && !destMatch) return false;
  if (destMatch && coordConflict) return false;

  if (destMatch) return true;
  if (coordMatch) return true;
  return false;
}

export function filterOffersForCity(offers, requested) {
  if (!Array.isArray(offers)) return [];
  return offers.filter((o) => offerBelongsToRequestedCity(o, requested));
}
