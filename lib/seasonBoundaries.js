// lib/seasonBoundaries.js - the days on which the SERVER-RENDERED homepage HTML
// changes because of a season, and the one function that refreshes it then.
//
// WHAT IS DATE-DEPENDENT IN THE SSR HTML (app/page.js is ISR, revalidate 3600):
//   1. the poster track: which of Fall / Halloween / Christmas are on it
//      (lib/posterSeasons.railOnPosterTrack, called by DaypartRail) ...
//   2. ... and their ORDER (lib/dayparts.orderFor -> christmasLeads puts
//      Christmas first from Nov 1 through Jan 1),
//   3. the fall place-card class wf-fall-card (lib/fallSkin.fallCardClass),
//   4. the Halloween card skin (lib/spookySkin.spookySkinLive).
// Without a refresh, the first hour of a boundary day can serve yesterday's
// HTML. The client corrects itself (lib/siteDayClock.js) but a first paint of
// yesterday's poster is a flash.
//
// THE BOUNDARY RULE IS DERIVED, NOT LISTED. A day is a boundary day when ANY of
// the four predicates above gives a different answer than it did yesterday.
// Nothing here remembers a season's dates, so a new season row in
// lib/posterSeasons.js or a moved skin start is picked up with no edit here.
import { POSTER_SEASONS, posterSeasonLive } from "./posterSeasons.js";
import { fallSkinLive } from "./fallSkin.js";
import { spookySkinLive } from "./spookySkin.js";
import { christmasLeads, halloweenLeads } from "./dayparts.js";
import { siteTodayStr } from "./siteTime.js";

const DAY_MS = 864e5;
export function addDays(dateStr, n) {
  // Pure calendar arithmetic on a date string (no clock read): UTC fields, manual padding.
  const t = new Date(Date.parse(dateStr + "T00:00:00Z") + n * DAY_MS);
  const p2 = (v) => String(v).padStart(2, "0");
  return t.getUTCFullYear() + "-" + p2(t.getUTCMonth() + 1) + "-" + p2(t.getUTCDate());
}

/** Everything date-dependent in the SSR HTML, as one comparable string. */
export function seasonSignature(dateStr) {
  const posters = Object.keys(POSTER_SEASONS).map((id) => (posterSeasonLive(id, dateStr) ? 1 : 0)).join("");
  return [posters, fallSkinLive(dateStr) ? 1 : 0, spookySkinLive(dateStr) ? 1 : 0, christmasLeads(dateStr) ? 1 : 0, halloweenLeads(dateStr) ? 1 : 0].join("|");
}

/** True when the SSR HTML for `dateStr` (YYYY-MM-DD, US Eastern) differs from yesterday's. */
export function isSeasonBoundaryDay(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return seasonSignature(dateStr) !== seasonSignature(addDays(dateStr, -1));
}

/** Every boundary day in calendar `year`, ascending. */
export function seasonBoundaryDays(year) {
  const out = [];
  for (let d = `${year}-01-01`; d.slice(0, 4) === String(year); d = addDays(d, 1)) if (isSeasonBoundaryDay(d)) out.push(d);
  return out;
}

// Every ISR route whose HTML carries the seasonal posters or fall/spooky cards.
// "/" renders Home; "/v8" renders DaypartRail. (/p/[id] is dynamic - it reads
// headers() - and /r/[rail] is a redirect shell with no posters.)
export const SEASONAL_ISR_PATHS = Object.freeze(["/", "/v8"]);

/**
 * The cron body, with its two side effects injected so a guard can call it.
 * Returns { skipped, today, revalidated }.
 */
export function runSeasonalRevalidate({ now = new Date(), revalidatePath }) {
  const today = siteTodayStr(now);
  if (!isSeasonBoundaryDay(today)) return { skipped: true, today, revalidated: [] };
  for (const p of SEASONAL_ISR_PATHS) revalidatePath(p);
  return { skipped: false, today, revalidated: [...SEASONAL_ISR_PATHS] };
}
