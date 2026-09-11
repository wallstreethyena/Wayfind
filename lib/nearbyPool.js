// lib/nearbyPool.js — THE CANDIDATES COME FROM WHERE THE READER IS.
//
// Candidate-integrity rule: a bounded presentation list may never decide
// which places get to face a rail identity. Each chosen nearby ring is read
// deterministically to completion first. The ring ladder is still a product
// rule about how local the answer should be; it is not a candidate cap.
import { placeAllowed } from "./placeFilter.js";
import { existingTypeSignals } from "./placeCategory.js";
import { governedScoreOf } from "./lawfulOrder.js";
import { byTopRated } from "./ranking.js";
import { BEACH_NEAR_MI, isBeachPlace } from "./beaches.js";
import { isOuting } from "./outing.js";
import { readOwnedCategory } from "./ownedPool.js";

export const NEARBY_CATS = {
  restaurants: { column: "food", gate: "food" },
  "things-to-do": { column: "attractions", gate: "attractions", identity: isOuting },
  nightlife: { column: "nightlife", gate: "nightlife" },
  beaches: { column: "beach", gate: "beach", identity: isBeachPlace },
};

export const NEARBY_RINGS_MI = [6, 10, 17];
export const NEARBY_BEACH_RINGS_MI = [BEACH_NEAR_MI];
export const NEARBY_TARGET_ROWS = 45;
export const NEARBY_STANDALONE_MIN = 20;

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
export function nearbyMiBetween(aLat, aLng, bLat, bLng) {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

export function shapeNearbyRow(row, origin, gate, opts) {
  const identity = opts && opts.identity;
  if (!row || !row.place_id || !row.name) return null;
  if (!(Number.isFinite(row.lat) && Number.isFinite(row.lng))) return null;
  if (row.excluded === true) return null;
  const rating = Number(row.signals && row.signals.rating);
  const reviews = Number(row.signals && row.signals.reviews);
  if (!(rating > 0 && reviews >= 15)) return null;
  const shaped = {
    id: row.place_id,
    name: row.name,
    rating,
    reviews,
    primaryType: row.primary_type || null,
    types: existingTypeSignals(row),
    cuisines: Array.isArray(row.cuisines) ? row.cuisines.filter(Boolean) : [],
    status: row.status || "OPERATIONAL",
    lat: row.lat,
    lng: row.lng,
    priceLevel: row.signals && row.signals.priceNum != null ? row.signals.priceNum : null,
    photoRef: row.photo_ref || null,
    city: (opts && opts.locName) || null,
    distMi: nearbyMiBetween(origin.lat, origin.lng, row.lat, row.lng),
    oh: null,
    utcOffset: null,
    trending: false,
    trend_reason: null,
    editorial: row.editorial || null,
  };
  if (!placeAllowed(gate, null, shaped)) return null;
  if (identity && !identity(shaped)) return null;
  return shaped;
}

export function nearbyBbox(origin, radiusMi) {
  const dLat = radiusMi / 69 + 0.02;
  const dLng = radiusMi / (69 * Math.cos(rad(origin.lat))) + 0.02;
  return {
    minLat: origin.lat - dLat, maxLat: origin.lat + dLat,
    minLng: origin.lng - dLng, maxLng: origin.lng + dLng,
  };
}

/**
 * Reader-first pool for one category.
 *
 * The old implementation asked PostgREST for the 400 most-reviewed rows in a
 * ring and only then ran the category identity. That was deterministic, but it
 * was still candidate starvation. A long-tail real beach, outing, restaurant,
 * or nightlife place could be row 401 and never get judged.
 *
 * Now readOwnedCategory pages the selected ring in stable place_id order until
 * a short page proves completion. Only then do serviceability, discovery gate,
 * category identity, exact radius, score and sorting run. A runaway maxRows is
 * not a merchandising cap: if it is ever reached, this accelerator returns no
 * replacement pool and loadPools keeps the authoritative city pool instead of
 * caching a partial truth.
 */
export async function buildNearbyPool(origin, catSlug, opts) {
  const cfg = NEARBY_CATS[catSlug];
  if (!cfg) return [];
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];

  const publicUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const publicKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const explicitEnv = opts && opts.env;
  const env = explicitEnv || (publicUrl && publicKey ? { url: publicUrl, key: publicKey } : null);
  if (!env) return [];

  const fetchImpl = opts && opts.fetchImpl;
  const rings = (opts && opts.rings)
    || (catSlug === "beaches" ? NEARBY_BEACH_RINGS_MI : NEARBY_RINGS_MI);
  const locName = (opts && opts.locName) || null;
  const skipEditorial = !!(opts && opts.skipEditorial);
  const readCache = opts && opts.readCache;
  const fields = "place_id,name,lat,lng,category,secondary_categories,google_types,primary_type,cuisines,signals,photo_ref,status,excluded"
    + (skipEditorial ? "" : ",editorial");

  let best = [];
  for (const radiusMi of rings) {
    const box = nearbyBbox(origin, radiusMi);
    const cacheKey = `nb:v2:${cfg.column}:${box.minLat.toFixed(4)}:${box.minLng.toFixed(4)}:${box.maxLat.toFixed(4)}:${box.maxLng.toFixed(4)}:${skipEditorial ? 1 : 0}`;
    const doRead = async () => readOwnedCategory(env, cfg.column, box, {
      fields,
      primaryOnly: true,
      pageSize: 1000,
      maxRows: 6000,
      ...(fetchImpl ? { fetchImpl } : {}),
    });

    let result;
    try {
      result = readCache && typeof readCache.get === "function"
        ? await readCache.get(cacheKey, doRead)
        : await doRead();
      if (!result || result.truncated) {
        console.warn(`nearbyPool: wf_inventory read failed for ${catSlug} at ${radiusMi}mi — incomplete paged result. Rails fall back to the city pools.`);
        continue;
      }
    } catch (e) {
      console.warn(`nearbyPool: wf_inventory read threw for ${catSlug} at ${radiusMi}mi — ${e && e.message}`);
      continue;
    }

    const out = [];
    const seen = new Set();
    for (const row of Array.isArray(result.rows) ? result.rows : []) {
      const shaped = shapeNearbyRow(row, origin, cfg.gate, { locName, identity: cfg.identity });
      if (!shaped) continue;
      if (!(shaped.distMi <= radiusMi)) continue;
      if (seen.has(shaped.id)) continue;
      seen.add(shaped.id);
      const score = governedScoreOf(shaped, locName);
      if (!Number.isFinite(score)) continue;
      shaped.governed_score = score;
      shaped._s = score;
      shaped._nearbyRingMi = radiusMi;
      out.push(shaped);
    }

    // Keep the widest attempt so widening cannot lose a candidate already
    // found. NEARBY_TARGET_ROWS stops the radius ladder only; it never slices
    // the completed ring.
    if (out.length > best.length) best = out;
    if (out.length >= NEARBY_TARGET_ROWS) break;
  }
  best.sort(byTopRated);
  return best;
}
