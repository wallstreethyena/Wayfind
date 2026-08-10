// The launch feed uses the owner-supplied 20-trend list as its trend source.
// It does not call Semrush or Exploding Topics. Google Places is used only to
// resolve current local inventory for those declared concepts; Wayfind's
// governed score still decides which place leads inside each trend.

import { EXPLODING_NEARBY_UNIVERSE, CONCEPTS } from "./trendTaxonomy.js";
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";

export const LAUNCH_SEARCH_BATCH = 4;
export const LAUNCH_MATCH_LIMIT = 4;
export const LAUNCH_RADIUS_MI = 17;

// These concepts require a dated occurrence, not a place that could plausibly
// host one. Google Places text search cannot establish that, so the live place
// resolver skips them until an event record supplies scheduled evidence.
export const SCHEDULE_REQUIRED = new Set(["soft_clubbing", "puppy_yoga", "candlelight_concerts"]);

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const clean = (v) => String(v == null ? "" : v).trim();

// Text Search returns related venues as well as exact offering matches. These
// concept-specific name checks are the second proof: a generic cafe returned
// for "hojicha latte" is still rejected, while Smashburger, a sauna studio, or
// Club Pilates can establish the narrow offering in its own identity.
const NAME_EVIDENCE = {
  smash_burgers: /\bsmash(?:ed|burger| burgers?)?\b/i,
  cold_plunge_sauna: /\b(?:cold[ -]?plunge|sauna)\b/i,
  social_wellness_clubs: /\b(?:social wellness|wellness club)\b/i,
  hojicha_lattes: /\bhojicha\b/i,
  immersive_gamebox: /\bimmersive game\s*box\b/i,
  dubai_chocolate: /\b(?:dubai chocolate|kunafa chocolate)\b/i,
  black_sesame_lattes: /\bblack[ -]?sesame\b/i,
  hwachae: /\bhwachae\b/i,
  tanghulu: /\btanghulu\b/i,
  kunafa: /\b(?:kunafa|knafeh|kanafeh)\b/i,
  protein_ice_cream: /\bprotein(?: ice cream)?\b/i,
  immersive_dining: /\bimmersive dining\b/i,
  pilates_reformer: /\b(?:pilates|reformer)\b/i,
  rucking: /\bruck(?:ing)?\b/i,
  breathwork: /\bbreath[ -]?work\b/i,
  forest_bathing: /\bforest bath(?:ing)?\b/i,
  kintsugi: /\bkintsugi\b/i,
};

function distanceMi(a, b) {
  if (!a || !b || !finite(a.lat) || !finite(a.lng) || !finite(b.lat) || !finite(b.lng)) return null;
  const R = 3958.7613, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const placeName = (p) => clean(typeof p.displayName === "string" ? p.displayName : p.displayName && p.displayName.text) || clean(p.name);
const placeLocation = (p) => ({
  lat: finite(p && p.location && p.location.latitude) ? p.location.latitude : (finite(p && p.lat) ? p.lat : null),
  lng: finite(p && p.location && p.location.longitude) ? p.location.longitude : (finite(p && p.lng) ? p.lng : null),
});

export function placeFromGoogle(raw, conceptKey, center) {
  const concept = CONCEPTS[conceptKey];
  if (!raw || !concept || !clean(raw.id || raw.place_id)) return null;
  const status = clean(raw.businessStatus || raw.business_status || "OPERATIONAL").toUpperCase();
  if (status !== "OPERATIONAL") return null;
  const types = Array.isArray(raw.types) ? raw.types.map((t) => clean(t).toLowerCase()).filter(Boolean) : [];
  const denied = new Set((concept.denyTypes || []).map((t) => clean(t).toLowerCase()));
  if (types.some((t) => denied.has(t))) return null;
  const allowed = new Set([...(concept.primaryTypes || []), ...(concept.types || [])].map((t) => clean(t).toLowerCase()));
  if (!types.some((t) => allowed.has(t))) return null;
  const name = placeName(raw);
  const nameProof = NAME_EVIDENCE[conceptKey];
  if (!nameProof || !nameProof.test(name)) return null;

  const loc = placeLocation(raw);
  const dist = distanceMi(center, loc);
  if (!finite(dist) || dist > LAUNCH_RADIUS_MI) return null;
  const rating = Number(raw.rating);
  const reviews = Number(raw.userRatingCount ?? raw.reviews ?? 0);
  const base = wayfindScore(finite(rating) ? rating : null, finite(reviews) ? reviews : 0);
  if (base == null) return null;
  const photoRef = raw.photo_ref || (Array.isArray(raw.photos) && raw.photos[0] && raw.photos[0].name) || null;
  return {
    id: clean(raw.id || raw.place_id),
    name,
    lat: loc.lat,
    lng: loc.lng,
    rating,
    reviews: finite(reviews) ? reviews : 0,
    category: concept.categories && concept.categories[0],
    primaryType: types.find((t) => (concept.primaryTypes || []).includes(t)) || types[0] || null,
    types,
    photoRef,
    distanceMi: dist,
    governedScore: governedWayfindScore(base, { distanceMi: dist }),
    hasCreatorVideo: false,
    editorialHook: null,
    evidenceKinds: ["googleTextSearch"],
  };
}

function searchQuery(meta, city) {
  const concept = CONCEPTS[meta.key];
  const where = clean(city) || "near me";
  return clean((concept.query || meta.label).replace("{metro}", where));
}

async function searchOne(meta, center, city, fetchImpl, signal) {
  const params = new URLSearchParams({
    q: searchQuery(meta, city),
    lat: center.lat.toFixed(5),
    lng: center.lng.toFixed(5),
    radius: String(Math.round(LAUNCH_RADIUS_MI * 1609.344)),
    n: "8",
  });
  const response = await fetchImpl("/api/places/search?" + params.toString(), { cache: "no-store", signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Google place search failed (${response.status})`);
  if (body.gate === "shut") throw new Error("Google place search is disabled by WAYFIND_GATE");
  const seen = new Set();
  const matches = (Array.isArray(body.places) ? body.places : [])
    .map((p) => placeFromGoogle(p, meta.key, center))
    .filter((p) => p && p.name && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => (b.governedScore - a.governedScore) || (b.reviews - a.reviews))
    .slice(0, LAUNCH_MATCH_LIMIT);
  return matches.length ? { conceptKey: meta.key, label: meta.label, headline: meta.headline, dek: meta.dek, matches } : null;
}

export async function loadProvidedTrendList({ center, city, fetchImpl = fetch, signal } = {}) {
  if (!center || !finite(center.lat) || !finite(center.lng)) {
    return { status: "invalid_location", trends: [], error: "A valid location is required." };
  }
  const searchable = EXPLODING_NEARBY_UNIVERSE.filter((meta) => !SCHEDULE_REQUIRED.has(meta.key));
  const claimed = new Set();
  const trends = [];
  let successfulSearches = 0;
  let lastError = null;

  for (let i = 0; i < searchable.length && trends.length < 3; i += LAUNCH_SEARCH_BATCH) {
    const batch = searchable.slice(i, i + LAUNCH_SEARCH_BATCH);
    const settled = await Promise.allSettled(batch.map((meta) => searchOne(meta, center, city, fetchImpl, signal)));
    for (const result of settled) {
      if (result.status === "rejected") { lastError = result.reason; continue; }
      successfulSearches++;
      const trend = result.value;
      if (!trend) continue;
      const unique = trend.matches.filter((p) => p.id && !claimed.has(p.id));
      if (!unique.length) continue;
      unique.forEach((p) => claimed.add(p.id));
      trends.push({ ...trend, matches: unique });
      if (trends.length >= 3) break;
    }
  }

  if (trends.length) return { status: "ok", source: "provided-20-trend-list", trends };
  if (!successfulSearches && lastError) {
    return { status: "trend_data_error", trends: [], error: "Trend recommendations are temporarily unavailable." };
  }
  return { status: "no_verified_inventory", source: "provided-20-trend-list", trends: [] };
}
