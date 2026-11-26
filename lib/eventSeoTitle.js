// lib/eventSeoTitle.js: the Google title for an event page.
//
// 2026-11-20 SEO engine audit: event pages bring 3 of every 4 free search
// visitors (1,317 of about 1,700 sessions in 28 days), mostly for FREE local
// events (tree lightings, boat parades, Kris Kringle Village). Every title
// said "Dates, Tickets & What to Know", so a searcher looking for a free tree
// lighting saw "Tickets" and no date. The title now leads with what that
// searcher wants: the date, and "Free" when entry is free. Only facts the row
// carries: no date, no date in the title; unknown price, no price word; no
// start time on the row, no time in the title.
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

// "17:30:00" -> "5:30 PM", "18:00" -> "6 PM". Anything else -> null (never guessed).
export function eventSeoTime(t) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(t || "").trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${min ? ":" + String(min).padStart(2, "0") : ""} ${h < 12 ? "AM" : "PM"}`;
}

export function eventIsFree(e) {
  if (!e) return false;
  return e.is_free === true || e.price_kind === "free" || e.admission_offer === "free_admission";
}

// SEARCH LEADS (SEO engine 2026-11-26). Some events are searched by the
// town's season words, not the event's own name: "celebration fl christmas"
// is about 1,900 US searches a month (Ubersuggest, low difficulty) while
// "now snowing celebration" is about 320. For those slugs the title leads with
// the searched words, then a short event name, then the row's own dates and
// Free. The lead must name the row's own city (checked below), so a lead can
// never put one town's words on another town's event. Watchlist and sold out
// rows keep their honest titles.
export const EVENT_SEARCH_LEADS = {
  "celebration-now-snowing-2026": { lead: "Celebration FL Christmas", name: "Now Snowing", keyword: "celebration fl christmas", volume: 1900 },
};

export function eventSearchLead(e) {
  const hit = e && EVENT_SEARCH_LEADS[e.slug];
  if (!hit) return null;
  const city = String(e.city || "").trim().toLowerCase();
  if (!city || !hit.lead.toLowerCase().includes(city)) return null;
  return hit;
}

export function eventSeoTitle(e) {
  if (!e) return "";
  const base = eventTitleWithYear(e.event_name, e.year);
  if (e.christmas_watchlist) return `${base}: Dates & What to Know`;
  if (ticketsUnavailable(e) && (e.ticket_status || e.event_status)) return `${base}: Sold Out, Dates & Nearby Options`;
  const lead = eventSearchLead(e);
  const year = /^\d{4}$/.test(String(e.year || "")) ? String(e.year) : (ISO.exec(String(e.start_date || "")) || [])[1];
  if (lead && year) {
    const range = eventSeoDates(e);
    const head = `${lead.lead} ${year}: ${lead.name}`;
    const withDates = range ? `${head}, ${range}` : head;
    if (eventIsFree(e)) return `${withDates}, Free`;
    if (e.admission_offer === "free_admission_paid_activities") return `${withDates}, Free Entry`;
    return withDates;
  }
  // 2026-11-25 (owner, Search Console): a one night event (a parade, a tree
  // lighting) adds its start time, the next thing the searcher wants. A run of
  // several dates keeps the range only: one time would not fit every night.
  const range = eventSeoDates(e);
  const time = range && !/ to /.test(range) ? eventSeoTime(e.start_time) : null;
  const dates = range && time ? `${range}, ${time}` : range;
  const city = String(e.city || "").trim();
  const inCity = city && !base.toLowerCase().includes(city.toLowerCase()) ? ` in ${city}` : "";
  const when = dates ? `${dates}${inCity}` : (inCity ? inCity.trim().replace(/^in /, "") : "Dates");
  if (eventIsFree(e)) return `${base}: ${when}, Free`;
  if (e.admission_offer === "free_admission_paid_activities") return `${base}: ${when}, Free Entry`;
  const paid = e.is_free === false || Number(e.price_min) > 0 || e.price_kind === "from" || e.price_kind === "paid";
  return paid ? `${base}: ${when}, Tickets & Times` : `${base}: ${when}, Times & Details`;
}
