// lib/thisWeekEvents.js - PURE data for the homepage "This week in Florida" strip.
//
// Audit 2026-11-03: this week's curated events (SAVOR, Siesta Key Crystal Classic,
// Sarasota Medieval Fair, Festival of the Skeletons) had /florida-events pages but were
// invisible on the homepage. The strip links straight to those pages.
//
// Statewide on purpose: app/page.js is one cached server render (revalidate 3600), so
// there is no per-visitor location here. Trust and Florida gates are the SAME predicates
// the /florida-events hub uses (isTrusted, isFloridaEvent); the picture is the hub's
// cardImage ladder (stored hero_image, else the venue's own photo by exact place_id).
// Prices are never shown. The cached Supabase read lives in lib/thisWeekEventsServer.js
// (it imports next/cache, which plain-node guards cannot load).
import { isTrusted, isFloridaEvent } from "./curatedEvents.js";
import { eventVenueImageSrc } from "./eventPageImage.js";
import { siteTodayStr } from "./siteTime.js";

export const THIS_WEEK_WINDOW_DAYS = 10;
export const THIS_WEEK_MAX = 12; // 11 days in the window, so every day gets its best event plus one
export const THIS_WEEK_MIN = 2;
// A run longer than this that started before today is a season (Epcot Food and Wine,
// a haunted house open since September), not something happening this week. Live
// 2026-11-03: sorting by start_date put five such runs ahead of SAVOR and the
// Medieval Fair, the very events the strip exists to surface.
export const THIS_WEEK_MAX_RUN_DAYS = 30;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Pure calendar math on YYYY-MM-DD strings (no timezone involved). */
export function addDaysStr(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
}

function parts(day) {
  const [y, m, d] = day.split("-").map(Number);
  return { m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Sat Nov 7" for a single day, "Nov 6 to 8" / "Nov 28 to Dec 2" for a run. No dashes. */
export function thisWeekDateLabel(e) {
  if (!e || !ISO_DAY.test(String(e.start_date || ""))) return "";
  const s = parts(e.start_date);
  if (!e.end_date || e.end_date === e.start_date || !ISO_DAY.test(String(e.end_date))) return WEEKDAY_ABBR[s.dow] + " " + MONTH_ABBR[s.m - 1] + " " + s.d;
  const en = parts(e.end_date);
  return s.m === en.m ? MONTH_ABBR[s.m - 1] + " " + s.d + " to " + en.d : MONTH_ABBR[s.m - 1] + " " + s.d + " to " + MONTH_ABBR[en.m - 1] + " " + en.d;
}

/**
 * The strip's cards. Pure: rows in, up to THIS_WEEK_MAX plain cards out, or [] when fewer
 * than THIS_WEEK_MIN qualify. An event qualifies when it is trusted, in Florida, not over
 * (end >= today), starts no later than today + THIS_WEEK_WINDOW_DAYS, and is not a
 * season-long run (started before today and longer than THIS_WEEK_MAX_RUN_DAYS). Cards are
 * dealt one day at a time across the window (the day an event is next on: today for a run
 * already under way, else start_date), dated events before seasons opening that day and best
 * editorial_score first within a day, so Saturday's festivals always make the strip instead
 * of Tuesday's markets filling it. Within a round the order is by day. One card per
 * event_series_id.
 */
export function thisWeekEventCards(rows, today = siteTodayStr()) {
  if (!ISO_DAY.test(String(today || ""))) throw new Error("thisWeekEventCards requires an Eastern calendar date");
  const last = addDaysStr(today, THIS_WEEK_WINDOW_DAYS);
  const inWindow = (Array.isArray(rows) ? rows : []).filter((e) => {
    if (!e || !e.slug || !isTrusted(e) || !isFloridaEvent(e)) return false;
    const start = String(e.start_date || "");
    const end = String(e.end_date || e.start_date || "");
    if (!ISO_DAY.test(start) || end < today || start > last) return false;
    if (start < today && ISO_DAY.test(end) && Date.parse(end) - Date.parse(start) > THIS_WEEK_MAX_RUN_DAYS * 86400000) return false;
    return true;
  });
  const dayOf = (e) => (e.start_date < today ? today : e.start_date);
  const runDays = (e) => (ISO_DAY.test(String(e.end_date || "")) ? (Date.parse(e.end_date) - Date.parse(e.start_date)) / 86400000 : 0);
  const isSeason = (e) => runDays(e) > THIS_WEEK_MAX_RUN_DAYS;
  // Within a day: dated events before seasons that happen to open that day (a Christmas
  // party running to January is not "this week"), then best editorial_score first.
  const byScore = (a, b) => (isSeason(a) !== isSeason(b) ? (isSeason(a) ? 1 : -1) : (Number(b.editorial_score) || 0) - (Number(a.editorial_score) || 0));
  // One queue per day, best first; then deal round-robin across the days in order.
  const queues = new Map();
  for (const e of inWindow) {
    const d = dayOf(e);
    if (!queues.has(d)) queues.set(d, []);
    queues.get(d).push(e);
  }
  const days = [...queues.keys()].sort();
  for (const d of days) queues.get(d).sort(byScore);
  const dealt = [];
  for (let round = 0; dealt.length < inWindow.length; round++) {
    for (const d of days) { const q = queues.get(d); if (round < q.length) dealt.push(q[round]); }
  }
  const seen = new Set();
  const cards = [];
  for (const e of dealt) {
    const series = e.event_series_id || null;
    if (series) { if (seen.has(series)) continue; seen.add(series); }
    cards.push({
      slug: e.slug,
      href: "/florida-events/" + e.slug,
      name: e.short_title || e.event_name,
      city: e.city,
      when: thisWeekDateLabel(e),
      image: e.hero_image || eventVenueImageSrc(e) || "",
    });
    if (cards.length >= THIS_WEEK_MAX) break;
  }
  return cards.length >= THIS_WEEK_MIN ? cards : [];
}
