// lib/ratingBackfill.js - which places the owner-approved paid rating backfill may buy.
//
// Owner decision 2026-11-20: buy the missing Google ratings for the five held Florida
// towns now instead of waiting for the December free line. The targets are computed,
// not typed: every servable wf_inventory row within HELD_RADIUS_MI of a held town that
// has no rating yet. Pure functions only; the route does the I/O.
export const HELD_TOWNS = Object.freeze([
  { slug: "gainesville", lat: 29.6516, lng: -82.3248 },
  { slug: "port-st-lucie", lat: 27.273, lng: -80.3582 },
  { slug: "vero-beach", lat: 27.6386, lng: -80.3973 },
  { slug: "stuart", lat: 27.1975, lng: -80.2528 },
  { slug: "sebring", lat: 27.4956, lng: -81.4409 },
]);
export const HELD_RADIUS_MI = 19.55;
const CATEGORY_RANK = { food: 1, attractions: 2, nightlife: 3 };

export function milesBetween(aLat, aLng, bLat, bLng) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Latitude/longitude box that contains the radius around a town (for the database query). */
export function townBox(town, radiusMi = HELD_RADIUS_MI) {
  const dLat = radiusMi / 69;
  const dLng = radiusMi / (69 * Math.cos((town.lat * Math.PI) / 180));
  return { minLat: town.lat - dLat, maxLat: town.lat + dLat, minLng: town.lng - dLng, maxLng: town.lng + dLng };
}

export function hasRating(row) {
  const s = row && row.signals;
  return !!(s && typeof s === "object" && typeof s.rating === "number" && Number.isFinite(s.rating) && s.rating > 0);
}

/**
 * Rows worth one paid lookup: inside a held town's radius, not excluded, not permanently
 * closed, not locked (a locked row only takes flags, so a paid call would be wasted), and
 * still without a rating. Deduped, food first, then attractions, nightlife, the rest.
 */
export function selectBackfillTargets(rows, towns = HELD_TOWNS, radiusMi = HELD_RADIUS_MI) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.place_id !== "string" || seen.has(row.place_id)) continue;
    if (row.excluded === true || row.locked === true || row.status === "CLOSED_PERMANENTLY" || hasRating(row)) continue;
    if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
    if (!towns.some((t) => milesBetween(t.lat, t.lng, row.lat, row.lng) <= radiusMi)) continue;
    seen.add(row.place_id);
    out.push(row);
  }
  return out.sort((a, b) => (CATEGORY_RANK[a.category] || 9) - (CATEGORY_RANK[b.category] || 9) || (a.place_id < b.place_id ? -1 : 1));
}
