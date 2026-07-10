// v5.22 — Insider intel per place (see lib/insiderServer.js). Cache-first:
// the LLM runs at most once per place per 30 days; every other request is a
// cache read. probe=1 reports how many places carry insider content.
export const runtime = "nodejs";
import { getInsider } from "../../../lib/insiderServer";

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("probe") === "1") {
    const s = sb();
    if (!s) return Response.json({ error: "no cache backend" });
    try {
      const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=like.ins1%7C*&select=k`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" });
      const cr = r.headers.get("content-range") || "";
      return Response.json({ places: cr.includes("/") ? parseInt(cr.split("/")[1], 10) : null });
    } catch { return Response.json({ places: null }); }
  }
  const p = {
    id: searchParams.get("id") || "",
    name: String(searchParams.get("name") || "").slice(0, 120),
    city: String(searchParams.get("city") || "").slice(0, 60),
    type: String(searchParams.get("type") || "").slice(0, 60),
    rating: searchParams.get("rating") ? Number(searchParams.get("rating")) : null,
    reviews: searchParams.get("reviews") ? Number(searchParams.get("reviews")) : 0,
    price: String(searchParams.get("price") || "").slice(0, 10),
  };
  if (!p.name) return Response.json({});
  const out = await getInsider(p).catch(() => null);
  return Response.json(out || {}, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=2592000" } });
}
