// lib/coordProvenance.js — WHERE A MAP COORDINATE CAME FROM, AND WHETHER WE MAY
// STILL DRAW IT. Pure (no imports), shared by the map API, the list serve and
// the browser, so every surface asks the same question the same way.
//
// WHY THIS EXISTS (2026-10-14, synthetic `surface-parity-parrish-cafes`). The
// Parrish Food > Cafés list showed Ryan's Coffee House while the map had no pin
// for it. The map applied "Google content expires at 30d" as one blanket
// refreshed_at cut; the list applied no cut at all. Measured that day: all 106
// Parrish café rows the list served were last refreshed 2026-08-13..09-01, so
// the map drew 1 pin against 39 cards and nothing explained the gap.
//
// THE RULE IS PER SOURCE, NOT PER ROW:
//
//   * Google Places latitude/longitude may be cached for 30 consecutive
//     calendar days and must then be deleted (Google Maps Platform Service
//     Specific Terms §14.3, Places API caching:
//     https://cloud.google.com/maps-platform/terms/maps-service-terms). The
//     place_id itself is exempt and may be stored (General Service Terms A.3;
//     https://developers.google.com/maps/documentation/places/web-service/policies).
//   * An independently sourced coordinate (OpenStreetMap, Wikidata, the venue's
//     own published address, an owner/editor measurement, FSQ OS Places) is
//     governed by ITS licence, not Google's clock. Each one is listed below with
//     the attribution its licence requires; an unlisted source is never drawn.
//
// PROVENANCE FINDING (read-only audit, 2026-10-14): every wf_inventory lat/lng
// today is a Google Places coordinate. The `source` column records how a row
// was DISCOVERED (google_type, unlock, creator_curation, owner-verified, ...),
// not where its coordinate came from — every writer (lib/promoteIndex.js
// toWriteRow, scripts/seed-places.mjs, app/api/city/unlock, the scout and
// ingest-verified scripts) copies `location` from a Places response. No table
// holds an independent coordinate keyed by place_id yet, so `independent_coords`
// below has no producer today; it is the contract an ingestion lane fills.
//
// NEVER EXTEND GOOGLE CONTENT BY BUMPING A TIMESTAMP. The Google observation
// time is `refreshed_at`, and that is only honest if the writer stored the
// coordinate it fetched at that instant. app/api/cron/inventory-refresh used to
// stamp refreshed_at=now after a cache-first details read (which can serve a
// row up to 30 days old) without writing lat/lng at all; it now goes through
// lib/inventoryRefreshPatch.js, which dates the row by the fetch and writes the
// fetched coordinate. Locked by scripts/test-coord-provenance.mjs.

export const DAY_MS = 86400000;
export const GOOGLE_COORD_MAX_AGE_DAYS = 30;

// One row per coordinate source we are allowed to draw. `maxAgeDays: null`
// means the licence sets no caching limit (attribution still applies).
export const COORD_SOURCES = Object.freeze({
  google_places: Object.freeze({
    label: "Google Places",
    maxAgeDays: GOOGLE_COORD_MAX_AGE_DAYS,
    attribution: null,
    terms: "https://cloud.google.com/maps-platform/terms/maps-service-terms",
  }),
  osm: Object.freeze({
    label: "OpenStreetMap",
    maxAgeDays: null,
    attribution: "© OpenStreetMap contributors (ODbL)",
    terms: "https://www.openstreetmap.org/copyright",
  }),
  wikidata: Object.freeze({
    label: "Wikidata",
    maxAgeDays: null,
    attribution: null, // CC0
    terms: "https://www.wikidata.org/wiki/Wikidata:Licensing",
  }),
  fsq_os_places: Object.freeze({
    label: "FSQ OS Places",
    maxAgeDays: null,
    attribution: "Foursquare Open Source Places (Apache-2.0)",
    terms: "https://docs.foursquare.com/data-products/docs/fsq-places-open-source",
  }),
  official_venue: Object.freeze({
    label: "Venue's own published location",
    maxAgeDays: null,
    attribution: null,
    terms: null,
  }),
  owner_verified: Object.freeze({
    label: "Wayfind owner/editor measurement",
    maxAgeDays: null,
    attribution: null,
    terms: null,
  }),
});

// The source of wf_inventory.lat/lng. See PROVENANCE FINDING above.
export const INVENTORY_COORD_SOURCE = "google_places";

// inv=1 LIST RESPONSE SCHEMA. The list response is edge-cached for up to a
// day; payloads cached before the mapCoord verdict existed lack it. The client
// sends this in the request (so it never reads a pre-verdict cached payload:
// a new URL is a new cache key) and the route echoes it. Bump it whenever the
// list row shape the map relies on changes. DB-only path, no Google calls.
export const INV_LIST_SCHEMA = "mapcoord3"; // 3: actual venue locality for session-only Apple identity matching

// The one reason a list place has no pin because of coordinate rules.
export const NO_PERMITTED_COORDINATE = "no-permitted-coordinate";

function validLatLng(lat, lng) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

// Judge ONE sourced coordinate. Returns { ok:true, lat, lng, source,
// observedAt, attribution } or { ok:false, reason, source }.
export function judgeCoordinate(c, now = Date.now()) {
  const source = c && typeof c.source === "string" ? c.source : null;
  const policy = source && Object.prototype.hasOwnProperty.call(COORD_SOURCES, source) ? COORD_SOURCES[source] : null;
  if (!policy) return { ok: false, reason: "unknown-source", source };
  if (!validLatLng(c.lat, c.lng)) return { ok: false, reason: "coordinate-invalid", source };
  const observed = c.observed_at == null ? NaN : Date.parse(c.observed_at);
  if (policy.maxAgeDays != null) {
    // A time-limited source must carry an honest observation time.
    if (!Number.isFinite(observed)) return { ok: false, reason: "coordinate-undated", source };
    if (observed > now) return { ok: false, reason: "coordinate-future-dated", source };
    if (now - observed > policy.maxAgeDays * DAY_MS) return { ok: false, reason: "coordinate-expired", source };
  }
  return {
    ok: true, lat: c.lat, lng: c.lng, source,
    observedAt: Number.isFinite(observed) ? new Date(observed).toISOString() : null,
    attribution: policy.attribution,
  };
}

// A server-recorded Google sighting: wf_place_ids.lat/lng with seen_at, copied
// into independent_coords by scripts/backfill-coords-from-place-sightings.mjs.
// Outside the repo seed files and the Atlas allowlist ids (the backfill excludes
// both), seen_at is written ONLY by lib/serverCache.upsertPlaceIds right after
// a live Google searchText response, so it is the honest observation time of
// that coordinate. It is still Google content: the 30-day clock runs from seen_at.
export const SIGHTING_METHOD = "wf_place_ids-sighting";

// Every coordinate a wf_inventory row offers, in the order they are tried:
//   1. the row's own Google coordinate (observed at refreshed_at);
//   2. recorded Google sightings (method SIGHTING_METHOD only; an
//      independent_coords entry claiming google_places by any other method is
//      refused, so Google content cannot re-enter dressed as independent),
//      freshest first;
//   3. genuinely independent sources, in stored order.
// The first candidate judgeCoordinate accepts is drawn. Fresh Google needs no
// attribution, so it wins whenever it is still inside its window; an
// independent coordinate takes over when Google's window has passed.
export function coordinateCandidates(row) {
  if (!row) return [];
  const own = [];
  const sightings = [];
  const independent = [];
  if (row.lat != null || row.lng != null) {
    own.push({ source: INVENTORY_COORD_SOURCE, lat: row.lat, lng: row.lng, observed_at: row.refreshed_at ?? null });
  }
  for (const c of Array.isArray(row.independent_coords) ? row.independent_coords : []) {
    if (!c || typeof c !== "object") continue;
    if (c.source === INVENTORY_COORD_SOURCE) { if (c.method === SIGHTING_METHOD) sightings.push(c); }
    else independent.push(c);
  }
  sightings.sort((a, b) => (Date.parse(b.observed_at) || 0) - (Date.parse(a.observed_at) || 0));
  return [...own, ...sightings, ...independent];
}

// The coordinate we may draw for this row right now, or why there is none.
// { ok:true, lat, lng, source, observedAt, attribution } |
// { ok:false, reason: NO_PERMITTED_COORDINATE, detail: [{source, reason}] }
export function resolveMapCoordinate(row, now = Date.now()) {
  const detail = [];
  for (const c of coordinateCandidates(row)) {
    const v = judgeCoordinate(c, now);
    if (v.ok) return v;
    detail.push({ source: v.source, reason: v.reason });
  }
  return { ok: false, reason: NO_PERMITTED_COORDINATE, detail };
}

// Compact verdict the list ships to the browser with each place (no
// coordinate copied, only whether one may be drawn and from which source).
// `until` is when a time-limited coordinate stops being drawable: the list
// response is edge-cached, so the browser re-checks it with mapCoordAllowedNow
// instead of trusting an "ok" that was true when the response was cached.
export function mapCoordVerdict(row, now = Date.now()) {
  const v = resolveMapCoordinate(row, now);
  if (!v.ok) return { ok: false, reason: v.reason, why: (v.detail[0] && v.detail[0].reason) || "no-coordinate" };
  const policy = COORD_SOURCES[v.source];
  const until = policy.maxAgeDays != null && v.observedAt
    ? new Date(Date.parse(v.observedAt) + policy.maxAgeDays * DAY_MS).toISOString() : null;
  return { ok: true, source: v.source, ...(until ? { until } : {}), ...(v.attribution ? { attribution: v.attribution } : {}) };
}

// Browser-side re-check of a shipped verdict. true / false, or null when the
// place carries no verdict (the server did not judge it).
export function mapCoordAllowedNow(place, now = Date.now()) {
  const v = place && place.mapCoord;
  if (!v || typeof v.ok !== "boolean") return null;
  if (!v.ok) return false;
  if (v.until == null) return true;
  const until = Date.parse(v.until);
  return Number.isFinite(until) && now <= until;
}

// The licence credits the map must show for the pins currently drawn: one line
// per distinct attribution (e.g. "© OpenStreetMap contributors (ODbL)").
export function creditsForPins(pins) {
  const out = [];
  for (const p of pins || []) {
    const a = p && typeof p.coordAttribution === "string" ? p.coordAttribution.trim() : "";
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}
