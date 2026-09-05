// v4.86 — Foursquare Places search: the app's SECOND place source. Returns
// venues already normalized to the app's common place shape so the client
// aggregator (lib/sources.js) can merge them with Google results directly.
// Fail-soft everywhere: no key, bad tier, or upstream error returns an empty
// list and the app keeps running on its other sources.
//
// Supports BOTH Foursquare key generations. The selection rule itself lives in
// lib/foursquare.js and is shared with lib/popularity.js and
// /api/sources/compare — this route used to hand-roll its own copy that fell
// through only on 401/403, so when v3 was sunset (2026-05-15) and began
// answering 429 the fallthrough never fired and this endpoint returned an
// empty list for ~4 months while still looking configured.
//
// HONESTY / TIER NOTE: rating, stats, price, hours, and photos are Foursquare
// "rich data" fields — some plans return them as null or reject the request.
// Verify what YOUR key actually returns with /api/fsq/search?probe=1 (never
// echoes the key; booleans + upstream status only).
// TODO: tips (review snippets) need a per-place /tips call — not wired yet to
// keep this to one request per search; revisit if the plan includes them.
export const runtime = "nodejs";
import { cget, cset, DAY } from "../../../../lib/serverCache";
import { fsqSearch, fsqOutcomeLabel } from "../../../../lib/foursquare";

const getKey = () => ((process.env["FOURSQUARE_API_KEY"] || "").trim());

// v5.90: Foursquare now shares the ONE Supabase cache (lib/serverCache) like
// Places — 30-day TTL, serve stale on a limit/error — so it fills the pool when
// Google 429s AND survives its own rate cap. (Foursquare's terms permit caching;
// this 30-day window is a conservative default, not a Google-style hard cap.)
const FSQ_TTL_MS = 30 * DAY;

const FIELDS = "fsq_id,name,geocodes,location,categories,distance,rating,stats,price,hours,photos";
const PRICE = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

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
    // v6.34: stamp the boolean's capture time. businessStatus trusts an openNow
    // snapshot only while fresh (SNAPSHOT_TRUST_MS); unstamped booleans never
    // assert — without this stamp every fsq open_now would read "unknown".
    hoursAsOf: p.hours && typeof p.hours.open_now === "boolean" ? Date.now() : null,
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
    // OPERATOR-ONLY. This diagnostic performs a REAL provider request, so an
    // anonymous caller looping it burns Foursquare quota — the same cost-DoS
    // shape middleware.js exists for, one layer in. Gated on CRON_SECRET via
    // Bearer or ?key=, the same operator contract /api/sources/compare and
    // /api/ta/place?probe=2 already use, and FAIL-CLOSED: an unset secret
    // returns 401 rather than opening the endpoint.
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization") || "";
    if (!secret || (auth !== "Bearer " + secret && searchParams.get("key") !== secret)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    // Diagnostic: booleans + upstream status + which rich fields came back.
    // NEVER echoes the credential or any request authorization header.
    if (!KEY) return Response.json({ hasKey: false });
    try {
      const params = new URLSearchParams({ ll: "27.34,-82.53", radius: "20000", query: "restaurants", limit: "5" }).toString();
      const res = await fsqSearch(params, KEY, { fields: FIELDS });
      const arr = res.results;
      const n = arr.length;
      const gotRating = arr.some((x) => typeof x.rating === "number");
      const gotPhotos = arr.some((x) => Array.isArray(x.photos) && x.photos.length);
      const gotPrice = arr.some((x) => x.price != null);
      // generation + attempts make a dead source name itself: a probe that only
      // said "0 results" is what let the post-sunset outage stay invisible.
      const sample = arr.slice(0, 3).map((x) => String(x.name || "").slice(0, 60)).filter(Boolean);
      return Response.json({ hasKey: true, upstreamStatus: res.status, generation: res.generation, outcome: fsqOutcomeLabel(res), attempts: res.attempts, results: n, sample, richData: { rating: gotRating, photos: gotPhotos, price: gotPrice } });
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

  try {
    if (forceErr) return await serveStale();
    const params = new URLSearchParams({ ll: lat.toFixed(4) + "," + lng.toFixed(4), radius: String(radius), query: q, limit: String(limit) }).toString();
    // The shared rule owns host order, headers and its own 5s timeout, and it
    // fails soft — an exhausted chain is ok:false with an empty results array,
    // never a throw, so the stale-serve path below stays the only degradation.
    const res = await fsqSearch(params, KEY, { fields: FIELDS });
    if (!res.ok) return await serveStale();
    const places = res.results.map(normalize).filter(Boolean);
    if (places.length) await cset(ck, places, FSQ_TTL_MS);
    return Response.json({ places, cached: false }, { headers: EDGE });
  } catch (e) {
    return await serveStale();
  }
}
