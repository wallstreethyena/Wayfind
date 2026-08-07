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
    photoRef: "places/ChIJF9UDDXDFwogRKZRJ9asRgQo/photos/AWCwydhmY5f83xzE57sFs5Ai4scfxZzfu8lg_UfCe_QmGn4OGkWpX8UAGbwYaG_nUy-AejGLYJD2GVtZPl6st8Yd2gCL0mSyPwGlVrDccVjpSNRD1Ivbz2Vnj2PO_Bs-XDZr8i8v0wZNTHdkjAGK0OFHn0QUvnlyp3f3d_yH8pqfmMtZxwc6V-sQFUbfcUv8XigISZTLin0AkC87ENtpKHwUrwGbxheKpLZYGMHdU4bliWQp3qnUt5HIn1dZbvl352yzfqasP2DFjyZ7BdA9L4ZOQapfxxaW6Hozux0a3WqzQTr9Kp2URYH3sUqhYkVn6O0mAVN3cy1lA_AsOxMNu58bCQKGns3nbHaspDJ4PRxchwUcXJR5ZowZPxjAnyMH390UH--mnnjdbVl9leqPvGVMxluQL_OMaweRw27oK7INfOzX6rOk8iGQpsNfexFkSg",
    match: Object.freeze([]), // business name IS the verified library place name (Tampa, 27.9487,-82.4577)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-dip-and-happy", icon: "🫕", merchant: "Dip and Happy", area: "Tampa", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-tampa-fl-deal-12863594",
    photoRef: "places/ChIJ_7PQ3B_FwogRe-JJpGpKs38/photos/AWCwydijV2pE0BRKCVOftyY1Tjub5cMcCLsXs7WzbUMmVzBnqj5Iog9CTIB_ovtYLolsS64gxdqY93k_Jw7ITIT5HMO3To0B04EImamkjbpYAACBQX4ZjkkeJIdMA5w3q_P290ayAYZ2nv6nlDHfiiXgOIGFVuH_fI0XcgEvoX2JS4-O31LZnhq0j_gE3lMlK09tos2Hhkrn07EVWK_9i7ru5_L9j5no3WOibd9ID-xc5-2BkPKW_YVEb8YQd8UbyKpWWETONdPugNwuUN1eKLHA-EB_k1UUN51Yo6d46YKbTCyFx_PecwyXrDNfHzkhntLBlPqMT06vTJRLn_vTRnuDjBpHf6pg3jt2MurO6HMP7ld6GzpgrxqsGi6Tt-Afe-6Rqu-MAmnmTlR3vHU1hRWC3tbVKaVQO26Q2rAp0TT-CqMwZ6hzGgAAZKVdO0FibjB3",
    match: Object.freeze([]), // library place name (Tampa, 27.9519,-82.4610)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-pacific-counter", icon: "🍣", merchant: "Pacific Counter - Downtown Tampa", area: "Tampa", kind: "dining",
    title: "$10.50 for $30 of poke bowls & more", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/30-poke-dining-more-tampa-fl-deal-12313149",
    // Deliberately NO bare "Pacific Counter" variant: the chain has a St. Pete
    // location and a bare-name match would attach this Tampa certificate there.
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-bavaros", icon: "🍕", merchant: "Bavaro's Pizza Napoletana & Pastaria", area: "Tampa", kind: "dining",
    title: "$15 for $30 of pizza & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-more-tampa-fl-deal-12863078",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-brown-bag-coffee", icon: "☕", merchant: "Brown Bag Coffee Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869689",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-poke-company", icon: "🍣", merchant: "The Poke Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of poke bowls & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-poke-bowls-more-tampa-fl-deal-12869690",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-ticos-bakery", icon: "🥐", merchant: "Tico's Bakery", area: "Tampa", kind: "dining",
    title: "$10 for $20 of bakery items", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-bakery-items-tampa-fl-deal-12868978",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-pizza-kitchen", icon: "🍕", merchant: "Pizza Kitchen", area: "Tampa", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12875835",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-toastique", icon: "🥪", merchant: "Toastique - E Cumberland", area: "Tampa", kind: "dining",
    title: "$10 for $20 of gourmet toast & smoothies", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-gourmet-toast-smoothies-more-tampa-fl-deal-12829757",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-eleven80-cafe", icon: "☕", merchant: "Eleven80 Cafe", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869317",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-blind-goat", icon: "🍽️", merchant: "The Blind Goat", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-el-pollo-cartel", icon: "🍗", merchant: "El Pollo Cartel", area: "Tampa", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12870496",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-qdoba-gandy", icon: "🌮", merchant: "QDOBA - Gandy", area: "Tampa", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-tampa-fl-deal-12815317",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-fletcher", icon: "🍕", merchant: "Marco's Pizza - Fletcher Ave", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12866091",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── St. Petersburg / Pinellas ──
  Object.freeze({ offerId: "clipp-m-ubuntu", icon: "🍽️", merchant: "Ubuntu", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12875701",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-4th-street-pizza", icon: "🍕", merchant: "4th Street Pizza", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of pizza & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-more-st-petersburg-fl-deal-12869854",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-irish-pub-4th", icon: "🍺", merchant: "The Irish Pub on 4th Street", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-saint-petersburg-fl-deal-12863538",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-lucid-coffee-kava", icon: "☕", merchant: "Lucid Coffee and Kava", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of coffee & kava", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12876294",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-outcast-brewing", icon: "🍺", merchant: "Outcast Brewing Company", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12861133",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-pinellas-ale-works", icon: "🍺", merchant: "Pinellas Ale Works", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12876296",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-cinnaholic-stpete", icon: "🧁", merchant: "Cinnaholic St. Petersburg", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of gourmet cinnamon rolls", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12870653",
    // The library's "Cinnaholic" card is the SOUTH TAMPA location
    // (27.9342,-82.4832) — different venue. No match, and the business name
    // keeps its city suffix so the normalized keys cannot collide.
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-vista-at-the-top", icon: "🍽️", merchant: "Vista at the Top", area: "Tierra Verde", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-tierra-verde-fl-deal-12869853",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-mcdonalds-66th", icon: "🍔", merchant: "McDonald's - 66th Street N", area: "Pinellas Park", kind: "dining",
    title: "$10 for $20 of burgers & fries", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-burgers-fries-more-pinellas-park-fl-deal-12842350",
    // Library has two "McDonald's" rows in manatee-sarasota — different
    // locations. No bare-brand match (see #475 note above).
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-katch-bistro", icon: "🐟", merchant: "Katch Bistro", area: "Clearwater", kind: "dining",
    title: "$25 for $50 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/50-casual-dining-clearwater-fl-deal-12824312",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── East Hillsborough / Pasco ──
  Object.freeze({ offerId: "clipp-m-chill-cawfee", icon: "☕", merchant: "Chill Cawfee", area: "Lithia", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-lithia-fl-deal-12871286",
    photoRef: "places/ChIJ0ScRB4PTwogR7f3MteEkjX8/photos/AWCwydgZM3ObOP8Iu3KiRXjwVsrbrf8QqzryjdDOvmOTaRheoJgQCZGnVKkVZPpZKR7vHk1nKraw0xOXeSi1MT0UHvbd4GFq48wIIpujrRL9cM9W6GQV2nfDoDuJc87J6Er4JWjecZt5FV2ASAFipjAtjb85ILrCZzhLRj-MQkcu1Hwnsix_NDRZ6TRWwg8bnWgWUYmeN_riPVsDggdtTX_ScefXlJDy60LDsUoUgy3ByBjtJo_y7cApddtIn9GWSaiskxBHfiXQfjDkmNdaSG0weT6T-0ktu6EICWjkiQP7A_xAT4XsMc9W2x1xwf0B-GeoCuNe6taM5elZs6CvJ9YFDpIbVyrf1Vihx1yZwRcsNyp5aGtfdDzJLPZg3xPjtx5jvaqW78LfLkGc9BaRdbifeI1O3eFHV_DRvUf2yQ4l9xx5CqQ",
    match: Object.freeze([]), // library place name (Lithia/FishHawk, 27.8612,-82.2010)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-riverview", icon: "🍕", merchant: "Marco's Pizza - Riverview", area: "Riverview", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-riverview-fl-deal-12853657",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-lithia", icon: "🍕", merchant: "Marco's Pizza - Lithia", area: "Lithia", kind: "dining",
    title: "$15 for $30 of pizza & subs", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-subs-more-lithia-fl-deal-12853410",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-qdoba-riverview", icon: "🌮", merchant: "QDOBA - Riverview", area: "Riverview", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-riverview-fl-deal-12815454",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-bubbakoos", icon: "🌮", merchant: "Bubbakoo's Burritos", area: "Riverview", kind: "dining",
    title: "$7 for $20 of Mexican cuisine", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/20-mexican-cuisine-deal-10060634",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-voodoo-valrico", icon: "🍺", merchant: "Voodoo Brewing Co - Valrico", area: "Valrico", kind: "dining",
    title: "$25 for $50 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/50-casual-dining-valrico-fl-deal-12829472",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-beanies-ruskin", icon: "🍺", merchant: "Beanie's Bar & Sports Grill", area: "Ruskin", kind: "dining",
    title: "$15 for $30 of American cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-american-cuisine-ruskin-fl-deal-12846182",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-village-inn-lol", icon: "🥞", merchant: "Village Inn - Land O' Lakes", area: "Land O' Lakes", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-land-o-lakes-fl-deal-12865739",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-obriens-plant-city", icon: "🍺", merchant: "O'Brien's Irish Pub & Grill - Plant City", area: "Plant City", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-plant-city-fl-deal-11108607",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "wesley-chapel" }) }),
  // ── Bradenton / Parrish side ──
  Object.freeze({ offerId: "clipp-m-orange-blossom", icon: "☕", merchant: "Orange Blossom Coffee", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-bradenton-fl-deal-12824076",
    match: Object.freeze([]), // registry's first per-merchant seed (real-user detail_open evidence)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-el-warike", icon: "🥘", merchant: "El Warike Peruvian Cuisine", area: "Bradenton", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-bradenton-fl-deal-12831352",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-guac-shop", icon: "🌮", merchant: "Guac Shop Mexican Grill", area: "Bradenton", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-bradenton-fl-deal-12745796",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-peach-cobbler-bradenton", icon: "🧁", merchant: "The Peach Cobbler Factory - Bradenton", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of cobbler & ice cream", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cobbler-ice-cream-more-bradenton-fl-deal-12829469",
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
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-five-o-donut", icon: "🍩", merchant: "Five-O Donut Co", area: "Sarasota", kind: "dining",
    title: "$10 for $20 of donuts", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-donuts-deal-12515586",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-rosys-ice-cream", icon: "🍦", merchant: "Rosy's Ice Cream", area: "Osprey", kind: "dining",
    title: "$10 for $20 of ice cream & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-ice-cream-more-osprey-fl-deal-12832419",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "bradenton" }) }),
  Object.freeze({ offerId: "clipp-m-el-jalisco-englewood", icon: "🌮", merchant: "El Jalisco - Englewood", area: "Englewood", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-englewood-fl-deal-12810263",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "sarasota" }) }),
  // ── Activities (familyfun/nightout inventory, not dining) ──
  Object.freeze({ offerId: "clipp-m-ismash-brandon", icon: "🔨", merchant: "iSmash", area: "Brandon", kind: "activity",
    title: "$28 for two starter smash sessions (reg. $80)", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/80-for-two-starter-smash-sessions-brandon-fl-deal-12829427",
    photoRef: "places/ChIJP3St-uTTwogRYDZFgRQGuNI/photos/AWCwydidj6U3R65wq6uLS0oAS9bYX_R4xLPsD6yr9uNsPybaFmGFPn_VCXXmqdZo2qIyDMmb5PJk6HISZn1L_tDDGID9jlyv8MXv9_oPAaVhou0qoWCKlMcaywR_KfVY7BMkdU0m9_N0KQgAq8ZxImmv84XdGDI6zqjs0mIzZnQRKpAtEIBYB_BEyuZgo4aFM4xn-D01v1lmzZ23vboBf7o1VB2oVgLu9PVbFB636jt6u7PMVgEfHXGy9hDZXgv-LHX5BT7c_xvUdTpnl3hdTALWNMbhYOEyWAJVkP7G1e-kvcqJcarqNTWAoGDk8S8r9sna6kHKzrbIjhPcYxj9uC1mI89rlUzqSiiwXzEjOfbLIzMnlrG6mnYIhDoJgZnGVB73HgpnBz2IGqGH8MqAlOyhH0vTYj9pRCVgRp5uVc3zhJvniQ",
    // SAME venue as the library's "iSmash Tampa" card (27.8920,-82.2724 =
    // Brandon) — verified against wf_inventory 2026-08-07, so this one aligns.
    match: Object.freeze(["iSmash Tampa"]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-klaw-komotion", icon: "🕹️", merchant: "Klaw Komotion", area: "Brandon", kind: "activity",
    title: "$10 for $20 of arcade tokens", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-tokens-brandon-fl-deal-12863791",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-golf-social", icon: "⛳", merchant: "Golf Social", area: "Clearwater", kind: "activity",
    title: "1 hour of play (reg. $50)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/50-for-1-hour-play-clearwater-fl-deal-12871011",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-t4-kartplex", icon: "🏎️", merchant: "T4 KartPlex", area: "Palmetto", kind: "activity",
    title: "Standard go-kart session for 2 (reg. $70)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/70-for-standard-session-go-kart-rental-for-2-people-palmetto-fl-deal-12856611",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-indoor-fairways", icon: "⛳", merchant: "Indoor Fairways", area: "Bradenton", kind: "activity",
    title: "2-hour golf simulator session, up to 4 people (reg. $120)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/120-for-2-hour-golf-simulator-session-for-up-to-4-people-bradenton-fl-deal-12856765",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-back-nine", icon: "⛳", merchant: "The Back Nine", area: "Bradenton", kind: "activity",
    title: "One-month membership for new members (reg. $199)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/199-for-one-month-membership-for-new-members-bradenton-fl-deal-12789349",
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
]);

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
