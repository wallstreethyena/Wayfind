// lib/venueResolutionStore.js — THE BROWSER'S APPLE ANSWER FOR ONE VENUE,
// SHARED WITH EVERY SURFACE THAT RANKS THINGS NEAR IT.
//
// WHY (2026-10-22). PR #1913 lets the event map ask Apple where a provider
// venue really is (Ticketmaster points are often ZIP centroids: Tropicana
// Field 3.5 km off, Amerant Bank Arena 10 km) and draws the pin, the parking
// search and the Walk/Drive links from Apple's point. The nearby picks, the
// stays rail and the "Complete the plan" rails were still ranked from the
// provider point, so a reader saw a map centered on the stadium and a shelf
// centered on a neighbourhood miles away. The map is the only place that
// learns the corrected point, and it learns it in the browser after render, so
// it publishes the answer here and the other surfaces subscribe.
//
// SHAPE. A tiny module-level store, client-safe (no React, no window, no
// storage): a Map from a venue key to the last resolution, and a listener set
// per key. The key is the PROVIDER point as the page rendered it plus the
// venue name, so two venues (or two events at different venues) can never read
// each other's answer, and the same venue on two event pages shares one answer,
// which is correct because Apple's answer is about the venue, not the event.
// It is capped at 32 entries (oldest out first) so a long single-page session
// cannot grow it without bound.
export const REANCHOR_MIN_METERS = 300;
export const VENUE_RESOLUTION_MAX_ENTRIES = 32;

const entries = new Map();
const listeners = new Map();

function validPoint(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

const numeric = (value) => ((typeof value === "number" || (typeof value === "string" && value.trim() !== "")) ? Number(value) : NaN);

/** JSON of [lowercased trimmed name, lat to 5 places, lng to 5 places] for the
 *  PROVIDER point, or null when the venue has no usable point. */
export function venueResolutionKey(venue) {
  if (!venue || typeof venue !== "object") return null;
  const lat = numeric(venue.lat);
  const lng = numeric(venue.lng);
  if (!validPoint(lat, lng)) return null;
  return JSON.stringify([String(venue.name == null ? "" : venue.name).trim().toLowerCase(), lat.toFixed(5), lng.toFixed(5)]);
}

/** Pure: a resolution is worth re-anchoring nearby surfaces for only when
 *  Apple CORRECTED the provider point and moved it farther than minMeters. */
export function shouldReanchor(resolution, minMeters = REANCHOR_MIN_METERS) {
  return !!resolution
    && resolution.status === "corrected"
    && Number.isFinite(resolution.driftMeters)
    && resolution.driftMeters > minMeters;
}

function notify(key) {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of Array.from(set)) {
    try { listener(); } catch { /* one bad listener must not silence the others */ }
  }
}

function sameEntry(a, b) {
  return a.status === b.status && a.source === b.source && a.driftMeters === b.driftMeters
    && a.point.lat === b.point.lat && a.point.lng === b.point.lng;
}

/** Record the browser's answer for a venue and wake its subscribers. Returns
 *  the stored entry, or null when the venue or resolution is unusable. A repeat
 *  of an identical answer changes nothing and wakes nobody. */
export function publishVenueResolution(venue, resolution) {
  const key = venueResolutionKey(venue);
  if (!key || !resolution || typeof resolution !== "object") return null;
  const lat = numeric(resolution.point && resolution.point.lat);
  const lng = numeric(resolution.point && resolution.point.lng);
  if (!validPoint(lat, lng)) return null;
  const drift = numeric(resolution.driftMeters);
  const entry = Object.freeze({
    point: Object.freeze({ lat, lng }),
    status: typeof resolution.status === "string" ? resolution.status : "",
    driftMeters: Number.isFinite(drift) ? drift : 0,
    source: typeof resolution.source === "string" ? resolution.source : "",
  });
  const previous = entries.get(key);
  if (previous && sameEntry(previous, entry)) return previous;
  // Room for a new venue: drop the oldest answers NOBODY is subscribed to.
  // A mounted surface keeps its answer (an evicted key would flip its
  // subscribers back to the provider point and refetch); when every stored
  // key is live the cap simply grows by one.
  const evicted = [];
  if (!previous && entries.size >= VENUE_RESOLUTION_MAX_ENTRIES) {
    for (const stored of [...entries.keys()]) {
      if (entries.size < VENUE_RESOLUTION_MAX_ENTRIES) break;
      if (listeners.has(stored)) continue;
      entries.delete(stored);
      evicted.push(stored);
    }
  }
  entries.set(key, entry);
  for (const gone of evicted) notify(gone);
  notify(key);
  return entry;
}

/** The stored entry for this venue's provider point, or null. The same object
 *  is returned until the answer changes (safe as a useSyncExternalStore snapshot). */
export function readVenueResolution(venue) {
  const key = venueResolutionKey(venue);
  return key ? (entries.get(key) || null) : null;
}

/** Call listener whenever this venue's entry changes. Returns an unsubscribe. */
export function subscribeVenueResolution(venue, listener) {
  const key = venueResolutionKey(venue);
  if (!key || typeof listener !== "function") return () => {};
  let set = listeners.get(key);
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(listener);
  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (!current.size) listeners.delete(key);
  };
}

export function clearVenueResolutionsForTests() {
  entries.clear();
  listeners.clear();
}

export function venueResolutionCountForTests() { return entries.size; }
