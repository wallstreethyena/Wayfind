// lib/reserveFormat.js - client safe date and time helpers for "Reserve a table".
// No node imports, so the respond page and the lazy reserve sheet can use it. Pure calendar math.
import { dtf } from "./intlCache.js";
import { siteHourFloat } from "./nowContext.js";

const SITE_TZ = "America/New_York";
/** A request must be at least this many minutes away (US Eastern, DST safe). */
export const RESERVE_MIN_LEAD_MINUTES = 120;
export const RESERVE_TOO_SOON_MESSAGE = "That is too soon for a table request. Pick a time at least 2 hours from now, or call the restaurant.";
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

function easternOffsetMinutes(utcMs) {
  const parts = dtf("en-US", { timeZone: SITE_TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(utcMs)); // one-clock-ok: DST exact Eastern wall clock to UTC instant for a reservation time, never derives a daypart
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** The UTC instant (ms) of a US Eastern wall clock date and time. DST aware. */
export function easternToUtcMs(dateStr, timeStr) {
  const d = DATE_RE.exec(dateStr), t = TIME_RE.exec(String(timeStr).slice(0, 5));
  if (!d || !t) return NaN;
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  let guess = naive - easternOffsetMinutes(naive) * 60000;
  guess = naive - easternOffsetMinutes(guess) * 60000;
  return guess;
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
