// lib/nearbyPicksServe.js — the serving logic behind POST /api/nearby-picks.
// Kept free of next/* so it runs (and is tested) in plain Node; the route
// wraps it in NextResponse. Full rationale and privacy rules live in
// app/api/nearby-picks/route.js.
import { shapeNearbyRow, nearbyBbox } from "./nearbyPool.js";
import { governedScoreOf } from "./lawfulOrder.js";
import {
  SPRING_PLACE_IDS, SWEET_PRIMARY_TYPES, SWEET_RADIUS_MI, validOrigin, selectHotspots,
} from "./nearbyHotspots.js";

export const NEARBY_PICKS_CACHE_CONTROL = "private, no-store, max-age=0";
const READ_TIMEOUT_MS = 6000;
const FIELDS = "place_id,name,locality,postal_city,lat,lng,category,secondary_categories,google_types,primary_type,cuisines,signals,photo_ref,status,excluded,editorial";


function supabaseEnv() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return url && key ? { url, key } : null;
}

async function defaultRead(env, path) {
  const r = await fetch(`${env.url}/rest/v1/${path}`, {
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`wf_inventory read failed (${r.status})`);
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error("wf_inventory read returned a non-list response");
  return rows;
}

export function springsPath() {
  return `wf_inventory?select=${FIELDS}&place_id=in.(${SPRING_PLACE_IDS.map(encodeURIComponent).join(",")})`;
}

export function sweetsPath(origin) {
  const b = nearbyBbox(origin, SWEET_RADIUS_MI);
  return `wf_inventory?select=${FIELDS}`
    + `&lat=gte.${b.minLat.toFixed(4)}&lat=lte.${b.maxLat.toFixed(4)}`
    + `&lng=gte.${b.minLng.toFixed(4)}&lng=lte.${b.maxLng.toFixed(4)}`
    + `&primary_type=in.(${SWEET_PRIMARY_TYPES.join(",")})&order=place_id.asc&limit=1000`;
}

function shapeAll(rows, origin, gate) {
  const out = [];
  for (const row of rows || []) {
    const shaped = shapeNearbyRow(row, origin, gate, {});
    if (!shaped) continue;
    const score = governedScoreOf(shaped, null);
    if (!Number.isFinite(score)) continue;
    shaped.governed_score = score;
    out.push(shaped);
  }
  return out;
}

// Only what a card needs. No raw signals blob, no internal fields.
function toCard(r) {
  return {
    id: r.id, name: r.name, rating: r.rating, reviews: r.reviews,
    primaryType: r.primaryType, types: r.types, priceLevel: r.priceLevel,
    lat: r.lat, lng: r.lng, distMi: Math.round(r.distMi * 10) / 10,
    governed_score: r.governed_score, photoRef: r.photoRef || null,
    ...(r.photos ? { photos: r.photos } : {}),
    ...(r.locality ? { locality: r.locality } : {}),
    ...(r.postalCity ? { postalCity: r.postalCity } : {}),
    editorial: r.editorial || null,
  };
}

export async function parseBody(request) {
  let body;
  try { body = await request.json(); } catch (e) { return null; }
  if (!body || typeof body !== "object") return null;
  return validOrigin(body.lat, body.lng);
}

// Returns { status: httpStatus, body }. Never writes, never logs the point.
export async function serveNearbyPicks(origin, { read = defaultRead, env = supabaseEnv } = {}) {
  const json = (body, status = 200) => ({ status, body });
  if (!origin) return json({ error: "A valid location is required." }, 400);
  const e = env();
  if (!e) return json({ status: "unavailable", springs: [], sweets: [] }, 503);
  const [springRows, sweetRows] = await Promise.allSettled([
    read(e, springsPath()),
    read(e, sweetsPath(origin)),
  ]);
  if (springRows.status === "rejected" && sweetRows.status === "rejected") {
    return json({ status: "unavailable", springs: [], sweets: [] }, 503);
  }
  const picks = selectHotspots({
    springs: springRows.status === "fulfilled" ? shapeAll(springRows.value, origin, "attractions") : [],
    sweets: sweetRows.status === "fulfilled" ? shapeAll(sweetRows.value, origin, "food") : [],
  });
  return json({
    status: picks.springs.length || picks.sweets.length ? "ok" : "empty",
    partial: springRows.status === "rejected" || sweetRows.status === "rejected",
    springs: picks.springs.map(toCard),
    sweets: picks.sweets.map(toCard),
  });
}
