// app/api/geocode/route.js — server-side reverse geocode proxy (P1 speed, v6.99).
//
// WHY THIS EXISTS. reverseGeocode() ran through the Maps JS SDK, so the FIRST
// visit of every located user pulled the whole maps.googleapis.com bootstrap
// onto the discovery homepage just to turn a lat/lng into "Bradenton, FL"
// (the localStorage cell cache from v6.41 only saves REPEAT visits). This
// proxy answers the same question server-side with the SERVER key and a
// SHARED cell-keyed cache, so no visitor pays the SDK download and the paid
// upstream call is made once per ~1.1km cell per 30 days SITE-WIDE, not once
// per browser. The client keeps its localStorage layer on top (test-map-cost
// locks that contract) and falls back to the SDK path if this route fails.
// Guarded in middleware.js (same-origin + per-IP rate limit — metered upstream).
import { cget, cset } from "../../../lib/serverCache";

export const dynamic = "force-dynamic";
const THIRTY_DAYS = 2592000;

// Same city-first walk as the client's _reverseGeocodeUncached: never a street
// address; locality+state, else locality, else township/county/neighborhood.
function nameFrom(results) {
  for (const r of results || []) {
    const comps = r.address_components || [];
    const city = comps.find((c) => c.types.includes("locality"))?.long_name;
    const state = comps.find((c) => c.types.includes("administrative_area_level_1"))?.short_name;
    if (city && state) return `${city}, ${state}`;
    if (city) return city;
  }
  const area = (results || []).find((r) => (r.types || []).some((t) => ["administrative_area_level_3", "administrative_area_level_2", "neighborhood", "sublocality"].includes(t)));
  if (area) {
    const comps = area.address_components || [];
    const nm = comps[0]?.long_name;
    const state = comps.find((c) => c.types.includes("administrative_area_level_1"))?.short_name;
    if (nm && state) return `${nm}, ${state}`;
    if (nm) return nm;
  }
  return null;
}

export async function GET(req) {
  try {
    const sp = new URL(req.url).searchParams;
    const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ name: null }, { status: 400 });
    }
    // ~1.1km cell — the same rounding the client cache uses, so the shared
    // key space matches the browser's mental model of the cache.
    const key = "revgeo|" + lat.toFixed(2) + "|" + lng.toFixed(2);
    const hit = await cget(key).catch(() => null);
    if (hit && hit.v && hit.v.name) {
      return Response.json(hit.v, { headers: { "Cache-Control": "public, s-maxage=" + THIRTY_DAYS + ", stale-while-revalidate=" + THIRTY_DAYS } });
    }
    const k = process.env.GOOGLE_MAPS_SERVER_KEY;
    if (!k) return Response.json({ name: null }, { status: 501 });
    const r = await fetch("https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat.toFixed(5) + "," + lng.toFixed(5) + "&key=" + k);
    if (!r.ok) return Response.json({ name: null }, { status: 502 });
    const d = await r.json();
    const name = nameFrom(d && d.results);
    if (!name) return Response.json({ name: null }, { status: 404 });
    const v = { name };
    try { await cset(key, v, THIRTY_DAYS * 1000); } catch (e) {}
    return Response.json(v, { headers: { "Cache-Control": "public, s-maxage=" + THIRTY_DAYS + ", stale-while-revalidate=" + THIRTY_DAYS } });
  } catch (e) {
    return Response.json({ name: null }, { status: 502 });
  }
}
