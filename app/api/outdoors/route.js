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

const getNps = () => ((process.env["NPS_API_KEY"] || "").trim());
const getRidb = () => ((process.env["RIDB_API_KEY"] || "").trim());

const mem = new Map();
const TTL = 6 * 3600 * 1000;
let _npsAll = null; // { parks, exp }

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
          labels: [], mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.fullName),
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
          labels: [], mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(f.FacilityName),
          src: "ridb",
        };
      })
      .filter(Boolean);
    return { configured: true, places };
  } catch (e) { return { configured: true, places: [] }; }
}

// ── OpenStreetMap Overpass: parks, beaches, reserves, viewpoints, piers ─────
async function fromOSM(lat, lng, radiusM) {
  try {
    const R = Math.min(Math.round(radiusM), 60000);
    const q = `[out:json][timeout:12];(
      nwr["leisure"~"^(park|nature_reserve)$"]["name"](around:${R},${lat},${lng});
      nwr["natural"="beach"]["name"](around:${R},${lat},${lng});
      nwr["tourism"="viewpoint"]["name"](around:${R},${lat},${lng});
      nwr["man_made"="pier"]["name"](around:${R},${lat},${lng});
      nwr["leisure"="marina"]["name"](around:${R},${lat},${lng});
    );out center 80;`;
    // v4.91: overpass-api.de is frequently overloaded — try the primary, then
    // the Kumi Systems mirror before giving up. ok:false marks a transient
    // failure so the caller won't cache the miss for 6 hours.
    const tryHost = async (host) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        // OSM usage policy requires an identifying User-Agent; without one the
        // Apache front-end answers 406 Not Acceptable (verified live).
        const r = await fetch(host, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/x-www-form-urlencoded", "User-Agent": "Wayfind/1.0 (+https://www.gowayfind.com; hello@gowayfind.com)" }, body: "data=" + encodeURIComponent(q) });
        clearTimeout(timer);
        return r.ok ? r : null;
      } catch (e) { clearTimeout(timer); return null; }
    };
    const r = (await tryHost("https://overpass-api.de/api/interpreter")) || (await tryHost("https://overpass.kumi.systems/api/interpreter"));
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
          labels: [], mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(name),
          src: "osm",
        };
      })
      .filter(Boolean);
    return { configured: true, ok: true, places };
  } catch (e) { return { configured: true, ok: false, places: [] }; }
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
  const hit = mem.get(ck);
  if (hit && hit.exp > Date.now()) return Response.json(hit.body, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });

  const radiusMi = toMi(radius);
  const [nps, ridb, osm] = await Promise.all([fromNPS(lat, lng, radiusMi), fromRIDB(lat, lng, radiusMi), fromOSM(lat, lng, radius)]);
  const places = [...nps.places, ...ridb.places, ...osm.places];
  const body = { places, counts: { nps: nps.configured ? nps.places.length : "no key", ridb: ridb.configured ? ridb.places.length : "no key", osm: osm.ok === false ? "unavailable" : osm.places.length } };
  // v4.91: a transient OSM outage must not be sticky — cache failures briefly
  // (10 min) so the next user retries, successes for the full 6h.
  // v4.93: and never let the CDN cache a failed response for an hour either.
  mem.set(ck, { body, exp: Date.now() + (osm.ok === false ? 10 * 60 * 1000 : TTL) });
  const cc = osm.ok === false ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400";
  return Response.json(body, { headers: { "Cache-Control": cc } });
}
