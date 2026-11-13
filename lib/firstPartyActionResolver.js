// lib/firstPartyActionResolver.js — Deterministic, lawful, idempotent
// First-Party Action Resolver for Wayfind place detail execution.
//
// Core laws:
//   1. Operations queue only: NEVER imports or alters lib/wayfindScore.js.
//   2. Truth over monetization: free places NEVER receive paid/ticket CTAs;
//      broad city tours NEVER replace exact venue tickets; menu links NEVER
//      degrade to Google Maps or Google Search.
//   3. Strict source hierarchy (manual_verified > Wayfind verified data >
//      official venue website > official venue subpage > verified partner >
//      corroborated structured source > held_ambiguous for manual review).
//   4. Idempotent merges: rerunning on the same place preserves stronger/manual
//      sources, refuses generic-homepage downgrades of specific ticket URLs,
//      deduplicates URLs, and never churns retrieved_at when unchanged.
//   5. Safari <16.4 safe: zero regex lookbehinds.

import { safeUrl } from "./links.js";
import { classifyOutboundPage, hostOfUrl, isBadVerdict, isQuarantinedHost, isQuarantinedUrl } from "./linkQuarantine.js";
import { isAffiliateLink, probeUrl, validateOutboundUrl } from "./linkProbe.js";
import { isDeniedHost } from "./nightlifeRail.js";
import { isBeachPlace, placePartnerPick } from "./placePartnerPicks.js";
import { couponForPlace, couponIsLive } from "./coupons.js";
import { isTicketedPlace, isVerifiedFreePlace } from "./gamePlan.js";
import { siteTodayStr } from "./siteTime.js";
import * as Aff from "./affiliates.js";
import * as Tags from "./tags.js";

export const ACTION_CONFIDENCE = Object.freeze({
  EXACT: "EXACT",
  HIGH_CONFIDENCE: "HIGH_CONFIDENCE",
  AMBIGUOUS: "AMBIGUOUS",
  REJECTED: "REJECTED",
});

export const VERIFICATION_STATUS = Object.freeze({
  MANUAL_VERIFIED: "manual_verified",
  VERIFIED: "verified",
  HELD_AMBIGUOUS: "held_ambiguous",
  REJECTED: "rejected",
});

export const GAP_CLASSES = Object.freeze({
  A: "A", // official website missing
  B: "B", // official ticket URL missing
  C: "C", // partner offer exists but is not mapped
  D: "D", // official admission exists but not exposed
  E: "E", // restaurant/menu URL missing
  F: "F", // free/no booking required (Directions or Check conditions legitimate)
  G: "G", // ambiguous or unsafe to resolve automatically
});

export const SOURCE_TIER_RANK = Object.freeze({
  manual_verified: 0,
  wf_inventory_editorial_card: 1,
  atlas_editorial_card: 1,
  wayfind_notes: 1,
  wayfind_coupons_direct: 1,
  wf_events_active: 1,
  official_venue_website: 2,
  official_venue_subpage: 3,
  verified_partner_mapping: 4,
  wf_editorial_citation: 5,
  wf_link_verdict_corroborated: 5,
  wikidata_p856: 5,
  osm_overpass_corroborated: 5,
});

const CONFIDENCE_RANK = Object.freeze({
  EXACT: 3,
  HIGH_CONFIDENCE: 2,
  AMBIGUOUS: 1,
  REJECTED: 0,
});

const STATUS_RANK = Object.freeze({
  manual_verified: 4,
  verified: 3,
  held_ambiguous: 1,
  rejected: 0,
});

// Domains that are NEVER an individual venue's official website, official ticket
// page, official menu, or official reservation link.
const NON_OFFICIAL_HOSTS = new Set([
  "google.com", "goo.gl", "maps.app.goo.gl", "g.page", "bing.com", "yahoo.com", "duckduckgo.com", "maps.apple.com",
  "wikipedia.org", "en.wikipedia.org", "m.wikipedia.org", "wikidata.org", "wikimedia.org",
  "yelp.com", "tripadvisor.com", "foursquare.com", "mapquest.com", "yellowpages.com", "bbb.org",
  "facebook.com", "m.facebook.com", "instagram.com", "tiktok.com", "youtube.com", "youtu.be",
  "twitter.com", "x.com", "pinterest.com", "reddit.com", "linktr.ee",
  "viator.com", "tiqets.com", "klook.com", "undercovertourist.com", "getyourguide.com",
  "ticketnetwork.com", "gocity.com", "citypass.com", "booking.com", "expedia.com",
  "vrbo.com", "hotels.com", "priceline.com", "kayak.com", "airbnb.com", "clipp.com",
  "doordash.com", "ubereats.com", "grubhub.com", "postmates.com", "seamless.com",
  "ezcater.com", "slicelife.com", "menupix.com", "menupages.com", "sirved.com",
  "zmenu.com", "restaurantji.com", "allmenus.com", "wanderlog.com", "untappd.com",
  "happycow.net", "alltrails.com", "roadtrippers.com", "bringfido.com", "atlasobscura.com",
  // DMOs, city portals, and local media — never an individual venue's official site
  "visitsarasota.com", "visitflorida.com", "visittampabay.com", "visitorlando.com",
  "visitstpeteclearwater.com", "bradentongulfislands.com", "visitcentralflorida.org",
  "visitpensacola.com", "visitpanamacitybeach.com", "floridashistoriccoast.com",
  "thepalmbeaches.com", "palmbeaches.com", "miamiandbeaches.com", "sunny.org",
  "visitfortmyers.com", "fortmyers-sanibel.com", "paradisecoast.com", "fla-keys.com",
  "mustdo.com", "fun4tampakids.com", "fun4orlandokids.com", "macaronikid.com",
  "tampabay.com", "orlandosentinel.com", "heraldtribune.com", "sarasotamagazine.com",
  "orlandoweekly.com", "cltampa.com", "ilovetheburg.com", "thatssotampa.com",
  "timeout.com", "eater.com", "thrillist.com", "patch.com", "mysuncoast.com", "wtsp.com", "wfla.com",
  "tampabay28.com", "abcactionnews.com", "fox13news.com", "clickorlando.com", "wesh.com",
  "wftv.com", "winknews.com", "nbc-2.com", "news4jax.com", "local10.com", "cbsnews.com",
  "nytimes.com", "usatoday.com", "forbes.com", "fsrmagazine.com", "qsrmagazine.com",
  "nrn.com", "axios.com", "bizjournals.com", "yourobserver.com", "ospreyobserver.com",
  "floridapolitics.com", "gardenandgun.com", "southernliving.com", "travelandleisure.com",
  "cntraveler.com", "afar.com", "lonelyplanet.com", "onlyinyourstate.com",
  "secretmiami.com", "secretorlando.com", "secrettampa.com", "tampamagazines.com", "orlandomagazine.com",
  "flamingomag.com", "gulfshorelife.com", "naplesillustrated.com", "palmbeachillustrated.com",
  "resortfeechecker.com", "medium.com", "substack.com", "wordpress.com", "blogspot.com", "tumblr.com",
  "aaa.com", "oyster.com", "trivago.com", "agoda.com", "orbitz.com", "travelocity.com",
  "roadsideamerica.com", "miaminewtimes.com", "browardpalmbeach.com",
]);

// Known first-party box-office, park-entry, reservation, and restaurant-menu
// vendor hosts that a venue legitimately links to from its own website.
const FIRST_PARTY_TICKET_VENDORS = new Set([
  "fareharbor.com", "peek.com", "blackbaudhosting.com", "acuityscheduling.com",
  "etix.com", "tixr.com", "showclix.com", "simpletix.com", "eventbrite.com",
  "ticketmaster.com", "axs.com", "seetickets.us", "universe.com", "prekindle.com",
  "tickettailor.com", "hometownticketing.com", "gofan.co", "ticketleap.com",
  "ovationtix.com", "tix.com", "ludus.com", "zeffy.com", "accesso.com",
  "centaman.net", "roller.app", "rocketrez.com", "reserveamerica.com", "recreation.gov",
]);

const FIRST_PARTY_RESERVE_VENDORS = new Set([
  "opentable.com", "resy.com", "exploretock.com", "sevenrooms.com",
]);

const FIRST_PARTY_MENU_VENDORS = new Set([
  "toasttab.com", "popmenu.com", "chownow.com", "olo.com", "bentobox.com",
  "spoton.com", "square.site", "squareup.com",
]);

// Legitimate public government / park-system domains that host official park
// pages for dozens of parks under path slugs (e.g. floridastateparks.org/parks-and-trails/...).
const PUBLIC_AGENCY_HOSTS = new Set([
  "floridastateparks.org", "nps.gov", "fws.gov", "recreation.gov", "reserveamerica.com",
  "scgov.net", "sarasotacountyparks.com", "mymanatee.org", "hillsboroughcounty.org",
  "pinellas.gov", "pinellascounty.org", "stpete.org", "tampa.gov", "orlando.gov",
  "ocfl.net", "seminolecountyfl.gov", "brevardfl.gov", "volusia.org", "lakecountyfl.gov",
  "polk-county.net", "leegov.com", "colliercountyfl.gov", "miamidade.gov", "broward.org",
  "discover.pbcgov.org", "coj.net", "talgov.com", "alachuacounty.us", "marionfl.org",
]);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "near", "downtown", "historic", "florida",
  "sarasota", "bradenton", "tampa", "orlando", "st", "saint", "petersburg", "pete",
  "clearwater", "miami", "fort", "myers", "winter", "park", "haven", "lake", "buena",
  "vista", "kissimmee", "beach", "beaches", "key", "island", "city", "south", "north",
  "east", "west", "new", "old", "at", "in", "of", "by", "on", "to", "co", "inc", "llc",
  "restaurant", "cafe", "coffee", "shop", "bakery", "bar", "grill", "pub", "kitchen",
  "bistro", "eatery", "diner", "house", "company", "museum", "center", "centre",
  "gardens", "garden", "state", "county", "preserve", "trail", "resort", "hotel",
  "suites", "inn", "visitor", "visitors", "complex", "adventures", "adventure", "tours", "tour",
]);

const OUT_OF_STATE_MARKERS = [
  /\b(?:los\s+angeles|san\s+diego|san\s+francisco|del\s+mar|anaheim),\s*(?:ca|california)\b/i,
  /\b(?:las\s+vegas|henderson),\s*(?:nv|nevada)\b/i,
  /\b(?:manhattan|brooklyn|bronx|queens),\s*(?:ny|new\s+york)\b/i,
  /\b(?:chicago|gurnee),\s*(?:il|illinois)\b/i,
  /\b(?:dallas|houston|austin|san\s+antonio),\s*(?:tx|texas)\b/i,
  /\b(?:atlanta|savannah),\s*(?:ga|georgia)\b/i,
  /\b(?:orange\s+beach|gulf\s+shores),\s*(?:al|alabama)\b/i,
];

const FLORIDA_CITY_MARKERS_RX = /\b(florida|sarasota|bradenton|tampa|orlando|st\.?\s*petersburg|st\.?\s*pete|clearwater|miami|fort\s+myers|naples|key\s+west|islamorada|key\s+largo|winter\s+park|winter\s+haven|kissimmee|lake\s+buena\s+vista|celebration|mount\s+dora|apopka|sanford|titusville|merritt\s+island|cocoa\s+beach|daytona|st\.?\s*augustine|jacksonville|tallahassee|panama\s+city|destin|pensacola|crystal\s+river|homosassa|dunnellon|ocala|gainesville|lakeland|lake\s+wales|avon\s+park|sebring|venice|nokomis|osprey|longboat\s+key|anna\s+maria|cortez|ellenton|palmetto|parrish|lakewood\s+ranch|siesta\s+key|lido\s+key|tierra\s+verde|dunedin|tarpon\s+springs|wesley\s+chapel|brandon|plant\s+city|spring\s+hill|masaryktown|boca\s+raton|delray|west\s+palm|jupiter|fort\s+lauderdale|dania\s+beach|hollywood|davie|marco\s+island)\b/i;

const GENERIC_SEARCH_URL_RX = /(?:\/search(?:\/|$|\?)|\/searchresults|[?&](?:q|query|s|search|keyword|keywords|term)=)/i;
const LOGIN_WALL_PATH_RX = /\/(?:login|signin|sign-in|log-in|auth\/login|account\/login|users\/sign_in)(?:\/|$|\?)/i;
const EXPIRED_PAGE_COPY_RX = /\b(?:this\s+event\s+has\s+ended|sales\s+have\s+ended|event\s+is\s+over|tickets\s+are\s+no\s+longer\s+available|permanently\s+closed)\b/i;

function matchesHostSet(host, set) {
  if (!host) return false;
  const h = String(host).toLowerCase().replace(/^www\./, "");
  if (set.has(h)) return true;
  for (const domain of set) {
    if (h.endsWith("." + domain)) return true;
  }
  return false;
}

export function isNonOfficialHost(host) {
  return matchesHostSet(host, NON_OFFICIAL_HOSTS);
}

export function isFirstPartyVendorHost(host) {
  return matchesHostSet(host, FIRST_PARTY_TICKET_VENDORS)
    || matchesHostSet(host, FIRST_PARTY_RESERVE_VENDORS)
    || matchesHostSet(host, FIRST_PARTY_MENU_VENDORS);
}

export function isPublicAgencyHost(host) {
  return matchesHostSet(host, PUBLIC_AGENCY_HOSTS);
}

export function normalizeCanonicalUrl(raw) {
  const clean = safeUrl(raw);
  if (!clean || clean.startsWith("/")) return null;
  let u;
  try { u = new URL(clean); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) {
    if (/^(?:utm_[a-z0-9_]+|fbclid|gclid|msclkid|_ga|_gl|mc_cid|mc_eid)$/i.test(k)) {
      u.searchParams.delete(k);
    }
  }
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    // Preserve trailing slash stability only by normalizing comparisons; keep URL valid.
  }
  return u.toString();
}

function urlComparisonKey(raw) {
  const n = normalizeCanonicalUrl(raw);
  if (!n) return "";
  try {
    const u = new URL(n);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const qs = u.searchParams.toString();
    return `${host}${path}${qs ? "?" + qs : ""}`;
  } catch {
    return n.toLowerCase();
  }
}

export function isGenericSearchOrMapsUrl(raw) {
  if (!raw || typeof raw !== "string") return true;
  const host = hostOfUrl(raw);
  if (!host) return true;
  if (host === "google.com" || host.endsWith(".google.com") || host === "goo.gl" || host === "maps.apple.com") {
    return true;
  }
  return GENERIC_SEARCH_URL_RX.test(raw);
}

export function isRootHomepageUrl(raw) {
  const n = normalizeCanonicalUrl(raw);
  if (!n) return false;
  try {
    const u = new URL(n);
    const p = u.pathname.replace(/\/+$/, "");
    return (p === "" || p === "/home" || p === "/index.html") && !u.search;
  } catch {
    return false;
  }
}

export function isSpecificActionUrl(raw, slotType) {
  const n = normalizeCanonicalUrl(raw);
  if (!n) return false;
  const host = hostOfUrl(n);
  if (slotType === "ticket_url" && matchesHostSet(host, FIRST_PARTY_TICKET_VENDORS)) return true;
  if (slotType === "reservation_url" && matchesHostSet(host, FIRST_PARTY_RESERVE_VENDORS)) return true;
  if (slotType === "menu_url" && matchesHostSet(host, FIRST_PARTY_MENU_VENDORS)) return true;
  return !isRootHomepageUrl(n);
}

export function distinctiveVenueTokens(name) {
  const raw = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!raw) return [];
  const all = raw.split(/\s+/).filter(Boolean);
  const strong = all.filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (strong.length > 0) return strong;
  return all.filter((w) => w.length >= 3);
}

function typesOf(place) {
  return [
    ...(Array.isArray(place?.types) ? place.types : []),
    ...(Array.isArray(place?.google_types) ? place.google_types : []),
    place?.primaryType,
    place?.primary_type,
    place?.category,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase().trim());
}

export function isDiningOrDrinkVenue(place) {
  const t = typesOf(place).join(" ");
  if (/lodging|hotel|resort|motel/.test(t) && !/restaurant/.test(String(place?.primaryType || place?.primary_type || ""))) {
    return false;
  }
  return /\b(?:restaurant|cafe|coffee_shop|bakery|ice_cream_shop|dessert_shop|tea_house|juice_shop|donut_shop|bar|pub|wine_bar|brewery|brewpub|cocktail_bar|gastropub|meal_takeaway|pizza|sandwich|steak_house|seafood_restaurant|brunch_restaurant|breakfast_restaurant|diner|market)\b/.test(t)
    || String(place?.category || "").toLowerCase() === "food";
}

export function isAttractionOrExperienceVenue(place, editorial = null) {
  if (isBeachPlace(place)) return false;
  if (isVerifiedFreePlace(place, editorial)) return false;
  if (isTicketedPlace(place, editorial)) return true;
  const t = typesOf(place).join(" ");
  if (/\bfarmers_market|dog_park|skate_park|playground|plaza|neighborhood\b/.test(t)) return false;
  return /\b(?:tourist_attraction|museum|zoo|aquarium|botanical_garden|amusement_park|theme_park|water_park|performing_arts_theater|concert_hall|comedy_club|event_venue|tour_agency|boat_tour_agency|sightseeing_tour_agency|escape|farm|state_park|national_park|visitor_center|historical_landmark|ferris_wheel|observation_deck|planetarium|indoor_playground|bowling_alley|miniature_golf)\b/.test(t);
}

export function isLegitimateFreeDirectionsPlace(place, editorial = null) {
  if (!place) return false;
  if (isBeachPlace(place)) return true;
  if (isVerifiedFreePlace(place, editorial)) return true;
  const t = typesOf(place).join(" ");
  const name = String(place.name || place.observed_name || "").toLowerCase();
  if (/\b(?:farmers_market|dog_park|skate_park|playground|hiking_area|city_park)\b/.test(t)) {
    if (!isTicketedPlace(place, editorial) && !placePartnerPick(place)) return true;
  }
  if (/\b(?:trail|trailhead|greenway|historic\s+district|farmers\s+market|bayfront\s+park|lake\s+eola\s+park|celery\s+fields|clam\s+pass\s+park|postcard\s+mural|\bmural\b|^water\s+street$)\b/.test(name)) {
    if (!Tags.requiresParkAdmission(typesOf(place)) && !isTicketedPlace(place, editorial)) return true;
  }
  // Ordinary municipal/neighborhood parks without state/national admission fees or partner tours
  if (/\bpark\b/.test(t) && !/\b(?:state_park|national_park|amusement_park|theme_park|water_park|rv_park|dog_park)\b/.test(t)) {
    if (!isTicketedPlace(place, editorial) && !placePartnerPick(place) && !/\b(?:gardens?|zoo|aquarium|safari|adventure|springs|brau)\b/.test(name)) {
      return true;
    }
  }
  return false;
}

const DISNEY_SUB_POI_RX = /\b(?:disney\s+springs|disney'?s\s+|epcot|magic\s+kingdom|hollywood\s+studios|animal\s+kingdom|living\s+with\s+the\s+land|50'?s\s+prime\s+time|spaceship\s+earth|fantasmic)\b/i;

export function isDisneyPolicyHoldPlace(place) {
  if (!place) return false;
  if (placePartnerPick(place)) return false; // Theme park gates covered by verified Undercover Tourist offer 5
  const t = typesOf(place).join(" ");
  if (/lodging|hotel|resort/.test(t) && !/disney\s+springs/i.test(String(place.name || ""))) return false;
  const name = String(place.name || place.observed_name || "");
  return DISNEY_SUB_POI_RX.test(name);
}

/**
 * Operations-queue priority score (Requirement #1 & #6).
 * Purely an operational worklist score; NEVER affects Wayfind Score or organic ranking.
 */
export function computeActionGapPriority(row, { editorial = null, unmappedPartner = false } = {}) {
  const opens30 = Number(row?.opens_30d || 0);
  const opens7 = Number(row?.opens_7d || 0);
  const ctaNull = Number(row?.cta_null_30d || 0);
  const commerceClicks = Number(row?.commerce_clicks_30d || 0) + Number(row?.partner_server_clicks_30d || 0);
  const activeEvents = Number(row?.active_events_count || 0);

  const place = {
    id: row?.place_id || row?.id,
    name: row?.name || row?.observed_name || "",
    types: row?.google_types || row?.types || [],
    primaryType: row?.primary_type || row?.primaryType || null,
    category: row?.category || null,
    lat: row?.lat,
    lng: row?.lng,
  };

  let intentWeight = 10;
  if (isLegitimateFreeDirectionsPlace(place, editorial)) {
    intentWeight = -60;
  } else if (isAttractionOrExperienceVenue(place, editorial)) {
    intentWeight = 55;
  } else if (isDiningOrDrinkVenue(place)) {
    intentWeight = 22;
  }

  const shown = row?.cta_shown_kinds || {};
  const shownTotal = Object.values(shown).reduce((a, b) => a + Number(b || 0), 0);
  const fallbackCount = Number(shown.directions || 0) + (isDiningOrDrinkVenue(place) ? Number(shown.menu || 0) : 0);
  const fallbackRatio = shownTotal > 0 ? fallbackCount / shownTotal : 1;

  const hasWayfindOfficialSeed = Boolean(
    row?.card_official_website ||
    row?.signals_website ||
    (Array.isArray(row?.ed_facts_sources) && row.ed_facts_sources.some((s) => /^https?:\/\//i.test(s)))
  );

  return Math.round(
    opens30 * 3.5 +
    opens7 * 4.0 +
    ctaNull * 8.0 +
    fallbackRatio * 20.0 +
    intentWeight +
    commerceClicks * 6.0 +
    (unmappedPartner ? 30 : 0) +
    (activeEvents > 0 ? 18 : 0) +
    (hasWayfindOfficialSeed ? 12 : 0)
  );
}

/**
 * Classify WHY a place's primary CTA was weak (A–G, Requirement #2).
 */
export function classifyCtaGap(row, { editorial = null, currentCta = null, hasWayfindOfficialUrl = false, unmappedPartner = false, isAmbiguousHold = false } = {}) {
  const place = {
    id: row?.place_id || row?.id,
    name: row?.name || row?.observed_name || "",
    types: row?.google_types || row?.types || [],
    primaryType: row?.primary_type || row?.primaryType || null,
    category: row?.category || null,
    lat: row?.lat,
    lng: row?.lng,
  };

  if (isLegitimateFreeDirectionsPlace(place, editorial)) {
    return GAP_CLASSES.F;
  }
  if (unmappedPartner) {
    return GAP_CLASSES.C;
  }
  if (isDisneyPolicyHoldPlace(place) || isAmbiguousHold) {
    return GAP_CLASSES.G;
  }
  if (isDiningOrDrinkVenue(place)) {
    return GAP_CLASSES.E;
  }
  if (isAttractionOrExperienceVenue(place, editorial)) {
    if (hasWayfindOfficialUrl) {
      // Wayfind already held officialWebsite / sourceUrls / facts[].source, or
      // had homepage without dedicated ticket_url exposed to Detail.js.
      const hasDedicatedTicketSeed = Array.isArray(row?.card_source_urls)
        && row.card_source_urls.some((u) => /\/(?:tickets?|admissions?|box-?office|passes)/i.test(String(u || "")));
      return hasDedicatedTicketSeed ? GAP_CLASSES.B : GAP_CLASSES.D;
    }
    return GAP_CLASSES.A;
  }
  if (!hasWayfindOfficialUrl) {
    return GAP_CLASSES.A;
  }
  return GAP_CLASSES.D;
}

function hasExpiredYearSignal(url, title = "", textSnippet = "", todayIso = siteTodayStr()) {
  const currentYear = Number(String(todayIso).slice(0, 4)) || 2026;
  const hay = `${url || ""} ${title || ""}`.toLowerCase();
  const years = [...hay.matchAll(/\b(20[12]\d)\b/g)].map((m) => Number(m[1]));
  if (years.length > 0) {
    const maxYear = Math.max(...years);
    // Past-year campaign/event/calendar slug (e.g. /halloween-2024 or /calendar/2021/10) with no current/future year
    if (maxYear < currentYear && /(?:event|ticket|fest|halloween|christmas|holiday|summer|spring|fall|pass|deal|promo|book|calendar)/i.test(hay)) {
      return true;
    }
  }
  if (EXPIRED_PAGE_COPY_RX.test(`${title || ""} ${textSnippet || ""}`)) {
    return true;
  }
  return false;
}

const DISTINCT_FL_METROS = [
  { key: "tampa_bay", slugs: ["tampa", "stpete", "st-petersburg", "clearwater", "brandon", "wesley-chapel", "ybor"], rx: /\b(?:tampa|st\.?\s*pete(?:rsburg)?|clearwater|brandon|wesley\s+chapel|temple\s+terrace|bloomingdale|dunedin|tarpon\s+springs)\b/i },
  { key: "sarasota_manatee", slugs: ["sarasota", "bradenton", "lakewood-ranch", "venice", "siesta-key"], rx: /\b(?:sarasota|bradenton|lakewood\s+ranch|venice|siesta\s+key|longboat\s+key|cortez|ellenton|palmetto|parrish|southgate|fruitville)\b/i },
  { key: "orlando", slugs: ["orlando", "winter-park", "kissimmee", "disney-springs", "sanford"], rx: /\b(?:orlando|winter\s+park|kissimmee|lake\s+buena\s+vista|celebration|sanford|oviedo|altamonte\s+springs|horizon\s+west|apopka)\b/i },
  { key: "south_fl", slugs: ["miami", "hollywood", "fort-lauderdale", "doral", "boca-raton", "west-palm", "jupiter"], rx: /\b(?:miami|hollywood|fort\s+lauderdale|doral|boca\s+raton|west\s+palm|delray|jupiter|dania)\b/i },
  { key: "sw_fl", slugs: ["fort-myers", "naples", "sanibel", "cape-coral"], rx: /\b(?:fort\s+myers|naples|sanibel|cape\s+coral|bonita\s+springs|marco\s+island)\b/i },
  { key: "panhandle", slugs: ["pensacola", "destin", "panama-city"], rx: /\b(?:pensacola|destin|panama\s+city|laguna\s+beach)\b/i },
  { key: "ne_fl", slugs: ["jacksonville", "st-augustine", "daytona"], rx: /\b(?:jacksonville|st\.?\s*augustine|daytona)\b/i },
];

function hasWrongBranchCitySlug(place, host, pathLower) {
  const loc = String(place?.locality || place?.postalCity || place?.city || "").toLowerCase().trim();
  if (!loc) return false;
  // Specific intra-region multi-branch guard (e.g. Pensacola vs Panama City Beach / Destin)
  if (/panama\s+city|laguna\s+beach/.test(loc) && /pensacola/.test(`${host} ${pathLower}`)) return true;
  if (/pensacola/.test(loc) && /(?:panama-?city|destin)/.test(`${host} ${pathLower}`)) return true;

  const myMetro = DISTINCT_FL_METROS.find((m) => m.rx.test(loc));
  if (!myMetro) return false;
  const urlSlugTarget = `${host} ${pathLower}`;
  const matchesOwnMetro = myMetro.slugs.some((s) => urlSlugTarget.includes(s));
  if (matchesOwnMetro) return false;
  for (const other of DISTINCT_FL_METROS) {
    if (other.key === myMetro.key) continue;
    if (other.slugs.some((s) => urlSlugTarget.includes(s))) {
      return true;
    }
  }
  return false;
}

/**
 * Corroborate that a fetched candidate URL belongs to THIS venue and city
 * (Requirement #5, #8, #9).
 */
export function corroborateVenueAndCity({ place, requestedUrl, finalUrl, title = "", html = "", sourceTier = 5 }) {
  const targetUrl = finalUrl || requestedUrl;
  const host = hostOfUrl(targetUrl);
  if (!host) return { ok: false, confidence: ACTION_CONFIDENCE.REJECTED, reason: "invalid-host" };

  const tokens = distinctiveVenueTokens(place?.name || place?.observed_name || "");
  const cleanHtmlText = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 25000);

  const hostCompact = host.replace(/[^a-z0-9]/g, "");
  const pathLower = (() => {
    try { return new URL(targetUrl).pathname.toLowerCase(); } catch { return ""; }
  })();
  const titleLower = String(title || "").toLowerCase();
  const bodyLower = cleanHtmlText.toLowerCase();

  if (hasWrongBranchCitySlug(place, host, pathLower)) {
    return { ok: false, confidence: ACTION_CONFIDENCE.REJECTED, reason: "wrong-city-branch-slug" };
  }

  let tokenHitsInHostOrTitle = 0;
  let tokenHitsInBody = 0;
  for (const tok of tokens) {
    if (hostCompact.includes(tok) || pathLower.includes(tok) || titleLower.includes(tok)) {
      tokenHitsInHostOrTitle++;
    }
    if (bodyLower.includes(tok)) {
      tokenHitsInBody++;
    }
  }

  // Wrong-city / out-of-state guard: if title or top of page explicitly names an
  // out-of-state city and NEVER mentions Florida or the venue's locality, reject!
  const locality = String(place?.locality || place?.postalCity || place?.city || "").toLowerCase().trim();
  const mentionsFlorida = FLORIDA_CITY_MARKERS_RX.test(`${title} ${cleanHtmlText.slice(0, 8000)}`)
    || /\b,\s*fl\s+\d{5}\b/i.test(cleanHtmlText)
    || (locality.length >= 4 && bodyLower.includes(locality));
  const headSample = `${title} ${cleanHtmlText.slice(0, 3000)}`;
  const mentionsOutOfState = OUT_OF_STATE_MARKERS.some((rx) => rx.test(headSample));
  if (mentionsOutOfState && !mentionsFlorida) {
    return { ok: false, confidence: ACTION_CONFIDENCE.REJECTED, reason: "wrong-city-out-of-state" };
  }

  // Public agency pages (e.g. floridastateparks.org/parks-and-trails/blue-spring-state-park)
  // MUST name the specific park in the URL path or page <title>, never a generic agency root!
  if (isPublicAgencyHost(host)) {
    if (isRootHomepageUrl(targetUrl)) {
      return { ok: false, confidence: ACTION_CONFIDENCE.REJECTED, reason: "generic-agency-homepage" };
    }
    if (tokens.length > 0 && tokenHitsInHostOrTitle === 0) {
      return { ok: false, confidence: ACTION_CONFIDENCE.REJECTED, reason: "agency-page-wrong-park" };
    }
  }

  // First-party vendor pages (OpenTable, FareHarbor, Toast, Eventbrite, etc.) MUST
  // corroborate the venue name in the URL slug or <title>, never a generic vendor homepage/search.
  if (isFirstPartyVendorHost(host)) {
    if (isRootHomepageUrl(targetUrl)) {
      return { ok: false, confidence: ACTION_CONFIDENCE.REJECTED, reason: "generic-vendor-homepage" };
    }
    if (tokens.length > 0 && tokenHitsInHostOrTitle === 0 && tokenHitsInBody === 0) {
      return { ok: false, confidence: ACTION_CONFIDENCE.REJECTED, reason: "vendor-wrong-venue" };
    }
  }

  if (tokens.length > 0 && tokenHitsInHostOrTitle === 0 && tokenHitsInBody === 0) {
    return { ok: false, confidence: ACTION_CONFIDENCE.REJECTED, reason: "wrong-venue-no-token-match" };
  }

  if (tokenHitsInHostOrTitle >= 1 && (mentionsFlorida || sourceTier <= 3 || hostCompact.includes(tokens[0] || ""))) {
    return {
      ok: true,
      confidence: (tokenHitsInHostOrTitle >= Math.min(2, tokens.length) && mentionsFlorida) || sourceTier <= 1
        ? ACTION_CONFIDENCE.EXACT
        : ACTION_CONFIDENCE.HIGH_CONFIDENCE,
      reason: "corroborated-venue-identity",
    };
  }

  if (tokenHitsInBody >= 1 && sourceTier <= 3 && mentionsFlorida) {
    return { ok: true, confidence: ACTION_CONFIDENCE.HIGH_CONFIDENCE, reason: "corroborated-body-and-city" };
  }

  return { ok: false, confidence: ACTION_CONFIDENCE.AMBIGUOUS, reason: "insufficient-venue-city-corroboration" };
}

/**
 * Deterministic static + content validation of one candidate action URL
 * (Requirement #4, #5, #8, #9).
 */
export async function verifyActionCandidate({
  place,
  editorial = null,
  slotType,
  url,
  source,
  validUntil = null,
  todayIso = siteTodayStr(),
  probeImpl = probeUrl,
  lookupImpl = undefined,
}) {
  const normalized = normalizeCanonicalUrl(url);
  if (!normalized) {
    return {
      ok: false,
      slotType,
      url: url || null,
      source,
      confidence: ACTION_CONFIDENCE.REJECTED,
      verification_status: VERIFICATION_STATUS.REJECTED,
      reason: "invalid-or-quarantined-url",
    };
  }

  const host = hostOfUrl(normalized);
  if (!host) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "missing-host" };
  }
  if (isQuarantinedHost(host) || isQuarantinedUrl(normalized)) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "quarantined-host" };
  }
  if (isDeniedHost(host)) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "denied-host-policy" };
  }
  if (isAffiliateLink(normalized)) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "affiliate-link-not-first-party" };
  }
  if (isGenericSearchOrMapsUrl(normalized)) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "generic-search-or-maps-url" };
  }
  if (isNonOfficialHost(host)) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: `non-official-host:${host}` };
  }
  if (/\.pdf(?:$|\?)/i.test(normalized) && slotType !== "menu_url") {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "pdf-not-action-page" };
  }

  // Free place protection: NEVER promote paid ticket or paid admission actions on a free place or beach.
  if ((slotType === "ticket_url" || slotType === "admission_url") && (isBeachPlace(place) || isVerifiedFreePlace(place, editorial))) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "free-place-cannot-have-paid-cta" };
  }

  // Official website slot must be the venue's own domain (or public park agency slug), never a 3rd-party ticket/menu vendor.
  if (slotType === "officialWebsite" && isFirstPartyVendorHost(host) && !isPublicAgencyHost(host)) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: `vendor-not-official-site:${host}` };
  }

  // Event-specific date relevance (Requirement #8 & #9).
  if (validUntil && String(validUntil).slice(0, 10) < String(todayIso).slice(0, 10)) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: `expired-event-ticket:${validUntil}` };
  }

  const dnsCheck = await validateOutboundUrl(normalized, lookupImpl ? { lookupImpl } : {});
  if (!dnsCheck.ok) {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: `outbound-invalid:${dnsCheck.reason}` };
  }

  const probed = await probeImpl(normalized, lookupImpl ? { lookupImpl, timeoutMs: 8500 } : { timeoutMs: 8500 });
  if (probed.error === "too-many-redirects") {
    return { ok: false, slotType, url: normalized, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "redirect-loop" };
  }

  const finalCanonical = normalizeCanonicalUrl(probed.finalUrl || normalized) || normalized;
  const finalHost = hostOfUrl(finalCanonical);
  const finalPathLower = (() => {
    try { return new URL(finalCanonical).pathname.toLowerCase(); } catch { return ""; }
  })();
  if (!finalHost || isQuarantinedHost(finalHost) || isDeniedHost(finalHost) || isNonOfficialHost(finalHost) || isGenericSearchOrMapsUrl(finalCanonical)) {
    return { ok: false, slotType, url: normalized, finalUrl: finalCanonical, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: `bad-final-destination:${finalHost || "invalid"}` };
  }
  if (hasWrongBranchCitySlug(place, finalHost, finalPathLower)) {
    return { ok: false, slotType, url: normalized, finalUrl: finalCanonical, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "wrong-city-branch-slug" };
  }
  if (LOGIN_WALL_PATH_RX.test(finalCanonical) && !LOGIN_WALL_PATH_RX.test(normalized)) {
    return { ok: false, slotType, url: normalized, finalUrl: finalCanonical, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "unexpected-login-wall" };
  }
  if (hasExpiredYearSignal(finalCanonical, "", "", todayIso)) {
    return { ok: false, slotType, url: normalized, finalUrl: finalCanonical, source, confidence: ACTION_CONFIDENCE.REJECTED, verification_status: VERIFICATION_STATUS.REJECTED, reason: "expired-campaign-or-past-year" };
  }

  const pageClass = classifyOutboundPage({
    requestedUrl: normalized,
    status: probed.status,
    finalUrl: finalCanonical,
    html: probed.html,
    expectedNames: [place?.name, place?.observed_name].filter(Boolean),
  });

  if (isBadVerdict(pageClass.verdict)) {
    return {
      ok: false,
      slotType,
      url: normalized,
      finalUrl: finalCanonical,
      source,
      confidence: ACTION_CONFIDENCE.REJECTED,
      verification_status: VERIFICATION_STATUS.REJECTED,
      reason: `page-${pageClass.verdict}:${pageClass.reason}`,
    };
  }

  const tierRank = SOURCE_TIER_RANK[source] ?? 5;

  // Bot wall (403/429) on live WAF-protected venues: ONLY promote HIGH_CONFIDENCE when
  // deterministically corroborated by public park agency slug OR multi-token / city-slug
  // dedicated venue domain; otherwise hold AMBIGUOUS for manual review!
  if (pageClass.verdict === "unknown") {
    if ([403, 429].includes(Number(probed.status)) && tierRank <= 5) {
      const tokens = distinctiveVenueTokens(place?.name || "").filter((t) => t.length >= 4);
      const hostCompact = finalHost.replace(/[^a-z0-9]/g, "");
      const pathCompact = finalPathLower.replace(/[^a-z0-9]/g, "");
      const urlText = `${finalHost} ${finalPathLower}`;
      const hasFlSlug = FLORIDA_CITY_MARKERS_RX.test(urlText.replace(/-/g, " "));

      // Case A: Official public park / municipal agency path naming this specific park
      if (isPublicAgencyHost(finalHost) && !isRootHomepageUrl(finalCanonical) && tokens.some((t) => pathCompact.includes(t))) {
        return {
          ok: true,
          slotType,
          url: finalCanonical,
          requestedUrl: normalized,
          source,
          confidence: ACTION_CONFIDENCE.HIGH_CONFIDENCE,
          verification_status: VERIFICATION_STATUS.VERIFIED,
          reason: `agency-slug-match-botwall-${probed.status}`,
          html: "",
        };
      }

      // Case B: Dedicated non-vendor venue domain corroborated by >=2 distinctive tokens,
      // a distinctive >=6-char brand token, or token + Florida city slug
      if (!isFirstPartyVendorHost(finalHost) && !isPublicAgencyHost(finalHost)) {
        const hostHits = tokens.filter((t) => hostCompact.includes(t));
        const slugHits = tokens.filter((t) => hostCompact.includes(t) || pathCompact.includes(t));
        const strongDedicatedMatch =
          hostHits.length >= 2 ||
          (slugHits.length >= 2 && !isRootHomepageUrl(finalCanonical)) ||
          (hostHits.length === 1 && (hostHits[0].length >= 6 || hasFlSlug) && !/^(?:crackerbarrel|marriott|hilton|hyatt)/.test(hostCompact));
        if (strongDedicatedMatch) {
          return {
            ok: true,
            slotType,
            url: finalCanonical,
            requestedUrl: normalized,
            source,
            confidence: ACTION_CONFIDENCE.HIGH_CONFIDENCE,
            verification_status: VERIFICATION_STATUS.VERIFIED,
            reason: `corroborated-domain-botwall-${probed.status}`,
            html: "",
          };
        }
      }
    }
    return {
      ok: false,
      slotType,
      url: normalized,
      finalUrl: finalCanonical,
      source,
      confidence: ACTION_CONFIDENCE.AMBIGUOUS,
      verification_status: VERIFICATION_STATUS.HELD_AMBIGUOUS,
      reason: `unverified-upstream:${probed.error || probed.status || pageClass.reason}`,
    };
  }

  const textSnippet = String(probed.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000);
  if (hasExpiredYearSignal(finalCanonical, pageClass.title, textSnippet, todayIso)) {
    return {
      ok: false,
      slotType,
      url: normalized,
      finalUrl: finalCanonical,
      source,
      confidence: ACTION_CONFIDENCE.REJECTED,
      verification_status: VERIFICATION_STATUS.REJECTED,
      reason: "expired-campaign-or-past-year",
    };
  }

  const corr = corroborateVenueAndCity({
    place,
    requestedUrl: normalized,
    finalUrl: finalCanonical,
    title: pageClass.title,
    html: probed.html,
    sourceTier: tierRank,
  });

  if (!corr.ok) {
    return {
      ok: false,
      slotType,
      url: normalized,
      finalUrl: finalCanonical,
      source,
      confidence: corr.confidence,
      verification_status: corr.confidence === ACTION_CONFIDENCE.AMBIGUOUS
        ? VERIFICATION_STATUS.HELD_AMBIGUOUS
        : VERIFICATION_STATUS.REJECTED,
      reason: corr.reason,
    };
  }

  return {
    ok: true,
    slotType,
    url: finalCanonical,
    requestedUrl: normalized,
    source,
    confidence: corr.confidence,
    verification_status: VERIFICATION_STATUS.VERIFIED,
    reason: corr.reason,
    title: pageClass.title || null,
    valid_until: validUntil || null,
    html: probed.html || "",
  };
}

/**
 * Extract candidate deep-action URLs (ticket_url, admission_url, reservation_url,
 * menu_url) linked directly from a venue's verified official website HTML (Tier 3).
 */
export function extractSubpageCandidatesFromHtml(baseUrl, html, place, editorial = null) {
  const out = { ticket_url: [], admission_url: [], reservation_url: [], menu_url: [] };
  if (!baseUrl || !html || typeof html !== "string") return out;
  const baseHost = hostOfUrl(baseUrl);
  if (!baseHost) return out;

  const isDining = isDiningOrDrinkVenue(place);
  const isAttraction = isAttractionOrExperienceVenue(place, editorial) && !isDining;

  const sameVenueOrg = (candHost) => {
    if (!candHost) return false;
    if (candHost === baseHost) return true;
    const apex = (h) => h.split(".").slice(-2).join(".");
    return apex(candHost) === apex(baseHost);
  };

  const seen = new Set([urlComparisonKey(baseUrl)]);
  const anchorRx = /<a\b[^>]*\bhref\s*=\s*["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRx.exec(html)) !== null) {
    const rawHref = m[1].replace(/&amp;/g, "&").trim();
    if (!rawHref || /^(?:mailto:|tel:|javascript:|sms:)/i.test(rawHref)) continue;
    let resolved;
    try { resolved = new URL(rawHref, baseUrl).toString(); } catch { continue; }
    const norm = normalizeCanonicalUrl(resolved);
    if (!norm) continue;
    const key = urlComparisonKey(norm);
    if (!key || seen.has(key)) continue;

    const candHost = hostOfUrl(norm);
    if (!candHost || isNonOfficialHost(candHost) || isDeniedHost(candHost) || isQuarantinedHost(candHost)) continue;
    if (isGenericSearchOrMapsUrl(norm) || isAffiliateLink(norm)) continue;

    const sameOrg = sameVenueOrg(candHost);
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 100);
    const pathLower = (() => { try { return new URL(norm).pathname.toLowerCase(); } catch { return ""; } })();
    if (/\/(?:wp-content\/uploads\/.*\.(?:jpg|jpeg|png|webp|gif|svg|css|js)|wp-json\/|ssr-assets\/|cart|checkout|account|login|privacy|terms|careers|jobs|donate|donation|membership-login|press|contact(?:-us)?|about(?:-us)?|our-stores|stores|help|faq|accessibility|gift-?cards?|catering|merch|buy-a-brick|brand-order)(?:\/|$|\?)/i.test(pathLower)) {
      continue;
    }

    if (isAttraction) {
      const isTicketVendor = matchesHostSet(candHost, FIRST_PARTY_TICKET_VENDORS) || /^(?:ticketing|tickets)\./i.test(candHost);
      if ((sameOrg || isTicketVendor) && (
        /\/(?:tickets?(?:-[a-z0-9-]+)?|buy-tickets?|admissions?-tickets?|tickets?-admissions?|tickets?-annual-passes|box-?office|booking|book-?(?:now|online|tour|tickets?)|timed-entry|day-pass)(?:\/|$|\?)/i.test(pathLower) ||
        (isTicketVendor && !isRootHomepageUrl(norm) && /\b(?:buy\s+tickets?|get\s+tickets?|tickets?|book\s+now|reserve\s+tickets?|admissions?)\b/i.test(label)) ||
        (sameOrg && /\b(?:buy\s+tickets?|get\s+tickets?|purchase\s+tickets?|book\s+tickets?|tickets?\s*&\s*passes|online\s+tickets?)\b/i.test(label) && !isRootHomepageUrl(norm))
      )) {
        seen.add(key);
        out.ticket_url.push(norm);
        continue;
      }
      if (sameOrg && !isRootHomepageUrl(norm) && (
        /\/(?:admissions?|plan-your-visit|visit\/?(?:hours|admissions?|tickets?|plan-your-visit)?|hours-(?:and-)?admissions?|fees)(?:\/|$|\?)/i.test(pathLower) ||
        /\b(?:admissions?|hours\s*&\s*admissions?|plan\s+your\s+visit|ticket\s+info)\b/i.test(label)
      )) {
        seen.add(key);
        out.admission_url.push(norm);
        continue;
      }
    }

    if (isDining) {
      const isResVendor = matchesHostSet(candHost, FIRST_PARTY_RESERVE_VENDORS);
      const isMenuVendor = matchesHostSet(candHost, FIRST_PARTY_MENU_VENDORS);
      if ((sameOrg || isResVendor) && !isRootHomepageUrl(norm) && (
        isResVendor ||
        /\/(?:reservations?|reserve|book-a-table)(?:\/|$|\?)/i.test(pathLower) ||
        (/\b(?:reservations?|reserve\s+a\s+table|book\s+a\s+table)\b/i.test(label) && !/\/(?:locations?|pages\/locations)/i.test(pathLower))
      )) {
        seen.add(key);
        out.reservation_url.push(norm);
        continue;
      }
      if ((sameOrg || isMenuVendor) && !isRootHomepageUrl(norm) && !/\.pdf$/i.test(pathLower) && !/gluten-free/i.test(pathLower) && (
        isMenuVendor ||
        /\/(?:menus?(?:\/(?:dining|food|all|main))?|our-menu|food-menu|dinner-menu|lunch-menu|breakfast-menu|cafe-menu|drink-menu|food-and-drink(?:-menus?)?)(?:\/|$|\?)/i.test(pathLower) ||
        /\b(?:view\s+menu|see\s+menu|our\s+menu|food\s+menu|full\s+menu|dining\s+menu|menus?)\b/i.test(label)
      )) {
        seen.add(key);
        out.menu_url.push(norm);
        continue;
      }
    }
  }
  return out;
}

export function buildSlotRecord({ url, source, confidence, verification_status, retrieved_at, valid_until = null }) {
  const clean = normalizeCanonicalUrl(url);
  if (!clean) return null;
  return {
    url: clean,
    source: String(source || "wayfind_verified_data"),
    retrieved_at: String(retrieved_at || new Date().toISOString()),
    confidence,
    verification_status,
    ...(valid_until ? { valid_until: String(valid_until).slice(0, 10) } : {}),
  };
}

/**
 * Idempotent slot merge (Requirement #7):
 *   - Never overwrites manual_verified with automation
 *   - Never downgrades a stronger verified source
 *   - Never replaces a specific /tickets subpage with a generic / homepage
 *   - Never churns retrieved_at when URL + metadata are unchanged
 */
export function mergeActionSlot(existingSlot, candidateSlot, slotType) {
  if (!candidateSlot || !candidateSlot.url) return existingSlot || null;
  if (candidateSlot.verification_status === VERIFICATION_STATUS.REJECTED || candidateSlot.confidence === ACTION_CONFIDENCE.REJECTED) {
    return existingSlot || null;
  }
  if (!existingSlot || !existingSlot.url) return candidateSlot;

  // Rule 1: Manual verified source ALWAYS outranks automation.
  if (existingSlot.verification_status === VERIFICATION_STATUS.MANUAL_VERIFIED &&
      candidateSlot.verification_status !== VERIFICATION_STATUS.MANUAL_VERIFIED) {
    return existingSlot;
  }

  // Rule 2: Never replace a specific deep action page (/tickets, /menu, box office)
  // with a generic root homepage.
  if (slotType !== "officialWebsite" &&
      isSpecificActionUrl(existingSlot.url, slotType) &&
      !isSpecificActionUrl(candidateSlot.url, slotType)) {
    return existingSlot;
  }

  // Rule 3: Same canonical URL -> preserve existing retrieved_at timestamp if not upgrading status/confidence!
  if (urlComparisonKey(existingSlot.url) === urlComparisonKey(candidateSlot.url)) {
    const exStatus = STATUS_RANK[existingSlot.verification_status] ?? 0;
    const caStatus = STATUS_RANK[candidateSlot.verification_status] ?? 0;
    const exConf = CONFIDENCE_RANK[existingSlot.confidence] ?? 0;
    const caConf = CONFIDENCE_RANK[candidateSlot.confidence] ?? 0;
    if (caStatus > exStatus || caConf > exConf) {
      return {
        ...existingSlot,
        ...candidateSlot,
        retrieved_at: existingSlot.retrieved_at || candidateSlot.retrieved_at,
      };
    }
    return existingSlot;
  }

  // Rule 4: Compare verification status, confidence, specificity, and source tier rank.
  const exStatus = STATUS_RANK[existingSlot.verification_status] ?? 0;
  const caStatus = STATUS_RANK[candidateSlot.verification_status] ?? 0;
  if (caStatus < exStatus) return existingSlot;
  if (caStatus > exStatus) return candidateSlot;

  const exConf = CONFIDENCE_RANK[existingSlot.confidence] ?? 0;
  const caConf = CONFIDENCE_RANK[candidateSlot.confidence] ?? 0;
  if (caConf < exConf) return existingSlot;
  if (caConf > exConf) return candidateSlot;

  const exSpec = slotType !== "officialWebsite" && isSpecificActionUrl(existingSlot.url, slotType) ? 1 : 0;
  const caSpec = slotType !== "officialWebsite" && isSpecificActionUrl(candidateSlot.url, slotType) ? 1 : 0;
  if (caSpec < exSpec) return existingSlot;
  if (caSpec > exSpec) return candidateSlot;

  const exTier = SOURCE_TIER_RANK[existingSlot.source] ?? 99;
  const caTier = SOURCE_TIER_RANK[candidateSlot.source] ?? 99;
  if (caTier < exTier) return candidateSlot;
  return existingSlot;
}

/**
 * Idempotent place-level action record merge (Requirement #7).
 * Deduplicates generic homepage URLs so officialWebsite "/" is never duplicated
 * inside ticket_url or menu_url.
 */
export function mergePlaceActionRecord(existingRecord, incomingRecord) {
  if (!incomingRecord || !incomingRecord.place_id) return existingRecord || null;
  const base = existingRecord && existingRecord.place_id === incomingRecord.place_id
    ? existingRecord
    : { place_id: incomingRecord.place_id, name: incomingRecord.name || "" };

  const slots = ["officialWebsite", "ticket_url", "admission_url", "reservation_url", "menu_url"];
  const mergedActions = {};
  const existingActions = base.actions || {};
  const incomingActions = incomingRecord.actions || {};

  for (const s of slots) {
    const slot = mergeActionSlot(existingActions[s] || null, incomingActions[s] || null, s);
    if (slot) mergedActions[s] = slot;
  }

  // Deduplication: if ticket_url or menu_url or reservation_url is identical to
  // officialWebsite AND is just a generic root homepage "/", drop the redundant
  // deep slot so officialWebsite owns the root URL cleanly without duplicate URLs.
  const siteKey = mergedActions.officialWebsite ? urlComparisonKey(mergedActions.officialWebsite.url) : "";
  for (const deep of ["ticket_url", "menu_url", "reservation_url"]) {
    if (mergedActions[deep] && siteKey && urlComparisonKey(mergedActions[deep].url) === siteKey && isRootHomepageUrl(mergedActions[deep].url)) {
      delete mergedActions[deep];
    }
  }
  if (mergedActions.admission_url && mergedActions.ticket_url &&
      urlComparisonKey(mergedActions.admission_url.url) === urlComparisonKey(mergedActions.ticket_url.url)) {
    delete mergedActions.admission_url;
  }

  return {
    place_id: incomingRecord.place_id,
    name: incomingRecord.name || base.name || "",
    ...(incomingRecord.locality || base.locality ? { locality: incomingRecord.locality || base.locality } : {}),
    ...(incomingRecord.gap_class || base.gap_class ? { gap_class: incomingRecord.gap_class || base.gap_class } : {}),
    actions: mergedActions,
  };
}
