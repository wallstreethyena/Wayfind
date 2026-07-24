// v4.86 — multi-source coverage diagnostic. For a lat/lng, runs every place
// category against Google (server key) AND Foursquare, dedupes the way
// lib/sources.js does, and reports per-category counts: google, fsq, overlap,
// merged. This is the "prove it" endpoint for the aggregation layer — hit
// /api/sources/compare?lat=27.58&lng=-82.43&radius=27359 after deploy.
// Read-only, no key material in the response, fail-soft per source.
export const runtime = "nodejs";

const CATS = [
  ["food", "best restaurants"],
  ["nightlife", "best bars and nightlife"],
  ["attractions", "top tourist attractions"],
  ["beach", "best beaches"],
  ["hotels", "best hotels"],
  ["shopping", "best shopping"],
];

const _nn = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const _dist = (a, b) => {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const sameVenue = (a, b) => {
  if (a.lat == null || b.lat == null) return false;
  const na = _nn(a.name), nb = _nn(b.name);
  if (!na || !nb) return false;
  const hit = na === nb || (na.length >= 5 && nb.includes(na)) || (nb.length >= 5 && na.includes(nb));
  return hit && _dist(a, b) <= 250;
};

async function googleSearch(q, lat, lng, radius, key) {
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.location" },
      body: JSON.stringify({ textQuery: q, maxResultCount: 20, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radius, 50000) } } }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return ((d && d.places) || []).map((p) => ({ name: p.displayName && p.displayName.text, lat: p.location && p.location.latitude, lng: p.location && p.location.longitude })).filter((p) => p.name && _dist(p, { lat, lng }) <= radius * 1.15);
  } catch (e) { return null; }
}

async function fsqSearch(q, lat, lng, radius, key) {
  try {
    const params = new URLSearchParams({ ll: lat.toFixed(4) + "," + lng.toFixed(4), radius: String(Math.min(radius, 100000)), query: q, limit: "50" }).toString();
    let r = await fetch("https://api.foursquare.com/v3/places/search?" + params + "&fields=fsq_id,name,geocodes,distance", { headers: { Authorization: key, Accept: "application/json" } });
    if (r.status === 401 || r.status === 403) {
      r = await fetch("https://places-api.foursquare.com/places/search?" + params, { headers: { Authorization: "Bearer " + key, "X-Places-Api-Version": "2025-06-17", Accept: "application/json" } });
    }
    if (!r.ok) return null;
    const d = await r.json();
    return ((d && d.results) || []).map((p) => ({ name: p.name, lat: p.latitude != null ? p.latitude : p.geocodes && p.geocodes.main && p.geocodes.main.latitude, lng: p.longitude != null ? p.longitude : p.geocodes && p.geocodes.main && p.geocodes.main.longitude })).filter((p) => p.name && p.lat != null);
  } catch (e) { return null; }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  // COST GATE: this diagnostic fires 6× Google Text Search + 6× Foursquare per
  // hit — it is NOT a user surface. Lock it behind CRON_SECRET (Bearer or ?key=)
  // so it can never be called anonymously to run up the bill. Fail-CLOSED: an
  // unset secret returns 401, never opens.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || (auth !== "Bearer " + secret && searchParams.get("key") !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const lat = parseFloat(searchParams.get("lat") || "27.58");
  const lng = parseFloat(searchParams.get("lng") || "-82.43");
  const radius = Math.min(Math.max(parseInt(searchParams.get("radius") || "27359", 10) || 27359, 1000), 100000);
  const gKey = (process.env["GOOGLE_MAPS_SERVER_KEY"] || "").trim();
  const fKey = (process.env["FOURSQUARE_API_KEY"] || "").trim();
  const out = { lat, lng, radiusMi: Math.round(radius / 1609.34), hasGoogleKey: !!gKey, hasFsqKey: !!fKey, categories: {} };
  for (const [cat, q] of CATS) {
    const [g, f] = await Promise.all([
      gKey ? googleSearch(q, lat, lng, radius, gKey) : Promise.resolve(null),
      fKey ? fsqSearch(q, lat, lng, radius, fKey) : Promise.resolve(null),
    ]);
    const gl = g || [], fl = f || [];
    let overlap = 0;
    const fsqOnly = fl.filter((fp) => { const twin = gl.some((gp) => sameVenue(gp, fp)); if (twin) overlap++; return !twin; });
    out.categories[cat] = { google: g == null ? "unavailable" : gl.length, fsq: f == null ? "unavailable" : fl.length, overlap, merged: gl.length + fsqOnly.length, gain: gl.length ? Math.round((fsqOnly.length / gl.length) * 100) + "%" : (fsqOnly.length ? "∞" : "0%") };
  }
  return Response.json(out);
}
