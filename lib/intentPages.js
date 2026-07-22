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

const m = 60, C0 = 3.9;
export const bayes = (rating, reviews) => (Number(rating) > 0 ? ((reviews || 0) / ((reviews || 0) + m)) * Number(rating) + (m / ((reviews || 0) + m)) * C0 : 0);

// REST place JSON (our /api/places/search) -> the row the shell renders.
export function toRow(p) {
  if (!p) return null;
  const name = (p.displayName && p.displayName.text) || p.name;
  const reviews = p.userRatingCount != null ? p.userRatingCount : p.reviews;
  const photoRef = p.photos && p.photos[0] && p.photos[0].name;
  if (!name || !p.id || !(Number(p.rating) > 0)) return null;
  return {
    id: p.id, name, rating: Number(p.rating), reviews: Number(reviews) || 0,
    photoRef: photoRef && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoRef) ? photoRef : null,
    editorial: (p.editorialSummary && p.editorialSummary.text) || null,
  };
}

export function rankRows(rows, floor) {
  const seen = new Set();
  return (rows || []).filter(Boolean)
    .filter((r) => r.rating >= floor.rating && r.reviews >= floor.reviews)
    .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => (bayes(b.rating, b.reviews) - bayes(a.rating, a.reviews)) || (b.reviews - a.reviews))
    .slice(0, 12);
}
