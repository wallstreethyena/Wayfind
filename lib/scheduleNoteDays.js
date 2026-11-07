// lib/scheduleNoteDays.js - the days an event ACTUALLY runs, read from its schedule_note,
// conservatively.
//
// wf_events has no column for "which days of the week" or "which dates". A row stores its
// first and last day plus a free-text schedule_note ("Saturdays and Sundays only, November
// 7 through December 6" / "Every Tuesday, 6:30-8:30pm" / "15 select nights only: Nov 7, 14,
// 16 ..." / "Sat 9am-5pm, Sun 11am-5pm; closed weekdays"). The checked-in registries carry
// exact occurrence_dates for some events (lib/eventOccurrences.js) and those always win;
// everything else has only this note.
//
// Law (lib/eventOccurrences.js, lib/fallIntentRails.js): never derive a day from a
// start/end range when the event says it does not run every day. This module only reads
// what the note STATES:
//   1. CADENCE: weekday names used as a schedule. Plural ("Saturdays"), "every Tuesday",
//      a weekday followed by a time ("Sat 9am", "Friday 4 to 8 PM"), a weekday range
//      ("Wednesday to Friday", "Mon-Thu"), "weekends", "weeknights", "daily", "nightly".
//      A weekday followed by a month ("Sat Nov 14", "Saturday, November 14") is a DATE
//      LABEL, not a cadence, and says nothing about the other days.
//   2. CLOSURES: "closed weekdays", "closed Mon/Tue", "closed Nov 16, Nov 30, Dec 7",
//      "closed Thanksgiving". Closed weekdays are removed from the cadence; closed dates
//      are never open.
//   3. AN EXPLICIT DATE LIST: "Nov 7, 14, 16, 21 ... 2026, plus Jan 3 and Jan 5 2027".
//      Only from text outside parentheses and closure clauses, at least three day tokens,
//      and never when the note joins two months with a range ("September 26 - November
//      22" is the envelope, not a list).
// Hints are never promoted to run days: anything inside parentheses, anything after
// "plus"/"except" (for cadence), and a weekday preceded by select/listed/some/certain/not/no.
// A note that signals a restriction without stating it ("select nights", "not every day")
// makes the event UNDATED: the caller must not place it on a day it cannot prove.
const WEEKDAYS = [
  ["sunday", "sundays", "sun"], ["monday", "mondays", "mon"], ["tuesday", "tuesdays", "tue", "tues"],
  ["wednesday", "wednesdays", "wed"], ["thursday", "thursdays", "thu", "thur", "thurs"],
  ["friday", "fridays", "fri"], ["saturday", "saturdays", "sat"],
];
const PLURAL = new Set(["sundays", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays"]);
const DAY_RE = "(?:sun(?:day)?s?|mon(?:day)?s?|tue(?:s(?:day)?)?s?|wed(?:nesday)?s?|thu(?:r(?:s(?:day)?)?)?s?|fri(?:day)?s?|sat(?:urday)?s?)";
const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
const MONTH_RE = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const HINT_WORDS = new Set(["select", "listed", "some", "certain", "not", "no", "most", "occasional"]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ALL7 = [0, 1, 2, 3, 4, 5, 6];

function pad2(n) { return String(n).padStart(2, "0"); }
function dayIndex(word) { return WEEKDAYS.findIndex((names) => names.includes(String(word).toLowerCase().replace(/\.$/, ""))); }
function expandRange(a, b) { const out = []; for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b || out.length > 7) break; } return out; }

/** The note with every parenthetical blanked out (its words are hints, never the schedule). */
function withoutParens(s) { return String(s || "").replace(/\([^)]*\)/g, " "); }

/** Closure clauses: "closed ..." up to except / sentence end / semicolon. */
function closureClauses(note) {
  const s = String(note || "").replace(/[()]/g, " ");
  const out = [];
  const re = /\bclosed\b([^.;]*)/gi;
  let m;
  while ((m = re.exec(s))) out.push(m[1].split(/\bexcept\b/i)[0]);
  return out;
}

/** The note with closure clauses blanked, so their dates never read as open days. */
function withoutClosures(s) { return String(s || "").replace(/\bclosed\b[^.;]*/gi, " "); }

function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Weekday cadence the note states, as a Set (0 = Sunday), or null when it states none.
 * Closures are NOT applied here (see scheduleClosures).
 */
export function scheduleWeekdays(note) {
  let text = withoutClosures(withoutParens(note));
  const cut = text.search(/\bplus\b|\bexcept\b/i);
  if (cut !== -1) text = text.slice(0, cut);
  text = text.toLowerCase();
  if (!text.trim()) return null;
  const days = new Set();
  // "not every day" / "not daily" is a restriction, never a daily cadence.
  if (/(?<!\bnot )\b(daily|nightly|every day|every night|7 days a week|seven days a week)\b/.test(text)) ALL7.forEach((d) => days.add(d));
  if (/\bweekends\b/.test(text)) { days.add(6); days.add(0); }
  if (/\b(weeknights|weekdays)\b/.test(text)) [1, 2, 3, 4, 5].forEach((d) => days.add(d));
  // Ranges first ("Wednesday to Friday", "Mon-Thu", "Friday–Monday"), then blank them out.
  const rangeRe = new RegExp(`(\\b\\w+\\s+)?\\b(${DAY_RE})\\.?\\s*(?:-|–|—|to|through|thru)\\s*(${DAY_RE})\\b`, "gi");
  text = text.replace(rangeRe, (whole, before, a, b) => {
    const prev = (before || "").trim();
    const ia = dayIndex(a), ib = dayIndex(b);
    if (ia !== -1 && ib !== -1 && !HINT_WORDS.has(prev)) expandRange(ia, ib).forEach((d) => days.add(d));
    return (before || "") + " ";
  });
  // Chains of weekday tokens joined by and/&/or. A chain is a cadence when any member is
  // plural, it follows "every", or it is followed by a time; a hint word before it voids it;
  // a month right after it makes it a date label.
  const words = text.replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  for (let i = 0; i < words.length; i++) {
    if (dayIndex(words[i]) === -1) continue;
    const members = [i];
    let j = i + 1;
    while (j + 1 < words.length && /^(and|or|n)$/.test(words[j]) && dayIndex(words[j + 1]) !== -1) { members.push(j + 1); j += 2; }
    const before = words[i - 1] || "";
    const after = words[j] || "";
    const plural = members.some((k) => PLURAL.has(words[k]));
    const timed = /^\d/.test(after) || /^(noon|midnight|open|opens|from|run|runs|hours)$/.test(after);
    const label = MONTHS[after] != null;
    if (!HINT_WORDS.has(before) && !label && (plural || before === "every" || timed)) {
      members.forEach((k) => days.add(dayIndex(words[k])));
    }
    i = j - 1;
  }
  return days.size ? days : null;
}

/** Closed weekdays (Set) and closed ISO dates (Set) the note states. */
export function scheduleClosures(note, fallbackYear) {
  const weekdays = new Set();
  const dates = new Set();
  const year0 = Number(fallbackYear);
  for (const clause of closureClauses(note)) {
    const c = clause.toLowerCase();
    if (/\bweekdays\b/.test(c)) [1, 2, 3, 4, 5].forEach((d) => weekdays.add(d));
    if (/\bweekends\b/.test(c)) [0, 6].forEach((d) => weekdays.add(d));
    const rangeRe = new RegExp(`\\b(${DAY_RE})\\.?\\s*(?:-|–|—|to|through|thru)\\s*(${DAY_RE})\\b`, "gi");
    let rest = c.replace(rangeRe, (w, a, b) => { const ia = dayIndex(a), ib = dayIndex(b); if (ia !== -1 && ib !== -1) expandRange(ia, ib).forEach((d) => weekdays.add(d)); return " "; });
    // A weekday followed by a month is a date label ("closed Sun Nov 16"): the date carries it.
    const tokens = rest.replace(/[^a-z0-9]+/g, " ").trim().split(" ");
    for (let i = 0; i < tokens.length; i++) {
      const d = dayIndex(tokens[i]);
      if (d !== -1 && MONTHS[tokens[i + 1]] == null) weekdays.add(d);
    }
    if (Number.isInteger(year0)) {
      for (const iso of scheduleExplicitDays(rest, year0, { minTokens: 1, allowInClosure: true }) || []) dates.add(iso);
      if (/\bthanksgiving\b/.test(c)) dates.add(nthWeekdayOfMonth(year0, 11, 4, 4));
      if (/\bchristmas( day)?\b/.test(c)) dates.add(`${year0}-12-25`);
      if (/\bnew year'?s( day)?\b/.test(c)) dates.add(`${year0 + 1}-01-01`);
    }
  }
  return { weekdays, dates };
}

/**
 * Explicit dates the note lists, as sorted ISO days, or null. Reads "Nov 7, 14, 16 and
 * Dec 5, 7 ... 2026, plus Jan 3 and Jan 5 2027": a month token starts a group whose bare
 * numbers are days of that month; a 4 digit year closes and dates its group; a month
 * earlier than the previous group's month with no year rolls into the next year. Text in
 * parentheses and in closure clauses is ignored; at least `minTokens` (default 3) day
 * tokens are required; a range joining two months makes the whole note an envelope (null).
 */
export function scheduleExplicitDays(note, fallbackYear, { minTokens = 3, allowInClosure = false } = {}) {
  let raw = withoutParens(note);
  if (!allowInClosure) raw = withoutClosures(raw);
  raw = raw.toLowerCase();
  const year0 = Number(fallbackYear);
  if (!Number.isInteger(year0)) return null;
  // "September 26 - November 22", "Sept. 12 - Nov. 7", "Nov 28 through Dec 2": an envelope.
  const crossRange = new RegExp(`\\b${MONTH_RE}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?(?:\\s*\\d{4})?\\s*(?:-|–|—|to|through|thru|until)\\s*${MONTH_RE}\\b`, "i");
  if (crossRange.test(raw)) return null;
  // Clock times ("7:30pm", "12:30 am", "10 AM") are never days: drop them first.
  const s = raw
    // "6-10pm", "10am-5pm", "4 to 8 PM": the start of a time range is a time too.
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|noon|midnight)/g, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1");
  const tokens = s.replace(/[^a-z0-9]+/g, " ").trim().split(" ");
  const groups = [];
  let cur = null;
  for (const t of tokens) {
    if (MONTHS[t] != null) { cur = { month: MONTHS[t], days: [], year: null }; groups.push(cur); continue; }
    if (/^\d{4}$/.test(t) && cur) { const y = Number(t); if (y >= 2000 && y <= 2100) cur.year = y; cur = null; continue; }
    if (/^\d{1,2}$/.test(t) && cur) { const d = Number(t); if (d >= 1 && d <= 31) cur.days.push(d); continue; }
    if (cur && !/^(and|to|through|thru|only|select|nights|dates|plus|the|on)$/.test(t)) cur = null; // prose breaks a group
  }
  const total = groups.reduce((n, g) => n + g.days.length, 0);
  if (total < minTokens) return null;
  const firstStated = groups.findIndex((g) => g.year != null);
  let lastYear = null, lastMonth = null;
  const out = [];
  groups.forEach((g, i) => {
    let y = g.year;
    if (y == null) {
      if (firstStated > i) {
        const fy = groups[firstStated].year;
        y = g.month > groups[firstStated].month ? fy - 1 : fy;
      } else if (lastYear == null) y = year0;
      else y = g.month < lastMonth ? lastYear + 1 : lastYear;
    }
    for (const d of g.days) out.push(`${y}-${pad2(g.month)}-${pad2(d)}`);
    lastYear = y; lastMonth = g.month;
  });
  const days = [...new Set(out)].filter((d) => ISO_DAY.test(d) && addDays(d, 0) === d /* a real calendar day: "Feb 30" does not round-trip */).sort();
  return days.length ? days : null;
}

/** True when the note says the event does not run every day but does not say which days. */
export function signalsRestriction(note) {
  return /\bselect (nights|dates|days|evenings|weekends)\b|\bnot every day\b|\bnot a continuous run\b|\bdates vary\b|\bcheck (the |their )?calendar\b/i.test(String(note || ""));
}

/**
 * The schedule rule for a row, from its note:
 *   { kind: "list", days }                      explicit dates
 *   { kind: "weekdays", weekdays, closedDates } a cadence narrower than every day
 *   { kind: "restricted" , closedDates }        restricted, days not stated: undated
 *   { kind: "open", closedDates }               no restriction stated
 * select_nights rows with no stated days are "restricted".
 */
export function scheduleRule(row) {
  const start = String(row?.start_date || "");
  const year0 = Number(start.slice(0, 4));
  const note = row?.schedule_note || "";
  const closures = scheduleClosures(note, year0);
  const list = scheduleExplicitDays(note, year0);
  let wd = scheduleWeekdays(note);
  // A list wins only when it IS the schedule: no cadence at all ("15 select nights: Nov 7,
  // 14, 16 ..."), or every listed date falls on the cadence ("Nov 7 to 8, 14 to 15 ... Sat
  // and Sun"). A list that contradicts the cadence is a hint ("night maze Fri Oct 23 & 30"
  // beside "Sat ... Sun ..."), and the cadence rules.
  if (list && (!wd || list.every((d) => wd.has(dowOf(d))))) {
    return { kind: "list", days: list.filter((d) => !closures.dates.has(d)), closedDates: closures.dates };
  }
  if (closures.weekdays.size) wd = new Set([...(wd || ALL7)].filter((d) => !closures.weekdays.has(d)));
  if (wd && wd.size && wd.size < 7) return { kind: "weekdays", weekdays: wd, closedDates: closures.dates };
  if (wd && wd.size === 7) return { kind: "open", closedDates: closures.dates };
  if (row?.select_nights || signalsRestriction(note)) return { kind: "restricted", closedDates: closures.dates };
  return { kind: "open", closedDates: closures.dates };
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
 * The first day in [from, to] (inclusive, ISO) on which the row is open according to its
 * note and its start/end envelope, or null. A "restricted" row counts only on its opening
 * day (the one day the record proves); an "open" row counts every day not closed.
 */
export function nextOpenDay(row, from, to) {
  if (!row || !ISO_DAY.test(String(from)) || !ISO_DAY.test(String(to)) || from > to) return null;
  const start = ISO_DAY.test(String(row.start_date || "")) ? row.start_date : null;
  const end = ISO_DAY.test(String(row.end_date || "")) ? row.end_date : start;
  if (!start) return null;
  const lo = from > start ? from : start;
  const hi = end && end < to ? end : to;
  if (lo > hi) return null;
  const rule = scheduleRule(row);
  const closed = rule.closedDates || new Set();
  if (rule.kind === "list") return rule.days.find((d) => d >= lo && d <= hi) || null;
  if (rule.kind === "restricted") return start >= lo && start <= hi && !closed.has(start) ? start : null;
  for (let d = lo; d <= hi; d = addDays(d, 1)) {
    if (closed.has(d)) continue;
    if (rule.kind === "weekdays" && !rule.weekdays.has(dowOf(d))) continue;
    return d;
  }
  return null;
}

/** Back-compat name: select-nights callers. Same rule as nextOpenDay, never the envelope. */
export function nextScheduledDay(row, from, to) {
  const rule = scheduleRule({ ...row, select_nights: true });
  if (rule.kind === "open") return null; // a select row whose note names every day still proves nothing
  return nextOpenDay({ ...row, select_nights: true }, from, to);
}

/**
 * The rule in a small JSON shape for client surfaces (the Events tab day strip), so they
 * apply the same note reading without shipping this parser:
 *   null                              open every day, nothing closed (the envelope is right)
 *   { k: "w", d: [0..6], x: [iso] }   only these weekdays, minus closed dates
 *   { k: "r", x: [iso] }              restricted, days unknown: opening day only
 *   { k: "o", x: [iso] }              every day except the closed dates
 *   { k: "l", days: [iso] }           exactly these days
 */
export function compactDayRule(row) {
  if (!row) return null;
  const r = scheduleRule(row);
  const x = [...(r.closedDates || [])].sort();
  if (r.kind === "list") return { k: "l", days: r.days };
  if (r.kind === "weekdays") return { k: "w", d: [...r.weekdays].sort(), x };
  if (r.kind === "restricted") return { k: "r", x };
  return x.length ? { k: "o", x } : null;
}

/** True when a compact rule (above) lets the event run on `day`, given its first day `start`. */
export function compactRuleAllows(rule, day, start) {
  if (!rule) return true;
  if (rule.k === "l") return Array.isArray(rule.days) && rule.days.includes(day);
  if (Array.isArray(rule.x) && rule.x.includes(day)) return false;
  if (rule.k === "r") return day === start;
  if (rule.k === "w") return Array.isArray(rule.d) && rule.d.includes(dowOf(day));
  return true;
}

