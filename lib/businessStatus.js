// lib/businessStatus.js
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for a place's dynamic open/closed status.
//
// Why this file exists: a venue was showing "Open" on the list card and
// "Closed" on the detail sheet at the same instant, because two different code
// paths each computed status their own way (home.js `liveOpen` vs google.js
// `openNowFrom`) and the sheet trusted a stale cached `openNow` snapshot. Every
// surface — search results, category/recommendation cards, map cards + markers,
// the detail sheet, saved places, and share previews, on mobile and desktop —
// now derives status from THIS function and nothing else. One venue, one status,
// same instant, everywhere.
//
// Correctness properties (all covered by scripts/test-business-status.mjs):
//   • Timezone-correct: uses the venue's own UTC offset (Google utcOffsetMinutes),
//     never the viewer's clock.
//   • Handles 24-hour periods, 24/7 venues, overnight hours that cross midnight,
//     and periods that wrap the Sat→Sun week boundary.
//   • Boundaries: open at the opening minute, closed at the closing minute.
//   • Honest unknowns: with no structured hours (or no offset) we return
//     `state:"unknown"` → surfaces show "Hours unavailable", never a guess.
//   • Freshness: when the caller records when hours were captured (`hoursAsOf`),
//     data older than STALE_AFTER_MS is flagged `stale:true` so surfaces can
//     down-rank confidence instead of asserting a possibly-outdated status.
//   • `nowMs` is injectable so status is deterministically testable at any instant.
//
// What this file deliberately does NOT do: invent holiday / special hours. We
// only fetch Google `regularOpeningHours`, so on a holiday a venue keeping its
// regular schedule is all we can honestly report. If a caller ever supplies
// date-specific overrides via `place.specialHours` (see applySpecialHours), we
// honor them; we never fabricate them.
// ─────────────────────────────────────────────────────────────────────────────

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK = 10080; // minutes in a week
export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Venue-local minute-of-week (0 = Sun 00:00 … 10079 = Sat 23:59). We shift the
// epoch by the venue offset then read the UTC parts, so this is the wall clock
// AT THE VENUE regardless of where the viewer is.
export function localMinutesOfWeek(utcOffsetMinutes, nowMs) {
  const base = (nowMs == null ? Date.now() : nowMs) + utcOffsetMinutes * 60000;
  const d = new Date(base);
  return d.getUTCDay() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes();
}

function label(day, hour, minute, withDay) {
  const ampm = hour >= 12 ? "PM" : "AM";
  let h12 = hour % 12; if (h12 === 0) h12 = 12;
  const mm = minute ? ":" + String(minute).padStart(2, "0") : "";
  const t = h12 + mm + " " + ampm;
  return withDay ? DOW[day] + " " + t : t;
}

function fromMinuteOfWeek(m) {
  const mm = ((m % WEEK) + WEEK) % WEEK;
  return { day: Math.floor(mm / 1440), hour: Math.floor((mm % 1440) / 60), minute: mm % 60 };
}

// Optional hook: apply date-specific overrides IF the caller supplies them.
// place.specialHours = [{ date:"YYYY-MM-DD", closed?:true, periods?:[...] }].
// Returns { periods, specialClosed }. `specialClosed:true` means a special-hours
// entry explicitly marks the venue closed today (a definite CLOSED, not an
// unknown). An empty base periods array is NOT a closure — it's absent data.
function effectivePeriods(place, nowMs) {
  const oh = place && place.oh;
  const base = oh && Array.isArray(oh.periods) ? oh.periods : null;
  const special = place && Array.isArray(place.specialHours) ? place.specialHours : null;
  if (!special || place.utcOffset == null) return { periods: base, specialClosed: false };
  const off = place.utcOffset;
  const d = new Date((nowMs == null ? Date.now() : nowMs) + off * 60000);
  const key = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  const hit = special.find((s) => s && s.date === key);
  if (!hit) return { periods: base, specialClosed: false };
  if (hit.closed) return { periods: base, specialClosed: true }; // explicitly closed today
  if (Array.isArray(hit.periods)) return { periods: hit.periods, specialClosed: false };
  return { periods: base, specialClosed: false };
}

// The one function. Returns a normalized, immutable-shaped status object.
// Never throws.
export function businessStatus(place, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  const off = place && place.utcOffset;
  const hoursAsOf = place && place.hoursAsOf != null ? place.hoursAsOf : null;
  const stale = hoursAsOf != null ? (now - hoursAsOf) > STALE_AFTER_MS : false;

  let periods = null, specialClosed = false;
  try { const e = effectivePeriods(place, now); periods = e.periods; specialClosed = e.specialClosed; }
  catch { periods = place && place.oh ? place.oh.periods : null; }

  const base = { source: "live", stale, offset: off == null ? null : off, computedAt: now, hoursAsOf };

  // A special-hours entry explicitly closing the venue today is a definite CLOSED.
  if (specialClosed && off != null) {
    return { ...base, state: "closed", open: false, nextTransition: null };
  }

  // No usable structured hours / offset → honest unknown, unless the provider
  // gave an explicit boolean snapshot (only trusted as a last resort).
  if (!Array.isArray(periods) || !periods.length || off == null) {
    const snap = place && place.openNow;
    if (snap === true || snap === false) {
      return { ...base, source: "snapshot", state: snap ? "open" : "closed", open: snap, nextTransition: null };
    }
    return { ...base, source: "none", state: "unknown", open: null, nextTransition: null };
  }

  const cur = localMinutesOfWeek(off, now);
  let open = false, always = false, matchCloseMow = null;

  for (const per of periods) {
    const o = per && per.open; if (!o) continue;
    const c = per && per.close;
    const oMin = o.day * 1440 + (o.hour || 0) * 60 + (o.minute || 0);
    if (!c) { open = true; always = true; break; }             // open, no close = 24h
    const cMin = c.day * 1440 + (c.hour || 0) * 60 + (c.minute || 0);
    if (oMin === cMin) { open = true; always = true; break; }  // 24/7 marker
    if (oMin < cMin) {
      // Same-day period: open at oMin (inclusive), closed at cMin (exclusive).
      if (cur >= oMin && cur < cMin) { open = true; matchCloseMow = cMin; break; }
    } else {
      // Overnight / week-wrap period (e.g. 22:00 → 02:00, or Sat 20:00 → Sun 01:00).
      if (cur >= oMin || cur < cMin) { open = true; matchCloseMow = cMin; break; }
    }
  }

  if (open) {
    let nextTransition = null;
    if (!always && matchCloseMow != null) {
      const inMinutes = (((matchCloseMow - cur) % WEEK) + WEEK) % WEEK;
      const t = fromMinuteOfWeek(matchCloseMow);
      nextTransition = { type: "close", inMinutes, day: t.day, hour: t.hour, minute: t.minute, label: "Closes " + label(t.day, t.hour, t.minute, false), soon: inMinutes <= 60 };
    }
    return { ...base, state: "open", open: true, nextTransition };
  }

  // Closed → find the soonest upcoming opening.
  let best = null;
  for (const per of periods) {
    const o = per && per.open; if (!o) continue;
    const oMin = o.day * 1440 + (o.hour || 0) * 60 + (o.minute || 0);
    const delta = ((oMin - cur) % WEEK + WEEK) % WEEK;
    if (delta === 0) continue; // exactly now would mean open; skip
    if (best === null || delta < best.delta) best = { delta, day: o.day, hour: o.hour || 0, minute: o.minute || 0 };
  }
  const curDay = Math.floor(cur / 1440);
  const nextTransition = best
    ? { type: "open", inMinutes: best.delta, day: best.day, hour: best.hour, minute: best.minute, label: (best.day === curDay ? "Opens " + label(best.day, best.hour, best.minute, false) : "Opens " + label(best.day, best.hour, best.minute, true)), soon: best.delta <= 180, today: best.day === curDay }
    : null;
  return { ...base, state: "closed", open: false, nextTransition };
}

// Convenience: the tri-state boolean used by display surfaces. true | false | null.
export function isOpenNow(place, nowMs) {
  return businessStatus(place, nowMs).open;
}

// Convenience: a short honest label. Never guesses.
export function statusLabel(place, nowMs) {
  const s = businessStatus(place, nowMs);
  if (s.state === "open") return "Open now";
  if (s.state === "closed") return "Closed";
  return "Hours unavailable";
}

// Back-compat shim for the fetch-time snapshot path in lib/google.js.
// Accepts Google's regularOpeningHours object + the venue offset.
export function openNowFromHours(regularOpeningHours, utcOffsetMinutes) {
  const periods = regularOpeningHours && regularOpeningHours.periods;
  if (!periods || !periods.length || utcOffsetMinutes == null) return null;
  return businessStatus({ oh: { periods }, utcOffset: utcOffsetMinutes }).open;
}

// Back-compat shim for nextOpenInfo() in lib/google.js. Returns the old shape.
export function nextOpenFromHours(regularOpeningHours, utcOffsetMinutes) {
  const periods = regularOpeningHours && regularOpeningHours.periods;
  if (!periods || !periods.length || utcOffsetMinutes == null) return null;
  const s = businessStatus({ oh: { periods }, utcOffset: utcOffsetMinutes });
  if (!s.nextTransition || s.nextTransition.type !== "open") return null;
  const n = s.nextTransition;
  return { label: n.label, minsUntil: n.inMinutes, today: !!n.today, soon: !!n.soon };
}
