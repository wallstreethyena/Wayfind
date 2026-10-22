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
  return [...items].sort(compareTripItems).map((it, i) => ({ ...it, order: i }));
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

const DATE_YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Validate a pure calendar date "YYYY-MM-DD" without ever constructing a
// local-midnight Date("YYYY-MM-DD"), which shifts backward by a day in US
// timezones when formatted in local time. Also accepts a Date instance (such
// as a PostgreSQL DATE column parsed at UTC midnight by PGlite/pg).
export function normalizeStopDate(raw) {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    const y = raw.getUTCFullYear();
    const m = raw.getUTCMonth() + 1;
    const d = raw.getUTCDate();
    if (y < 1900 || y > 2100) return null;
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const m = trimmed.match(DATE_YMD_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function itemDayOf(item) {
  if (!item || typeof item !== "object") return null;
  return normalizeStopDate(item.day != null ? item.day : item.date);
}

// Local calendar date "YYYY-MM-DD" from a Date or timestamp using local
// year/month/day fields (never .toISOString(), which flips to tomorrow in the
// evening in US timezones).
export function localDateYmd(ref = new Date()) {
  const d = ref instanceof Date ? ref : new Date(ref);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isPastStopDate(ymd, today = localDateYmd()) {
  const clean = normalizeStopDate(ymd);
  const cleanToday = normalizeStopDate(today);
  if (!clean || !cleanToday) return false;
  return clean < cleanToday;
}

// Pure calendar day arithmetic on "YYYY-MM-DD" using UTC noon so DST 23h/25h
// days never skip or repeat a date.
export function addCalendarDays(ymd, deltaDays) {
  const clean = normalizeStopDate(ymd);
  if (!clean || !Number.isFinite(Number(deltaDays))) return null;
  const [y, m, d] = clean.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + Math.trunc(Number(deltaDays)), 12, 0, 0));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

// Format a "YYYY-MM-DD" string in UTC at noon so the calendar day is identical
// in every browser timezone (America/New_York, America/Los_Angeles, UTC, etc.).
export function formatStopDate(ymd, opts = {}) {
  const clean = normalizeStopDate(ymd);
  if (!clean) return "";
  const [y, m, d] = clean.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const refYear = opts.referenceYear != null ? Number(opts.referenceYear) : null;
  const showYear = Boolean(opts.includeYear || (refYear && refYear !== y));
  if (opts.compact) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      ...(showYear ? { year: "numeric" } : {}),
    }).format(utcNoon);
  }
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: opts.heading ? "long" : "short",
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  }).format(utcNoon);
}

// One-tap date shortcuts for the inline date picker: Today, Tomorrow, upcoming
// weekend days, plus any dates already used on this trip.
export function quickDateChoices(trip, now = new Date()) {
  const today = localDateYmd(now);
  const out = [];
  const seen = new Set();
  const push = (day, label) => {
    const clean = normalizeStopDate(day);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push({ day: clean, label: label || formatStopDate(clean) });
  };
  if (today) {
    push(today, "Today · " + formatStopDate(today, { compact: true }));
    const tomorrow = addCalendarDays(today, 1);
    if (tomorrow) push(tomorrow, "Tomorrow · " + formatStopDate(tomorrow, { compact: true }));
    const [y, m, d] = today.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay(); // 0=Sun..6=Sat
    const daysToSat = (6 - dow + 7) % 7;
    if (daysToSat >= 2) {
      const sat = addCalendarDays(today, daysToSat);
      const sun = addCalendarDays(today, daysToSat + 1);
      if (sat) push(sat, formatStopDate(sat));
      if (sun) push(sun, formatStopDate(sun));
    } else if (dow === 6) {
      // Today is Saturday, Tomorrow is Sunday (already added).
    }
  }
  const existingDays = Array.from(
    new Set(((trip && trip.items) || []).map(itemDayOf).filter(Boolean))
  ).sort();
  for (const d of existingDays) {
    push(d, formatStopDate(d));
  }
  return out;
}

function resolveTodayYmd(opts) {
  if (opts && opts.today) {
    const clean = normalizeStopDate(opts.today);
    if (clean) return clean;
  }
  return localDateYmd(opts && opts.now ? opts.now : new Date());
}

function compareTripItems(a, b, today) {
  const da = itemDayOf(a);
  const db = itemDayOf(b);
  if (da && db) {
    if (da !== db) {
      if (today) {
        const pastA = da < today;
        const pastB = db < today;
        if (pastA !== pastB) return pastA ? 1 : -1;
      }
      return da < db ? -1 : 1;
    }
  } else if (da && !db) {
    return -1;
  } else if (!da && db) {
    return 1;
  }
  return (a.order || 0) - (b.order || 0);
}

export function sortedItems(trip, opts) {
  const today = resolveTodayYmd(opts);
  if (!trip || !Array.isArray(trip.items)) return [];
  return [...trip.items]
    .sort((a, b) => compareTripItems(a, b, today))
    .map((it) => {
      if (!it || !it.place || typeof it.place !== "object") return it;
      const d = itemDayOf(it);
      if (d && it.place.day !== d) return { ...it, place: { ...it.place, day: d } };
      if (!d && it.place.day !== undefined) {
        const { day: _d, ...restPlace } = it.place;
        return { ...it, place: restPlace };
      }
      return it;
    });
}

export function groupItemsByDay(trip, opts = {}) {
  const today = resolveTodayYmd(opts);
  const items = sortedItems(trip, { today });
  const hasDates = items.some((it) => itemDayOf(it) !== null);
  if (!hasDates) {
    return {
      hasDates: false,
      groups: items.length ? [{ key: "all", day: null, isPast: false, label: null, shortLabel: null, items }] : [],
    };
  }
  const byDay = new Map();
  const unscheduled = [];
  for (const it of items) {
    const day = itemDayOf(it);
    if (!day) {
      unscheduled.push(it);
    } else {
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(it);
    }
  }
  const groups = [];
  for (const [day, dayItems] of byDay.entries()) {
    const isPast = Boolean(today && day < today);
    const baseHeading = formatStopDate(day, { ...opts, heading: true });
    const baseShort = formatStopDate(day, opts);
    groups.push({
      key: day,
      day,
      isPast,
      label: isPast ? `Past · ${baseHeading}` : baseHeading,
      shortLabel: isPast ? `Past · ${baseShort}` : baseShort,
      items: dayItems,
    });
  }
  if (unscheduled.length) {
    groups.push({
      key: "unscheduled",
      day: null,
      isPast: false,
      label: "Unscheduled",
      shortLabel: "Unscheduled",
      items: unscheduled,
    });
  }
  return { hasDates: true, groups };
}

export function tripDateSummary(trip, opts = {}) {
  const days = Array.from(
    new Set(((trip && trip.items) || []).map(itemDayOf).filter(Boolean))
  ).sort();
  if (!days.length) return null;
  if (days.length === 1) return formatStopDate(days[0], { ...opts, compact: true });
  return `${formatStopDate(days[0], { ...opts, compact: true })} – ${formatStopDate(days[days.length - 1], { ...opts, compact: true })}`;
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

export function removePlaceFromTrip(trips, key, placeId) {
  const t = trips[key];
  if (!t) return trips;
  const items = t.items.filter((it) => it.id !== placeId);
  if (!items.length) { const n = { ...trips }; delete n[key]; return n; } // drop empty trip
  return { ...trips, [key]: { ...t, updatedTs: Date.now(), items: normalizeOrder(items) } };
}

// dir: -1 moves the place earlier, +1 later within its day group (or within
// Unscheduled when undated).
export function moveItem(trips, key, placeId, dir) {
  const t = trips[key];
  if (!t) return trips;
  const items = sortedItems(t);
  const idx = items.findIndex((it) => it.id === placeId);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= items.length) return trips;
  if (itemDayOf(items[idx]) !== itemDayOf(items[swap])) return trips;
  const copy = [...items];
  [copy[idx], copy[swap]] = [copy[swap], copy[idx]];
  // Reindex by the new array position directly. Going through normalizeOrder
  // here would re-sort by the stale order field and undo the swap.
  return { ...trips, [key]: { ...t, updatedTs: Date.now(), items: copy.map((it, i) => ({ ...it, order: i })) } };
}

// Assign or clear (`rawDate` = null / "") a calendar date ("YYYY-MM-DD") on a
// stop. Moving a stop into a different date bucket appends it to the end of
// that day's stops while keeping existing stops in their order.
export function setStopDate(trips, key, placeId, rawDate, ts) {
  const t = trips && trips[key];
  if (!t) return trips;
  const nextDay = rawDate == null || rawDate === "" ? null : normalizeStopDate(rawDate);
  if (rawDate != null && rawDate !== "" && !nextDay) return trips;
  const target = (t.items || []).find((it) => it && it.id === placeId);
  if (!target) return trips;
  const prevDay = itemDayOf(target);
  if (prevDay === nextDay && target.day === nextDay) return trips;
  const now = ts || Date.now();
  const bucketOrders = (t.items || [])
    .filter((it) => it && it.id !== placeId && itemDayOf(it) === nextDay)
    .map((it) => Number(it.order) || 0);
  const nextOrder = prevDay === nextDay
    ? (Number(target.order) || 0)
    : (bucketOrders.length ? Math.max(...bucketOrders) + 1 : 0);
  const updated = (t.items || []).map((it) => {
    if (!it || it.id !== placeId) return it;
    const copy = { ...it, day: nextDay, dayUpdatedTs: now, order: nextOrder };
    if ("date" in copy) delete copy.date;
    return copy;
  });
  const reindexed = sortedItems({ ...t, items: updated }).map((it, i) => ({ ...it, order: i }));
  return { ...trips, [key]: { ...t, updatedTs: now, items: reindexed } };
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
  next = { ...next, [toKey]: { ...to2, updatedTs: Date.now(), items: [...to2.items, { ...item, order }] } };
  return next;
}

export function tripStats(trip) {
  const items = trip ? trip.items : [];
  const visited = items.filter((i) => i.visited).length;
  return { total: items.length, visited, remaining: items.length - visited };
}

// Google Maps `dir/?api=1` supports at most 9 intermediate waypoints + 1
// destination (10 stops per URL) across mobile and web. When a day or trip has
// more than 10 routable stops, each single URL is capped at 10 stops and
// `dayRouteLegs` / `dayRouteUrls` split the stops into continuous legs.
export const MAX_ROUTE_STOPS = 10;

function extractRoutablePoints(items) {
  return (items || [])
    .map((i) => (i && i.place ? i.place : i))
    .filter((p) => p && p.lat != null && p.lng != null);
}

function buildSingleGoogleMapsUrl(ptsSlice) {
  if (!ptsSlice || !ptsSlice.length) return null;
  const capped = ptsSlice.slice(0, MAX_ROUTE_STOPS);
  const dest = capped[capped.length - 1];
  const mids = capped.slice(0, -1);
  let url = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest.lat + "," + dest.lng);
  if (mids.length) url += "&waypoints=" + mids.map((p) => encodeURIComponent(p.lat + "," + p.lng)).join("|");
  return url;
}

function buildRouteLegsFromItems(items) {
  const pts = extractRoutablePoints(items);
  if (!pts.length) return [];
  if (pts.length <= MAX_ROUTE_STOPS) {
    return [{
      url: buildSingleGoogleMapsUrl(pts),
      startStop: 1,
      endStop: pts.length,
      count: pts.length,
    }];
  }
  const legs = [];
  let start = 0;
  while (start < pts.length) {
    const slice = pts.slice(start, start + MAX_ROUTE_STOPS);
    if (!slice.length) break;
    const endIdx = start + slice.length;
    legs.push({
      url: buildSingleGoogleMapsUrl(slice),
      startStop: start + 1,
      endStop: endIdx,
      count: slice.length,
    });
    if (endIdx >= pts.length) break;
    // Overlap the boundary stop so the next leg begins where the previous leg ended.
    start = endIdx - 1;
  }
  return legs;
}

// Google Maps directions through every stop in order (capped at MAX_ROUTE_STOPS
// so >9 waypoints never produce a broken Google Maps URL).
export function routeUrl(trip) {
  const items = Array.isArray(trip) ? trip : sortedItems(trip);
  const pts = extractRoutablePoints(items);
  return buildSingleGoogleMapsUrl(pts);
}

// Google Maps directions for a single day's stops in their displayed order
// (first leg, capped at MAX_ROUTE_STOPS = 10 stops / 9 waypoints).
export function dayRouteUrl(trip, day) {
  const targetDay = normalizeStopDate(day);
  if (!trip || !targetDay) return null;
  const dayItems = sortedItems(trip).filter((it) => itemDayOf(it) === targetDay);
  const pts = extractRoutablePoints(dayItems);
  return buildSingleGoogleMapsUrl(pts);
}

// When a day has > 10 stops, splits the day into continuous legs of at most
// MAX_ROUTE_STOPS (10 stops = 9 waypoints + 1 destination) each.
export function dayRouteLegs(trip, day) {
  const targetDay = normalizeStopDate(day);
  if (!trip || !targetDay) return [];
  const dayItems = sortedItems(trip).filter((it) => itemDayOf(it) === targetDay);
  return buildRouteLegsFromItems(dayItems);
}

export function dayRouteUrls(trip, day) {
  return dayRouteLegs(trip, day).map((leg) => leg.url);
}


