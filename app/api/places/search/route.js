// v4.08 — Server-side Places Text Search proxy with a shared cache.
// Why this exists: every browser used to call Google directly, so caching was
// per-device and every new visitor, device, or PWA context paid full price.
// This route makes the first search pay and everyone else read the cache.
// Requires GOOGLE_MAPS_SERVER_KEY: a key WITHOUT referrer restrictions,
// restricted by API to "Places API (New)" only. If the key is missing this
// returns 501 and the client silently falls back to the old direct SDK path,
// so this build is safe to deploy before the key is created.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CACHE_HOURS = 24; // shared TTL; Google ToS-safe session-scale caching
const FIELD_MASK = [
  "places.id", "places.displayName", "places.location", "places.rating",
  "places.userRatingCount", "places.priceLevel", "places.priceRange",
  "places.formattedAddress", "places.regularOpeningHours",
  "places.utcOffsetMinutes", "places.types", "places.photos", "places.businessStatus",
].join(",");

// Warm-lambda memory layer in front of Supabase.
const mem = globalThis.__wfPlacesMem || (globalThis.__wfPlacesMem = new Map());

function sb() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function cacheGet(k) {
  const m = mem.get(k);
  if (m && m.exp > Date.now()) return m.v;
  const s = sb();
  if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(k)}&select=v,exp`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    });
    if (!r.ok) return null;
    const row = (await r.json())[0];
    if (!row || new Date(row.exp).getTime() < Date.now()) return null;
    mem.set(k, { v: row.v, exp: new Date(row.exp).getTime() });
    return row.v;
  } catch { return null; }
}

async function cacheSet(k, v) {
  const exp = Date.now() + CACHE_HOURS * 3600000;
  mem.set(k, { v, exp });
  const s = sb();
  if (!s) return;
  try {
    await fetch(`${s.url}/rest/v1/wf_places_cache`, {
      method: "POST",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ k, v, exp: new Date(exp).toISOString() }),
    });
  } catch {}
}

export async function POST(req) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ error: "server key not configured" }, { status: 501 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  const q = String(body.q || "").slice(0, 120).trim();
  const lat = Number(body.lat), lng = Number(body.lng);
  const radius = Math.min(Math.max(Number(body.radius) || 24000, 500), 50000);
  const n = Math.min(Math.max(Number(body.n) || 20, 1), 20);
  if (!q || !isFinite(lat) || !isFinite(lng)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  // Round the bias point to ~1km so nearby users share cache entries.
  const k = ["v1", q.toLowerCase(), lat.toFixed(2), lng.toFixed(2), Math.round(radius / 1000), n].join("|");
  const hit = await cacheGet(k);
  if (hit) return NextResponse.json({ places: hit, cached: true });

  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: q, maxResultCount: n, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
    });
    if (!r.ok) return NextResponse.json({ error: "upstream " + r.status }, { status: 502 });
    const data = await r.json();
    const places = data.places || [];
    if (places.length) await cacheSet(k, places);
    return NextResponse.json({ places, cached: false });
  } catch {
    return NextResponse.json({ error: "upstream failure" }, { status: 502 });
  }
}
