// lib/tripDays.js
// Day-planning, date grouping, and per-day route URLs.
// Kept out of lib/trips.js so the homepage, which imports the save/add
// helpers from that module, does not ship this planner on first load.

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

const SITE_TZ = "America/New_York";

// Venue-local ("America/New_York") calendar date "YYYY-MM-DD" so UTC runtimes
// (Vercel serverless, CI runners) never roll over to tomorrow at 8 PM ET.
export function siteTodayYmd(now = new Date(), timeZone = SITE_TZ) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || SITE_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (type) => {
      const found = parts.find((p) => p.type === type);
      return found ? found.value : "";
    };
    const ymd = `${get("year")}-${get("month")}-${get("day")}`;
    return normalizeStopDate(ymd);
  } catch (e) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

// Local calendar date "YYYY-MM-DD" from a Date, timestamp, "YYYY-MM-DD" string,
// or options object. When called with no argument, anchors to America/New_York.
export function localDateYmd(ref, opts = {}) {
  if (ref === undefined) {
    return siteTodayYmd(new Date(), (opts && opts.timeZone) || SITE_TZ);
  }
  if (typeof ref === "string") {
    const direct = normalizeStopDate(ref);
    if (direct) return direct;
  }
  if (ref && typeof ref === "object" && !(ref instanceof Date)) {
    if (ref.today) {
      const clean = normalizeStopDate(ref.today);
      if (clean) return clean;
    }
    if (ref.now !== undefined) {
      return localDateYmd(ref.now, ref);
    }
    return siteTodayYmd(new Date(), ref.timeZone || SITE_TZ);
  }
  if (opts && opts.timeZone) {
    return siteTodayYmd(ref, opts.timeZone);
  }
  const d = ref instanceof Date ? ref : new Date(ref);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isPastStopDate(ymd, today = localDateYmd()) {
  const clean = normalizeStopDate(ymd);
  const cleanToday = normalizeStopDate(today) || localDateYmd(today);
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
// weekend days, plus any dates already used on this trip. Accepts a Date, a
// deterministic "YYYY-MM-DD" string, or `{ today, now, timeZone }`.
export function quickDateChoices(trip, nowOrOpts) {
  const today = localDateYmd(nowOrOpts);
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
    if (dow === 0) {
      // Today is Sunday: offer next Saturday (+6) and next Sunday (+7).
      const sat = addCalendarDays(today, 6);
      const sun = addCalendarDays(today, 7);
      if (sat) push(sat, formatStopDate(sat));
      if (sun) push(sun, formatStopDate(sun));
    } else if (dow === 6) {
      // Today is Saturday, Tomorrow is Sunday (already added); also offer next weekend.
      const nextSat = addCalendarDays(today, 7);
      const nextSun = addCalendarDays(today, 8);
      if (nextSat) push(nextSat, formatStopDate(nextSat));
      if (nextSun) push(nextSun, formatStopDate(nextSun));
    } else {
      // Monday..Friday: offer upcoming Saturday and Sunday. On Friday, Saturday
      // is already in `seen` as Tomorrow, and Sunday (+2) is added cleanly.
      const daysToSat = 6 - dow;
      const sat = addCalendarDays(today, daysToSat);
      const sun = addCalendarDays(today, daysToSat + 1);
      if (sat) push(sat, formatStopDate(sat));
      if (sun) push(sun, formatStopDate(sun));
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
  if (opts && opts.today === null) return null;
  if (typeof opts === "string") {
    const clean = normalizeStopDate(opts);
    if (clean) return clean;
  }
  if (opts && opts.today) {
    const clean = normalizeStopDate(opts.today);
    if (clean) return clean;
  }
  if (opts && opts.now !== undefined) {
    return localDateYmd(opts.now, opts);
  }
  return localDateYmd(undefined, opts);
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
  const tomorrow = today ? addCalendarDays(today, 1) : null;
  for (const [day, dayItems] of byDay.entries()) {
    const isPast = Boolean(today && day < today);
    const isToday = Boolean(today && day === today);
    const isTomorrow = Boolean(tomorrow && day === tomorrow);
    const baseHeading = formatStopDate(day, { ...opts, heading: true });
    const baseShort = formatStopDate(day, opts);
    const prefix = isPast ? "Past · " : isToday ? "Today · " : isTomorrow ? "Tomorrow · " : "";
    groups.push({
      key: day,
      day,
      isPast,
      isToday,
      isTomorrow,
      label: `${prefix}${baseHeading}`,
      shortLabel: `${prefix}${baseShort}`,
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

// dir: -1 moves the place earlier, +1 later within its day group (or within
// Unscheduled when undated).
export function moveItem(trips, key, placeId, dir, opts) {
  const t = trips[key];
  if (!t) return trips;
  const items = sortedItems(t, opts || { today: null });
  const idx = items.findIndex((it) => it.id === placeId);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= items.length) return trips;
  if (itemDayOf(items[idx]) !== itemDayOf(items[swap])) return trips;
  const copy = [...items];
  [copy[idx], copy[swap]] = [copy[swap], copy[idx]];
  // Reindex by the new array position directly. Going through normalizeOrder
  // here would re-sort by the stale order field and undo the swap.
  const canonical = sortedItems({ ...t, items: copy.map((it, i) => ({ ...it, order: i })) }, { today: null }).map(
    (it, i) => ({ ...it, order: i })
  );
  return { ...trips, [key]: { ...t, updatedTs: Date.now(), items: canonical } };
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
  const reindexed = sortedItems({ ...t, items: updated }, { today: null }).map((it, i) => ({ ...it, order: i }));
  return { ...trips, [key]: { ...t, updatedTs: now, items: reindexed } };
}

// Official Google Maps URLs (`/maps/dir/?api=1`) limits
// (https://developers.google.com/maps/documentation/urls/get-started):
//   - Mobile browsers / app handoff: up to 3 intermediate `waypoints`
//     (1 origin + 3 waypoints + 1 destination = 5 stops per leg).
//   - Desktop browsers: up to 9 intermediate `waypoints`
//     (1 origin + 9 waypoints + 1 destination = 11 locations theoretical max,
//     exported as `MAX_DESKTOP_ROUTE_STOPS_SPEC = 11`).
//   - Wayfind intentionally caps default desktop legs at `MAX_ROUTE_STOPS = 10`
//     (1 origin + 8 intermediate waypoints + 1 destination) to keep a 1-waypoint
//     safety buffer below Google's truncation threshold and to keep leg ranges
//     clean (`1–10`, `10–19`, ...).
//   - Every Google Maps URL is also capped at `MAX_MAPS_URL_CHARS = 2048`
//     characters per the official Google Maps URLs specification.
// When a day or trip has more stops than a single URL supports (by stop count
// or 2,048-char URL budget), `dayRouteLegs` and `tripRouteLegs` split the
// ordered stops into continuous overlapping legs where `leg[i].destination` is
// `leg[i+1].origin` so zero stops or intentional repeat visits are dropped.
export const MAX_MOBILE_WAYPOINTS = 3;
export const MAX_DESKTOP_WAYPOINTS = 9;
export const MAX_MOBILE_ROUTE_STOPS = 5; // 1 origin + 3 waypoints + 1 destination
export const MAX_DESKTOP_ROUTE_STOPS_SPEC = 11; // 1 origin + 9 waypoints + 1 destination (Google spec ceiling)
export const MAX_ROUTE_STOPS = 10; // 1 origin + 8 waypoints + 1 destination (default desktop cap)
export const MAX_MAPS_URL_CHARS = 2048;

function extractRoutablePoints(items) {
  return (items || [])
    .map((it, idx) => {
      const p = it && it.place ? it.place : it;
      if (!p || p.lat == null || p.lng == null) return null;
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return null;
      }
      const id = (it && it.id) || p.id || `${lat},${lng}`;
      return { id, seqKey: `${idx}:${id}`, lat, lng, name: p.name || "" };
    })
    .filter(Boolean);
}

function resolveMaxRouteStops(opts) {
  if (opts && Number.isFinite(Number(opts.maxStops)) && Number(opts.maxStops) >= 2) {
    return Math.trunc(Number(opts.maxStops));
  }
  if (opts && opts.mobile) return MAX_MOBILE_ROUTE_STOPS;
  return MAX_ROUTE_STOPS;
}

function resolveMaxUrlChars(opts) {
  if (opts && Number.isFinite(Number(opts.maxUrlChars)) && Number(opts.maxUrlChars) >= 200) {
    return Math.trunc(Number(opts.maxUrlChars));
  }
  return MAX_MAPS_URL_CHARS;
}

function buildSingleGoogleMapsUrl(ptsSlice, maxStops = MAX_ROUTE_STOPS) {
  if (!ptsSlice || !ptsSlice.length) return null;
  const capped = ptsSlice.slice(0, maxStops);
  if (capped.length === 1) {
    const dest = capped[0];
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest.lat + "," + dest.lng);
  }
  const origin = capped[0];
  const dest = capped[capped.length - 1];
  const mids = capped.slice(1, -1);
  let url =
    "https://www.google.com/maps/dir/?api=1&origin=" +
    encodeURIComponent(origin.lat + "," + origin.lng) +
    "&destination=" +
    encodeURIComponent(dest.lat + "," + dest.lng);
  if (mids.length) {
    url += "&waypoints=" + mids.map((p) => encodeURIComponent(p.lat + "," + p.lng)).join("|");
  }
  return url;
}

function fitSliceToMapsBudget(slice, maxStops, maxUrlChars = MAX_MAPS_URL_CHARS) {
  let count = Math.min(slice.length, maxStops);
  while (count > 2) {
    const candidate = slice.slice(0, count);
    const url = buildSingleGoogleMapsUrl(candidate, count);
    if (!url || url.length <= maxUrlChars) break;
    count -= 1;
  }
  return slice.slice(0, count);
}

function buildLegRecord(slice, startIdx, maxStops, maxUrlChars = MAX_MAPS_URL_CHARS) {
  const capped = fitSliceToMapsBudget(slice, maxStops, maxUrlChars);
  const url = buildSingleGoogleMapsUrl(capped, capped.length);
  const origin = capped.length >= 2 ? capped[0] : null;
  const destination = capped[capped.length - 1];
  const waypoints = capped.length >= 3 ? capped.slice(1, -1) : [];
  return {
    url,
    urlLength: url ? url.length : 0,
    startStop: startIdx + 1,
    endStop: startIdx + capped.length,
    count: capped.length,
    origin,
    waypoints,
    destination,
    stopIds: capped.map((p) => p.id),
  };
}

function buildRouteLegsFromItems(items, opts = {}) {
  const pts = extractRoutablePoints(items);
  if (!pts.length) return [];
  const maxStops = resolveMaxRouteStops(opts);
  const maxUrlChars = resolveMaxUrlChars(opts);
  const firstLeg = buildLegRecord(pts, 0, maxStops, maxUrlChars);
  if (firstLeg.count >= pts.length) {
    return [firstLeg];
  }
  const legs = [];
  let start = 0;
  while (start < pts.length) {
    const slice = pts.slice(start, start + maxStops);
    if (!slice.length) break;
    const leg = buildLegRecord(slice, start, maxStops, maxUrlChars);
    const endIdx = start + leg.count;
    legs.push(leg);
    if (endIdx >= pts.length) break;
    // Overlap the boundary stop so the next leg starts (`origin`) where the previous leg ended (`destination`).
    start = Math.max(start + 1, endIdx - 1);
  }
  return legs;
}

// Reconstructs the complete ordered stop sequence across route legs, verifying
// that every leg's `origin -> waypoints -> destination` chains seamlessly without
// dropping or reordering any stop (including intentional repeat visits).
export function reconstructRoutedStopIds(legs) {
  if (!Array.isArray(legs) || !legs.length) return [];
  const out = [];
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    if (!leg || !Array.isArray(leg.stopIds) || !leg.stopIds.length) continue;
    if (i === 0) {
      out.push(...leg.stopIds);
    } else {
      // First stop of leg i is the overlapping handoff from the end of leg i-1.
      if (out[out.length - 1] === leg.stopIds[0]) {
        out.push(...leg.stopIds.slice(1));
      } else {
        out.push(...leg.stopIds);
      }
    }
  }
  return out;
}

export function tripRouteLegs(trip, opts = {}) {
  const items = Array.isArray(trip) ? trip : sortedItems(trip, opts);
  return buildRouteLegsFromItems(items, opts);
}

// Google Maps directions through the first leg of stops in order.
export function routeUrl(trip, opts = {}) {
  const legs = tripRouteLegs(trip, opts);
  return legs.length ? legs[0].url : null;
}

// Google Maps directions for a single day's stops in their displayed order
// (first leg).
export function dayRouteUrl(trip, day, opts = {}) {
  const legs = dayRouteLegs(trip, day, opts);
  return legs.length ? legs[0].url : null;
}

// Splits a day's stops into continuous overlapping legs within the platform's
// Google Maps waypoint and 2,048-char URL limits (`MAX_MOBILE_ROUTE_STOPS = 5`
// on mobile browsers, `MAX_ROUTE_STOPS = 10` on desktop).
export function dayRouteLegs(trip, day, opts = {}) {
  const targetDay = normalizeStopDate(day);
  if (!trip || !targetDay) return [];
  const dayItems = sortedItems(trip, opts).filter((it) => itemDayOf(it) === targetDay);
  return buildRouteLegsFromItems(dayItems, opts);
}

export function dayRouteUrls(trip, day, opts = {}) {
  return dayRouteLegs(trip, day, opts).map((leg) => leg.url);
}

function normalizeOrder(items) {
  return [...items].sort((a, b) => compareTripItems(a, b, null)).map((it, i) => ({ ...it, order: i }));
}

export function removePlaceFromTrip(trips, key, placeId) {
  const t = trips[key];
  if (!t) return trips;
  const items = t.items.filter((it) => it.id !== placeId);
  if (!items.length) { const n = { ...trips }; delete n[key]; return n; } // drop empty trip
  return { ...trips, [key]: { ...t, updatedTs: Date.now(), items: normalizeOrder(items) } };
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
  const to2 = next[toKey];
  next = { ...next, [toKey]: { ...to2, updatedTs: Date.now(), items: [...to2.items, { ...item, order }] } };
  return next;
}
