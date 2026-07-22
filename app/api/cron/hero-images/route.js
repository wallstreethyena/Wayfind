export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// Daily best-image monitor (owner, 2026-07-22): once a day, for each hero
// surface per metro centroid, re-pick the BEST real photo of the current
// pick (lib/heroImage — deterministic, reason recorded) and store it in
// wf_hero_images. Surfaces read the row first and fall back to their
// current logic — no row, no behavior change. CRON_SECRET-gated.
import { createClient } from "@supabase/supabase-js";
import { pickBestPhoto } from "../../../../lib/heroImage";

const CENTROIDS = { "manatee-sarasota": { lat: 27.4, lng: -82.55 }, tampa: { lat: 27.85, lng: -82.6 }, orlando: { lat: 28.54, lng: -81.38 } };

async function photosOf(placeId, key) {
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=photos`, {
      headers: { "X-Goog-Api-Key": key },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.photos) ? d.photos : [];
  } catch (e) { return []; }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const gkey = (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
  if (!url || !svc || !gkey) return Response.json({ error: "missing env" }, { status: 200 });
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const out = { surfaces: 0, updated: 0, skipped_no_better: 0 };
  const rows = [];
  for (const [metro, c] of Object.entries(CENTROIDS)) {
    // buzz surface: today's trending pick
    const { data } = await db.rpc("wf_buzz_picks", { p_lat: c.lat, p_lng: c.lng, p_radius_mi: 25, p_max: 1 });
    const pick = Array.isArray(data) && data[0];
    if (pick) {
      out.surfaces++;
      const best = pickBestPhoto(await photosOf(pick.place_id, gkey));
      if (best) rows.push({ surface: "buzz", key: metro, place_id: pick.place_id, photo_ref: best.ref, chosen_at: new Date().toISOString(), reason: best.reason });
      else out.skipped_no_better++;
    }
    // family surface (v6.57, owner: the daily image run feeds the SHARE cards
    // too): the metro's proven family-grade top attraction (same floor the
    // family list rides on: 4.5+/500+).
    const { data: fam } = await db.rpc("wf_best_picks", { p_lat: c.lat, p_lng: c.lng, p_local_hour: 12, p_radius_mi: 30, p_limit: 8, p_category: "things_to_do" });
    const fpick = (Array.isArray(fam) ? fam : []).find((r) => (r.rating || 0) >= 4.5 && (r.reviews || 0) >= 500);
    if (fpick) {
      out.surfaces++;
      const best = pickBestPhoto(await photosOf(fpick.place_id, gkey));
      if (best) rows.push({ surface: "family", key: metro, place_id: fpick.place_id, photo_ref: best.ref, chosen_at: new Date().toISOString(), reason: best.reason });
      else out.skipped_no_better++;
    }
  }
  if (rows.length) {
    const { error } = await db.from("wf_hero_images").upsert(rows, { onConflict: "surface,key" });
    if (!error) out.updated = rows.length;
  }
  try { console.log(JSON.stringify({ tag: "hero_images_cron", ...out })); } catch (e) {}
  return Response.json(out, { status: 200 });
}
