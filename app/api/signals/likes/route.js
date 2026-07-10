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

const mem = new Map(); // warm-instance: idsKey -> { counts, exp }
const TTL = 10 * 60 * 1000;

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export async function GET(req) {
  const s = sb();
  if (!s) return Response.json({ counts: {} });
  const { searchParams } = new URL(req.url);
  const ids = String(searchParams.get("ids") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 50);
  if (!ids.length) return Response.json({ counts: {} });
  const ck = ids.slice().sort().join(",");
  const hit = mem.get(ck);
  if (hit && hit.exp > Date.now()) return Response.json({ counts: hit.counts }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  const inList = "in.(" + ids.map((x) => '"' + x.replace(/"/g, "") + '"').join(",") + ")";
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${s.url}/rest/v1/likes?place_id=${encodeURIComponent(inList)}&select=place_id&limit=5000`, { headers: h, cache: "no-store" }),
      fetch(`${s.url}/rest/v1/events?action=eq.like&place_id=${encodeURIComponent(inList)}&select=place_id,device_id&limit=5000`, { headers: h, cache: "no-store" }),
    ]);
    const members = {}; const devices = {};
    if (r1.ok) for (const row of await r1.json()) { if (row.place_id) members[row.place_id] = (members[row.place_id] || 0) + 1; }
    if (r2.ok) for (const row of await r2.json()) { if (row.place_id) { (devices[row.place_id] = devices[row.place_id] || new Set()).add(row.device_id || "?"); } }
    const counts = {};
    for (const id of ids) {
      const n = Math.max(members[id] || 0, devices[id] ? devices[id].size : 0);
      if (n > 0) counts[id] = n;
    }
    mem.set(ck, { counts, exp: Date.now() + TTL });
    return Response.json({ counts }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (e) { return Response.json({ counts: {} }); }
}
