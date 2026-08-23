// lib/partnerCollections.js — geo-gated NEIGHBORHOOD PARTNER rails.
//
// The first is the Coconut Grove Neighborhood Association partnership (owner
// 2026-08-22). A branded card appears in the home feed ONLY for readers near
// Coconut Grove, and tapping it opens a curated sheet of the venues the CGNA
// asked us to feature, each carrying its live Wayfind Score.
//
// TWO PROPERTIES MAKE THIS SAFE AND HONEST:
//
//   1. GEO-GATED, HARD. A reader more than RADIUS_MI from the neighborhood
//      centre never receives the card. The owner's rule, verbatim: someone in
//      the area sees it; someone 20 miles away does NOT. partnerCollectionsNear()
//      is the single gate, and scripts/check-partner-collections.mjs pins the
//      radius at 20 so a later edit can't quietly widen a paid placement.
//
//   2. THE SCORE IS NEVER FAKED. The rating and review count below are a dated
//      snapshot from Google Places, but the number the card SHOWS is recomputed
//      at render by THE Wayfind Score (lib/wayfindScore.js) — the same formula
//      the rest of the app ranks with — so a partner venue can never display a
//      score the app itself would not give it. Refresh the snapshot by re-running
//      scripts/refresh-partner-collections.mjs; the displayed math stays honest
//      in between.
//
// The place objects are baked in the app's card shape (id/name/lat/lng/rating/
// reviews/types/photo) so the existing detail sheet renders them with no
// network round-trip and no discovery-gate involvement — a partner list is
// owner-asserted, exactly like an anchor.
import { wayfindScore } from "./wayfindScore.js";

const EARTH_MI = 3958.8;
export function milesBetween(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every((n) => Number.isFinite(n))) return Infinity;
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_MI * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const photoUrl = (ref) => (ref ? "/api/photo?ref=" + encodeURIComponent(ref) + "&w=640" : null);


// The collections. Each declares its own geo-gate (centre + radius) and its
// splash art. Adding a second neighborhood is a new entry here — nothing in
// home.js changes.
export const PARTNER_COLLECTIONS = [
  {
    id: "coconut-grove",
    partner: "Coconut Grove Neighborhood Association",
    // The AMAZON-RAIL tile (the horizontal promo rail). `tileArt` is the
    // basename in /public/cards-v8 (avif/webp/jpg at 380w + 760w), generated
    // from the sponsor art — so the tile IS the card, exactly like every other
    // rail tile whose headline lives in pixels.
    tileArt: "coconut-grove",
    tileTitle: "Coconut Grove",
    tileShort: "What's happening in the Grove",
    // Sheet-header copy (the splash carries its own title art)
    eyebrow: "CGNA × Wayfind · Top Sponsor",
    title: "What's Happening in Coconut Grove?",
    sub: "We already found what's worth showing up for.",
    cta: "Discover Coconut Grove",
    accent: "#2FB39B",           // the Grove teal
    // The sheet hero — the partner's own art (public/partners/coconut-grove.png)
    heroImage: "/partners/coconut-grove.png",
    creditLine: "Curated locally · Ranked by Wayfind · In partnership with the Coconut Grove Neighborhood Association",
    // THE GATE. 20 miles from the neighborhood centre, per the owner.
    center: { lat: 25.7272, lng: -80.2578 },
    radiusMi: 20,
  },
];

/**
 * Every partner collection whose gate contains (lat,lng). Empty when the reader
 * is outside every gate — the common case, and the whole point: a Coconut Grove
 * placement must not render in Tampa. Nearest-centre first when more than one
 * ever overlaps.
 */
export function partnerCollectionsNear(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return PARTNER_COLLECTIONS
    .map((c) => ({ c, mi: milesBetween(lat, lng, c.center.lat, c.center.lng) }))
    .filter((x) => x.mi <= x.c.radiusMi)
    .sort((a, b) => a.mi - b.mi)
    .map((x) => x.c);
}

/** A collection by id, or null. */
export function partnerCollectionById(id) {
  return PARTNER_COLLECTIONS.find((c) => c.id === id) || null;
}

/**
 * The SYNTHETIC amazon-rail tile for the reader's location, or null. home.js
 * passes this to DaypartRail, which pins it to the front of the rail. Because
 * it is built from partnerCollectionsNear(), the tile is ALREADY geo-gated:
 * outside every gate this returns null and no sponsor tile renders.
 */
export function sponsorRailNear(lat, lng) {
  const c = partnerCollectionsNear(lat, lng)[0];
  if (!c) return null;
  return { id: "sponsor-" + c.id, art: c.tileArt, title: c.tileTitle, short: c.tileShort, sponsor: true, partner: c.id };
}

/**
 * Turn a collection into the { places, ... } payload the home detail sheet
 * consumes. Adds distMi from the reader and the LIVE Wayfind Score (never the
 * baked snapshot), and routes photos through the app's own /api/photo proxy.
 */
export function hydratePartnerCollection(collection, places, center) {
  if (!collection) return null;
  const here = center && Number.isFinite(center.lat) ? center : collection.center;
  const list = (places || []).map((p) => ({
    id: p.id,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    distMi: milesBetween(here.lat, here.lng, p.lat, p.lng),
    rating: p.rating,
    reviews: p.reviews,
    wfScore: wayfindScore(typeof p.rating === "number" ? p.rating : 0, p.reviews || 0),
    types: Array.isArray(p.types) ? p.types : [],
    photo: photoUrl(p.photoRef),
    openNow: null,
    businessStatus: "OPERATIONAL",
    _partner: collection.id,          // provenance: this card came from a partner list
  }));
  return {
    id: "partner-" + collection.id,
    key: "partner-" + collection.id,
    theme: "partner-" + collection.id,
    label: collection.eyebrow,
    emoji: "🌴",
    themeTitle: collection.title,
    take: collection.sub,
    accent: collection.accent,
    heroImage: collection.heroImage,
    partnerSplash: true,              // HookDetail suppresses its own title overlay
    creditLine: collection.creditLine,
    places: list,
  };
}
