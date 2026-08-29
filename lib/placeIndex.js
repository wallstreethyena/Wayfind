// lib/placeIndex.js — SERVER-ONLY. Reads the permanent wf_place_ids index (written
// by lib/serverCache.upsertPlaceIds on every successful server-proxy search).
//
// This index is the first ALLOWLIST for durable /places/[id] pages: an id that a
// real search has put in wf_place_ids gets a page. A second allowlist — a
// publish-ready Atlas card in data/atlas/editorial-cards.json — also opens
// /places/{id}, built from copy we already hold, with NO Google call.
// Any other id -> 404 with NO Google call, so a crawler enumerating Place-ID
// space costs one cheap Supabase read, never quota.
import { sbEnv } from "./serverCache";
import { listPublishReadyAtlasIds, unionIndexedAndAtlasIds } from "./atlasPlaceAllowlist";
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";

// The skeleton row for an id, or null when it's not in the index (=> not allowlisted).
// Fields: place_id, name, lat, lng, category (nullable), signals { rating, reviews }.
export async function getSkeleton(id) {
  const s = sbEnv();
  if (!s || !id) return null;
  try {
    const r = await fetchDeadline(`${s.url}/rest/v1/wf_place_ids?place_id=eq.${encodeURIComponent(id)}&select=place_id,name,lat,lng,category,signals&limit=1`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    }, DB_DEADLINE_MS);
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  } catch { return null; }
}

// Rows (place_id, name, category) newest-first, capped. The /places directory
// stays indexed-only (do not dump Atlas or the 12k inventory here).
// generateStaticParams + sitemap use listIndexedIds, which unions this set
// with the 263 publish-ready Atlas card ids. Returns [] with no env (local)
// build) — pages still render at runtime on Vercel via dynamicParams.
export async function listIndexedPlaces(limit = 500) {
  const s = sbEnv();
  if (!s) return [];
  try {
    const n = Math.min(Math.max(limit, 1), 1000);
    const r = await fetchDeadline(`${s.url}/rest/v1/wf_place_ids?select=place_id,name,category&order=seen_at.desc&limit=${n}`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    }, DB_DEADLINE_MS);
    if (!r.ok) return [];
    return (await r.json()).filter((x) => x && x.place_id && x.name);
  } catch { return []; }
}

// Indexed ids unioned with the publish-ready Atlas card ids (for
// generateStaticParams + sitemap). Silent Atlas-590 rows stay out.
export async function listIndexedIds(limit = 500) {
  const indexed = (await listIndexedPlaces(limit)).map((x) => x.place_id);
  return unionIndexedAndAtlasIds(indexed, listPublishReadyAtlasIds());
}
