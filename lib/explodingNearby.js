// lib/explodingNearby.js — the pure selection law for the homepage's
// "Exploding Near You" experiment.
//
// TWO DIFFERENT ORDERS LIVE HERE, ON PURPOSE:
//   1. TREND order chooses which three EXPERIENCES earn a module. It may use
//      licensed topic momentum, local-inventory depth, match confidence and the
//      best governed score available for the concept.
//   2. PLACE order chooses which venue leads inside one experience. It uses the
//      governed Wayfind Score only (plus its existing creator/distance terms).
//
// Crossing those wires would make a global topic signal raise a venue's shown
// merit. scripts/test-exploding-nearby.mjs executes the boundary and
// scripts/check-trend-integrity.mjs forbids trend modules from entering the
// score implementation.

import { EXPLODING_NEARBY_UNIVERSE, CONCEPTS } from "./trendTaxonomy.js";
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";
import { creatorVideosFor } from "./creatorVideos.js";
import { distMeters } from "./inventoryServe.js";

export const EXPLODING_NEARBY_MAX_TRENDS = 3;
export const EXPLODING_NEARBY_RADIUS_MI = 17;
export const EXPLODING_NEARBY_MIN_PLACES = 1;

const META = new Map(EXPLODING_NEARBY_UNIVERSE.map((t) => [t.key, t]));
const SPECIFIC_EVIDENCE = new Set([
  "tag", "editorialFact", "editorialHook", "menu", "product", "scheduledEvent",
  "bookingPage", "officialSource", "manualVerification",
]);
const SCHEDULED_EVENT_CONCEPTS = new Set(["soft_clubbing", "puppy_yoga", "candlelight_concerts"]);

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const arr = (v) => Array.isArray(v) ? v : [];

export function evidenceKinds(value) {
  let list = value;
  if (typeof value === "string") {
    try { list = JSON.parse(value); } catch (e) { list = []; }
  }
  return arr(list).map((e) => typeof e === "string" ? e : e && e.kind).filter(Boolean);
}

function evidenceRows(value) {
  let list = value;
  if (typeof value === "string") {
    try { list = JSON.parse(value); } catch (e) { list = []; }
  }
  return arr(list).map((e) => typeof e === "string" ? { kind: e } : e).filter((e) => e && e.kind);
}

export function matchAvailabilityAllows(match, nowMs = Date.now()) {
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  for (const e of evidenceRows(match && match.match_evidence)) {
    const unavailableUntil = Date.parse(e.unavailableUntil || e.unavailable_until || "");
    const availableFrom = Date.parse(e.availableFrom || e.available_from || "");
    const availableUntil = Date.parse(e.availableUntil || e.available_until || "");
    if (Number.isFinite(unavailableUntil) && now < unavailableUntil) return false;
    if (Number.isFinite(availableFrom) && now < availableFrom) return false;
    if (Number.isFinite(availableUntil) && now > availableUntil) return false;
  }
  return true;
}

export function hasSpecificTrendEvidence(match, conceptKey, nowMs = Date.now()) {
  const rows = evidenceRows(match && match.match_evidence);
  if (!rows.some((e) => SPECIFIC_EVIDENCE.has(e.kind))) return false;
  if (!SCHEDULED_EVENT_CONCEPTS.has(conceptKey)) return true;
  // An event-shaped venue or a tag is not an event. These three concepts need
  // an actual current/future occurrence, not merely a place that could host it.
  return rows.some((e) => {
    if (e.kind !== "scheduledEvent") return false;
    const startsAt = Date.parse(e.startsAt || e.starts_at || "");
    const endsAt = Date.parse(e.endsAt || e.ends_at || "");
    if (!Number.isFinite(startsAt)) return false;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    return Number.isFinite(endsAt) ? endsAt >= now : startsAt >= now;
  });
}

export function inventoryDistanceMi(place, center) {
  if (!place || !center || !finite(place.lat) || !finite(place.lng) || !finite(center.lat) || !finite(center.lng)) return null;
  return distMeters(center.lat, center.lng, place.lat, place.lng) / 1609.344;
}

export function governedTrendPlace(place, center) {
  if (!place) return null;
  const signals = place.signals || {};
  const rating = finite(signals.rating) ? signals.rating : (finite(place.rating) ? place.rating : null);
  const reviews = finite(signals.reviews) ? signals.reviews : (finite(place.reviews) ? place.reviews : 0);
  const base = wayfindScore(rating, reviews);
  if (base == null) return null;
  const distanceMi = inventoryDistanceMi(place, center);
  let hasCreatorVideo = false;
  try { hasCreatorVideo = creatorVideosFor({ id: place.place_id, name: place.name }).length > 0; } catch (e) {}
  // Topic strength is deliberately absent. This is the same governed score a
  // place earns anywhere else, before it ever becomes a trend match.
  const governedScore = governedWayfindScore(base, { hasCreatorVideo, distanceMi });
  return {
    id: place.place_id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    primaryType: place.primary_type || null,
    types: arr(place.google_types),
    rating,
    reviews,
    priceLevel: finite(signals.priceNum) ? signals.priceNum : null,
    photoRef: place.photo_ref || null,
    distanceMi,
    governedScore,
    hasCreatorVideo,
    editorialHook: place.editorial_hook || null,
  };
}

function activeTopicMap(topics) {
  const out = new Map();
  for (const t of topics || []) {
    if (!t || !META.has(t.concept_key) || t.eligible === false) continue;
    const strength = Number(t.strength);
    if (!Number.isFinite(strength) || strength < 0 || strength > 1) continue;
    const current = out.get(t.topic_key);
    if (!current || strength > current.strength) out.set(t.topic_key, { ...t, strength });
  }
  return out;
}

export function selectExplodingNearby({ topics, matches, inventory, center, maxTrends = EXPLODING_NEARBY_MAX_TRENDS }) {
  if (!center || !finite(center.lat) || !finite(center.lng)) return [];
  const topicByKey = activeTopicMap(topics);
  const placeById = new Map((inventory || []).filter((p) => p && p.place_id).map((p) => [p.place_id, p]));
  const groups = new Map();

  for (const match of matches || []) {
    if (!match || match.manual_state === "deny") continue;
    const meta = META.get(match.concept_key);
    const concept = CONCEPTS[match.concept_key];
    const topic = topicByKey.get(match.topic_key);
    if (!meta || !concept || !topic) continue;
    const confidence = Number(match.semantic_confidence);
    if (!Number.isFinite(confidence) || confidence < concept.evidenceFloor) continue;
    if (!matchAvailabilityAllows(match)) continue;
    if (!hasSpecificTrendEvidence(match, match.concept_key)) continue;
    // Public copy is only written by the commercially-approved ingest path.
    // Requiring it here prevents a private/shadow match from leaking merely
    // because a serving route was accidentally pointed at the same table.
    if (!String(match.public_explanation || "").trim()) continue;

    const rawPlace = placeById.get(match.place_id);
    if (!rawPlace || rawPlace.needs_review === true) continue;
    const status = String(rawPlace.status || "OPERATIONAL").toUpperCase();
    if (status !== "OPERATIONAL") continue;
    const place = governedTrendPlace(rawPlace, center);
    if (!place || !finite(place.distanceMi) || place.distanceMi > EXPLODING_NEARBY_RADIUS_MI) continue;

    const key = match.concept_key;
    if (!groups.has(key)) groups.set(key, {
      conceptKey: key,
      topicId: match.topic_key,
      label: meta.label,
      headline: meta.headline,
      dek: meta.dek,
      trendStrength: topic.strength,
      matches: [],
    });
    groups.get(key).matches.push({
      ...place,
      matchConfidence: confidence,
      evidenceKinds: evidenceKinds(match.match_evidence),
    });
  }

  const result = [];
  for (const group of groups.values()) {
    const seen = new Set();
    group.matches = group.matches
      .filter((p) => p.id && !seen.has(p.id) && seen.add(p.id))
      .sort((a, b) => (b.governedScore - a.governedScore) || (b.reviews - a.reviews));
    if (group.matches.length < EXPLODING_NEARBY_MIN_PLACES) continue;
    const best = group.matches[0];
    const maxConfidence = Math.max(...group.matches.map((p) => p.matchConfidence));
    // This score chooses the EXPERIENCE module only. It is never copied onto a
    // place and is intentionally omitted from the returned public shape below.
    group._moduleScore =
      group.trendStrength * 100 +
      Math.min(group.matches.length, 4) * 6 +
      (best.governedScore / 10) * 2 +
      maxConfidence * 5 +
      (best.photoRef ? 2 : 0) +
      (best.hasCreatorVideo ? 2 : 0);
    result.push(group);
  }

  const max = Math.max(0, Math.min(Number(maxTrends) || EXPLODING_NEARBY_MAX_TRENDS, EXPLODING_NEARBY_MAX_TRENDS));
  const claimed = new Set();
  const selected = [];
  for (const group of result.sort((a, b) => (b._moduleScore - a._moduleScore) || a.label.localeCompare(b.label))) {
    // One venue can have several verified offerings. It still appears only once
    // in the homepage menu: the strongest trend claims it and the next trend
    // backfills from its own ranked matches.
    const matches = group.matches.filter((p) => p.id && !claimed.has(p.id));
    if (matches.length < EXPLODING_NEARBY_MIN_PLACES) continue;
    matches.forEach((p) => claimed.add(p.id));
    const { _moduleScore, trendStrength, ...publicGroup } = { ...group, matches };
    selected.push(publicGroup);
    if (selected.length >= max) break;
  }
  return selected;
}

export function explodingUniverseKeys() {
  return EXPLODING_NEARBY_UNIVERSE.map((t) => t.key);
}
