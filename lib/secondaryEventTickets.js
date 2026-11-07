// Exact, explicitly reviewed SECONDARY resale paths for curated Florida events.
// Never replace the organiser's verified ticket page with a general venue listing.
// This registry is not a claim of inventory for every date or a paid placement.
import { commerceHref } from "./commerce.js";
import { siteTodayStr } from "./siteTime.js";
import { officialTicketIdentity, secondaryTicketPrimaryMatches } from "./secondaryTicketPrimary.js";

const EXACT_DISCLOSURE = "TicketSmarter resale marketplace for this performance only. Availability, prices and fees vary. We may earn a commission.";
const PARKER = "Lillian S. Wells Hall at The Parker";

const RESALE_CHOICES = Object.freeze({
  "enchant-stpete-2026": Object.freeze({
    provider: "ticketsmarter",
    offerId: "enchant-stpete-ticketsmarter",
    label: "Browse resale tickets",
    via: "TicketSmarter resale marketplace. Dates, prices and fees vary. We may earn a commission.",
    lastDay: "2026-12-27",
  }),
  "a-christmas-carol-orlando-shakes-2026": Object.freeze({
    provider: "ticketsmarter", offerId: "christmas-carol-orlando-nov29-ticketsmarter",
    label: "Check Nov 29, 2 PM resale tickets", via: EXACT_DISCLOSURE, lastDay: "2026-11-29",
    city: "Orlando", venues: ["Margeson Theater, Orlando Shakes", "Margeson Theater at Orlando Shakespeare Center", "Margeson Theatre at Orlando Shakespeare Center"],
    officialUrls: ["https://www.orlandoshakes.org/show/carol26/", "https://orlandoshakes.org/show/carol26/"],
  }),
  "miami-city-ballet-nutcracker-2026": Object.freeze({
    provider: "ticketsmarter", offerId: "miami-nutcracker-dec11-ticketsmarter",
    label: "Check Dec 11, 7 PM resale tickets", via: EXACT_DISCLOSURE, lastDay: "2026-12-11",
    city: "Miami", venues: ["Ziff Ballet Opera House, Adrienne Arsht Center, 1300 Biscayne Blvd", "Ziff Ballet Opera House at Adrienne Arsht Center", "Ziff Ballet Opera House"],
    officialUrls: ["https://www.arshtcenter.org/tickets/2026-2027/miami-city-ballet/miami-city-ballet-george-balanchines-the-nutcracker/", "https://cdnwww.miamicityballet.org/tickets-and-events/202627-season/nutcracker/"],
  }),
  "florida-ballet-nutcracker-orange-park-2026": Object.freeze({
    provider: "ticketsmarter", offerId: "orange-park-nutcracker-dec12-ticketsmarter",
    label: "Check Dec 12, 4:30 PM resale tickets", via: EXACT_DISCLOSURE, lastDay: "2026-12-12",
    city: "Orange Park", venues: ["Thrasher-Horne Center"],
    officialUrls: ["https://thcenter.org/events/the-nutcracker/"],
  }),
  "arts-ballet-nutcracker-parker-2026": Object.freeze({
    provider: "ticketsmarter", offerId: "parker-nutcracker-dec18-ticketsmarter",
    label: "Check Dec 18, 7 PM resale tickets", via: EXACT_DISCLOSURE, lastDay: "2026-12-18",
    city: "Fort Lauderdale", venues: [PARKER],
    officialUrls: ["https://www.parkerplayhouse.com/events/detail/abt-nutcracker-parker-2026"],
  }),
  "celtic-angels-christmas-parker-2026": Object.freeze({
    provider: "ticketsmarter", offerId: "parker-celtic-christmas-dec23-ticketsmarter",
    label: "Check Dec 23, 7 PM resale tickets", via: EXACT_DISCLOSURE, lastDay: "2026-12-23",
    city: "Fort Lauderdale", venues: [PARKER],
    officialUrls: ["https://www.parkerplayhouse.com/events/detail/celtic-angels-christmas-2026-parker"],
    // Followed from the organizer's Buy Tickets link, not a guessed event ID.
    ticketUrls: ["https://www.ticketmaster.com/event/0D0064C2A5C198F3"],
  }),
});

const UNAVAILABLE = new Set(["sold_out", "soldout", "off_sale", "offsale", "cancelled", "canceled", "postponed"]);

export function secondaryEventTicketAction(row, { surface = "event", today = siteTodayStr(), primaryAction } = {}) {
  if (!row || row.is_free === true || row.price_kind === "free" || row.link_ok === false) return null;
  const id = String(row.event_id || row.id || "").replace(/^wfc:/, "");
  const entry = Object.hasOwn(RESALE_CHOICES, id) ? RESALE_CHOICES[id] : null;
  if (!entry) return null;
  const eventStatus = String(row.event_status || "").toLowerCase().replace(/[\s-]+/g, "_");
  const ticketStatus = String(row.ticket_status || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (UNAVAILABLE.has(eventStatus) || UNAVAILABLE.has(ticketStatus)) return null;
  // A secondary option accompanies the real official checkout. No blind resale
  // replacement when a venue's ticket link disappears or changes ownership.
  let official;
  try { official = new URL(String(row.official_ticket_url || "")); } catch { return null; }
  if (id === "enchant-stpete-2026") {
    if (official.protocol !== "https:" || official.hostname !== "www.enchantchristmas.com" ||
        !official.pathname.startsWith("/st-petersburg/") || official.username || official.password || official.port) return null;
  } else {
    const state = String(row.state || "").trim().toUpperCase();
    if (state !== "FL" || row.city !== entry.city || !entry.venues.includes(row.venue)) return null;
    const identity = officialTicketIdentity(official.href);
    const source = officialTicketIdentity(row.official_event_url);
    const reviewedSource = entry.officialUrls.map(officialTicketIdentity);
    const reviewedTicket = (entry.ticketUrls || []).map(officialTicketIdentity);
    if (!identity || (!reviewedSource.includes(identity) && !(reviewedSource.includes(source) && reviewedTicket.includes(identity)))) return null;
    // The event card's run must actually contain this one reviewed performance.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.start_date || "") || row.start_date > entry.lastDay ||
        !/^\d{4}-\d{2}-\d{2}$/.test(row.end_date || "") || row.end_date < entry.lastDay || row.season_undated === true) return null;
    if (Array.isArray(row.occurrence_dates) && row.occurrence_dates.length && !row.occurrence_dates.includes(entry.lastDay)) return null;
  }
  const cutoff = String(today || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) return null;
  if (cutoff && cutoff > entry.lastDay) return null;
  if (String(row.end_date || "") && String(row.end_date) < cutoff) return null;
  const href = commerceHref({ provider: entry.provider, offerId: entry.offerId,
    surface, contentId: id });
  const action = href ? { kind: "affiliate", href, label: entry.label, via: entry.via,
    provider: entry.provider, product: entry.city ? "resale-performance" : "resale-browse",
    eventId: id, officialTicketUrl: official.href } : null;
  return primaryAction !== undefined && !secondaryTicketPrimaryMatches(primaryAction, action) ? null : action;
}
