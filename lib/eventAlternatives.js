// lib/eventAlternatives.js: where to send someone whose event cannot be bought.
//
// 2026-11-19: a visitor who wanted Mickey's Very Merry Christmas Party (sold
// out for every 2026 night) reached a page that still read like a booking
// page. The sold out event page now says so and offers up to three other
// events the visitor can actually attend: same area, running in the next two
// weeks, not sold out or cancelled, preferring the same kind of outing.
//
// Order is relevance only: shared kind of outing, then distance, then the
// soonest date. Never commission, never a partner deal (owner rule: ranking
// is independent of what Wayfind earns). Free and paid events both qualify.

import { ticketsUnavailable } from "./ticketAvailability.js";
import { haversineMiles } from "./mapLocationTruth.js";

const DAY = 86400000;
// Calendar arithmetic on a site-local "YYYY-MM-DD" (today comes from siteTime);
// noon UTC keeps the add away from any day boundary.
const pad = (n) => String(n).padStart(2, "0");
const addDays = (iso, n) => { const d = new Date(Date.parse(iso + "T12:00:00Z") + n * DAY); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const kinds = (r) => new Set([r.category, r.subcategory, ...(Array.isArray(r.tags) ? r.tags : [])].filter(Boolean).map((t) => String(t).toLowerCase()).filter((t) => !/^(?:wf-|trend-)|^(?:holiday|christmas|family)$/.test(t)));

/**
 * Up to `limit` alternatives for event `e` from `rows` (wf_events shaped).
 * Each: { slug, name, city, miles, start_date, end_date, is_free }.
 */
export function availableAlternatives(e, rows, today, { limit = 3, radiusMiles = 35, windowDays = 14 } = {}) {
  if (!e || !DATE_RX.test(String(today || ""))) return [];
  const until = addDays(today, windowDays);
  const mine = kinds(e);
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.slug || r.event_id === e.event_id || r.slug === e.slug) continue;
    if (r.event_status && r.event_status !== "scheduled") continue;
    if (ticketsUnavailable(r)) continue;
    const start = DATE_RX.test(String(r.start_date || "")) ? r.start_date : null;
    if (!start) continue;
    const end = DATE_RX.test(String(r.end_date || "")) ? r.end_date : start;
    if (end < today || start > until) continue;
    let miles = haversineMiles({ lat: e.lat, lng: e.lng }, { lat: r.lat, lng: r.lng });
    if (miles == null) {
      if (!e.city || String(r.city || "").toLowerCase() !== String(e.city).toLowerCase()) continue;
      miles = null;
    } else if (miles > radiusMiles) continue;
    let shared = 0;
    for (const k of kinds(r)) if (mine.has(k)) shared++;
    out.push({ r, miles, shared, start });
  }
  out.sort((a, b) => (b.shared - a.shared) || ((a.miles ?? radiusMiles) - (b.miles ?? radiusMiles)) || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return out.slice(0, limit).map(({ r, miles }) => ({
    slug: r.slug,
    name: r.short_title || r.event_name || r.slug,
    city: r.city || null,
    miles: miles == null ? null : Math.round(miles),
    start_date: r.start_date || null,
    end_date: r.end_date || null,
    is_free: r.is_free === true,
  }));
}

const fmt = (iso) => new Date(Date.parse(iso + "T12:00:00Z")).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** One link line: "Disney Jollywood Nights · Lake Buena Vista · through Jan 5". */
export function alternativeLabel(a, today) {
  const when = a.start_date && a.start_date > today ? "from " + fmt(a.start_date)
    : a.end_date && a.end_date !== a.start_date ? "through " + fmt(a.end_date)
    : a.start_date ? fmt(a.start_date) : "";
  return [a.name, a.city, when, a.is_free ? "Free" : null].filter(Boolean).join(" · ");
}

/** The sold out notice line. States only what the row says, with its check date. */
export function unavailableNote(e, hasAlternatives = false) {
  const checked = /^\d{4}-\d{2}-\d{2}/.test(String(e?.last_verified_at || "")) ? fmt(String(e.last_verified_at).slice(0, 10)) : null;
  const soldOut = String(e?.event_status || "") === "sold_out" || /sold/i.test(String(e?.ticket_status || ""));
  const head = soldOut ? "Sold out. The organizer lists tickets as sold out" : "Tickets are not on sale right now, per the organizer";
  return head + (checked ? " (checked " + checked + ")" : "") + "." + (hasAlternatives ? " Open nearby in the next two weeks:" : "");
}
