// v5.13 — Tripadvisor TERRA API enrichment (server-only key). The founder's
// key is a Terra key (terra.tripadvisor.com, x-api-key header) — NOT the
// legacy Content API, which we called first and which answered 403 for
// non-whitelisted IPs. Terra has no IP restriction. The detail sheet shows a
// second, independent trust signal — the place's Tripadvisor rating and
// review count with a link out.
//
// QUOTA CARE: each uncached place costs up to two calls (search → details).
// Aggressively cached: warm-instance memory + the shared Supabase cache for
// 10 days per place + CDN s-maxage — repeat opens cost zero calls. Fail-soft
// everywhere: no key, no match, or upstream trouble returns {} and the sheet
// simply doesn't show the strip. Terra's path layout is confirmed at runtime:
// the first successful path variant is remembered per warm instance, and
// ?debug=1 exposes upstream status/body for live diagnosis.
export const runtime = "nodejs";

const getKey = () => ((process.env["TRIPADVISOR_API_KEY"] || process.env["TA_API_KEY"] || process.env["TRIPADVISOR_KEY"] || "").trim());

const mem = new Map();
const TTL = 10 * 24 * 3600 * 1000;
let _base = null; // remembered working base path

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

// Terra path variants — the working one is discovered on first call and
// remembered for the life of the warm instance.
const BASES = [
  "https://terra.tripadvisor.com/api/v1",
  "https://terra.tripadvisor.com/v1",
  "https://terra.tripadvisor.com/content/v1",
];

async function terraGet(path, params, KEY) {
  const bases = _base ? [_base] : BASES;
  let lastStatus = 0, lastBody = "";
  for (const b of bases) {
    try {
      const r = await fetch(b + path + "?" + params.toString(), { headers: { Accept: "application/json", "x-api-key": KEY } });
      if (r.ok) { _base = b; return { ok: true, json: await r.json() }; }
      lastStatus = r.status; lastBody = await r.text().catch(() => "");
      if (r.status !== 404) { _base = _base || b; break; } // real error (auth/quota) — don't path-hunt
    } catch (e) { lastStatus = 0; lastBody = String(e && e.message || e); }
  }
  return { ok: false, status: lastStatus, body: lastBody };
}

// Tolerant extractors — Terra responses may use content-API names or newer ones.
const listOf = (d) => (d && (d.data || d.results || d.locations)) || [];
const ratingOf = (d) => { const v = d && (d.rating ?? (d.aggregateRating && d.aggregateRating.ratingValue) ?? (d.review_summary && d.review_summary.rating)); return v != null ? Number(v) : null; };
const reviewsOf = (d) => { const v = d && (d.num_reviews ?? d.numReviews ?? (d.aggregateRating && d.aggregateRating.reviewCount) ?? (d.review_summary && d.review_summary.count)); return v != null ? Number(v) : null; };
const urlOf = (d) => (d && (d.web_url || d.webUrl || d.url)) || null;
const idOf = (r) => (r && (r.location_id || r.locationId || r.id)) || null;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("probe") === "1") return Response.json({ hasKey: !!getKey(), api: "terra" });
  const KEY = getKey();
  const q = String(searchParams.get("q") || "").slice(0, 120).trim();
  const lat = parseFloat(searchParams.get("lat")), lng = parseFloat(searchParams.get("lng"));
  const debug = searchParams.get("debug") === "1";
  if (!KEY || !q) return Response.json({});
  const ck = "ta|" + _nn(q) + "|" + (isFinite(lat) ? lat.toFixed(2) + "," + lng.toFixed(2) : "");
  if (!debug) {
    const hit = await cacheGet(ck);
    if (hit) return Response.json(hit, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" } });
  }
  try {
    const sp = new URLSearchParams({ searchQuery: q, language: "en" });
    if (isFinite(lat) && isFinite(lng)) { sp.set("latLong", lat + "," + lng); sp.set("radius", "15"); sp.set("radiusUnit", "mi"); }
    const sr = await terraGet("/location/search", sp, KEY);
    if (!sr.ok) return Response.json(debug ? { step: "search", upstream: sr.status, detail: String(sr.body).slice(0, 300), triedBase: _base || "all" } : {});
    const results = listOf(sr.json);
    const qn = _nn(q);
    const best = results.find((r) => { const rn = _nn(r.name); return rn === qn || (qn.length >= 6 && rn.includes(qn)) || (rn.length >= 6 && qn.includes(rn)); }) || null;
    if (!best || !idOf(best)) { const empty = { none: true }; await cacheSet(ck, empty); return Response.json(debug ? { step: "match", found: results.slice(0, 3).map((r) => r.name) } : empty); }
    const dr = await terraGet(`/location/${idOf(best)}/details`, new URLSearchParams({ language: "en", currency: "USD" }), KEY);
    if (!dr.ok) return Response.json(debug ? { step: "details", upstream: dr.status, detail: String(dr.body).slice(0, 300) } : {});
    const d = dr.json;
    const out = {
      name: (d && d.name) || best.name,
      rating: ratingOf(d) ?? ratingOf(best),
      reviews: reviewsOf(d) ?? reviewsOf(best),
      ranking: (d && d.ranking_data && d.ranking_data.ranking_string) || null,
      url: urlOf(d) || urlOf(best),
    };
    if (out.rating == null && out.reviews == null) { const empty = { none: true }; await cacheSet(ck, empty); return Response.json(debug ? { step: "empty", detailKeys: Object.keys(d || {}).slice(0, 20) } : empty); }
    await cacheSet(ck, out);
    return Response.json(out, { headers: debug ? {} : { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" } });
  } catch (e) { return Response.json(debug ? { step: "throw", detail: String(e && e.message || e).slice(0, 200) } : {}); }
}
