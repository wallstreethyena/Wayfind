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

const CACHE_HOURS = 240; // 10 days shared TTL; Google ToS caps caching at 30 days
const FIELD_MASK = [
  "places.id", "places.displayName", "places.location", "places.rating",
  "places.userRatingCount", "places.priceLevel", "places.priceRange",
  "places.formattedAddress", "places.regularOpeningHours",
  "places.utcOffsetMinutes", "places.types", "places.photos", "places.businessStatus",
].join(",");

// Warm-lambda memory layer in front of Supabase.
const mem = globalThis.__wfPlacesMem || (globalThis.__wfPlacesMem = new Map());

function sb() {
  // v4.13: normalize the env value. If it was saved as http:// the Supabase
  // gateway 301s to https, and the fetch spec converts POST to GET on a 301,
  // which turned every cache write into a silent no-op read. The client lib
  // (lib/supabase.js) was already hardened this way; server consumers were not.
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function cacheGet(k, allowStale) {
  const m = mem.get(k);
  if (m && (allowStale || m.exp > Date.now())) return m.v;
  const s = sb();
  if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(k)}&select=v,exp`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    });
    if (!r.ok) return null;
    const row = (await r.json())[0];
    if (!row) return null;
    // v5.87: the fresh path (allowStale falsy) misses on expired rows. The
    // stale-fallback path (used when Google 429s / errors) serves the last known
    // result regardless of age — slightly-stale beats an empty list.
    if (!allowStale && new Date(row.exp).getTime() < Date.now()) return null;
    mem.set(k, { v: row.v, exp: new Date(row.exp).getTime() });
    return row.v;
  } catch { return null; }
}

let _lastWrite = null; // v4.12 debug: last Supabase write outcome
async function cacheSet(k, v) {
  const exp = Date.now() + CACHE_HOURS * 3600000;
  mem.set(k, { v, exp });
  const s = sb();
  if (!s) { _lastWrite = { at: Date.now(), ok: false, why: "no supabase env" }; return; }
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache`, {
      method: "POST",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ k, v, exp: new Date(exp).toISOString() }),
    });
    const txt = await r.text();
    _lastWrite = { at: Date.now(), ok: r.ok, status: r.status, detail: r.ok ? undefined : txt.slice(0, 300) };
  } catch (e) {
    _lastWrite = { at: Date.now(), ok: false, why: String(e && e.message || e).slice(0, 300) };
  }
}

// Edge cache: 1 day fresh + 9 days stale-while-revalidate. Repeat queries are
// served from Vercel's CDN without invoking this function at all. Layered with
// the browser cache (10d) and Supabase (10d), most traffic never reaches Google.
const EDGE_HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" };

async function handleSearch(params) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ error: "server key not configured" }, { status: 501 });
  const q = String(params.q || "").slice(0, 120).trim();
  const lat = Number(params.lat), lng = Number(params.lng);
  const radius = Math.min(Math.max(Number(params.radius) || 24000, 500), 50000);
  const n = Math.min(Math.max(Number(params.n) || 20, 1), 20);
  if (!q || !isFinite(lat) || !isFinite(lng)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  // Round the bias point to ~1km so nearby users share cache entries.
  const k = ["v1", q.toLowerCase(), lat.toFixed(2), lng.toFixed(2), Math.round(radius / 1000), n].join("|");
  const wantDebug = String(params.debug || "") === "1";
  const dbg = () => wantDebug ? { lastWrite: _lastWrite, memSize: mem.size, supabaseConfigured: !!sb() } : undefined;
  const hit = await cacheGet(k);
  if (hit) return NextResponse.json({ places: hit, cached: true, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });

  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: q, maxResultCount: n, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
    });
    if (!r.ok) {
      // v5.88: Google rate-limited/failed (esp. 429 = quota exhausted). Rather
      // than return an empty error — which makes the app's lists collapse to
      // nothing the moment the daily quota runs out — serve the LAST cached
      // result for this exact query, even if it has expired. Slightly-stale
      // "great list" beats a blank screen; this is the whole point of the shared
      // cache. (The client sees 200 + places, so it never falls back to a second
      // Google call that would also 429.)
      const stale = await cacheGet(k, true);
      if (stale) return NextResponse.json({ places: stale, cached: true, stale: true, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
      return NextResponse.json({ error: "upstream " + r.status }, { status: 502 });
    }
    const data = await r.json();
    const places = data.places || [];
    if (places.length) await cacheSet(k, places);
    return NextResponse.json({ places, cached: false, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
  } catch {
    const stale = await cacheGet(k, true);
    if (stale) return NextResponse.json({ places: stale, cached: true, stale: true, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
    return NextResponse.json({ error: "upstream failure" }, { status: 502 });
  }
}

export async function GET(req) {
  const u = new URL(req.url);
  return handleSearch(Object.fromEntries(u.searchParams));
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  return handleSearch(body);
}
