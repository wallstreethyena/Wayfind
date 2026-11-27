// lib/valentines.js: Valentine's Day in Florida 2027 pages (owner, 2026-11-27:
// "we should be building ... a Valentine's in Florida page ... so that we can
// sell the events", built early so the page has time to rank, and built to
// rank at the top, not just rank).
//
// What the page answers for "valentine's day in florida" and "valentine's day
// <city>": WHEN (Sunday, Feb 14, 2027, with Presidents Day on Monday, Feb 15
// making a three day weekend), WHAT TO BOOK (romantic Viator experiences by
// area) and WHAT IS ON (curated events running that weekend).
//
// Real data only:
// - Events are curated wf_events rows running at least one day of Fri Feb 12
//   to Mon Feb 15, 2027, behind the same trusted / Florida / upcoming gates as
//   /florida-events (isEligible + isFloridaEvent). Dates, prices and times come
//   from the row; nothing is invented and nothing is labeled sold out.
// - Experiences are real Viator products already in wf_experiences (provider
//   viator, link_ok true, read 2026-11-27). Each books through
//   /api/commerce/go by opaque product code (commerceHref), so the partner URL
//   never reaches the page, and the go route re-reads the row and fails closed
//   if the nightly sweep later proves the product dead. No dates are claimed
//   for them: Viator shows which days run, so the button is "See availability".
//   Area comes from the product's own title or Viator destination, never the
//   contaminated city field (several Fort Lauderdale, Bonita Springs and Key
//   Largo products carry "Panama City").
// Options, not orders: experiences sort by rating then review count, events by
// start date. Commission never orders anything.
import { commerceHref } from "./commerce.js";
import { isDeniedViatorSku } from "./viatorDenylist.js";
import { tourDuration } from "./halloweenTours.js";
import { dateRangeLabel, eventDetailTicketAction, eventJsonLd, eventWebsiteUrl, isEligible, isFloridaEvent } from "./curatedEvents.js";
import { SPRING_BREAK_REGIONS } from "./springBreak.js";

export const VALENTINES_DAY = "2027-02-14"; // a Sunday
export const VALENTINES_FROM = "2027-02-12"; // Friday
export const VALENTINES_TO = "2027-02-15"; // Presidents Day, Monday (third Monday of February)
export const VALENTINES_HUB_PATH = "/valentines-day-in-florida";
export const VALENTINES_SURFACE = "valentines_hub";
export const VALENTINES_PAGE_KEY = "valentines-day-in-florida";
export const VALENTINES_MIN_REGION_ITEMS = 3;
export const VALENTINES_CTA = "See availability ↗";

// Dinner and evening links per area: Wayfind's own ranked restaurant and
// things to do pages. Only slugs those routes publish (app/restaurants/[city]
// and app/things-to-do/[city] are static, dynamicParams false), checked
// against landingCityParams on 2026-11-27; an area without one gets no block.
const DINNER = Object.freeze({
  "tampa-bay": { restaurants: [["tampa", "Tampa"], ["st-petersburg", "St. Petersburg"]], things: [["tampa", "Tampa"], ["clearwater", "Clearwater"]] },
  orlando: { restaurants: [["orlando", "Orlando"]], things: [["orlando", "Orlando"]] },
  miami: { restaurants: [["miami", "Miami"]], things: [["miami", "Miami"]] },
  "sarasota-bradenton": { restaurants: [["sarasota", "Sarasota"], ["siesta-key", "Siesta Key"], ["bradenton", "Bradenton"], ["anna-maria-island", "Anna Maria Island"]], things: [["sarasota", "Sarasota"]] },
  southwest: { restaurants: [["naples", "Naples"], ["fort-myers", "Fort Myers"]], things: [["naples", "Naples"], ["fort-myers", "Fort Myers"]] },
  jacksonville: { restaurants: [["st-augustine", "St. Augustine"], ["jacksonville", "Jacksonville"]], things: [["jacksonville", "Jacksonville"]] },
});
const dinnerLinks = (id) => {
  const d = DINNER[id];
  if (!d) return [];
  return [
    ...d.restaurants.map(([slug, name]) => ({ key: "r-" + slug, href: "/restaurants/" + slug, label: "Restaurants in " + name })),
    ...d.things.map(([slug, name]) => ({ key: "t-" + slug, href: "/things-to-do/" + slug, label: "Things to do in " + name })),
  ];
};

// The same ten Florida areas (and city lists) as the spring break pages, so
// one city never lands in two areas across Wayfind's seasonal pages.
export const VALENTINES_REGIONS = Object.freeze(SPRING_BREAK_REGIONS.map((r) => Object.freeze({
  id: r.id, label: r.label, place: r.place, cities: r.cities,
  title: `Valentine's Day in ${r.label} 2027: Romantic Things to Do and Events`,
  description: `Plan Valentine's Day 2027 in ${r.place}: sunset cruises and date ideas you can book, events on Valentine's weekend (Feb 12 to 15) and where to eat, all checked by Wayfind.`,
  dinner: dinnerLinks(r.id),
})));

const IMG = "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-400x400/";
const IMAGE_RX = /^https:\/\/(?:media-cdn\.tripadvisor\.com|media\.tacdn\.com|cache-graphicslib\.viator\.com)\//;
const CODE_RX = /^\d+P\d+$/;

// code, Wayfind display name (dash free), area id, start town, snapshot
// fromPrice USD, rating, reviews, minutes, image path, one line why go (facts
// from the product itself: what it is, where, how long).
export const VALENTINES_EXPERIENCES = Object.freeze([
  ["294808P1", "Island Sunset and Skyway Light Show Cruise", "tampa-bay", "St. Petersburg", 85, 4.9, 2426, 180, "10/15/67/02.jpg", "Three hours on the water from St. Pete: watch the sun go down over the islands, then the Sunshine Skyway bridge light up after dark."],
  ["173028P3", "Clear Kayak Sunset and Glow Tour at Shell Key", "tampa-bay", "St. Petersburg", 89, 5, 759, 90, "0e/a4/32/84.jpg", "Paddle a see through kayak at Shell Key Preserve as the sun sets, then glide back with the kayak lit from below."],
  ["30627P3", "Semi Private Sunset Cruise in St. Pete", "tampa-bay", "St. Petersburg", 79, 4.9, 485, 120, "11/cc/8a/e0.jpg", "A two hour sunset cruise in a small group, a quieter way to share the sunset than a big party boat."],
  ["172289P1", "Sunset Sail on the Schooner Clearwater", "tampa-bay", "Clearwater", 80, 4.9, 281, 120, "r/32/86/d2/3e/caption.jpg", "Two hours under sail off Clearwater Beach on a classic schooner, timed for sunset over the Gulf."],
  ["186615P1", "Clear Kayak Sunset Tour on the Winter Park Lakes", "orlando", "Winter Park", 80, 5, 202, 120, "0b/7f/d0/23.jpg", "Paddle the canals of the Winter Park Chain of Lakes in a clear kayak at golden hour, past lakeside mansions."],
  ["105290P16", "Date Night Glow Kayak or Paddleboard with Champagne", "orlando", "Orlando", 80, 5, 21, 120, "15/c6/16/55.jpg", "A two hour LED lit clear kayak or paddleboard outing near Orlando, sold as a date night with champagne."],
  ["5039P2", "Sunset Airboat Ride near Orlando", "orlando", "Orlando", 80, 4.7, 170, 60, "12/05/0a/da.jpg", "One hour skimming the marsh by airboat at sunset, a wild Florida date away from the theme parks."],
  ["288880P2", "Private Sunset or Night Boat Cruise in Miami", "miami", "Miami", 215, 4.9, 682, 120, "r/33/cc/ad/19/caption.jpg", "Two hours on Biscayne Bay with just your group, past the skyline and the Venetian Islands at sunset or after dark."],
  ["150219P1", "Biscayne Bay Sail with Snorkeling", "miami", "Miami", 129, 4.9, 463, 210, "07/a0/59/71.jpg", "A small sailboat outing on Biscayne Bay with a snorkel stop, three and a half hours off the mainland."],
  ["231628P3", "Private Sunset Helicopter Tour over Miami Beach", "miami", "Miami", 314, 5, 30, 40, "r/33/2e/03/57/caption.jpg", "Forty minutes in the air over Miami Beach at sunset, private to your party."],
  ["136885P1", "Siesta Key Electric Bike Sunset Tour", "sarasota-bradenton", "Siesta Key", 80, 4.9, 1110, 120, "07/18/e1/45.jpg", "Ride e-bikes around Siesta Key with a guide and end on the sand for sunset."],
  ["203023P2", "Anna Maria Island Dolphin Sunset Boat Tour", "sarasota-bradenton", "Anna Maria Island", 58, 4.9, 446, 120, "09/6f/7e/e2.jpg", "Two hours looking for dolphins off Anna Maria Island, timed so the cruise ends at sunset."],
  ["454941P1", "Sunset Kayaking with Dolphins in Sarasota", "sarasota-bradenton", "Sarasota", 60, 5, 163, 120, "12/4a/2c/15.jpg", "A guided two hour sunset paddle in Sarasota's bay waters, where dolphins often feed at dusk."],
  ["243393P3", "Clear Kayak Sunset and Light Tour near Fort Myers Beach", "southwest", "Bonita Springs", 79, 5, 68, 120, "12/29/9f/60.jpg", "Two hours in a lit clear kayak from Bonita Springs toward Fort Myers Beach, starting at sunset."],
  ["416124P10", "Glow Kayak Sunset Paddle in Bonita Springs", "southwest", "Bonita Springs", 95, 5, 74, 150, "13/dd/15/4d.jpg", "A guided glow kayak paddle through the Bonita Springs backwaters as the light fades."],
  ["72655P4", "Sunset Cruise of St. Augustine", "jacksonville", "St. Augustine", 43, 4.8, 1368, 90, "07/c6/72/e8.jpg", "Ninety minutes on Matanzas Bay at sunset, with the old city, the fort and the Bridge of Lions in view."],
  ["72655P3", "Wine Tasting Cruise in St. Augustine", "jacksonville", "St. Augustine", 49, 4.9, 481, 90, "0b/39/db/5f.jpg", "A ninety minute cruise around St. Augustine's waterfront with a wine tasting on board."],
  ["64386P2", "Red Boat Adults Only Sunset Cruise in St. Augustine", "jacksonville", "St. Augustine", 42, 4.9, 359, 90, "12/d5/93/f6.jpg", "A ninety minute bring your own drinks sunset cruise in St. Augustine, with adults only departures."],
  ["275077P2", "Sunset Catamaran Sail in Cocoa Beach", "space-coast-daytona", "Cocoa Beach", 56, 4.9, 188, 120, "14/cb/08/88.jpg", "Two hours under sail on the Banana River at sunset, a short drive from Orlando."],
  ["353227P2", "Cocoa Beach Sunset Boat Tour", "space-coast-daytona", "Cocoa Beach", 39, 4.9, 337, 120, "10/0b/6f/83.jpg", "A two hour sunset boat tour from Cocoa Beach through the river and mangroves."],
  ["5508814P3", "Key West Sunset Sail on the Schooner Appledore", "keys", "Key West", 89, 5, 363, 120, "r/33/a2/af/08/caption.jpg", "Two hours under sail off Key West on a classic tall ship, timed for the famous sunset."],
  ["103151P2", "Key West Sunset Sail Cruise", "keys", "Key West", 95, 4.9, 294, 120, "0e/1a/77/63.jpg", "A two hour sunset sail out of Key West harbor."],
  ["5617365P2", "Florida Keys Sunset Cruise with Champagne and Seafood", "keys", "Key West", 85, 5, 26, 120, "17/0b/4c/92.jpg", "A two hour sunset cruise in the Keys with a champagne toast and seafood on board."],
  ["329308P2", "Private Sunset Cruise in Key Largo", "keys", "Key Largo", 449, 5, 46, 120, "0d/5c/d6/f8.jpg", "Two hours on a private boat off Key Largo at sunset, just the two of you or your group."],
].map(([code, name, region, place, fromPrice, rating, reviews, minutes, image, pitch]) => Object.freeze({
  code, name, region, place, fromPrice, rating, reviews, minutes, image: image ? IMG + image : null, pitch,
})));

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const normCity = (c) => String(c || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
const CITY_TO_REGION = new Map(VALENTINES_REGIONS.flatMap((r) => r.cities.map((c) => [c, r.id])));
export const valentinesRegionForCity = (city) => CITY_TO_REGION.get(normCity(city)) || null;
export const valentinesRegion = (id) => VALENTINES_REGIONS.find((r) => r.id === id) || null;
export const valentinesRegionPath = (id) => VALENTINES_HUB_PATH + "/" + id;

/** A row running at least one day of Valentine's weekend (Fri Feb 12 to Mon Feb 15, 2027). */
export function inValentinesWindow(row, from = VALENTINES_FROM, to = VALENTINES_TO) {
  const start = String(row?.start_date || "");
  const end = String(row?.end_date || row?.start_date || "");
  return ISO_DAY.test(start) && start <= to && end >= from;
}

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (d) => `${M[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

function priceLabel(row) {
  if (row.is_free === true) return "Free";
  const min = row.price_min == null ? null : Number(row.price_min);
  if (Number.isFinite(min) && min > 0) return "From $" + (Number.isInteger(min) ? min : min.toFixed(2));
  return null;
}

function eventCard(row, today) {
  const ticket = eventDetailTicketAction(row, { surface: VALENTINES_SURFACE, today });
  const end = row.end_date && row.end_date !== row.start_date ? row.end_date : null;
  // A season that opened before the weekend (a snow park, a fair) shows the
  // weekend's first day, so the badge never suggests it starts in November.
  const shown = row.start_date < VALENTINES_FROM ? VALENTINES_FROM : row.start_date;
  return {
    key: "wf:" + row.event_id,
    source: "curated",
    id: row.event_id,
    name: row.event_name,
    city: row.city,
    venue: row.venue || null,
    region: valentinesRegionForCity(row.city),
    start: row.start_date,
    badge: { top: monthDay(shown), bottom: row.start_date < VALENTINES_FROM ? "open" : (end ? "to " + monthDay(end) : "2027") },
    when: dateRangeLabel(row),
    price: priceLabel(row),
    hook: row.card_hook || null,
    fireworks: false,
    detailHref: row.slug ? "/florida-events/" + encodeURIComponent(row.slug) : null,
    officialHref: eventWebsiteUrl(row) || null,
    ticket: ticket ? { href: ticket.href, label: ticket.label, rel: ticket.kind === "affiliate" ? "sponsored noopener" : "noopener nofollow", seller: null } : null,
    centralTime: false,
    jsonLd: eventJsonLd(row),
  };
}

export function valentinesExperienceHref(code) {
  if (!CODE_RX.test(String(code || ""))) return null;
  if (isDeniedViatorSku(code)) return null;
  return commerceHref({ provider: "viator", offerId: code, surface: VALENTINES_SURFACE, contentId: "vday-" + code, page: VALENTINES_PAGE_KEY });
}

const DASH_RX = /[‒-―−]|\s-\s/;

/**
 * One experience card from a snapshot row, overlaid by its live wf_experiences
 * row when the read ran. A row the sweep marked dead, one that left the
 * catalogue, or one with no positive price drops the card.
 */
export function valentinesExperienceCard(base, live) {
  if (!base) return null;
  if (live === undefined) return null; // the read ran and the product is gone
  if (live && (live.link_ok === false || ("from_price" in live && !(Number(live.from_price) > 0)))) return null;
  const price = live && Number(live.from_price) > 0 ? Number(live.from_price) : base.fromPrice;
  if (!(Number(price) > 0)) return null;
  const href = valentinesExperienceHref(base.code);
  if (!href) return null;
  const rating = live && Number(live.rating) > 0 ? Number(live.rating) : base.rating;
  const reviews = live && Number(live.reviews) > 0 ? Number(live.reviews) : base.reviews;
  const minutes = live && Number(live.duration_min) > 0 ? Number(live.duration_min) : base.minutes;
  const liveImage = live && IMAGE_RX.test(String(live.image || "")) ? live.image : null;
  const image = liveImage || base.image;
  const card = {
    key: "vx:" + base.code,
    id: base.code,
    name: base.name,
    region: base.region,
    place: base.place,
    pitch: base.pitch,
    duration: tourDuration(minutes),
    rating,
    reviews,
    price: "From $" + Math.round(price),
    image: image ? { src: image, alt: "Photo of " + base.name + " from Viator" } : null,
    href,
    cta: VALENTINES_CTA,
  };
  const text = [card.name, card.pitch, card.place, card.cta].join(" ");
  if (DASH_RX.test(text) || /\bbest\b|#1|sold out/i.test(text)) return null;
  return card;
}

const byRating = (a, b) => (b.rating - a.rating) || (b.reviews - a.reviews) || a.name.localeCompare(b.name);

/**
 * The page model. `liveExperiences` is a Map of product_code to live row, or
 * null when the read could not run (then the snapshot stands).
 */
export function valentinesModel(rows, today, { now = new Date(), liveExperiences = null } = {}) {
  if (!ISO_DAY.test(String(today || ""))) throw new Error("valentinesModel requires an Eastern calendar date");
  const seen = new Set();
  const events = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && inValentinesWindow(row) && isEligible(row, { now }) && isFloridaEvent(row))
    .filter((row) => (seen.has(row.event_id) ? false : (seen.add(row.event_id), true)))
    .map((row) => eventCard(row, today))
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  const experiences = VALENTINES_EXPERIENCES
    .map((base) => valentinesExperienceCard(base, liveExperiences ? liveExperiences.get(base.code) : null))
    .filter(Boolean);
  const open = today <= VALENTINES_TO;
  const regions = VALENTINES_REGIONS.map((region) => {
    const regionEvents = events.filter((c) => c.region === region.id);
    const regionExperiences = experiences.filter((c) => c.region === region.id).sort(byRating);
    const count = regionEvents.length + regionExperiences.length;
    return { ...region, path: valentinesRegionPath(region.id), events: regionEvents, experiences: regionExperiences, count, hasPage: open && count >= VALENTINES_MIN_REGION_ITEMS };
  });
  return { today, events, experiences, regions, elsewhere: events.filter((c) => !c.region) };
}

export function valentinesRegionPageIds(model) {
  return model.regions.filter((r) => r.hasPage).map((r) => r.id);
}

// Questions people search, answered only with dates and listings Wayfind holds.
export function valentinesFaq(model) {
  const free = model.events.filter((c) => c.price === "Free").map((c) => c.name);
  const cruises = model.experiences.filter((c) => /\b(cruise|sail)\b/i.test(c.name)).map((c) => c.place);
  const towns = [...new Set(cruises)].slice(0, 5);
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
  // Name events that start on the weekend first (a season already open is not
  // news), then ones in a named area with a ticket button. Never by commission:
  // a ticket button only means the reader can act on the name.
  // Names with their own commas, colons or dashes would garble the sentence.
  const weight = (c) => (/[,:;\u2012-\u2015-]/.test(c.name) ? -8 : 0) + (c.start >= VALENTINES_FROM ? 4 : 0) + (c.region ? 2 : 0) + (c.ticket ? 1 : 0);
  const named = [...model.events].sort((a, b) => weight(b) - weight(a) || a.start.localeCompare(b.start)).slice(0, 4).map((c) => c.name);
  const faq = [
    { q: "What day is Valentine's Day 2027?", a: "Valentine's Day 2027 is Sunday, February 14. Presidents Day follows on Monday, February 15, so many people have a three day weekend from Friday, February 12." },
    { q: "Should I celebrate on Saturday or Sunday?", a: "With February 14 on a Sunday, you can choose Saturday night, Sunday brunch or a Sunday sunset. Whichever you pick, book dinner and any cruise early, and ask whether the restaurant serves a set Valentine's menu that night." },
  ];
  if (towns.length) faq.push({ q: "What are romantic things to do in Florida for Valentine's Day?", a: `A sunset cruise or sail is the classic Florida date, and Wayfind lists ones you can book in ${list(towns)}. Clear kayak glow tours, e-bike sunset rides and a private boat are the other popular picks. Each listing above shows the price from, the length and the rating on Viator.` });
  if (model.events.length) faq.push({ q: "What events are on in Florida on Valentine's weekend 2027?", a: `Wayfind has ${model.events.length} events running between February 12 and 15, 2027${free.length ? `, ${free.length} of them free` : ""}, including ${list(named)}. Pick your area above to see dates, places and tickets.` });
  faq.push({ q: "Is February a good time for a Florida Valentine's getaway?", a: "February is peak season across most of Florida, so hotels and sunset tours on Valentine's weekend can book up. Reserve a few weeks ahead, and pack a light jacket for evenings on the water." });
  return faq;
}

export function valentinesFaqSchema(faq) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}
