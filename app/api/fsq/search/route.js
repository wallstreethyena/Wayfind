// v4.86 — Foursquare Places search: the app's SECOND place source. Returns
// venues already normalized to the app's common place shape so the client
// aggregator (lib/sources.js) can merge them with Google results directly.
// Fail-soft everywhere: no key, bad tier, or upstream error returns an empty
// list and the app keeps running on its other sources.
//
// Supports BOTH Foursquare key generations: the legacy v3 API (fsq3… keys,
// plain Authorization header) and the 2025+ Places API (service keys, Bearer
// + X-Places-Api-Version). We try v3 first and fall through on 401/403.
//
// HONESTY / TIER NOTE: rating, stats, price, hours, and photos are Foursquare
// "rich data" fields — some plans return them as null or reject the request.
// Verify what YOUR key actually returns with /api/fsq/search?probe=1 (never
// echoes the key; booleans + upstream status only).
// TODO: tips (review snippets) need a per-place /tips call — not wired yet to
// keep this to one request per search; revisit if the plan includes them.
export const runtime = "nodejs";
import { cget, cset, DAY } from "../../../../lib/serverCache";

const getKey = () => ((process.env["FOURSQUARE_API_KEY"] || "").trim());

// v5.90: Foursquare now shares the ONE Supabase cache (lib/serverCache) like
// Places — 30-day TTL, serve stale on a limit/error — so it fills the pool when
// Google 429s AND survives its own rate cap. (Foursquare's terms permit caching;
// this 30-day window is a conservative default, not a Google-style hard cap.)
const FSQ_TTL_MS = 30 * DAY;

const FIELDS = "fsq_id,name,geocodes,location,categories,distance,rating,stats,price,hours,photos";
const PRICE = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

async function fsqFetch(params, key) {
  let r = await fetch("https://api.foursquare.com/v3/places/search?" + params + "&fields=" + encodeURIComponent(FIELDS), {
    headers: { Authorization: key, Accept: "application/json" },
  });
  if (r.status === 401 || r.status === 403) {
    r = await fetch("https://places-api.foursquare.com/places/search?" + params, {
      headers: { Authorization: "Bearer " + key, "X-Places-Api-Version": "2025-06-17", Accept: "application/json" },
    });
  }
  return r;
}

// Normalize one Foursquare place (either API generation) into the app shape
// lib/google.js normalize() produces. Ratings: Foursquare scores 0–10; the
// app (and Google) use 0–5, so we halve. distMi comes from FSQ's own meters.
function normalize(p) {
  const lat = p.latitude != null ? p.latitude : p.geocodes && p.geocodes.main && p.geocodes.main.latitude;
  const lng = p.longitude != null ? p.longitude : p.geocodes && p.geocodes.main && p.geocodes.main.longitude;
  if (lat == null || lng == null || !p.name) return null;
  const rating10 = typeof p.rating === "number" ? p.rating : null;
  const photos = Array.isArray(p.photos) ? p.photos.slice(0, 3).map((ph) => (ph.prefix && ph.suffix ? ph.prefix + "original" + ph.suffix : null)).filter(Boolean) : [];
  const reviews = (p.stats && (p.stats.total_ratings || p.stats.totalRatings || p.stats.total_tips)) || 0;
  return {
    id: "fsq:" + (p.fsq_place_id || p.fsq_id),
    name: p.name,
    rating: rating10 != null ? Math.round((rating10 / 2) * 10) / 10 : null,
    reviews,
    price: PRICE[p.price] || null,
    priceNum: p.price != null && PRICE[p.price] ? p.price : null,
    address: (p.location && (p.location.formatted_address || p.location.address)) || "",
    lat, lng,
    distMi: typeof p.distance === "number" ? p.distance / 1609.34 : null,
    openNow: p.hours && typeof p.hours.open_now === "boolean" ? p.hours.open_now : null,
    nextOpen: null,
    oh: null,
    utcOffset: null,
    type: ((p.categories || [])[0] && p.categories[0].name) || "",
    types: (p.categories || []).map((c) => String(c.name || "").toLowerCase().replace(/ /g, "_")).filter(Boolean),
    photo: photos[0] || null,
    photos,
    photoAttrs: [],
    photoAttr: "",
    labels: [],
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + lat + "%2C" + lng, // coordinates always resolve; a name Google doesn't know dead-ends
    src: "fsq",
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const KEY = getKey();

  if (searchParams.get("probe") === "1") {
    // Diagnostic: booleans + upstream status + which rich fields came back.
    if (!KEY) return Response.json({ hasKey: false });
    try {
      const params = new URLSearchParams({ ll: "27.34,-82.53", radius: "20000", query: "restaurants", limit: "5" }).toString();
      const r = await fsqFetch(params, KEY);
      let gotRating = false, gotPhotos = false, gotPrice = false, n = 0;
      if (r.ok) {
        const d = await r.json();
        const arr = (d && d.results) || [];
        n = arr.length;
        gotRating = arr.some((x) => typeof x.rating === "number");
        gotPhotos = arr.some((x) => Array.isArray(x.photos) && x.photos.length);
        gotPrice = arr.some((x) => x.price != null);
      }
      return Response.json({ hasKey: true, upstreamStatus: r.status, results: n, richData: { rating: gotRating, photos: gotPhotos, price: gotPrice } });
    } catch (e) {
      return Response.json({ hasKey: true, upstreamStatus: "network_error" });
    }
  }

  const q = (searchParams.get("q") || "").trim().slice(0, 120);
  const lat = parseFloat(searchParams.get("lat"));
  const lng = parseFloat(searchParams.get("lng"));
  const radius = Math.min(Math.max(parseInt(searchParams.get("radius") || "27359", 10) || 27359, 500), 100000);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "30", 10) || 30, 1), 50);
  if (!KEY || !q || !isFinite(lat) || !isFinite(lng)) return Response.json({ places: [] });

  const ck = "fsq1|" + [q.toLowerCase(), lat.toFixed(2), lng.toFixed(2), radius, limit].join("|");
  const EDGE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };
  const forceErr = searchParams.get("forceErr") === "1"; // test hook
  const fresh = await cget(ck);
  if (fresh) return Response.json({ places: fresh.v, cached: true }, { headers: EDGE });
  // On a limit/error, degrade to the last cached result instead of an empty list.
  const serveStale = async () => { const s = await cget(ck, { staleMs: FSQ_TTL_MS }); return s ? Response.json({ places: s.v, cached: true, stale: true }, { headers: EDGE }) : Response.json({ places: [] }); };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    if (forceErr) return await serveStale();
    const params = new URLSearchParams({ ll: lat.toFixed(4) + "," + lng.toFixed(4), radius: String(radius), query: q, limit: String(limit) }).toString();
    const r = await fsqFetch(params, KEY);
    if (!r.ok) return await serveStale();
    const data = await r.json();
    const places = ((data && data.results) || []).map(normalize).filter(Boolean);
    if (places.length) await cset(ck, places, FSQ_TTL_MS);
    return Response.json({ places, cached: false }, { headers: EDGE });
  } catch (e) {
    return await serveStale();
  } finally {
    clearTimeout(timer);
  }
}
