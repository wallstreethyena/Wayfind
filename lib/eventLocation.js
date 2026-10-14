// lib/eventLocation.js - HONEST EVENT LOCATION PRECISION (2026-10-14).
//
// Seven wf_events rows have only a coarse, city-level pin because no official
// source publishes trustworthy coordinates. A pin in the middle of a town looks
// like "the event is HERE" - a guessed location dressed as a verified one.
// APPROXIMATE_LOCATION_EVENTS lists them (code-only; no DB column). A listed
// event is still a valid event: it just never gets a map pin, JSON-LD geo, or
// coordinate directions, and the page says the exact entrance is unpublished.
//
// This is NOT wf_events.verification_confidence (that is about the event's
// FACTS and 'low' hides the event).
//
// The coarse lat/lng stays on the row and may keep feeding DISTANCE and
// near-me ranking (city-level is fine for "how far"). Only PRECISE uses -
// a map pin, JSON-LD geo, a coordinate directions link, nearby lookups -
// go through eventMapPoint().

export const APPROXIMATE_LOCATION_LINE = "Exact entrance not published. Check the organizer's directions.";

export const APPROXIMATE_LOCATION_EVENTS = Object.freeze({
  "fl26-amazing-grace-pumpkin-festival-2026": "Official site gives two different addresses.",
  "fl26-aunt-louise-s-fall-farm-days-2026": "Official site gives an address only; rural interpolation lands 3.2 mi off.",
  "fl26-sweet-season-farms-2026": "Address only; rural interpolation lands 8.5 mi off.",
  "fl26-psl-fall-fun-fest-2026": "Venue page lists two street names.",
  "fl26-ocala-polo-club-oktoberfest-2026": "Address does not geocode and the club site is parked.",
  "bedners-fall-festival-2026": "Address only; it does not geocode.",
  "fl26-estuscary-haunted-trail-2026": "Tourism map and organizer give different street numbers.",
});

// Rows reach map code as the raw wf_events row (event_id, slug) or as the feed
// card made by curatedToFeedEvent (id = "wfc:" + event_id).
function idsOf(row) {
  const out = [];
  for (const v of [row.event_id, row.slug, typeof row.id === "string" ? row.id.replace(/^wfc:/, "") : null]) {
    if (typeof v === "string" && v) out.push(v);
  }
  return out;
}

export function isApproximateLocation(row) {
  if (!row || typeof row !== "object") return false;
  return idsOf(row).some((id) => Object.prototype.hasOwnProperty.call(APPROXIMATE_LOCATION_EVENTS, id));
}

/** {lat,lng} for a precise map use, or null when approximate / no usable point. */
export function eventMapPoint(row) {
  if (!row || isApproximateLocation(row)) return null;
  if (row.lat == null || row.lng == null || row.lat === "" || row.lng === "") return null;
  const lat = Number(row.lat), lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/** The row with its coarse pin removed, for code that would otherwise read lat/lng as exact. */
export function withoutCoarsePoint(row) {
  return isApproximateLocation(row) ? { ...row, lat: null, lng: null } : row;
}

// ---- Truthful line for an event with NO usable coordinates (2026-10-14) ----
// A row with null lat/lng gets no pin and no JSON-LD geo (eventMapPoint returns
// null). The page must still say why, in one small line, instead of leaving a
// card with no explanation. Approximate rows keep APPROXIMATE_LOCATION_LINE.
export const UNCONFIRMED_LOCATION_LINE = "Exact location to be confirmed";
export const PARADE_ROUTE_LINE = "Parade route: see organizer for viewing spots";

export function isParadeEvent(row) {
  if (!row || typeof row !== "object") return false;
  const parts = [row.subcategory, row.category, ...(Array.isArray(row.tags) ? row.tags : [])];
  return parts.some((v) => typeof v === "string" && /parade/i.test(v));
}

/** The one-line location note, or null when the row has a precise pin or is an approximate-location row. */
export function eventLocationNote(row) {
  if (!row || typeof row !== "object") return null;
  if (isApproximateLocation(row) || eventMapPoint(row)) return null;
  return isParadeEvent(row) ? PARADE_ROUTE_LINE : UNCONFIRMED_LOCATION_LINE;
}
