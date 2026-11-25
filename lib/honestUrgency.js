// lib/honestUrgency.js — urgency words on a ticket card, only when the dates prove them.
// PURE: no fetch, no React, no clock. The caller passes `today` (Eastern,
// lib/siteTime.siteTodayStr) so a server render and a test agree.
//
// WHY (owner, 2026-11-25, conversion pass): "urgency where it's true". A
// visitor deciding between two light shows should learn that one of them ends
// this weekend. A label that is not true costs more trust than it earns, so
// every label here rests on a confirmed last date and nothing else:
//
//   "Last day"        the run's confirmed last date is today
//   "Final weekend"   the confirmed last date is this Fri, Sat or Sun and today
//                     is in that same week, before the last day
//   "Ends Tue, Dec 30" the confirmed last date is within the next 6 days
//
// NEVER:
//   - "Selling fast", "Almost sold out" or any scarcity claim. No partner sends
//     Wayfind a verified inventory signal, so there is nothing to base it on.
//   - a label for a run whose closing date is unannounced (closing_unannounced),
//     an undated season (season_undated), or a single date event (a concert
//     tonight is "tonight", not a "last day": nothing ran before it).
//   - a label for a run that has not opened yet or has already ended.
// Labels are dash free (the Christmas copy rule, scripts/test-christmas-temporal-modes.mjs).

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const URGENCY_ENDS_SOON_DAYS = 6;

function utc(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function daysBetween(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000);
}
function dowOf(iso) {
  return new Date(utc(iso)).getUTCDay();
}
export function shortDayLabel(iso) {
  if (!DATE_RX.test(String(iso || ""))) return "";
  const d = new Date(utc(iso));
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * The run's first and confirmed last date, or null when the dates cannot
 * prove an end. Accepts both curated rows (start_date / end_date /
 * occurrence_dates) and camelCase rows (startDate / endDate).
 */
export function confirmedRun(e) {
  if (!e || typeof e !== "object") return null;
  if (e.season_undated === true || e.closing_unannounced === true) return null;
  const occ = Array.isArray(e.occurrence_dates) ? e.occurrence_dates.filter((d) => DATE_RX.test(String(d))).sort() : [];
  if (occ.length >= 2) return { first: occ[0], last: occ[occ.length - 1] };
  const start = String(e.start_date || e.startDate || "");
  const end = String(e.end_date || e.endDate || "");
  if (!DATE_RX.test(start) || !DATE_RX.test(end) || end <= start) return null;
  return { first: start, last: end };
}

/**
 * @param {object} e   event or seasonal listing
 * @param {string} today  YYYY-MM-DD, Eastern
 * @returns {{kind:"last_day"|"final_weekend"|"ends_soon", label:string, last:string}|null}
 */
export function honestUrgency(e, today) {
  if (!DATE_RX.test(String(today || ""))) return null;
  if (e && /cancel|postpon|sold[\s_-]?out/i.test(String(e.event_status || e.status || "") + " " + String(e.ticket_status || ""))) return null;
  const run = confirmedRun(e);
  if (!run) return null;
  if (run.first > today || run.last < today) return null;
  if (run.last === today) return { kind: "last_day", label: "Last day", last: run.last };
  const days = daysBetween(today, run.last);
  if (days > URGENCY_ENDS_SOON_DAYS) return null;
  const lastDow = dowOf(run.last);
  const todayDow = dowOf(today);
  // Fri (5), Sat (6), Sun (0). Same week: Mon..Sun, so Sunday counts as day 7.
  const weekendEnd = lastDow === 5 || lastDow === 6 || lastDow === 0;
  const pos = (dow) => (dow === 0 ? 7 : dow);
  if (weekendEnd && pos(todayDow) < pos(lastDow) && days < 7) return { kind: "final_weekend", label: "Final weekend", last: run.last };
  return { kind: "ends_soon", label: `Ends ${shortDayLabel(run.last)}`, last: run.last };
}
