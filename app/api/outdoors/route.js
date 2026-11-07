// v4.90 — Outdoor/recreation sources: NPS + RIDB (Recreation.gov) + OpenStreetMap.
// Server-only by design: NPS_API_KEY and RIDB_API_KEY are server env vars and
// must NEVER ship to the browser — this route fetches, normalizes to the app's
// common place shape, and returns clean JSON. No key material in any response.
//
// Fan-out is parallel and every source fails soft: one source down never
// breaks the page. Responses are memory-cached (6h for OSM/RIDB per geo; the
// full NPS park list is fetched once and cached 24h — the NPS API has no
// radius search, so we pull the whole ~470-unit list and distance-filter,
// which is one upstream call a day instead of one per user).
//
// OSM REALITY CHECK (v4.93): public Overpass servers aggressively throttle
// cloud-provider IPs; from Vercel they frequently time out even with the
// policy-required User-Agent and a mirror fallback. OSM is therefore
// best-effort here — it contributes when the servers respond and self-heals
// (10-min retry) when they don't. TODO if OSM coverage becomes load-bearing:
// a dedicated Overpass instance or a commercial OSM provider.
export const runtime = "nodejs";
export const maxDuration = 30;
// v7 (owner briefing: "0 live · 0 cached · 22 unavailable of 22 markets").
// Root cause, measured 2026-11-06: wf_places_cache held ZERO wf-osm rows, so
// the durable fallback below had never once been filled. Three faults kept it
// empty: (1) the daily warm fired 4 markets at once, each racing 2 hosts, but
// overpass-api.de grants each IP only 2 query slots, so the warm starved
// itself into 429s; (2) the second host, overpass.kumi.systems, was renamed
// overpass.private.coffee; (3) a successful live result was written with an
// un-awaited fetch that serverless can freeze before it lands. The warm now
// runs one market at a time with a generous budget (cron-only, see WARM_*),
// cache writes are awaited, and an expired row is still served as the stale
// fallback (rows are never deleted, by owner policy) while a refresh retries.
import { after } from "next/server";

const getNps = () => ((process.env["NPS_API_KEY"] || "").trim());
const getRidb = () => ((process.env["RIDB_API_KEY"] || "").trim());

const mem = new Map();
const TTL = 6 * 3600 * 1000;
let _npsAll = null; // { parks, exp }

// v5.04 — durable OSM layer. Overpass throttles cloud IPs, so a live miss is
// the NORM from Vercel, not the exception. Every live success is persisted to
// Supabase (7 days) and a live miss falls back to the last good result for
// that geo — once any request (or the daily cron warm) gets through, the area
// keeps its OSM parks/beaches/piers even while Overpass throttles us.
const OSM_KEEP_MS = 7 * 24 * 3600 * 1000;
function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
async function osmCacheGet(k, meta) {
  const s = sb();
  if (!s) return null;
  try {
    // v6.51: bounded so a slow Supabase read can never itself become the hang
    // — resolveOsm() below races this against the live Overpass attempt, and
    // an unbounded fetch here would defeat that race in the worst case.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(k)}&select=v,exp`, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store", signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const row = (await r.json())[0];
    if (!row) return null;
    // Stale-serve: an expired row is still a real, once-verified result and
    // beats "unavailable"; the caller refreshes it. meta reports freshness.
    if (meta) meta.exp = new Date(row.exp).getTime();
    return row.v;
  } catch { return null; }
}
// Every in-flight cache write, so after() can hold the function open for it.
const pendingWrites = new Set();
function osmCacheSet(k, v) {
  const p = osmCacheWrite(k, v);
  pendingWrites.add(p);
  p.finally(() => pendingWrites.delete(p));
  return p;
}
async function osmCacheWrite(k, v) {
  const s = sb();
  if (!s) return false;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache`, {
      method: "POST",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ k, v, exp: new Date(Date.now() + OSM_KEEP_MS).toISOString() }),
    });
    return r.ok;
  } catch (e) { return false; }
}

const toMi = (m) => m / 1609.34;
function distMi(aLat, aLng, bLat, bLng) {
  const R = 3958.8, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// ── NPS: national parks, monuments, historic sites, seashores ──────────────
async function fromNPS(lat, lng, radiusMi) {
  const key = getNps();
  if (!key) return { configured: false, places: [] };
  try {
    if (!_npsAll || _npsAll.exp < Date.now()) {
      const r = await fetch("https://developer.nps.gov/api/v1/parks?limit=500", { headers: { "X-Api-Key": key } });
      if (!r.ok) return { configured: true, places: [] };
      const d = await r.json();
      _npsAll = { parks: (d && d.data) || [], exp: Date.now() + 24 * 3600 * 1000 };
    }
    const places = _npsAll.parks
      .map((p) => {
        const plat = parseFloat(p.latitude), plng = parseFloat(p.longitude);
        if (!isFinite(plat) || !isFinite(plng) || !p.fullName) return null;
        const dm = distMi(lat, lng, plat, plng);
        if (dm > radiusMi) return null;
        const img = Array.isArray(p.images) && p.images[0] && p.images[0].url ? p.images[0].url : null;
        return {
          id: "nps:" + (p.parkCode || p.id), name: p.fullName,
          rating: null, reviews: 0, price: null, priceNum: null,
          address: (p.addresses && p.addresses[0] && `${p.addresses[0].city}, ${p.addresses[0].stateCode}`) || "",
          lat: plat, lng: plng, distMi: dm, openNow: null, nextOpen: null, oh: null, utcOffset: null,
          type: p.designation || "National Park Site",
          types: ["tourist_attraction", "park", (p.designation || "").toLowerCase().replace(/ /g, "_")].filter(Boolean),
          photo: img, photos: img ? [img] : [], photoAttrs: [], photoAttr: "NPS",
          labels: [], mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + plat + "%2C" + plng,
          src: "nps",
        };
      })
      .filter(Boolean);
    return { configured: true, places };
  } catch (e) { return { configured: true, places: [] }; }
}

// ── RIDB / Recreation.gov: campgrounds, trailheads, boat launches, day use ──
async function fromRIDB(lat, lng, radiusMi) {
  const key = getRidb();
  if (!key) return { configured: false, places: [] };
  try {
    const p = new URLSearchParams({ latitude: String(lat), longitude: String(lng), radius: String(Math.min(Math.round(radiusMi), 50)), limit: "50", activity: "" });
    const r = await fetch("https://ridb.recreation.gov/api/v1/facilities?" + p.toString(), { headers: { apikey: key } });
    if (!r.ok) return { configured: true, places: [] };
    const d = await r.json();
    const places = ((d && d.RECDATA) || [])
      .map((f) => {
        const plat = Number(f.FacilityLatitude), plng = Number(f.FacilityLongitude);
        if (!isFinite(plat) || !isFinite(plng) || !plat || !f.FacilityName) return null;
        const dm = distMi(lat, lng, plat, plng);
        if (dm > radiusMi) return null;
        const media = Array.isArray(f.MEDIA) ? f.MEDIA.find((m) => m && m.URL) : null;
        const kind = (f.FacilityTypeDescription || "Recreation Area").trim();
        return {
          id: "ridb:" + f.FacilityID, name: f.FacilityName.trim(),
          rating: null, reviews: 0, price: null, priceNum: null,
          address: "", lat: plat, lng: plng, distMi: dm,
          openNow: null, nextOpen: null, oh: null, utcOffset: null,
          type: kind, types: ["park", "recreation", kind.toLowerCase().replace(/ /g, "_")].filter(Boolean),
          photo: media ? media.URL : null, photos: media ? [media.URL] : [], photoAttrs: [], photoAttr: media ? "Recreation.gov" : "",
          labels: [], mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + plat + "%2C" + plng,
          src: "ridb",
        };
      })
      .filter(Boolean);
    return { configured: true, places };
  } catch (e) { return { configured: true, places: [] }; }
}

// ── OpenStreetMap Overpass: parks, beaches, reserves, viewpoints, piers ─────
const OSM_HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
async function fromOSM(lat, lng, radiusM, opts) {
  try {
    const R = Math.min(Math.round(radiusM), 60000);
    const waitMs = (opts && opts.timeoutMs) || 4000;
    const sequential = !!(opts && opts.sequential);
    const q = `[out:json][timeout:${Math.max(4, Math.floor(waitMs / 1000) - 1)}];(
      nwr["leisure"~"^(park|nature_reserve)$"]["name"](around:${R},${lat},${lng});
      nwr["natural"="beach"]["name"](around:${R},${lat},${lng});
      nwr["tourism"="viewpoint"]["name"](around:${R},${lat},${lng});
      nwr["man_made"="pier"]["name"](around:${R},${lat},${lng});
      nwr["leisure"="marina"]["name"](around:${R},${lat},${lng});
    );out center 80;`;
    // v5.01 fail-fast (launch prompt 3): the sequential 12s+12s mirror walk
    // was the page-speed killer. Both Overpass hosts are raced IN PARALLEL
    // with a hard 4s abort each — OSM either contributes quickly or this
    // round proceeds without it (10-min retry, never CDN-cached as a miss).
    const tryHost = async (host) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), waitMs);
      try {
        // OSM usage policy requires an identifying User-Agent; without one the
        // Apache front-end answers 406 Not Acceptable (verified live).
        const r = await fetch(host, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/x-www-form-urlencoded", "User-Agent": "Wayfind/1.0 (+https://www.gowayfind.com; hello@gowayfind.com)" }, body: "data=" + encodeURIComponent(q) });
        clearTimeout(timer);
        return r.ok ? r : null;
      } catch (e) { clearTimeout(timer); return null; }
    };
    // Warm mode asks one host at a time so it holds a single Overpass slot;
    // user traffic keeps the parallel race for speed.
    let r = null;
    if (sequential) { for (const h of OSM_HOSTS) { r = await tryHost(h); if (r) break; } }
    else r = await Promise.any(OSM_HOSTS.map((h) => tryHost(h).then((x) => { if (!x) throw new Error("miss"); return x; }))).catch(() => null);
    if (!r) return { configured: true, ok: false, places: [] };
    const d = await r.json();
    const kindOf = (t) => t.natural === "beach" ? "Beach" : t.tourism === "viewpoint" ? "Scenic viewpoint" : t.man_made === "pier" ? "Pier" : t.leisure === "marina" ? "Marina" : t.leisure === "nature_reserve" ? "Nature preserve" : "Park";
    const seen = new Set();
    const places = ((d && d.elements) || [])
      .map((el) => {
        const tags = el.tags || {};
        const name = tags.name;
        const plat = el.lat != null ? el.lat : el.center && el.center.lat;
        const plng = el.lon != null ? el.lon : el.center && el.center.lon;
        if (!name || plat == null || plng == null) return null;
        const nk = name.toLowerCase();
        if (seen.has(nk)) return null;
        seen.add(nk);
        const kind = kindOf(tags);
        return {
          id: "osm:" + el.type + el.id, name,
          rating: null, reviews: 0, price: null, priceNum: null,
          address: "", lat: plat, lng: plng, distMi: distMi(lat, lng, plat, plng),
          openNow: null, nextOpen: null, oh: null, utcOffset: null,
          type: kind, types: ["park", kind.toLowerCase().replace(/ /g, "_")],
          photo: null, photos: [], photoAttrs: [], photoAttr: "",
          labels: [], mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + plat + "%2C" + plng,
          src: "osm",
        };
      })
      .filter(Boolean);
    return { configured: true, ok: true, places };
  } catch (e) { return { configured: true, ok: false, places: [] }; }
}

// v5.01 fail-fast (launch prompt 3): every source races a hard 4.5s wall —
// a slow or dead upstream can never hold the route (or the Beach day / Things
// to do tabs) hostage. Whatever answered in time ships.
const wall = (p) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), 4500))]);

// v6.51 (owner: "the beach tab takes a long time") — root cause. Overpass is
// DOCUMENTED above as unreliable from cloud IPs, and until now every request
// paid its full ~4s live-fetch wall BEFORE ever consulting the 7-day durable
// cache this route already keeps for exactly that situation — the cache
// fallback only ran AFTER the live attempt had already failed, so the fast
// path never got used. fromOSM() and the cache lookup are started at the same
// tick and raced: a cache HIT short-circuits the response the moment it
// lands (~100-300ms, not ~4-4.5s), and the live attempt keeps running in the
// background to refresh the cache for next time — it just no longer blocks
// this request. A geo bucket with NO cache at all still costs the full wall,
// same as before; nothing got slower, the common case got much faster.
async function resolveOsm(lat, lng, radius, osmKey) {
  const live = wall(fromOSM(lat, lng, radius)); // fires now; not awaited yet
  const cached = await osmCacheGet(osmKey);
  if (Array.isArray(cached) && cached.length) {
    // after() keeps the function alive until the refresh write lands; a bare
    // floating promise can be frozen by serverless the moment we respond.
    live.then((r) => { if (r && r.ok && r.places.length) osmCacheSet(osmKey, r.places); }).catch(() => {});
    after(() => live.then(() => Promise.allSettled([...pendingWrites])));
    return { osm: { configured: true, ok: true, places: cached }, osmFrom: "cached" };
  }
  const r = await live;
  const osm = r || { configured: true, ok: false, places: [] };
  if (osm.ok && osm.places.length) await osmCacheSet(osmKey, osm.places);
  return { osm, osmFrom: "live" };
}

// Cron-only warm (Authorization: Bearer CRON_SECRET, ?warm=1). One market,
// one Overpass slot, a long budget, and the write is awaited and checked, so
// "live" in the owner briefing means the result actually landed in the cache.
// A row with more than WARM_SKIP_MS left is reported "cached" without
// touching Overpass at all, which spares the shared public server.
const WARM_SKIP_MS = 2 * 24 * 3600 * 1000;
async function warmOsm(lat, lng, radius, osmKey, budgetMs) {
  const meta = {};
  const cached = await osmCacheGet(osmKey, meta);
  const has = Array.isArray(cached) && cached.length > 0;
  if (has && meta.exp - Date.now() > WARM_SKIP_MS) return { osm: "cached", places: cached.length };
  const r = await fromOSM(lat, lng, radius, { timeoutMs: budgetMs, sequential: true });
  if (r && r.ok && r.places.length) {
    const saved = await osmCacheSet(osmKey, r.places);
    if (saved) return { osm: "live", places: r.places.length };
    return { osm: has ? "stale" : "unavailable", reason: "cache_write_failed" };
  }
  if (r && r.ok) return { osm: "empty", places: 0 };
  return { osm: has ? "stale" : "unavailable", reason: "overpass_unreachable" };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("probe") === "1") {
    return Response.json({ hasNpsKey: !!getNps(), hasRidbKey: !!getRidb(), osm: "keyless" });
  }
  const lat = parseFloat(searchParams.get("lat"));
  const lng = parseFloat(searchParams.get("lng"));
  const radius = Math.min(Math.max(parseInt(searchParams.get("radius") || "27359", 10) || 27359, 1000), 120000);
  if (!isFinite(lat) || !isFinite(lng)) return Response.json({ places: [], counts: {} });

  const ck = [lat.toFixed(2), lng.toFixed(2), radius].join("|");
  if (searchParams.get("warm") === "1") {
    const secret = process.env.CRON_SECRET;
    if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
    const budget = Math.min(Math.max(parseInt(searchParams.get("budget") || "15000", 10) || 15000, 4000), 25000);
    const result = await warmOsm(lat, lng, radius, "wf-osm|" + ck, budget);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  const hit = mem.get(ck);
  if (hit && hit.exp > Date.now()) return Response.json(hit.body, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });

  const radiusMi = toMi(radius);
  const osmKey = "wf-osm|" + ck;
  const [npsR, ridbR, osmR] = await Promise.allSettled([wall(fromNPS(lat, lng, radiusMi)), wall(fromRIDB(lat, lng, radiusMi)), resolveOsm(lat, lng, radius, osmKey)]);
  const pick = (r, fb) => (r.status === "fulfilled" && r.value) ? r.value : fb;
  const nps = pick(npsR, { configured: !!getNps(), places: [] });
  const ridb = pick(ridbR, { configured: !!getRidb(), places: [] });
  // v5.04 durable OSM, v6.51 cache-first: resolveOsm() already raced the live
  // Overpass attempt against the 7-day cache — counts.osm stays a real number
  // either way, marked "cached" for honesty when the fast path was used.
  const { osm, osmFrom } = pick(osmR, { osm: { configured: true, ok: false, places: [] }, osmFrom: "live" });
  const places = [...nps.places, ...ridb.places, ...osm.places];
  const body = { places, counts: { nps: nps.configured ? nps.places.length : "no key", ridb: ridb.configured ? ridb.places.length : "no key", osm: osm.ok === false ? "unavailable" : osm.places.length, ...(osmFrom === "cached" ? { osmFrom } : {}) } };
  // v4.91: a transient OSM outage must not be sticky — cache failures briefly
  // (10 min) so the next user retries, successes for the full 6h.
  // v4.93: and never let the CDN cache a failed response for an hour either.
  mem.set(ck, { body, exp: Date.now() + (osm.ok === false ? 10 * 60 * 1000 : TTL) });
  const cc = osm.ok === false ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400";
  return Response.json(body, { headers: { "Cache-Control": cc } });
}
