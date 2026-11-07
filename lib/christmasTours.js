// Viator Christmas light tours for /christmas-in-florida, as listings in the
// page's ONE list (owner direction 2026-11-01: one list, one pill menu, one
// card look, no second section). christmasBrowseCached adds them to the
// listings; attachBrowseTickets gives each its ticket row; ChristmasBrowse
// renders them with the same TicketCard as every event.
//
// Every tour below is a real Viator product already in wf_experiences
// (provider viator, link_ok true, slug matching the name, read 2026-11-03).
// The card books through /api/commerce/go by opaque product code
// (commerceHref), so the partner URL never reaches the page; the go route
// re-reads the row and fails closed if the nightly sweep later proves the
// product dead. Same contract as lib/halloweenTours.js.
//
// Names are Wayfind's own dash free display names, not Viator's titles.
// No dates are claimed: Viator shows which nights a tour runs, so the button
// is "See availability" and the card states only duration, rating and price.
//
// They file under the Light shows pill. With no verified dates they never
// match a date filter, and the list places them among what is bookable today
// (lib/christmasBrowse.js sortChristmasBrowse). Never ordered by commission.
//
// Left out on purpose: Mickey's Very Merry Christmas Party (Disney collection
// ban in wayfind-invariants, 3.9 stars), Christmas in the Wild at ZooTampa
// (3.3 stars on 13 reviews), and the year round Skyway light show cruises
// (not a Christmas product).
import { commerceHref } from "./commerce.js";
import { isDeniedViatorSku } from "./viatorDenylist.js";
import { CHRISTMAS_DASH_RX } from "./christmasCardCopy.js";
import { tourDuration } from "./halloweenTours.js";

export const CHRISTMAS_TOUR_SURFACE = "christmas_tours";
export const CHRISTMAS_TOUR_PAGE = "christmas-in-florida";
export const CHRISTMAS_TOUR_CTA = "See availability ↗";
export const CHRISTMAS_TOUR_VIA = "Tour tickets at Viator";

const IMG = "https://media-cdn.tripadvisor.com/media/attractions-splice-spp-400x400/";
const IMAGE_RX = /^https:\/\/(?:media-cdn\.tripadvisor\.com|media\.tacdn\.com|cache-graphicslib\.viator\.com)\//;
const CODE_RX = /^\d+P\d+$/;

// Where each tour starts, close enough for the page's 20 mile distance rings
// (lib/christmasBrowse.js sortChristmasBrowse): the downtown waterfront or
// district the tour leaves from. Without coordinates a located reader would
// find every tour at the very end of the list.
const START = Object.freeze({
  "St. Augustine": [29.8921, -81.3110],
  "St. Petersburg": [27.7709, -82.6362],
  Tampa: [27.9506, -82.4572],
  "Key West": [24.5594, -81.8040],
});

// code, name, chip, place, snapshot fromPrice USD, rating, reviews, minutes, image
export const CHRISTMAS_TOUR_SNAPSHOT = Object.freeze([
  ["64386P4", "Red Boat Nights of Lights Water Tour", "Light cruise", "St. Augustine", 43, 4.8, 286, 75, "r/33/06/06/aa/caption.jpg"],
  ["320234P2", "Nights of Lights by Water Boat Tour", "Light cruise", "St. Augustine", 44, 4.8, 178, 60, "12/4a/17/01.jpg"],
  ["199944P18", "Christmas Lights Wonderland Golf Cart Tour", "Lights tour", "St. Petersburg", 49, 5, 21, 120, "17/10/30/6f.jpg"],
  ["308257P8", "Nights of Lights Sailboat Tour", "Sailboat tour", "St. Augustine", 129, 5, 18, 75, "14/18/33/5a.jpg"],
  ["404648P4", "Christmas Golf Cart Tour of Winter Village and Hyde Park", "Private golf cart tour", "Tampa", 145, 5, 17, 90, "12/37/19/18.jpg"],
  ["5395P15", "Key West Christmas Carols and Lights Cruise", "Holiday cruise", "Key West", 98, 5, 5, 90, "15/1e/bf/c1.jpg"],
].map(([code, name, chip, place, fromPrice, rating, reviews, minutes, image]) => Object.freeze({
  code, name, chip, place, fromPrice, rating, reviews, minutes, image: IMG + image,
  lat: START[place][0], lng: START[place][1],
})));

// The card's short "why go" line (owner 2026-11-04). Facts only from the
// snapshot row above: the tour name, its start city and its length.
export const CHRISTMAS_TOUR_PITCH = Object.freeze({
  "64386P4": "See St. Augustine's Nights of Lights from the water on a 75 minute boat tour, with the lit bayfront drifting past.",
  "320234P2": "See St. Augustine's Nights of Lights from the water on a one hour boat tour of the lit bayfront.",
  "308257P8": "Sail past St. Augustine's Nights of Lights on a 75 minute sailboat tour, a quieter way to take in the glow.",
  "199944P18": "A two hour golf cart tour of St. Petersburg's Christmas lights, so you can sit back and look while someone else drives.",
  "404648P4": "A private 90 minute golf cart tour of Tampa's Winter Village and Hyde Park, just your group and the lights.",
  "5395P15": "A 90 minute Key West cruise with Christmas carols and lights on the water.",
});

export function christmasTourHref(code, { surface = CHRISTMAS_TOUR_SURFACE, page = CHRISTMAS_TOUR_PAGE } = {}) {
  if (!CODE_RX.test(String(code || ""))) return null;
  if (isDeniedViatorSku(code)) return null;
  return commerceHref({
    provider: "viator",
    offerId: code,
    surface,
    contentId: "xm-tour-" + code,
    page,
  });
}

function ratingText(rating, reviews) {
  const r = Number(rating);
  const n = Number(reviews);
  if (!(r > 0) || !(n > 0)) return "";
  return r.toFixed(1) + " ★ from " + n.toLocaleString("en-US") + (n === 1 ? " review" : " reviews") + " on Viator";
}

/**
 * The ticket fields (chip, when, price, cta, photos) the one TicketCard
 * (app/components/ChristmasTicketCard.js) reads, from a snapshot
 * row, optionally overlaid by its live wf_experiences row. A live row the
 * sweep marked dead, or one with no positive price, drops the card.
 */
export function christmasTourRow(base, live = null) {
  if (!base) return null;
  if (live && (live.link_ok === false || ("from_price" in live && !(Number(live.from_price) > 0)))) return null;
  const price = live && Number(live.from_price) > 0 ? Number(live.from_price) : base.fromPrice;
  if (!(Number(price) > 0)) return null;
  const rating = live && Number(live.rating) > 0 ? Number(live.rating) : base.rating;
  const reviews = live && Number(live.reviews) > 0 ? Number(live.reviews) : base.reviews;
  const minutes = live && Number(live.duration_min) > 0 ? Number(live.duration_min) : base.minutes;
  const image = live && IMAGE_RX.test(String(live.image || "")) ? live.image : base.image;
  const href = christmasTourHref(base.code);
  if (!href) return null;
  const duration = tourDuration(minutes);
  const row = {
    id: base.code,
    chip: base.chip,
    name: base.name,
    photos: [{ src: image, width: 400, height: 400, alt: "Photo of " + base.name, credit: "Photo from Viator", creditHref: null }],
    when: [duration ? duration + " tour" : "", ratingText(rating, reviews)].filter(Boolean).join(" · ") || "Tour nights on Viator",
    city: base.place,
    price: { kind: "from", amount: price, text: "$" + Math.round(price) },
    cta: { kind: "affiliate", href, label: CHRISTMAS_TOUR_CTA, via: CHRISTMAS_TOUR_VIA, provider: "viator" },
    eventHref: null,
    rating,
    reviews,
  };
  const text = [row.chip, row.name, row.when, row.city, row.price.text, row.cta.label, row.cta.via, row.photos[0].alt].join(" ");
  if (CHRISTMAS_DASH_RX.test(text) || /\bbest\b|#1/i.test(text)) return null;
  return row;
}

function anonEnv(env) {
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!/^https:\/\//.test(url) || !key) return null;
  return { url, key };
}

/** Live rows for the curated codes, keyed by code. Null when the read could not run. */
export async function readChristmasTourRows(deps = {}) {
  const env = anonEnv(deps.env || process.env);
  if (!env) return null;
  const doFetch = deps.fetch || fetch;
  const codes = CHRISTMAS_TOUR_SNAPSHOT.map((t) => '"' + t.code + '"').join(",");
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

export const CHRISTMAS_TOUR_ID_PREFIX = "viator-tour-";
const BOAT_RX = /cruise|boat|sail/i;

/** One browse listing for a tour row (server only: `tourRow` never leaves the server). */
export function christmasTourListing(base, row) {
  if (!base || !row) return null;
  return {
    id: CHRISTMAS_TOUR_ID_PREFIX + base.code,
    kind: "tour",
    title: base.name,
    name: base.name,
    city: base.place,
    lat: base.lat,
    lng: base.lng,
    christmasRail: "lights",
    browse_categories: BOAT_RX.test(base.name + " " + base.chip) ? ["lights", "cruise"] : ["lights"],
    price_kind: "paid",
    audience: "unannounced",
    hook: CHRISTMAS_TOUR_PITCH[base.code] || "",
    tourRow: row,
  };
}

/**
 * The tour listings for the browse. Never throws: a failed read uses the
 * snapshot; a row the sweep proved dead, or that left the catalogue, is
 * dropped.
 */
export async function christmasTourListings(deps = {}) {
  let rows = null;
  try { rows = await readChristmasTourRows(deps); } catch { rows = null; }
  return CHRISTMAS_TOUR_SNAPSHOT
    .filter((t) => !rows || (rows.has(t.code) && rows.get(t.code).link_ok !== false))
    .map((t) => christmasTourListing(t, christmasTourRow(t, rows ? rows.get(t.code) : null)))
    .filter(Boolean);
}

// The homepage Christmas tile (owner, 2026-11-04: "Tours under Christmas").
// The tile opens the nine Christmas intent rails in place
// (app/components/ChristmasIntentRails.js); the same tours sit there in their
// own small rail right after Lights & Glowing Gardens. Separate surface and page
// tags so their clicks are counted apart from the Christmas page's.
export const CHRISTMAS_TILE_TOUR_SURFACE = "christmas_tile_tours";
export const CHRISTMAS_TILE_TOUR_PAGE = "home-christmas";

function milesBetween(a, b) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Plain JSON cards for the tile's tour rail, nearest start point first (a list
 * of options, never a "best" pick, never ordered by commission). Each button is
 * our /api/commerce/go route by product code; no partner URL or id. Takes the
 * listings christmasTourListings() returned (dead or vanished tours already gone).
 */
export function christmasTileTourCards(listings, { lat = null, lng = null } = {}) {
  const here = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const cards = (Array.isArray(listings) ? listings : []).map((l) => {
    const row = l && l.tourRow;
    const code = row && row.id;
    const href = code ? christmasTourHref(code, { surface: CHRISTMAS_TILE_TOUR_SURFACE, page: CHRISTMAS_TILE_TOUR_PAGE }) : null;
    if (!row || !href) return null;
    const distMi = here && Number.isFinite(l.lat) && Number.isFinite(l.lng) ? Math.round(milesBetween(here, l) * 10) / 10 : null;
    return {
      id: l.id,
      code,
      title: row.name,
      chip: row.chip,
      city: row.city,
      when: row.when,
      price: row.price.text,
      image: row.photos[0].src,
      credit: row.photos[0].credit,
      href,
      label: CHRISTMAS_TOUR_CTA,
      via: CHRISTMAS_TOUR_VIA,
      distMi,
    };
  }).filter(Boolean);
  return cards.sort((a, b) => (a.distMi ?? Infinity) - (b.distMi ?? Infinity));
}
