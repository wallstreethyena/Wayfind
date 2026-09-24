// /api/photo-credits?place=<id>[,<id>...] — for each place, the photographer
// credits (wf_photo_credit) of photos the app ALREADY holds in its free photo
// cache. Read-only. NEVER calls Google.
//
// WHY (2026-09-23). Google photo names are not stable, so a place collects
// many credit rows (one per photo name per response) while the free photo
// cache holds only the few names that were actually rendered. A reader can
// only show a credited photo when BOTH exist for the same exact name. Those
// two tables are joined here, server-side, because the photo cache is not
// public. The blog then asks /api/photo (probe, never spends) for the image
// of each returned name and shows its credit. Fail closed: a name with no
// live credit, or no live cache row, is never returned.
import { NextResponse } from "next/server";
import { photoCacheKey } from "../../../lib/placePhotoServe";
import { pickCachedCredits } from "../../../lib/photoCredits";

export const dynamic = "force-dynamic";

const PLACE_RX = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_PLACES = 40;
const KEY_BATCH = 120;
const CACHE_WIDTH = 640;

function sbEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

async function rest(s, path) {
  const r = await fetch(`${s.url}/rest/v1/${path}`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" });
  if (!r.ok) throw new Error("supabase " + r.status);
  return r.json();
}

export async function GET(req) {
  const u = new URL(req.url);
  const ids = [...new Set(String(u.searchParams.get("place") || "").split(",").map((x) => x.trim()).filter((x) => PLACE_RX.test(x)))].slice(0, MAX_PLACES);
  const headers = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600" };
  if (!ids.length) return NextResponse.json({ credits: [] }, { headers });
  const s = sbEnv();
  if (!s) return NextResponse.json({ credits: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    const nowIso = encodeURIComponent(new Date().toISOString());
    // 1. Which exact photo names of these places are live in the free photo
    //    cache right now (the same `photo|<name>|640` rows /api/photo serves).
    const likes = ids.map((id) => `k.like."${photoCacheKey(`places/${id}/photos/*`, CACHE_WIDTH)}"`).join(",");
    const cacheRows = await rest(s, `wf_places_cache?select=k&or=(${encodeURIComponent(likes)})&exp=gt.${nowIso}&limit=2000`);
    const live = new Set();
    for (const row of cacheRows) {
      const m = /^photo\|(places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+)\|640$/.exec(row.k || "");
      if (m) live.add(m[1]);
    }
    // 2. The live credits for exactly those names.
    const names = [...live];
    const credits = [];
    for (let i = 0; i < names.length; i += KEY_BATCH) {
      const inList = names.slice(i, i + KEY_BATCH).map((n) => `"${n}"`).join(",");
      credits.push(...(await rest(s, `wf_photo_credit?select=photo_name,place_id,author_name,author_uri,maps_uri&photo_name=in.(${encodeURIComponent(inList)})&expires_at=gt.${nowIso}`)));
    }
    return NextResponse.json({ credits: pickCachedCredits(credits, live) }, { headers });
  } catch {
    return NextResponse.json({ credits: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
