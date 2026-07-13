// lib/placeIndex.js — SERVER-ONLY. Reads the permanent wf_place_ids index (written
// by lib/serverCache.upsertPlaceIds on every successful server-proxy search).
//
// This index is the ALLOWLIST for durable /places/[id] pages: ONLY an id that a real
// search has put in the index gets a page. Any other id -> 404 with NO Google call,
// so a crawler enumerating Place-ID space costs one cheap Supabase read, never quota.
import { sbEnv } from "./serverCache";

// The skeleton row for an id, or null when it's not in the index (=> not allowlisted).
// Fields: place_id, name, lat, lng, category (nullable), signals { rating, reviews }.
export async function getSkeleton(id) {
  const s = sbEnv();
  if (!s || !id) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_place_ids?place_id=eq.${encodeURIComponent(id)}&select=place_id,name,lat,lng,category,signals&limit=1`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  } catch { return null; }
}

// Rows (place_id, name, category) newest-first, capped. The SINGLE source for
// generateStaticParams, the sitemap, AND the /places directory, so the prerendered
// set, the sitemap set, and the hub can never drift. Returns [] with no env (local
// build) — pages still render at runtime on Vercel via dynamicParams, gated by the
// allowlist check.
export async function listIndexedPlaces(limit = 500) {
  const s = sbEnv();
  if (!s) return [];
  try {
    const n = Math.min(Math.max(limit, 1), 1000);
    const r = await fetch(`${s.url}/rest/v1/wf_place_ids?select=place_id,name,category&order=seen_at.desc&limit=${n}`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    });
    if (!r.ok) return [];
    return (await r.json()).filter((x) => x && x.place_id && x.name);
  } catch { return []; }
}

// Just the ids (for generateStaticParams + sitemap).
export async function listIndexedIds(limit = 500) {
  return (await listIndexedPlaces(limit)).map((x) => x.place_id);
}
