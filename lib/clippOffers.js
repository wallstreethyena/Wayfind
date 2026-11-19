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
export const CLIPP_AUDIT_AS_OF = "2026-11-12T00:00:00.000Z";
export const CLIPP_LAST_MANUAL_AUDIT_AT = "2026-11-18T23:19:12.000Z";
export const CLIPP_VERIFICATION_MODE = "manual";
export const CLIPP_AUDIT_EXPIRY = "2026-11-23";

const _stamp = (r) =>
  Object.freeze({
    verifiedAt: CLIPP_LAST_MANUAL_AUDIT_AT,
    verificationMode: CLIPP_VERIFICATION_MODE,
    ...r,
  });

export const CLIPP_MARKETS = Object.freeze([
  _stamp({
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
  _stamp({
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
  _stamp({
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
  _stamp({
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

export const CLIPP_MERCHANT_OFFERS = Object.freeze([
  // ── Tampa core ──
  _stamp({ offerId: "clipp-m-chez-leon", icon: "🍽️", merchant: "Chez Leon", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12863814",
    photoRef: "places/ChIJF9UDDXDFwogRKZRJ9asRgQo/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-dip-and-happy", icon: "🫕", merchant: "Dip and Happy", area: "Tampa", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-tampa-fl-deal-12863594",
    photoRef: "places/ChIJ_7PQ3B_FwogRe-JJpGpKs38/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-brown-bag-coffee", icon: "☕", merchant: "Brown Bag Coffee Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869689",
    photoRef: "places/ChIJ-0q1Cp3FwogRFt9UWUtxFcQ/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-poke-company", icon: "🍣", merchant: "The Poke Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of poke bowls & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-poke-bowls-more-tampa-fl-deal-12869690",
    photoRef: "places/ChIJ8TYSe2bFwogRv1zoFgdBVdc/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-ticos-bakery", icon: "🥐", merchant: "Tico's Bakery", area: "Tampa", kind: "dining",
    title: "$10 for $20 of bakery items", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-bakery-items-tampa-fl-deal-12868978",
    photoRef: "places/ChIJl9FkZADFwogRGUeMYiHU80M/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-toastique", icon: "🥪", merchant: "Toastique - E Cumberland", area: "Tampa", kind: "dining",
    title: "$10 for $20 of gourmet toast & smoothies", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-gourmet-toast-smoothies-more-tampa-fl-deal-12829757",
    photoRef: "places/ChIJd2Qw71vFwogRQITXSYyjiZA/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-eleven80-cafe", icon: "☕", merchant: "Eleven80 Cafe", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869317",
    photoRef: "places/ChIJoWDfRyPDwogR4qmTsaY4eZs/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-blind-goat", icon: "🍽️", merchant: "The Blind Goat", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
    photoRef: "places/ChIJeadUwiPDwogRu8Gq_Qf8cLw/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-marcos-fletcher", icon: "🍕", merchant: "Marco's Pizza - Fletcher Ave", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12866091",
    photoRef: "places/ChIJCwCS6DXHwogRhUKlA53KGZU/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── St. Petersburg / Pinellas ──
  _stamp({ offerId: "clipp-m-ubuntu", icon: "🍽️", merchant: "Ubuntu", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12875701",
    photoRef: "places/ChIJo6xRYhnxwogRTinjrpTceN0/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  _stamp({ offerId: "clipp-m-4th-street-pizza", icon: "🍕", merchant: "4th Street Pizza", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of pizza & more", badge: "50% off",
    status: "ALMOST_GONE",
    dest: "https://www.clipp.com/all-offers/30-pizza-more-st-petersburg-fl-deal-12869854",
    photoRef: "places/ChIJe2RtO13hwogRJDqo5cJ4x-s/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  _stamp({ offerId: "clipp-m-lucid-coffee-kava", icon: "☕", merchant: "Lucid Coffee and Kava", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of coffee & kava", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12876294",
    photoRef: "places/ChIJR8nS5vvnwogRs-fqIIdVTpk/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  _stamp({ offerId: "clipp-m-outcast-brewing", icon: "🍺", merchant: "Outcast Brewing Company", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12861133",
    photoRef: "places/ChIJTTxhRh3jwogRqkl3aF6iKG8/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  _stamp({ offerId: "clipp-m-pinellas-ale-works", icon: "🍺", merchant: "Pinellas Ale Works", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12876296",
    photoRef: "places/ChIJe5tp6THiwogRnj98j2gP4xg/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  _stamp({ offerId: "clipp-m-cinnaholic-stpete", icon: "🧁", merchant: "Cinnaholic St. Petersburg", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of gourmet cinnamon rolls", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cinnamon-rolls-more-st-petersburg-fl-deal-12870653",
    photoRef: "places/ChIJmVWoF1bhwogRKpe0VhnzTSw/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  _stamp({ offerId: "clipp-m-mcdonalds-66th", icon: "🍔", merchant: "McDonald's - 66th Street N", area: "Pinellas Park", kind: "dining",
    title: "$10 for $20 of burgers & fries", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-burgers-fries-more-pinellas-park-fl-deal-12842350",
    photoRef: "places/ChIJWaOLldHkwogRqvp-ReHaI7Q/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-katch-bistro", icon: "🐟", merchant: "Katch Bistro", area: "Clearwater", kind: "dining",
    title: "$25 for $50 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/50-casual-dining-clearwater-fl-deal-12824312",
    photoRef: "places/ChIJ70r8flXlwogRFDnkMX9G0dE/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── East Hillsborough / Pasco ──
  _stamp({ offerId: "clipp-m-chill-cawfee", icon: "☕", merchant: "Chill Cawfee", area: "Lithia", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-lithia-fl-deal-12871286",
    photoRef: "places/ChIJ0ScRB4PTwogR7f3MteEkjX8/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-marcos-lithia", icon: "🍕", merchant: "Marco's Pizza - Lithia", area: "Lithia", kind: "dining",
    title: "$15 for $30 of pizza & subs", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-subs-more-lithia-fl-deal-12853410",
    photoRef: "places/ChIJ58_X4y4t3YgRiG24cVR1c5M/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-village-inn-lol", icon: "🥞", merchant: "Village Inn - Land O' Lakes", area: "Land O' Lakes", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-land-o-lakes-fl-deal-12865739",
    photoRef: "places/ChIJqdfnINi7wogRxMrYLHz7Qis/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── Bradenton / Parrish side ──
  _stamp({ offerId: "clipp-m-orange-blossom", icon: "☕", merchant: "Orange Blossom Coffee", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-bradenton-fl-deal-12824076",
    photoRef: "places/ChIJPfVM-xIXw4gRiT1_XuUakks/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  _stamp({ offerId: "clipp-m-el-warike", icon: "🥘", merchant: "El Warike Peruvian Cuisine", area: "Bradenton", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-bradenton-fl-deal-12831352",
    photoRef: "places/ChIJ1-3fCmwWw4gRZ3jzqZZumVM/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  _stamp({ offerId: "clipp-m-peach-cobbler-bradenton", icon: "🧁", merchant: "The Peach Cobbler Factory - Bradenton", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of cobbler & ice cream", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cobbler-ice-cream-more-bradenton-fl-deal-12829469",
    photoRef: "places/ChIJ6TpnBFYXw4gR9SKCJeTnIjY/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  // ── Sarasota ──
  _stamp({ offerId: "clipp-m-clean-eatz-sarasota", icon: "🥗", merchant: "Clean Eatz - Sarasota", area: "Sarasota", kind: "dining",
    title: "$10 for $20 of prepared meals & wraps", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-prepared-meals-wraps-more-sarasota-fl-deal-12869518",
    photoRef: "places/ChIJQ2lqiihBw4gRKikqAzm9Lhc/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  _stamp({ offerId: "clipp-m-five-o-donut", icon: "🍩", merchant: "Five-O Donut Co", area: "Sarasota", kind: "dining",
    title: "$10 for $20 of donuts", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-donuts-deal-12515586",
    photoRef: "places/ChIJ0-3_7GRAw4gRmttY9pKuGss/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  _stamp({ offerId: "clipp-m-rosys-ice-cream", icon: "🍦", merchant: "Rosy's Ice Cream", area: "Osprey", kind: "dining",
    title: "$10 for $20 of ice cream & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-ice-cream-more-osprey-fl-deal-12832419",
    photoRef: "places/ChIJ2aQyshdDw4gRmmFabE8pyLY/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "bradenton" }) }),
  // ── Activities ──
  _stamp({ offerId: "clipp-m-ismash-brandon", icon: "🔨", merchant: "iSmash", area: "Brandon", kind: "activity",
    title: "$40 for two starter smash sessions (reg. $80)", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/80-for-two-starter-smash-sessions-brandon-fl-deal-12829427",
    photoRef: "places/ChIJP3St-uTTwogRYDZFgRQGuNI/photos/wfplacediscovery",
    match: Object.freeze(["iSmash Tampa"]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  _stamp({ offerId: "clipp-m-t4-kartplex", icon: "🏎️", merchant: "T4 KartPlex", area: "Palmetto", kind: "activity",
    title: "$35 for a standard go-kart session for 2 (reg. $70)", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/70-for-standard-session-go-kart-rental-for-2-people-palmetto-fl-deal-12856611",
    photoRef: "places/ChIJX_xfN8sjw4gRk4k8uynBAnQ/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  _stamp({ offerId: "clipp-m-back-nine", icon: "⛳", merchant: "The Back Nine", area: "Bradenton", kind: "activity",
    title: "$99.50 for a one-month membership for new members (reg. $199)", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/199-for-one-month-membership-for-new-members-bradenton-fl-deal-12789349",
    photoRef: "places/ChIJKVRP_EYXw4gRac5SKnbSMKo/photos/wfplacediscovery",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  // ── Orlando Metro ──
  _stamp({ offerId: "clipp-m-bananas-axe-cabana", icon: "🪓", merchant: "Bananas' Axe Cabana", area: "Orlando", kind: "activity",
    title: "$16 for 1-hour axe throwing", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/32-for-1-hour-axe-throwing-orlando-fl-deal-12774124",
    placeId: "ChIJzaJ16EOB3YgRRKM6TF4tpKg",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  _stamp({ offerId: "clipp-m-handels-oviedo", icon: "🍦", merchant: "Handel's Ice Cream - Oviedo", area: "Oviedo", kind: "dining",
    title: "$10 for $20 of ice cream & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-ice-cream-more-oviedo-fl-deal-12864145",
    placeId: "ChIJg68gQRBp54gRWy9izCqAECI",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  _stamp({ offerId: "clipp-m-little-greek-oviedo", icon: "🥙", merchant: "Little Greek Oviedo", area: "Oviedo", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-oviedo-fl-deal-12810346",
    placeId: "ChIJUc_6jvpp54gR54FpEEe3P3M",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
  _stamp({ offerId: "clipp-m-cleaneatz-windermere", icon: "🥗", merchant: "CleanEatz Windermere", area: "Winter Garden", kind: "dining",
    title: "$15 for $30 of dining or meal plan orders", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-dining-or-meal-plan-orders-winter-garden-fl-deal-12828013",
    placeId: "ChIJFwU2hb6H54gRML-xr9aJnUw",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-23", seenOn: "orlando" }) }),
]);

export const QUARANTINED_CLIPP_OFFERS = Object.freeze([
  _stamp({
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
    evidenceStrength: "strong",
    reason: "Clipp deal page 12875835 renders 'THIS DEAL IS SOLD OUT' / 'Sold Out for Now' with Add to Cart and Buy Now removed",
  }),
  _stamp({
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
    evidenceStrength: "strong",
    reason: "Live Clipp deal page 12853657 displays 'Sold Out for Now' with no purchase CTA during 2026-11-18 manual Chrome check",
  }),
]);

const _BY_ID = new Map([
  ...CLIPP_MARKETS.map((m) => [m.offerId, m]),
  ...CLIPP_MERCHANT_OFFERS.map((m) => [m.offerId, m]),
]);
const _QUARANTINED_BY_ID = new Map(QUARANTINED_CLIPP_OFFERS.map((m) => [m.offerId, m]));
const _RUNTIME_EVIDENCE_BY_ID = new Map();
let _adapter = null;

export function registerClippPersistenceAdapter(a) {
  _adapter = a && typeof a === "object" ? a : null;
}

const _hydrate = () => { try { _adapter?.hydrateSync?.(); } catch {} };
const _persist = (m) => { try { _adapter?.persistSync?.(exportClippRuntimeSnapshot(), m); } catch {} };
const _dealId = (d) => (/-deal-(\d+)(?:[/?#]|$)/i.exec(String(d || "")) || [])[1] || "";

function parseStoredPrices(t) {
  const s = String(t || "");
  const m = /\$\s*(\d+(?:\.\d{1,2})?)\s+(?:for\s+\$|.*?\(reg\.\s*\$)\s*(\d+(?:\.\d{1,2})?)/i.exec(s);
  return m ? { storedBuyPrice: Number(m[1]), storedFaceValue: Number(m[2]) } : { storedBuyPrice: null, storedFaceValue: null };
}

export function validateClippRuntimeOverlay(offerId, ov) {
  const id = String(offerId || "").trim();
  const base = id && !/^(?:test|fixture|mock|fake|sample|dummy)[-_]/i.test(id) && (_BY_ID.get(id) || _QUARANTINED_BY_ID.get(id));
  if (!base || !ov || typeof ov !== "object") return null;
  const inc = ov.evidence === EVIDENCE_STRENGTH.INCONCLUSIVE || /inconclusive|http_(?:401|403|429|5\d\d|0|network_error)/i.test(String(ov.lastProbeReason || ov.reason || ""));
  if (inc && (ov.runtimeVerifiedAt || (_QUARANTINED_BY_ID.has(id) && ov.quarantined === false))) return null;
  const status = String(ov.status || base.status || OFFER_HEALTH_STATUS.ACTIVE).toUpperCase().trim();
  if (!OFFER_HEALTH_STATUS[status]) return null;
  const quarantined = Boolean(ov.quarantined);
  return {
    status,
    priceChangeKind: ov.priceChangeKind || null,
    livePrice: ov.livePrice != null && Number.isFinite(Number(ov.livePrice)) ? Number(ov.livePrice) : null,
    quarantined,
    serveable: ov.serveable !== undefined ? Boolean(ov.serveable) : !quarantined,
    failureCount: Number.isFinite(Number(ov.failureCount)) ? Math.max(0, Number(ov.failureCount)) : 0,
    reason: ov.reason ? String(ov.reason) : null,
    quarantinedAt: ov.quarantinedAt ? String(ov.quarantinedAt) : null,
    runtimeVerifiedAt: !inc && ov.runtimeVerifiedAt ? String(ov.runtimeVerifiedAt) : undefined,
    updatedAt: ov.updatedAt ? String(ov.updatedAt) : null,
    lastProbeAt: ov.lastProbeAt ? String(ov.lastProbeAt) : undefined,
    lastProbeReason: ov.lastProbeReason ? String(ov.lastProbeReason) : undefined,
    verificationMode: ov.verificationMode ? String(ov.verificationMode) : undefined,
    source: ov.source ? String(ov.source) : undefined,
  };
}

export function exportClippRuntimeSnapshot() {
  return {
    version: 1,
    auditAsOf: CLIPP_AUDIT_AS_OF,
    lastManualAuditAt: CLIPP_LAST_MANUAL_AUDIT_AT,
    auditExpiry: CLIPP_AUDIT_EXPIRY,
    overlays: Object.fromEntries(_RUNTIME_EVIDENCE_BY_ID.entries()),
  };
}

const _META_KEYS = new Set(["version", "updatedAt", "auditAsOf", "lastManualAuditAt", "auditExpiry", "receipts"]);

export function applyClippRuntimeSnapshot(snap, { replace = false } = {}) {
  if (replace) { _RUNTIME_EVIDENCE_BY_ID.clear(); resetRuntimePartnerQuarantine(); }
  const raw = snap && typeof snap === "object" ? (snap.overlays && typeof snap.overlays === "object" ? snap.overlays : snap) : {};
  let applied = 0, rejected = 0;
  for (const [id, ov] of Object.entries(raw)) {
    if (_META_KEYS.has(id)) continue;
    const v = validateClippRuntimeOverlay(id, ov);
    if (!v) { rejected++; continue; }
    _RUNTIME_EVIDENCE_BY_ID.set(id, v);
    if (v.quarantined) applyRuntimePartnerQuarantine(id, { status: v.status, evidence: "strong", httpStatus: 200 });
    else if (v.serveable && v.runtimeVerifiedAt) applyRuntimePartnerQuarantine(id, { status: v.status, evidence: "strong", httpStatus: 200, release: true });
    applied++;
  }
  return { ok: true, applied, rejected };
}

export function ingestClippOfferEvidence(offerId, probeInput = {}, { now = new Date(), persist = true } = {}) {
  _hydrate();
  const id = String(offerId || "").trim();
  const base = _BY_ID.get(id) || _QUARANTINED_BY_ID.get(id);
  if (!id || !base) return { ok: false, reason: "unknown_offer_id" };

  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const prev = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  const isQ = isQuarantinedPartnerOffer(id) || (_QUARANTINED_BY_ID.has(id) && !prev?.serveable);
  const currentStatus = prev?.status || (isQ ? base.status || OFFER_HEALTH_STATUS.QUARANTINED : base.status || OFFER_HEALTH_STATUS.ACTIVE);
  const currentPriceChangeKind = prev?.priceChangeKind || base.priceChangeKind || "promo_drop";
  const prices = parseStoredPrices(base.title);
  const probeResult =
    probeInput?.status && probeInput?.evidence && probeInput.html === undefined && probeInput.httpStatus === undefined
      ? probeInput
      : classifyClippLandingPage({
          expectedDealId: _dealId(base.dest),
          expectedMerchant: base.merchant || base.city || "",
          expectedCity: base.area || base.city || "",
          ...prices,
          ...probeInput,
        });

  const transition = evaluateOfferHealthTransition({
    currentStatus,
    currentPriceChangeKind,
    currentFailureCount: prev?.failureCount ?? 0,
    probeResult,
    now,
  });

  const vMode = probeInput.verificationMode || prev?.verificationMode || CLIPP_VERIFICATION_MODE;
  const src = probeInput.source || prev?.source || "runtime_probe";
  let next;

  if (probeResult.evidence === EVIDENCE_STRENGTH.INCONCLUSIVE) {
    next = {
      ...(prev || {}),
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind ?? prev?.priceChangeKind ?? base.priceChangeKind ?? null,
      quarantined: transition.quarantined,
      serveable: transition.serveable,
      failureCount: transition.failureCount,
      lastProbeAt: nowIso,
      lastProbeReason: probeResult.reason,
      verificationMode: vMode,
      source: src,
    };
  } else if (transition.quarantined) {
    applyRuntimePartnerQuarantine(id, { status: transition.nextStatus, evidence: probeResult.evidence, httpStatus: probeInput.httpStatus });
    next = {
      ...(prev || {}),
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind || null,
      quarantined: true,
      serveable: false,
      failureCount: transition.failureCount,
      reason: transition.reason,
      quarantinedAt: nowIso.slice(0, 10),
      updatedAt: nowIso,
      verificationMode: vMode,
      source: src,
    };
  } else if (probeResult.evidence === EVIDENCE_STRENGTH.STRONG && transition.serveable) {
    applyRuntimePartnerQuarantine(id, { status: transition.nextStatus, evidence: "strong", httpStatus: probeInput.httpStatus ?? 200, release: true });
    const isPC = transition.nextStatus === OFFER_HEALTH_STATUS.PRICE_CHANGED;
    next = {
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind || (isPC ? "promo_drop" : null),
      livePrice: transition.livePrice ?? (isPC ? base.livePrice ?? null : null),
      quarantined: false,
      serveable: true,
      failureCount: 0,
      runtimeVerifiedAt: nowIso,
      reason: transition.reason,
      updatedAt: nowIso,
      verificationMode: vMode,
      source: src,
    };
  } else {
    next = {
      ...(prev || {}),
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind ?? prev?.priceChangeKind ?? base.priceChangeKind ?? null,
      quarantined: false,
      serveable: transition.serveable,
      failureCount: transition.failureCount,
      reason: transition.reason,
      updatedAt: nowIso,
      verificationMode: vMode,
      source: src,
    };
  }

  _RUNTIME_EVIDENCE_BY_ID.set(id, next);
  if (persist) _persist({ offerId: id, transition: transition.transition });
  return { ok: true, offerId: id, classification: probeResult, transition, overlay: next };
}

export function resetClippRuntimeEvidence({ clearDurable = false } = {}) {
  _RUNTIME_EVIDENCE_BY_ID.clear();
  resetRuntimePartnerQuarantine();
  if (clearDurable) { try { _adapter?.clearSync?.(); } catch {} }
}

export function isRegisteredClippOfferId(offerId) {
  _hydrate();
  const id = String(offerId || "").trim();
  return Boolean(id && (_BY_ID.has(id) || _QUARANTINED_BY_ID.has(id)));
}

export function clippOfferById(offerId, opts = {}) {
  _hydrate();
  const id = String(offerId || "").trim();
  if (!id || isQuarantinedPartnerOffer(id)) return null;
  const ov = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  if (ov?.quarantined || (_QUARANTINED_BY_ID.has(id) && !ov?.serveable)) return null;
  const base = _BY_ID.get(id) || (ov?.serveable ? _QUARANTINED_BY_ID.get(id) : null);
  if (!base) return null;

  const merged = ov
    ? {
        ...base,
        status: ov.status || base.status || OFFER_HEALTH_STATUS.ACTIVE,
        ...(ov.priceChangeKind !== undefined ? { priceChangeKind: ov.priceChangeKind } : {}),
        ...(ov.livePrice !== undefined ? { livePrice: ov.livePrice } : {}),
        ...(ov.runtimeVerifiedAt ? { runtimeVerifiedAt: ov.runtimeVerifiedAt } : {}),
        ...(ov.verificationMode ? { verificationMode: ov.verificationMode } : {}),
      }
    : base;

  const hasNow = opts && opts.now !== undefined;
  const evalNow = hasNow ? opts.now : new Date();
  const evalMs = typeof evalNow === "number" ? evalNow : evalNow instanceof Date ? evalNow.getTime() : Date.parse(String(evalNow));
  const target = hasNow && !merged.runtimeVerifiedAt && merged.verifiedAt && Number.isFinite(evalMs) && evalMs < Date.parse(merged.verifiedAt)
    ? { ...merged, verifiedAt: CLIPP_AUDIT_AS_OF }
    : merged;

  const freshness = evaluateClippOfferFreshness(target, {
    now: evalNow,
    auditExpiry: opts?.auditExpiry || CLIPP_AUDIT_EXPIRY,
    auditBaseline: target.verifiedAt || CLIPP_AUDIT_AS_OF,
  });

  if ((hasNow || opts?.enforceAuditExpiry === true) && !freshness.serveable) return null;
  if (!freshness.scarcityFresh && merged.status === OFFER_HEALTH_STATUS.ALMOST_GONE) {
    return { ...merged, status: OFFER_HEALTH_STATUS.ACTIVE, scarcityExpired: true, health: freshness };
  }
  if (!freshness.promoFresh && merged.status === OFFER_HEALTH_STATUS.PRICE_CHANGED) {
    return { ...merged, status: OFFER_HEALTH_STATUS.ACTIVE, livePrice: null, promoExpired: true, health: freshness };
  }
  return hasNow ? { ...merged, health: freshness } : merged;
}

export function quarantinedClippOfferById(offerId) {
  _hydrate();
  const id = String(offerId || "").trim();
  if (!id) return null;
  const ov = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  if (ov?.serveable && !isQuarantinedPartnerOffer(id)) return null;
  if (_QUARANTINED_BY_ID.has(id)) return ov ? { ..._QUARANTINED_BY_ID.get(id), ...ov } : _QUARANTINED_BY_ID.get(id);
  if ((ov?.quarantined || isQuarantinedPartnerOffer(id)) && _BY_ID.has(id)) {
    return { ..._BY_ID.get(id), status: ov?.status || OFFER_HEALTH_STATUS.QUARANTINED, quarantinedAt: ov?.quarantinedAt || null, reason: ov?.reason || "runtime_quarantined" };
  }
  return null;
}

export function listActiveClippOffers(opts = {}) {
  _hydrate();
  const out = [];
  for (const id of new Set([..._BY_ID.keys(), ..._QUARANTINED_BY_ID.keys()])) {
    const r = clippOfferById(id, opts);
    if (r) out.push(r);
  }
  return out;
}

export function clippTrackedUrl(offerId, clickId, opts = {}) {
  const m = clippOfferById(offerId, opts);
  return m && isClippDest(m.dest) ? clippDeepLink(m.dest, clickId) : null;
}




