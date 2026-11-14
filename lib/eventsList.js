// v5.50 audit remediation, Phase 5 — durable event LIST URLs.
// /events/[city]/this-weekend | tonight | this-month are time-windowed,
// server-rendered listings (the [slug] route branches: a window slug renders
// the list, anything else is an event detail id). Pure window logic here so
// scripts/test-events-list.mjs can prove the date math without a server.

export const EVENT_WINDOWS = {
  "this-weekend": { label: "This weekend", title: "This Weekend" },
  "tonight": { label: "Tonight", title: "Tonight" },
  "this-month": { label: "This month", title: "This Month" },
};

export function isEventWindow(slug) {
  return typeof slug === "string" && Object.prototype.hasOwnProperty.call(EVENT_WINDOWS, slug);
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The inclusive [startDate, endDate] (YMD strings) a window covers, relative to
// `now`. "this-weekend" = the coming Fri-Sun (or the current one if it's
// already the weekend); "tonight" = today; "this-month" = today through +31d.
import { siteAnchorDate, siteTodayStr } from "./siteTime.js";
import { compactRuleAllows, nextOpenDay } from "./scheduleNoteDays.js";

function parseClockMinutes(str) {
  if (!str || typeof str !== "string") return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function etMinutesOfDay(now) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? NaN);
    if (Number.isFinite(h) && Number.isFinite(m)) return (h === 24 ? 0 : h) * 60 + m;
  } catch {}
  return null;
}

function eventEndedEarlierToday(ev, todayStr, now) {
  const endClock = parseClockMinutes(ev.endTime || ev.end_time);
  if (endClock == null) return false;
  const startClock = parseClockMinutes(ev.time || ev.startTime || ev.start_time);
  // Overnight sessions (e.g. 20:00 -> 02:00) end the next morning, not earlier today.
  if (startClock != null && endClock <= startClock) return false;
  if (siteTodayStr(now) !== todayStr) return false;
  const nowMins = etMinutesOfDay(now);
  return nowMins != null && nowMins > endClock;
}

export function windowRange(win, now = new Date()) {
  const today = siteAnchorDate(now); // ET-anchored: "tonight" stays tonight after 8 PM ET
  if (win === "tonight") return { start: ymd(today), end: ymd(today) };
  if (win === "this-month") {
    const end = new Date(today); end.setDate(end.getDate() + 31);
    return { start: ymd(today), end: ymd(end) };
  }
  // this-weekend: nearest Friday..Sunday. If today is Fri/Sat/Sun, use this one.
  const dow = today.getDay(); // 0 Sun .. 6 Sat
  let friOffset;
  if (dow === 0) friOffset = -2;          // Sunday -> Friday just gone
  else if (dow === 6) friOffset = -1;     // Saturday -> Friday just gone
  else if (dow === 5) friOffset = 0;      // Friday
  else friOffset = 5 - dow;               // Mon-Thu -> upcoming Friday
  const fri = new Date(today); fri.setDate(today.getDate() + friOffset);
  const sun = new Date(fri); sun.setDate(sun.getDate() + 2);
  return { start: ymd(fri < today ? today : fri), end: ymd(sun) };
}

function scheduleAllowsDay(schedule, day) {
  if (!schedule || typeof schedule !== "object") return true;
  if (Array.isArray(schedule.excluded_dates) && schedule.excluded_dates.includes(day)) return false;
  if (schedule.date_hours && typeof schedule.date_hours === "object") {
    if (Object.prototype.hasOwnProperty.call(schedule.date_hours, day)) {
      return Array.isArray(schedule.date_hours[day]) && schedule.date_hours[day].length > 0;
    }
    if (schedule.dates_only) return false;
  }
  if (schedule.weekday_hours && typeof schedule.weekday_hours === "object") {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const sessions = schedule.weekday_hours[dow] ?? schedule.weekday_hours[String(dow)];
    return Array.isArray(sessions) && sessions.length > 0;
  }
  return true;
}

export function eventInWindow(ev, win, now = new Date()) {
  const startDate = String(ev?.date || ev?.start_date || "");
  if (!ev || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
  const st = String(ev.status || ev.event_status || "").toLowerCase();
  if (st === "cancelled" || st === "canceled" || st === "postponed" || st === "paused" || st === "unannounced") return false;
  const { start, end } = windowRange(win, now);
  if (win === "tonight" && eventEndedEarlierToday(ev, start, now)) return false;
  const occ = Array.isArray(ev.occurrences)
    ? ev.occurrences
    : Array.isArray(ev.occurrenceDates)
      ? ev.occurrenceDates
      : Array.isArray(ev.occurrence_dates)
        ? ev.occurrence_dates
        : null;
  if (occ && occ.length) {
    const validDays = occ.map((d) => String(d || "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (validDays.length) return validDays.some((d) => d >= start && d <= end && scheduleAllowsDay(ev.visit_schedule || ev.visitSchedule, d));
  }
  const rawEnd = String(ev.endDate || ev.end_date || "");
  const lastDay = /^\d{4}-\d{2}-\d{2}$/.test(rawEnd) && rawEnd > startDate ? rawEnd : startDate;
  if (startDate > end || lastDay < start) return false;
  const schedule = ev.visit_schedule || ev.visitSchedule;
  const hasDayRule = ev.dayRule != null;
  const hasNoteOrSelect = Boolean(ev.selectNights || ev.select_nights || ev.scheduleNote || ev.schedule_note);
  if ((!schedule || typeof schedule !== "object") && !hasDayRule && !hasNoteOrSelect) return true;
  const fromDay = startDate > start ? startDate : start;
  const toDay = lastDay < end ? lastDay : end;
  const cursor = new Date(`${fromDay}T12:00:00Z`);
  const stop = new Date(`${toDay}T12:00:00Z`);
  while (cursor <= stop) {
    const d = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`;
    const schedOk = scheduleAllowsDay(schedule, d);
    const ruleOk = hasDayRule
      ? ((win !== "tonight" && ev.dayRule.k === "r") ? true : compactRuleAllows(ev.dayRule, d, startDate))
      : (!hasNoteOrSelect || nextOpenDay({
          start_date: startDate,
          end_date: lastDay,
          select_nights: win === "tonight" ? Boolean(ev.selectNights || ev.select_nights) : false,
          schedule_note: String(ev.scheduleNote || ev.schedule_note || ""),
        }, d, d) === d);
    if (schedOk && ruleOk) return true;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return false;
}

export function filterByWindow(events, win, now = new Date()) {
  return (events || []).filter((e) => eventInWindow(e, win, now));
}

// 2026-10-23 audit: the list page used filterByWindow(...).slice(0, 60). The
// feed arrives date-ordered, so for "this-month" the first 60 rows were all
// this weekend and /this-month rendered the same cards as /this-weekend.
// spreadAcrossDays keeps `cap` events but deals them out one per day in
// rounds (earliest day first), so every day in the window is represented
// before any day gets a second slot. Within a day the feed's own order
// (its ranking) is kept, and the result is returned in date order.
export function spreadAcrossDays(events, cap) {
  const list = Array.isArray(events) ? events : [];
  if (!(cap > 0)) return [];
  if (list.length <= cap) return list.slice();
  const byDay = new Map();
  list.forEach((e, i) => {
    const d = String(e?.date || "");
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(i);
  });
  const days = [...byDay.keys()].sort();
  const keep = new Set();
  for (let round = 0; keep.size < cap; round++) {
    let added = false;
    for (const d of days) {
      const idx = byDay.get(d)[round];
      if (idx === undefined) continue;
      keep.add(idx); added = true;
      if (keep.size >= cap) break;
    }
    if (!added) break;
  }
  return [...keep]
    .sort((a, b) => (String(list[a]?.date || "") < String(list[b]?.date || "") ? -1 : String(list[a]?.date || "") > String(list[b]?.date || "") ? 1 : a - b))
    .map((i) => list[i]);
}
