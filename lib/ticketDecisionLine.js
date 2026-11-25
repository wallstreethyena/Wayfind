// lib/ticketDecisionLine.js — the one short line beside a ticket button:
// price, date and (when true) urgency, e.g. "From $25 · Fri, Dec 12".
// PURE: no fetch, no React, no clock (the caller passes `today`).
//
// WHY (owner, 2026-11-25): "I like the price and date up front." A visitor
// should see what it costs and when it is without scrolling back up to the
// facts list. Every part comes from data the row already carries:
//
//   price  only a stated figure or a stated free admission. An unknown price
//          prints NOTHING here (the facts list keeps its honest "check the
//          organiser" wording); a $0 tier is not "free" (lib/eventVisitFacts.js
//          rule of 2026-10-08); a note that says resale, estimate or last
//          year never becomes a number.
//   date   the next date the visitor can go, from the row's own dates.
//   urgency lib/honestUrgency.js, which only speaks from a confirmed last date.
//
// The pieces are joined with " · " and the line is null when there is
// nothing true to print, so the caller renders no empty row.
import { honestUrgency, shortDayLabel } from "./honestUrgency.js";

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const NO_PRICE_RX = /resale|third[\s-]party|unannounced|not announced|not stated|estimate|last year|prior year|coming soon|not yet|tba|tbd/i;

function money(n) {
  if (typeof n === "string" && n.trim() !== "") n = Number(n);
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "";
  return "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));
}

/** "From $25" | "$25" | "Free admission" | null. */
export function ticketPriceShort(e) {
  if (!e || typeof e !== "object") return null;
  const cost = e.visit_cost;
  if (cost && typeof cost === "object") {
    if (cost.free === true) return "Free admission";
    const entry = money(cost.entry);
    if (entry) return cost.from ? `From ${entry}` : entry;
  }
  if (e.admission_offer === "free_admission") return "Free admission";
  if (e.admission_offer) return null; // conditional free tiers keep their full wording elsewhere
  if (e.is_free === true) return "Free admission";
  const lo = money(e.price_min);
  if (lo) {
    const hi = money(e.price_max);
    return hi && Number(e.price_max) > Number(e.price_min) ? `From ${lo}` : lo;
  }
  const p = String(e.price == null ? "" : e.price).trim();
  if (!p || NO_PRICE_RX.test(p)) return null;
  if (/^free$/i.test(p)) return "Free admission";
  // Ticketmaster: "$25" or "$25 to $120" (lib/eventResolve.js). Read the first
  // stated figure only; a range reads "From".
  const m = p.match(/^(?:from\s+)?\$\s?(\d{1,5}(?:\.\d{2})?)(.*)$/i);
  if (!m) return null;
  const first = money(Number(m[1]));
  if (!first) return null;
  return /from/i.test(p) || /\$/.test(m[2]) ? `From ${first}` : first;
}

/** The next date the visitor can go: "Fri, Dec 12" | "Through Sun, Jan 4" | null. */
export function ticketDateShort(e, today) {
  if (!e || typeof e !== "object" || !DATE_RX.test(String(today || ""))) return null;
  const occ = Array.isArray(e.occurrence_dates) ? e.occurrence_dates.filter((d) => DATE_RX.test(String(d))).sort() : [];
  if (occ.length) {
    const next = occ.find((d) => d >= today);
    if (!next) return null;
    return next === today ? "Today" : (occ.length > 1 ? `Next ${shortDayLabel(next)}` : shortDayLabel(next));
  }
  const start = String(e.start_date || e.date || "");
  const end = String(e.end_date || e.endDate || "");
  if (!DATE_RX.test(start)) return null;
  if (start > today) return shortDayLabel(start);
  if (DATE_RX.test(end) && end > start) {
    if (end < today) return null;
    if (e.closing_unannounced === true) return null;
    return `Through ${shortDayLabel(end)}`;
  }
  return start === today ? "Today" : null;
}

/**
 * "From $25 · Fri, Dec 12 · Final weekend", or null.
 * opts.price: a price the surface already shows on its card (Christmas rows use
 * lib/christmasTickets.ticketPrice so the page and the card print the same
 * figure). undefined means "derive it here"; null means "print no price".
 */
export function ticketDecisionLine(e, today, opts = {}) {
  const urgency = honestUrgency(e, today);
  let date = ticketDateShort(e, today);
  // "Last day" already says the date; "Final weekend" says it better than "Through Sun".
  if (urgency && (urgency.kind === "last_day" || /^Through /.test(date || ""))) date = null;
  const price = opts && opts.price !== undefined ? opts.price : ticketPriceShort(e);
  const parts = [price, date, urgency ? urgency.label : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
