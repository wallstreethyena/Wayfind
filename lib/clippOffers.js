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
import {
  isQuarantinedPartnerOffer,
  applyRuntimePartnerQuarantine,
  resetRuntimePartnerQuarantine,
} from "./partnerOfferHolds.js";
import {
  OFFER_HEALTH_STATUS,
  EVIDENCE_STRENGTH,
  classifyClippLandingPage,
  evaluateOfferHealthTransition,
  evaluateClippOfferFreshness,
} from "./commerceHealth.js";



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
    verifiedAt: "2026-11-18T23:18:38.000Z",
    verificationMode: "manual",
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
    verifiedAt: "2026-11-18T23:18:38.000Z",
    verificationMode: "manual",
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
    verifiedAt: "2026-11-18T23:18:38.000Z",
    verificationMode: "manual",
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
    verifiedAt: "2026-11-18T23:18:38.000Z",
    verificationMode: "manual",
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
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-dip-and-happy", icon: "🫕", merchant: "Dip and Happy", area: "Tampa", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-tampa-fl-deal-12863594",
    photoRef: "places/ChIJ_7PQ3B_FwogRe-JJpGpKs38/photos/wfplacediscovery",
    match: Object.freeze([]), // library place name (Tampa, 27.9519,-82.4610)
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-brown-bag-coffee", icon: "☕", merchant: "Brown Bag Coffee Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869689",
    photoRef: "places/ChIJ-0q1Cp3FwogRFt9UWUtxFcQ/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9612,-82.4417)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-poke-company", icon: "🍣", merchant: "The Poke Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of poke bowls & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-poke-bowls-more-tampa-fl-deal-12869690",
    photoRef: "places/ChIJ8TYSe2bFwogRv1zoFgdBVdc/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9510,-82.4475)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-ticos-bakery", icon: "🥐", merchant: "Tico's Bakery", area: "Tampa", kind: "dining",
    title: "$10 for $20 of bakery items", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-bakery-items-tampa-fl-deal-12868978",
    photoRef: "places/ChIJl9FkZADFwogRGUeMYiHU80M/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9600,-82.4343)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-toastique", icon: "🥪", merchant: "Toastique - E Cumberland", area: "Tampa", kind: "dining",
    title: "$10 for $20 of gourmet toast & smoothies", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-gourmet-toast-smoothies-more-tampa-fl-deal-12829757",
    photoRef: "places/ChIJd2Qw71vFwogRQITXSYyjiZA/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9445,-82.4500)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-eleven80-cafe", icon: "☕", merchant: "Eleven80 Cafe", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869317",
    photoRef: "places/ChIJoWDfRyPDwogR4qmTsaY4eZs/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9260,-82.5062)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-blind-goat", icon: "🍽️", merchant: "The Blind Goat", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
    photoRef: "places/ChIJeadUwiPDwogRu8Gq_Qf8cLw/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.9279,-82.5122)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-fletcher", icon: "🍕", merchant: "Marco's Pizza - Fletcher Ave", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12866091",
    photoRef: "places/ChIJCwCS6DXHwogRhUKlA53KGZU/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (28.0684,-82.4705)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── St. Petersburg / Pinellas ──
  Object.freeze({ offerId: "clipp-m-ubuntu", icon: "🍽️", merchant: "Ubuntu", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12875701",
    photoRef: "places/ChIJo6xRYhnxwogRTinjrpTceN0/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.7708,-82.6568)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-4th-street-pizza", icon: "🍕", merchant: "4th Street Pizza", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of pizza & more", badge: "50% off",
    status: "ALMOST_GONE",
    dest: "https://www.clipp.com/all-offers/30-pizza-more-st-petersburg-fl-deal-12869854",
    photoRef: "places/ChIJe2RtO13hwogRJDqo5cJ4x-s/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8014,-82.6378)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:18:50.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-lucid-coffee-kava", icon: "☕", merchant: "Lucid Coffee and Kava", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of coffee & kava", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12876294",
    photoRef: "places/ChIJR8nS5vvnwogRs-fqIIdVTpk/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8658,-82.6429)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-outcast-brewing", icon: "🍺", merchant: "Outcast Brewing Company", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12861133",
    photoRef: "places/ChIJTTxhRh3jwogRqkl3aF6iKG8/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.7827,-82.6577)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-pinellas-ale-works", icon: "🍺", merchant: "Pinellas Ale Works", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12876296",
    photoRef: "places/ChIJe5tp6THiwogRnj98j2gP4xg/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.7699,-82.6601)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-cinnaholic-stpete", icon: "🧁", merchant: "Cinnaholic St. Petersburg", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of gourmet cinnamon rolls", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cinnamon-rolls-more-st-petersburg-fl-deal-12870653", // 2026-10-28: Clipp renamed the slug (old path redirects here)
    photoRef: "places/ChIJmVWoF1bhwogRKpe0VhnzTSw/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8200,-82.6391)
    // The library's "Cinnaholic" card is the SOUTH TAMPA location
    // (27.9342,-82.4832) — different venue. No match, and the business name
    // keeps its city suffix so the normalized keys cannot collide.
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-mcdonalds-66th", icon: "🍔", merchant: "McDonald's - 66th Street N", area: "Pinellas Park", kind: "dining",
    title: "$10 for $20 of burgers & fries", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-burgers-fries-more-pinellas-park-fl-deal-12842350",
    photoRef: "places/ChIJWaOLldHkwogRqvp-ReHaI7Q/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8638,-82.7283)
    // Library has two "McDonald's" rows in manatee-sarasota — different
    // locations. No bare-brand match (see #475 note above).
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-katch-bistro", icon: "🐟", merchant: "Katch Bistro", area: "Clearwater", kind: "dining",
    title: "$25 for $50 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/50-casual-dining-clearwater-fl-deal-12824312",
    photoRef: "places/ChIJ70r8flXlwogRFDnkMX9G0dE/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8946,-82.6698)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── East Hillsborough / Pasco ──
  Object.freeze({ offerId: "clipp-m-chill-cawfee", icon: "☕", merchant: "Chill Cawfee", area: "Lithia", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-lithia-fl-deal-12871286",
    photoRef: "places/ChIJ0ScRB4PTwogR7f3MteEkjX8/photos/wfplacediscovery",
    match: Object.freeze([]), // library place name (Lithia/FishHawk, 27.8612,-82.2010)
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-lithia", icon: "🍕", merchant: "Marco's Pizza - Lithia", area: "Lithia", kind: "dining",
    title: "$15 for $30 of pizza & subs", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-subs-more-lithia-fl-deal-12853410",
    photoRef: "places/ChIJ58_X4y4t3YgRiG24cVR1c5M/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.8527,-82.2052)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-village-inn-lol", icon: "🥞", merchant: "Village Inn - Land O' Lakes", area: "Land O' Lakes", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-land-o-lakes-fl-deal-12865739",
    photoRef: "places/ChIJqdfnINi7wogRxMrYLHz7Qis/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (28.1866,-82.4428)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── Bradenton / Parrish side ──
  Object.freeze({ offerId: "clipp-m-orange-blossom", icon: "☕", merchant: "Orange Blossom Coffee", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-bradenton-fl-deal-12824076",
    photoRef: "places/ChIJPfVM-xIXw4gRiT1_XuUakks/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.4975,-82.5732)
    match: Object.freeze([]), // registry's first per-merchant seed (real-user detail_open evidence)
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-el-warike", icon: "🥘", merchant: "El Warike Peruvian Cuisine", area: "Bradenton", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-bradenton-fl-deal-12831352",
    photoRef: "places/ChIJ1-3fCmwWw4gRZ3jzqZZumVM/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.4638,-82.5881)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-peach-cobbler-bradenton", icon: "🧁", merchant: "The Peach Cobbler Factory - Bradenton", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of cobbler & ice cream", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cobbler-ice-cream-more-bradenton-fl-deal-12829469",
    photoRef: "places/ChIJ6TpnBFYXw4gR9SKCJeTnIjY/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.4616,-82.5684)
    // Library's card is "The Peach Cobbler Factory Tampa/USF" — different
    // location; suffix on the business name keeps the keys apart.
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  // ── Sarasota ──
  Object.freeze({ offerId: "clipp-m-clean-eatz-sarasota", icon: "🥗", merchant: "Clean Eatz - Sarasota", area: "Sarasota", kind: "dining",
    title: "$10 for $20 of prepared meals & wraps", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-prepared-meals-wraps-more-sarasota-fl-deal-12869518",
    photoRef: "places/ChIJQ2lqiihBw4gRKikqAzm9Lhc/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.2700,-82.4876)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-five-o-donut", icon: "🍩", merchant: "Five-O Donut Co", area: "Sarasota", kind: "dining",
    title: "$10 for $20 of donuts", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-donuts-deal-12515586",
    photoRef: "places/ChIJ0-3_7GRAw4gRmttY9pKuGss/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.3359,-82.5255)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-rosys-ice-cream", icon: "🍦", merchant: "Rosy's Ice Cream", area: "Osprey", kind: "dining",
    title: "$10 for $20 of ice cream & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-ice-cream-more-osprey-fl-deal-12832419",
    photoRef: "places/ChIJ2aQyshdDw4gRmmFabE8pyLY/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.1779,-82.4827)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "bradenton" }) }),
  // ── Activities (familyfun/nightout inventory, not dining) ──
  Object.freeze({ offerId: "clipp-m-ismash-brandon", icon: "🔨", merchant: "iSmash", area: "Brandon", kind: "activity",
    title: "$40 for two starter smash sessions (reg. $80)", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/80-for-two-starter-smash-sessions-brandon-fl-deal-12829427",
    photoRef: "places/ChIJP3St-uTTwogRYDZFgRQGuNI/photos/wfplacediscovery",
    // SAME venue as the library's "iSmash Tampa" card (27.8920,-82.2724 =
    // Brandon) — verified against wf_inventory 2026-08-07, so this one aligns.
    match: Object.freeze(["iSmash Tampa"]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-t4-kartplex", icon: "🏎️", merchant: "T4 KartPlex", area: "Palmetto", kind: "activity",
    title: "$35 for a standard go-kart session for 2 (reg. $70)", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/70-for-standard-session-go-kart-rental-for-2-people-palmetto-fl-deal-12856611",
    photoRef: "places/ChIJX_xfN8sjw4gRk4k8uynBAnQ/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.6059,-82.5417)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-back-nine", icon: "⛳", merchant: "The Back Nine", area: "Bradenton", kind: "activity",
    title: "$99.50 for a one-month membership for new members (reg. $199)", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/199-for-one-month-membership-for-new-members-bradenton-fl-deal-12789349",
    photoRef: "places/ChIJKVRP_EYXw4gRac5SKnbSMKo/photos/wfplacediscovery", // own Google photo, name+town verified 2026-08-11 (27.4617,-82.5832)
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
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
  Object.freeze({ offerId: "clipp-m-bananas-axe-cabana", icon: "🪓", merchant: "Bananas' Axe Cabana", area: "Orlando", kind: "activity",
    title: "$16 for 1-hour axe throwing", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/32-for-1-hour-axe-throwing-orlando-fl-deal-12774124",
    placeId: "ChIJzaJ16EOB3YgRRKM6TF4tpKg", // own Google photo; Google calls it "Bananas' Axe Cabana" (28.385,-81.5), 12.9mi from Orlando
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-handels-oviedo", icon: "🍦", merchant: "Handel's Ice Cream - Oviedo", area: "Oviedo", kind: "dining",
    title: "$10 for $20 of ice cream & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-ice-cream-more-oviedo-fl-deal-12864145",
    placeId: "ChIJg68gQRBp54gRWy9izCqAECI", // own Google photo; Google calls it "Handel’s Homemade Ice Cream Oviedo, FL" (28.6535,-81.2078), 1.1mi from Oviedo
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-little-greek-oviedo", icon: "🥙", merchant: "Little Greek Oviedo", area: "Oviedo", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-oviedo-fl-deal-12810346",
    placeId: "ChIJUc_6jvpp54gR54FpEEe3P3M", // own Google photo; Google calls it "Little Greek Fresh Grill" (28.657,-81.203), 0.9mi from Oviedo
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  Object.freeze({ offerId: "clipp-m-cleaneatz-windermere", icon: "🥗", merchant: "CleanEatz Windermere", area: "Winter Garden", kind: "dining",
    title: "$15 for $30 of dining or meal plan orders", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-dining-or-meal-plan-orders-winter-garden-fl-deal-12828013",
    placeId: "ChIJFwU2hb6H54gRML-xr9aJnUw", // own Google photo; Google calls it "Clean Eatz" (28.4289,-81.6182), 9.6mi from Winter Garden
    match: Object.freeze([]),
    verifiedAt: "2026-11-18T23:19:12.000Z", verificationMode: "manual",
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
]);

// Quarantined Clipp offers (Phase 4 automatic offer quarantine ledger).
// Keeps structured provenance of offers pulled from active serving so they fail
// closed across place cards, deal sheets, and /api/commerce/go while remaining
// eligible for automated recheck if the merchant restocks.
export const QUARANTINED_CLIPP_OFFERS = Object.freeze([
  Object.freeze({
    offerId: "clipp-m-pizza-kitchen",
    icon: "🍕",
    merchant: "Pizza Kitchen",
    area: "Tampa",
    kind: "dining",
    title: "$10 for $20 of casual dining",
    badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12875835",
    photoRef: "places/ChIJrd5cMw_DwogRgRc4JgnCIBw/photos/wfplacediscovery",
    status: "SOLD_OUT",
    quarantinedAt: "2026-11-12",
    verifiedAt: "2026-11-18T23:19:10.000Z",
    verificationMode: "manual",
    evidenceStrength: "strong",
    reason: "Clipp deal page 12875835 renders 'THIS DEAL IS SOLD OUT' / 'Sold Out for Now' with Add to Cart and Buy Now removed",
  }),
  Object.freeze({
    offerId: "clipp-m-marcos-riverview",
    icon: "🍕",
    merchant: "Marco's Pizza - Riverview",
    area: "Riverview",
    kind: "dining",
    title: "$15 for $30 of casual dining",
    badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-riverview-fl-deal-12853657",
    photoRef: "places/ChIJPXKIA6PRwogR1RMJ-1_IMbc/photos/wfplacediscovery",
    status: "SOLD_OUT",
    quarantinedAt: "2026-11-18",
    verifiedAt: "2026-11-18T23:18:55.000Z",
    verificationMode: "manual",
    evidenceStrength: "strong",
    reason: "Live Clipp deal page 12853657 displays 'Sold Out for Now' with no purchase CTA during 2026-11-18 manual Chrome check",
  }),
]);

// 2026-10-13 re-audit (built-in browser, same-origin fetch of all 51 clipp.com pages from a real
// session): 40 certificates live with Add to Cart + Buy Now and the stored merchant/offer; SEVEN
// "THIS DEAL IS SOLD OUT" and DELETED — Pacific Counter - Downtown Tampa (12313149), El Pollo Cartel
// (12870496), QDOBA - Gandy (12815317), Beanie's Bar & Sports Grill (12846182), O'Brien's Irish Pub
// & Grill - Plant City (11108607), Vicky Bakery (12787447), QDOBA - Apopka Vineland (12815486).
// iSmash's live price is now $40 for two sessions (was $28), title/badge corrected to 50% off.
// The per-id CLIPP_INDEX_REVERIFIED split (2026-09-03) is retired: every remaining certificate
// shares the single CLIPP_MERCHANT_AUDIT_EXPIRY date.
// 2026-10-20 re-audit (connected Chrome session, same-origin fetch + API payload parse of all 44 clipp.com
// pages): all four city pages HTTP 200 with 36 offers each; 38 of 40 certificates live with Add to Cart +
// Buy Now, verified merchant/address, base price (50% off face value), restrictions, and 180-day promotional
// validity window (kept separate from our internal CLIPP_MERCHANT_AUDIT_EXPIRY review cutoff). TWO "THIS DEAL
// IS SOLD OUT" and DELETED — Vista at the Top, Tierra Verde (12869853) and Bubbakoo's Burritos, Riverview (10060634).
// 2026-10-28 re-audit, before the 11-02 fuse (built-in browser on the owner's Mac, same-origin fetch of all
// 42 clipp.com pages): all four city pages HTTP 200 with 63-75 priced offers each; 36 of 38 certificates
// live with Add to Cart / Buy Now and the stored merchant + offer in the page title. TWO "THIS DEAL IS SOLD
// OUT" and DELETED — Marco's Pizza - Bradenton (12876521) and Fusion Bar & Grill, Casselberry (12853506).
// Cinnaholic St. Petersburg's slug moved (20-casual-dining -> 20-cinnamon-rolls-more, same deal id 12870653);
// dest updated to the canonical URL.
// 2026-10-29 cross-check from the cloud lane (Exa page reader; clipp.com 403s direct cloud fetches):
// all four city pages render priced offers; 36 of the 36 kept certificates render the stored merchant +
// offer with no sold-out banner (incl. the new Cinnaholic slug); Fusion Bar & Grill shows "This Deal is
// SOLD OUT" (agrees). Marco's Pizza - Bradenton read "Low stock" in Exa's copy (crawl date unknown) vs
// SOLD OUT in the owner's browser on 10-28 -- the owner's live read wins; it stays deleted.
// 2026-11-04 re-audit (box browser check): 40 pages fetched, 36 of 36 live, none sold out.
// 2026-11-10 re-audit (box headed Chrome, direct load of all 40 clipp.com pages): four city pages HTTP 200 with
// priced offers; 35 of 36 certificates live with Add to Cart / Buy Now and the stored merchant + offer in the
// page title. ONE "Sold Out for Now" and DELETED — Pokemoto - Dr. Phillips, Orlando (12832608),
// https://www.clipp.com/all-offers/30-casual-dining-orlando-fl-deal-12832608. Live prices below the stored
// "$X for $Y" titles on Price Drop pages (El Warike, Peach Cobbler, Five-O, Rosy's, iSmash, Back Nine, Little
// Greek, CleanEatz Windermere) and Clipp's one-day "$2 Tuesday" cart promo are temporary and in the buyer's favour;
// the stored titles still match Clipp's own offer names, so they are unchanged.
// 2026-11-12 re-audit (connected Chrome, all 39 clipp.com pages): 4 markets + 34 of 35 merchants ACTIVE;
// ONE "THIS DEAL IS SOLD OUT" moved to QUARANTINED_CLIPP_OFFERS — Pizza Kitchen, Tampa (12875835).
// Two merchants tagged status: "ALMOST_GONE" (4th Street Pizza 12869854, Marco's Pizza - Riverview 12853657)
// and 8 promo-drop merchants tagged status: "PRICE_CHANGED" (priceChangeKind: "promo_drop").
// 2026-11-18 manual Chrome check (verificationMode: "manual", CLIPP_AUDIT_EXPIRY = "2026-11-23" NOT extended):
// All 40 Clipp URLs + 404 control probed in Mac Chrome: 4 markets + 33 of 35 merchants HTTP 200 ACTIVE
// with Add to Cart / Buy Now; Marco's Pizza - Riverview (12853657) now displays "Sold Out for Now" and
// is moved to QUARANTINED_CLIPP_OFFERS alongside Pizza Kitchen (12875835, still "Sold Out for Now");
// 4th Street Pizza (12869854) still displays "Almost Gone" with Buy Now; the 8 temporary Nov 12 Price Drop
// merchants returned to their standard stored 50%-off "$X for $Y" certificate price.

const _BY_ID = new Map([
  ...CLIPP_MARKETS.map((m) => [m.offerId, m]),
  ...CLIPP_MERCHANT_OFFERS.map((m) => [m.offerId, m]),
]);

const _QUARANTINED_BY_ID = new Map(
  QUARANTINED_CLIPP_OFFERS.map((m) => [m.offerId, m])
);

export const CLIPP_AUDIT_AS_OF = "2026-11-12T00:00:00.000Z";
export const CLIPP_LAST_MANUAL_AUDIT_AT = "2026-11-18T23:19:12.000Z";
export const CLIPP_VERIFICATION_MODE = "manual";
export const CLIPP_AUDIT_EXPIRY = "2026-11-23";

const _RUNTIME_EVIDENCE_BY_ID = new Map();
let _persistenceAdapter = null;

export function registerClippPersistenceAdapter(adapter) {
  _persistenceAdapter = adapter && typeof adapter === "object" ? adapter : null;
}

function _maybeHydrateSync() {
  if (_persistenceAdapter && typeof _persistenceAdapter.hydrateSync === "function") {
    try {
      _persistenceAdapter.hydrateSync();
    } catch {}
  }
}

function _maybePersistSync(meta = {}) {
  if (_persistenceAdapter && typeof _persistenceAdapter.persistSync === "function") {
    try {
      _persistenceAdapter.persistSync(exportClippRuntimeSnapshot(), meta);
    } catch {}
  }
}

function dealIdFromDest(dest) {
  const m = /-deal-(\d+)(?:[/?#]|$)/i.exec(String(dest || ""));
  return m ? m[1] : "";
}

function parseStoredPrices(title) {
  const m1 = /\$\s*(\d+(?:\.\d{1,2})?)\s+for\s+\$\s*(\d+(?:\.\d{1,2})?)/i.exec(String(title || ""));
  if (m1) return { storedBuyPrice: Number(m1[1]), storedFaceValue: Number(m1[2]) };
  const m2 = /\$\s*(\d+(?:\.\d{1,2})?)\s+.*?\(reg\.\s*\$\s*(\d+(?:\.\d{1,2})?)\)/i.exec(String(title || ""));
  if (m2) return { storedBuyPrice: Number(m2[1]), storedFaceValue: Number(m2[2]) };
  return { storedBuyPrice: null, storedFaceValue: null };
}

/**
 * Validate and sanitize a runtime Clipp evidence overlay before storing or hydrating it.
 * Rejects unknown or synthetic offer IDs and refuses inconclusive/403 evidence that attempts
 * to stamp `runtimeVerifiedAt` or release a quarantine hold.
 */
export function validateClippRuntimeOverlay(offerId, overlay) {
  const id = String(offerId || "").trim();
  if (!id || /^(?:test|fixture|mock|fake|sample|dummy)[-_]/i.test(id)) return null;
  const base = _BY_ID.get(id) || _QUARANTINED_BY_ID.get(id);
  if (!base || !overlay || typeof overlay !== "object") return null;

  const isInconclusive =
    overlay.evidence === EVIDENCE_STRENGTH.INCONCLUSIVE ||
    /inconclusive|http_(?:401|403|429|5\d\d|0|network_error)/i.test(
      String(overlay.lastProbeReason || overlay.reason || "")
    );
  const wasQuarantined = _QUARANTINED_BY_ID.has(id);
  if (isInconclusive && (overlay.runtimeVerifiedAt || (wasQuarantined && overlay.quarantined === false))) {
    return null;
  }

  const status = String(overlay.status || base.status || OFFER_HEALTH_STATUS.ACTIVE)
    .toUpperCase()
    .trim();
  if (!OFFER_HEALTH_STATUS[status]) return null;

  const quarantined = Boolean(overlay.quarantined);
  const serveable = overlay.serveable !== undefined ? Boolean(overlay.serveable) : !quarantined;

  return {
    status,
    priceChangeKind: overlay.priceChangeKind || null,
    livePrice:
      overlay.livePrice !== undefined && overlay.livePrice !== null && Number.isFinite(Number(overlay.livePrice))
        ? Number(overlay.livePrice)
        : null,
    quarantined,
    serveable,
    failureCount: Number.isFinite(Number(overlay.failureCount))
      ? Math.max(0, Number(overlay.failureCount))
      : 0,
    reason: overlay.reason ? String(overlay.reason) : null,
    quarantinedAt: overlay.quarantinedAt ? String(overlay.quarantinedAt) : null,
    runtimeVerifiedAt:
      !isInconclusive && overlay.runtimeVerifiedAt ? String(overlay.runtimeVerifiedAt) : undefined,
    updatedAt: overlay.updatedAt ? String(overlay.updatedAt) : null,
    lastProbeAt: overlay.lastProbeAt ? String(overlay.lastProbeAt) : undefined,
    lastProbeReason: overlay.lastProbeReason ? String(overlay.lastProbeReason) : undefined,
    verificationMode: overlay.verificationMode ? String(overlay.verificationMode) : undefined,
    source: overlay.source ? String(overlay.source) : undefined,
  };
}

export function exportClippRuntimeSnapshot() {
  const overlays = {};
  for (const [id, ov] of _RUNTIME_EVIDENCE_BY_ID.entries()) {
    overlays[id] = { ...ov };
  }
  return {
    version: 1,
    auditAsOf: CLIPP_AUDIT_AS_OF,
    lastManualAuditAt: CLIPP_LAST_MANUAL_AUDIT_AT,
    auditExpiry: CLIPP_AUDIT_EXPIRY,
    overlays,
  };
}

export function applyClippRuntimeSnapshot(snapshot, { replace = false } = {}) {
  if (replace) {
    _RUNTIME_EVIDENCE_BY_ID.clear();
    resetRuntimePartnerQuarantine();
  }
  const rawOverlays =
    snapshot && typeof snapshot === "object"
      ? snapshot.overlays && typeof snapshot.overlays === "object"
        ? snapshot.overlays
        : snapshot
      : {};
  let applied = 0;
  let rejected = 0;
  for (const [offerId, rawOverlay] of Object.entries(rawOverlays)) {
    if (
      offerId === "version" ||
      offerId === "updatedAt" ||
      offerId === "auditAsOf" ||
      offerId === "lastManualAuditAt" ||
      offerId === "auditExpiry" ||
      offerId === "receipts"
    ) {
      continue;
    }
    const valid = validateClippRuntimeOverlay(offerId, rawOverlay);
    if (!valid) {
      rejected++;
      continue;
    }
    _RUNTIME_EVIDENCE_BY_ID.set(offerId, valid);
    if (valid.quarantined) {
      applyRuntimePartnerQuarantine(offerId, {
        status: valid.status,
        evidence: "strong",
        httpStatus: 200,
      });
    } else if (valid.serveable && valid.runtimeVerifiedAt) {
      applyRuntimePartnerQuarantine(offerId, {
        status: valid.status,
        evidence: "strong",
        httpStatus: 200,
        release: true,
      });
    }
    applied++;
  }
  return { ok: true, applied, rejected };
}

/**
 * Ingest live browser-session or partner-feed evidence for a Clipp offer and
 * execute the full lifecycle:
 *   evidence source -> classification -> transition -> runtime quarantine/overlay -> serving/recovery
 */
export function ingestClippOfferEvidence(
  offerId,
  probeInput = {},
  { now = new Date(), persist = true } = {}
) {
  _maybeHydrateSync();
  const id = String(offerId || "").trim();
  const base = _BY_ID.get(id) || _QUARANTINED_BY_ID.get(id);
  if (!id || !base) return { ok: false, reason: "unknown_offer_id" };

  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const prevOverlay = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  const currentlyQuarantined =
    isQuarantinedPartnerOffer(id) || (_QUARANTINED_BY_ID.has(id) && !prevOverlay?.serveable);
  const currentStatus =
    prevOverlay?.status ||
    (currentlyQuarantined
      ? base.status || OFFER_HEALTH_STATUS.QUARANTINED
      : base.status || OFFER_HEALTH_STATUS.ACTIVE);
  const currentPriceChangeKind =
    prevOverlay?.priceChangeKind || base.priceChangeKind || "promo_drop";
  const currentFailureCount = prevOverlay?.failureCount ?? 0;

  const prices = parseStoredPrices(base.title);
  const probeResult =
    probeInput &&
    probeInput.status &&
    probeInput.evidence &&
    probeInput.html === undefined &&
    probeInput.httpStatus === undefined
      ? probeInput
      : classifyClippLandingPage({
          expectedDealId: dealIdFromDest(base.dest),
          expectedMerchant: base.merchant || base.city || "",
          expectedCity: base.area || base.city || "",
          storedBuyPrice: prices.storedBuyPrice,
          storedFaceValue: prices.storedFaceValue,
          ...probeInput,
        });

  const transition = evaluateOfferHealthTransition({
    currentStatus,
    currentPriceChangeKind,
    currentFailureCount,
    probeResult,
    now,
  });

  if (probeResult.evidence === EVIDENCE_STRENGTH.INCONCLUSIVE) {
    const nextOverlay = {
      ...(prevOverlay || {}),
      status: transition.nextStatus,
      priceChangeKind:
        transition.priceChangeKind ?? prevOverlay?.priceChangeKind ?? base.priceChangeKind ?? null,
      quarantined: transition.quarantined,
      serveable: transition.serveable,
      failureCount: transition.failureCount,
      lastProbeAt: nowIso,
      lastProbeReason: probeResult.reason,
      verificationMode: probeInput.verificationMode || prevOverlay?.verificationMode || CLIPP_VERIFICATION_MODE,
      source: probeInput.source || prevOverlay?.source || "runtime_probe",
    };
    _RUNTIME_EVIDENCE_BY_ID.set(id, nextOverlay);
    if (persist) _maybePersistSync({ offerId: id, transition: transition.transition });
    return { ok: true, offerId: id, classification: probeResult, transition, overlay: nextOverlay };
  }

  if (transition.quarantined) {
    applyRuntimePartnerQuarantine(id, {
      status: transition.nextStatus,
      evidence: probeResult.evidence,
      httpStatus: probeInput.httpStatus,
    });
    const nextOverlay = {
      ...(prevOverlay || {}),
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind || null,
      quarantined: true,
      serveable: false,
      failureCount: transition.failureCount,
      reason: transition.reason,
      quarantinedAt: nowIso.slice(0, 10),
      updatedAt: nowIso,
      verificationMode: probeInput.verificationMode || CLIPP_VERIFICATION_MODE,
      source: probeInput.source || "runtime_probe",
    };
    _RUNTIME_EVIDENCE_BY_ID.set(id, nextOverlay);
    if (persist) _maybePersistSync({ offerId: id, transition: transition.transition });
    return { ok: true, offerId: id, classification: probeResult, transition, overlay: nextOverlay };
  }

  if (probeResult.evidence === EVIDENCE_STRENGTH.STRONG && transition.serveable) {
    applyRuntimePartnerQuarantine(id, {
      status: transition.nextStatus,
      evidence: "strong",
      httpStatus: probeInput.httpStatus ?? 200,
      release: true,
    });
    const nextOverlay = {
      status: transition.nextStatus,
      priceChangeKind:
        transition.priceChangeKind ||
        (transition.nextStatus === OFFER_HEALTH_STATUS.PRICE_CHANGED ? "promo_drop" : null),
      livePrice:
        transition.livePrice ??
        (transition.nextStatus === OFFER_HEALTH_STATUS.PRICE_CHANGED ? base.livePrice ?? null : null),
      quarantined: false,
      serveable: true,
      failureCount: 0,
      runtimeVerifiedAt: nowIso,
      reason: transition.reason,
      updatedAt: nowIso,
      verificationMode: probeInput.verificationMode || CLIPP_VERIFICATION_MODE,
      source: probeInput.source || "runtime_probe",
    };
    _RUNTIME_EVIDENCE_BY_ID.set(id, nextOverlay);
    if (persist) _maybePersistSync({ offerId: id, transition: transition.transition });
    return { ok: true, offerId: id, classification: probeResult, transition, overlay: nextOverlay };
  }

  const nextOverlay = {
    ...(prevOverlay || {}),
    status: transition.nextStatus,
    priceChangeKind:
      transition.priceChangeKind ?? prevOverlay?.priceChangeKind ?? base.priceChangeKind ?? null,
    quarantined: false,
    serveable: transition.serveable,
    failureCount: transition.failureCount,
    reason: transition.reason,
    updatedAt: nowIso,
    verificationMode: probeInput.verificationMode || prevOverlay?.verificationMode || CLIPP_VERIFICATION_MODE,
    source: probeInput.source || "runtime_probe",
  };
  _RUNTIME_EVIDENCE_BY_ID.set(id, nextOverlay);
  if (persist) _maybePersistSync({ offerId: id, transition: transition.transition });
  return { ok: true, offerId: id, classification: probeResult, transition, overlay: nextOverlay };
}

export function resetClippRuntimeEvidence({ clearDurable = false } = {}) {
  _RUNTIME_EVIDENCE_BY_ID.clear();
  resetRuntimePartnerQuarantine();
  if (clearDurable && _persistenceAdapter && typeof _persistenceAdapter.clearSync === "function") {
    try {
      _persistenceAdapter.clearSync();
    } catch {}
  }
}

/**
 * The verified market or merchant row for an offer id, or null. Refuses quarantined
 * offers, enforces 24h scarcity (`ALMOST_GONE`) and 48h promo-drop (`PRICE_CHANGED`)
 * volatility decay by default, and enforces hard audit-window expiry when `opts.now`
 * or `opts.enforceAuditExpiry` is supplied.
 */
export function clippOfferById(offerId, opts = {}) {
  _maybeHydrateSync();
  const id = String(offerId || "").trim();
  if (!id || isQuarantinedPartnerOffer(id)) return null;
  const overlay = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  if (overlay?.quarantined) return null;
  if (_QUARANTINED_BY_ID.has(id) && !overlay?.serveable) return null;

  const base = _BY_ID.get(id) || (overlay?.serveable ? _QUARANTINED_BY_ID.get(id) : null);
  if (!base) return null;

  const merged = overlay
    ? {
        ...base,
        status: overlay.status || base.status || OFFER_HEALTH_STATUS.ACTIVE,
        ...(overlay.priceChangeKind !== undefined ? { priceChangeKind: overlay.priceChangeKind } : {}),
        ...(overlay.livePrice !== undefined ? { livePrice: overlay.livePrice } : {}),
        ...(overlay.runtimeVerifiedAt ? { runtimeVerifiedAt: overlay.runtimeVerifiedAt } : {}),
        ...(overlay.verificationMode ? { verificationMode: overlay.verificationMode } : {}),
      }
    : base;

  const evalNow = opts && opts.now !== undefined ? opts.now : new Date();
  const evalNowMs =
    typeof evalNow === "number"
      ? evalNow
      : evalNow instanceof Date
      ? evalNow.getTime()
      : Date.parse(String(evalNow));
  const offerForEval =
    opts &&
    opts.now !== undefined &&
    !merged.runtimeVerifiedAt &&
    merged.verifiedAt &&
    Number.isFinite(evalNowMs) &&
    evalNowMs < Date.parse(merged.verifiedAt)
      ? { ...merged, verifiedAt: CLIPP_AUDIT_AS_OF }
      : merged;

  const freshness = evaluateClippOfferFreshness(offerForEval, {
    now: evalNow,
    auditExpiry: (opts && opts.auditExpiry) || CLIPP_AUDIT_EXPIRY,
    auditBaseline: offerForEval.verifiedAt || CLIPP_AUDIT_AS_OF,
  });

  if (((opts && opts.now !== undefined) || opts?.enforceAuditExpiry === true) && !freshness.serveable) {
    return null;
  }

  if (!freshness.scarcityFresh && merged.status === OFFER_HEALTH_STATUS.ALMOST_GONE) {
    return {
      ...merged,
      status: OFFER_HEALTH_STATUS.ACTIVE,
      scarcityExpired: true,
      health: freshness,
    };
  }

  if (!freshness.promoFresh && merged.status === OFFER_HEALTH_STATUS.PRICE_CHANGED) {
    return {
      ...merged,
      status: OFFER_HEALTH_STATUS.ACTIVE,
      livePrice: null,
      promoExpired: true,
      health: freshness,
    };
  }

  if (opts && opts.now !== undefined) {
    return { ...merged, health: freshness };
  }

  return merged;
}

/** Look up a quarantined Clipp offer record by offerId for diagnostics/recheck. */
export function quarantinedClippOfferById(offerId) {
  _maybeHydrateSync();
  const id = String(offerId || "").trim();
  if (!id) return null;
  const overlay = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  if (overlay?.serveable && !isQuarantinedPartnerOffer(id)) return null;
  if (_QUARANTINED_BY_ID.has(id)) {
    const base = _QUARANTINED_BY_ID.get(id);
    return overlay ? { ...base, ...overlay } : base;
  }
  if (overlay?.quarantined || isQuarantinedPartnerOffer(id)) {
    const base = _BY_ID.get(id);
    if (!base) return null;
    return {
      ...base,
      status: overlay?.status || OFFER_HEALTH_STATUS.QUARANTINED,
      quarantinedAt: overlay?.quarantinedAt || null,
      reason: overlay?.reason || "runtime_quarantined",
    };
  }
  return null;
}

/** List all currently serveable Clipp market and merchant offers. */
export function listActiveClippOffers(opts = {}) {
  _maybeHydrateSync();
  const ids = new Set([
    ...CLIPP_MARKETS.map((m) => m.offerId),
    ...CLIPP_MERCHANT_OFFERS.map((m) => m.offerId),
    ...QUARANTINED_CLIPP_OFFERS.map((m) => m.offerId),
  ]);
  const out = [];
  for (const id of ids) {
    const row = clippOfferById(id, opts);
    if (row) out.push(row);
  }
  return out;
}

/**
 * The tracked destination for an offer id, or null when the offer is unknown,
 * quarantined, or its destination does not pass isClippDest.
 */
export function clippTrackedUrl(offerId, clickId, opts = {}) {
  const m = clippOfferById(offerId, opts);
  if (!m || !isClippDest(m.dest)) return null;
  return clippDeepLink(m.dest, clickId);
}



