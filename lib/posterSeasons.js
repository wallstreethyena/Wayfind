// lib/posterSeasons.js - the ONE source of truth for WHEN a seasonal homepage
// poster is on the top track. Owner request 2026-10-14: the posters show and
// hide on their own every year, with no yearly code edit.
//
//   augtober   (Fall)       Aug 15 through Nov 10; retired starting Nov 11
//   halloween               Oct 10 through Oct 31
//   christmas               Oct 13 through Jan 1 (New Year's Day) - wraps the year
//   season     (Summer Picks) Jun 1 through Aug 31 - 2026-11-03: it was on the track all
//                          year and shipped an empty "Summer Picks" tile in November
//
// Pure and client-safe: no Date.now(), no I/O. The caller passes "today" (always
// lib/siteTime.siteTodayStr(), US Eastern). Both Fall display boundaries come
// from lib/fallSkin.js, so the poster and place-card skins stay in sync.
//
// A rail id with no row here is not seasonal and is always live.
import { FALL_SEASON_START_MD, FALL_SEASON_END_MD } from "./fallSkin.js";

/** startMD / end are "MM-DD". wrapsYear: end falls in the NEXT calendar year. */
export const POSTER_SEASONS = Object.freeze({
  augtober: Object.freeze({ startMD: FALL_SEASON_START_MD, end: FALL_SEASON_END_MD, wrapsYear: false }),
  halloween: Object.freeze({ startMD: "10-10", end: "10-31", wrapsYear: false }),
  christmas: Object.freeze({ startMD: "10-13", end: "01-01", wrapsYear: true }),
  season: Object.freeze({ startMD: "06-01", end: "08-31", wrapsYear: false }),
});

/**
 * Concrete dates of the season that STARTS in `year` (a wrapping season ends in
 * year + 1). Returns { start, end } as YYYY-MM-DD, or null for a rail with no window.
 */
export function posterSeasonWindow(railId, year) {
  const s = POSTER_SEASONS[railId];
  const y = Number(year);
  if (!s || !Number.isInteger(y)) return null;
  const endYear = s.wrapsYear ? y + 1 : y;
  const end = `${endYear}-${s.end}`;
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

/**
 * The collection a cold visit opens: the first poster on the visible track
 * that expands in place. Partner tiles and tiles that navigate to a page
 * stay on the track, and they are not the landing collection.
 * Returns null when nothing on the track opens a drop.
 */
export function firstDropPosterId(trackIds, getRail) {
  const ids = Array.isArray(trackIds) ? trackIds : [];
  const get = typeof getRail === "function" ? getRail : () => null;
  for (const id of ids) {
    const r = get(id);
    if (!r || r.partner || r.opensPage) continue;
    return id;
  }
  return null;
}
