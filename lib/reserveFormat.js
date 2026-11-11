// lib/reserveFormat.js - client safe date and time helpers for "Reserve a table".
// No node imports, so the respond page can use it. Pure calendar math.
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
