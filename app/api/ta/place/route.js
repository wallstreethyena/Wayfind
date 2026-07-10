// v5.10 — Tripadvisor Content API enrichment (server-only key). The detail
// sheet shows a second, independent trust signal — the place's Tripadvisor
// rating and review count with a link out — which strengthens content depth
// and credibility ("two sources agree" beats one).
//
// QUOTA REALITY: the Content API free tier is ~5,000 calls/month and each
// uncached place costs TWO calls (search → details). This route is therefore
// aggressively cached: warm-instance memory + the shared Supabase cache for
// 10 days per place + CDN s-maxage — repeat opens cost zero calls. Fail-soft
// everywhere: no key, no match, or upstream trouble returns {} and the sheet
// simply doesn't show the strip.
export const runtime = "nodejs";

const getKey = () => ((process.env["TRIPADVISOR_API_KEY"] || process.env["TA_API_KEY"] || process.env["TRIPADVISOR_KEY"] || "").trim());

const mem = new Map();
const TTL = 10 * 24 * 3600 * 1000;

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
async function cacheGet(k) {
  const m = mem.get(k);
  if (m && m.exp > Date.now()) return m.v;
  const s = sb();
  if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(k)}&select=v,exp`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store" });
    if (!r.ok) return null;
    const row = (await r.json())[0];
    if (!row || new Date(row.exp).getTime() < Date.now()) return null;
    mem.set(k, { v: row.v, exp: new Date(row.exp).getTime() });
    return row.v;
  } catch { return null; }
}
async function cacheSet(k, v) {
  mem.set(k, { v, exp: Date.now() + TTL });
  const s = sb();
  if (!s) return;
  try {
    await fetch(`${s.url}/rest/v1/wf_places_cache`, { method: "POST", headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ k, v, exp: new Date(Date.now() + TTL).toISOString() }) });
  } catch (e) {}
}

const _nn = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("probe") === "1") return Response.json({ hasKey: !!getKey() });
  const KEY = getKey();
  const q = String(searchParams.get("q") || "").slice(0, 120).trim();
  const lat = parseFloat(searchParams.get("lat")), lng = parseFloat(searchParams.get("lng"));
  if (!KEY || !q) return Response.json({});
  const ck = "ta|" + _nn(q) + "|" + (isFinite(lat) ? lat.toFixed(2) + "," + lng.toFixed(2) : "");
  const hit = await cacheGet(ck);
  if (hit) return Response.json(hit, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" } });
  try {
    const sp = new URLSearchParams({ key: KEY, searchQuery: q, language: "en" });
    if (isFinite(lat) && isFinite(lng)) { sp.set("latLong", lat + "," + lng); sp.set("radius", "15"); sp.set("radiusUnit", "mi"); }
    const sr = await fetch("https://api.content.tripadvisor.com/api/v1/location/search?" + sp.toString(), { headers: { Accept: "application/json", Referer: "https://www.gowayfind.com" } });
    if (!sr.ok) { const _t = await sr.text().catch(() => ""); return Response.json(searchParams.get("debug") === "1" ? { upstream: sr.status, detail: _t.slice(0, 300) } : {}); }
    const sd = await sr.json();
    const results = (sd && sd.data) || [];
    const qn = _nn(q);
    const best = results.find((r) => { const rn = _nn(r.name); return rn === qn || (qn.length >= 6 && rn.includes(qn)) || (rn.length >= 6 && qn.includes(rn)); }) || null;
    if (!best || !best.location_id) { const empty = { none: true }; await cacheSet(ck, empty); return Response.json(empty); }
    const dr = await fetch(`https://api.content.tripadvisor.com/api/v1/location/${best.location_id}/details?key=${encodeURIComponent(KEY)}&language=en&currency=USD`, { headers: { Accept: "application/json" } });
    if (!dr.ok) return Response.json({});
    const d = await dr.json();
    const out = {
      name: d.name || best.name,
      rating: d.rating != null ? Number(d.rating) : null,
      reviews: d.num_reviews != null ? Number(d.num_reviews) : null,
      ranking: (d.ranking_data && d.ranking_data.ranking_string) || null,
      url: d.web_url || null,
    };
    if (out.rating == null && out.reviews == null) { const empty = { none: true }; await cacheSet(ck, empty); return Response.json(empty); }
    await cacheSet(ck, out);
    return Response.json(out, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" } });
  } catch (e) { return Response.json({}); }
}
