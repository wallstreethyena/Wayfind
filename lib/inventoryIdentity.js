// lib/inventoryIdentity.js — SERVER-ONLY. Read a wf_inventory row we already
// hold (name, lat/lng, category, signals). Never calls Google. A missing env
// or a missing row is null — the Atlas card still opens the page; we do not
// invent coordinates.
//
// wf_inventory is anon-readable. Prefer the service role when present so this
// matches getSkeleton(); fall back to the anon key so a place page can still
// hydrate lat/lng without a write credential.

import { inventoryToSkeleton, usableSupabaseEnv } from "./atlasPlaceAllowlist.js";

function inventoryEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!usableSupabaseEnv(url, key)) return null;
  return { url, key };
}

export async function getInventoryIdentity(id, { freshOnly = false, now = Date.now() } = {}) {
  if (!id) return null;
  if (freshOnly && !/^[A-Za-z0-9_-]{3,200}$/.test(String(id))) return null;
  const s = inventoryEnv();
  if (!s) return null;
  try {
    const r = await fetch(
      `${s.url}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(id)}&select=place_id,name,lat,lng,category,primary_type,google_types,signals,status${freshOnly ? ",refreshed_at,excluded" : ""}&limit=1`,
      { headers: { apikey: s.key, Authorization: "Bearer " + s.key }, cache: "no-store", ...(freshOnly ? { signal: AbortSignal.timeout(2500) } : {}) },
    );
    if (!r.ok) return null;
    const row = (await r.json())[0] || null;
    if (freshOnly) {
      // A link preview must never recover a provider name from an unbounded
      // age record, a future timestamp, or another place's row. No paid fetch.
      const refreshed = Date.parse(row?.refreshed_at);
      if (row?.place_id !== id || row?.excluded === true || !Number.isFinite(now)
        || !Number.isFinite(refreshed) || refreshed > now || now - refreshed >= 30 * 86400000) return null;
    }
    return inventoryToSkeleton(row);
  } catch {
    return null;
  }
}
