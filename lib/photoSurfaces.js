// lib/photoSurfaces.js — THE CANONICAL LIST OF EVERY PLACE-PHOTO SURFACE.
//
// WHY THIS EXISTS (2026-09-17). A one-off audit fixed 2,959 of 4,448 visible
// rail places with a script that hit production /api/photo once per missing
// place — but that audit only ever crawled /api/rails (22 LANDING_CITIES x 4
// dayparts) and app/api/theme-parks was never in its list. "Florida's Biggest
// Parks" — EPCOT included — sat blank the whole time, on a surface nobody was
// looking at. A photo-coverage tool that only knows about the surfaces its
// author remembered is exactly as blind as the thing it replaced.
//
// This file is the single place that answers "what can put a place's photo on
// screen, and how do I ask it for its places". scripts/check-photo-surface-registry.mjs
// (a GUARD) fails the build the day a new photo-rendering file ships without an
// entry here — the EPCOT hole becomes structurally impossible to repeat, not
// merely something a future audit might remember to re-check.
// scripts/photo-coverage-crawl.mjs (a network TOOL, not a guard) and
// app/api/cron/photo-warm/route.js (the self-healing cron) both walk this same
// list — one script, one truth, instead of three copies of "which surfaces
// exist" quietly drifting apart the way the rails-only audit did.
//
// SHAPE. Each entry:
//   id          stable slug, used as a key in crawl/warm output — never a UI label.
//   label       human label for reports.
//   components  file(s) (repo-relative) that render this surface's photo. This
//               is what scripts/check-photo-surface-registry.mjs cross-checks:
//               every app/ file it detects as photo-rendering must appear in
//               SOME surface's `components`, or in that guard's own EXEMPT list.
//   perCity     true when the surface is keyed by a LANDING_CITIES-shaped point
//               (lat/lng or a city/metro/town slug) and should be crawled once
//               per city. false for a statewide/mode-keyed or context-keyed
//               surface (theme parks' modes, a single index page, a per-item
//               detail page addressed by id/slug rather than by city).
//   endpoints   [] for a surface with nothing safe or practical to crawl (see
//               each entry's own comment for why) — that is a deliberate,
//               documented answer, not an oversight. Otherwise an array of
//               { path, params(city) => plain object of query params,
//                 extract(json) => [{placeId, photoRef, photo, name}] }.
//               `path` is a fixed string for a JSON API. For a page that has no
//               JSON API and must be crawled as rendered HTML (an SSR/ISR page
//               whose card markup already contains the exact /api/photo URL a
//               browser would request), `path` is instead a FUNCTION `(city) =>
//               string` returning the page path to fetch, and `params` returns
//               {} — extractPlaces() below already dispatches on the response
//               body's type (object -> structural walk, string -> HTML regex
//               scan), so the same `extract` default works for both shapes.
//               This is a deliberate, minimal extension of "path is a string,
//               params carries the per-city part" — most endpoints here are
//               plain query-param APIs where that split is exact; a handful of
//               organic pages have no JSON twin, and crawling their RENDERED
//               HTML is both the only option and exactly what a real reader's
//               browser does, so it costs nothing beyond an ordinary page view
//               (unlike hitting a metered search endpoint with novel params).
//   static      for a curated/hardcoded list with no per-city concept: a
//               function () => [{placeId, photoRef, photo, name}] reading the
//               module's own data directly. Present only when `endpoints` is [].
//
// CRAWL SAFETY. /api/deals, /api/experiences and /api/partner/menu-offers are
// same-origin-guarded by middleware.js/lib/apiGuard.js (anti-scraping, not a
// cost gate — see that file's own comments). isSameOrigin() explicitly allows
// a Referer/Origin fallback for clients that predate Sec-Fetch-Site, so
// scripts/photo-coverage-crawl.mjs and the warm cron both send
// `Referer: <baseUrl>/` when calling those three paths. This is not a bypass
// of anything — it is the same allowance the guard's own header documents for
// "older clients", used honestly by a same-origin operational tool. No
// endpoint here is a METERED provider proxy (/api/places/search and friends,
// the $735-incident surfaces) — those are deliberately never crawled with
// novel parameters; see "NO CRAWLABLE ENDPOINT" surfaces below for how their
// card-rendering files are still covered.
import { LANDING_CITIES } from "./landingCities.js";
import { BEACH_METROS } from "./beaches.js";
import { TOWN_HUBS } from "./cultureHubs.js";
import { GUIDES } from "./guides.js";
import { THEME_PARK_MODES } from "./themeParks.js";
import { FAMILY_DAY_RAILS } from "./familyDayTaxonomy.js";
import { hasPlacePhotoRef, isGooglePlaceId, placeIdFromPhotoRef } from "./placePhoto.js";

// ── shared helpers ──────────────────────────────────────────────────────────

function cityParams(city) {
  return { lat: String(city.lat), lng: String(city.lng) };
}

const PLACE_ID_KEYS = ["placeId", "place_id", "id"];
const PHOTO_REF_KEYS = ["photoRef", "photo_ref"];
const PHOTO_URL_KEYS = ["photo", "photoUrl", "photo_url", "image", "_directUri"];

function firstString(obj, keys) {
  for (const k of keys) if (obj && typeof obj[k] === "string" && obj[k]) return obj[k];
  return null;
}

// PLACE, NOT SECTION (2026-09-17, measured on production). The first live
// runs counted rail SECTION HEADERS as place cards ({id:"upscale",
// name:"Upscale Birthday Dinner", places:[...]}): 1,590 of 11,675 extracted
// "cards" had no photo field only because they were not places at all, and
// the self-healing cron reported them as unsourceable. A place card is an
// object that is named AND either carries a real Google place id or carries
// one of the photo fields a card actually renders.
function looksLikePlace(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const named = typeof node.name === "string" && node.name || typeof node.title === "string" && node.title;
  if (!named) return false;
  const id = firstString(node, PLACE_ID_KEYS);
  if (id && isGooglePlaceId(id)) return true;
  return !!(firstString(node, PHOTO_REF_KEYS) || rawPhotosRef(node) || firstString(node, PHOTO_URL_KEYS));
}

function rawPhotosRef(node) {
  // Un-slimmed Google Places API shape ({photos:[{name:"places/.../photos/..."}]}) —
  // lib/todaysBest.js's pickFromGoogle and app/api/places/search/route.js both
  // hand this shape to callers before it is ever flattened to `photoRef`.
  const p0 = Array.isArray(node.photos) && node.photos[0];
  return p0 && typeof p0.name === "string" ? p0.name : null;
}

/**
 * Pure fallback walker: recursively finds place-shaped objects anywhere in a
 * JSON tree (an array, or an object keyed by rail id, or a wrapped
 * `{data:{places:{...}}}` envelope — every shape every endpoint below actually
 * returns) OR, when handed a string, scans it as RENDERED HTML for the exact
 * `/api/photo?ref=`/`?place=` URL a card already put in its `<img src>`. One
 * function, so every endpoint's default `extract` can just be `extractPlaces`.
 */
export function extractPlaces(json, { maxDepth = 10 } = {}) {
  if (typeof json === "string") return extractPlacesFromHtml(json);
  const out = [];
  const seen = new Set();
  const push = (placeId, photoRef, photo, name) => {
    const key = placeId || photoRef || photo;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ placeId: placeId || null, photoRef: photoRef || null, photo: photo || null, name: name || null });
  };
  function visit(node, depth) {
    if (!node || typeof node !== "object" || depth > maxDepth) return;
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    if (looksLikePlace(node)) {
      const placeId = firstString(node, PLACE_ID_KEYS);
      const photoRef = firstString(node, PHOTO_REF_KEYS) || rawPhotosRef(node);
      const photo = firstString(node, PHOTO_URL_KEYS);
      push(placeId, photoRef, photo, node.name || node.title || null);
    }
    for (const key of Object.keys(node)) {
      if (key === "photos") continue; // consumed by rawPhotosRef above, never place-shaped itself
      visit(node[key], depth + 1);
    }
  }
  visit(json, 0);
  return out;
}

// A backslash also ends the value: in a React Server Components payload the
// same URL appears JSON-escaped ("...ref=places%2F...\u0026w=640"), and the
// first version captured the "\u0026w=640" tail into the place id (35 false
// "unsourceable" cards on /florida-events, 2026-09-17).
const HTML_PHOTO_RX = /\/api\/photo\?(?:[^"'&\s\\]*&)*(ref|place)=([^"'&\s)\\]+)/g;

/** Every hotel card, photo or not, in the registry's place shape. */
export function hotelCardsForAudit(list) {
  return (Array.isArray(list) ? list : []).filter((h) => h && typeof h.name === "string" && h.name).map((h) => {
    const gid = [h.googlePlaceId, h.id].find((v) => v && isGooglePlaceId(String(v)));
    return {
      name: h.name,
      placeId: gid ? String(gid) : null,
      photoRef: null,
      photo: typeof h.photo === "string" && h.photo ? h.photo : null,
      cardKey: "hotel:" + String(h.sourceId || h.id || h.name),
    };
  });
}

/** Regex-scan rendered HTML for the exact card photo URLs it already emitted. */
export function extractPlacesFromHtml(html) {
  const out = [];
  const seen = new Set();
  const src = String(html || "");
  let m;
  HTML_PHOTO_RX.lastIndex = 0;
  while ((m = HTML_PHOTO_RX.exec(src))) {
    const kind = m[1];
    let value = m[2];
    try { value = decodeURIComponent(value); } catch { /* keep raw */ }
    if (!value || seen.has(kind + ":" + value)) continue;
    seen.add(kind + ":" + value);
    if (kind === "ref") out.push({ placeId: placeIdFromPhotoRef(value) || null, photoRef: value, photo: null, name: null });
    else out.push({ placeId: value, photoRef: null, photo: null, name: null });
  }
  return out;
}

/**
 * The exact URL a card would request for this place (or the direct owned URL
 * a card sometimes uses instead) — the SAME three-rung ladder
 * IconicPlaceCard.js / RailCard.js's own `photoUrl()` apply, so a probe of
 * this URL is a probe of what a reader actually sees, never a synthetic stand-in.
 */
export function photoRequestFor(place, w = 640) {
  if (!place) return null;
  const width = Number(w) || 640;
  if (typeof place.photo === "string" && place.photo) return place.photo;
  if (hasPlacePhotoRef(place.photoRef)) return "/api/photo?ref=" + encodeURIComponent(place.photoRef) + "&w=" + width;
  if (place.placeId && isGooglePlaceId(String(place.placeId))) {
    return "/api/photo?place=" + encodeURIComponent(place.placeId) + "&w=" + width;
  }
  return null;
}

// Headers that satisfy lib/apiGuard.js's isSameOrigin() Referer/Origin
// fallback for the three anti-scraping-guarded routes this registry crawls
// (see the file header). Never a bypass of an auth check — no route this
// registry names asks for a secret.
export function sameOriginHeaders(baseUrl) {
  return { referer: baseUrl.replace(/\/+$/, "") + "/", origin: baseUrl.replace(/\/+$/, "") };
}

/**
 * The `city` argument every `perCity: true` surface's `params`/`path`
 * functions expect: LANDING_CITIES' own {name,state,lat,lng} plus the slug
 * (the object key) merged in — the one shape both scripts/photo-coverage-crawl.mjs
 * and app/api/cron/photo-warm/route.js hand in, so a surface never has to
 * know whether it is being crawled or warmed.
 */
export function landingCityList() {
  return Object.entries(LANDING_CITIES).map(([slug, city]) => ({ slug, ...city }));
}

const beachMetroSlugs = Object.keys(BEACH_METROS);
const townHubSlugs = [...new Set(Object.values(TOWN_HUBS))];
// A handful of the highest-traffic guides, not all ~40+ — this registry exists
// to CATCH missed surfaces, not to become a second full sitemap crawl. Capped
// so scripts/photo-coverage-crawl.mjs's runtime stays bounded the same way
// PROBE_CAP bounds scripts/photo-monitor.mjs.
const sampledGuideSlugs = Object.keys(GUIDES).slice(0, 8);
const familyDayDefaultRail = (FAMILY_DAY_RAILS[0] && FAMILY_DAY_RAILS[0].id) || "beach";

function jsonExtract(json) { return extractPlaces(json); }

// ── PHOTO_SURFACES ───────────────────────────────────────────────────────

export const PHOTO_SURFACES = [
  // ── the homepage rail menu — /api/rails, the ONE surface the prior one-off
  // audit did crawl (22 LANDING_CITIES x 4 dayparts). BreakfastRails,
  // WorthEatingRails, SummerIntentRails and FamilyDayPage's homepage band are
  // client-composed slices of this SAME /api/rails payload
  // (app/components/DaypartRail.js: "A COMPOSER FED BY /api/rails HAS NO
  // ANSWER UNTIL /api/rails DOES") — crawling /api/rails once already reaches
  // every place those composers can show, so they are listed here rather than
  // given a second, redundant endpoint.
  {
    id: "home-rails-menu",
    label: "Homepage rail menu (daypart bands)",
    perCity: true,
    components: [
      "app/home.js",
      "app/components/DaypartRail.js",
      "app/components/RailCard.js",
      "app/components/IconicPlaceCard.js",
      "app/components/BestNearby.js",
      "app/components/BreakfastRails.js",
      "app/components/WorthEatingRails.js",
      "app/components/SummerIntentRails.js",
    ],
    endpoints: [
      {
        path: "/api/rails",
        params: (city) => ({ ...cityParams(city), city: city.slug, band: "afternoon", v: "2" }),
        extract: (json) => extractPlaces(json && json.data),
      },
    ],
  },
  {
    id: "birthday-rail",
    label: "Birthday rail",
    perCity: true,
    components: ["app/components/BirthdayRails.js", "app/api/birthday/route.js"],
    endpoints: [{ path: "/api/birthday", params: cityParams, extract: jsonExtract }],
  },
  {
    id: "date-night-rail",
    label: "Date Night (homepage band + /date-night intent page)",
    perCity: true,
    components: [
      "app/components/DateNightRails.js",
      "app/components/DateNightIntentPage.js",
      "app/api/date-night/route.js",
    ],
    endpoints: [{ path: "/api/date-night", params: cityParams, extract: jsonExtract }],
  },
  {
    id: "lunch-break-rail",
    label: "Lunch Break rail",
    perCity: true,
    components: ["app/components/LunchBreakRails.js", "app/api/lunch-break/route.js"],
    endpoints: [{ path: "/api/lunch-break", params: cityParams, extract: jsonExtract }],
  },
  {
    id: "night-out-rail",
    label: "Night Out rail",
    perCity: true,
    components: ["app/components/NightOutRails.js", "app/components/NightTourProductCards.js"],
    endpoints: [{ path: "/api/night-out", params: cityParams, extract: jsonExtract }],
  },
  {
    id: "family-day",
    label: "Family Day planner",
    perCity: true,
    components: ["app/components/FamilyDayPage.js"],
    endpoints: [
      {
        path: "/api/family-day",
        params: (city) => ({ ...cityParams(city), radiusMi: "25", rail: familyDayDefaultRail }),
        extract: jsonExtract,
      },
    ],
  },
  {
    id: "today-discovery",
    label: "Today / Best / Hidden Gems poster",
    perCity: true,
    components: ["app/components/TodayDiscoveryRails.js"],
    endpoints: [{ path: "/api/today-discovery", params: cityParams, extract: jsonExtract }],
  },
  {
    id: "fall-intent",
    label: "Fall / Augtober rail",
    perCity: true,
    components: ["app/components/FallIntentRails.js", "app/api/events/fall/route.js"],
    endpoints: [{ path: "/api/events/fall", params: cityParams, extract: jsonExtract }],
  },
  {
    id: "summer-picks",
    label: "Summer Picks page",
    perCity: true,
    components: ["app/components/SummerPicksRails.js", "app/summer-picks/client.js"],
    endpoints: [{ path: "/api/summer/places", params: cityParams, extract: jsonExtract }],
  },
  {
    id: "extra-miles",
    label: "Worth the Extra Miles tail",
    perCity: true,
    components: ["app/components/ExtraMilesTail.js"],
    endpoints: [{ path: "/api/extra-miles", params: cityParams, extract: (json) => extractPlaces(json && json.cards) }],
  },
  // Hotel cards (v8.56.32, 2026-09-17). Stay Tonight (/api/hotels, rendered
  // by app/home.js) and Stay Near the Action (/api/trip-connections
  // mode=stays, rendered by DestinationStays via EventStayCards). Every hotel
  // card is counted, including owned rows with no Google place id and no
  // photo: those resolve to the branded fallback by design (lib/hotelImage.js
  // never guesses by name) and must show up as unsourceable, not vanish.
  {
    id: "hotel-stays",
    label: "Hotel cards (Stay Tonight, Stay Near the Action)",
    perCity: true,
    components: ["app/components/DestinationStays.js"],
    endpoints: [
      { path: "/api/hotels", params: (city) => ({ ...cityParams(city), limit: "40" }), extract: (json) => hotelCardsForAudit(json && json.hotels) },
      { path: "/api/trip-connections", params: (city) => ({ mode: "stays", ...cityParams(city) }), extract: (json) => hotelCardsForAudit(json && json.places) },
    ],
  },
  // Statewide, not per-city — /api/theme-parks is keyed by MODE
  // (flagship/family/orlando), never by lat/lng. This is the exact surface
  // the rails-only audit missed (EPCOT, under "flagship" / "Florida's
  // Biggest Parks"). Crawled once per mode instead of once per city.
  {
    id: "theme-parks",
    label: "Theme park rail (Florida's Biggest Parks)",
    perCity: false,
    components: ["app/components/ThemeParkRail.js"],
    endpoints: Object.keys(THEME_PARK_MODES).map((mode) => ({
      path: "/api/theme-parks",
      params: () => ({ mode }),
      extract: (json) => extractPlaces(json && json.items),
    })),
  },
  // Same-origin-guarded (anti-scraping, see file header) — crawled with the
  // Referer/Origin fallback isSameOrigin() documents for pre-Sec-Fetch-Site
  // clients.
  {
    id: "deals-rail",
    label: "Bookable/affiliate deals rail (UnifiedBrowseCommerceRail)",
    perCity: true,
    components: ["app/components/UnifiedBrowseCommerceRail.js"],
    endpoints: [
      {
        path: "/api/deals",
        params: (city) => ({ category: "food", lat: String(city.lat), lng: String(city.lng) }),
        extract: (json) => extractPlaces(json && json.rails),
      },
    ],
  },
  {
    id: "experiences-rail",
    label: "Viator/experiences bookable rail",
    perCity: true,
    components: [
      "app/components/UnifiedBrowseCommerceRail.js",
      "app/components/HomeAffiliateActivityRail.js",
      "app/components/ViatorRail.js",
      "app/components/IntentPartnerPick.js",
    ],
    endpoints: [
      {
        path: "/api/experiences",
        params: (city) => ({ ...cityParams(city), cat: "all" }),
        extract: (json) => extractPlaces(json && json.items),
      },
    ],
  },
  {
    id: "partner-menu-offers",
    label: "Menu-partner (Lane B) rail",
    perCity: true,
    components: ["app/components/UnifiedBrowseCommerceRail.js", "app/components/sheets/Menu.js"],
    endpoints: [
      {
        path: "/api/partner/menu-offers",
        params: (city) => ({ cat: "attractions", sub: "all", ...cityParams(city) }),
        extract: (json) => extractPlaces(json && json.items),
      },
    ],
  },
  // ── SSR/ISR organic pages with no JSON twin: crawled as rendered HTML (see
  // the file header on why that is safe and sufficient — it is exactly what a
  // reader's browser already does, unlike calling a metered search endpoint
  // with a novel query).
  {
    id: "landing-category-pages",
    label: "Organic city landing pages (things-to-do/restaurants/nightlife/beaches/eat/culture)",
    perCity: true,
    components: ["app/components/ThingsToDoList.js", "app/components/ExperienceBlocks.js", "app/culture/[metro]/page.js"],
    endpoints: ["things-to-do", "restaurants", "nightlife", "beaches", "eat", "culture"].map((cat) => ({
      path: (city) => `/${cat}/${city.slug}`,
      params: () => ({}),
      extract: jsonExtract,
    })),
  },
  {
    id: "best-beaches",
    label: "Best Beaches metro pages",
    perCity: false,
    components: ["app/best-beaches/[metro]/page.js"],
    endpoints: beachMetroSlugs.map((metro) => ({
      path: () => `/best-beaches/${metro}`,
      params: () => ({}),
      extract: jsonExtract,
    })),
  },
  {
    id: "eat-cuisine-pages",
    label: "Eat metro x cuisine pages",
    perCity: true,
    components: ["app/eat/[metro]/[cuisine]/parts.js"],
    endpoints: [],
    // No independent crawl: this reuses the exact same wf_inventory-backed
    // ranking and card renderer as `landing-category-pages`' /eat/:city entry
    // (a cuisine filter over the same pool). Registered here so the guard has
    // a home for this file without duplicating a second HTML crawl over
    // every (metro, cuisine) pair.
  },
  {
    id: "florida-towns",
    label: "Florida town hub pages",
    perCity: false,
    components: ["app/florida/[town]/page.js"],
    endpoints: townHubSlugs.map((town) => ({
      path: () => `/florida/${town}`,
      params: () => ({}),
      extract: jsonExtract,
    })),
  },
  {
    id: "paid-landing",
    label: "Paid ad landing pages (/go/:city)",
    perCity: true,
    components: ["app/components/PaidLanding.js", "app/components/ExploreBridge.js"],
    endpoints: [{ path: (city) => `/go/${city.slug}`, params: () => ({}), extract: jsonExtract }],
  },
  {
    id: "guides-blog",
    label: "Guide (blog) place embeds",
    perCity: false,
    components: [
      "app/components/GuidePlaceCard.js",
      "app/guides/[slug]/page.js",
      "app/guides/florida-fall-festivals-2026/page.js",
    ],
    endpoints: [
      ...sampledGuideSlugs.map((slug) => ({
        path: () => `/guides/${slug}`,
        params: () => ({}),
        extract: jsonExtract,
      })),
      {
        path: () => "/guides/florida-fall-festivals-2026",
        params: () => ({}),
        extract: jsonExtract,
      },
    ],
  },
  {
    id: "florida-events-index",
    label: "Florida Events index",
    perCity: false,
    components: ["app/florida-events/page.js"],
    endpoints: [{ path: () => "/florida-events", params: () => ({}), extract: jsonExtract }],
  },
  // ── curated/hardcoded, no per-city concept, and no place-identity photo
  // data to crawl (see below for why each one still needs no crawlable
  // endpoint to be a complete, honest answer).
  {
    id: "coupons-sheet",
    label: "Coupons / deals sheet venue thumbnails",
    perCity: false,
    components: ["app/components/screens/Coupons.js"],
    endpoints: [],
    // lib/coupons.js's COUPONS carry a merchant `match` name list, not a
    // place id or photoRef — the venue photo is resolved by joining `match`
    // against wf_inventory INSIDE the client component at render time
    // (screens/Coupons.js's own comment: "the row's own verified photoRef").
    // There is no static list of {placeId, photoRef} to read here and no JSON
    // endpoint that returns the resolved rows either — crawling it would mean
    // reimplementing that client-side matching in this script. Left
    // uncrawled; still registered so the guard has a home for the file.
    static: () => [],
  },
  // ── NO CRAWLABLE ENDPOINT. Every file below renders a place photo but is
  // driven by per-search-query, per-event, per-place-id or map-viewport
  // context rather than a LANDING_CITIES-shaped point or a small enumerable
  // list — there is no honest, bounded "crawl every instance of this" for a
  // script running outside the browser. Two things keep this from being a
  // second EPCOT-shaped blind spot: (1) every one of these renders through
  // IconicPlaceCard.js or RailCard.js, both of which the crawled surfaces
  // above already probe by the SAME `photoUrl()`/`cardImageSrc()` ladder, so
  // the photo RESOLUTION path is exercised even though these specific
  // call sites are not independently walked; (2) the guard below still
  // requires every one of these files to be named here, so a new leaf
  // component cannot go missing from the registry the way theme-parks did.
  {
    id: "discovery-and-detail-surfaces",
    label: "Search/discovery-driven cards (map, trending, creators, intent pages, trip connections)",
    perCity: false,
    components: [
      "app/components/CreatorFinds.js",
      "app/components/CreatorPicksRails.js",
      "app/components/ExplodingNearby.js",
      "app/components/IntentPageClient.js",
      "app/components/IntentRail.js",
      "app/components/screens/Map.js",
      "app/components/SponsoredPlaceCard.js",
      "app/components/TrendingNowClient.js",
      "app/components/TripConnections.js",
      "app/components/TodaysBest.js",
    ],
    endpoints: [],
  },
  {
    id: "event-detail-pages",
    label: "Event detail pages (venue maps, nearby/stay cards)",
    perCity: false,
    components: [
      "app/components/EventNearbyCards.js",
      "app/components/EventPlaceRail.js",
      "app/components/EventStayCards.js",
      "app/components/EventVenueMap.js",
      "app/components/PosterEventCard.js",
      "app/components/screens/Events.js",
      "app/events/[city]/[slug]/EventPlan.js",
      "app/events/[city]/[slug]/page.js",
    ],
    endpoints: [],
    // Addressed by (city, event slug), not by city alone — there is no
    // LANDING_CITIES-shaped enumeration of "every live event slug" available
    // to this registry without itself crawling app/api/events first. Tracked
    // as a follow-up rather than guessed at here.
  },
];

export default PHOTO_SURFACES;
