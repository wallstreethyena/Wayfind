// lib/eventSeoTitle.js: the Google title for an event page.
//
// 2026-11-20 SEO engine audit: event pages bring 3 of every 4 free search
// visitors (1,317 of about 1,700 sessions in 28 days), mostly for FREE local
// events (tree lightings, boat parades, Kris Kringle Village). Every title
// said "Dates, Tickets & What to Know", so a searcher looking for a free tree
// lighting saw "Tickets" and no date. The title now leads with what that
// searcher wants: the date, and "Free" when entry is free. Only facts the row
// carries: no date, no date in the title; unknown price, no price word.
import { eventTitleWithYear } from "./eventTitle.js";
import { ticketsUnavailable } from "./ticketAvailability.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function shortDate(iso) {
  const m = ISO.exec(String(iso || ""));
  if (!m) return null;
  const mo = Number(m[2]), d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${MONTHS[mo - 1]} ${d}` : null;
}

export function eventSeoDates(e) {
  const a = shortDate(e && e.start_date), b = shortDate(e && e.end_date);
  if (!a) return null;
  if (!b || b === a) return a;
  return `${a} to ${b}`;
}

export function eventIsFree(e) {
  if (!e) return false;
  return e.is_free === true || e.price_kind === "free" || e.admission_offer === "free_admission";
}

export function eventSeoTitle(e) {
  if (!e) return "";
  const base = eventTitleWithYear(e.event_name, e.year);
  if (e.christmas_watchlist) return `${base}: Dates & What to Know`;
  if (ticketsUnavailable(e) && (e.ticket_status || e.event_status)) return `${base}: Sold Out, Dates & Nearby Options`;
  const dates = eventSeoDates(e);
  const city = String(e.city || "").trim();
  const inCity = city && !base.toLowerCase().includes(city.toLowerCase()) ? ` in ${city}` : "";
  const when = dates ? `${dates}${inCity}` : (inCity ? inCity.trim().replace(/^in /, "") : "Dates");
  if (eventIsFree(e)) return `${base}: ${when}, Free`;
  if (e.admission_offer === "free_admission_paid_activities") return `${base}: ${when}, Free Entry`;
  const paid = e.is_free === false || Number(e.price_min) > 0 || e.price_kind === "from" || e.price_kind === "paid";
  return paid ? `${base}: ${when}, Tickets & Times` : `${base}: ${when}, Times & Details`;
}
