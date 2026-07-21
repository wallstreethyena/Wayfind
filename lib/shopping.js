// lib/shopping.js — "Shopping": one beautiful hero card (malls / boutiques / local stores /
// luxury / pop-ups) from the existing Places layer. Honest pick: rating + reviewCount + distance
// + open-now, first-party likes/saves as a boost. Curiosity headline, never the bare category
// word. Hidden when nothing shopping-worthy is nearby. Pure + deterministic; tested by
// scripts/test-shopping.mjs.

export const RAW_CATEGORY_NAMES = ["Shopping", "Stores", "Retail", "Malls", "Things To Do", "Food"];

const SHOP_TYPES = new Set([
  "shopping_mall", "clothing_store", "department_store", "shoe_store", "jewelry_store",
  "book_store", "home_goods_store", "furniture_store", "store", "market", "boutique",
]);
export function isShopping(place) {
  const types = Array.isArray(place.types) ? place.types.map((t) => String(t).toLowerCase()) : [];
  if (types.some((t) => SHOP_TYPES.has(t))) return true;
  return /mall|boutique|market|shops?\b|outlet|emporium/i.test(place.name || "");
}

// Curiosity headlines — none is the bare category word.
export const SHOP_HEADLINES = [
  "Retail Therapy Starts Here",
  "Worth Browsing Today",
  "Wayfind's Shopping Finds",
  "Today's Best Browse Nearby",
];
function hashSeed(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
export function shopHeadline(place, seed) {
  const key = String(seed ?? place?.place_id ?? place?.name ?? "wayfind");
  return SHOP_HEADLINES[hashSeed(key) % SHOP_HEADLINES.length];
}

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
function score(p, ctx, maxR) {
  const rating = typeof p.rating === "number" ? p.rating / 5 : 0.6;
  const reviews = typeof p.reviewCount === "number" ? Math.min(1, p.reviewCount / 1000) : 0.3;
  const dist = distanceOf(p, ctx);
  const prox = dist == null ? 0.4 : dist > maxR ? 0 : 1 - dist / maxR;
  const open = p.openNow === true ? 0.1 : 0;
  return rating * 0.5 + prox * 0.3 + reviews * 0.2 + open + boostOf(p, ctx.engagementMap) * 0.2;
}

// pickShoppingHero(places, ctx): ctx = { center, engagementMap, maxRadiusMi }.
export function pickShoppingHero(places, ctx = {}) {
  const maxR = ctx.maxRadiusMi ?? 20;
  const shops = (places || [])
    .filter((p) => p && p.place_id && typeof p.rating === "number" && isShopping(p))
    .map((p) => ({ ...p, distanceMi: distanceOf(p, ctx), _s: score(p, ctx, maxR) }))
    .filter((p) => (p.distanceMi == null || p.distanceMi <= maxR) && p.rating >= 4.0)
    .sort((a, b) => b._s - a._s);
  if (!shops.length) return { show: false, reason: "no shopping nearby" };
  const place = shops[0];
  return { show: true, place, headline: shopHeadline(place), cta: "Start Browsing →" };
}
