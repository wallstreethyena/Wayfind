// lib/intentPages.js — data spine for the hero-card destination pages
// (date-night, family — stamped from the /best-beaches standard). Queries
// per intent + daypart mirror the in-app EXPERIENCES definitions; results
// come from our own guarded /api/places/search, are floored on REAL rating
// depth (family = the not-hidden-gems rule: proven, high-volume places),
// ranked by the ONE Bayesian score, and never decorated with claims the
// data doesn't carry. Pure helpers exported for the lock test.
export const INTENT_PAGES = {
  "date-night": {
    eyebrow: "Date night, decided",
    accent: "#F472B6",
    art: "/cards/date-night.jpg",
    floor: { rating: 4.4, reviews: 150 },
    // Owner (2026-07-21, follow-up): the same distance rule as family —
    // -0.2 per started 5-mile block beyond 17 mi, rank order only.
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    queries: (h) => (h >= 15 || h < 4)
      ? [{ cat: "food", q: "romantic dinner intimate" }, { cat: "nightlife", q: "wine bar cocktail lounge" }, { cat: "food", q: "waterfront dinner sunset views" }, { cat: "attractions", q: "scenic sunset spot" }]
      : [{ cat: "food", q: "romantic cafe brunch" }, { cat: "attractions", q: "botanical garden scenic walk" }, { cat: "food", q: "wine tasting winery" }, { cat: "food", q: "romantic restaurant" }],
    title: (h, city) => (h >= 5 && h < 10.5 ? "Morning date" : h < 14 ? "Lunch date" : h < 18 ? "Afternoon date" : "Tonight"),
    sub: (city) => "The best of " + city + " for two — ranked by the Wayfind Score, tuned to right now.",
  },
  family: {
    eyebrow: "Memories for life",
    accent: "#22C55E",
    art: "/cards/family-fun.jpg",
    // NOT hidden gems: proven crowd-pleasers only — the ≥500-review floor is
    // the same threshold "Locals Actually Recommend" rides on.
    floor: { rating: 4.5, reviews: 500 },
    // Owner rule, THIS list only: -0.2 (on the /10 scale) per started 5-mile
    // block beyond 17 mi — far places sink dynamically; nothing else changes.
    distancePenalty: { freeMi: 17, per: 5, deduct: 0.2 },
    heroFromList: true, // card + page hero = the list's own best photo
    queries: (h) => [
      { cat: "attractions", q: "family theme park attractions things to do kids" },
      { cat: "attractions", q: "aquarium zoo wildlife" },
      { cat: "attractions", q: "science museum children discovery" },
      { cat: "food", q: "ice cream unique dessert experience" },
    ],
    title: (h, city) => "Family day",
    sub: (city) => "The most-loved family spots in " + city + " — proven by thousands, ranked by the Wayfind Score.",
  },
};

export function distanceDeduction(distMi, cfg) {
  if (!cfg || !isFinite(distMi) || distMi <= cfg.freeMi) return 0;
  return Math.ceil((distMi - cfg.freeMi) / cfg.per) * cfg.deduct;
}
const R = 3958.8;
export function distMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const m = 60, C0 = 3.9;
export const bayes = (rating, reviews) => (Number(rating) > 0 ? ((reviews || 0) / ((reviews || 0) + m)) * Number(rating) + (m / ((reviews || 0) + m)) * C0 : 0);

// REST place JSON (our /api/places/search) -> the row the shell renders.
export function toRow(p) {
  if (!p) return null;
  const name = (p.displayName && p.displayName.text) || p.name;
  const reviews = p.userRatingCount != null ? p.userRatingCount : p.reviews;
  const photoRef = p.photos && p.photos[0] && p.photos[0].name;
  if (!name || !p.id || !(Number(p.rating) > 0)) return null;
  const la = p.location && (p.location.latitude != null ? p.location.latitude : p.lat);
  const ln = p.location && (p.location.longitude != null ? p.location.longitude : p.lng);
  return {
    id: p.id, name, rating: Number(p.rating), reviews: Number(reviews) || 0,
    lat: isFinite(la) ? Number(la) : null, lng: isFinite(ln) ? Number(ln) : null,
    photoRef: photoRef && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoRef) ? photoRef : null,
    editorial: (p.editorialSummary && p.editorialSummary.text) || null,
  };
}

export function rankRows(rows, floor, opts) {
  const seen = new Set();
  const seenBrand = new Set(); // owner (2026-07-22): one card per brand — three Melt N Dips is one Melt N Dip
  const brandKey = (r) => String(r.name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const origin = opts && opts.origin;
  const pen = opts && opts.penalty;
  const withDist = (rows || []).filter(Boolean).map((r) => {
    const d = origin && isFinite(r.lat) ? distMi(origin.lat, origin.lng, r.lat, r.lng) : null;
    return { ...r, distMi: d, deduction: pen && d != null ? distanceDeduction(d, pen) : 0 };
  });
  // rank key = display-scale score minus the distance deduction; the shown
  // Score stays canonical, the why-line carries the explanation
  const key = (r) => (bayes(r.rating, r.reviews) / 5) * 10 - r.deduction;
  return withDist
    .filter((r) => r.rating >= floor.rating && r.reviews >= floor.reviews)
    .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => (key(b) - key(a)) || (b.reviews - a.reviews))
    .filter((r) => { const k = brandKey(r); if (seenBrand.has(k)) return false; seenBrand.add(k); return true; })
    .slice(0, 12);
}
