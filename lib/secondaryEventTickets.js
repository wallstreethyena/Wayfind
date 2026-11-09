// Exact, explicitly reviewed SECONDARY resale paths for curated Florida events.
// Never replace the organiser's verified ticket page with a general venue listing.
// This registry is not a claim of inventory for every date or a paid placement.
import { commerceHref } from "./commerce.js";
import { siteTodayStr } from "./siteTime.js";
import { officialTicketIdentity, secondaryTicketPrimaryMatches } from "./secondaryTicketPrimary.js";

const EXACT_DISCLOSURE = "TicketSmarter resale marketplace for this performance only. Availability, prices and fees vary. We may earn a commission.";
const PARKER = "Lillian S. Wells Hall at The Parker";
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
// Every Enchant night listed on the Tropicana Field page 2026-11-09, through
// the card's last day. Each offer is that night's ticket listing, never the
// venue page. A card that names one date uses that night. A range uses the
// nearest upcoming night. A night with no listing gets no resale button.
const ENCHANT_DATED = Object.freeze([
  Object.freeze({ day: "2026-11-20", offerId: "enchant-stpete-nov20-ticketsmarter", label: "Check Nov 20 resale tickets" }),
  Object.freeze({ day: "2026-11-21", offerId: "enchant-stpete-nov21-ticketsmarter", label: "Check Nov 21 resale tickets" }),
  Object.freeze({ day: "2026-11-22", offerId: "enchant-stpete-nov22-ticketsmarter", label: "Check Nov 22 resale tickets" }),
  Object.freeze({ day: "2026-11-25", offerId: "enchant-stpete-nov25-ticketsmarter", label: "Check Nov 25 resale tickets" }),
  Object.freeze({ day: "2026-11-27", offerId: "enchant-stpete-nov27-ticketsmarter", label: "Check Nov 27 resale tickets" }),
  Object.freeze({ day: "2026-11-28", offerId: "enchant-stpete-nov28-ticketsmarter", label: "Check Nov 28 resale tickets" }),
  Object.freeze({ day: "2026-11-29", offerId: "enchant-stpete-nov29-ticketsmarter", label: "Check Nov 29 resale tickets" }),
  Object.freeze({ day: "2026-12-01", offerId: "enchant-stpete-dec1-ticketsmarter", label: "Check Dec 1 resale tickets" }),
  Object.freeze({ day: "2026-12-02", offerId: "enchant-stpete-dec2-ticketsmarter", label: "Check Dec 2 resale tickets" }),
  Object.freeze({ day: "2026-12-03", offerId: "enchant-stpete-dec3-ticketsmarter", label: "Check Dec 3 resale tickets" }),
  Object.freeze({ day: "2026-12-04", offerId: "enchant-stpete-dec4-ticketsmarter", label: "Check Dec 4 resale tickets" }),
  Object.freeze({ day: "2026-12-05", offerId: "enchant-stpete-dec5-ticketsmarter", label: "Check Dec 5 resale tickets" }),
  Object.freeze({ day: "2026-12-06", offerId: "enchant-stpete-dec6-ticketsmarter", label: "Check Dec 6 resale tickets" }),
  Object.freeze({ day: "2026-12-10", offerId: "enchant-stpete-dec10-ticketsmarter", label: "Check Dec 10 resale tickets" }),
  Object.freeze({ day: "2026-12-11", offerId: "enchant-stpete-dec11-ticketsmarter", label: "Check Dec 11 resale tickets" }),
  Object.freeze({ day: "2026-12-13", offerId: "enchant-stpete-dec13-ticketsmarter", label: "Check Dec 13 resale tickets" }),
  Object.freeze({ day: "2026-12-15", offerId: "enchant-stpete-dec15-ticketsmarter", label: "Check Dec 15 resale tickets" }),
  Object.freeze({ day: "2026-12-16", offerId: "enchant-stpete-dec16-ticketsmarter", label: "Check Dec 16 resale tickets" }),
  Object.freeze({ day: "2026-12-17", offerId: "enchant-stpete-dec17-ticketsmarter", label: "Check Dec 17 resale tickets" }),
  Object.freeze({ day: "2026-12-20", offerId: "enchant-stpete-dec20-ticketsmarter", label: "Check Dec 20 resale tickets" }),
  Object.freeze({ day: "2026-12-21", offerId: "enchant-stpete-dec21-ticketsmarter", label: "Check Dec 21 resale tickets" }),
  Object.freeze({ day: "2026-12-22", offerId: "enchant-stpete-dec22-ticketsmarter", label: "Check Dec 22 resale tickets" }),
  Object.freeze({ day: "2026-12-23", offerId: "enchant-stpete-dec23-ticketsmarter", label: "Check Dec 23 resale tickets" }),
  Object.freeze({ day: "2026-12-24", offerId: "enchant-stpete-dec24-ticketsmarter", label: "Check Dec 24 resale tickets" }),
  Object.freeze({ day: "2026-12-25", offerId: "enchant-stpete-dec25-ticketsmarter", label: "Check Dec 25 resale tickets" }),
  Object.freeze({ day: "2026-12-26", offerId: "enchant-stpete-dec26-ticketsmarter", label: "Check Dec 26 resale tickets" }),
  Object.freeze({ day: "2026-12-27", offerId: "enchant-stpete-dec27-ticketsmarter", label: "Check Dec 27 resale tickets" }),
]);

function shownEnchantDay(row) {
  const start = String(row.start_date || "");
  const end = String(row.end_date || "");
  if (DATE_RX.test(start) && start === end) return start;
  const nights = Array.isArray(row.occurrence_dates) ? row.occurrence_dates.filter((day) => DATE_RX.test(day)) : [];
  return nights.length === 1 ? nights[0] : "";
}

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
  let offerId = entry.offerId;
  let label = entry.label;
  let via = entry.via;
  let product = entry.city ? "resale-performance" : "resale-browse";
  if (id === "enchant-stpete-2026") {
    const shown = shownEnchantDay(row);
    const dated = shown
      ? ENCHANT_DATED.find((night) => night.day === shown && night.day >= cutoff)
      : ENCHANT_DATED.find((night) => night.day >= cutoff);
    if (!dated) return null;
    offerId = dated.offerId;
    label = dated.label;
    via = EXACT_DISCLOSURE;
    product = "resale-performance";
  }
  const href = commerceHref({ provider: entry.provider, offerId,
    surface, contentId: id });
  const action = href ? { kind: "affiliate", href, label, via,
    provider: entry.provider, product,
    eventId: id, officialTicketUrl: official.href } : null;
  return primaryAction !== undefined && !secondaryTicketPrimaryMatches(primaryAction, action) ? null : action;
}
