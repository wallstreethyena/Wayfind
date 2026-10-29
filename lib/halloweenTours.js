// Viator Halloween ghost tours for /halloween-in-florida.
//
// Every tour below is a real Viator product already in wf_experiences
// (provider viator, link_ok true, last link check in October 2026). The card
// books through /api/commerce/go by opaque product code (commerceHref), so the
// partner URL never reaches the page; the go route re-reads the row and fails
// closed if the nightly sweep later proves the product dead.
//
// Names are Wayfind's own dash free display names, not Viator's titles, so the
// page copy guard (no dashes, no "best", no "#1") holds for every card.
//
// TOUR_SNAPSHOT values were read from wf_experiences on 2026-10-28. At render
// time withHalloweenTours() re-reads the same rows and lets the live price,
// rating, reviews and image win; a row the sweep marked dead is dropped. When
// the read fails the snapshot renders, never an empty section.
//
// Order is merit only (Viator rating weighted by review count). It is never
// commission.
import { destinationUrl } from "./destinations.js";
import { viatorProductGoUrl } from "./affiliates.js";
import { commerceHref, withPageParam } from "./commerce.js";
import { hauntCopyProblems } from "./halloweenHauntVault.js";
import { isDeniedViatorSku } from "./viatorDenylist.js";

export const HALLOWEEN_TOUR_SURFACE = "halloween_haunts";
export const HALLOWEEN_TOUR_PAGE = "halloween-in-florida";
export const HALLOWEEN_TOUR_CTA = "See availability ↗";
export const HALLOWEEN_TOUR_VIA = "Tour tickets at Viator";

// Founder pick, Oct 29. Order is the approved list, not commission and not
// the merit sort used for the full tour section. Names, prices, ratings,
// review counts and images stay on the snapshot row (live wf_experiences
// overlay wins at render). Nothing here is typed in by hand.
export const FEATURED_GHOST_TOUR_CODES = Object.freeze([
  "272079P3",
  "369692P1",
  "122676P1",
  "38620P1",
  "333531P1",
  "120329P6",
]);

// City destination pages, not product codes. They cannot ride /api/commerce/go
// (that route resolves a catalogue offer id). They use the same tracked
// product passthrough guides use (viatorProductGoUrl -> /api/viator/go), with
// page=halloween-in-florida so the campaign is wf-<page>-<surface>-<offer>.
// Each surface stays distinct inside viatorPlacementCode's 12 character slug.
// Tampa and Orlando URLs come from lib/destinations.js. St. Augustine and
// Key West use that same /City/dNNN-ttd shape; those markets are not in MARKETS.
export const GHOST_DESTINATIONS = Object.freeze([
  { id: "tampa", label: "Tampa ghost tours", city: "Tampa", slug: "Tampa", destId: "d666", surface: "gt-tampa", market: "tampa" },
  { id: "orlando", label: "Orlando ghost tours", city: "Orlando", slug: "Orlando", destId: "d663", surface: "gt-orlando", market: "orlando" },
  { id: "staug", label: "St. Augustine ghost tours", city: "St. Augustine", slug: "St-Augustine", destId: "d823", surface: "gt-staug", market: "" },
  { id: "keywest", label: "Key West ghost tours", city: "Key West", slug: "Key-West", destId: "d661", surface: "gt-keywest", market: "" },
]);

export const TOUR_REGIONS = Object.freeze([
  { id: "all", label: "All Tours" },
  { id: "tampa", label: "Tampa Bay & Sarasota" },
  { id: "orlando", label: "Orlando Area" },
  { id: "staug", label: "St. Augustine" },
  { id: "more", label: "Key West & More" },
]);

// Rows removed in the 2026-10-28 audit (kept here so the reason is not lost and
// a test can prove they never come back):
//   28841P2 Creatures of the Night at ZooTampa: same event as the zooTampa haunt card.
//   3805P8  Mickey's Not So Scary Party: same event as the mickey haunt card.
//   186615P2, 329335P6 kayak glow tours: nature tours, not Halloween or ghost products.
//   74607P5 VIP Tampa Ghost Hunters: the stored Viator URL slug is Ybor City Mobsters
//           and Mayhem Tour (name and destination disagree), 3.0 stars on 4 reviews.
export const TOUR_REMOVED = Object.freeze({
  "28841P2": "duplicate of the zooTampa haunt card",
  "3805P8": "duplicate of the mickey haunt card",
  "186615P2": "not a Halloween or ghost product (kayak)",
  "329335P6": "not a Halloween or ghost product (kayak)",
  "74607P5": "our redirect resolves to Viator's Ybor City Mobsters and Mayhem Tour, not a ghost hunt; 3.0 stars on 4 reviews",
});

// Viator products that are a haunted attraction, not a guided ghost tour. They
// show with the haunts by default; every other row is a ghost tour (guided
// ghost, true crime, paranormal, pub crawl, trolley or audio walk) and sits
// behind the "Ghost tours" chip.
export const TOUR_EVENT_CODES = Object.freeze(["180859P9"]);

// code, name, place, region, snapshot (fromPrice USD, rating, reviews, minutes, image)
const IMG = "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-400x400/";
export const TOUR_SNAPSHOT = Object.freeze([
  ["272079P1", "Tampa Terrors Ghost Tour", "Downtown Tampa", "tampa", 26, 4.6, 148, 60, "r/35/0b/92/02/caption.jpg"],
  ["369692P1", "Official Downtown Tampa Ghost Tour", "Downtown Tampa", "tampa", 30, 4.7, 97, 120, "13/f0/5a/8a.jpg"],
  ["369692P3", "Official Ybor City Ghost Tour", "Ybor City, Tampa", "tampa", 35, 4.8, 84, 90, "12/5d/0c/6d.jpg"],
  ["430526P2", "SpookEasy Paranormal Investigation, Ages 18 and Up", "Tampa", "tampa", 35, 5, 52, 120, "11/d7/b1/0f.jpg"],
  ["430526P1", "SpookEasy Interactive Ghost Investigation Tour", "Ybor City, Tampa", "tampa", 35, 5, 40, 120, "11/dd/73/8a.jpg"],
  ["272079P3", "Spirits and Spirits Haunted Pub Crawl", "Tampa", "tampa", 29, 4.9, 8, 120, "13/bd/f5/c6.jpg"],
  ["74607P3", "Ghost Hunters Paranormal Ghost Tour", "Tampa", "tampa", 39, 4.2, 33, 120, "12/56/f8/0d.jpg"],
  ["319796P1", "Safety Harbor Ghost Tour and True Crime", "Safety Harbor", "tampa", 40, 4.8, 62, 90, "r/33/cb/d0/40/caption.jpg"],
  ["319796P3", "Tarpon Springs Ghost Tour and True Crime", "Tarpon Springs", "tampa", 40, 4.7, 21, 90, "r/34/c2/58/2d/caption.jpg"],
  ["120329P6", "Haunted Sarasota Ghost Trolley", "Sarasota", "tampa", 92, 4.6, 85, 90, "r/34/c8/21/79/caption.jpg"],
  ["120329P20", "Murder Mystery Trolley Who Killed the Circus Queen", "Sarasota", "tampa", 92, 4.8, 101, 90, "r/34/c8/1f/e4/caption.jpg"],
  ["120329P4", "Psychic Sundays Trolley Tour", "Sarasota", "tampa", 73, 4.9, 28, 120, "17/14/4c/dc.jpg"],
  ["122676P1", "Downtown Orlando Interactive Ghost Walk", "Downtown Orlando", "orlando", 78, 4.9, 775, 120, "07/18/15/71.jpg"],
  ["122676P5", "Mount Dora Paranormal Ghost Tour", "Mount Dora", "orlando", 78, 4.9, 56, 120, "16/9c/4c/43.jpg"],
  ["272075P1", "Ominous Otherworld Orlando Ghost Tour", "Downtown Orlando", "orlando", 26, 4.2, 50, 60, "r/34/f0/fb/f8/caption.jpg"],
  ["122676P2", "A Toast to the Ghost Haunted Pub Crawl", "Downtown Orlando", "orlando", 45, 5, 5, 120, "16/85/94/0b.jpg"],
  ["214509P1", "Sanford Ghost Tour", "Sanford", "orlando", 29, 4.4, 16, 90, "15/c6/b3/90.jpg"],
  ["214627P3", "Ghosts of Winter Park Walking Tour", "Winter Park", "orlando", 42, 5, 5, 90, "0a/ef/32/43.jpg"],
  ["107194P211", "Haunted Orlando Downtown Ghost Hunt Game", "Downtown Orlando", "orlando", 6, 3, 4, 75, "0e/a5/17/90.jpg"],
  ["38620P1", "A Ghostly Encounter Walking Ghost Tour", "St. Augustine", "staug", 30, 4.7, 2479, 90, "0a/cb/ce/5a.jpg"],
  ["5046OLDJAIL", "The Old Jail of St. Augustine Tour", "St. Augustine", "staug", 19, 4.8, 738, 30, "06/6e/b8/ea.jpg"],
  ["309492P3", "The Original Haunted History Ghost Tour", "St. Augustine", "staug", 27, 4.9, 432, 90, "0f/0e/0e/d0.jpg"],
  ["177935P13", "Booze and Boos Haunted Walking Tour", "St. Augustine", "staug", 34, 5, 53, 150, "13/c5/8f/41.jpg"],
  ["5046P21", "Old Jail After Dark Paranormal Experience", "St. Augustine", "staug", 106, 5, 25, 150, "12/65/0d/2e.jpg"],
  ["333814P8", "The Last Stop Golf Cart Paranormal Investigation", "St. Augustine", "staug", 200, 4.7, 20, 105, "11/5a/5a/43.jpg"],
  ["290679P5", "Tarot Walk and Ghost Stroll", "St. Augustine", "staug", 27, 5, 9, 90, "0b/f3/41/e4.jpg"],
  ["5567095P1", "Haunted in Pink Ghost Tour", "St. Augustine", "staug", 270, 5, 2, 60, "15/af/08/8c.jpg"],
  ["209615P123", "Haunted Echoes Private Ghostly Adventure", "St. Augustine", "staug", 538, 5, 1, 120, "12/48/a4/5d.jpg"],
  ["344750P9", "St. Augustine True Crime History Tour", "St. Augustine", "staug", 39, 5, 1, 60, "16/00/7f/85.jpg"],
  ["415636P5", "Torrid Tales True Crime Walking Tour", "St. Augustine", "staug", 31, 5, 1, 90, "16/6e/92/7a.jpg"],
  ["110804P737", "Ghosts of St. Augustine North Side Audio Tour", "St. Augustine", "staug", 15, 5, 1, 80, "12/d8/1e/a4.jpg"],
  ["110804P557", "St. Augustine Haunted History Audio Tour", "St. Augustine", "staug", 9, 5, 1, 90, "0f/f0/45/bb.jpg"],
  ["469510P10", "Old City Ghost Walking Audio Tour", "St. Augustine", "staug", 5, 5, 1, 90, "15/94/b5/53.jpg"],
  ["333531P1", "VIP Robert the Doll After Dark Ghost Hunt", "Key West", "more", 99, 4.7, 170, 120, "0d/0a/c6/5f.jpg"],
  ["180859P9", "Fear at the Pier Haunted Attraction", "Panama City Beach", "more", 25, 4.9, 98, 20, "11/84/82/84.jpg"],
  ["333341P1", "Spanish Moss Jacksonville Ghost Tour", "Jacksonville", "more", 26, 4.1, 28, 60, "11/c6/ed/82.jpg"],
  ["471417P2", "Key West True Crime Walking Tour", "Key West", "more", 45, 5, 16, 90, "16/c1/8f/5c.jpg"],
  ["333531P2", "Haunted Key West Firehouse Ghost Tour", "Key West", "more", 95, 5, 8, 120, "17/0f/af/99.jpg"],
  ["333531P5", "Robert the Doll After Dark Fort Tour", "Key West", "more", 45, 4.9, 7, 60, "17/0f/ad/dc.jpg"],
  ["186588P10", "Key West After Dark Ghost and Voodoo Pedicab", "Key West", "more", 180, 5, 6, 90, "15/6e/b3/64.jpg"],
  ["201204P3", "Mayhem in the Mists Murder Mystery Pub Tour", "Jacksonville", "more", 30, 5, 5, 105, "r/32/e6/3d/86/caption.jpg"],
].map(([code, name, place, region, fromPrice, rating, reviews, minutes, image]) => Object.freeze({
  code, name, place, region, fromPrice, rating, reviews, minutes, image: IMG + image,
})));

const CODE_RX = /^\d+(?:P\d+|OLDJAIL)$/;
const IMAGE_RX = /^https:\/\/(?:media-cdn\.tripadvisor\.com|media\.tacdn\.com|cache-graphicslib\.viator\.com)\//;

export function tourDuration(minutes) {
  const m = Math.round(Number(minutes));
  if (!Number.isFinite(m) || m <= 0) return "";
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? h + " hr " + r + " min" : h + (h === 1 ? " hr" : " hrs");
}

export function tourRatingLabel(rating, reviews) {
  const r = Number(rating);
  const n = Number(reviews);
  if (!(r > 0) || !(n > 0)) return "";
  return r.toFixed(1) + " ★ · " + n.toLocaleString("en-US") + (n === 1 ? " review" : " reviews") + " on Viator";
}

// Rating shrunk toward 4.5 by 20 phantom reviews: 2,479 reviews at 4.7 beats
// 5 reviews at 5.0. Ties break on review count, then name, so order is stable.
export function tourMerit(t) {
  const n = Math.max(0, Number(t.reviews) || 0);
  const r = Number(t.rating) || 0;
  return (r * n + 4.5 * 20) / (n + 20);
}

export function tourHref(code) {
  if (!CODE_RX.test(String(code || ""))) return null;
  // A HOLD SKU (no bookable inventory) never gets a button, here or anywhere.
  if (isDeniedViatorSku(code)) return null;
  return commerceHref({
    provider: "viator",
    offerId: code,
    surface: HALLOWEEN_TOUR_SURFACE,
    contentId: "hw-tour-" + code,
    page: HALLOWEEN_TOUR_PAGE,
  });
}

/** One card model from a snapshot row, optionally overlaid by its live wf_experiences row. */
export function tourCard(base, live = null) {
  const price = live && Number(live.from_price) > 0 ? Number(live.from_price) : base.fromPrice;
  const rating = live && Number(live.rating) > 0 ? Number(live.rating) : base.rating;
  const reviews = live && Number(live.reviews) > 0 ? Number(live.reviews) : base.reviews;
  const minutes = live && Number(live.duration_min) > 0 ? Number(live.duration_min) : base.minutes;
  const image = live && IMAGE_RX.test(String(live.image || "")) ? live.image : base.image;
  const href = tourHref(base.code);
  if (!href) return null;
  return {
    id: base.code,
    group: TOUR_EVENT_CODES.includes(base.code) ? "event" : "ghost",
    filters: TOUR_EVENT_CODES.includes(base.code) ? ["local"] : [],
    name: base.name,
    place: base.place,
    region: base.region,
    fromPrice: price,
    priceLabel: "From $" + Math.round(price),
    rating,
    reviews,
    ratingLabel: tourRatingLabel(rating, reviews),
    duration: tourDuration(minutes),
    photo: { src: image, width: 400, height: 400, alt: "Photo of " + base.name },
    cta: { href, label: HALLOWEEN_TOUR_CTA, rel: "sponsored nofollow noopener", via: HALLOWEEN_TOUR_VIA },
  };
}

export function sortTours(cards) {
  return cards.slice().sort((a, b) => (tourMerit(b) - tourMerit(a)) || (b.reviews - a.reviews) || a.name.localeCompare(b.name));
}

/** Snapshot only cards (no network). Used for tests and as the read failure fallback. */
export function snapshotTours() {
  return sortTours(TOUR_SNAPSHOT.map((t) => tourCard(t)).filter(Boolean));
}

function anonEnv(env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!/^https:\/\//.test(url) || !key) return null;
  return { url, key };
}

/** Live rows for the curated codes, keyed by code. Null when the read could not run. */
export async function readTourRows(deps = {}) {
  const env = anonEnv(deps.env || process.env);
  if (!env) return null;
  const doFetch = deps.fetch || fetch;
  const codes = TOUR_SNAPSHOT.map((t) => '"' + t.code + '"').join(",");
  const url = env.url + "/rest/v1/wf_experiences?select=product_code,provider,from_price,rating,reviews,duration_min,image,link_ok"
    + "&provider=eq.viator&product_code=in.(" + encodeURIComponent(codes) + ")";
  try {
    const res = await doFetch(url, {
      headers: { apikey: env.key, Authorization: "Bearer " + env.key },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res || !res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    return new Map(rows.filter((r) => r && r.product_code).map((r) => [String(r.product_code), r]));
  } catch {
    return null;
  }
}

export function featuredGhostTours(tours) {
  const byId = new Map((Array.isArray(tours) ? tours : []).map((t) => [t.id, t]));
  return FEATURED_GHOST_TOUR_CODES.map((code) => byId.get(code)).filter(Boolean);
}

export function ghostDestinationProductUrl(dest) {
  if (dest && dest.market) {
    const known = destinationUrl("viator", dest.market);
    if (known) return known;
  }
  if (!dest || !dest.slug || !dest.destId) return null;
  return "https://www.viator.com/" + dest.slug + "/" + dest.destId + "-ttd";
}

export function ghostDestinationHref(dest) {
  const productUrl = ghostDestinationProductUrl(dest);
  if (!productUrl) return null;
  const go = viatorProductGoUrl(productUrl, dest.city, "tours", dest.surface);
  if (!go) return null;
  return withPageParam(go, HALLOWEEN_TOUR_PAGE);
}

// id, label, href, destId only. Slugs and surfaces stay off the model so a
// dash in a URL path cannot trip the visible copy walk. The surface is on
// the href query, which is what the go route reads for the campaign.
export function ghostDestinationLinks() {
  return GHOST_DESTINATIONS.map((dest) => {
    if (hauntCopyProblems({ label: dest.label }).length) return null;
    const href = ghostDestinationHref(dest);
    if (!href) return null;
    return { id: dest.id, label: dest.label, href, destId: dest.destId };
  }).filter(Boolean);
}

/**
 * Server side: the model with `tours` and `tourRegions` filled.
 * A row the sweep proved dead (link_ok false) or that vanished from the
 * catalogue is dropped (the redirect would fail closed anyway). A failed read
 * renders the snapshot.
 */
export async function withHalloweenTours(model, deps = {}) {
  const rows = await readTourRows(deps);
  let tours;
  if (!rows) {
    tours = snapshotTours();
  } else {
    tours = sortTours(TOUR_SNAPSHOT
      .filter((t) => rows.has(t.code) && rows.get(t.code).link_ok !== false)
      .map((t) => tourCard(t, rows.get(t.code)))
      .filter(Boolean));
  }
  // Same copy rule as the haunt cards: a card whose visible text trips the
  // dash or banned phrase check is dropped, never rendered.
  tours = tours.filter((card) => hauntCopyProblems({ card: { name: card.name, place: card.place, priceLabel: card.priceLabel, ratingLabel: card.ratingLabel, duration: card.duration, alt: card.photo.alt, label: card.cta.label, via: card.cta.via } }).length === 0);
  // Haunted attractions join the haunt grid; the rest are the ghost tours.
  const ghost = tours.filter((t) => t.group === "ghost");
  return {
    ...model,
    tours: ghost,
    eventTours: tours.filter((t) => t.group === "event"),
    tourRegions: TOUR_REGIONS,
    featuredTours: featuredGhostTours(ghost),
    ghostDestinations: ghostDestinationLinks(),
  };
}

/** ItemList JSON LD for the tour section. Urls point at the page, never the redirect. */
export function halloweenToursSchema(tours, pageUrl) {
  const list = Array.isArray(tours) ? tours : [];
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Florida Ghost Tours and Haunted Walks",
    numberOfItems: list.length,
    itemListElement: list.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "TouristTrip",
        name: t.name,
        url: pageUrl + "#tour-" + t.id,
        image: t.photo && t.photo.src ? t.photo.src : undefined,
        touristType: "Halloween ghost tour",
        offers: { "@type": "Offer", price: t.fromPrice, priceCurrency: "USD" },
        itinerary: { "@type": "Place", name: t.place, address: { "@type": "PostalAddress", addressLocality: t.place, addressRegion: "FL", addressCountry: "US" } },
      },
    })),
  };
}
