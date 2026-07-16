// v4.08 / v5.90 — Server-side Places Text Search proxy on the SHARED cache.
// Every browser's search feeds ONE Supabase pool (lib/serverCache) all users
// share, so the first search pays and everyone else reads the cache — and the
// site stays live when Google 429s (quota) by degrading to the cached result.
// Requires GOOGLE_MAPS_SERVER_KEY (Places API New, no referrer restriction);
// missing -> 501 and the client falls back to the direct SDK path.
//
// Google ToS: Place IDs may be kept indefinitely (see the permanent wf_place_ids
// index); all OTHER place content must not be cached beyond 30 days. Fresh TTL is
// ~10 days for accuracy; the stale-serve fallback is hard-capped at 30 days.
import { NextResponse } from "next/server";
import { cget, cset, upsertPlaceIds, cacheConfigured, lastWrite, memSize, DAY } from "../../../../lib/serverCache";
import { serveFromInventory } from "../../../../lib/inventoryServe";

export const dynamic = "force-dynamic";

const FRESH_TTL_MS = 30 * DAY;   // v6.09: 30 days = the Google ToS maximum for cached
                                 // place content. Maximizing the fresh window minimizes
                                 // paid searchText refreshes (the July cost incident).
const STALE_MAX_MS = 30 * DAY;   // ToS: never serve place content older than 30 days
const FIELD_MASK = [
  "places.id", "places.displayName", "places.location", "places.rating",
  "places.userRatingCount", "places.priceLevel", "places.priceRange",
  "places.formattedAddress", "places.regularOpeningHours",
  "places.utcOffsetMinutes", "places.types", "places.photos", "places.businessStatus",
].join(",");

// Edge cache: 1 day fresh + 9 days stale-while-revalidate on top of Supabase.
const EDGE_HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" };

// v6.35 — REFRESH-AHEAD poke. A fresh-but-aging cache hit (cget returns due:true
// at a jittered 20–27 days) is served to the user INSTANTLY; this fire-and-forget
// pokes the dedicated /api/places/refresh route — its OWN lambda invocation with
// full execution time — to re-fetch Google and reset the 30-day clock. Best-effort
// and self-healing: if a poke is dropped (serverless can freeze after the response),
// the next request in the window pokes again; the entry never actually reaches 30
// days. Throttled per key per warm lambda so a burst of hits fires ONE poke, and it
// can NEVER affect the served response (fully wrapped, never awaited).
const REFRESH_FIRED = globalThis.__wfRefreshFired || (globalThis.__wfRefreshFired = new Map());
function pokeRefresh(origin, k, p) {
  try {
    if (!origin) return;
    const now = Date.now();
    const last = REFRESH_FIRED.get(k);
    if (last && now - last < 60000) return;              // one poke / key / lambda / 60s
    if (REFRESH_FIRED.size > 5000) REFRESH_FIRED.clear(); // bound warm-lambda memory
    REFRESH_FIRED.set(k, now);
    const u = `${origin}/api/places/refresh?k=${encodeURIComponent(k)}&q=${encodeURIComponent(p.q)}&lat=${p.lat}&lng=${p.lng}&radius=${p.radius}&n=${p.n}`;
    fetch(u, { headers: { "x-wf-refresh": "1" } }).catch(() => {}); // never awaited
  } catch (e) { /* refresh is best-effort; a failure here must never touch the response */ }
}

// Minimal skeleton rows for the PERMANENT place-ID index (Place ID is ToS-legal
// to keep forever). Our derived coarse category + ranking signals + a name/coords
// skeleton so tiles can show known places when detail caches are cold.
function catFromTypes(types) {
  const t = ((types || []).join(" ") || "").toLowerCase();
  if (/lodging|hotel|motel|resort|guest_house|bed_and_breakfast/.test(t)) return "Hotels";
  if (/restaurant|cafe|coffee|bakery|meal_|food|ice_cream|deli/.test(t)) return "Food";
  if (/night_club|\bbar\b|pub|brewery|liquor/.test(t)) return "Nightlife";
  if (/store|shopping|mall|market|shop|boutique/.test(t)) return "Shopping";
  if (/tourist|museum|park|art_gallery|amusement|aquarium|zoo|stadium|landmark|historical|beach|marina|natural_feature/.test(t)) return "Activities";
  return null;
}
function skeletons(googlePlaces) {
  return (googlePlaces || []).map((p) => {
    if (!p || !p.id) return null;
    const name = typeof p.displayName === "string" ? p.displayName : (p.displayName && p.displayName.text) || null;
    const loc = p.location || {};
    return {
      id: p.id, name,
      lat: typeof loc.latitude === "number" ? loc.latitude : null,
      lng: typeof loc.longitude === "number" ? loc.longitude : null,
      category: catFromTypes(p.types),
      signals: { rating: p.rating || null, reviews: p.userRatingCount || 0 },
    };
  }).filter(Boolean);
}

async function handleSearch(params, origin) {
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
  const forceErr = String(params.forceErr || "") === "1"; // test hook: skip Google, drive the stale path
  const dbg = () => wantDebug ? { lastWrite: lastWrite(), memSize: memSize(), supabaseConfigured: cacheConfigured() } : undefined;

  const fresh = await cget(k);
  if (fresh) {
    // v6.35: serve the still-fresh copy instantly; if it is aging past its
    // jittered refresh age, poke a background refresh so it never reaches day 30.
    if (fresh.due) pokeRefresh(origin, k, { q, lat, lng, radius, n });
    return NextResponse.json({ places: fresh.v, cached: true, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
  }

  const serveStale = async () => {
    // ToS: serve a stale row ONLY within the 30-day age cap.
    const s = await cget(k, { staleMs: STALE_MAX_MS });
    return s ? NextResponse.json({ places: s.v, cached: true, stale: true, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS }) : null;
  };

  try {
    if (forceErr) { const s = await serveStale(); return s || NextResponse.json({ error: "forced (no stale)", debug: dbg() }, { status: 502 }); }
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: q, maxResultCount: n, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
    });
    if (!r.ok) {
      // v6.10: a 429/error on a CATEGORY search serves the OWNED inventory (the
      // complete owned set, e.g. ~191 hotels) BEFORE the thin stale cache, so a
      // Google quota outage no longer collapses "Stay" to one hotel. Free-text
      // searches (no cat) and empty inventory fall through to the stale cache.
      const inv = params.cat ? await serveFromInventory(params.cat, lat, lng, radius, n) : [];
      if (inv.length) return NextResponse.json({ places: inv, cached: false, source: "inventory", debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
      const stale = await serveStale();
      if (stale) return stale;
      return NextResponse.json({ error: "upstream " + r.status, debug: dbg() }, { status: 502 });
    }
    const data = await r.json();
    const places = data.places || [];
    if (places.length) await Promise.all([cset(k, places, FRESH_TTL_MS), upsertPlaceIds(skeletons(places))]);
    return NextResponse.json({ places, cached: false, debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
  } catch {
    const inv = params.cat ? await serveFromInventory(params.cat, lat, lng, radius, n) : [];
    if (inv.length) return NextResponse.json({ places: inv, cached: false, source: "inventory", debug: dbg() }, { headers: wantDebug ? {} : EDGE_HEADERS });
    const stale = await serveStale();
    if (stale) return stale;
    return NextResponse.json({ error: "upstream failure", debug: dbg() }, { status: 502 });
  }
}

// v6.05 — diagnostic for the candidate-set seeder (PR-B slice 2). searchNearby
// (New) is a DIFFERENT endpoint from the searchText proxy above — different body
// (locationRestriction, not locationBias), rankPreference, and includedTypes
// validity rules — and the seeder will be built on it, so its shape must be
// verified against reality before 400 lines wrap around a guess. This confirms:
// the request body is accepted, `primaryType` comes back in the field mask (the
// mapper's primaryType path has never run in prod), the includedTypes list is
// valid (an invalid Table-A type 400s the WHOLE call, silently zeroing a
// category), and whether searchNearby paginates (no nextPageToken => the grid is
// mandatory). Flexible by URL so any type list can be validated without redeploy.
// Default field mask — places.* only. NO nextPageToken: Nearby Search (New)
// does NOT paginate, so requesting it is an invalid field mask (the v6.05 probe
// 400'd every call on exactly that). The `fields` URL param overrides this, so
// any further mask question is answerable without another redeploy.
const NEARBY_MASK = [
  "places.id", "places.displayName", "places.primaryType", "places.types",
  "places.location", "places.rating", "places.userRatingCount", "places.businessStatus",
].join(",");
async function probeNearby(params) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ error: "server key not configured" }, { status: 501 });
  const types = String(params.types || "restaurant").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 50);
  const lat = Number(params.lat) || 27.3364, lng = Number(params.lng) || -82.5307;
  const radius = Math.min(Math.max(Number(params.radius) || 15000, 500), 50000);
  const rankPreference = String(params.rank || "POPULARITY").toUpperCase() === "DISTANCE" ? "DISTANCE" : "POPULARITY";
  const fieldMask = String(params.fields || NEARBY_MASK);
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": fieldMask },
      body: JSON.stringify({ includedTypes: types, maxResultCount: 20, rankPreference, locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
    });
    const raw = await r.text();
    let data = {}; try { data = JSON.parse(raw); } catch {}
    if (!r.ok) return NextResponse.json({ ok: false, status: r.status, includedTypes: types, fieldMask, error: data.error || raw.slice(0, 600) }, { status: 200 });
    const places = data.places || [];
    const sample = places.slice(0, 12).map((p) => ({
      name: (p.displayName && p.displayName.text) || null,
      primaryType: p.primaryType || null,
      types: p.types || [],
    }));
    return NextResponse.json({
      ok: true, status: 200, includedTypes: types, rankPreference,
      count: places.length,
      hasPrimaryType: places.length ? places.every((p) => !!p.primaryType) : null,
      sample,
    }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e && e.message || e) }, { status: 200 });
  }
}

export async function GET(req) {
  const u = new URL(req.url);
  const params = Object.fromEntries(u.searchParams);
  if (params.probe === "nearby") return probeNearby(params);
  return handleSearch(params, u.origin);
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  return handleSearch(body, new URL(req.url).origin);
}
