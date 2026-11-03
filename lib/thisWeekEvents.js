// lib/thisWeekEvents.js - PURE data for the homepage "This week in Florida" strip.
//
// Audit 2026-11-03: this week's curated events (SAVOR, Siesta Key Crystal Classic,
// Sarasota Medieval Fair, Festival of the Skeletons) had /florida-events pages but were
// invisible on the homepage. The strip links straight to those pages.
//
// Two separate decisions, kept apart on purpose (owner, 2026-11-03):
//
//   ELIGIBILITY  "Does this event have a real, valid occurrence inside the window?"
//                Answered by thisWeekOccurrence(): the event's own day list, its
//                schedule note, its start/end envelope and its end time, all in
//                America/New_York. Age alone never disqualifies: a seasonal attraction
//                that opened in August and is open today HAS an occurrence today.
//
//   RANKING      "Among the eligible, which are the most useful to show?"
//                Answered by thisWeekRank(): dated events before season-long runs, an
//                editorial assessment where one exists, a neutral prior where one does
//                not (never assessed is not the same as assessed low), then the age of
//                a run as a tie breaker. Cards are dealt one per day across the window
//                so the weekend is never crowded out by a busy Tuesday.
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
import { occurrenceDatesFor } from "./eventOccurrences.js";
import { nextScheduledDay } from "./scheduleNoteDays.js";
import { siteHourFloat } from "./nowContext.js";
import { ASSESSMENT_PRIORS, assessedScore, isAssessed as isAssessedRow } from "./eventAssessment.js";

// "This week" means the next seven days: today plus six. The heading says "This week",
// so the window must not quietly reach into the week after.
export const THIS_WEEK_WINDOW_DAYS = 6;
export const THIS_WEEK_MAX = 10; // seven days, every day gets its best event, three more
export const THIS_WEEK_MIN = 2;
// A continuous run longer than this is a season (Epcot Food and Wine, a farm's fall
// weekends), not a dated event. Seasons stay ELIGIBLE while they are open; the cap only
// decides their rank.
export const THIS_WEEK_MAX_RUN_DAYS = 30;
// The neutral prior for a row no editorial pass has reached (lib/eventAssessment.js).
export const UNASSESSED_SCORE_PRIOR = ASSESSMENT_PRIORS.editorial_score;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Pure calendar math on YYYY-MM-DD strings (no timezone involved). */
export function addDaysStr(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
}

/**
 * "HH:MM" in America/New_York for `now`, so an end time on the last day is compared in ET.
 * The hour has ONE source in this app (lib/nowContext.js siteHourFloat); this only formats it.
 */
export function siteClockStr(now = new Date()) {
  const h = siteHourFloat(now);
  if (!Number.isFinite(h)) return null;
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
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

const runDays = (e) => (ISO_DAY.test(String(e.end_date || "")) && ISO_DAY.test(String(e.start_date || ""))
  ? Math.round((Date.parse(e.end_date) - Date.parse(e.start_date)) / 86400000) : 0);

/**
 * ELIGIBILITY. The first day in [today, today + THIS_WEEK_WINDOW_DAYS] on which `e` has a
 * real occurrence, or null. Rules, in order:
 *   1. Trust and Florida gates (same as the hub). Rows whose status is not displayable
 *      (cancelled, postponed, unannounced) never get a day.
 *   2. The envelope: start on or before the last window day, end on or after today.
 *   3. An exact day list (the row's own occurrence_dates or the checked-in registry) wins:
 *      the first listed day inside the window and the envelope.
 *   4. A select-nights row with no list uses what its schedule note STATES (weekday names
 *      or an explicit date list, lib/scheduleNoteDays.js). A note that states neither only
 *      counts on its opening day: an ongoing select-dates run without a calendar is never
 *      "today" (lib/fallIntentRails.js law).
 *   5. A continuous run counts on max(start, today).
 *   6. On its final day, an event whose end_time has already passed in ET is over. End
 *      times are compared only when they read as same-day (after the start time); a run
 *      ending "01:00" is not cut at 01:00 the previous evening.
 */
export function thisWeekOccurrence(e, today, { last = addDaysStr(today, THIS_WEEK_WINDOW_DAYS), clock = null } = {}) {
  if (!e || !e.slug || !isTrusted(e) || !isFloridaEvent(e)) return null;
  const start = String(e.start_date || "");
  const end = String(e.end_date || e.start_date || "");
  if (!ISO_DAY.test(start) || !ISO_DAY.test(end) || end < today || start > last) return null;
  let day = null;
  const listed = occurrenceDatesFor(e);
  if (listed) {
    day = listed.find((d) => d >= today && d <= last && d >= start && d <= end) || null;
  } else if (e.select_nights) {
    day = nextScheduledDay(e, today, last);
    if (!day && start >= today) day = start; // the opening day is a real occurrence
  } else {
    day = start < today ? today : start;
  }
  if (!day) return null;
  if (day === today && end === today && clock && e.end_time) {
    const endHM = String(e.end_time).slice(0, 5);
    const startHM = e.start_time ? String(e.start_time).slice(0, 5) : null;
    const sameDayEnd = /^\d{2}:\d{2}$/.test(endHM) && (!startHM || endHM > startHM);
    if (sameDayEnd && endHM <= clock) return null;
  }
  return day;
}

/** The score used for ranking: the editorial assessment, or the neutral prior when none exists. */
export function rankingScore(e) { return assessedScore(e, "editorial_score"); }

/** True when the row is assessed, false when it still carries the default 0 / null. */
export function isAssessed(e) { return isAssessedRow(e, "editorial_score"); }

/**
 * RANKING within one day. Negative means `a` first.
 *   1. Dated events (a run of THIS_WEEK_MAX_RUN_DAYS or less, or a row with an exact day
 *      list) before season-long runs.
 *   2. rankingScore desc (assessed value, else the neutral prior); at an equal score the
 *      assessed row first.
 *   3. Age: the run that started more recently first (a season open since August ranks
 *      after one that opened last week).
 *   4. Source tier (an organizer-verified row before a press-verified one), a row with a
 *      real photo before one without, then slug for a stable order.
 */
export function thisWeekRank(a, b, today) {
  const seasonA = runDays(a) > THIS_WEEK_MAX_RUN_DAYS && !occurrenceDatesFor(a);
  const seasonB = runDays(b) > THIS_WEEK_MAX_RUN_DAYS && !occurrenceDatesFor(b);
  if (seasonA !== seasonB) return seasonA ? 1 : -1;
  const sd = rankingScore(b) - rankingScore(a);
  if (sd !== 0) return sd;
  // Same score: a real assessment outranks the prior it happens to equal.
  if (isAssessed(a) !== isAssessed(b)) return isAssessed(a) ? -1 : 1;
  const ageA = a.start_date < today ? Math.round((Date.parse(today) - Date.parse(a.start_date)) / 86400000) : 0;
  const ageB = b.start_date < today ? Math.round((Date.parse(today) - Date.parse(b.start_date)) / 86400000) : 0;
  if (ageA !== ageB) return ageA - ageB;
  const tier = (Number(a.source_tier) || 9) - (Number(b.source_tier) || 9);
  if (tier !== 0) return tier;
  const photo = (b.hero_image ? 1 : 0) - (a.hero_image ? 1 : 0);
  if (photo !== 0) return photo;
  return String(a.slug).localeCompare(String(b.slug));
}

/**
 * The strip's cards. Pure: rows in, up to THIS_WEEK_MAX plain cards out, or [] when fewer
 * than THIS_WEEK_MIN qualify. Each eligible row is placed on the day of its first
 * occurrence in the window (thisWeekOccurrence). Cards are dealt one day at a time across
 * the window, best first within a day (thisWeekRank), then a second round, so every day
 * that has an event gets its best one before any day gets its second. Days with nothing
 * eligible are simply skipped, never padded. One card per event_series_id.
 */
export function thisWeekEventCards(rows, today = siteTodayStr(), { now = null } = {}) {
  if (!ISO_DAY.test(String(today || ""))) throw new Error("thisWeekEventCards requires an Eastern calendar date");
  const last = addDaysStr(today, THIS_WEEK_WINDOW_DAYS);
  const clock = now ? siteClockStr(now) : null;
  const placed = [];
  for (const e of Array.isArray(rows) ? rows : []) {
    const day = thisWeekOccurrence(e, today, { last, clock });
    if (day) placed.push({ e, day });
  }
  const queues = new Map();
  for (const p of placed) {
    if (!queues.has(p.day)) queues.set(p.day, []);
    queues.get(p.day).push(p.e);
  }
  const days = [...queues.keys()].sort();
  for (const d of days) queues.get(d).sort((a, b) => thisWeekRank(a, b, today));
  const dealt = [];
  for (let round = 0; dealt.length < placed.length; round++) {
    for (const d of days) { const q = queues.get(d); if (round < q.length) dealt.push({ e: q[round], day: d }); }
  }
  const seen = new Set();
  const cards = [];
  for (const { e, day } of dealt) {
    const series = e.event_series_id || null;
    if (series) { if (seen.has(series)) continue; seen.add(series); }
    cards.push({
      slug: e.slug,
      href: "/florida-events/" + e.slug,
      name: e.short_title || e.event_name,
      city: e.city,
      when: thisWeekDateLabel(e),
      day,
      image: e.hero_image || eventVenueImageSrc(e) || "",
    });
    if (cards.length >= THIS_WEEK_MAX) break;
  }
  return cards.length >= THIS_WEEK_MIN ? cards : [];
}
