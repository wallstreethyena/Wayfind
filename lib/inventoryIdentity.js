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

export async function getInventoryIdentity(id) {
  if (!id) return null;
  const s = inventoryEnv();
  if (!s) return null;
  try {
    const r = await fetch(
      `${s.url}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(id)}&select=place_id,name,lat,lng,category,signals,status&limit=1`,
      { headers: { apikey: s.key, Authorization: "Bearer " + s.key }, cache: "no-store" },
    );
    if (!r.ok) return null;
    return inventoryToSkeleton((await r.json())[0] || null);
  } catch {
    return null;
  }
}
