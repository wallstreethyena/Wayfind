// lib/thingsToDo.js — "Things To Do": 3–5 AI-curated collections built from the existing Places /
// curated layer. Curiosity labels (never raw category names). Selection uses ONLY real signals:
// Google rating + review count + distance + open-now, with first-party likes/saves as a light
// boost when present. No fabricated popularity. Pure + deterministic; tested by
// scripts/test-things-to-do.mjs.

// Raw category names we must never use as a collection label.
export const RAW_CATEGORY_NAMES = ["Restaurants", "Shopping", "Things To Do", "Food", "Places", "Attractions"];

// Each recipe: curiosity label + an HONEST predicate over real place fields + a sort.
export const COLLECTIONS = [
  { id: "hidden-gems", label: "Hidden Gems You'll Love",
    pick: (p) => p.rating >= 4.5 && typeof p.reviewCount === "number" && p.reviewCount > 0 && p.reviewCount < 300,
    sort: (a, b) => b.rating - a.rating },
  { id: "locals-recommend", label: "Places Locals Actually Recommend",
    pick: (p) => p.rating >= 4.6 && typeof p.reviewCount === "number" && p.reviewCount >= 500,
    sort: (a, b) => b.reviewCount - a.reviewCount },
  { id: "worth-the-drive", label: "Worth The Drive",
    pick: (p) => p.distanceMi != null && p.distanceMi >= 12 && p.distanceMi <= 45 && p.rating >= 4.6,
    sort: (a, b) => b.rating - a.rating },
  { id: "perfect-today", label: "Perfect For Today",
    pick: (p) => p.openNow === true && p.rating >= 4.3, sort: (a, b) => b.rating - a.rating },
  { id: "worth-leaving", label: "Worth Leaving The House For",
    pick: (p) => p.rating >= 4.5, sort: (a, b) => b.rating - a.rating || (a.distanceMi ?? 1e9) - (b.distanceMi ?? 1e9) },
];

function haversineMi(aLat, aLng, bLat, bLng) {
  const R = 3958.8, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function distanceOf(p, ctx) {
  if (p.distanceMi != null) return p.distanceMi;
  if (ctx?.center && p.lat != null && p.lng != null) return haversineMi(ctx.center.lat, ctx.center.lng, p.lat, p.lng);
  return null;
}
function boostOf(p, engagementMap) {
  const e = engagementMap && p.place_id ? engagementMap[p.place_id] : null;
  return e ? Math.min(1, ((e.likes || 0) + (e.saves || 0)) / 10) : 0;
}

// buildCollections(places, ctx, opts): ctx = { center, engagementMap }. Returns 3–5 non-empty
// collections (>=3 real places each), deduped across collections.
export function buildCollections(places, ctx = {}, opts = {}) {
  const { maxCollections = 5, perCollection = 8, minPlaces = 3 } = opts;
  const enriched = (places || [])
    .filter((p) => p && p.place_id && typeof p.rating === "number")
    .map((p) => ({ ...p, distanceMi: distanceOf(p, ctx), _boost: boostOf(p, ctx.engagementMap) }));
  const used = new Set();
  const out = [];
  for (const rec of COLLECTIONS) {
    let items;
    try { items = enriched.filter((p) => !used.has(p.place_id) && rec.pick(p, ctx)); } catch { items = []; }
    items = items.sort((a, b) => rec.sort(a, b) || b._boost - a._boost).slice(0, perCollection);
    if (items.length >= minPlaces) {
      items.forEach((p) => used.add(p.place_id));
      out.push({ id: rec.id, label: rec.label, places: items });
    }
    if (out.length >= maxCollections) break;
  }
  return out;
}
