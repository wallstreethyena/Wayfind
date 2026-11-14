// lib/christmasTicketmaster.js: Christmas shows that are sold on Ticketmaster.
//
// Owner 2026-11-10: "if there is no StubHub, use Ticketmaster." Each entry is
// a Wayfind Christmas listing matched to Ticketmaster's own Discovery API
// listing with ALL THREE of: the same production (normalized title), the same
// venue in the same city, and a performance date inside the listing's run
// (and in its occurrence_dates when it has them). No close-name or guessed
// matches. Source: Ticketmaster events Wayfind's own /api/events feed already
// fetched and cached (wf_places_cache ev2 rows written 2026-10-12..2026-11-11),
// so building this list made zero new Ticketmaster requests.
//
// One Ticketmaster page per performance date. The button links the next date
// that has not passed (Eastern time), always through /api/ticketmaster/go so
// the Impact wrap and attribution happen server side. Commission never orders
// or ranks anything; this only decides which seller the button names.
import { isTicketmasterFamily, ticketmasterGoUrl } from "./affiliates.js";

export const CHRISTMAS_TICKETMASTER_MATCHED_AT = "2026-11-11";

export const CHRISTMAS_TICKETMASTER = Object.freeze({
  // A Christmas Carol | Margeson Theater, Orlando | Ticketmaster: "A Christmas Carol" at Margeson Theater - Orlando Shakes
  "a-christmas-carol-orlando-shakes-2026": [{ date: "2026-11-25", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAvke_" }, { date: "2026-11-27", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAvk7Z" }, { date: "2026-11-28", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAvk7e" }, { date: "2026-11-29", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAvk7d" }, { date: "2026-12-04", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAvk77" }, { date: "2026-12-05", url: "https://www.ticketmaster.com/event/Z7r9jZ1A7Pe18" }, { date: "2026-12-06", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAvk7k" }, { date: "2026-12-09", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAvk76" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // The Nutcracker | Kravis Center, West Palm Beach | Ticketmaster: "The Nutcracker" at Kravis Center - Dreyfoos Hall
  "ballet-palm-beach-nutcracker-2026": [{ date: "2026-12-04", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAZyQ7" }, { date: "2026-12-05", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAZyQA" }, { date: "2026-12-06", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAZyQ6" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // The Nutcracker | Saenger Theatre, Pensacola | Ticketmaster: "Ballet Pensacola Presents The Nutcracker" at Pensacola Saenger Theatre
  "ballet-pensacola-nutcracker-2026": [{ date: "2026-12-18", url: "https://www.ticketmaster.com/ballet-pensacola-presents-the-nutcracker-pensacola-florida-12-18-2026/event/1B00653B1DDE8A47" }, { date: "2026-12-19", url: "https://www.ticketmaster.com/ballet-pensacola-presents-the-nutcracker-pensacola-florida-12-19-2026/event/1B00653B1E8D8C22" }, { date: "2026-12-20", url: "https://www.ticketmaster.com/ballet-pensacola-presents-the-nutcracker-pensacola-florida-12-20-2026/event/1B00653B1FB39033" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // Charles Dickens' A Christmas Carol at Ruth Eckerd Hall | Ruth Eckerd Hall, Clearwater | Ticketmaster: "A Christmas Carol" at Ruth Eckerd Hall
  "christmas-carol-ruth-eckerd-2026": [{ date: "2026-12-22", url: "https://www.ticketmaster.com/event/Z7r9jZ1A7JebZ" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // Christmas with Chris Tomlin | Saenger Theatre, Pensacola | Ticketmaster: "Christmas with Chris Tomlin" at Saenger Theatre
  "christmas-with-chris-tomlin-pensacola-2026": [{ date: "2026-12-04", url: "https://www.livenation.com/event/G5viZ_on0-j6v/christmas-with-chris-tomlin" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // First Coast Nutcracker | Moran Theater, Jacksonville | Ticketmaster: "Jacksonville Symphony: First Coast Nutcracker" at Jacksonville Center for the Performing Arts - Moran Theater
  "firstcoastnutcracker-jaxsymphony-2026": [{ date: "2026-12-18", url: "https://www.ticketmaster.com/jacksonville-symphony-first-coast-nutcracker-jacksonville-florida-12-18-2026/event/220064FEB2E04D84" }, { date: "2026-12-19", url: "https://www.ticketmaster.com/jacksonville-symphony-first-coast-nutcracker-jacksonville-florida-12-19-2026/event/220064FEC7AF5C8B" }, { date: "2026-12-20", url: "https://www.ticketmaster.com/jacksonville-symphony-first-coast-nutcracker-jacksonville-florida-12-20-2026/event/220064FFBD3F5D00" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // Miami City Ballet George Balanchine's The Nutcracker | Ziff Ballet Opera House, Miami | Ticketmaster: "Miami City Ballet Presents George Balanchine's The Nutcracker (Recommended for ages 4 and Up)" at Ziff Ballet Opera House-Adrienne Arsht PAC
  "miami-city-ballet-nutcracker-2026": [{ date: "2026-12-11", url: "https://www.ticketmaster.com/event/Z7r9jZ1A7J717" }, { date: "2026-12-12", url: "https://www.ticketmaster.com/event/Z7r9jZ1A7J71A" }, { date: "2026-12-13", url: "https://www.ticketmaster.com/event/Z7r9jZ1A7J71p" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // The Nutcracker with Naples Ballet and the Naples Philharmonic | Hayes Hall, Naples | Ticketmaster: "Naples Ballet w/ The Nutcracker" at Artis-Naples
  "naples-ballet-nutcracker-artis-2026": [{ date: "2026-12-05", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAeva8" }, { date: "2026-12-06", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAve7Y" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // The Nutcracker | Steinmetz Hall, Orlando | Ticketmaster: "The Nutcracker - Orlando Ballet" at Dr. Phillips Performing Arts Center
  "orlando-ballet-nutcracker-2026": [{ date: "2026-12-04", url: "https://www.ticketmaster.com/event/Z7r9jZ1A70Muz" }, { date: "2026-12-05", url: "https://www.ticketmaster.com/event/Z7r9jZ1A70Muy" }, { date: "2026-12-06", url: "https://www.ticketmaster.com/event/Z7r9jZ1A70MCF" }, { date: "2026-12-11", url: "https://www.ticketmaster.com/event/Z7r9jZ1A70MCZ" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // Dave Koz and Friends Christmas Tour | Ruth Eckerd Hall, Clearwater | Ticketmaster: "Dave Koz Christmas" at Ruth Eckerd Hall
  "ruth-eckerd-dave-koz-christmas-2026": [{ date: "2026-12-04", url: "https://www.ticketmaster.com/event/Z7r9jZ1A7Jebv" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // A Very Broadway Christmas | Van Wezel Performing Arts Hall, Sarasota | Ticketmaster: "A Very Broadway Christmas" at Van Wezel Performing Arts Hall
  "van-wezel-a-very-broadway-christmas-2026": [{ date: "2026-12-21", url: "https://www.ticketmaster.com/event/Z7r9jZ1AA7dAF" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // Cirque Musica Holiday Wonderland | Van Wezel Performing Arts Hall, Sarasota | Ticketmaster: "Cirque Musica" at Van Wezel Performing Arts Hall
  "van-wezel-cirque-musica-holiday-wonderland-2026": [{ date: "2026-12-20", url: "https://www.ticketmaster.com/event/Z7r9jZ1A7JKee" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // Dave Koz and Friends Christmas Tour | Van Wezel Performing Arts Hall, Sarasota | Ticketmaster: "Dave Koz Christmas" at Van Wezel Performing Arts Hall
  "van-wezel-dave-koz-and-friends-christmas-tour-2026": [{ date: "2026-12-03", url: "https://www.ticketmaster.com/event/Z7r9jZ1AAe7k9" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // NUTCRACKER! Magical Christmas Ballet | Van Wezel Performing Arts Hall, Sarasota | Ticketmaster: "NUTCRACKER! Magical Christmas Ballet" at Van Wezel Performing Arts Hall
  "van-wezel-nutcracker-magical-christmas-ballet-2026": [{ date: "2026-12-29", url: "https://www.ticketmaster.com/event/Z7r9jZ1AA761Z" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  // Volusia Civic Ballet's The Nutcracker | Peabody Auditorium, Daytona Beach | Ticketmaster: "Volusia Civic Ballet - The Nutcracker" at The Peabody Daytona Beach
  "volusia-civic-ballet-nutcracker-2026": [{ date: "2026-12-05", url: "https://www.ticketmaster.com/event/Z7r9jZ1AA78F8" }, { date: "2026-12-06", url: "https://www.ticketmaster.com/event/Z7r9jZ1AA7-aO" }], // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
});

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// The Ticketmaster page for the listing's next performance on or after
// `today`, or null (no match, every matched date has passed, or a bad row).
function nextTicketmasterNight(eventId, today) {
  const dates = CHRISTMAS_TICKETMASTER[eventId];
  if (!Array.isArray(dates) || !DATE_RX.test(String(today || ""))) return null;
  return dates
    .filter((d) => d && DATE_RX.test(d.date) && d.date >= today && isTicketmasterFamily(d.url))
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}
export function christmasTicketmasterUrl(eventId, today) {
  const next = nextTicketmasterNight(eventId, today);
  return next ? next.url : null;
}
// The date of the Ticketmaster night christmasTicketmasterUrl opens, or null.
export function christmasTicketmasterNextDate(eventId, today) {
  const next = nextTicketmasterNight(eventId, today);
  return next ? next.date : null;
}

// The CTA ticketAction renders, or null. Same shape as its other affiliate CTAs.
export function christmasTicketmasterAction(card, today, surface) {
  const id = card && (card.id || card.event_id);
  const url = id ? christmasTicketmasterUrl(id, today) : null;
  if (!url) return null;
  const href = ticketmasterGoUrl(url, { surface, contentId: id, offerId: id });
  if (!href) return null;
  return { kind: "affiliate", href, label: "Ticketmaster", via: "Event tickets at Ticketmaster", provider: "ticketmaster", product: "event-ticket" };
}

// A secondary Ticketmaster choice for a pinned show whose main button is
// something else (a registry partner or the official page). Same exact match,
// same redirect. null when there is no match.
export function christmasTicketmasterOption(card, today, surface) {
  const a = christmasTicketmasterAction(card, today, surface);
  return a ? { provider: "ticketmaster", label: "Ticketmaster", href: a.href } : null;
}
