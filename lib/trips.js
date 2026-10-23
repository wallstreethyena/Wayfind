// lib/trips.js
// Trip planner data model. Pure functions only, no React, so the main page
// component does not grow and this stays testable in isolation.
//
// A "trip" is a destination keyed by city + state. Places auto-file into the
// trip for their city when saved, and each trip is independently editable
// (reorder, mark visited, note, remove, move) and persists separately from
// the user's Favorites. Removing a place from Favorites does NOT touch trips.

export const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

// Parse "1234 Main St, Sarasota, FL 34236, USA" -> { city: "Sarasota", state: "FL" }.
// US formatted addresses are highly regular. We find the "ST 12345" segment and
// take the segment before it as the city. Returns nulls when it cannot tell, so
// callers bucket into "Unsorted" instead of guessing.
export function parseCityState(place) {
  const a = ((place && place.address) || "").trim();
  if (!a) return { city: null, state: null };
  const parts = a.split(",").map((s) => s.trim()).filter(Boolean);
  // Primary: a segment shaped like "FL 34236" or "FL 34236-1234".
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^([A-Z]{2})\s+\d{5}(?:-\d{4})?$/);
    if (m && US_STATES.has(m[1])) return { city: parts[i - 1], state: m[1] };
  }
  // Fallback: no zip, e.g. "Sarasota, FL, USA".
  for (let i = 1; i < parts.length; i++) {
    if (US_STATES.has(parts[i])) return { city: parts[i - 1], state: parts[i] };
  }
  return { city: null, state: null };
}

export function tripKeyOf(city, state) {
  const c = (city || "Unsorted").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const s = (state || "xx").toLowerCase();
  return s + "_" + c;
}

// Trip key + display fields for a place.
export function tripMetaForPlace(place) {
  const { city, state } = parseCityState(place);
  return { key: tripKeyOf(city, state), city: city || "Unsorted", state: state || null };
}

// 25 km: a new stop sits next to its nearest neighbour inside a local day
// trip, and appends when it is a different part of the map.
export const AUTO_ORDER_THRESHOLD_KM = 25;

export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Index in the ordered list where `place` should land. `auto` is false when
// nothing is close enough (caller appends) or when coordinates are missing.
export function nearestStopIndex(items, place, thresholdKm = AUTO_ORDER_THRESHOLD_KM) {
  const ordered = [...(items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  let best = -1;
  let bestKm = Infinity;
  for (let i = 0; i < ordered.length; i++) {
    const km = haversineKm(place, ordered[i] && ordered[i].place);
    if (km == null) continue;
    if (km < bestKm) { bestKm = km; best = i; }
  }
  if (best < 0 || bestKm > thresholdKm) {
    return { index: ordered.length, km: best < 0 ? null : bestKm, auto: false };
  }
  return { index: best + 1, km: bestKm, auto: true };
}

function insertAt(items, item, index) {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const at = Math.max(0, Math.min(index, sorted.length));
  sorted.splice(at, 0, item);
  return sorted.map((it, i) => ({ ...it, order: i }));
}


// Trips for the index: most places first, then newest.
export function tripList(trips) {
  return Object.values(trips || {}).sort(
    (a, b) => (b.items.length - a.items.length) || (b.createdTs - a.createdTs)
  );
}

// Add a place to its city trip. Creates the trip if needed. No-op if already present.
// Returns a new trips object. `ts` is injectable for testability.
// `opts.autoOrder` inserts next to the nearest stop within AUTO_ORDER_THRESHOLD_KM
// and otherwise appends — the same append the call used before the option existed.
// `opts.addedVia` is stored on the stop for analytics and is not required.
export function addPlaceToTrips(trips, place, ts, opts) {
  if (!place || !place.id) return trips;
  const meta = tripMetaForPlace(place);
  const now = ts || Date.now();
  const addedVia = opts && opts.addedVia ? opts.addedVia : null;
  const t = trips[meta.key];
  if (t) {
    if (t.items.some((it) => it.id === place.id)) return trips;
    const base = { id: place.id, place, visited: false, note: "", addedTs: now, addedVia };
    if (opts && opts.autoOrder) {
      const plan = nearestStopIndex(t.items, place);
      const items = insertAt(t.items, { ...base, order: plan.index }, plan.index);
      return { ...trips, [meta.key]: { ...t, updatedTs: now, items } };
    }
    const order = t.items.length ? Math.max(...t.items.map((i) => i.order)) + 1 : 0;
    return { ...trips, [meta.key]: { ...t, updatedTs: now, items: [...t.items, { ...base, order }] } };
  }
  return {
    ...trips,
    [meta.key]: {
      key: meta.key, city: meta.city, state: meta.state, createdTs: now, updatedTs: now,
      items: [{ id: place.id, place, order: 0, visited: false, note: "", addedTs: now, addedVia }],
    },
  };
}

export function toggleVisited(trips, key, placeId) {
  const t = trips[key];
  if (!t) return trips;
  return { ...trips, [key]: { ...t, updatedTs: Date.now(), items: t.items.map((it) => it.id === placeId ? { ...it, visited: !it.visited } : it) } };
}

export function setNote(trips, key, placeId, note) {
  const t = trips[key];
  if (!t) return trips;
  return { ...trips, [key]: { ...t, updatedTs: Date.now(), items: t.items.map((it) => it.id === placeId ? { ...it, note } : it) } };
}

export function tripStats(trip) {
  const items = trip ? trip.items : [];
  const visited = items.filter((i) => i.visited).length;
  return { total: items.length, visited, remaining: items.length - visited };
}


