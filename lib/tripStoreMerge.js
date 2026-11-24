// lib/tripStoreMerge.js — union of the two trip stores, with no other imports.
// The layout loads the planner bridge on every page. That bridge must not pull
// lib/trips.js (and the city table it imports) into the first-load bundle.

const NOT_A_FILING_CITY = /^(unsorted|trip|shared trip|florida)$/i;

function earlierTs(x, y) {
  const a = Number(x) || 0;
  const b = Number(y) || 0;
  if (!a) return b;
  if (!b) return a;
  return Math.min(a, b);
}

function filingCity(city) {
  const s = String(city || "").trim();
  if (!s || NOT_A_FILING_CITY.test(s)) return "";
  return s;
}

/**
 * Union of two trip maps (the app store and the date-plan store). Same stop id
 * keeps a calendar day from either copy and does not duplicate the row.
 * "Unsorted" never overwrites a real city name.
 */
export function mergeTripMaps(primary, secondary) {
  const a = primary && typeof primary === "object" && !Array.isArray(primary) ? primary : {};
  const b = secondary && typeof secondary === "object" && !Array.isArray(secondary) ? secondary : {};
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const L = a[key] && typeof a[key] === "object" ? a[key] : null;
    const R = b[key] && typeof b[key] === "object" ? b[key] : null;
    if (!L && !R) continue;
    if (L && !R) { out[key] = L; continue; }
    if (R && !L) { out[key] = R; continue; }
    const items = [];
    const seen = new Map();
    const rows = []
      .concat(Array.isArray(L.items) ? L.items : [])
      .concat(Array.isArray(R.items) ? R.items : []);
    for (const it of rows) {
      if (!it || it.id == null || it.id === "") continue;
      const id = String(it.id);
      if (!seen.has(id)) {
        seen.set(id, items.length);
        items.push(it);
        continue;
      }
      const prev = items[seen.get(id)];
      const day = prev.day || it.day || null;
      items[seen.get(id)] = {
        ...it,
        ...prev,
        ...(day ? { day } : {}),
        place: prev.place || it.place,
        note: prev.note || it.note || "",
      };
    }
    const city = filingCity(L.city) || filingCity(R.city) || L.city || R.city || "Unsorted";
    out[key] = {
      ...R,
      ...L,
      key: L.key || R.key || key,
      city,
      state: L.state || R.state || null,
      startDate: L.startDate || R.startDate || null,
      endDate: L.endDate || R.endDate || null,
      items,
      createdTs: earlierTs(L.createdTs, R.createdTs),
      updatedTs: Math.max(Number(L.updatedTs) || 0, Number(R.updatedTs) || 0),
    };
  }
  return out;
}

/** Read wayfind_trips and wf_trips_v1 together. Either store alone still works. */
export function readMergedTripStores(storage) {
  if (!storage || typeof storage.getItem !== "function") return {};
  let primary = {};
  let legacy = {};
  try {
    const raw = storage.getItem("wayfind_trips");
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) primary = parsed;
  } catch { /* ignore a corrupt canonical store */ }
  try {
    const raw = storage.getItem("wf_trips_v1");
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) legacy = parsed;
  } catch { /* ignore a corrupt date-plan store */ }
  return mergeTripMaps(primary, legacy);
}
