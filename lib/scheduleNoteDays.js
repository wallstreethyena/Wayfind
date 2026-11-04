// lib/scheduleNoteDays.js - the days a select-nights event ACTUALLY runs, read from its
// schedule_note, conservatively.
//
// wf_events has no column for "which days of the week" or "which dates". A select-nights
// row stores its first and last day plus a free-text schedule_note ("Saturdays and
// Sundays only, November 7 through December 6" / "Every Tuesday, 6:30-8:30pm" /
// "15 select nights only: Nov 7, 14, 16, 21 ..."). The checked-in fall registries carry
// exact occurrence_dates for a few events (lib/eventOccurrences.js); everything else
// has only this note.
//
// Law (lib/eventOccurrences.js, lib/fallIntentRails.js): never derive a day from a
// start/end range, and an ongoing select-dates event without a calendar is never
// "today". This module only reads what the note STATES, in two explicit shapes:
//   1. weekday names: "Saturdays and Sundays", "Sat and Sun", "Every Tuesday",
//      "Fridays 10am-5pm, Saturdays ...", "Weekends". Each named day is a run day.
//   2. an explicit date list: "Nov 7, 14, 16, 21, 23, 28 and Dec 5, 7 ... 2026, plus
//      Jan 3 and Jan 5 2027". Each listed date is a run day.
// A note that says only "select nights" or "select dates" with neither shape yields null:
// the event stays undated and the caller must not place it on a day.
//
// Two deliberate limits. Weekday hints inside a parenthetical or after "plus"/"except"
// ("plus select Fridays and Mondays 10am-2pm (Fridays Oct 2, 9 ...)") are NOT promoted to
// run days: only the weekday names before the first "plus" / "except" / "(" count, and a
// weekday followed by "select" is skipped. Date lists are only read from notes that
// contain at least three "Mon D" tokens, so "closes Nov 8" is not mistaken for a list.
const WEEKDAYS = [
  ["sunday", "sundays", "sun"], ["monday", "mondays", "mon"], ["tuesday", "tuesdays", "tue", "tues"],
  ["wednesday", "wednesdays", "wed"], ["thursday", "thursdays", "thu", "thur", "thurs"],
  ["friday", "fridays", "fri"], ["saturday", "saturdays", "sat"],
];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n) { return String(n).padStart(2, "0"); }

/** The head of the note where the primary cadence lives: before "plus", "except" or "(". */
function primaryClause(note) {
  const s = String(note || "");
  const cut = s.search(/\(|\bplus\b|\bexcept\b|\bclosed\b/i);
  return cut === -1 ? s : s.slice(0, cut);
}

/**
 * Set of weekday numbers (0 = Sunday) the note names as run days, or null when the note
 * names none. "Weekends" means Saturday and Sunday. "Daily"/"every day" means all seven.
 */
export function scheduleWeekdays(note) {
  const head = primaryClause(note).toLowerCase();
  if (!head.trim()) return null;
  const days = new Set();
  if (/\b(daily|every day|7 days a week)\b/.test(head)) for (let d = 0; d < 7; d++) days.add(d);
  if (/\bweekends?\b/.test(head)) { days.add(6); days.add(0); }
  const words = head.replace(/[^a-z0-9]+/g, " ").split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const idx = WEEKDAYS.findIndex((names) => names.includes(w));
    if (idx === -1) continue;
    // "select Fridays" is a hint about SOME Fridays, not a cadence.
    if (words[i - 1] === "select") continue;
    days.add(idx);
  }
  return days.size ? days : null;
}

/**
 * Explicit dates the note lists, as sorted ISO days, or null. Reads "Nov 7, 14, 16 and
 * Dec 5, 7 ... 2026, plus Jan 3 and Jan 5 2027": a month token starts a group whose bare
 * numbers are days of that month; a 4 digit year after a group dates the group; groups
 * with no year take `fallbackYear`, and a month earlier than the previous group's month
 * with no year of its own rolls into the next year. Requires at least three "Mon D" day
 * tokens in total so a prose mention of a single date is never read as a calendar.
 */
export function scheduleExplicitDays(note, fallbackYear) {
  // Clock times ("7:30pm", "12:30 am", "10 AM", "noon") are never days: drop them first.
  const s = String(note || "").toLowerCase()
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1");
  const year0 = Number(fallbackYear);
  if (!Number.isInteger(year0)) return null;
  const tokens = s.replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  const groups = [];
  let cur = null;
  for (const t of tokens) {
    if (MONTHS[t] != null) { cur = { month: MONTHS[t], days: [], year: null }; groups.push(cur); continue; }
    // A year closes its group: whatever follows belongs to a new month token or to prose.
    if (/^\d{4}$/.test(t) && cur) { const y = Number(t); if (y >= 2000 && y <= 2100) cur.year = y; cur = null; continue; }
    if (/^\d{1,2}$/.test(t) && cur) { const d = Number(t); if (d >= 1 && d <= 31) cur.days.push(d); continue; }
    if (cur && !/^(and|to|through|thru|only|select|nights|dates|plus|the)$/.test(t)) cur = null; // prose breaks a group
  }
  const total = groups.reduce((n, g) => n + g.days.length, 0);
  if (total < 3) return null;
  // Assign years: a stated year applies to its group and every earlier unstated group; an
  // unstated group after a stated one inherits it, rolling forward when the month drops.
  let lastYear = null, lastMonth = null;
  const out = [];
  for (const g of groups) {
    let y = g.year;
    if (y == null) {
      if (lastYear == null) y = year0;
      else y = g.month < lastMonth ? lastYear + 1 : lastYear;
    }
    for (const d of g.days) out.push(`${y}-${pad2(g.month)}-${pad2(d)}`);
    lastYear = y; lastMonth = g.month;
  }
  // A stated year late in the note ("... Dec 23 2026, plus Jan 3 and Jan 5 2027") must also
  // date the earlier unstated groups: rebuild with backward propagation when needed.
  const firstStated = groups.findIndex((g) => g.year != null);
  if (firstStated > 0) {
    const y = groups[firstStated].year;
    for (let i = 0; i < firstStated; i++) {
      const g = groups[i];
      const yy = g.month > groups[firstStated].month ? y - 1 : y;
      for (const d of g.days) {
        const wrong = `${year0}-${pad2(g.month)}-${pad2(d)}`;
        const k = out.indexOf(wrong);
        if (k !== -1) out[k] = `${yy}-${pad2(g.month)}-${pad2(d)}`;
      }
    }
  }
  const days = [...new Set(out)].filter((d) => ISO_DAY.test(d) && !Number.isNaN(Date.parse(d))).sort();
  return days.length ? days : null;
}

function dowOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * The first day in [from, to] (inclusive, ISO) on which a select-nights row runs,
 * according to its note and its start/end envelope, or null when the note does not
 * state its days. Explicit date lists win over weekday names.
 */
export function nextScheduledDay(row, from, to) {
  if (!row || !ISO_DAY.test(String(from)) || !ISO_DAY.test(String(to)) || from > to) return null;
  const start = ISO_DAY.test(String(row.start_date || "")) ? row.start_date : null;
  const end = ISO_DAY.test(String(row.end_date || "")) ? row.end_date : start;
  if (!start) return null;
  const lo = from > start ? from : start;
  const hi = end && end < to ? end : to;
  if (lo > hi) return null;
  const explicit = scheduleExplicitDays(row.schedule_note, Number(String(start).slice(0, 4)));
  if (explicit) return explicit.find((d) => d >= lo && d <= hi) || null;
  const weekdays = scheduleWeekdays(row.schedule_note);
  if (!weekdays) return null;
  for (let d = lo; d <= hi; d = addDays(d, 1)) if (weekdays.has(dowOf(d))) return d;
  return null;
}
