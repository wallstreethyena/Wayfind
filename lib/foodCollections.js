// lib/foodCollections.js — "Food": named dinner collections (never a flat restaurant list).
// Same honest assembler shape as lib/thingsToDo.js, food-specific recipes. Real signals only:
// rating + reviewCount + priceLevel + distance + open-now, first-party likes/saves as a boost.
// Filtered to food place types. No fabricated popularity. Pure + deterministic; tested by
// scripts/test-food-collections.mjs.

export const RAW_CATEGORY_NAMES = ["Restaurants", "Shopping", "Things To Do", "Food", "Places", "Dining"];

const FOOD_TYPES = new Set(["restaurant", "food", "meal_takeaway", "meal_delivery", "bar", "bakery", "cafe"]);
export function isFood(place) {
  const types = Array.isArray(place.types) ? place.types.map((t) => String(t).toLowerCase()) : [];
  if (types.some((t) => FOOD_TYPES.has(t))) return true;
  return /restaurant|bistro|grill|kitchen|eatery|steakhouse|taqueria|trattoria|diner|cafe|caf[eé]/i.test(place.name || "");
}

// Recipe array order = dedupe priority (specific themes first; the general dinner catch-all last).
export const COLLECTIONS = [
  { id: "date-night", label: "Date Night Done Right",
    pick: (p) => p.rating >= 4.6 && (p.priceLevel != null ? p.priceLevel >= 3 : p.rating >= 4.7),
    sort: (a, b) => b.rating - a.rating },
  { id: "locals-love", label: "Locals Can't Stop Talking About These",
    pick: (p) => p.rating >= 4.6 && typeof p.reviewCount === "number" && p.reviewCount >= 500,
    sort: (a, b) => b.reviewCount - a.reviewCount },
  { id: "worth-the-drive", label: "Places Worth The Drive",
    pick: (p) => p.distanceMi != null && p.distanceMi >= 12 && p.distanceMi <= 45 && p.rating >= 4.6,
    sort: (a, b) => b.rating - a.rating },
  { id: "youd-miss", label: "Restaurants You'd Probably Miss",
    pick: (p) => p.rating >= 4.5 && typeof p.reviewCount === "number" && p.reviewCount > 0 && p.reviewCount < 300,
    sort: (a, b) => b.rating - a.rating },
  { id: "dinner-tonight", label: "Tonight's Best Dinner Picks",
    pick: (p) => p.rating >= 4.4, sort: (a, b) => b.rating - a.rating || (a.distanceMi ?? 1e9) - (b.distanceMi ?? 1e9) },
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

export function buildFoodCollections(places, ctx = {}, opts = {}) {
  const { maxCollections = 5, perCollection = 8, minPlaces = 3 } = opts;
  const enriched = (places || [])
    .filter((p) => p && p.place_id && typeof p.rating === "number" && isFood(p))
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
