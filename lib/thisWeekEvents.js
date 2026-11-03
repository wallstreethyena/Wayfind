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
export const THIS_WEEK_MAX = 8;
export const THIS_WEEK_MIN = 2;

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
 * (end >= today) and starts no later than today + THIS_WEEK_WINDOW_DAYS. Order: start_date,
 * then editorial_score desc. One card per event_series_id.
 */
export function thisWeekEventCards(rows, today = siteTodayStr()) {
  if (!ISO_DAY.test(String(today || ""))) throw new Error("thisWeekEventCards requires an Eastern calendar date");
  const last = addDaysStr(today, THIS_WEEK_WINDOW_DAYS);
  const inWindow = (Array.isArray(rows) ? rows : []).filter((e) => {
    if (!e || !e.slug || !isTrusted(e) || !isFloridaEvent(e)) return false;
    const start = String(e.start_date || "");
    const end = String(e.end_date || e.start_date || "");
    return ISO_DAY.test(start) && end >= today && start <= last;
  });
  inWindow.sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : (Number(b.editorial_score) || 0) - (Number(a.editorial_score) || 0)));
  const seen = new Set();
  const cards = [];
  for (const e of inWindow) {
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
