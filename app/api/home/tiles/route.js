export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Batched digest for the six "Explore near you" home-menu tiles. One request
// (?lat=&lng=) powers every tile's live subline instead of six separate
// client fetches. Self-fetches the existing app/api/places/search proxy (its
// own Supabase + warm-mem cache and GOOGLE_MAPS_SERVER_KEY requirement apply
// unchanged) so this route needs no new external dependency and degrades
// exactly the way that route degrades: no key configured -> empty digest for
// every kind -> every tile shows its static fallback. Never a broken tile.
//
// Cache: a warm-lambda Map keyed by a rounded geo bucket (~1km, matches the
// places/search route's own bucketing), TTL ~10 minutes. No Supabase layer —
// this route touches no write path and needs none; the mem cache is enough
// to keep a scrolling/returning user from re-billing Google every render.
import { NextResponse } from "next/server";
import { TILE_KINDS, TILE_QUERY, RADIUS_MI, buildDigest } from "../../../../lib/homeTiles";

const TTL_MS = 10 * 60 * 1000;
const RADIUS_M = Math.round(RADIUS_MI * 1609.34);
const mem = globalThis.__wfHomeTilesMem || (globalThis.__wfHomeTilesMem = new Map());

function bucketKey(lat, lng) {
  return lat.toFixed(2) + "," + lng.toFixed(2);
}

async function fetchKind(origin, kind, lat, lng) {
  try {
    const qs = new URLSearchParams({ q: TILE_QUERY[kind], lat: String(lat), lng: String(lng), radius: String(RADIUS_M), n: "20" });
    const r = await fetch(origin + "/api/places/search?" + qs.toString(), { cache: "no-store" });
    if (!r.ok) return {};
    const data = await r.json();
    if (!data || !Array.isArray(data.places)) return {};
    return buildDigest(kind, data.places, { lat, lng });
  } catch (e) {
    return {}; // fail-soft — this kind's tile falls back to its static line
  }
}

export async function GET(req) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  if (!isFinite(lat) || !isFinite(lng)) return NextResponse.json({});

  const key = bucketKey(lat, lng);
  const hit = mem.get(key);
  if (hit && hit.exp > Date.now()) {
    return NextResponse.json(hit.v, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  }

  const origin = u.origin;
  const entries = await Promise.all(TILE_KINDS.map((kind) => fetchKind(origin, kind, lat, lng).then((d) => [kind, d])));
  const out = Object.fromEntries(entries);
  mem.set(key, { v: out, exp: Date.now() + TTL_MS });
  return NextResponse.json(out, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
}
