// lib/newYearsEve.js: Florida New Year's Eve 2026 pages (owner, 2026-11-25:
// "build the seasonal pages also. I want to start working on New Year's Eve").
//
// Two sources, both real data only:
//   1. Curated wf_events rows dated on Dec 31, 2026 (the same trusted, Florida,
//      upcoming gates as /florida-events: isEligible + isFloridaEvent).
//   2. NYE_TICKETED_2026: Dec 31 night shows and parties that Ticketmaster
//      itself lists, copied from the Ticketmaster events Wayfind's own
//      /api/events feed already fetched and cached (wf_places_cache ev2 rows,
//      read 2026-11-25). No new Ticketmaster requests. The button always goes
//      through /api/ticketmaster/go (CLAUDE.md revenue rule 4), never the raw URL.
//
// Nothing here invents a fact: a missing time reads "Time not announced yet",
// a missing price shows no price, "Free" only when the row says is_free, and
// nothing is ever labeled sold out. Commission never orders anything: cards
// sort by start time.
import { DISPLAYABLE_STATUS, eventDetailTicketAction, eventJsonLd, eventWebsiteUrl, isEligible, isFloridaEvent } from "./curatedEvents.js";
import { eventClockLabel, eventClockMinutes } from "./eventVisitFacts.js";
import { eventIsoWithOffset } from "./eventTime.js";
import { isTicketmasterFamily, ticketmasterGoUrl } from "./affiliates.js";
import { safeUrl } from "./links.js";

export const NYE_DATE = "2026-12-31";
// The day after the countdown. Region pages and ticket rows retire after it.
export const NYE_ENDS_ON = "2027-01-01";
export const NYE_HUB_PATH = "/new-years-in-florida";
export const NYE_SURFACE = "nye_hub";
// A region gets its own page only with at least this many real listings, so
// no thin one-event page is offered to search engines.
export const NYE_MIN_REGION_EVENTS = 3;
export const NYE_TICKETED_MATCHED_AT = "2026-11-25";

const BLOG = "https://blog.gowayfind.com/";

// City names are compared lowercased with periods removed ("St. Pete" = "st pete").
export const NYE_REGIONS = Object.freeze([
  { id: "tampa-bay", label: "Tampa Bay", place: "Tampa Bay",
    cities: ["tampa", "st petersburg", "st pete", "st pete beach", "clearwater", "clearwater beach", "treasure island", "madeira beach", "dunedin", "brooksville", "safety harbor", "largo"],
    title: "New Year's Eve in Tampa Bay 2026: Fireworks, Countdowns and Parties",
    description: "New Year's Eve 2026 in Tampa, St. Pete and Clearwater: free beach fireworks, the St. Pete Pier countdown and ticketed parties, with start times and locations.",
    blog: { href: BLOG + "new-years-eve-tampa-bay-2026", label: "More New Year's Eve countdowns and fireworks in Tampa Bay" } },
  { id: "orlando", label: "Orlando", place: "Orlando",
    cities: ["orlando", "kissimmee", "sanford", "winter park", "lake buena vista", "celebration", "winter haven", "altamonte springs"],
    title: "New Year's Eve in Orlando 2026: Countdowns, Shows and Parties",
    description: "New Year's Eve 2026 in Orlando and Kissimmee: a street party with fireworks, Dec 31 concerts and shows, with start times, locations and ticket links.",
    blog: { href: BLOG + "new-years-eve-orlando-2026", label: "More New Year's Eve plans in Orlando" } },
  { id: "miami", label: "Miami and Fort Lauderdale", place: "Miami and Fort Lauderdale",
    cities: ["miami", "miami beach", "fort lauderdale", "hallandale beach", "hollywood", "coral gables", "key biscayne", "north miami beach", "aventura"],
    title: "New Year's Eve in Miami and Fort Lauderdale 2026: Parties and Countdowns",
    description: "New Year's Eve 2026 in Miami, Miami Beach and Fort Lauderdale: the free downtown countdown, club nights and concerts, with start times and ticket links." },
  { id: "palm-beach", label: "Palm Beach and Treasure Coast", place: "Palm Beach and the Treasure Coast",
    cities: ["west palm beach", "palm beach", "boca raton", "delray beach", "jupiter", "palm beach gardens", "lake worth beach", "fort pierce", "stuart", "vero beach"],
    title: "New Year's Eve in West Palm Beach and Boca Raton 2026",
    description: "New Year's Eve 2026 in West Palm Beach, Boca Raton and Fort Pierce: a free waterfront party with fireworks plus Dec 31 shows, with times and ticket links." },
  { id: "sarasota-bradenton", label: "Sarasota and Bradenton", place: "Sarasota and Bradenton",
    cities: ["sarasota", "bradenton", "lakewood ranch", "longboat key", "venice", "anna maria", "holmes beach", "bradenton beach", "siesta key", "palmetto", "parrish", "north port"],
    title: "New Year's Eve in Sarasota and Bradenton 2026",
    description: "New Year's Eve 2026 in Sarasota, Bradenton and the beaches, with start times, locations and ticket links.",
    blog: { href: BLOG + "new-years-eve-sarasota-bradenton-2026", label: "New Year's Eve 2026 in Sarasota, Bradenton and Longboat Key" } },
  { id: "jacksonville", label: "Jacksonville and Amelia Island", place: "Jacksonville and Amelia Island",
    cities: ["jacksonville", "jacksonville beach", "fernandina beach", "amelia island", "atlantic beach", "neptune beach", "st augustine", "st augustine beach", "vilano beach"],
    title: "New Year's Eve in Jacksonville 2026: Fireworks and the Shrimp Drop",
    description: "New Year's Eve 2026 in Jacksonville and Fernandina Beach: midnight fireworks over the St. Johns River, the Shrimp Drop and a Dec 31 hockey night." },
  { id: "panhandle", label: "Panhandle and Tallahassee", place: "the Panhandle and Tallahassee",
    cities: ["pensacola", "pensacola beach", "panama city beach", "panama city", "destin", "fort walton beach", "navarre", "tallahassee"],
    title: "New Year's Eve on the Florida Panhandle 2026: Pensacola, Panama City Beach, Tallahassee",
    description: "New Year's Eve 2026 in Pensacola, Panama City Beach and Tallahassee: beach ball drops, fireworks and a symphony night. Most of the Panhandle is on Central Time." },
  { id: "southwest", label: "Fort Myers and Naples", place: "Fort Myers and Naples",
    cities: ["fort myers", "fort myers beach", "cape coral", "naples", "bonita springs", "marco island", "sanibel"],
    title: "New Year's Eve in Fort Myers and Naples 2026",
    description: "New Year's Eve 2026 in Fort Myers and Naples, with start times, locations and ticket links." },
]);

// Dec 31 night shows and parties Ticketmaster lists (see the header). `id` is
// Ticketmaster's own event id as the feed carries it; `time` is Ticketmaster's
// local start time. Only listings whose name says New Year's or that start in
// the evening of Dec 31 at an entertainment venue; no sports except a game the
// seller itself bills as a New Year's celebration.
export const NYE_TICKETED_2026 = Object.freeze([
  { id: "tm_vvG1VZ_fhrT2GZ", name: "2027 NYE Celebration featuring Two Friends", venue: "Seminole Hard Rock Tampa Event Center", city: "Tampa", time: "21:00", kind: "party",
    url: "https://www.ticketmaster.com/2027-nye-celebration-featuring-two-friends-tampa-florida-12-31-2026/event/0D006546DEFCF300" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_Z7r9jZ1A7P3Zx", name: "Salute To Vienna", venue: "Ruth Eckerd Hall", city: "Clearwater", time: "15:00", kind: "show",
    url: "https://www.ticketmaster.com/event/Z7r9jZ1A7P3Zx" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_1AeFZ_3GknHG7xp", name: "WJRR's Heavy New Year ft. Sevendust", venue: "House of Blues Orlando", city: "Orlando", time: "20:00", kind: "concert",
    url: "https://www.ticketmaster.com/wjrrs-heavy-new-year-ft-sevendust-orlando-florida-12-31-2026/event/2200652ABC304896" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_1AxZk44GkdbGAJW", name: "Magic Rocks!", venue: "Hard Rock Live Orlando", city: "Orlando", time: "20:00", kind: "show",
    url: "https://www.ticketmaster.com/magic-rocks-orlando-florida-12-31-2026/event/22006555D83059BD" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_Z7r9jZ1A7-_vU", name: "Blue Man Group", venue: "ICON Park", city: "Orlando", time: "19:00", kind: "show",
    url: "https://www.ticketmaster.com/event/Z7r9jZ1A7-_vU" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_rZ7HnEZ1Af8KO0", name: "Fontainebleau Presents: David Guetta, New Year's Eve 2027", venue: "Fontainebleau Miami Beach", city: "Miami Beach", time: "21:00", kind: "party",
    url: "https://www.ticketweb.com/event/fontainebleau-presents-david-guetta-fontainebleau-miami-beach-tickets/14413824" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_Z7r9jZ1AAAvbz", name: "Dom Dolla", venue: "Factory Town", city: "Miami", time: "21:00", kind: "party",
    url: "https://www.ticketmaster.com/event/Z7r9jZ1AAAvbz" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_rZ7HnEZ1Afuae7", name: "Adriatique", venue: "LIV Nightclub Miami", city: "Miami Beach", time: "23:30", kind: "party",
    url: "https://www.ticketweb.com/event/adriatique-liv-nightclub-miami-tickets/14349084" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_Z7r9jZ1AAZbk3", name: "Lettuce", venue: "Miami Beach Bandshell", city: "Miami Beach", time: "20:30", kind: "concert",
    url: "https://www.ticketmaster.com/event/Z7r9jZ1AAZbk3" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_vvG1VZ_pw6T71V", name: "Hollywood Nights NYE", venue: "Gulfstream Park Racing and Casino", city: "Hallandale Beach", time: "19:00", kind: "party",
    url: "https://www.ticketmaster.com/hollywood-nights-nye-hallandale-beach-florida-12-31-2026/event/0D00656C87FC42B4" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_vvG1VZ_3BntExf", name: "Murray the Magician", venue: "The Studio at Mizner Park", city: "Boca Raton", time: "20:30", kind: "show",
    url: "https://www.ticketmaster.com/murray-the-magician-boca-raton-florida-12-31-2026/event/0D00652EAAA67894" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_vvG1VZ_2pqE7y9", name: "Straight No Chaser", venue: "Sunrise Theatre", city: "Fort Pierce", time: "19:30", kind: "concert",
    url: "https://www.ticketmaster.com/straight-no-chaser-fort-pierce-florida-12-31-2026/event/0D0064F59D9C4E57" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_G5viZ_a034C8S", name: "Pensacola Symphony Orchestra: \"My Way\"", venue: "Pensacola Saenger Theatre", city: "Pensacola", time: "19:00", kind: "concert", timezone: "America/Chicago",
    url: "https://www.ticketmaster.com/pensacola-symphony-orchestra-my-way-pensacola-florida-12-31-2026/event/1B0064991254E433" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
  { id: "tm_1AxZkfNGkdEJMBN", name: "Jacksonville Icemen vs Orlando Solar Bears: New Year's Celebration", venue: "VyStar Veterans Memorial Arena", city: "Jacksonville", time: "17:00", kind: "sports",
    url: "https://www.ticketmaster.com/jacksonville-icemen-vs-orlando-solar-bears-jacksonville-florida-12-31-2026/event/22006523E79B7EA3" }, // wf-affiliate-allow: official — destination only; the button always wraps it in ticketmasterGoUrl
]);

// 2026 editions confirmed on the organizer's or venue's own page (read
// 2026-11-25; the quoted evidence is in the PR). Facts the page does not state
// stay null: no time means "Time not announced yet". Organizer ticket links are
// plain links (nofollow), never sponsored. A page that still shows last year,
// or no year, is not here (Universal, Dr. Phillips Center, Thornton Park,
// Waterside Place and the Anna Maria Oyster Drop were all still 2025 pages).
export const NYE_RESEARCHED_CHECKED_AT = "2026-11-25";
export const NYE_RESEARCHED_2026 = Object.freeze([
  { id: "sarasota-pineapple-drop-2026", name: "Downtown Sarasota New Year's Eve Pineapple Drop", venue: "Selby Five Points Park, Main Street", city: "Sarasota", time: null, price: "Free", fireworks: true,
    hook: "The City of Sarasota's downtown block party with food, rides and live bands ends with the Pineapple Drop at midnight and fireworks over the bayfront.",
    officialUrl: "https://www.sarasotafl.gov/Events-directory/Downtown-Sarasota-New-Years-Eve-Pineapple-Drop" },
  { id: "selby-gardens-nye-gala-2026", name: "New Year's Eve Gala at Selby Gardens", venue: "Marie Selby Botanical Gardens, Downtown Sarasota", city: "Sarasota", time: "19:00", price: "From $450",
    hook: "A black tie gala with a seated four course dinner and private access to Lights in Bloom, ending with a champagne toast and a view of the fireworks over Sarasota Bay.",
    officialUrl: "https://selby.org/dsc/dsc-special-events/new-years-eve", ticketUrl: "https://7082.blackbaudhosting.com/7082/2026-New-Years-Eve-Gala", seller: "Selby Gardens" },
  { id: "westin-sarasota-nye-soiree-2026", name: "The Westin Sarasota New Year's Eve Soirée", venue: "The Roof Bar & Eats, The Westin Sarasota", city: "Sarasota", time: "21:00", price: "$200, ages 21+",
    hook: "A rooftop party with small bites, a live DJ and a champagne toast at midnight. Drinks are sold separately.",
    officialUrl: "https://www.eventbrite.com/e/the-westin-sarasota-new-years-eve-soiree-tickets-1995133802912", ticketUrl: "https://www.eventbrite.com/e/the-westin-sarasota-new-years-eve-soiree-tickets-1995133802912", seller: "Eventbrite" },
  { id: "seaworld-orlando-nye-2026", name: "New Year's Eve at SeaWorld Orlando", venue: "SeaWorld Orlando", city: "Orlando", time: null, price: "Included with admission", fireworks: true,
    hook: "SeaWorld lists midnight fireworks, DJ dance parties from 8:30 p.m. and a Sesame Street Land countdown that ends at 11 p.m. A paid VIP fireworks happy hour is extra.",
    officialUrl: "https://seaworld.com/orlando/events/new-years-eve/" },
  { id: "legoland-florida-kids-nye-2026", name: "Kids' New Year's Eve at LEGOLAND Florida", venue: "LEGOLAND Florida Resort", city: "Winter Haven", time: null, price: "Included with admission", fireworks: true,
    hook: "An early countdown so kids can celebrate before bedtime, with live music and fireworks made to look like LEGO bricks. LEGOLAND has not posted the countdown time yet.",
    officialUrl: "https://www.legoland.com/florida/blog/kids-new-years-eve-guide/" },
  { id: "walt-disney-world-nye-2026", name: "New Year's Eve at Walt Disney World", venue: "Walt Disney World Resort", city: "Lake Buena Vista", time: null, price: "Included with admission", fireworks: true,
    hook: "Disney says Dec 31 brings dance parties, special dining and entertainment, and a New Year's Eve fireworks show across the resort. It has not posted park hours or show times yet.",
    officialUrl: "https://disneyworld.disney.go.com/destinations/disney-springs/calendar/" },
  { id: "countdown-miami-bayfront-park-2026", name: "The Countdown Miami at Bayfront Park", venue: "Bayfront Park", city: "Miami", time: "17:00", price: "Free RSVP, VIP tickets", fireworks: false,
    hook: "A waterfront festival with Afrojack, Sean Paul, Mario, Oscar De Leon and Wilfrido Vargas and a midnight countdown. Gates open at 5 p.m.",
    officialUrl: "https://thecountdownmiami.com/", ticketUrl: "https://shotgun.live/en/events/the-countdown-miami-at-bayfront-park-2026", ticketLabel: "RSVP or VIP tickets ↗", seller: "Shotgun" },
  { id: "miami-beach-ocean-drive-fireworks-2026", name: "New Year's Eve Fireworks on Ocean Drive", venue: "Lummus Park beachfront, Ocean Drive", city: "Miami Beach", time: null, price: null, fireworks: true,
    hook: "The City of Miami Beach and the Ocean Drive Association launch fireworks from the Lummus Park beachfront. The city's page gives two different times, so check it before you go.",
    officialUrl: "https://events.miamibeachfl.gov/event/new-years-eve-fireworks-on-ocean-drive" },
  { id: "orchestra-miami-nye-2026", name: "Orchestra Miami's New Year's Eve Celebration", venue: "Collins Park Beachfront", city: "Miami Beach", time: "20:00", price: "Free", fireworks: true,
    hook: "A free orchestra concert on the sand between 21st and 22nd streets, 8 p.m. to midnight, with fireworks at midnight. Upgraded seating costs extra.",
    officialUrl: "https://events.miamibeachfl.gov/event/orchestra-miamis-new-years-eve-celebration" },
  { id: "regatta-grove-nye-2026", name: "NYE 2027 Celebration and Fireworks at Regatta Grove", venue: "Regatta Grove, Coconut Grove", city: "Miami", time: "20:00", price: "Ages 21+", fireworks: true,
    hook: "A waterfront party with music, a midnight countdown and fireworks. Coastal chic dress code, rain or shine, and all sales are final.",
    officialUrl: "https://www.eventbrite.com/e/nye-2027-celebration-fireworks-show-at-regatta-grove-tickets-2004658465434", ticketUrl: "https://www.eventbrite.com/e/nye-2027-celebration-fireworks-show-at-regatta-grove-tickets-2004658465434", seller: "Eventbrite" },
]);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const nameKey = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
const normCity = (c) => String(c || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
const CITY_TO_REGION = new Map(NYE_REGIONS.flatMap((r) => r.cities.map((c) => [c, r.id])));

export function nyeRegionForCity(city) {
  return CITY_TO_REGION.get(normCity(city)) || null;
}

export function nyeRegion(id) {
  return NYE_REGIONS.find((r) => r.id === id) || null;
}

export const nyeRegionPath = (id) => NYE_HUB_PATH + "/" + id;

const NYE_WORDS = /new\s*year|\bnye\b|countdown|ball drop|shrimp drop|shoe drop/i;
const NYE_SUBCATEGORY = /^(nye|new[\s-]*years?[\s-]*eve)$/i;

// A curated row that IS a New Year's Eve event on Dec 31, 2026 (not just any
// event that happens to run that day, like a bowl game or a light show).
export function isNyeCuratedRow(row) {
  if (!row || typeof row !== "object") return false;
  if (!DISPLAYABLE_STATUS.has(row.event_status)) return false;
  const start = String(row.start_date || "");
  const end = String(row.end_date || row.start_date || "");
  if (!ISO_DAY.test(start) || start > NYE_DATE || end < NYE_DATE) return false;
  return NYE_SUBCATEGORY.test(String(row.subcategory || "").trim()) || NYE_WORDS.test(String(row.event_name || ""));
}

function whenLabel(time) {
  const clock = eventClockLabel(time);
  return clock ? "Thu, Dec 31 · " + clock : "Thu, Dec 31 · Time not announced yet";
}

function priceLabel(row) {
  if (row.is_free === true) return "Free";
  const min = row.price_min == null ? null : Number(row.price_min);
  if (Number.isFinite(min) && min > 0) return "From $" + (Number.isInteger(min) ? min : min.toFixed(2));
  return null;
}

function curatedCard(row, today) {
  const ticket = eventDetailTicketAction(row, { surface: NYE_SURFACE, today });
  const text = [row.event_name, row.card_hook, row.editorial_summary].filter(Boolean).join(" ");
  return {
    key: "wf:" + row.event_id,
    source: "curated",
    id: row.event_id,
    name: row.event_name,
    city: row.city,
    venue: row.venue || null,
    region: nyeRegionForCity(row.city),
    time: row.start_time ? String(row.start_time).slice(0, 5) : null,
    when: whenLabel(row.start_time),
    price: priceLabel(row),
    hook: row.card_hook || null,
    fireworks: /firework/i.test(text),
    detailHref: row.slug ? "/florida-events/" + encodeURIComponent(row.slug) : null,
    officialHref: eventWebsiteUrl(row) || null,
    ticket: ticket ? { href: ticket.href, label: ticket.label, rel: ticket.kind === "affiliate" ? "sponsored noopener" : "noopener nofollow", seller: null } : null,
    centralTime: String(row.timezone || "") === "America/Chicago",
    jsonLd: eventJsonLd(row),
  };
}

function ticketedCard(entry) {
  const href = ticketmasterGoUrl(entry.url, { surface: NYE_SURFACE, contentId: entry.id, offerId: entry.id });
  const tz = entry.timezone || "America/New_York";
  return {
    key: "tm:" + entry.id,
    source: "ticketmaster",
    id: entry.id,
    name: entry.name,
    city: entry.city,
    venue: entry.venue,
    region: nyeRegionForCity(entry.city),
    time: entry.time,
    when: whenLabel(entry.time),
    price: null,
    hook: null,
    kind: entry.kind,
    fireworks: false,
    detailHref: null,
    officialHref: null,
    ticket: href ? { href, label: "Get tickets ↗", rel: "sponsored noopener", seller: /ticketweb/i.test(entry.url) ? "TicketWeb" : "Ticketmaster" } : null,
    centralTime: tz === "America/Chicago",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Event",
      name: entry.name,
      startDate: eventIsoWithOffset(NYE_DATE, entry.time, tz),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: entry.venue, address: { "@type": "PostalAddress", addressLocality: entry.city, addressRegion: "FL", addressCountry: "US" } },
      offers: { "@type": "Offer", url: entry.url, priceCurrency: "USD" },
    },
  };
}

function researchedCard(entry) {
  const official = safeUrl(entry.officialUrl) || null;
  const ticketHref = safeUrl(entry.ticketUrl) || null;
  const tz = entry.timezone || "America/New_York";
  return {
    key: "rs:" + entry.id,
    source: "organizer",
    id: entry.id,
    name: entry.name,
    city: entry.city,
    venue: entry.venue,
    region: nyeRegionForCity(entry.city),
    time: entry.time || null,
    when: whenLabel(entry.time),
    price: entry.price || null,
    hook: entry.hook,
    fireworks: entry.fireworks === true,
    detailHref: null,
    officialHref: official && official !== ticketHref ? official : null,
    ticket: ticketHref ? { href: ticketHref, label: entry.ticketLabel || "Get tickets ↗", rel: "noopener nofollow", seller: entry.seller || null } : null,
    centralTime: tz === "America/Chicago",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Event",
      name: entry.name,
      startDate: eventIsoWithOffset(NYE_DATE, entry.time, tz),
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      description: entry.hook,
      location: { "@type": "Place", name: entry.venue, address: { "@type": "PostalAddress", addressLocality: entry.city, addressRegion: "FL", addressCountry: "US" } },
      ...(entry.price === "Free" ? { isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD", url: official || ticketHref } } : {}),
      ...(official ? { organizer: { "@type": "Organization", url: official } } : {}),
    },
  };
}

const byStart = (a, b) => {
  const am = eventClockMinutes(a.time), bm = eventClockMinutes(b.time);
  if (am == null && bm == null) return a.name.localeCompare(b.name);
  if (am == null) return 1;
  if (bm == null) return -1;
  return am - bm || a.name.localeCompare(b.name);
};

/**
 * Everything the NYE pages render. `rows` are curated wf_events rows (any set;
 * only NYE rows on Dec 31 that pass the hub's gates are kept). After New Year's
 * Day the ticketed listings retire and curated rows drop by their own end date.
 */
export function nyeModel(rows, today, { now = new Date(), ticketed = NYE_TICKETED_2026, researched = NYE_RESEARCHED_2026 } = {}) {
  if (!ISO_DAY.test(String(today || ""))) throw new Error("nyeModel requires an Eastern calendar date");
  const curated = (Array.isArray(rows) ? rows : [])
    .filter((row) => isNyeCuratedRow(row) && isEligible(row, { now }) && isFloridaEvent(row))
    .map((row) => curatedCard(row, today));
  const tickets = today > NYE_DATE ? [] : ticketed.filter((e) => isTicketmasterFamily(e.url)).map(ticketedCard).filter((c) => c.ticket);
  // A researched listing that a curated row already covers (same city, same
  // first words of the name) is dropped, so one event never shows twice.
  const covered = (e) => curated.some((c) => normCity(c.city) === normCity(e.city) && nameKey(c.name) === nameKey(e.name));
  const organizer = today > NYE_DATE ? [] : researched.filter((e) => !covered(e)).map(researchedCard);
  const all = [...curated, ...organizer, ...tickets].sort(byStart);
  const regions = NYE_REGIONS.map((region) => {
    const cards = all.filter((c) => c.region === region.id);
    return { ...region, path: nyeRegionPath(region.id), cards, count: cards.length, hasPage: cards.length >= NYE_MIN_REGION_EVENTS && today <= NYE_ENDS_ON };
  });
  const elsewhere = all.filter((c) => !c.region);
  return { today, all, regions, elsewhere, curatedCount: curated.length, organizerCount: organizer.length, ticketedCount: tickets.length };
}

/** Region ids with enough listings for their own page (the sitemap and the region route agree). */
export function nyeRegionPageIds(model) {
  return model.regions.filter((r) => r.hasPage).map((r) => r.id);
}

/** ItemList of the Event nodes shown on a page (Event structured data for each listing). */
export function nyeItemListSchema(cards, { siteUrl, name, url }) {
  const events = cards.map((c) => c.jsonLd).filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url,
    numberOfItems: events.length,
    itemListElement: events.map((node, i) => {
      const { "@context": _ctx, ...item } = node;
      return { "@type": "ListItem", position: i + 1, item: { ...item, url: item.url || url || siteUrl } };
    }),
  };
}
