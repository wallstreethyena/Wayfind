// lib/siteDayClock.js - the client side of "a season changes at midnight Eastern".
//
// The seasonal pieces (poster track filter and order, fall and Halloween card
// classes, Christmas-first) read the Eastern date while rendering. Two things
// kept a tab wrong: (1) server HTML up to an hour old (fixed at the source by
// app/api/cron/seasonal-revalidate), and (2) a tab left open across midnight,
// where nothing re-rendered and a useMemo keyed without the date kept the old
// poster order. This module fixes both without a reload:
//
//   - ONE timer for the whole page, set to the next Eastern midnight, armed only
//     while something is subscribed. On fire it re-reads the date and tells every
//     subscriber; a subscriber re-renders only if the date string really changed.
//     No interval, no polling.
//   - A tab that slept through midnight (timers are paused or throttled) is
//     re-checked once when it becomes visible again. That is an event, not a loop.
//   - HYDRATION: the server stamps the day it rendered (app/components/SiteDaySeed.js, rendered by app/page.js and app/v8/page.js).
//     The first client render uses THAT day, so it matches the HTML byte for byte;
//     React then compares with the real day and re-renders immediately if the
//     page was stale. That is how a stale first hour corrects itself on load.
import { useSyncExternalStore } from "react";
import { dtf } from "./intlCache.js";
import { siteTodayStr } from "./siteTime.js";

let seededDay = null;
export function seedSiteDay(day) {
  if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) seededDay = day;
}

// America/New_York wall clock of instant `t`, as a UTC-epoch number: wall - t is the zone offset.
function etWallAsUtc(t) {
  const p = dtf("en-GB", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
  const g = (k) => Number(p.find((x) => x.type === k).value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
}
/**
 * Milliseconds from `now` to the next midnight in America/New_York. Offset-aware, so
 * the 23 and 25 hour DST days are exact (two passes settle the offset change).
 */
export function msUntilNextSiteMidnight(now = new Date()) {
  const t0 = now.getTime();
  const wall = etWallAsUtc(t0);
  const nextWallMidnight = Date.UTC(new Date(wall).getUTCFullYear(), new Date(wall).getUTCMonth(), new Date(wall).getUTCDate() + 1);
  let t = nextWallMidnight - (wall - Math.floor(t0 / 1000) * 1000);
  t = nextWallMidnight - (etWallAsUtc(t) - Math.floor(t / 1000) * 1000);
  return Math.max(1000, t - t0);
}

const subs = new Set();
let timer = null;
let lastDay = null;
let visBound = false;

function check() {
  const d = siteTodayStr();
  if (d !== lastDay) { lastDay = d; subs.forEach((f) => { try { f(); } catch (e) {} }); }
}
function arm() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!subs.size) return;
  // +250ms so we fire just AFTER midnight; if the browser fires early, check() sees the
  // same date and arm() sets the (short) remainder.
  timer = setTimeout(() => { timer = null; check(); arm(); }, Math.min(msUntilNextSiteMidnight() + 250, 2147483000));
}
function onVisible() { if (typeof document !== "undefined" && document.visibilityState === "visible") { check(); arm(); } }

export function subscribeSiteDay(cb) {
  subs.add(cb);
  if (subs.size === 1) {
    lastDay = siteTodayStr();
    arm();
    if (!visBound && typeof document !== "undefined") { document.addEventListener("visibilitychange", onVisible); visBound = true; }
  }
  return () => {
    subs.delete(cb);
    if (!subs.size) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (visBound && typeof document !== "undefined") { document.removeEventListener("visibilitychange", onVisible); visBound = false; }
    }
  };
}

const serverDay = () => seededDay || siteTodayStr();

/** The Eastern date, "YYYY-MM-DD", that re-renders its caller at midnight. */
export function useSiteToday() {
  return useSyncExternalStore(subscribeSiteDay, siteTodayStr, serverDay);
}
