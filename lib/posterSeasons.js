// lib/posterSeasons.js - the ONE source of truth for WHEN a seasonal homepage
// poster is on the top track. Owner request 2026-10-14: the posters show and
// hide on their own every year, with no yearly code edit.
//
//   augtober   (Fall)       Aug 15 through Thanksgiving Day (4th Thursday of Nov)
//   halloween               Oct 10 through Oct 31
//   christmas               Oct 13 through Jan 1 (New Year's Day) - wraps the year
//
// Pure and client-safe: no Date.now(), no I/O. The caller passes "today" (always
// lib/siteTime.siteTodayStr(), US Eastern). Thanksgiving math is the one in
// lib/fallSkin.js; it is imported, never copied. NOTE: FALL_SEASON_START_MD
// (08-26) in fallSkin.js is the FALL PLACE-CARD SKIN window, a separate owner
// rule, and is deliberately NOT used here.
//
// A rail id with no row here is not seasonal and is always live.
import { thanksgivingDayOfMonth } from "./fallSkin.js";

/** startMD / end are "MM-DD"; end may be "thanksgiving". wrapsYear: end falls in the NEXT calendar year. */
export const POSTER_SEASONS = Object.freeze({
  augtober: Object.freeze({ startMD: "08-15", end: "thanksgiving", wrapsYear: false }),
  halloween: Object.freeze({ startMD: "10-10", end: "10-31", wrapsYear: false }),
  christmas: Object.freeze({ startMD: "10-13", end: "01-01", wrapsYear: true }),
});

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Concrete dates of the season that STARTS in `year` (a wrapping season ends in
 * year + 1). Returns { start, end } as YYYY-MM-DD, or null for a rail with no window.
 */
export function posterSeasonWindow(railId, year) {
  const s = POSTER_SEASONS[railId];
  const y = Number(year);
  if (!s || !Number.isInteger(y)) return null;
  const endYear = s.wrapsYear ? y + 1 : y;
  const end = s.end === "thanksgiving" ? `${endYear}-11-${pad2(thanksgivingDayOfMonth(endYear))}` : `${endYear}-${s.end}`;
  return { start: `${y}-${s.startMD}`, end };
}

/**
 * Is this rail's poster in season on `todayStr` (YYYY-MM-DD)? Rails with no
 * window are always live. A malformed date fails OPEN (the poster shows) so a bad
 * clock can never blank the track.
 */
export function posterSeasonLive(railId, todayStr) {
  if (!POSTER_SEASONS[railId]) return true;
  if (typeof todayStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(todayStr)) return true;
  const y = Number(todayStr.slice(0, 4));
  // A wrapping season that began last year may still be running (Jan 1).
  for (const startYear of [y, y - 1]) {
    const w = posterSeasonWindow(railId, startYear);
    if (w && todayStr >= w.start && todayStr <= w.end) return true;
  }
  return false;
}

/**
 * The whole top-track visibility rule for one rail object, used by
 * app/components/DaypartRail.js. Keeps the older per-rail `seasonalThrough`
 * support for any other caller.
 */
export function railOnPosterTrack(r, todayStr) {
  if (!r || r.posterHidden || r.artStale || r.retiredInto) return false;
  if (r.seasonalThrough && todayStr > r.seasonalThrough) return false;
  return posterSeasonLive(r.id, todayStr);
}
