// lib/overnightClose.js — keep a listing discoverable until its verified final
// close when that close falls after midnight (owner brief, 2026-10-29).
//
// Wayfind's date law retires a dated listing when the venue-local calendar day
// passes its last date (lib/fallPool.js fallEventLive). That is right for a
// pumpkin patch that shut at 6 PM, and wrong for a Halloween party that runs
// Oct 31 10 PM to 3 AM: at 12:01 AM it is still going, yet the card vanished.
//
// Policy (the only two inputs that can extend a listing):
//   1. An event row whose clock columns say it closes after midnight
//      (end_time <= start_time, the dataset's convention: end_date is the
//      OPENING date of the last night) closes on the next calendar day at
//      end_time.
//   2. A hospitality catalog row with an explicit verified `final_close`
//      ("YYYY-MM-DDTHH:MM", venue-local) on the morning after its last night.
// Anything else keeps the documented date law: unknown close = retire at
// midnight. A close later than CARRY_LIMIT is not treated as an overnight
// close (a malformed clock must never keep a card alive into the next day).
import { siteTodayStr } from "./siteTime.js";
import { siteHourFloat } from "./nowContext.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^(\d{2}):(\d{2})(?::\d{2})?$/;
const LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;
const CARRY_LIMIT = "06:00";

function clock(value) {
  const m = CLOCK.exec(String(value || ""));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1]}:${m[2]}`;
}

export function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

// The venue-local (ET) wall clock of `now` as "YYYY-MM-DDTHH:MM". The hour
// comes from the one sanctioned clock (lib/nowContext.siteHourFloat).
export function siteNowLocal(now = new Date()) {
  const float = siteHourFloat(now);
  const minutes = Math.min(1439, Math.round(float * 60));
  const p2 = (n) => String(n).padStart(2, "0");
  return `${siteTodayStr(now)}T${p2(Math.floor(minutes / 60))}:${p2(minutes % 60)}`;
}

function lastNight(item) {
  const dates = Array.isArray(item?.occurrence_dates) ? item.occurrence_dates.filter((d) => DATE.test(d)).sort() : [];
  return dates[dates.length - 1] || (DATE.test(item?.end_date || "") ? item.end_date : null)
    || (DATE.test(item?.start_date || "") ? item.start_date : null);
}

// "YYYY-MM-DDTHH:MM" final close after midnight, or null when the close is
// unknown, same-evening, or not a plausible overnight close.
export function eventFinalClose(event) {
  const night = lastNight(event);
  const start = clock(event?.start_time);
  const end = clock(event?.end_time);
  if (!night || !start || !end || end >= start || end === "00:00" || end > CARRY_LIMIT) return null;
  return `${addDaysStr(night, 1)}T${end}`;
}

export function catalogFinalClose(entry) {
  const night = lastNight(entry);
  const m = LOCAL.exec(String(entry?.final_close || ""));
  if (!night || !m || !clock(m[2]) || m[2] === "00:00" || m[2] > CARRY_LIMIT) return null;
  return m[1] === addDaysStr(night, 1) ? entry.final_close : null;
}

export function overnightUntilLabel(close) {
  const [h, m] = close.slice(11).split(":").map(Number);
  const hour = h % 12 || 12;
  return `Open until ${hour}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
}

// Project an item whose last night is still running after midnight onto
// today's calendar day, so every downstream date filter keeps it until the
// close. Returns the item unchanged when it is not carrying over.
export function carryOvernight(item, close, { today, nowLocal }) {
  if (!item || !close || !DATE.test(today || "") || !LOCAL.test(nowLocal || "")) return item;
  if (close.slice(0, 10) !== today || nowLocal >= close) return item;
  const night = lastNight(item);
  if (!night || night >= today) return item;
  const dates = Array.isArray(item.occurrence_dates) && item.occurrence_dates.length ? [today] : item.occurrence_dates;
  return { ...item, end_date: today, ...(dates !== undefined ? { occurrence_dates: dates } : {}),
    overnight_until: close, overnight_label: overnightUntilLabel(close) };
}

// Rail cache bucket: during the after-midnight window the answer can change
// at any whole hour (a 3 AM close), so the key carries the quarter hour; the rest of
// the day keeps one key per day.
export function overnightCacheBucket(nowLocal) {
  const m = LOCAL.exec(String(nowLocal || ""));
  if (!m || m[2] >= CARRY_LIMIT) return "";
  const [h, min] = m[2].split(":");
  return `:h${h}${String(Math.floor(Number(min) / 15) * 15).padStart(2, "0")}`;
}
