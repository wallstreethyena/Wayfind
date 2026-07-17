// v5.05 — Community like counts, server-aggregated (product direction: a
// place's likes make its card rank a little better for EVERYONE, but the raw
// count is never shown to users — this endpoint feeds the ranking nudge only).
// Two sources, unioned honestly:
//   • likes table    — signed-in members' current likes (RLS hides them from
//                      other clients, which is why aggregation happens HERE
//                      with the server key; only counts ever leave).
//   • events (like)  — anonymous likes, deduped by device_id so one person
//                      toggling can't stack the count.
// The per-place number is max(members, unique anonymous devices) — the two
// populations overlap (signed-in likes also log an event), so summing would
// double-count; max() is the honest floor.
export const runtime = "nodejs";

import { aggregateLikeSignals } from "../../../../lib/memberSignals.js";

// Curator Boost: the owner's like weight + identity are SERVER env ONLY — never
// hardcoded (public repo), never client-supplied. Missing owner id -> every like
// weight 1 (feature simply off). No query param can influence the weight.
const OWNER_ID = () => String(process.env.WF_OWNER_USER_ID || "").trim();
const OWNER_WEIGHT = () => Math.max(1, parseInt(process.env.WF_OWNER_LIKE_WEIGHT || "50", 10) || 50);

const mem = new Map(); // warm-instance: idsKey -> { counts, owner, exp }
const TTL = 60 * 1000; // 60s so an owner like/unlike propagates fast (matches s-maxage)

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export async function GET(req) {
  const s = sb();
  if (!s) return Response.json({ counts: {}, owner: {} });
  const { searchParams } = new URL(req.url);
  // ONLY the place-id allow-list comes from the client. Owner id + weight never do.
  const ids = String(searchParams.get("ids") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 50);
  if (!ids.length) return Response.json({ counts: {}, owner: {} });
  const ck = ids.slice().sort().join(",");
  const hit = mem.get(ck);
  if (hit && hit.exp > Date.now()) return Response.json({ counts: hit.counts, owner: hit.owner || {} }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } });
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  const inList = "in.(" + ids.map((x) => '"' + x.replace(/"/g, "") + '"').join(",") + ")";
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${s.url}/rest/v1/likes?place_id=${encodeURIComponent(inList)}&select=place_id,user_id&limit=5000`, { headers: h, cache: "no-store" }),
      fetch(`${s.url}/rest/v1/events?action=eq.like&place_id=${encodeURIComponent(inList)}&select=place_id,device_id&limit=5000`, { headers: h, cache: "no-store" }),
    ]);
    const likeRows = r1.ok ? await r1.json() : [];
    const deviceRows = r2.ok ? await r2.json() : [];
    // The owner weight + curator picks are applied HERE, in the one aggregate.
    const { counts, owner } = aggregateLikeSignals(likeRows, deviceRows, OWNER_ID(), OWNER_WEIGHT(), ids);
    mem.set(ck, { counts, owner, exp: Date.now() + TTL });
    return Response.json({ counts, owner }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } });
  } catch (e) { return Response.json({ counts: {}, owner: {} }); }
}
