// v5.14 — Tripadvisor TERRA API enrichment, built to the real spec
// (docs.terra.tripadvisor.com): base https://terra.tripadvisor.com/api,
// X-API-KEY header. The CATALOG endpoints are used deliberately — they are
// "not limited by a partner's allowlist or geofencing" and still carry the
// overall traveler rating, review count, coordinates, and Tripadvisor URLs:
//   GET /catalog/locations/search?query=&geo_name=&size=   (name resolution)
//   GET /catalog/locations/{id}                            (rating + urls)
// Catalog search has no lat/long parameter, so the caller passes the place's
// CITY (geo_name) and this route verifies candidates by coordinates when the
// caller supplies them — a Sarasota bar can never resolve to a same-named
// place in another state.
//
// Cached 10 days per place (memory + shared Supabase + CDN) so repeat opens
// cost zero quota. Fail-soft everywhere; ?debug=1 exposes upstream detail.
export const runtime = "nodejs";

const getKey = () => ((process.env["TRIPADVISOR_API_KEY"] || process.env["TA_API_KEY"] || process.env["TRIPADVISOR_KEY"] || "").trim());

const BASE = "https://terra.tripadvisor.com/api";
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
const distKm = (a, b, c, d) => { const R = 6371, t = Math.PI / 180; const h = Math.sin((c - a) * t / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin((d - b) * t / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

// Field extraction for the confirmed Terra catalog shape: each search item
// wraps the payload in .location; names/addresses are language-tagged arrays
// ({ language, value, primary }); overall_rating rides on the projection.
const unwrap = (r) => (r && r.location) || r || {};
const nameOf = (r) => { const l = unwrap(r); if (typeof l.name === "string") return l.name; const n = l.names; if (!Array.isArray(n) || !n.length) return ""; const p = n.find((x) => x && x.primary) || n.find((x) => x && x.language === "en") || n[0]; return (p && (p.value || p.name)) || ""; };
const idOf = (r) => { const l = unwrap(r); return (l.id ?? l.location_id) ?? null; };
const coordsOf = (r) => { const c = unwrap(r).coordinates; if (!c) return null; const la = c.latitude ?? c.lat, lo = c.longitude ?? c.lng; return (la != null && lo != null) ? { lat: Number(la), lng: Number(lo) } : null; };
const overallOf = (r) => { const l = unwrap(r); return l.overall_rating || l.overallRating || null; };
const urlOf = (r) => { const l = unwrap(r); const u = l.urls || l.url || l.web_url; if (!u) return null; if (typeof u === "string") return u; if (Array.isArray(u)) { const f = u.find((x) => typeof x === "string" && x.startsWith("http")) || u.find((x) => x && typeof x.value === "string" && x.value.startsWith("http")); return typeof f === "string" ? f : (f && f.value) || null; } const v = u.main || u.web_url || u.tripadvisor || u.web || u.desktop || u.canonical || Object.values(u).find((x) => typeof x === "string" && x.startsWith("http")) || null; return typeof v === "string" ? v : null; };

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("probe") === "1") return Response.json({ hasKey: !!getKey(), api: "terra" });
  const KEY = getKey();
  const q = String(searchParams.get("q") || "").slice(0, 120).trim();
  const city = String(searchParams.get("city") || "").slice(0, 60).trim();
  const lat = parseFloat(searchParams.get("lat")), lng = parseFloat(searchParams.get("lng"));
  const debug = searchParams.get("debug") === "1";
  if (!KEY || !q) return Response.json({});
  const ck = "ta3|" /* v5.16: ta2 entries hold pre-extractor-fix "none" results */ + _nn(q) + "|" + _nn(city) + "|" + (isFinite(lat) ? lat.toFixed(2) + "," + lng.toFixed(2) : "");
  if (!debug) {
    const hit = await cacheGet(ck);
    if (hit) return Response.json(hit, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" } });
  }
  const H = { Accept: "application/json", "X-API-KEY": KEY };
  try {
    const sp = new URLSearchParams({ query: q, size: "20" });
    if (city) sp.set("geo_name", city);
    const sr = await fetch(`${BASE}/catalog/locations/search?` + sp.toString(), { headers: H });
    if (!sr.ok) { const t = await sr.text().catch(() => ""); return Response.json(debug ? { step: "search", upstream: sr.status, detail: t.slice(0, 300) } : {}); }
    const sd = await sr.json();
    const list = (sd && (sd.data || sd.content || sd.results || sd.items)) || (Array.isArray(sd) ? sd : []);
    const qn = _nn(q);
    let candidates = list.filter((r) => { const rn = _nn(nameOf(r)); return rn && (rn === qn || (qn.length >= 6 && rn.includes(qn)) || (rn.length >= 6 && qn.includes(rn))); });
    // Coordinate verification: with a caller location, a candidate more than
    // ~80 km away is a same-named place somewhere else — never it.
    if (isFinite(lat) && isFinite(lng)) {
      const near = candidates.map((r) => ({ r, c: coordsOf(r) })).filter((x) => !x.c || distKm(lat, lng, x.c.lat, x.c.lng) <= 80);
      near.sort((a, b) => (a.c ? distKm(lat, lng, a.c.lat, a.c.lng) : 999) - (b.c ? distKm(lat, lng, b.c.lat, b.c.lng) : 999));
      candidates = near.map((x) => x.r);
    }
    const best = candidates[0];
    if (!best || idOf(best) == null) { const empty = { none: true }; await cacheSet(ck, empty); return Response.json(debug ? { step: "match", sample: list.slice(0, 3).map((r) => ({ name: nameOf(r), id: idOf(r) })), raw: JSON.parse(JSON.stringify(list[0] || null)) } : empty); }
    // The search projection may already carry the rating; the catalog GET is
    // the authoritative, allowlist-free source for rating + urls.
    let d = best;
    let ov = overallOf(best);
    if (!ov || !urlOf(best)) {
      const dr = await fetch(`${BASE}/catalog/locations/${idOf(best)}`, { headers: H });
      if (dr.ok) { d = await dr.json(); ov = overallOf(d) || ov; }
      else if (debug) { const t = await dr.text().catch(() => ""); return Response.json({ step: "details", upstream: dr.status, detail: t.slice(0, 300) }); }
    }
    const out = {
      name: nameOf(d) || nameOf(best),
      rating: ov && ov.rating != null ? Number(ov.rating) : null,
      reviews: ov ? Number(ov.count ?? ov.review_count ?? ov.num_reviews ?? ov.total ?? ov.reviews ?? 0) || null : null,
      url: urlOf(d) || urlOf(best),
    };
    if (out.rating == null && out.reviews == null) { const empty = { none: true }; await cacheSet(ck, empty); return Response.json(debug ? { step: "empty", keys: Object.keys(d || {}).slice(0, 25) } : empty); }
    await cacheSet(ck, out);
    return Response.json(out, { headers: debug ? {} : { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=777600" } });
  } catch (e) { return Response.json(debug ? { step: "throw", detail: String(e && e.message || e).slice(0, 200) } : {}); }
}
