// lib/paidFloridaLanding.js — data + copy for /go/florida, the paid landing
// page for Google Search and YouTube campaigns aimed at Florida residents and
// US travelers planning a Florida trip.
//
// PLAIN DATA MODULE, DELIBERATELY. No JSX, no "next/cache", no
// "next/navigation" — everything here is importable by a bare-node script
// (scripts/check-go-florida-landing.mjs calls every filter and every link
// builder directly, the way CLAUDE.md's "assert on the call, not the
// string" asks). The curated-events read (which does need next/cache's
// unstable_cache) stays in app/go/florida/page.js itself.
//
// COPY LAW FOR THIS SURFACE (owner directive, paid Florida landing):
//   - no dashes in any visible copy string below: no em dash (U+2014), no en
//     dash (U+2013), no " - " used as punctuation. A hyphen INSIDE a word
//     (drive-thru, kid-friendly, things-to-do-orlando) is fine — it is not a
//     dash, it is spelling.
//   - never mention a price.
//   - never order or imply an order by commission.
//   - no unsupported "best" / "#1" / discount / popularity claim, with the
//     one named exception below (HOT_SNAPSHOT_HEADING), and nowhere else.
//   - every experience-search button reads exactly "See availability ↗"
//     (the sitewide Viator CTA copy — see app/components/SummerPicksRails.js
//     and app/components/NightTourProductCards.js).
//   - the commission disclosure is verbatim DISCLOSURE below, and visible.
//   - no Directions button anywhere on this page — this module renders no
//     place cards at all, only guides, curated events and partner offers.
import { MENU_PARTNER_OFFERS } from "./menuPartnerOffers.js";
import { GUIDES } from "./guides.js";

// The one commerce attribution surface for every paid-Florida link. Every
// commerceHref / eventTicketHref / eventTicketCta / experienceGoUrl /
// ticketmasterGoUrl call on this page carries this, never a hand-typed copy
// of the string.
export const SURFACE = "paid_florida";

// FTC disclosure. Rendered in the hero and again in the footer — verbatim,
// both places, never paraphrased.
export const DISCLOSURE = "We earn commission on bookings. Rankings are never sold.";

export const HERO = Object.freeze({
  kicker: "YOUR NEXT FLORIDA DAY",
  h1: "A little less searching. A lot more Florida.",
  sub: "Spring water, Gulf sunsets and a day beyond the parks. Find your kind of Florida, with local guides and places worth making time for.",
  primaryLabel: "Find my Florida outing",
  primaryHref: "/",
  secondaryLabel: "Explore the guides",
  secondaryHref: "#hot",
});

// The optional ?focus= search param. An unknown value is ignored and the
// page renders in DEFAULT_SECTION_ORDER.
export const FOCUS_SECTIONS = Object.freeze(["orlando", "gulf-coast", "halloween", "nature", "stays", "shows"]);

// Section order below the hero, hero excluded. "hot" always leads unless a
// valid ?focus= promotes a different section ahead of it.
export const DEFAULT_SECTION_ORDER = Object.freeze(["hot", "halloween", "orlando", "nature", "shows", "stays", "gulf-coast"]);

/**
 * The rendered section order for a given ?focus= value. An unrecognized
 * value (missing, empty, typo, anything outside FOCUS_SECTIONS) returns
 * DEFAULT_SECTION_ORDER unchanged — "ignored", not "errors".
 */
export function orderedSections(focus) {
  const f = String(focus || "").trim().toLowerCase();
  if (!FOCUS_SECTIONS.includes(f)) return DEFAULT_SECTION_ORDER;
  return Object.freeze([f, ...DEFAULT_SECTION_ORDER.filter((k) => k !== f)]);
}

// ── #hot — "Most opened on Wayfind this month" ──────────────────────────────
// PostHog snapshot 2026-09-17, last 30 days unique visitors on Wayfind guide
// pages. Order below IS the ranking: a dated fact about what readers actually
// opened, not an opinion, and the one place on this page (or anywhere else
// Wayfind's paid copy runs) allowed to use "most opened" as a stand-in for
// "best". Re-pull the snapshot and replace this list wholesale; never hand
// edit the ranking.
export const HOT_SNAPSHOT_HEADING = "The guides readers are opening";
export const HOT_SNAPSHOT_LABEL = "Most opened in the 30 days ending September 17, 2026";
// `title` here is Wayfind's own neutral card headline, deliberately NOT the
// live guide's own SEO title (lib/guides.js GUIDES[slug].title) — several of
// those titles carry a conventional listicle "Best" ("10 Best Things to Do
// in Sarasota", "Best Hotels Near Magic Kingdom"), which reads fine as an
// editorial headline but is exactly the unsupported-superlative shape this
// page's copy law rules out everywhere except HOT_SNAPSHOT_HEADING. Titling
// the CARD ourselves keeps that law absolute without having to rewrite (or
// pull an exception into) the guide's own published title.
export const HOT_GUIDES = Object.freeze([
  { slug: "things-to-do-orlando-not-theme-parks", title: "Orlando beyond the theme parks", blurb: "Skip the parks for a day and see what Orlando keeps for locals." },
  { slug: "swim-with-manatees-crystal-river", title: "Swim with manatees, Crystal River", blurb: "Get in the water with wild manatees, the right way and the legal way." },
  { slug: "siesta-key-drum-circle", title: "Siesta Key drum circle", blurb: "Catch Sarasota's Sunday sunset ritual, and know where to park before you go." },
  { slug: "things-to-do-sarasota", title: "Things to do in Sarasota", blurb: "Ten stops that fill a Sarasota day once you are sandy enough." },
  { slug: "winter-park-scenic-boat-tour", title: "Winter Park scenic boat tour", blurb: "Decide if the classic Winter Park cruise earns your hour before you book it." },
  { slug: "bioluminescence-kayak-tour-space-coast", title: "Bioluminescence kayak tour, Space Coast", blurb: "Paddle water that glows, on the nights it actually does." },
  { slug: "weeki-wachee-kayak-mermaids-guide", title: "Weeki Wachee Springs, kayaks and mermaids", blurb: "One spring, a live mermaid show, and a kayak paddle worth reserving ahead." },
  { slug: "gatorland-vs-wild-florida", title: "Gatorland vs Wild Florida", blurb: "Two Orlando gator parks, compared honestly so you pick the right one." },
  { slug: "st-armands-circle-restaurants", title: "Restaurants on St. Armands Circle", blurb: "Where to actually eat on the Circle, from a splurge table to the ice cream line." },
  { slug: "siesta-key-vs-lido-key", title: "Siesta Key vs Lido Key", blurb: "Sand, crowds and parking, compared so you pick the right Sarasota beach." },
  { slug: "anna-maria-island-day-trip", title: "Anna Maria Island day trip", blurb: "An old Florida beach day done right, with a free trolley trick." },
]);

// Rendering only existing, live guides. A guide that sunsets is DELETED from
// lib/guides.js entirely (see that file's header), so "exists in GUIDES" is
// the whole test — no separate expiry field to check here.
export function liveGuides(list) {
  return (list || []).filter((g) => Boolean(GUIDES[g.slug]));
}

// ── gulf coast — the Sarasota / Siesta / Lido / Anna Maria / St. Armands set
export const GULF_COAST_HEADING = "Sarasota and the Gulf Coast keys";
export const GULF_COAST_INTRO = "Siesta Key, Lido Key, St. Armands Circle and Anna Maria Island, covered in one place.";
export const GULF_COAST_GUIDES = Object.freeze([
  { slug: "things-to-do-sarasota", title: "Things to do in Sarasota", blurb: "Ten stops that fill a Sarasota day once you are sandy enough." },
  { slug: "siesta-key-vs-lido-key", title: "Siesta Key vs Lido Key", blurb: "Sand, crowds and parking, compared so you pick the right beach." },
  { slug: "st-armands-circle-restaurants", title: "Restaurants on St. Armands Circle", blurb: "Where to actually eat on the Circle, from a splurge table to the ice cream line." },
  { slug: "anna-maria-island-day-trip", title: "Anna Maria Island day trip", blurb: "An old Florida beach day done right, with a free trolley trick." },
  { slug: "siesta-key-drum-circle", title: "Siesta Key drum circle", blurb: "Catch Sarasota's Sunday sunset ritual, and know where to park before you go." },
]);

// ── halloween — copy shell; the eligible, ticketed events come from a live
// curated read in app/go/florida/page.js (fetchCuratedEvents), never here.
export const HALLOWEEN_HEADING = "Halloween and fall events with tickets";
export const HALLOWEEN_INTRO = "Dates checked against official sources. Tap through for tickets.";
export const HALLOWEEN_ALL_EVENTS_LABEL = "All Florida events";
export const HALLOWEEN_ALL_EVENTS_HREF = "/florida-events";
export const HALLOWEEN_FALLBACK_TEXT = "See every upcoming Florida event, with dates, on the Florida Events page.";

// ── orlando — theme park tickets, straight from MENU_PARTNER_OFFERS ────────
export const ORLANDO_HEADING = "Theme park tickets";
export const ORLANDO_INTRO = "Park tickets from Wayfind's ticket partners. Tap through for dates and live availability.";
export const TICKET_CTA_LABEL = "Tickets";

// ── nature — outdoors, marinas and beaches offers, plus curated search intent
export const NATURE_HEADING = "Tours and experiences";
export const NATURE_INTRO = "Manatees, kayaks, airboats and sunset cruises. See what is actually running before you drive out.";
export const AVAILABILITY_CTA_LABEL = "See availability ↗";

// ── shows — TicketNetwork venues, music and sports ──────────────────────────
export const SHOWS_HEADING = "Concerts, games and shows";
export const SHOWS_INTRO = "Arenas, ballparks and music venues across Florida. See what is on before you plan the night.";

// ── stays ────────────────────────────────────────────────────────────────
// hotelGoUrl(place, location) (lib/affiliates.js) requires a REAL lodging
// place object — isTrueLodging(place) checks a verified lodging TYPE, not
// just a name and an address. This page has no such verified property to
// point the hotel redirect at (no Places calls run here at all, by design),
// and fabricating one would mean inventing a "place" Wayfind never checked.
// The honest answer is the organic guide, which already does this work.
export const STAYS_HEADING = "Where to stay";
export const STAYS_INTRO = "Staying near the parks? Start with the guide that compares the hotels that make park mornings easier.";
export const STAYS_GUIDE_SLUG = "best-hotels-near-magic-kingdom";
// Card headline, not the guide's own published title (which carries a
// conventional listicle "Best") — same reasoning as HOT_GUIDES above.
export const STAYS_GUIDE_TITLE = "Hotels near Magic Kingdom";

// ── footer ───────────────────────────────────────────────────────────────
export const FOOTER_LINKS = Object.freeze([
  { label: "Florida travel guides", href: "/guides" },
  { label: "Florida events", href: "/florida-events" },
  { label: "Things to do in Orlando", href: "/things-to-do/orlando" },
  { label: "Things to do in Tampa", href: "/things-to-do/tampa" },
  { label: "Things to do in Sarasota", href: "/things-to-do/sarasota" },
  { label: "Things to do in Miami", href: "/things-to-do/miami" },
]);

// ── Florida markets ──────────────────────────────────────────────────────
// Every market MENU_PARTNER_OFFERS actually carries that is IN Florida. An
// allowlist, not a denylist of Gurnee/Chicago/New York — a new non-Florida
// market added upstream stays excluded here by default instead of leaking in
// silently. scripts/check-go-florida-landing.mjs asserts this list contains
// no market outside Florida and that the filtered arrays below never include
// a known non-Florida offer (Gurnee's Six Flags, Chicago's Field Museum, …).
export const FLORIDA_MARKETS = Object.freeze([
  "Bradenton", "Clearwater", "Fort Lauderdale", "Kenansville", "Key West",
  "Kissimmee", "Lakeland", "Merritt Island", "Miami", "Orlando", "Plant City",
  "Sanford", "Sarasota", "St. Augustine", "St. Petersburg", "Tampa", "Weston",
  "Winter Haven",
]);

const isFloridaOffer = (o) => Boolean(o) && FLORIDA_MARKETS.includes(o.market);
const fitsAny = (o, fits) => Array.isArray(o.fits) && fits.some((f) => o.fits.includes(f));

// MENU_PARTNER_OFFERS is upstream content this page does not own (see that
// file's header) and a few of its rows (the SamBoat listings) carry an em
// dash in `title` ("SamBoat Rentals — Tampa"). This page's copy law is
// stricter than the registry's, so every title rendered here is cleaned at
// the SAME point the row is selected — never left to whichever component
// happens to render it — by turning " <dash> " into ", ". scripts/
// check-go-florida-landing.mjs calls this exact function against the exact
// upstream rows and asserts nothing dashed survives it.
// Built from character CODES, never a literal dash glyph in this file's own
// source — scripts/check-go-florida-landing.mjs scans this file's raw text
// for a dash character, and a dash-matching regex written the obvious way
// (a literal em dash inside a character class) would BE the violation it
// exists to catch.
const DASH_GLYPHS = [0x2012, 0x2013, 0x2014, 0x2015].map((code) => String.fromCharCode(code)).join("");
const TITLE_DASH_RX = new RegExp("\\s[" + DASH_GLYPHS + "]\\s", "g");
export function cleanOfferTitle(title) {
  return String(title || "").replace(TITLE_DASH_RX, ", ");
}
const withCleanTitle = (o) => Object.freeze({ ...o, title: cleanOfferTitle(o.title) });

// Theme park tickets — Florida market, "attractions:themeparks" fit.
export const THEME_PARK_OFFERS = Object.freeze(
  MENU_PARTNER_OFFERS.filter((o) => isFloridaOffer(o) && fitsAny(o, ["attractions:themeparks"])).map(withCleanTitle),
);

// Outdoors, marinas, beaches — Florida market only.
export const NATURE_OFFERS = Object.freeze(
  MENU_PARTNER_OFFERS.filter((o) => isFloridaOffer(o) && fitsAny(o, ["attractions:outdoors", "attractions:marinas", "attractions:beaches"])).map(withCleanTitle),
);

// TicketNetwork venues — music and sports, Florida market only.
export const SHOW_OFFERS = Object.freeze(
  MENU_PARTNER_OFFERS.filter((o) => isFloridaOffer(o) && o.provider === "ticketnetwork" && fitsAny(o, ["nightlife:music", "nightlife:sports"])).map(withCleanTitle),
);

// Curated Viator SEARCH intents (never a Book paint — experienceGoUrl always
// appends intent=search). Each one is a hand-picked, named search, not a
// place object, so this is the guides/culture-card calling shape from
// lib/affiliates.js: query + city, kind and placeId both omitted.
export const VIATOR_SEARCH_INTENTS = Object.freeze([
  { id: "manatee-crystal-river", title: "Swim with manatees, Crystal River", blurb: "Guided swims in the warm springs manatees favor in cooler months.", query: "manatee swim tour", city: "Crystal River", kind: "outdoors" },
  { id: "bioluminescent-titusville", title: "Bioluminescent night kayak, Titusville", blurb: "Paddle the Indian River Lagoon on a dark, moonless night.", query: "bioluminescent night kayak tour", city: "Titusville", kind: "outdoors" },
  { id: "siesta-key-sunset-cruise", title: "Sunset cruise, Siesta Key", blurb: "Watch the Gulf sunset from the water instead of the sand.", query: "sunset cruise", city: "Siesta Key", kind: "outdoors" },
  { id: "orlando-airboat", title: "Airboat tour, Orlando", blurb: "Fan boats out into central Florida's gator country.", query: "airboat tour", city: "Orlando", kind: "outdoors" },
  { id: "clearwater-dolphin-cruise", title: "Dolphin cruise, Clearwater", blurb: "A short Gulf run built around finding wild dolphins.", query: "dolphin cruise", city: "Clearwater", kind: "outdoors" },
]);


// Reader-facing context describes the existing offer and its category only.
// No invented duration, rating, live inventory, or price.
const OFFER_NOTES = Object.freeze({
  "tampa-hook-busch-gardens": "For a Tampa day with rides and wildlife. Compare admission options before choosing your date.",
  "orlando-hook-seaworld": "For an Orlando park day centered on marine life and rides. Check the admission options with the partner.",
  "winterhaven-hook-legoland": "For a family day built around LEGO. Check the park options and age guidance before booking.",
  "orlando-hook-boggy-creek": "For a change of pace from the parks. Compare airboat departures from Kissimmee.",
  "kenansville-hook-wild-florida": "For an outdoor day in Kenansville. Compare airboat and safari options before choosing a ticket.",
  "miami-hook-everglades-safari-park": "For an Everglades outing from the Miami area. Check tour details and the meeting point before you set off.",
  "tampa-venue-ritz-ybor": "Build a Ybor City night around a show. Check the artist, date and entry requirements before booking.",
  "stpete-venue-jannus-live": "Make live music the center of your St. Petersburg evening. Check the lineup for your dates.",
  "tampa-venue-tampa-theatre": "Plan a Tampa evening around the program. Check what is playing before choosing your seats.",
});
export function offerContext(offer) {
  if (OFFER_NOTES[offer.offerId]) return OFFER_NOTES[offer.offerId];
  if (offer.provider === "ticketnetwork") return "Choose a date and check the venue lineup before planning your night.";
  if (offer.fits?.includes("attractions:themeparks")) return "Make this your park day. Compare admission options and dates with the ticket partner.";
  if (offer.fits?.includes("attractions:marinas")) return "Build a day on the water. Check the departure point and rental details before booking.";
  return "Take your day outdoors. Check the meeting point, tour options and conditions with the operator.";
}

export const INTEREST_LINKS = Object.freeze([
  { href: "#hot", label: "Local guides", detail: "A place to start" },
  { href: "#nature", label: "On the water", detail: "Springs, boats & wildlife" },
  { href: "#orlando", label: "Park days", detail: "Big days out" },
  { href: "#halloween", label: "Fall plans", detail: "What is on this season" },
  { href: "#gulf-coast", label: "Gulf Coast", detail: "Sand & sunset rituals" },
  { href: "#stays", label: "Stay a little longer", detail: "Make mornings easier" },
]);

// Bound unsigned image-CDN requests to the displayed media size. Signed URLs
// retain their exact bytes; changing their transform would invalidate the signature.
export function landingOfferImage(src) {
  if (!src) return null;
  try {
    const url = new URL(src);
    if (url.hostname.endsWith(".imgix.net") && !url.searchParams.has("s")) {
      url.searchParams.set("w", "960");
      url.searchParams.set("h", "600");
      url.searchParams.set("fit", "crop");
      return url.toString();
    }
  } catch { return null; }
  return src;
}
