// app/api/geocode/route.js — server-side reverse geocode proxy (P1 speed, v6.99).
//
// The shared cache is always consulted first. A cold lookup has an explicit,
// finite GOOGLE_GEOCODING_MONTH_CAP in front of it; absent configuration,
// ledger failure, and every closed gate mode fail without contacting Google.
//
// FREE OWNED FALLBACK: whenever the paid path cannot answer (no server key,
// budget refused, upstream error or no usable result) the route names the
// nearest covered city from data Wayfind already owns (COVERED_CITIES, 30 mi,
// via nearestOwnedCityName) instead of failing with 503. That answer is tagged
// source:"owned" and is NEVER written to the 30-day Google cache key: a month
// where the budget reopens can still fetch and cache the precise Google
// answer for the cell, and an owned guess can never poison it. It gets a
// shorter CDN lifetime for the same reason.
import { cget, cset } from "../../../lib/serverCache";
import { geocodingCap, spendAllowCapped } from "../../../lib/spendGate";
import { nearestOwnedCityName } from "../../../lib/locationHonesty";

export const dynamic = "force-dynamic";
const THIRTY_DAYS = 2592000;
const ONE_DAY = 86400;

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

export function geocodeCacheKey(lat, lng) {
  return "revgeo|" + lat.toFixed(2) + "|" + lng.toFixed(2);
}

// Kept dependency-injectable so the cost boundary is executable without a
// provider request. GET below supplies the production cache, ledger, and fetch.
export async function resolveReverseGeocode({ lat, lng, serverKey, cacheGet, cacheSet, spendAllow, fetchImpl, ownedName = nearestOwnedCityName }) {
  const key = geocodeCacheKey(lat, lng);
  const hit = await cacheGet(key).catch(() => null);
  if (hit && hit.v && hit.v.name) return { status: 200, value: hit.v, cached: true };
  // Free, never calls Google, never cached under the Google key.
  const owned = (failure) => {
    let name = "";
    try { name = ownedName(lat, lng) || ""; } catch (e) {}
    return name ? { status: 200, value: { name, source: "owned" }, cached: false, owned: true } : failure;
  };
  if (!serverKey) return owned({ status: 501, value: { name: null }, reason: "server key not configured" });
  if (!(await spendAllow())) return owned({ status: 503, value: { name: null }, reason: "budget unavailable" });

  let r;
  try {
    r = await fetchImpl(
      "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat.toFixed(5) + "," + lng.toFixed(5) + "&key=" + serverKey
    );
  } catch (e) {
    return owned({ status: 502, value: { name: null }, reason: "upstream" });
  }
  if (!r.ok) return owned({ status: 502, value: { name: null }, reason: "upstream" });
  const d = await r.json();
  const name = nameFrom(d && d.results);
  if (!name) return owned({ status: 404, value: { name: null }, reason: "not found" });
  const value = { name };
  try { await cacheSet(key, value, THIRTY_DAYS * 1000); } catch (e) {}
  return { status: 200, value, cached: false };
}

export async function GET(req) {
  try {
    const sp = new URL(req.url).searchParams;
    const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ name: null }, { status: 400 });
    }
    const result = await resolveReverseGeocode({
      lat,
      lng,
      serverKey: process.env.GOOGLE_MAPS_SERVER_KEY,
      cacheGet: cget,
      cacheSet: cset,
      spendAllow: () => spendAllowCapped("geocoding", geocodingCap()),
      fetchImpl: fetch,
    });
    const life = result.owned ? ONE_DAY : THIRTY_DAYS;
    const headers = result.status === 200
      ? { "Cache-Control": "public, s-maxage=" + life + ", stale-while-revalidate=" + life }
      : undefined;
    return Response.json(result.value, { status: result.status, headers });
  } catch (e) {
    return Response.json({ name: null }, { status: 502 });
  }
}
