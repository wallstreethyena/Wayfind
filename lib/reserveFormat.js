// lib/reserveFormat.js - client safe date and time helpers for "Reserve a table".
// No node imports, so the respond page and the lazy reserve sheet can use it. Pure calendar math.
import { dtf } from "./intlCache.js";
import { siteHourFloat } from "./nowContext.js";

const SITE_TZ = "America/New_York";
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** True for a real calendar day written YYYY-MM-DD (rejects 2026-02-30). */
export function isDateString(value) {
  const m = DATE_RE.exec(typeof value === "string" ? value : "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** YYYY-MM-DD plus n whole days. Pure calendar math, no timezone involved. */
export function addDays(dateStr, n) {
  const m = DATE_RE.exec(dateStr);
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  const pad = (n) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayName(dateStr) {
  const m = DATE_RE.exec(dateStr);
  return WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
}

/** "2026-11-14" -> "Saturday, November 14". */
export function formatReserveDate(dateStr) {
  if (!isDateString(dateStr)) return "";
  const m = DATE_RE.exec(dateStr);
  return `${weekdayName(dateStr)}, ${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/** "19:30" or "19:30:00" -> "7:30 PM". */
export function formatReserveTime(timeStr) {
  const m = TIME_RE.exec(String(timeStr || "").slice(0, 5));
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function zoneOffsetMinutes(utcMs, tz) {
  const parts = dtf("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(utcMs)); // one-clock-ok: DST exact wall clock to UTC instant for a reservation time, never derives a daypart
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** The UTC instant (ms) of a wall clock date and time in the restaurant's time zone. DST aware. */
export function zonedToUtcMs(dateStr, timeStr, tz = SITE_TZ) {
  const d = DATE_RE.exec(dateStr), t = TIME_RE.exec(String(timeStr).slice(0, 5));
  if (!d || !t) return NaN;
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let guess = naive - zoneOffsetMinutes(naive, tz) * 60000;
  guess = naive - zoneOffsetMinutes(guess, tz) * 60000;
  return guess;
}

/** The UTC instant (ms) of a US Eastern wall clock date and time. DST aware. */
export function easternToUtcMs(dateStr, timeStr) { return zonedToUtcMs(dateStr, timeStr, SITE_TZ); }

/** The calendar day (YYYY-MM-DD) it is right now in the restaurant's time zone. */
export function zonedToday(nowMs, tz = SITE_TZ) {
  const pad = (n) => String(n).padStart(2, "0");
  const off = zoneOffsetMinutes(nowMs, tz); // one-clock-ok: restaurant local calendar day for a reservation window, never derives a daypart
  const t = new Date(nowMs + off * 60000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 60 -> "1 hour", 120 -> "2 hours", 90 -> "90 minutes". */
export function leadWords(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return "a little";
  if (m % 60 === 0) return m === 60 ? "1 hour" : `${m / 60} hours`;
  return `${m} minutes`;
}

/** "Thu 2026-11-12 (today), Fri 2026-11-13, ..." for the next `days` days. */
export function reserveCalendar(today, days = 21) {
  if (!isDateString(today)) return "";
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i);
    out.push(`${weekdayName(d).slice(0, 3)} ${d}${i === 0 ? " (today)" : ""}`);
  }
  return out.join(", ");
}

/** The Eastern wall clock for an instant, as "HH:MM". The hour comes from the one clock source (siteHourFloat). */
export function easternClock(nowMs) {
  const f = siteHourFloat(new Date(nowMs));
  let h = Math.floor(f), m = Math.round((f - h) * 60);
  if (m === 60) { h = (h + 1) % 24; m = 0; }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
