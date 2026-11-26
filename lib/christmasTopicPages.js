// lib/christmasTopicPages.js: the Christmas in Florida overview pages Google
// can rank for the searches people actually type (owner, 2026-11-25).
//
// Search Console, Oct 27 to Nov 23: the event pages sat around spot 8 to 10
// for "zoo lights 2026" (218 impressions), "festival of lights 2026" (267),
// "light up ocala 2026" (419), Nutcracker searches (377) and 112 parade pages
// (10,800 impressions, 31 clicks). Nothing on the site answered the whole
// question ("every Christmas parade in Florida"), so each search landed on one
// town's page. These pages list every matching listing from the SAME statewide
// Christmas directory /christmas-in-florida browses (lib/christmasBrowse.js),
// grouped by region, each row linking to its own event page.
//
// Facts come only from the listing (dates, times, price, ticket button). A
// topic with no live listing renders an honest empty state, never filler.
import { CHRISTMAS_REGIONS, filterChristmasBrowse, parseChristmasBrowseQuery } from "./christmasBrowse.js";
import { floridaMapPoint } from "./floridaMap.js";

const SEASON_END = "2027-01-06";

// slug -> page. `category` is a browse category or pill id; `nameMatch` keeps a
// listing whose name, title or venue matches. Both apply when both are set.
export const CHRISTMAS_TOPIC_PAGES = Object.freeze({
  parades: Object.freeze({
    slug: "parades",
    category: "parades",
    // A map of every parade (owner, 2026-11-25: "Florida's Christmas parades, mapped").
    map: true,
    label: "Christmas parades",
    title: "Florida Christmas Parades 2026: Dates, Times and Cities",
    h1: "Florida Christmas Parades 2026",
    description: "Every Florida Christmas parade and boat parade we list for 2026, by region and city, with the date, start time and whether it is free. Updated through the season.",
    intro: "Christmas parades in Florida run from late November into mid December, and most are free. Find your town below, then open its page for the start time, route notes and where to watch. Boat parades are listed too, since in coastal towns the parade is on the water.",
    keywords: ["florida christmas parades 2026", "christmas parade 2026", "christmas parade near me", "christmas boat parade 2026"],
    faq: [
      ["Are Florida Christmas parades free?", "Most parades we list are free to watch from the street or the shore. A boat parade cruise or a reserved seat costs extra, and those listings show the price."],
      ["When are Florida Christmas parades?", "The parades we list run from the weekend after Thanksgiving into mid December, mostly on Friday and Saturday evenings. Each listing shows its own date and start time."],
      ["Where should I watch a boat parade?", "Pick a public park, pier or waterfront restaurant on the route. Open the parade's page for the route notes, and arrive early because waterfront parking fills first."],
    ],
  }),
  "light-shows": Object.freeze({
    slug: "light-shows",
    category: "lights",
    label: "Christmas light shows",
    title: "Florida Christmas Light Shows 2026: Dates and Tickets",
    h1: "Florida Christmas Light Shows 2026",
    description: "Florida Christmas light shows for 2026: drive thru lights, garden light walks, zoo lights and festivals of lights, by region, with dates, hours, prices and tickets.",
    intro: "Florida's Christmas light shows come in three kinds: drive thru displays you see from the car, garden and zoo light walks, and town festivals of lights. Many need a timed ticket on weekends, so check the dates and book ahead. Open any show for hours, closed nights and parking.",
    keywords: ["florida christmas light shows 2026", "christmas lights florida", "festival of lights 2026", "drive thru christmas lights florida", "best christmas lights in florida"],
    faq: [
      ["Do I need tickets for Florida Christmas light shows?", "Many garden, zoo and drive thru shows sell tickets for set nights or entry times, while town festivals of lights and neighborhood displays are often free. Each listing shows its price."],
      ["What are the best drive thru Christmas lights in Florida?", "Drive thru displays are listed under each region below. Compare the price per car, the closing date and whether the show runs every night before you go."],
      ["When do Florida light shows close?", "Many run into early January, and some skip certain nights. Check the listing's dates and the organizer's calendar before you drive."],
    ],
  }),
  "zoo-lights": Object.freeze({
    slug: "zoo-lights",
    category: "lights",
    nameMatch: /\bzoo|zoolights|lantern/i,
    label: "Zoo lights",
    title: "Zoo Lights in Florida 2026: Dates, Hours and Tickets",
    h1: "Zoo Lights in Florida 2026",
    description: "Every Florida zoo holiday light show we list for 2026, including Jacksonville ZOOLights, Palm Beach Zoo Lights and Zoo Lights Miami, with dates, hours and tickets.",
    intro: "Several Florida zoos turn into holiday light walks after dark from late November into January. Tickets are usually separate from daytime zoo admission and sold for set nights. Open a show below for its dates, hours and ticket link.",
    keywords: ["zoo lights 2026", "zoolights 2026", "jacksonville zoo lights 2026", "palm beach zoo lights", "zoo lights miami"],
    faq: [
      ["Is zoo lights included with zoo admission?", "Check the zoo's ticket page first: holiday light nights are often sold as their own evening ticket. Each listing shows the price the zoo announced."],
      ["When do Florida zoo lights run?", "Each listing shows the dates the zoo announced. Some run on select nights only, so check the zoo's calendar for the night you want."],
    ],
  }),
  nutcracker: Object.freeze({
    slug: "nutcracker",
    nameMatch: /nutcracker/i,
    label: "The Nutcracker",
    title: "Nutcracker in Florida 2026: Ballets, Dates and Tickets",
    h1: "The Nutcracker in Florida 2026",
    description: "Every Nutcracker ballet in Florida we list for 2026, by region and city: Orlando, Tampa, Sarasota, Tallahassee, Jacksonville, Miami and more, with dates and tickets.",
    intro: "Nearly every Florida city has its own Nutcracker in December, from big company productions to local ballet schools. Pick your city below, then open the show for performance dates, the venue and tickets. Matinees usually suit younger children best.",
    keywords: ["nutcracker florida 2026", "nutcracker ballet near me 2026", "tallahassee nutcracker 2026", "orlando nutcracker 2026", "nutcracker tampa 2026"],
    faq: [
      ["Where can I see The Nutcracker in Florida?", "Every production we list is below, grouped by region, with its city, venue and dates. Open a show for its performances and tickets."],
      ["Which Nutcracker show is best for young kids?", "A matinee is usually the easiest choice for young children. Check the venue's age guidance and whether children need their own ticket before you buy."],
    ],
  }),
});

export const CHRISTMAS_TOPIC_SLUGS = Object.freeze(Object.keys(CHRISTMAS_TOPIC_PAGES));
export const christmasTopicPath = (slug) => "/christmas-in-florida/" + slug;
export const christmasTopicPage = (slug) => (Object.prototype.hasOwnProperty.call(CHRISTMAS_TOPIC_PAGES, slug) ? CHRISTMAS_TOPIC_PAGES[slug] : null);

// The topic links /christmas-in-florida and event pages show. Ordered by the
// size of the search behind each (Search Console, Nov 2026).
export function christmasTopicLinks(today) {
  if (today && today > SEASON_END) return [];
  return CHRISTMAS_TOPIC_SLUGS.map((slug) => ({ href: christmasTopicPath(slug), label: CHRISTMAS_TOPIC_PAGES[slug].h1 }));
}

const nameOf = (card) => [card.name, card.title, card.venue].filter(Boolean).join(" ");

// Listings for one topic: events only (a place or a tour is not a dated
// listing with its own page), filtered by the browse category and/or name.
export function christmasTopicCards(listings, slug, today) {
  const topic = christmasTopicPage(slug);
  if (!topic) return [];
  const pool = (Array.isArray(listings) ? listings : []).filter((card) => card && card.kind !== "place" && card.kind !== "tour");
  const byCategory = topic.category ? filterChristmasBrowse(pool, parseChristmasBrowseQuery({ category: topic.category }), today) : pool;
  const matched = topic.nameMatch ? byCategory.filter((card) => topic.nameMatch.test(nameOf(card))) : byCategory;
  // One row per listing id (the directory can hold a research twin).
  const seen = new Set();
  return matched.filter((card) => (card.id && !seen.has(card.id) ? (seen.add(card.id), true) : false));
}

function firstDate(card, today) {
  if (card.season_undated || !card.start_date) return "9999-12-31";
  const nights = (card.occurrence_dates || []).filter((d) => d >= today);
  if (nights.length) return nights[0];
  return card.start_date > today ? card.start_date : today;
}

// Regions in the browse's north to south order; inside a region, soonest
// first, then by city and name so the order is stable.
export function groupChristmasTopicCards(cards, today) {
  const order = new Map(CHRISTMAS_REGIONS.map((r, i) => [r, i]));
  const groups = new Map();
  for (const card of cards) {
    const region = order.has(card.region) ? card.region : "More of Florida";
    if (!groups.has(region)) groups.set(region, []);
    groups.get(region).push(card);
  }
  const rank = (r) => (order.has(r) ? order.get(r) : 99);
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([region, list]) => ({
    region,
    id: region.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    cards: list.slice().sort((a, b) => firstDate(a, today).localeCompare(firstDate(b, today))
      || String(a.city || "").localeCompare(String(b.city || "")) || String(a.name || "").localeCompare(String(b.name || ""))),
  }));
}

// A summary page's structured data: an ItemList of the event pages it links
// (Google puts Event markup on each single event page, never on a roundup) and
// the breadcrumb back to the Christmas hub.
export function christmasTopicSchema(topic, groups, siteUrl) {
  const url = siteUrl + christmasTopicPath(topic.slug);
  const items = groups.flatMap((g) => g.cards).filter((c) => c.detailHref).slice(0, 100);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: topic.title, description: topic.description,
        mainEntity: { "@type": "ItemList", numberOfItems: items.length, itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: [c.name || c.title, c.city].filter(Boolean).join(", "), url: siteUrl + c.detailHref })) } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wayfind", item: siteUrl },
        { "@type": "ListItem", position: 2, name: "Christmas in Florida", item: siteUrl + "/christmas-in-florida" },
        { "@type": "ListItem", position: 3, name: topic.h1, item: url },
      ] },
      { "@type": "FAQPage", mainEntity: topic.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
}

// Which topic page an event belongs to, for the "see every ..." link on its
// own page. Nutcracker and zoo lights are checked before their broad parents.
export function christmasTopicForEvent(e) {
  if (!e) return null;
  const text = [e.event_name, e.short_title, e.venue, e.subcategory, e.category, ...(Array.isArray(e.tags) ? e.tags : [])].filter(Boolean).join(" ");
  if (/nutcracker/i.test(text)) return christmasTopicPage("nutcracker");
  if (/\bzoo ?lights|zoolights/i.test(text)) return christmasTopicPage("zoo-lights");
  // Parades and light shows only when the listing is a holiday one: a spring
  // parade or a glow run is not a Christmas page's business.
  const holiday = e.category === "holiday" || /christmas|holiday|xmas|santa|noel|yule|winter|festival of lights|light up|jingle/i.test(text);
  if (!holiday) return null;
  if (/parade/i.test(text)) return christmasTopicPage("parades");
  if (/\blights\b|light shows?|light up|glow|lantern/i.test(text) && !/tree lighting/i.test(text)) return christmasTopicPage("light-shows");
  return null;
}

// The rows a topic page renders: each listing with the same ticket fields
// (dates line, price, partner or organizer button) the Christmas browse shows.
export function christmasTopicRows(cards, today, dealsById, ticketFields) {
  return cards.map((card) => ({ ...card, ticketRow: ticketFields(card, today, dealsById) }));
}

const isBoat = (card) => (card.browse_categories || []).includes("boat-parade") || /\bboat|regatta|flotilla/i.test(String(card.name || card.title || ""));
const oneDay = (card) => card.start_date && !card.season_undated && (!card.end_date || card.end_date === card.start_date) ? card.start_date : null;

// The map and the headline numbers above it, computed from the same rows the
// list shows (nothing typed in). Only a listing with a real venue coordinate
// gets a dot: an approximate (city level) pin is left off the map, never moved.
export function christmasTopicMap(cards, today) {
  const list = Array.isArray(cards) ? cards : [];
  const points = [];
  for (const card of list) {
    if (card.approxLocation || card.coord_approx === true) continue;
    const pt = floridaMapPoint(card.lat, card.lng);
    if (pt) points.push({ id: card.id, x: pt.x, y: pt.y, boat: isBoat(card), name: card.name || card.title, city: card.city || "", date: oneDay(card), href: card.detailHref || null });
  }
  const byDate = new Map();
  for (const card of list) { const d = oneDay(card); if (d && d >= today) byDate.set(d, (byDate.get(d) || 0) + 1); }
  let busiest = null;
  for (const [date, n] of byDate) if (!busiest || n > busiest.n || (n === busiest.n && date < busiest.date)) busiest = { date, n };
  const boats = list.filter(isBoat).length;
  return {
    points,
    total: list.length,
    boats,
    street: list.length - boats,
    cities: new Set(list.map((c) => String(c.city || "").trim()).filter(Boolean)).size,
    busiest,
  };
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function christmasTopicLongDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
