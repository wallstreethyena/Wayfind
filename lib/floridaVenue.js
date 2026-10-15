// lib/floridaVenue.js — ONE Florida venue eligibility rule for every event that
// can reach a discovery surface (owner, 2026-10-15).
//
// WHY: on 2026-10-14 the live homepage poster rail showed "Columbus Crew vs.
// Charlotte FC" at ScottsMiracle-Gro Field, Columbus OHIO. Wayfind is Florida
// discovery. The headless visitor had no GPS, so app/home.js ipFallback adopted
// the Vercel IP-geo point (a datacenter in Columbus, OH) as the CENTER, and
// /api/events then answered honestly for "events within 25mi of Columbus". Every
// distance check passed because the centre itself was outside Florida. The rule
// below does not look at the centre at all: it asks where the VENUE is.
//
// RULE (never team names, never the reader's centre):
//   1. A venue state is known (state field, or "City, ST" / "City, Florida" text):
//      keep iff it is FL.
//   2. No state, but venue coordinates: keep iff they fall inside the Florida
//      bounds (and inside `maxMi` of `center` when a caller passes them).
//   3. Neither: keep iff the venue/city text names a known Florida city.
//   Otherwise drop with reason "out_of_state".
// A visiting team playing in Florida is kept (its venue is Florida); a Florida
// team playing away is dropped (its venue is not).
//
// Pure, no I/O, so scripts/test-florida-venue-rule.mjs CALLS it.
import { CHRISTMAS_CITY_POINTS } from "./christmasDiscoveries2026.js";

// Same box lib/socialIdentity.js uses for "is this point in Florida".
export const FL_BOUNDS = Object.freeze({ minLat: 24.3, maxLat: 31.1, minLng: -87.7, maxLng: -79.7 });
export const OUT_OF_STATE = "out_of_state";

const STATE_NAMES = { florida: "FL", ohio: "OH", georgia: "GA", alabama: "AL", "north carolina": "NC", texas: "TX", california: "CA", "new york": "NY", illinois: "IL", michigan: "MI", tennessee: "TN", "south carolina": "SC", louisiana: "LA", pennsylvania: "PA" };

const normCity = (s) => String(s || "").toLowerCase().replace(/\bsaint\b/g, "st").replace(/\bft\.?\s/g, "fort ").replace(/[.']/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const FL_CITY_SET = new Set([
  ...Object.keys(CHRISTMAS_CITY_POINTS).map(normCity),
  "st pete", "st petersburg", "ybor city", "clearwater beach", "sarasota", "lakewood ranch", "siesta key",
]);

const coord = (v) => v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v));
export function inFloridaBounds(lat, lng) {
  if (!coord(lat) || !coord(lng)) return false;
  const a = Number(lat), b = Number(lng);
  return a >= FL_BOUNDS.minLat && a <= FL_BOUNDS.maxLat && b >= FL_BOUNDS.minLng && b <= FL_BOUNDS.maxLng;
}

function twoLetter(v) {
  const s = String(v || "").trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const named = STATE_NAMES[s.toLowerCase()];
  return named || "";
}

// "Sarasota, FL" / "Columbus, OH 43211" / "Tampa, Florida, USA" -> state code.
function stateFromText(text) {
  const parts = String(text || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const direct = twoLetter(parts[i]);
    if (direct) return direct;
    const zip = parts[i].match(/^([A-Za-z]{2})\s+\d{5}(?:-\d{4})?$/);
    if (zip) return zip[1].toUpperCase();
  }
  return "";
}

function explicitStateOf(e) {
  if (!e || typeof e !== "object") return "";
  for (const k of ["state", "stateCode", "venueState", "venue_state", "region"]) {
    const s = twoLetter(e[k]);
    if (s) return s;
  }
  return "";
}
function textStateOf(e) {
  return stateFromText(e && e.city) || stateFromText(e && e.venue) || stateFromText(e && e.address) || "";
}
/** Venue state (2-letter) from the explicit field, else the city/venue text. "" when unknown. */
export function venueStateOf(e) {
  return explicitStateOf(e) || textStateOf(e);
}

/** True when the venue/city text names a known Florida city (exact token, never a substring of a business). */
export function textNamesFloridaCity(e) {
  for (const raw of [e && e.city, e && e.venue, e && e.address]) {
    for (const token of String(raw || "").split(",")) {
      const t = normCity(token);
      if (t && FL_CITY_SET.has(t)) return true;
    }
  }
  return false;
}

/** { ok, reason }: the one Florida venue verdict. Optional { center:{lat,lng}, maxMi } adds the radius test. */
export function floridaVenueVerdict(e, { center = null, maxMi = null } = {}) {
  if (!e || typeof e !== "object") return { ok: false, reason: OUT_OF_STATE };
  const lat = e.lat ?? e.latitude, lng = e.lng ?? e.longitude;
  const hasCoords = coord(lat) && coord(lng);
  // Precedence: an EXPLICIT state field wins; else physical coordinates (a stray
  // two-letter token in venue text, "Brew Hub, Co", must not outrank them); else the
  // state parsed from city/venue text, else a known Florida city name.
  const explicit = explicitStateOf(e);
  const textState = explicit || hasCoords ? "" : textStateOf(e);
  let ok;
  if (explicit) ok = explicit === "FL";
  else if (hasCoords) ok = inFloridaBounds(lat, lng);
  else if (textState) ok = textState === "FL";
  else ok = textNamesFloridaCity(e);
  if (ok && hasCoords && center && coord(center.lat) && coord(center.lng) && maxMi != null) {
    const R = 3958.8, r = (d) => (d * Math.PI) / 180;
    const h = Math.sin(r(Number(lat) - center.lat) / 2) ** 2 + Math.cos(r(center.lat)) * Math.cos(r(Number(lat))) * Math.sin(r(Number(lng) - center.lng) / 2) ** 2;
    if (2 * R * Math.asin(Math.sqrt(h)) > maxMi) ok = false;
  }
  return ok ? { ok: true } : { ok: false, reason: OUT_OF_STATE };
}

export const isFloridaVenue = (e, opts) => floridaVenueVerdict(e, opts).ok;
/** Array filter used by every surface. Non-array in, empty array out. */
export const floridaVenuesOnly = (list) => (Array.isArray(list) ? list : []).filter((e) => isFloridaVenue(e));
