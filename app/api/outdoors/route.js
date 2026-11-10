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
export const maxDuration = 60;
// v7.1 (owner brief 2026-11-06). MEASURED, not assumed: wf_places_cache had
// never held one OSM row, and every visitor request (Tampa, Sarasota,
// Orlando, Miami) spent ~4.1-4.4s on a live Overpass attempt that returned
// "unavailable". The per-visitor cache key (visitor point rounded ~1 km) also
// meant a warm of market centers could not have helped real visitors. Why
// Overpass fails from Vercel is diagnosed by the warm endpoint's own sanitized
// attempt log (status, duration, bytes, outcome kind), not by this comment.
// See lib/osmRegional.js for the regional design.
import { REGIONS, regionsFor, readRegions, serveFromRegions, warmRegions } from "../../../lib/osmRegional.js";
import { requireOwner } from "../../../lib/commandCenter/auth.js";

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
function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
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
// v5.01 fail-fast: NPS and RIDB race a hard 4.5s wall each.
const wall = (p) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), 4500))]);

// v7.1 (owner brief 2026-11-06): visitors NEVER call Overpass. OSM parks,
// beaches and piers come from the regional inventory in wf_places_cache,
// refreshed only by lib/osmRegional.warmRegions() (daily cron + owner canary).
// One bounded read, filtered by distance from the visitor's own point.
async function osmForVisitor(lat, lng, radius) {
  const regions = regionsFor(lat, lng, radius);
  // Outside every region is a settled answer (cacheable), not an outage.
  if (!regions.length) return { osm: { configured: true, ok: true, places: [] }, osmFrom: "out_of_region" };
  const rows = await readRegions(sb(), regions.map((g) => g.slug));
  const served = serveFromRegions(rows, lat, lng, radius);
  if (!served.servedRows) return { osm: { configured: true, ok: false, places: [] }, osmFrom: "no_copy" };
  const places = served.places.map((p) => ({
    id: p.id, name: p.name, rating: null, reviews: 0, price: null, priceNum: null,
    address: "", lat: p.lat, lng: p.lng, distMi: p.distMi,
    openNow: null, nextOpen: null, oh: null, utcOffset: null,
    type: p.kind, types: ["park", p.kind.toLowerCase().replace(/ /g, "_")],
    photo: null, photos: [], photoAttrs: [], photoAttr: "",
    labels: [], mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + p.lat + "%2C" + p.lng,
    src: "osm",
  }));
  return { osm: { configured: true, ok: true, places }, osmFrom: "regional", osmVerifiedAt: served.oldestVerifiedAt, osmStale: served.stale };
}

// Refresh access: the Vercel cron (Bearer CRON_SECRET) or the signed-in owner
// (Supabase session checked by requireOwner, the Command Center gate).
async function warmAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization") || "";
  if (secret && authz === `Bearer ${secret}`) return { ok: true, mode: "cron" };
  const owner = await requireOwner(req);
  return owner.ok ? { ok: true, mode: "owner" } : { ok: false };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("probe") === "1") {
    return Response.json({ hasNpsKey: !!getNps(), hasRidbKey: !!getRidb(), osm: "keyless" });
  }
  // Refresh (cron or signed-in owner). Above the lat/lng check: it takes no
  // coordinates, only optional region slugs.
  if (searchParams.get("warm") === "1") {
    const auth = await warmAuthorized(req);
    if (!auth.ok) return new Response("unauthorized", { status: 401 });
    const only = (searchParams.get("regions") || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (only.some((slug) => !REGIONS.some((g) => g.slug === slug))) return Response.json({ error: "unknown region", regions: REGIONS.map((g) => g.slug) }, { status: 400 });
    const result = await warmRegions(sb(), { only: only.length ? only : null, holder: auth.mode + "-" + Date.now(), deadlineMs: 40000, perAttemptMs: 18000 });
    return Response.json({ ...result, mode: auth.mode }, { headers: { "Cache-Control": "no-store" } });
  }
  const lat = parseFloat(searchParams.get("lat"));
  const lng = parseFloat(searchParams.get("lng"));
  const radius = Math.min(Math.max(parseInt(searchParams.get("radius") || "27359", 10) || 27359, 1000), 120000);
  if (!isFinite(lat) || !isFinite(lng)) return Response.json({ places: [], counts: {} });

  const ck = [lat.toFixed(2), lng.toFixed(2), radius].join("|");
  const hit = mem.get(ck);
  if (hit && hit.exp > Date.now()) return Response.json(hit.body, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });

  const radiusMi = toMi(radius);
  const [npsR, ridbR, osmR] = await Promise.allSettled([wall(fromNPS(lat, lng, radiusMi)), wall(fromRIDB(lat, lng, radiusMi)), osmForVisitor(lat, lng, radius)]);
  const pick = (r, fb) => (r.status === "fulfilled" && r.value) ? r.value : fb;
  const nps = pick(npsR, { configured: !!getNps(), places: [] });
  const ridb = pick(ridbR, { configured: !!getRidb(), places: [] });
  const { osm, osmFrom, osmVerifiedAt, osmStale } = pick(osmR, { osm: { configured: true, ok: false, places: [] }, osmFrom: "no_copy" });
  const places = [...nps.places, ...ridb.places, ...osm.places];
  const body = { places, counts: { nps: nps.configured ? nps.places.length : "no key", ridb: ridb.configured ? ridb.places.length : "no key", osm: osm.ok === false ? "unavailable" : osm.places.length, osmFrom, ...(osmVerifiedAt ? { osmVerifiedAt } : {}), ...(osmStale ? { osmStale: true } : {}) } };
  // v4.91: a transient OSM outage must not be sticky — cache failures briefly
  // (10 min) so the next user retries, successes for the full 6h.
  // v4.93: and never let the CDN cache a failed response for an hour either.
  mem.set(ck, { body, exp: Date.now() + (osm.ok === false ? 10 * 60 * 1000 : TTL) });
  const cc = osm.ok === false ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400";
  return Response.json(body, { headers: { "Cache-Control": cc } });
}
