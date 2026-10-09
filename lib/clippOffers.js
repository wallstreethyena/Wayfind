// lib/clippOffers.js — the Clipp market registry: WHICH clipp.com pages we are
// willing to send a user to, and the evidence that each one is real.
//
// WHY A REGISTRY AND NOT A URL TEMPLATE
// clipp.com is behind Akamai and 403s every non-browser fetcher — pages,
// robots.txt and sitemap.xml alike. So nothing in CI, no cron, and no health
// probe can ever tell us whether a clipp.com page exists: a 403 is returned for
// the real Sarasota page and for a made-up one identically. A template like
// `/states/fl/cities/${slug}` would therefore mint confident links to pages
// nobody has ever loaded, and the first evidence of a bad one would be a user
// landing on an error page with our affiliate tracking attached.
//
// So membership in this list IS the claim, and every row carries the browser
// verification that backs it. Adding a market means opening it in a real browser
// and recording what was on the page — not editing a slug.
//
// THE SHAPE MISTAKE THIS LIST EXISTS TO PREVENT
// The path shape /local-coupons/<st>/<city> looks right and was in the original
// hand-off notes. It renders Clipp's own "Sorry, something went wrong!" page.
// The shape that actually serves inventory is /states/<st>/cities/<city>.
// Both were confirmed in a browser on 2026-07-29.
//
// REGISTRY RULE (WORK_ORDER_DEALS_SHARECARDS.md §2): every deal that enters code
// also gets a row in the off-repo project registry (claude/wayfind-deals-registry.md)
// with a scheduled expiry robot. The coupon cards auto-hide on `expires`; the
// robots clean up the data. A row here is NOT a substitute for that.
import { clippDeepLink, isClippDest } from "./deals.js";

// One row per verified market. `verified` is evidence, not decoration:
//   on        — the date a human/browser actually loaded the page
//   dealsSeen — how many offers were on it (0 would mean "exists but is empty",
//               which is NOT shippable — we would be sending users to a blank)
//   sample    — merchants seen on the page, so a future audit can tell
//               "inventory rotated" apart from "the page broke"
export const CLIPP_MARKETS = Object.freeze([
  Object.freeze({
    offerId: "clipp-fl-sarasota",
    city: "Sarasota",
    area: "Sarasota",
    state: "FL",
    dest: "https://www.clipp.com/states/fl/cities/sarasota",
    verified: Object.freeze({
      on: "2026-07-29",
      title: "Local Savings, Deals, Coupons and More in Sarasota, FL",
      dealsSeen: 36,
      sample: Object.freeze(["Five-O Donut Co", "Rodizio Grill Brazilian Steakhouse Sarasota", "Clean Eatz - Sarasota", "The Glossie River"]),
    }),
  }),
  Object.freeze({
    offerId: "clipp-fl-bradenton",
    city: "Bradenton",
    area: "Bradenton",
    state: "FL",
    dest: "https://www.clipp.com/states/fl/cities/bradenton",
    verified: Object.freeze({
      on: "2026-07-29",
      title: "Local Savings, Deals, Coupons and More in Bradenton, FL",
      dealsSeen: 36,
      sample: Object.freeze(["Orange Blossom Coffee", "El Warike Peruvian Cuisine", "Geckos Grill & Pub - Bradenton", "The Peach Cobbler Factory"]),
    }),
  }),
  // Tampa and Orlando, added 2026-07-31. These were never a partnership limit —
  // Clipp has served both all along and this list simply did not name them. The
  // gap was costing twice over: no Clipp inventory in our two largest food
  // metros, AND it made the geo-relevance fix look like a trade-off, because
  // filtering Sarasota cards away from an Orlando visitor left that tab with one
  // national code and an empty ledger. With these two rows the filter stops being
  // subtraction and becomes per-metro targeting.
  Object.freeze({
    offerId: "clipp-fl-tampa",
    city: "Tampa",
    area: "Tampa",
    state: "FL",
    dest: "https://www.clipp.com/states/fl/cities/tampa",
    verified: Object.freeze({
      on: "2026-07-31",
      title: "Local Savings, Deals, Coupons and More in Tampa, FL",
      dealsSeen: 36,
      sample: Object.freeze(["Bavaro's Pizza Napoletana & Pastaria", "Brown Bag Coffee Company", "The Poke Company", "Pacific Counter - Downtown Tampa"]),
    }),
  }),
  Object.freeze({
    offerId: "clipp-fl-orlando",
    city: "Orlando",
    area: "Orlando",
    state: "FL",
    dest: "https://www.clipp.com/states/fl/cities/orlando",
    verified: Object.freeze({
      on: "2026-07-31",
      title: "Local Savings, Deals, Coupons and More in Orlando, FL",
      dealsSeen: 36,
      sample: Object.freeze(["Dave & Buster's Orlando", "Vicky Bakery", "Pokemoto - Dr. Phillips", "Fusion Bar & Grill"]),
    }),
  }),
]);

// ── Per-merchant offers (2026-08-07, owner directive: "fill the coupon tab
// with these Clipps, and align them to place cards where we have them") ──────
//
// Same registry-not-template rule as CLIPP_MARKETS, same reason: clipp.com is
// browser-only, so every row below was harvested from a real Chrome session on
// the date recorded, off the city page named in `verified.seenOn`. Inventory
// rotates weekly ("Almost Gone" / "Sold Out" states observed on the pages), so
// these expire on CLIPP_MERCHANT_AUDIT_EXPIRY (lib/coupons.js) and the re-verify
// robot decides renewal. A slug nobody has loaded in a browser does not belong
// here.
//
// `match` is the place-card alignment (couponForPlaceName is EXACT normalized
// match on business + match). Rules, per the #475 matcher-exactness lesson:
//   • match carries a library/Google place name ONLY when the venue is the SAME
//     LOCATION as the certificate (verified against wf_inventory lat/lng).
//   • Brand-only matches are forbidden: the Clipp "Cinnaholic St. Petersburg"
//     card must NOT attach to the library's South Tampa Cinnaholic, and the
//     Pinellas Park McDonald's must not attach to the Sarasota ones. Where the
//     locations differ the match list stays empty and the business name carries
//     its location suffix so the normalized key cannot collide.
//   • kind: "dining" | "activity" — drives which intents the coupon ships with
//     (and the guard asserts the split).
//   • icon — explicit category emoji for the card's visual tile (owner ask
//     2026-08-07: the imageless cards were unreadable at a glance). Explicit
//     per-row, never inferred, same reason dealArtwork refuses inference.
//   • photoRef — the VENUE'S OWN Google photo resource (wf_inventory, same
//     location verified), rendered through our cached same-origin /api/photo
//     proxy. Only rows whose venue identity is location-verified carry one.
export const CLIPP_MERCHANT_OFFERS = Object.freeze([
  // ── Tampa core ──
  Object.freeze({ offerId: "clipp-m-chez-leon", icon: "🍽️", merchant: "Chez Leon", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12863814",
    photoRef: "places/ChIJF9UDDXDFwogRKZRJ9asRgQo/photos/wfplacediscovery",
    match: Object.freeze([]), // business name IS the verified library place name (Tampa, 27.9487,-82.4577)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-dip-and-happy", icon: "🫕", merchant: "Dip and Happy", area: "Tampa", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-tampa-fl-deal-12863594",
    photoRef: "places/ChIJ_7PQ3B_FwogRe-JJpGpKs38/photos/wfplacediscovery",
    match: Object.freeze([]), // library place name (Tampa, 27.9519,-82.4610)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-pacific-counter", icon: "🍣", merchant: "Pacific Counter - Downtown Tampa", area: "Tampa", kind: "dining",
    title: "$10.50 for $30 of poke bowls & more", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/30-poke-dining-more-tampa-fl-deal-12313149",
    photoRef: "places/ChIJb3ZWipHFwogRf3492iZdVZU/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9514,-82.4624)
    // Deliberately NO bare "Pacific Counter" variant: the chain has a St. Pete
    // location and a bare-name match would attach this Tampa certificate there.
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-brown-bag-coffee", icon: "☕", merchant: "Brown Bag Coffee Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869689",
    photoRef: "places/ChIJ-0q1Cp3FwogRFt9UWUtxFcQ/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9612,-82.4417)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-poke-company", icon: "🍣", merchant: "The Poke Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of poke bowls & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-poke-bowls-more-tampa-fl-deal-12869690",
    photoRef: "places/ChIJ8TYSe2bFwogRv1zoFgdBVdc/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9510,-82.4475)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-ticos-bakery", icon: "🥐", merchant: "Tico's Bakery", area: "Tampa", kind: "dining",
    title: "$10 for $20 of bakery items", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-bakery-items-tampa-fl-deal-12868978",
    photoRef: "places/ChIJl9FkZADFwogRGUeMYiHU80M/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9600,-82.4343)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-pizza-kitchen", icon: "🍕", merchant: "Pizza Kitchen", area: "Tampa", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12875835",
    photoRef: "places/ChIJrd5cMw_DwogRgRc4JgnCIBw/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9526,-82.4593)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-toastique", icon: "🥪", merchant: "Toastique - E Cumberland", area: "Tampa", kind: "dining",
    title: "$10 for $20 of gourmet toast & smoothies", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-gourmet-toast-smoothies-more-tampa-fl-deal-12829757",
    photoRef: "places/ChIJd2Qw71vFwogRQITXSYyjiZA/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9445,-82.4500)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-eleven80-cafe", icon: "☕", merchant: "Eleven80 Cafe", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869317",
    photoRef: "places/ChIJoWDfRyPDwogR4qmTsaY4eZs/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9260,-82.5062)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-blind-goat", icon: "🍽️", merchant: "The Blind Goat", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
    photoRef: "places/ChIJeadUwiPDwogRu8Gq_Qf8cLw/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9279,-82.5122)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-el-pollo-cartel", icon: "🍗", merchant: "El Pollo Cartel", area: "Tampa", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12870496",
    photoRef: "places/ChIJNZybi-nTwogRq0EWhDRDh-k/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9221,-82.3704)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-qdoba-gandy", icon: "🌮", merchant: "QDOBA - Gandy", area: "Tampa", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-tampa-fl-deal-12815317",
    photoRef: "places/ChIJk6CFI8XcwogRkyaakn37ZYE/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8941,-82.5068)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-fletcher", icon: "🍕", merchant: "Marco's Pizza - Fletcher Ave", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12866091",
    photoRef: "places/ChIJCwCS6DXHwogRhUKlA53KGZU/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (28.0684,-82.4705)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── St. Petersburg / Pinellas ──
  Object.freeze({ offerId: "clipp-m-ubuntu", icon: "🍽️", merchant: "Ubuntu", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12875701",
    photoRef: "places/ChIJo6xRYhnxwogRTinjrpTceN0/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.7708,-82.6568)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-4th-street-pizza", icon: "🍕", merchant: "4th Street Pizza", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of pizza & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-more-st-petersburg-fl-deal-12869854",
    photoRef: "places/ChIJe2RtO13hwogRJDqo5cJ4x-s/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8014,-82.6378)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-lucid-coffee-kava", icon: "☕", merchant: "Lucid Coffee and Kava", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of coffee & kava", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12876294",
    photoRef: "places/ChIJR8nS5vvnwogRs-fqIIdVTpk/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8658,-82.6429)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-outcast-brewing", icon: "🍺", merchant: "Outcast Brewing Company", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12861133",
    photoRef: "places/ChIJTTxhRh3jwogRqkl3aF6iKG8/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.7827,-82.6577)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-pinellas-ale-works", icon: "🍺", merchant: "Pinellas Ale Works", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12876296",
    photoRef: "places/ChIJe5tp6THiwogRnj98j2gP4xg/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.7699,-82.6601)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-cinnaholic-stpete", icon: "🧁", merchant: "Cinnaholic St. Petersburg", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of gourmet cinnamon rolls", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12870653",
    photoRef: "places/ChIJmVWoF1bhwogRKpe0VhnzTSw/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8200,-82.6391)
    // The library's "Cinnaholic" card is the SOUTH TAMPA location
    // (27.9342,-82.4832) — different venue. No match, and the business name
    // keeps its city suffix so the normalized keys cannot collide.
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-vista-at-the-top", icon: "🍽️", merchant: "Vista at the Top", area: "Tierra Verde", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-tierra-verde-fl-deal-12869853",
    photoRef: "places/ChIJm1dsslQdw4gRu0ZGx1yRotk/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.6899,-82.7211)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-mcdonalds-66th", icon: "🍔", merchant: "McDonald's - 66th Street N", area: "Pinellas Park", kind: "dining",
    title: "$10 for $20 of burgers & fries", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-burgers-fries-more-pinellas-park-fl-deal-12842350",
    photoRef: "places/ChIJWaOLldHkwogRqvp-ReHaI7Q/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8638,-82.7283)
    // Library has two "McDonald's" rows in manatee-sarasota — different
    // locations. No bare-brand match (see #475 note above).
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-katch-bistro", icon: "🐟", merchant: "Katch Bistro", area: "Clearwater", kind: "dining",
    title: "$25 for $50 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/50-casual-dining-clearwater-fl-deal-12824312",
    photoRef: "places/ChIJ70r8flXlwogRFDnkMX9G0dE/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8946,-82.6698)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── East Hillsborough / Pasco ──
  Object.freeze({ offerId: "clipp-m-chill-cawfee", icon: "☕", merchant: "Chill Cawfee", area: "Lithia", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-lithia-fl-deal-12871286",
    photoRef: "places/ChIJ0ScRB4PTwogR7f3MteEkjX8/photos/wfplacediscovery",
    match: Object.freeze([]), // library place name (Lithia/FishHawk, 27.8612,-82.2010)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-riverview", icon: "🍕", merchant: "Marco's Pizza - Riverview", area: "Riverview", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-riverview-fl-deal-12853657",
    photoRef: "places/ChIJPXKIA6PRwogR1RMJ-1_IMbc/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8343,-82.3268)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-lithia", icon: "🍕", merchant: "Marco's Pizza - Lithia", area: "Lithia", kind: "dining",
    title: "$15 for $30 of pizza & subs", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-subs-more-lithia-fl-deal-12853410",
    photoRef: "places/ChIJ58_X4y4t3YgRiG24cVR1c5M/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8527,-82.2052)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-beanies-ruskin", icon: "🍺", merchant: "Beanie's Bar & Sports Grill", area: "Ruskin", kind: "dining",
    title: "$15 for $30 of American cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-american-cuisine-ruskin-fl-deal-12846182",
    photoRef: "places/ChIJY8QiKnAnw4gRh1QETfS30sE/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.7043,-82.4426)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-village-inn-lol", icon: "🥞", merchant: "Village Inn - Land O' Lakes", area: "Land O' Lakes", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-land-o-lakes-fl-deal-12865739",
    photoRef: "places/ChIJqdfnINi7wogRxMrYLHz7Qis/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (28.1866,-82.4428)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-obriens-plant-city", icon: "🍺", merchant: "O'Brien's Irish Pub & Grill - Plant City", area: "Plant City", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-plant-city-fl-deal-11108607",
    photoRef: "places/ChIJc0G9_Rk03YgRxU9RIq3Es74/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9990,-82.1386)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "wesley-chapel" }) }),
  // ── Bradenton / Parrish side ──
  Object.freeze({ offerId: "clipp-m-orange-blossom", icon: "☕", merchant: "Orange Blossom Coffee", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-bradenton-fl-deal-12824076",
    photoRef: "places/ChIJPfVM-xIXw4gRiT1_XuUakks/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.4975,-82.5732)
    match: Object.freeze([]), // registry's first per-merchant seed (real-user detail_open evidence)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-el-warike", icon: "🥘", merchant: "El Warike Peruvian Cuisine", area: "Bradenton", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-bradenton-fl-deal-12831352",
    photoRef: "places/ChIJ1-3fCmwWw4gRZ3jzqZZumVM/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.4638,-82.5881)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-peach-cobbler-bradenton", icon: "🧁", merchant: "The Peach Cobbler Factory - Bradenton", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of cobbler & ice cream", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cobbler-ice-cream-more-bradenton-fl-deal-12829469",
    photoRef: "places/ChIJ6TpnBFYXw4gR9SKCJeTnIjY/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.4616,-82.5684)
    // Library's card is "The Peach Cobbler Factory Tampa/USF" — different
    // location; suffix on the business name keeps the keys apart.
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-bradenton", icon: "🍕", merchant: "Marco's Pizza - Bradenton", area: "Bradenton", kind: "dining",
    title: "$12.50 for $25 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/25-casual-dining-bradenton-fl-deal-12876521",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  // ── Sarasota ──
  Object.freeze({ offerId: "clipp-m-clean-eatz-sarasota", icon: "🥗", merchant: "Clean Eatz - Sarasota", area: "Sarasota", kind: "dining",
    title: "$10 for $20 of prepared meals & wraps", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-prepared-meals-wraps-more-sarasota-fl-deal-12869518",
    photoRef: "places/ChIJQ2lqiihBw4gRKikqAzm9Lhc/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.2700,-82.4876)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-five-o-donut", icon: "🍩", merchant: "Five-O Donut Co", area: "Sarasota", kind: "dining",
    title: "$10 for $20 of donuts", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-donuts-deal-12515586",
    photoRef: "places/ChIJ0-3_7GRAw4gRmttY9pKuGss/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.3359,-82.5255)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-rosys-ice-cream", icon: "🍦", merchant: "Rosy's Ice Cream", area: "Osprey", kind: "dining",
    title: "$10 for $20 of ice cream & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-ice-cream-more-osprey-fl-deal-12832419",
    photoRef: "places/ChIJ2aQyshdDw4gRmmFabE8pyLY/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.1779,-82.4827)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "bradenton" }) }),
  // ── Activities (familyfun/nightout inventory, not dining) ──
  Object.freeze({ offerId: "clipp-m-ismash-brandon", icon: "🔨", merchant: "iSmash", area: "Brandon", kind: "activity",
    title: "$28 for two starter smash sessions (reg. $80)", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/80-for-two-starter-smash-sessions-brandon-fl-deal-12829427",
    photoRef: "places/ChIJP3St-uTTwogRYDZFgRQGuNI/photos/wfplacediscovery",
    // SAME venue as the library's "iSmash Tampa" card (27.8920,-82.2724 =
    // Brandon) — verified against wf_inventory 2026-08-07, so this one aligns.
    match: Object.freeze(["iSmash Tampa"]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-t4-kartplex", icon: "🏎️", merchant: "T4 KartPlex", area: "Palmetto", kind: "activity",
    title: "Standard go-kart session for 2 (reg. $70)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/70-for-standard-session-go-kart-rental-for-2-people-palmetto-fl-deal-12856611",
    photoRef: "places/ChIJX_xfN8sjw4gRk4k8uynBAnQ/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.6059,-82.5417)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-back-nine", icon: "⛳", merchant: "The Back Nine", area: "Bradenton", kind: "activity",
    title: "One-month membership for new members (reg. $199)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/199-for-one-month-membership-for-new-members-bradenton-fl-deal-12789349",
    photoRef: "places/ChIJKVRP_EYXw4gRac5SKnbSMKo/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.4617,-82.5832)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  // ── ORLANDO METRO (2026-08-23 harvest) ────────────────────────────────────
  // Owner, 2026-08-23: "i went to clipp and they had tons of great coupons make
  // sure to bring in 100 of them and make sure to place them in the place cards
  // for the actual business."
  //
  // WHAT THE HARVEST ACTUALLY FOUND, because the number matters more than the
  // ambition. Every Clipp city page in our three metros was enumerated in a real
  // browser — 59 pages, Tampa Bay + Sarasota/Manatee + Orlando. They are not 59
  // separate catalogues: each page is the same regional pool re-sorted by
  // distance, so 1,269 tiles collapse to 89 DISTINCT offers. We already carried
  // 40. Of the 49 new ones, 7 were Sold Out and ~25 were car washes, Botox/TRT
  // clinics, oil changes and gyms — which the 2026-07-29 owner directive keeps
  // off the coupon tab ("offers for things Wayfind offers"). 13 were real
  // Wayfind inventory, and those 13 are below. Getting to 100 means opening
  // Miami / Fort Lauderdale / West Palm / Naples / Fort Myers / Jacksonville,
  // which each carry 30-36 more — a metro decision, not a harvest one.
  //
  // TWO BRAND COLLISIONS IN THIS BATCH, and they are why every row here ships an
  // EMPTY `match`. Google calls both QDOBA rows "QDOBA Mexican Eats" and both
  // Little Greek rows "Little Greek Fresh Grill" — one bare-name variant would
  // put the Ocoee certificate on the Apopka-Vineland card and the Lake Mary one
  // on the Oviedo card. The Place ID lifted from each photoRef is exact by
  // construction, so identity carries these and nothing else has to.
  //
  // NOT INCLUDED, deliberately: Duck Donuts Fort Myers and Sea Serpent Tours
  // (St. Augustine) resolve to no covered metro and would be `unplaced`, which
  // check-deal-sheet correctly refuses; and McDonald's Lake County, because a
  // McDonald's card is one this product is right not to rank.
  Object.freeze({ offerId: "clipp-m-bubbakoos-riverview", icon: "🌯", merchant: "Bubbakoo's Burritos", area: "Riverview", kind: "dining",
    title: "$10 for $20 of Mexican cuisine", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/20-mexican-cuisine-deal-10060634",
    placeId: "ChIJy_AuPHzPwogRzNAPPNWH1xw", // own Google photo; Google calls it "Bubbakoo's Burritos" (27.9124,-82.3471), 3.4mi from Riverview
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-bananas-axe-cabana", icon: "🪓", merchant: "Bananas' Axe Cabana", area: "Orlando", kind: "activity",
    title: "$16 for 1-hour axe throwing", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/32-for-1-hour-axe-throwing-orlando-fl-deal-12774124",
    placeId: "ChIJzaJ16EOB3YgRRKM6TF4tpKg", // own Google photo; Google calls it "Bananas' Axe Cabana" (28.385,-81.5), 12.9mi from Orlando
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-vicky-bakery-orlando", icon: "🥐", merchant: "Vicky Bakery", area: "Orlando", kind: "dining",
    title: "$15 for $30 of baked goods & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-baked-good-more-orlando-fl-deal-12787447",
    placeId: "ChIJ76upIABl54gRlpTN_Si1MFw", // own Google photo; Google calls it "Vicky Bakery Orlando" (28.497,-81.3121), 5mi from Orlando
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-pokemoto-dr-phillips", icon: "🍣", merchant: "Pokemoto - Dr. Phillips", area: "Orlando", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-orlando-fl-deal-12832608",
    placeId: "ChIJKyNEBwCB3YgRHtO1QTbDAa0", // own Google photo; Google calls it "Pokémoto Orlando (DR PHILLIPS)" (28.4063,-81.5023), 11.8mi from Orlando
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-fusion-bar-grill", icon: "🍽️", merchant: "Fusion Bar & Grill", area: "Casselberry", kind: "dining",
    title: "$20 for $40 of fusion cuisine", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/40-fusion-cuisine-casselberry-fl-deal-12853506",
    placeId: "ChIJD6HdFQJv54gRsl_it-tiC1w", // own Google photo; Google calls it "Fusion Bar & Grill" (28.6507,-81.3267), 1.9mi from Casselberry
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-qdoba-apopka-vineland", icon: "🌮", merchant: "QDOBA - Apopka Vineland", area: "Orlando", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-orlando-fl-deal-12815486",
    placeId: "ChIJzQMJ_VZ654gRSp46MagM5tM", // own Google photo; Google calls it "QDOBA Mexican Eats" (28.548,-81.3876), 0.8mi from Orlando
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-handels-oviedo", icon: "🍦", merchant: "Handel's Ice Cream - Oviedo", area: "Oviedo", kind: "dining",
    title: "$10 for $20 of ice cream & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-ice-cream-more-oviedo-fl-deal-12864145",
    placeId: "ChIJg68gQRBp54gRWy9izCqAECI", // own Google photo; Google calls it "Handel’s Homemade Ice Cream Oviedo, FL" (28.6535,-81.2078), 1.1mi from Oviedo
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-little-greek-oviedo", icon: "🥙", merchant: "Little Greek Oviedo", area: "Oviedo", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-oviedo-fl-deal-12810346",
    placeId: "ChIJUc_6jvpp54gR54FpEEe3P3M", // own Google photo; Google calls it "Little Greek Fresh Grill" (28.657,-81.203), 0.9mi from Oviedo
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-cleaneatz-windermere", icon: "🥗", merchant: "CleanEatz Windermere", area: "Winter Garden", kind: "dining",
    title: "$15 for $30 of dining or meal plan orders", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/30-dining-or-meal-plan-orders-winter-garden-fl-deal-12828013",
    placeId: "ChIJFwU2hb6H54gRML-xr9aJnUw", // own Google photo; Google calls it "Clean Eatz" (28.4289,-81.6182), 9.6mi from Winter Garden
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
]);

// 2026-09-03 targeted re-verification for place-card alignment. Clipp's Akamai
// edge denied the cloud-browser session, so this is deliberately NOT described
// as a browser harvest. Each id below was confirmed against Clipp's own indexed
// offer result on 2026-09-03 (exact merchant, town, product and /all-offers/
// destination). Only the identity-mapped rows are renewed: the four market
// landing cards continue to expose the full rotating catalogue, while an old
// merchant certificate cannot reappear on a place card merely because it was
// present in August.
// 2026-09-15 merchant re-audit (every row opened in a real browser, 53/53):
// 47 rendered with Add to Cart + Buy Now and a title naming the merchant.
// SIX came back "THIS DEAL IS SOLD OUT" with no buy widget and were DELETED
// rather than carried — Golf Social (12871011), Indoor Fairways (12856765),
// Zellwood Station Golf Club (8820772), Dave & Buster's Orlando (12607852),
// QDOBA Ocoee (12815339), Little Greek Fresh Grill Lake Mary (12276823). Four
// of those six were in the index-reverified list below and were therefore
// LIVE with a dead "Get certificate" button; they are removed from it here.
export const CLIPP_INDEX_REVERIFIED = Object.freeze({
  on: "2026-09-03",
  expires: "2026-10-03",
  offerIds: Object.freeze([
    "clipp-m-ismash-brandon",
    "clipp-m-bubbakoos-riverview",
    "clipp-m-bananas-axe-cabana",
    "clipp-m-vicky-bakery-orlando",
    "clipp-m-pokemoto-dr-phillips",
    "clipp-m-fusion-bar-grill",
    "clipp-m-qdoba-apopka-vineland",
    "clipp-m-handels-oviedo",
    "clipp-m-little-greek-oviedo",
    "clipp-m-cleaneatz-windermere",
  ]),
});

const _BY_ID = new Map([
  ...CLIPP_MARKETS.map((m) => [m.offerId, m]),
  ...CLIPP_MERCHANT_OFFERS.map((m) => [m.offerId, m]),
]);

/** The verified market row for an offer id, or null. Never guesses. */
export function clippOfferById(offerId) {
  return _BY_ID.get(String(offerId || "")) || null;
}

/**
 * The tracked destination for an offer id, or null when the offer is unknown or
 * its destination does not pass isClippDest.
 *
 * NULL IS THE WHOLE POINT. There is no untracked fallback: a clipp.com URL that
 * leaves this function without our PID earns nothing, so an unknown offer must
 * produce nothing at all rather than a working-but-free link. The redirect route
 * turns a null into a bounce back to our own Coupons tab.
 */
export function clippTrackedUrl(offerId, clickId) {
  const m = clippOfferById(offerId);
  if (!m || !isClippDest(m.dest)) return null;
  return clippDeepLink(m.dest, clickId);
}
