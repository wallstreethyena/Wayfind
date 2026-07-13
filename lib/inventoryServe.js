// lib/inventoryServe.js — SERVER-ONLY. When the live Google search 429s (quota)
// or errors, serve the category list from Wayfind's OWNED inventory
// (wf_inventory) instead of a thin/near-empty stale cache. This is why "Stay"
// can show the ~191 hotels we already seeded during a Google outage, instead of
// the one hotel a cold query cache happened to hold. The rows are already
// categorized and carry name/lat/lng/rating/reviews/price/types/photo, so they
// map straight into the Google Places (New) shape the client already renders.
// NOTE: serverCache is loaded lazily inside serveFromInventory (not a top-level
// import) so the pure helpers here stay unit-testable in bare Node without
// dragging in the whole cache/env chain.

const CATS = new Set(["food", "nightlife", "attractions", "beach", "hotels", "shopping"]);
const PRICE_ENUM = ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"];

export function distMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// A wf_inventory row -> the raw Google Places (New) resource shape that
// restToPlace()/normalize() in lib/google.js already consume, so the client
// renders an inventory-served place identically to a live Google result.
export function invRowToPlace(r) {
  const s = r.signals || {};
  const out = {
    id: r.place_id,
    displayName: { text: r.name },
    location: { latitude: r.lat, longitude: r.lng },
    rating: typeof s.rating === "number" ? s.rating : null,
    userRatingCount: typeof s.reviews === "number" ? s.reviews : 0,
    types: Array.isArray(r.google_types) ? r.google_types : [],
    businessStatus: r.status || "OPERATIONAL",
    _wfInventory: true, // provenance marker (source = owned inventory, not live Google)
  };
  if (typeof s.priceNum === "number" && PRICE_ENUM[s.priceNum]) out.priceLevel = PRICE_ENUM[s.priceNum];
  if (r.editorial) out.editorialSummary = { text: r.editorial };
  if (r.photo_ref) out.photos = [{ name: r.photo_ref }];
  return out;
}

// PURE: given inventory rows, keep the operational ones within the radius, rank
// by quality with a light proximity nudge (the client re-ranks anyway), and
// return the top n mapped into the Google shape. Separated from the fetch so it
// is unit-testable.
export function rankInventory(rows, lat, lng, radiusM, n) {
  const gate = (radiusM || 27000) * 1.15;
  const scored = [];
  for (const row of rows || []) {
    if (row.lat == null || row.lng == null) continue;
    if (row.status && row.status !== "OPERATIONAL") continue; // never serve a closed place
    const d = distMeters(lat, lng, row.lat, row.lng);
    if (d > gate) continue;
    const s = row.signals || {};
    const rating = typeof s.rating === "number" ? s.rating : 0;
    const reviews = typeof s.reviews === "number" ? s.reviews : 0;
    const distMi = d / 1609.34;
    const distPenalty = distMi <= 4 ? 0 : Math.min((distMi - 4) * 1.3, 30);
    scored.push({ row, score: rating * 20 + Math.min(reviews, 2000) / 100 - distPenalty });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.min(Math.max(n || 20, 1), 30)).map((x) => invRowToPlace(x.row));
}

// Fetch the category's inventory and rank it near a point. Returns [] on any
// problem (a bad category, no Supabase env, a read error) so the caller falls
// through to the stale cache — never throws.
export async function serveFromInventory(cat, lat, lng, radiusM, n) {
  cat = String(cat || "").toLowerCase();
  if (!CATS.has(cat) || !isFinite(lat) || !isFinite(lng)) return [];
  const { sbEnv } = await import("./serverCache.js"); // lazy: keeps this module test-importable
  const s = sbEnv();
  if (!s) return [];
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_inventory?category=eq.${cat}&select=place_id,name,lat,lng,signals,google_types,primary_type,editorial,photo_ref,status&limit=1000`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    });
    if (!r.ok) return [];
    return rankInventory(await r.json(), lat, lng, radiusM, n);
  } catch { return []; }
}
