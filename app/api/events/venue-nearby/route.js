// GET /api/events/venue-nearby: the nearby picks and the stays for a CORRECTED
// venue point.
//
// WHY (2026-10-22). An event page's nearby picks, stays rail and "Complete the
// plan" rails are ranked on the server from the provider's venue point.
// Ticketmaster points are often a ZIP centroid (Tropicana Field 3.5 km off,
// Amerant Bank Arena 10 km). The browser's Apple check (lib/appleVenueLocation.js,
// via EventVenueMap) learns the real point after render; when it moves the venue
// by more than 300 m, app/components/EventNearbyReanchor.js asks this route for
// the shelves around the corrected point. One same-origin read, no map call.
//
// FREE, OWNED INVENTORY ONLY. It runs the very same two reads the event page
// runs on the server: lib/eventPairingsCache (wf_inventory restaurants, things
// to do and nightlife) and lib/eventStaysCached (owned hotels + stay inventory,
// the SAME Data Cache entry app/components/EventStays.js uses for that point).
// It imports nothing from lib/google*, lib/serpapi* or lib/foursquare*
// (scripts/test-event-venue-nearby-api.mjs reads this file and walks its imports).
//
// The coordinates are rounded to 4 decimals (about 11 m) before anything runs, so
// a scraper iterating novel points cannot mint unbounded cache entries. The
// route is in middleware.js's matcher next to /api/search: same-origin only plus
// the per-IP rate limit.
import { NextResponse } from "next/server";
import { cachedEventPairings } from "../../../../lib/eventPairingsCache.js";
import { pairingHref } from "../../../../lib/eventPairings.js";
import { cachedEventStays } from "../../../../lib/eventStaysCached.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const VENUE_NEARBY_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
const NO_STORE = "private, no-store, max-age=0";
export const MAX_NAME_CHARS = 120;
export const MAX_FIELD_CHARS = 80;

const COORD_DECIMALS = 4;
const roundCoord = (value) => Number(value.toFixed(COORD_DECIMALS));

function coordinate(params, key, limit) {
  const raw = params.get(key);
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function text(params, key, max) {
  const raw = params.get(key);
  if (raw == null) return "";
  const value = raw.trim();
  return value.length <= max ? value : null;
}

/** Validate a request. Returns { ok: true, query } or { ok: false, error }. */
export function parseVenueNearbyQuery(url) {
  const params = new URL(url).searchParams;
  const rawLat = coordinate(params, "lat", 90);
  const rawLng = coordinate(params, "lng", 180);
  if (rawLat == null || rawLng == null) return { ok: false, error: "lat and lng must be finite coordinates" };
  const lat = roundCoord(rawLat);
  const lng = roundCoord(rawLng);
  if (lat === 0 && lng === 0) return { ok: false, error: "lat and lng must not be 0,0" };
  const fields = { name: text(params, "name", MAX_NAME_CHARS) };
  for (const key of ["city", "date", "time", "segment", "genre", "placeId"]) fields[key] = text(params, key, MAX_FIELD_CHARS);
  const tooLong = Object.keys(fields).find((key) => fields[key] === null);
  if (tooLong) return { ok: false, error: `${tooLong} is too long` };
  // Data Cache key arguments are shape-checked so a script cannot mint cache
  // entries out of free text: a Google place id, a city of letters, a date
  // and a clock in their stored shapes. An off-shape value is dropped, not an
  // error, so a legitimate page with an odd city still gets its answer.
  if (fields.placeId && !/^ChIJ[\w-]{10,120}$/.test(fields.placeId)) fields.placeId = "";
  if (fields.city && !/^[\p{L}\p{M} .'’-]{1,80}$/u.test(fields.city)) fields.city = "";
  if (fields.date && !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) fields.date = "";
  if (fields.time && !/^\d{2}:\d{2}(:\d{2})?$/.test(fields.time)) fields.time = "";
  return { ok: true, query: { lat, lng, ...fields } };
}

const json = (body, status, cacheControl) => NextResponse.json(body, { status, headers: { "Cache-Control": cacheControl } });

/**
 * Build the GET handler. `pairings(event)` and `stays(lat, lng)` default to the
 * live cached readers; each resolves to { places, unavailable }.
 */
export function createHandler({ pairings = cachedEventPairings, stays = cachedEventStays } = {}) {
  return async function GET(request) {
    const parsed = parseVenueNearbyQuery(request.url);
    if (!parsed.ok) return json({ error: parsed.error }, 400, NO_STORE);
    const { lat, lng, name, city, date, time, segment, genre, placeId } = parsed.query;
    const [pairingResult, stayResult] = await Promise.allSettled([
      Promise.resolve().then(() => pairings({ lat, lng, city: city || null, place_id: placeId || null, name, date, time, segment, genre })),
      Promise.resolve().then(() => stays(lat, lng)),
    ]);
    const pairingValue = pairingResult.status === "fulfilled" ? pairingResult.value : null;
    const stayValue = stayResult.status === "fulfilled" ? stayResult.value : null;
    const picksOk = !!pairingValue && !pairingValue.unavailable && Array.isArray(pairingValue.places);
    const staysOk = !!stayValue && !stayValue.unavailable && Array.isArray(stayValue.places);
    const body = {
      picks: picksOk ? pairingValue.places.map((place) => ({ ...place, href: pairingHref(place) })) : [],
      stays: staysOk ? stayValue.places : [],
      unavailable: { picks: !picksOk, stays: !staysOk },
      point: { lat, lng },
    };
    // A degraded answer must not sit in a shared cache for an hour.
    return json(body, 200, picksOk && staysOk ? VENUE_NEARBY_CACHE_CONTROL : NO_STORE);
  };
}

export const GET = createHandler();
