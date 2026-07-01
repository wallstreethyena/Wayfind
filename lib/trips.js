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

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "Washington, D.C.",
};

export function stateName(code) { return STATE_NAMES[code] || code || ""; }

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

function normalizeOrder(items) {
  return [...items].sort((a, b) => a.order - b.order).map((it, i) => ({ ...it, order: i }));
}

export function sortedItems(trip) {
  return trip ? [...trip.items].sort((a, b) => a.order - b.order) : [];
}

// Trips for the index: most places first, then newest.
export function tripList(trips) {
  return Object.values(trips || {}).sort(
    (a, b) => (b.items.length - a.items.length) || (b.createdTs - a.createdTs)
  );
}

// Add a place to its city trip. Creates the trip if needed. No-op if already present.
// Returns a new trips object. `ts` is injectable for testability.
export function addPlaceToTrips(trips, place, ts) {
  if (!place || !place.id) return trips;
  const meta = tripMetaForPlace(place);
  const now = ts || Date.now();
  const t = trips[meta.key];
  if (t) {
    if (t.items.some((it) => it.id === place.id)) return trips;
    const order = t.items.length ? Math.max(...t.items.map((i) => i.order)) + 1 : 0;
    return { ...trips, [meta.key]: { ...t, items: [...t.items, { id: place.id, place, order, visited: false, note: "", addedTs: now }] } };
  }
  return {
    ...trips,
    [meta.key]: {
      key: meta.key, city: meta.city, state: meta.state, createdTs: now,
      items: [{ id: place.id, place, order: 0, visited: false, note: "", addedTs: now }],
    },
  };
}

export function removePlaceFromTrip(trips, key, placeId) {
  const t = trips[key];
  if (!t) return trips;
  const items = t.items.filter((it) => it.id !== placeId);
  if (!items.length) { const n = { ...trips }; delete n[key]; return n; } // drop empty trip
  return { ...trips, [key]: { ...t, items: normalizeOrder(items) } };
}

// dir: -1 moves the place earlier, +1 later.
export function moveItem(trips, key, placeId, dir) {
  const t = trips[key];
  if (!t) return trips;
  const items = sortedItems(t);
  const idx = items.findIndex((it) => it.id === placeId);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= items.length) return trips;
  const copy = [...items];
  [copy[idx], copy[swap]] = [copy[swap], copy[idx]];
  // Reindex by the new array position directly. Going through normalizeOrder
  // here would re-sort by the stale order field and undo the swap.
  return { ...trips, [key]: { ...t, items: copy.map((it, i) => ({ ...it, order: i })) } };
}

export function toggleVisited(trips, key, placeId) {
  const t = trips[key];
  if (!t) return trips;
  return { ...trips, [key]: { ...t, items: t.items.map((it) => it.id === placeId ? { ...it, visited: !it.visited } : it) } };
}

export function setNote(trips, key, placeId, note) {
  const t = trips[key];
  if (!t) return trips;
  return { ...trips, [key]: { ...t, items: t.items.map((it) => it.id === placeId ? { ...it, note } : it) } };
}

// Move a place from one existing trip to another existing trip. Also the manual
// fix for a place the parser filed under the wrong city.
export function movePlaceToTrip(trips, fromKey, toKey, placeId) {
  if (fromKey === toKey) return trips;
  const from = trips[fromKey];
  const to = trips[toKey];
  if (!from || !to) return trips;
  const item = from.items.find((it) => it.id === placeId);
  if (!item) return trips;
  if (to.items.some((it) => it.id === placeId)) return removePlaceFromTrip(trips, fromKey, placeId);
  const order = to.items.length ? Math.max(...to.items.map((i) => i.order)) + 1 : 0;
  let next = removePlaceFromTrip(trips, fromKey, placeId);
  const to2 = next[toKey]; // removePlaceFromTrip may have re-keyed nothing here, toKey is unaffected
  next = { ...next, [toKey]: { ...to2, items: [...to2.items, { ...item, order }] } };
  return next;
}

export function tripStats(trip) {
  const items = trip ? trip.items : [];
  const visited = items.filter((i) => i.visited).length;
  return { total: items.length, visited, remaining: items.length - visited };
}

// Google Maps directions through every stop in order. Last stop is the
// destination, the rest become waypoints. Returns null if nothing routable.
export function routeUrl(trip) {
  const pts = sortedItems(trip).map((i) => i.place).filter((p) => p && p.lat != null && p.lng != null);
  if (!pts.length) return null;
  const dest = pts[pts.length - 1];
  const mids = pts.slice(0, -1);
  let url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest.lat + "," + dest.lng);
  if (mids.length) url += "&waypoints=" + mids.map((p) => encodeURIComponent(p.lat + "," + p.lng)).join("|");
  return url;
}
