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

function normalizeOrder(items) {
  return [...items].sort(compareTripItems).map((it, i) => ({ ...it, order: i }));
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
