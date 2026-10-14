// lib/eventReminder.js: "Remind me" for a dated event. PURE and isomorphic (no
// React, no network, no Date.now() unless a caller passes none).
//
// Owner, 2026-10-14: "add a reminder to the person's phone about the event
// because i would forget ... and ask the user when they would like to be
// reminded." A calendar invite with one alert the person chose is the way that
// works on every phone, with no app, no push permission and no account:
// iPhone Safari opens the Add to Calendar sheet for text/calendar, Android
// opens the calendar.
//
// This module is the ONE place that decides
//   * which events can carry a reminder (a real date, not past, not undated),
//   * which nights a person can choose,
//   * which "when" choices still make sense (nothing already in the past),
//   * the exact alarm instant for each choice, and
//   * the RFC 5545 text.
// The card button, the event page button, the Google link and the server route
// all call it, so they cannot disagree.
//
// TIME. Every Wayfind event time is a venue wall clock (America/New_York, or
// America/Chicago for the few Panhandle rows). Alarm instants are computed from
// the US daylight saving rules (second Sunday of March 2:00, first Sunday of
// November 2:00), so "the day before at 6 PM" is 6 PM on the wall across the
// Nov 1 2026 change. Today's date still comes from lib/siteTime.

import { siteTodayStr } from "./siteTime.js";

export const REMINDER_PRESETS = Object.freeze([
  Object.freeze({ id: "1w", label: "1 week before" }),
  Object.freeze({ id: "2d", label: "2 days before" }),
  Object.freeze({ id: "eve", label: "The day before at 6 PM" }),
  Object.freeze({ id: "am", label: "The morning of at 9 AM" }),
  Object.freeze({ id: "2h", label: "2 hours before", needsStart: true }),
]);
export const REMINDER_CUSTOM_LABEL = "Pick a date and time";
export const REMINDER_NIGHT_LIMIT = 8;
export const REMINDER_DEFAULT_LENGTH_MIN = 120;
export const GOOGLE_ALERT_NOTE = "Google uses its own default alert time.";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^(\d{2}):(\d{2})(?::\d{2})?$/;
const CUSTOM = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:?\d{2})?$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIN = 60000;
const DAY_MS = 86400000;

// Standard-time offset in minutes. DST is +60 inside the US rule window.
export const REMINDER_ZONES = Object.freeze({
  "America/New_York": Object.freeze({ std: -300, stdName: "EST", dstName: "EDT" }),
  "America/Chicago": Object.freeze({ std: -360, stdName: "CST", dstName: "CDT" }),
});
export function reminderZone(name) {
  return REMINDER_ZONES[name] ? name : "America/New_York";
}

// ── calendar arithmetic on YYYY-MM-DD strings (UTC math, no local clock) ─────
const p2 = (n) => String(n).padStart(2, "0");
export function isIsoDay(s) {
  if (typeof s !== "string" || !ISO_DAY.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate());
}
export function dayDiff(a, b) {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}
function nthSunday(year, monthIndex, n) {
  const first = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}
// True when the WALL time (y-m-d h:mi, as written on a clock there) is in DST.
function wallIsDst(y, m, d, h, mi) {
  const key = Date.UTC(y, m - 1, d, h, mi);
  const start = Date.UTC(y, 2, nthSunday(y, 2, 2), 2, 0);
  const end = Date.UTC(y, 10, nthSunday(y, 10, 1), 2, 0);
  return key >= start && key < end;
}
function parseClock(c) {
  const m = CLOCK.exec(String(c || ""));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 23 && mi <= 59 ? { h, mi } : null;
}

/** Epoch ms of a wall clock time in the zone. */
export function wallToMs(zone, iso, h, mi) {
  const z = REMINDER_ZONES[reminderZone(zone)];
  const [y, m, d] = iso.split("-").map(Number);
  const offset = z.std + (wallIsDst(y, m, d, h, mi) ? 60 : 0);
  return Date.UTC(y, m - 1, d, h, mi) - offset * MIN;
}
// Calendar parts of an epoch value read as if it were UTC. Arithmetic on the
// day length rather than a clock getter: this is zone math on a venue offset,
// not a read of the viewer's clock (scripts/check-one-clock.mjs).
function partsOf(ms) {
  const days = Math.floor(ms / DAY_MS);
  const rem = ms - days * DAY_MS;
  const d = new Date(days * DAY_MS);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    h: Math.floor(rem / 3600000), mi: Math.floor((rem % 3600000) / MIN), s: Math.floor((rem % MIN) / 1000),
  };
}
/** Wall clock parts of an instant in the zone: { day, h, mi, dst }. */
export function msToWall(zone, ms) {
  const z = REMINDER_ZONES[reminderZone(zone)];
  const asDst = partsOf(ms + (z.std + 60) * MIN);
  const dst = wallIsDst(asDst.y, asDst.m, asDst.d, asDst.h, asDst.mi);
  const w = dst ? asDst : partsOf(ms + z.std * MIN);
  return { day: w.y + "-" + p2(w.m) + "-" + p2(w.d), h: w.h, mi: w.mi, dst };
}
function utcStamp(ms) {
  const t = partsOf(ms);
  return t.y + p2(t.m) + p2(t.d) + "T" + p2(t.h) + p2(t.mi) + p2(t.s) + "Z";
}
const compactDay = (iso) => iso.replace(/-/g, "");
const compactWall = (iso, h, mi) => compactDay(iso) + "T" + p2(h) + p2(mi) + "00";

// "Fri Dec 4" / "9:00 AM" / "Fri Dec 4 at 9:00 AM": the words shown in the sheet.
export function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + " " + MONTHS[m - 1] + " " + d;
}
export function clockText(h, mi) {
  const hour = h % 12 === 0 ? 12 : h % 12;
  return hour + ":" + p2(mi) + " " + (h < 12 ? "AM" : "PM");
}
export function wallLabel(zone, ms) {
  const w = msToWall(zone, ms);
  return dayLabel(w.day) + " at " + clockText(w.h, w.mi);
}

// ── eligibility ──────────────────────────────────────────────────────────────

/**
 * The nights a person can choose from, given "today" (US Eastern).
 *   { kind: "none" }                                  nothing left to remind about
 *   { kind: "single", nights: [d], default: d }
 *   { kind: "list", nights: [next 8], default, more } a verified per-night list
 *   { kind: "range", min, max, default }              a range with no night list
 */
export function reminderNights(facts, today = siteTodayStr(), nowMs = null) {
  if (!facts || !isIsoDay(facts.start_date)) return { kind: "none" };
  const live = (d) => d >= today && (nowMs == null || alertDeadlineMs(facts, d) > nowMs + MIN);
  // The night the sheet opens on: the first with a preset still ahead (tonight's can all be gone
  // while later nights are open). With none, or no clock, it is simply the first upcoming night.
  const pick = (days) => (nowMs == null ? days[0] : days.find((d) => reminderOptions(facts, d, nowMs).some((o) => o.available)) || days[0]);
  if (facts.nights && facts.nights.length) {
    const upcoming = facts.nights.filter(live);
    if (!upcoming.length) return { kind: "none" };
    if (facts.nights.length === 1) return { kind: "single", nights: upcoming, default: upcoming[0] };
    return { kind: "list", nights: upcoming.slice(0, REMINDER_NIGHT_LIMIT), default: pick(upcoming.slice(0, REMINDER_NIGHT_LIMIT)), more: Math.max(0, upcoming.length - REMINDER_NIGHT_LIMIT) };
  }
  const last = facts.end_date || facts.start_date;
  if (last < today) return { kind: "none" };
  if (last === facts.start_date) return live(last) ? { kind: "single", nights: [last], default: last } : { kind: "none" };
  let min = facts.start_date > today ? facts.start_date : today;
  while (min <= last && !live(min)) min = addDays(min, 1);
  if (min > last) return { kind: "none" };
  let dflt = min;
  if (nowMs != null) { for (let d = min; d <= last; d = addDays(d, 1)) { if (live(d) && reminderOptions(facts, d, nowMs).some((o) => o.available)) { dflt = d; break; } if (dayDiff(min, d) > 60) break; } }
  return { kind: "range", min, max: last, default: dflt };
}

export function isReminderNight(facts, night, today = siteTodayStr(), nowMs = null) {
  if (!isIsoDay(night)) return false;
  const n = reminderNights(facts, today, nowMs);
  if (n.kind === "none") return false;
  if (n.kind === "range") return night >= n.min && night <= n.max;
  if (n.kind === "list") return (facts.nights || []).includes(night) && night >= today && (nowMs == null || alertDeadlineMs(facts, night) > nowMs + MIN);
  return n.nights.includes(night);
}

// ── the event's own instants ─────────────────────────────────────────────────
export function eventStartMs(facts, night) {
  const c = parseClock(facts.start_time);
  return c ? wallToMs(facts.tz, night, c.h, c.mi) : null;
}
// The latest moment an alert still makes sense: the event start when a time is
// known, else the end of that day on the venue clock.
function alertDeadlineMs(facts, night) {
  const start = eventStartMs(facts, night);
  return start != null ? start : wallToMs(facts.tz, addDays(night, 1), 0, 0);
}
export function eventWindow(facts, night) {
  const s = parseClock(facts.start_time);
  if (!s) return { allDay: true, startDay: night, endDay: addDays(night, 1) };
  const e = parseClock(facts.end_time);
  const startMs = wallToMs(facts.tz, night, s.h, s.mi);
  let endMs = e ? wallToMs(facts.tz, night, e.h, e.mi) : startMs + REMINDER_DEFAULT_LENGTH_MIN * MIN;
  // An end clock before the start clock is an overnight show (Jollywood Nights
  // 7:30 PM to 12:30 AM): it ends the next calendar day. Anything that would run
  // past 14 hours is a bad row, and falls back to the default length.
  if (e && endMs <= startMs) endMs = wallToMs(facts.tz, addDays(night, 1), e.h, e.mi);
  if (endMs <= startMs || endMs - startMs > 14 * 60 * MIN) endMs = startMs + REMINDER_DEFAULT_LENGTH_MIN * MIN;
  return { allDay: false, startMs, endMs, start: s };
}

// ── alarm instants ───────────────────────────────────────────────────────────
export function presetAlarmMs(id, facts, night) {
  switch (id) {
    case "1w": return wallToMs(facts.tz, addDays(night, -7), 9, 0);
    case "2d": return wallToMs(facts.tz, addDays(night, -2), 9, 0);
    case "eve": return wallToMs(facts.tz, addDays(night, -1), 18, 0);
    case "am": return wallToMs(facts.tz, night, 9, 0);
    case "2h": { const s = eventStartMs(facts, night); return s == null ? null : s - 120 * MIN; }
    default: return null;
  }
}

/**
 * Every preset for this night with its alarm instant and whether it still
 * makes sense. `available` is false when the alert time has already passed, is
 * not before the event, or (2 hours before) the event has no start time.
 */
export function reminderOptions(facts, night, nowMs = Date.now()) {
  const deadline = alertDeadlineMs(facts, night);
  return REMINDER_PRESETS.map((p) => {
    const ms = presetAlarmMs(p.id, facts, night);
    const available = ms != null && ms > nowMs + MIN && ms < deadline;
    return { id: p.id, label: p.label, ms, available, when: ms != null ? wallLabel(facts.tz, ms) : null };
  });
}

/** Bounds for the "pick a date and time" input, as wall-clock strings. */
export function customBounds(facts, night, nowMs = Date.now()) {
  const lo = Math.max(nowMs + 5 * MIN, 0);
  const hi = alertDeadlineMs(facts, night) - MIN;
  if (hi <= lo) return null;
  const f = (ms) => { const w = msToWall(facts.tz, ms); return w.day + "T" + p2(w.h) + ":" + p2(w.mi); };
  return { min: f(lo), max: f(hi) };
}

/** Parse a `remind` value: a preset id, or a date and time. */
export function parseRemind(value, tz = "America/New_York") {
  const v = typeof value === "string" ? value.trim() : "";
  if (REMINDER_PRESETS.some((p) => p.id === v)) return { kind: "preset", id: v };
  const m = CUSTOM.exec(v);
  if (!m || !isIsoDay(m[1])) return null;
  const h = Number(m[2]), mi = Number(m[3]);
  if (h > 23 || mi > 59) return null;
  let ms;
  if (m[4]) {
    ms = Date.parse(m[1] + "T" + p2(h) + ":" + p2(mi) + ":00" + (m[4] === "Z" ? "Z" : m[4].length === 5 ? m[4].slice(0, 3) + ":" + m[4].slice(3) : m[4]));
  } else ms = wallToMs(tz, m[1], h, mi);
  return Number.isFinite(ms) ? { kind: "custom", ms } : null;
}

/**
 * Turn (event, night, remind) into one alarm instant, or the reason it cannot.
 * { ok: true, alarmMs, preset, daysBefore } | { ok: false, error }
 */
export function resolveReminder(facts, night, remind, { nowMs = Date.now(), today = siteTodayStr(new Date(nowMs)) } = {}) {
  if (!facts) return { ok: false, error: "This event has no date to remind you about." };
  if (!isReminderNight(facts, night, today, nowMs)) return { ok: false, error: "That night is not one of this event's upcoming dates." };
  const parsed = parseRemind(remind, facts.tz);
  if (!parsed) return { ok: false, error: "Choose when to be reminded." };
  let alarmMs, preset;
  if (parsed.kind === "preset") {
    const o = reminderOptions(facts, night, nowMs).find((x) => x.id === parsed.id);
    if (!o || o.ms == null) return { ok: false, error: "That reminder time needs a start time this event does not have." };
    if (!o.available) return { ok: false, error: "That reminder time has already passed. Choose a later one." };
    alarmMs = o.ms; preset = parsed.id;
  } else {
    alarmMs = parsed.ms; preset = "custom";
    if (!(alarmMs > nowMs)) return { ok: false, error: "That date and time has already passed." };
    if (!(alarmMs < alertDeadlineMs(facts, night))) return { ok: false, error: "Choose a time before the event starts." };
  }
  const daysBefore = Math.max(0, dayDiff(msToWall(facts.tz, alarmMs).day, night));
  return { ok: true, alarmMs, preset, daysBefore };
}

// ── RFC 5545 text ────────────────────────────────────────────────────────────
export function icsEscape(text) {
  return String(text == null ? "" : text)
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}
const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const octets = (ch) => (enc ? enc.encode(ch).length : Buffer.byteLength(ch));
/** Fold one content line at 75 octets, never inside a UTF-8 character. */
export function foldLine(line) {
  if (octets(line) <= 75) return line;
  const out = [];
  let cur = "", used = 0, limit = 75;
  for (const ch of line) {
    const n = octets(ch);
    if (used + n > limit) { out.push(cur); cur = ""; used = 0; limit = 74; }
    cur += ch; used += n;
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}

const TICKET_GO = /^\/api\/[a-z0-9-]+\/go(?:[?#]|$)/i;
/** The one ticket link the invite may carry: an on-site /api/<x>/go route. */
export function reminderTicketUrl(href, siteUrl) {
  if (!href) return null;
  const path = String(href).startsWith("http") ? (() => { try { const u = new URL(href); return u.origin === new URL(siteUrl).origin ? u.pathname + u.search : ""; } catch { return ""; } })() : String(href);
  return TICKET_GO.test(path) ? siteUrl.replace(/\/+$/, "") + path : null;
}

export function reminderPageUrl(slug, siteUrl) {
  return siteUrl.replace(/\/+$/, "") + "/florida-events/" + slug + "?utm_source=calendar&utm_medium=reminder";
}

function vtimezone(zoneName) {
  const z = REMINDER_ZONES[reminderZone(zoneName)];
  const fmt = (min) => (min < 0 ? "-" : "+") + p2(Math.floor(Math.abs(min) / 60)) + p2(Math.abs(min) % 60);
  return [
    "BEGIN:VTIMEZONE",
    "TZID:" + reminderZone(zoneName),
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:" + fmt(z.std), "TZOFFSETTO:" + fmt(z.std + 60), "TZNAME:" + z.dstName,
    "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:" + fmt(z.std + 60), "TZOFFSETTO:" + fmt(z.std), "TZNAME:" + z.stdName,
    "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

/**
 * The invite. Throws when the event has no real date or the ticket link is not
 * an on-site /api/<x>/go route, so a caller cannot ship an undated or raw
 * affiliate invite by mistake.
 *
 * @param {object} p
 * @param {object} p.facts      reminderFacts()
 * @param {string} p.night      YYYY-MM-DD
 * @param {number} p.alarmMs    resolveReminder().alarmMs
 * @param {string} p.siteUrl    absolute origin
 * @param {string} p.uid        reminderUid(slug, night): the same text for the same event night, every download
 * @param {string|null} p.ticketHref  /api/<x>/go path (or absolute on siteUrl)
 * @param {number} p.nowMs      DTSTAMP
 * @param {number|null} p.lat
 * @param {number|null} p.lng
 */
export function buildReminderIcs({ facts, night, alarmMs, siteUrl, uid, ticketHref = null, nowMs = Date.now(), lat = null, lng = null }) {
  if (typeof uid !== "string" || !/^[0-9a-f]{64}@gowayfind\.com$/.test(uid)) throw new Error("buildReminderIcs: uid must be sha256(slug + night)@gowayfind.com");
  if (!facts || !isIsoDay(facts.start_date)) throw new Error("buildReminderIcs: undated event");
  if (!isIsoDay(night)) throw new Error("buildReminderIcs: bad night");
  if (!Number.isFinite(alarmMs)) throw new Error("buildReminderIcs: bad alarm");
  let ticket = null;
  if (ticketHref) {
    ticket = reminderTicketUrl(ticketHref, siteUrl);
    if (!ticket) throw new Error("buildReminderIcs: ticket link must be an on-site /api/<x>/go route");
  }
  const page = reminderPageUrl(facts.slug, siteUrl);
  const win = eventWindow(facts, night);
  const tz = reminderZone(facts.tz);
  const line = facts.hook || (facts.name + (facts.location ? " at " + facts.location : "") + ".");
  const description = [line, "Event page: " + page, ticket ? "Tickets: " + ticket : null].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wayfind//Event Reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...vtimezone(tz),
    "BEGIN:VEVENT",
    "UID:" + uid,
    "DTSTAMP:" + utcStamp(nowMs),
  ];
  if (win.allDay) {
    lines.push("DTSTART;VALUE=DATE:" + compactDay(night), "DTEND;VALUE=DATE:" + compactDay(win.endDay));
  } else {
    const s = msToWall(tz, win.startMs), e = msToWall(tz, win.endMs);
    lines.push("DTSTART;TZID=" + tz + ":" + compactWall(s.day, s.h, s.mi), "DTEND;TZID=" + tz + ":" + compactWall(e.day, e.h, e.mi));
  }
  lines.push("SUMMARY:" + icsEscape(facts.name));
  if (facts.location) lines.push("LOCATION:" + icsEscape(facts.location));
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    lines.push("GEO:" + Number(lat).toFixed(6) + ";" + Number(lng).toFixed(6));
  }
  lines.push(
    "URL:" + page,
    "DESCRIPTION:" + icsEscape(description),
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:" + icsEscape("Reminder: " + facts.name),
    "TRIGGER;VALUE=DATE-TIME:" + utcStamp(alarmMs),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Google Calendar "add event" link. Google picks its own default alert. */
export function googleCalendarUrl({ facts, night, siteUrl, ticketHref = null }) {
  if (!facts || !isIsoDay(night)) return null;
  const win = eventWindow(facts, night);
  const tz = reminderZone(facts.tz);
  // Timed events go as UTC instants (the same instants the .ics carries), with
  // ctz only choosing the zone Google displays them in.
  const dates = win.allDay ? compactDay(night) + "/" + compactDay(win.endDay) : utcStamp(win.startMs) + "/" + utcStamp(win.endMs);
  const ticket = ticketHref ? reminderTicketUrl(ticketHref, siteUrl) : null;
  const details = [facts.hook || facts.name, "Event page: " + reminderPageUrl(facts.slug, siteUrl), ticket ? "Tickets: " + ticket : null].filter(Boolean).join("\n");
  const q = new URLSearchParams({ action: "TEMPLATE", text: facts.name, dates, details });
  if (facts.location) q.set("location", facts.location);
  if (!win.allDay) q.set("ctz", tz);
  return "https://calendar.google.com/calendar/render?" + q.toString();
}

/** The path the "Add to my calendar" button points at. */
export function reminderDownloadPath(slug, night, remind) {
  return "/api/events/reminder?slug=" + encodeURIComponent(slug) + "&night=" + encodeURIComponent(night) + "&remind=" + encodeURIComponent(remind);
}
