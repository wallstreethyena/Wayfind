// A small owned-inventory candidate supplement for Florida's major attraction
// identities. This registry never creates a card and never changes a score:
// callers must resolve these IDs from wf_inventory, then this module applies
// the same category/chip and exact-radius admission as the ordinary browse
// pool before merging everything back into one score-ordered list.
//
// Deliberately no commerce imports. A venue's affiliate relationship is not a
// discovery or ranking signal.
import { CHIP_IDENTITY, chipIdentity } from "./chipIdentity.js";
import { CAT_ALLOW, CAT_EXCLUDE, placeAllowed } from "./placeFilter.js";
import { wayfindScore } from "./wayfindScore.js";

import { ATTRACTION_DISCOVERY_IDS } from "./tripAttractions.js";
export { ATTRACTION_DISCOVERY_IDS } from "./tripAttractions.js";

const DISCOVERY_CATS = new Set(["family", "attractions"]);
const EARTH_RADIUS_M = 6371000;

function normalizedRequest(cat, sub) {
  const category = String(cat || "").toLowerCase();
  const chip = String(sub || "all").toLowerCase() || "all";
  if (!DISCOVERY_CATS.has(category) || !CHIP_IDENTITY[`${category}:${chip}`]) return null;
  return { category, chip };
}

export function attractionDiscoveryPlaceIds(cat, sub = "all") {
  return normalizedRequest(cat, sub) ? ATTRACTION_DISCOVERY_IDS : [];
}

function identityShape(place) {
  return {
    id: place && place.id,
    name: String((place && (place.name || (place.displayName && place.displayName.text))) || ""),
    types: Array.isArray(place && place.types) ? place.types : [],
    primaryType: (place && (place.primaryType || place.primary_type)) || null,
    primary_type: (place && (place.primary_type || place.primaryType)) || null,
    category: place && place.category,
  };
}

function virtualFamilyAllows(place) {
  const shaped = identityShape(place);
  const hay = [...shaped.types, shaped.primaryType || "", shaped.name].join(" ");
  return CAT_ALLOW.family.test(hay) && !CAT_EXCLUDE.family.test(hay);
}

function pointOf(place) {
  const location = place && place.location;
  const rawLat = place && place.lat != null ? place.lat : location && location.latitude;
  const rawLng = place && place.lng != null ? place.lng : location && location.longitude;
  if (rawLat == null || rawLng == null) return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function attractionDistanceM(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return Infinity;
  const rad = (n) => n * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function attractionDiscoveryEligible(place, { cat, sub = "all", lat, lng, radiusM } = {}) {
  const request = normalizedRequest(cat, sub);
  const origin = { lat: Number(lat), lng: Number(lng) };
  const point = pointOf(place);
  const radius = Number(radiusM);
  if (!request || !point || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || !Number.isFinite(radius) || radius <= 0) return false;
  if (attractionDistanceM(origin, point) > radius) return false;
  const shaped = identityShape(place);
  if (!shaped.id || !ATTRACTION_DISCOVERY_IDS.includes(String(shaped.id)) || !shaped.name) return false;
  if (request.category === "family" && !virtualFamilyAllows(shaped)) return false;
  return placeAllowed(request.category, request.chip, shaped)
    && chipIdentity(request.category, request.chip, shaped);
}

function scoreOf(place) {
  const rating = Number(place && place.rating);
  const reviews = Number(place && (place.userRatingCount != null ? place.userRatingCount : place.reviews));
  return wayfindScore(rating, Number.isFinite(reviews) ? reviews : 0) || 0;
}

// Supplement the candidate set, then rank the combined set. Registry order is
// never used, and the result is deliberately not sliced: the caller's broad
// inventory cap cannot discard an exact owned candidate a second time.
export function mergeAttractionDiscovery(base, candidates, request) {
  const all = [];
  const seen = new Set();
  // The broad reader already applied its native category/chip contract. Keep
  // that membership intact; this supplement must never become a second,
  // six-ID-specific veto over rows the ordinary inventory path admitted.
  for (const place of (Array.isArray(base) ? base : [])) {
    if (!place || !place.id || seen.has(String(place.id))) continue;
    seen.add(String(place.id));
    all.push(place);
  }
  for (const place of (Array.isArray(candidates) ? candidates : [])) {
    if (!place || !place.id || seen.has(String(place.id))) continue;
    if (!attractionDiscoveryEligible(place, request)) continue;
    seen.add(String(place.id));
    all.push(place);
  }
  return all.sort((a, b) => scoreOf(b) - scoreOf(a));
}

// Route orchestration kept pure and injectable so the guard executes the
// actual branching contract: unsupported requests perform one unchanged broad
// read; supported requests resolve broad + exact inventory at the same radius.
export async function loadAttractionDiscovery(request, { readCategory, readIds } = {}) {
  if (typeof readCategory !== "function" || typeof readIds !== "function") throw new Error("Attraction discovery readers are required");
  const ids = attractionDiscoveryPlaceIds(request && request.cat, request && request.sub);
  const broad = readCategory(request);
  if (!ids.length) return await broad;
  const [base, candidates] = await Promise.all([broad, readIds(ids, request)]);
  return mergeAttractionDiscovery(base, candidates, request);
}
