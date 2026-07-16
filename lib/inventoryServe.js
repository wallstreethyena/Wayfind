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

import { CAT_ALLOW, CAT_EXCLUDE } from "./placeFilter.js";

const CATS = new Set(["food", "nightlife", "attractions", "beach", "hotels", "shopping"]);
// v6.34 — VIRTUAL categories: tabs with no wf_inventory category of their own,
// served from an existing one through the SAME allow/exclude contracts the
// live path enforces. v6.28 shipped the Family tab without this mapping, so
// during a Google 429 every tab survived on inventory EXCEPT Family, which
// 502'd into "Nothing here right now" (July 15 outage). Family = attractions
// rows whose types/name read kid-appropriate, minus adult-only/nightlife.
export const VIRTUAL_CATS = {
  family: {
    base: "attractions",
    keep(row) {
      const hay = [...(Array.isArray(row.google_types) ? row.google_types : []), String(row.name || "")].join(" ");
      return CAT_ALLOW.family.test(hay) && !CAT_EXCLUDE.family.test(hay);
    },
  },
};
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
    // v6.16: a row the classifier excluded (a residence, a parking lot, a trade
    // business, a scraped short-term rental) is never served. Read defensively:
    // `excluded` is undefined until the owner applies supabase/inventory-repair.sql,
    // and `undefined !== true`, so this is a no-op until the column exists.
    if (row.excluded === true) continue;
    // v6.40 (owner directive): an unenriched row — no real rating signals —
    // is NEVER served into a ranked list. It would reach the app as a named
    // card with no Wayfind Score (the "second-guess" card class). It stays in
    // owned inventory until enrichment writes its signals; then it competes
    // like everything else. scripts/test-card-gate.mjs locks this behavior.
    const _sr = row.signals || {};
    if (!(typeof _sr.rating === "number" && _sr.rating > 0)) continue;
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
  return scored.slice(0, Math.min(Math.max(n || 20, 1), 50)).map((x) => invRowToPlace(x.row));
}

// Fetch the category's inventory and rank it near a point. Returns [] on any
// problem (a bad category, no Supabase env, a read error) so the caller falls
// through to the stale cache — never throws.
export async function serveFromInventory(cat, lat, lng, radiusM, n) {
  cat = String(cat || "").toLowerCase();
  const virtual = VIRTUAL_CATS[cat] || null;
  const physical = virtual ? virtual.base : cat;
  if (!CATS.has(physical) || !isFinite(lat) || !isFinite(lng)) return [];
  const { sbEnv } = await import("./serverCache.js"); // lazy: keeps this module test-importable
  const s = sbEnv();
  if (!s) return [];
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };

  // `select=*` on purpose. The old query named its columns, which means the day a
  // new column is referenced before the owner runs the migration, PostgREST 400s,
  // this returns [], and the Google-429 fallback serves a BLANK list — exactly the
  // `wrote_at` outage shape from v5.90. With `select=*` the new columns simply
  // appear when they exist and are `undefined` until then, and the JS filters
  // below degrade to no-ops. Never name a column here that might not exist yet.
  //
  // v6.16: a place can belong to a SECOND list — a campground is an outdoor
  // experience AND a real place to stay tonight (owner rule). We ask for both in
  // one OR query, and fall back to the plain category query if
  // `secondary_categories` does not exist yet.
  const base = `${s.url}/rest/v1/wf_inventory?select=*&limit=1000`;
  const withSecondary = `${base}&or=(category.eq.${physical},secondary_categories.cs.{${physical}})`;
  const plain = `${base}&category=eq.${physical}`;
  try {
    let r = await fetch(withSecondary, { headers: h, cache: "no-store" });
    if (!r.ok) r = await fetch(plain, { headers: h, cache: "no-store" }); // pre-migration
    if (!r.ok) return [];
    let rows = await r.json();
    if (virtual) rows = (rows || []).filter((row) => { try { return virtual.keep(row); } catch { return false; } });
    return rankInventory(rows, lat, lng, radiusM, n);
  } catch { return []; }
}
