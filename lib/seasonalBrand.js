// lib/seasonalBrand.js — the ONE reusable seasonal-wordmark switch.
//
// WHAT THIS IS. A declarative table of month/day windows (SEASONAL_WINDOWS),
// each pointing at a MARK DESCRIPTOR (the asset paths + intrinsic size a
// call site needs to paint that mark). activeSeasonalMark(now) walks the
// table and returns the first matching row's mark, or null when no window is
// active. That is the entire mechanism — every call site in the app asks
// this ONE function "what should the wordmark look like right now" instead
// of encoding its own date math or its own asset paths.
//
// WHY MONTH/DAY, NEVER A YEAR. A window is {m, d} pairs, not a full date —
// so "Halloween" fires every year without a code change, and a guard can
// hand this function a date in ANY year (2027, 2031, ...) and get the same
// answer. See scripts/test-seasonal-brand.mjs for the guard that proves it.
//
// WHY "TODAY" MEANS VENUE-LOCAL EASTERN, NOT UTC. Vercel's serverless clock
// is UTC. `new Date().toISOString().slice(0,10)` flips the calendar day
// ~8PM ET — CLAUDE.md's standing gotcha for every other date cutoff in this
// app (coupons expiring early, tonight's events disappearing). A seasonal
// brand swap has the identical failure shape (the mark would flip hours
// early/late for every Eastern visitor), so this routes through the same
// venue-local helper as everything else: siteTodayParts() from
// lib/siteTime.js, which is Intl/DST-aware and already the sanctioned "today"
// for this codebase.
//
// WHY A ROW CAN WRAP THE NEW YEAR. A window is normally "start <= end" within
// one calendar year (Sept 1 -> Oct 31). A window like Christmas (Dec 20 ->
// Jan 2) crosses Dec 31 -> Jan 1, where "start" is numerically LARGER than
// "end". windowContains() below treats that shape (start > end) as a wrap
// and matches on EITHER side of the boundary. No such row exists yet — this
// repo only has Halloween live today — but the matcher supports the shape
// now, on purpose, so the day a Christmas row is added it just works. The
// wrap branch has real test coverage today via an injected synthetic
// table (see the guard's "wrap-the-new-year" case), not left untested until
// a real December row exists to exercise it.
//
// HOW TO ADD A SEASON (Christmas, July 4th, ...): drop one more object into
// SEASONAL_WINDOWS with its own {start, end, mark}. No other file changes to
// ADD a window. (Two things stay per-asset and are NOT generalized by this
// table: the header sprite's pixel geometry in app/components/css.js, which
// is derived from THIS Halloween asset's specific aspect ratio, and the
// assets themselves — both need a matching update when a new season's art
// ships. See that file's comment.)
//
// OVERLAP RULE: rows are checked in array order and the FIRST match wins.
// Keep windows non-overlapping in practice (two seasons both wanting the
// wordmark on the same day is a product decision, not something this module
// should silently arbitrate) — this is stated, not enforced, because there
// is only one row today.
import { siteTodayParts } from "./siteTime.js";

// The mark that renders when NO seasonal window is active — i.e. what every
// call site already showed before this switch existed. Exported so call
// sites can write `activeSeasonalMark() || NORMAL_MARK` instead of each
// re-typing the default path/size, which is exactly the kind of duplication
// that drifts (see CLAUDE.md's fallback-photo/art-map lesson).
export const NORMAL_MARK = {
  id: "normal",
  png: "/brand/wayfind-wordmark-transparent-v2.png",
  avif: "/brand/opt/wordmark-400.avif",
  webp: "/brand/opt/wordmark-400.webp",
  width: 1707,
  height: 441,
};

// The live Halloween mark (owner-approved asset, already built — see
// public/brand/wayfind-wordmark-halloween-v1.png and public/brand/opt/).
// Exported by name (not just buried inside SEASONAL_WINDOWS) because
// app/components/css.js needs these exact paths to build the header
// sprite's seasonal CSS rule, and importing them beats re-typing the paths
// a second time in a second file.
export const HALLOWEEN_MARK = {
  id: "halloween",
  png: "/brand/wayfind-wordmark-halloween-v1.png",
  avif: "/brand/opt/wordmark-halloween-400.avif",
  webp: "/brand/opt/wordmark-halloween-400.webp",
  width: 1000,
  height: 333,
};

// THE declarative table. One row per season. m/d are 1-indexed calendar
// month/day (January = 1), inclusive on both ends, venue-local (ET).
export const SEASONAL_WINDOWS = [
  {
    id: "halloween",
    label: "Halloween",
    // Spooky season, not just the 31st: starts Sept 1 (so the 2026-09-09/10
    // launch of this feature lands inside the window with no special-cased
    // "start today" row) and runs through Oct 31 inclusive. Nov 1 is the
    // normal wordmark again. Month/day only, so this refires every year.
    start: { m: 9, d: 1 },
    end: { m: 10, d: 31 },
    mark: HALLOWEEN_MARK,
  },
];

// True when the venue-local calendar day {m, d} falls inside [start, end]
// inclusive. Handles the ordinary case (start <= end, e.g. Sept 1 -> Oct 31)
// and the new-year-wrap case (start > end, e.g. Dec 20 -> Jan 2) with the
// same comparison: encode each {m, d} as a single sortable number (m*100+d
// is safe because d never reaches 100) and either test a closed range or its
// complement.
function windowContains(parts, start, end) {
  const val = parts.m * 100 + parts.d;
  const s = start.m * 100 + start.d;
  const e = end.m * 100 + end.d;
  if (s <= e) return val >= s && val <= e;
  return val >= s || val <= e; // wraps across Dec 31 -> Jan 1
}

// activeSeasonalMark(now, windows?) — the ONE call every UI surface makes.
// Returns the matching row's mark descriptor, or null when no window is
// active (i.e. "render the normal wordmark"). `windows` defaults to the real
// table and is only ever overridden by tests, so they can exercise a
// synthetic wrap-the-new-year row without this module needing a live one.
export function activeSeasonalMark(now = new Date(), windows = SEASONAL_WINDOWS) {
  const parts = siteTodayParts(now); // venue-local (ET) {y, m, d} — never UTC
  for (const w of windows) {
    if (windowContains(parts, w.start, w.end)) return w.mark;
  }
  return null;
}
