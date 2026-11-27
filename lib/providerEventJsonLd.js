// lib/providerEventJsonLd.js — schema.org Event markup for PROVIDER events
// (Ticketmaster, Eventbrite, library feeds …) on /events/[city]/[slug] and the
// items of the /events/[city]/[window] lists.
//
// WHY ONE BUILDER (2026-11-27, owner-approved "event markup" mission). Both
// pages hand-built their own Event node: the address was the bare city string,
// a venue-less row published an Event with no `location` at all (Google's
// Event rich result REQUIRES location.address), endDate/offers were never
// sent, and `url` pointed off-site at the provider instead of at this page.
// The curated /florida-events pages already publish the full shape through
// lib/curatedEvents.js eventJsonLd(); this is the same contract for the live
// provider rows, which carry different field names.
//
// THE RULE: publish only what the row actually holds. No field here is ever
// guessed. A row that cannot name a place (no venue AND no city) or a start
// date gets NO Event node (null): the caller then lists a plain url-only
// ListItem, which is valid, instead of an Event Google would flag as broken.
import { eventJsonLdDates } from "./eventTime.js";

const SCHEDULED = "https://schema.org/EventScheduled";

function eventStatusUrl(status) {
  const s = String(status || "").toLowerCase();
  if (/postpon/.test(s)) return "https://schema.org/EventPostponed";
  if (/cancel/.test(s)) return "https://schema.org/EventCancelled";
  if (/reschedul/.test(s)) return "https://schema.org/EventRescheduled";
  return SCHEDULED;
}

const clean = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

// "Tampa, FL" -> "Tampa": the feeds sometimes fold the state into the city.
function locality(city) {
  return clean(city).split(",")[0].trim();
}

// A placeholder venue ("TBA") is not a place name.
function realVenue(venue) {
  const v = clean(venue);
  return v && !/^(tba|tbd|to be announced|to be determined)\b/i.test(v) ? v : "";
}

// schema.org needs ABSOLUTE image urls, and the metered photo proxy answers
// only credited page requests, so it is never published (same law as the
// curated builder and the list page's old inline check).
function absoluteImage(src) {
  const v = clean(src);
  if (!/^https:\/\//i.test(v)) return null;
  if (/^https?:\/\/[^/]+\/api\/photo(\?|$)/i.test(v)) return null;
  return v;
}

// The feeds print price as "$25", "$25 to $80" or "Free" (lib/eventResolve.js,
// app/api/events/route.js). Anything else is not parsed: no price is better
// than a wrong one.
export function parseEventPrice(price) {
  const p = clean(price);
  if (!p) return null;
  if (/^free$/i.test(p)) return { low: "0", high: null };
  const m = p.match(/^\$\s?(\d+(?:\.\d{1,2})?)(?:\s*(?:to|-|–)\s*\$\s?(\d+(?:\.\d{1,2})?))?$/i);
  if (!m) return null;
  const low = m[1], high = m[2] && m[2] !== m[1] ? m[2] : null;
  return { low, high };
}

/**
 * @param {object} e provider event row (name, date, time, venue, city, …)
 * @param {{ pageUrl: string }} opts pageUrl = this event's own page (absolute)
 * @returns {object|null} a schema.org Event node, or null when the row cannot
 *   support a valid one (no name, no start date, or no place).
 */
export function providerEventJsonLd(e, { pageUrl } = {}) {
  if (!e) return null;
  const name = clean(e.name);
  const { startDate, endDate } = eventJsonLdDates(e);
  const venue = realVenue(e.venue);
  const city = locality(e.city);
  if (!name || !startDate || (!venue && !city)) return null;

  const region = clean(e.stateCode || e.state);
  const address = {
    "@type": "PostalAddress",
    ...(clean(e.address) ? { streetAddress: clean(e.address) } : {}),
    ...(city ? { addressLocality: city } : {}),
    ...(region ? { addressRegion: region } : {}),
    ...(clean(e.postalCode || e.zip) ? { postalCode: clean(e.postalCode || e.zip) } : {}),
    addressCountry: "US",
  };
  const lat = e.lat == null || e.lat === "" ? NaN : Number(e.lat);
  const lng = e.lng == null || e.lng === "" ? NaN : Number(e.lng);
  const location = {
    "@type": "Place",
    name: venue || city,
    address,
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng } } : {}),
  };

  const node = {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    startDate,
    eventStatus: eventStatusUrl(e.status),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location,
  };
  // endDate only when the row really holds an end (a date or a clock). The
  // helper otherwise echoes the start, which would invent a duration.
  const hasEnd = !!(e.end_date || e.endDate || e.end_time || e.endTime);
  if (hasEnd && endDate) node.endDate = endDate;
  const desc = clean(e.description).replace(/\s+/g, " ");
  if (desc) node.description = desc.length > 300 ? desc.slice(0, 297).replace(/\s+\S*$/, "") + "…" : desc;
  const image = absoluteImage(e.image);
  if (image) node.image = [image];
  if (pageUrl) node.url = pageUrl;

  // OFFERS. The offer url is this page: it holds the ticket button, and a
  // Ticketmaster-family URL must only ever leave through our tracked go route
  // (TicketButton), never be published raw. Availability is stated only when
  // the feed says the event is on sale.
  const price = parseEventPrice(e.price);
  const cancelled = node.eventStatus !== SCHEDULED && node.eventStatus !== "https://schema.org/EventRescheduled";
  if (!cancelled && (price || (e.ticketed && clean(e.url)))) {
    const onSale = String(e.status || "").toLowerCase() === "onsale";
    const offerUrl = pageUrl || undefined;
    if (price && price.high) {
      node.offers = { "@type": "AggregateOffer", lowPrice: price.low, highPrice: price.high, priceCurrency: "USD", ...(offerUrl ? { url: offerUrl } : {}), ...(onSale ? { availability: "https://schema.org/InStock" } : {}) };
    } else {
      node.offers = { "@type": "Offer", priceCurrency: "USD", ...(price ? { price: price.low } : {}), ...(offerUrl ? { url: offerUrl } : {}), ...(onSale ? { availability: "https://schema.org/InStock" } : {}) };
    }
  }
  return node;
}
