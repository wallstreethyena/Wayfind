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
    photoRef: "places/ChIJb3ZWipHFwogRf3492iZdVZU/photos/AWCwydign-GBX55qOlf_xV5czyvzW98DI1B2Bpj82Er2pxxroFxThUhpKlGub08jj1m6ll7x91AAMc4B-rqetK4YZWrtam82OpvgGmDcA1fNsrDw6qRfOgLmb2KaHxlEYFCF6VcIa_2KWMpoc7i6gZ0X7I4poym3cpljI_IVTDPsWNso5yC5DXYIO8os6JDne3HMynzxITDt_Ij49SOkgRt6KdiXFJxJNzRP6u5HmEOmH__987RSk96Ca56WYz8wUjQdWh6Pq1TDfCZyQjY8yjhydk0YmjHEKl-V8eA6gC7lEj_sEp0fsvyC4rDvFwIuZ0NPUvZMGaMvt8sJ0oQQOFDu0mLj2Gp1F-DchzXBIFm9IMLe5o4sT7VS54CK9zAGsokA9jfwhb4-gRd45D8NSXzqjGUfoc3SPot7ckeesYXbpZYBJjzI", // own Google photo, name+town verified 2026-08-11 (27.9514,-82.4624)
    // Deliberately NO bare "Pacific Counter" variant: the chain has a St. Pete
    // location and a bare-name match would attach this Tampa certificate there.
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-bavaros", icon: "🍕", merchant: "Bavaro's Pizza Napoletana & Pastaria", area: "Tampa", kind: "dining",
    title: "$15 for $30 of pizza & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-more-tampa-fl-deal-12863078",
    photoRef: "places/ChIJWQ712IvEwogRE0ttihJf_Jc/photos/AWCwydjUnXa1Lv4C1bpSH-IFyaIN-lt7XMejjkY7GSBO4kQnVpS2UMJgNjeL0pOJ-z7MPrYaSb_I-YNATGkPJ-wAggwlxvxn9FEFLedvCZ8AdsnYigyBnBT8VuOksRAkOuh7djv5ijkAxxI9jysq8yzzY8sfNOOXdPH19o5_n-w0SEHzkRKVGd0EVS5vtyWfNS2nO6z_HDWYtVuPoYAvreUFui0LWgiE0v3HIBEYWkoGAEcJ6vOYNy67792nDEZFIHWL2rdUBpWzBPgkrQiBz9Awe_CMelqY-L6XEIC78qSB5FsmxsCMSWGYqdyNK5Tpxb21MtTRLohzzYt93TaUuSgzHREay4InTh4rRv9kYswXIHODOC-1y-y2QTDSbjRjAWplbQJwFNkdpBJKhX2oLuZuE-xP13sCDhKcq_E0sRWD__7DARan", // own Google photo, name+town verified 2026-08-11 (27.9489,-82.4586)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-brown-bag-coffee", icon: "☕", merchant: "Brown Bag Coffee Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869689",
    photoRef: "places/ChIJ-0q1Cp3FwogRFt9UWUtxFcQ/photos/AWCwydjyazsjTRfprjEMuOggY5svwaYJMsx2aYWhP-5OeZ21WIub061vXSuukrVYSTPQlDXpOnYcr2eFC9J-rboyWrGNPzl1qaftn5oNOpwyqXBXgPk7ruikKHrnJqF13HtqvkSWY5bN4Y7iOjnNk2r86btxLInjHG1_qeuoyG7amQRj1a2L4yvZZPmEwYW8U4f2h-A59DUpDaA7rLDQosrC7zdC_RZiFFrvhFvv6RGhM4eeVADd_mpQ1ihZLc8ACNOlYRzvqAJGYV7yUa115RmmXylLybRrX4G-zFMxi20LBcOOvl5NW7ZqJIHscJiQdnZtZEbhV-R5v76rkzJTEiLN8DyX2U8eLuHzZUPM6PGRhxyNrllo3_X8BKqa2_zhSEohjSllK5WJ1zihfjs4t6TTPYTetk_T-LA6gfCbkYOzP3bfQxSUiQLBniWGhmnrzNII", // own Google photo, name+town verified 2026-08-11 (27.9612,-82.4417)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-poke-company", icon: "🍣", merchant: "The Poke Company", area: "Tampa", kind: "dining",
    title: "$10 for $20 of poke bowls & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-poke-bowls-more-tampa-fl-deal-12869690",
    photoRef: "places/ChIJ8TYSe2bFwogRv1zoFgdBVdc/photos/AWCwydgzGOskrDyRYm_Bi90K8dd5Emxn7B60SYcQy6ex6Al4RFvhuWarKMJYNXBhTEIUC9IRttXsiG266AoBYCLFALtevSXsvrbcuadecpOg6W3ZcSTpU973pWqO4wLPnSNb3mB_Q_e91gSH63wWC3L83oDgwJHb0Yg_X_cy5yv7HGUgoZNTOrIJtICf7VnSc8TaJuAfupfPf0SzcQFx_IYSFgUunAbDUkamkii2sy7OnnCGAia6l1PWYCSoNi5Ob6vbnd1iTOA98yojuGATw6cofV6G6OHFVYS3osAvZiCKlYvatXPZN70ek-4Me3Dwn90-H0Ff0rFvUOrpg77o9eIoJWpstG6Z-ltSD6n5tsOevOaEOybkgM6PDRp_YAEE25qWTLIt56jWAk0jO_5qlD-oWfvKDPNvu3rLSDU72stBDTgAoo8", // own Google photo, name+town verified 2026-08-11 (27.9510,-82.4475)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-ticos-bakery", icon: "🥐", merchant: "Tico's Bakery", area: "Tampa", kind: "dining",
    title: "$10 for $20 of bakery items", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-bakery-items-tampa-fl-deal-12868978",
    photoRef: "places/ChIJl9FkZADFwogRGUeMYiHU80M/photos/AWCwydhF6KcNxrrTP4SghFsflIYWBVY_-FxzD6MZffwdFO0fNf_Erwjv1d_C67aoiJDzt0UYwwf9HraIUOckoX0kbOJQn7QmoEUjZQq-L-l4KX4tNpB5q2seyJ2dgbILp5jPJD8PVC159y1GtTzAk6uVOCR3BpLk7H-qX8N2PBJDlvMBJI2MMwcVwrgPmYgXWXbOTEvRZdIoL47_gdx5UH_CDQ-aOW_LCKCD7YPqiclzNifhJp2RjvfGCj6DSP9Z05j7c6JQuaTH4bx51yrOdu2A9SdkcLKjLNFbDg_LHxRZZIS-YiPEFGo5jS4AchOhGInni9m8WdFJPrQKBJNZsy2eUpIS5pcOYU5QadxQA5ukJ_uilXTnSh7IygSNSeYIjg7imqBmxpBlVJhnKMvoVKPB1GbrW5ttP-UWYy-1_AwXvQ3arrCzhyjnh7NiK67FOw", // own Google photo, name+town verified 2026-08-11 (27.9600,-82.4343)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-pizza-kitchen", icon: "🍕", merchant: "Pizza Kitchen", area: "Tampa", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12875835",
    photoRef: "places/ChIJrd5cMw_DwogRgRc4JgnCIBw/photos/AWCwydisjFxxaEN9_hGbItV5xQOInE7f05-wU43Egpy5QniXCOJtdaFg226T892N_JAj2nbYJZWNhi2AkO79cYTpvurmipzVVZTqJYAVMTIh7iAlfsFGEbNQNrcRE2UjnUYh_lhyLnCaP68E26dmf58tUzbElERhFhNy3rThg52TqfvJ4074ZrLhCXD4cP2jn6H2Sm5ZlW-57Dw7sIkCF7HFiwdxb2DetTplpZmIKqlzbrrrsM5Blf24zteFKecxlk6OZh4Jh83bicCOKEvpdpqNl7Bk5_zoPEa5fb_I0U5-XY9p4BAaRsPZxRkof6crAoSkjCCW1yj9op39DnEBSqT7LZ8RvqV3jbEmdszvuEN2JScaCzqS96vfGiO7qM5569X91jyMfG1k2tUh5wvjYxfo_is1VRVvDCREp8y7SQyq5stP5rD41Wrf2iTeAm83zmVq", // own Google photo, name+town verified 2026-08-11 (27.9526,-82.4593)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-toastique", icon: "🥪", merchant: "Toastique - E Cumberland", area: "Tampa", kind: "dining",
    title: "$10 for $20 of gourmet toast & smoothies", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-gourmet-toast-smoothies-more-tampa-fl-deal-12829757",
    photoRef: "places/ChIJd2Qw71vFwogRQITXSYyjiZA/photos/AWCwydidb9e55wNfTB0TLiqs2y-bQcD5iSczIOUNLNDoIGB5MJ9xuculOMAMFjv7PaFOWFeh65YGYV52g0fvUwT1Gz4xZ_A9bNBJWCS6iiqO_YbGdNBUtWl-3AA3lvXhq8afk0rMiJR4CBoPeUW73iDzwowkZKmo3W5kOqJP-Y6ZG1RpjkyzUrDAQ5zzVcItnOOxnl3M9M2yPlgppU7lQmEPOj3qUIKWStGOFf4RFfPR6tdeXa9uPxKZE6cZ0RFfpG_SLHaPhGvV4-U__0LQgPOH-NiUDLbLDKLozaVNcITKvHOAj3xKMy_gZn1YFKpYbY7s3DjEfPK9Su2WYqfUZ3e_LQGpyzT8Sz8lESFwS_uvay9z8gjrfiPI2B7dzENbxzYXfZ4sEApRHEHRh7j9O5UfqaTWgVOwdcCUYm20-PtRILWMntjA4J2F0kUKtMTyevX3", // own Google photo, name+town verified 2026-08-11 (27.9445,-82.4500)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-eleven80-cafe", icon: "☕", merchant: "Eleven80 Cafe", area: "Tampa", kind: "dining",
    title: "$10 for $20 of cafe dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cafe-dining-tampa-fl-deal-12869317",
    photoRef: "places/ChIJoWDfRyPDwogR4qmTsaY4eZs/photos/AWCwydhcsF3xVLw2KfI_BYbyhSZKfkaR8uXH8oQGZvpiRWw6CPL6k2bdOD0xptqNUxK1ZPB21ed2d-wiMo1DLDAiqUcQmRhH78hv1LJRAp9_HmKm2H2ixdn3e5-nNMSK7aBVEsJop3zqMjxyzEwflmTwNYp7MXlLYVtKDbn6Jw2RXQII6Pz67O1XrOsebBCYmW2giZHtPrVktkoLbXy2VYPPfl8phoZ182_vWfJlHxi_rIZ80D2QIzdPKxyiKUZ4lg5-OSImzDaIzpkQk3M8q8wdNsJAmBnUuK57HeHcdreFmFb9FHGnFiyA4P1n25KKPRx2iFqAWF5I5BQQ7-dOV5rWltFQR71IrNRP9MAFj9I6tfJ4ZMe-d6rkv8110rf7YXHJsiPMcoUFWFalp9ECIOf7Rk8gJzb4LhXoskqDrqqDrWimfpGwI6UQNWWGlut64w", // own Google photo, name+town verified 2026-08-11 (27.9260,-82.5062)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-blind-goat", icon: "🍽️", merchant: "The Blind Goat", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12868827",
    photoRef: "places/ChIJeadUwiPDwogRu8Gq_Qf8cLw/photos/AWCwydi5Lv78LXQs_LtWS-CsWs9eC_YhQ3JJWAV9PAKMIXYO9P9gXUM8j_7xeePX-tcygU3UpCfrMHsdNMNB_lckNoYxL1y_9ryNHLDNjJMiw-DPxWzZLMRa3NwmzWbxqq0Fk82CcQmAGPJjwYNwUJvHfprc48W27IezqOH9ytkv0VUvcAseV_v-mznA9ZuTHDoxSPal2AwrZO1MxBSPmpUUdLG4rgva3Y4NNPVIVRrfNd3ag11OITBk5nZ-e0xcCoqFJJsX__aPjm57clB-HlSOatf4eDmlguHk52uZ1G35wTBwpqNoD2-npWKGIIjNNZYx_cLN2Am6ylBRM7jfvKrAsQJgHFqDsO4u4q3RHjPpy-6iyDWrrHLMuaiaZIWtI1kpA17lWwDSzWJzIaZs7HWuBy6nzGsnPaxtTSzq9JWrQDoMImRM", // own Google photo, name+town verified 2026-08-11 (27.9279,-82.5122)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-el-pollo-cartel", icon: "🍗", merchant: "El Pollo Cartel", area: "Tampa", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-tampa-fl-deal-12870496",
    photoRef: "places/ChIJNZybi-nTwogRq0EWhDRDh-k/photos/AWCwydjYCGhZkhOybmnhePD3ntyWgTaT6rEkxBjtqxrLQjkwJErSGpNxF_5YE1WMttc8u7UBCaNoMdfCsxKaBS627uK1TiycYSQ7dqlOtZ46Gs6LxS4XbKDcyxhCZQ5Wl2zofgvmu_T6ZLLWU6nKWwIgKQJ56AdQ8uJk1IC-g3Rhk-iSYYe144cfr37w73et6R8gdcB3zBNzOg7zy5INtU4PNyY-PsJKkqb6E2b3DA21dTUJtedDRUkfNxgodtOwrDWerDaEHv1TC_Rai0khrLKbsPUuhPimwljGzQMnv1RQJuShdNuq7WYaaPs6a_h-RxYUGG4fwwwvclzR0qdc8OXXSVvrc1sRZaqIEv91cRuS1W8mt9H37YLalF0a1WKT5N4Si43UTA2IIkjIVF4DBgjmyF0QUBtAPRX8_k9tuJPya5Vhm2tbwg7E5P9VUZsAr-aX", // own Google photo, name+town verified 2026-08-11 (27.9221,-82.3704)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-qdoba-gandy", icon: "🌮", merchant: "QDOBA - Gandy", area: "Tampa", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-tampa-fl-deal-12815317",
    photoRef: "places/ChIJk6CFI8XcwogRkyaakn37ZYE/photos/AWCwydhiCctJB3x5qOwIPyZfyH67AoL3gPHA19ebc3ymWvkWfqhUu-DQtrjrM6tGTskK-Nvy7IpMCIjeKokbohN38A1wl0ojWVtPv2dDOAyhcsR4WdC5YIM6N-HU_DOTjwCFPSqQzoF4yU_KYehKKJ12_LSwDk8ouopwKOwiTQyG3QcCcom5pcCsKpvvYfIdYZ9qsw0x0JXGRLef2qxGvxk-lcbzCBDSeOyo_kvY3FYE9Jj23xRSnLALSb-5kF8cYAJpNguf-6Buwit5O588Imx0ZfFqepkA1dhOlcIcHppNhxWVR14MLDtK_s57lyLXIr4ELoTm9LZ-nHvFA529wB-56yCOWJAa2_OKDsQQxNnTgD2XIV0QduNENkUkHObCoO1bZtRWnN9SADa6AaRW9Z1pU4kv9uc5K3fxdUAu4BmhuUPK4Q", // own Google photo, name+town verified 2026-08-11 (27.8941,-82.5068)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-fletcher", icon: "🍕", merchant: "Marco's Pizza - Fletcher Ave", area: "Tampa", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-tampa-fl-deal-12866091",
    photoRef: "places/ChIJCwCS6DXHwogRhUKlA53KGZU/photos/AWCwydgTqtvwLMm5-vgT44Wa-VZLmKcnD00i8abfu0DFIhQ7zMzXXrguusAwEgYkFNVapNZ21UYLwIr-kv0OqNlA6O9Zhj_9LvEgD--ntTBPle-E8fZMnccgh7UgGO58MVynH_ElQHTtkj8zq2U01RwS_PsWQh6MTACV6Y3JdFI321Oi7mtHKNwLKH2nDyR_2egJ55_TllkIDBmxHSGt9O-cRy8iCvkUNFlaAKCVU5B-gn19QkuLArEBZ42uk8MJ-X7effLGS2K9-z9bJBOVZCrgslTDZXjO9m0uIu7Ma8QdZmKmrRdtf5PVJE_ovhuMmXVHDre2fjWoxl2OOaefy90bjXlLAjuVoKtjl417JuUq8HSC_rm7TOwMfK2Gxj6Zp3H3oR-EsTdkBlGmMS5nUKtwl-IWAwm_GUBLTWC6MTBOI6RJ1w", // own Google photo, name+town verified 2026-08-11 (28.0684,-82.4705)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  // ── St. Petersburg / Pinellas ──
  Object.freeze({ offerId: "clipp-m-ubuntu", icon: "🍽️", merchant: "Ubuntu", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12875701",
    photoRef: "places/ChIJo6xRYhnxwogRTinjrpTceN0/photos/AWCwydi7TRgakVdsvQuhwoZ0y-bPddH_k3Xm_mlIRq_WYHPjcKCD3VKMoz3__7vniuBH_EFxk_YAV0BQN2k3vcu0-RR-ot9GLryNHIeuPGGrjNds3xejAmXbLy7v1LfyBNglR7a4-87gPMUXGrP2kGB0hLGddbs5meQsYqjxawXKAGmetJgxThEnSihW1817XqRBIjPGwGwEXBSPJFWLAvh_uE1XWdfd5BSy2CBsM5JzZZoOhwJeX_ThWRUeIvRS9V5vvZYhE9VUJAcUyTz2GIroLvepxHLPUEMcIHNffZYfb9M_OtYeOrZPm4RMtBYvA8NAJgAYmGdD23_EzvwqFWfuWiFe0SQ9F-EpWcX4Ick4siQlAAAQ8bUPQPDKKBd8MmwAT7fOSSixBRkQraQWsoeId7X6f6jADYx0X4OdtB_D9wwfxdAYvKQa5MjlKvQsxw", // own Google photo, name+town verified 2026-08-11 (27.7708,-82.6568)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-4th-street-pizza", icon: "🍕", merchant: "4th Street Pizza", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of pizza & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-more-st-petersburg-fl-deal-12869854",
    photoRef: "places/ChIJe2RtO13hwogRJDqo5cJ4x-s/photos/AWCwydgSJQDuwwbQWZGK8C0duNn3V3jSVUBlyvyR4Xleh0j4wQbdv3WeAuM8G7poBFgSmkpGE73MqPayN-AjKB_f_UyfHJ9JfAqqwPmcE7vzmFAf26vEwtRQNtfUHOv3iOvElKH1_BgxgOKmdmv0EaWRAr8zAS0qSOF-EAkjlt3ATbHRh2umupCoTIAFwSgjkhoJy65sKto8wkAswGqPrhQdd1jTCb4FocBIsxOlD7fd2yyvAInRilNmKEs4bdePua151yYK8rt0g9MKIbVGndD21693EiX7cAuISJZqeXhuk-Zw_7Ej83aKDejvIVmhaXvWDEbO0F5suCpAvpZ7pw_uozpIVDrHIBvz4VTH-ArcSRg_l4Lw0aEBU3Fk6-1r2drHmGg9gB6QefahhRP948-HBqk5dt7OlDikc7hluYgdBlaWRbiw", // own Google photo, name+town verified 2026-08-11 (27.8014,-82.6378)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-irish-pub-4th", icon: "🍺", merchant: "The Irish Pub on 4th Street", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-saint-petersburg-fl-deal-12863538",
    photoRef: "places/ChIJJZg3l-vnwogRFj3b9-izZoM/photos/AWCwydjW4WQf_igtiKP5voLjhDgEowRoFzdUc49ak4vhdkuaLu8qgGD2eCbTIOjkOW6S2-qR8A3qwl5teuLUvJQtDRJQfDNMbnI4YPhfTYVS8cra9DQ_2qTNevx1zXmbcvOQhkez_FE0P1qDu6cxTmn6V4rockj54rcUIyHFYoTCky5go3JYV5hN1ih17aMcYEWV4WcBWHuZ324A5F9MKELk-T6AIufkesN6_PbmvGoZHSdhzFjS6GJUfqQWsI5k4OeKzIN6UzUmJ82-qTFWgfY9yaeSv-gLN6cAP6LUq_eaTpqFuXF752CffK2gYdlF7Usj4lvverx2nzYKhGkPIU1trbm2ChL6x8hcuIBH_drWKmtrtnnKDc3gY50vXww-Q_YaIVQa6yZmYRXrx_9_WY0V4pFOHNXfU7PW1Fu5zxRFLWhE9AR0z5_jAAilUdopFNQK", // own Google photo, name+town verified 2026-08-11 (27.8564,-82.6391)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-lucid-coffee-kava", icon: "☕", merchant: "Lucid Coffee and Kava", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of coffee & kava", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12876294",
    photoRef: "places/ChIJR8nS5vvnwogRs-fqIIdVTpk/photos/AWCwydiDqzbsmeFRS3qLxlcgQ8rOEZ80b5shroQCx_NjcHedhWC5BMa7CwDYcH1QBotAhm35My3NR51cbLzVDXdqvM3BaWDqxr8OYuhf0OCycQyBvtcImZJjxx4WJTK_TWcCotFxgbPsz4r0XzBAqVKXLZbwjHTqSvP3Pwjn6kErVIb0wHc6-7oXW3eJIu7X-o3T8S09fWhfxBrTuCyJ1b4LZtL1bWyAga0Y5fFeVMh8Zlmbh6T2XC1omoXYNkdeTcRqaxuroGPOGv6QW3Or0vbf0qPsmkAaURmsmpJeff0hCk00na6hKKVis-FtrMo9hhUbcVaVeUzXYcJGi06bJ1Ni3F_f7PajTa9XfhfPB75PSAu3lCNnV9xA-2eVYebCkh3VhtJIAFQQe0ukPEHEGtf7N9FOVwXVHOZrjIRs26CRx57wXtrk2LjRvc-8HItCaA", // own Google photo, name+town verified 2026-08-11 (27.8658,-82.6429)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-outcast-brewing", icon: "🍺", merchant: "Outcast Brewing Company", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12861133",
    photoRef: "places/ChIJTTxhRh3jwogRqkl3aF6iKG8/photos/AWCwydhkifPfqat6WIE3xgZytgEBBQPK7QU8dUocN7gL63PtRYE5GCJOd20JMRH21RUFEjtjCF_TcxLx872ccSXVm0zzd1spO6cYYxumwVUD7zKyDZxDnPCWw350vhjgnCEZDSi8FlGDfp7pqx2eQQBaOrH0UPInWIHwMnxRAyDRi0k9S_XHM6JI-WeE2cOaj7M9o2cL6Cemm-p5LUEuRR_TX-b8gOJsLbxpQiv_I1xFzSi4edBcXzdDL1RSxUy-9-3D3gZCQZjb5cj8Jww5alTrZqnVd7jxOmGthwYGHd8FdjuLkhq9l6tLVrkVuRb9CK9VEo1EOvAXMa5VJNsGTqWARMntxaYMT1ASa6I4-DWDEBDmCVqHqfB-YJuMwQmJ9AzhbKYMi9u1gNx_NVlofE__mz0XUaGk7OqsSrTSaky3sEFBkg", // own Google photo, name+town verified 2026-08-11 (27.7827,-82.6577)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-pinellas-ale-works", icon: "🍺", merchant: "Pinellas Ale Works", area: "St. Petersburg", kind: "dining",
    title: "$15 for $30 of beverages", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-beverages-st-petersburg-fl-deal-12876296",
    photoRef: "places/ChIJe5tp6THiwogRnj98j2gP4xg/photos/AWCwydi7Ci-2geMEa_Ee8-fvjcoQRofwlVSR_Oph3xwMuigXONsjz8GRFlFsP_qIBSOka8In4605S04wsHKi6OX3avBvC4YXqBxMUMDwLHCaM0X-LiHUPQxXTHSewzye84h2wQiOEYvEKJIJkPGpK7bwP_xk_Us3yi2e7Te5udX2cD3mbfXSSrR71B8vB05x7mZY9NOByidGiVPqDoA-nuvPRj_EhGsvHorexfDimQEMKqsKhwuKxme1QkJ8ZXz5Ju-w52Df3uDJBWABoPawG1TOyI-rOfjhzyn1U9GmcuJQYRFkoFdAyGQ1j0IpHvJPRL6cbD_Pci7oo1_Sz3vcmc7TnQPZ__7CidcMx6A8qvcZomW5zjzLbFb779VYqmuFNqYnGZFSzvq6sh7x6dEdk2nAfCM7sdO32jP79y4NK3AJqaFQGpu7", // own Google photo, name+town verified 2026-08-11 (27.7699,-82.6601)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-cinnaholic-stpete", icon: "🧁", merchant: "Cinnaholic St. Petersburg", area: "St. Petersburg", kind: "dining",
    title: "$10 for $20 of gourmet cinnamon rolls", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-casual-dining-st-petersburg-fl-deal-12870653",
    photoRef: "places/ChIJmVWoF1bhwogRKpe0VhnzTSw/photos/AWCwydh8dfWvere1nIIsBINgyBRQW11vOsaIGX8VWko1XrjkNntzY3m4LwGye8U5uFzSPGpOE_u4t8svLcJw-9_Akknf3f0Ex28Z3TmhzR2_yApv5FnqU72w6TbM2iB1n6lUIrxryQQRzCPY7yQPxajYAn9drfKyTfxOW5dArE8lx4yrzSCX-Q2zkRguWRKn6dxqwhnpFVMfz3sMZuIbnCjfTHiHAAP1BMxRTtiF0Q2CZ80zUI56YFDTtDJPGuj1tZm5nteN8yfLLkWA0lc6F1IFHXuLGCJx4kZ6Fsj-IOGkKHjoXkWHQZ9E391XUGFX4kEb2qp1JYhrO8PIxCG21SfHs0DZMjkueayV4IJJ42fp4Hy6sf7t3HPz3CUigRChtQtuAWQ8mthK70Q2AG_11jE5CpgLZnzvbRtU90fWEGHSTLKDS2mhbZZHaHcpQywoe1gj", // own Google photo, name+town verified 2026-08-11 (27.8200,-82.6391)
    // The library's "Cinnaholic" card is the SOUTH TAMPA location
    // (27.9342,-82.4832) — different venue. No match, and the business name
    // keeps its city suffix so the normalized keys cannot collide.
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-vista-at-the-top", icon: "🍽️", merchant: "Vista at the Top", area: "Tierra Verde", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-tierra-verde-fl-deal-12869853",
    photoRef: "places/ChIJm1dsslQdw4gRu0ZGx1yRotk/photos/AWCwydh8S5ixkkGKWo0Q1gnUWLEBJ0_B_2hGLHwLkXqFPWINg5u6WbmyAJJwqTvDZmhtHq2H4JeNDS5t_kJppcc5HlqSPxR4U1vEXbkgN5rCrD_1mPc9-FlgKhPJQ0Yv1483HGa37e3C75GShV2JerrYKLf8ygHI3w_668F-ZCF7yZBfRLrKtBPK9nnYdiNTX2hvHL-B0ruLiQuKPA2ELcWZ6oTqcMRCmgOpyA7Osh5wY6Hyvk_m12PSB1S0C7-DiVg2wZzj8Ydqv0oZEJjrlh7CGNKcB74kYRiJnXRIwGTUePKODvgbiWglw5ILp9EeDu1f0LMJy0uschQkioFDwvrGqBj0MGHdNcJgmZYZeObIGwMIMJh3_0-CINha4uNSNcleWXLvffxx7XOejuEZusHQpwxwKEUbFf5_19_O9r9dF86BP_7I", // own Google photo, name+town verified 2026-08-11 (27.6899,-82.7211)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-mcdonalds-66th", icon: "🍔", merchant: "McDonald's - 66th Street N", area: "Pinellas Park", kind: "dining",
    title: "$10 for $20 of burgers & fries", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-burgers-fries-more-pinellas-park-fl-deal-12842350",
    photoRef: "places/ChIJWaOLldHkwogRqvp-ReHaI7Q/photos/AWCwydjZFxla3RnpkwdiigACMIrxXWVHSgZvmobo22mchlaqPaFVy2rpCmOxdezwEz9nwp2Tmhsx10HqL4QCurKNIs1v3-TOmt8iupPSl1WqQ5ln3T--wdAeQxK0SeyAIo__T3qkwuOKk6LxQd1HdjGurzopIkeQ0ESRbgr6rc3abW-e-99z6IFe4HFg0MLNgdYE9q7v1o6qqiU-uOHurMwnzWKy-qwawFcPinV_NgDldk8ABhfvCH-QxE8U63aC4S6_nBwoIIGjXQdE32JCAnTzp8DdW5p7szBkpyXn8CmKzHzLojDnAOA4pY-ys7XfbMn6I8OyRPOoBCO482xnZ7-JuidlkGNSJs1uYxGei1NjVnfGJWgfaAvOEaE3ccAhP6KBPTdx9iE4Nfb3_QJpCoN5Lhjj2EoBmHy2wT5BnjSPs30", // own Google photo, name+town verified 2026-08-11 (27.8638,-82.7283)
    // Library has two "McDonald's" rows in manatee-sarasota — different
    // locations. No bare-brand match (see #475 note above).
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-katch-bistro", icon: "🐟", merchant: "Katch Bistro", area: "Clearwater", kind: "dining",
    title: "$25 for $50 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/50-casual-dining-clearwater-fl-deal-12824312",
    photoRef: "places/ChIJ70r8flXlwogRFDnkMX9G0dE/photos/AWCwydgidkYcdPD5HEmOzS6NcJRqoB63qPLvEYLo8HXntAvBTefLEwdbpqOf3ZLBXUA8rSpKQxI6qUTQ_HVGxRZBKCHS1QSrGtNFUP4BjXb2l85ZDi5QCjXZFYHhAP_azHW9yFs4csRA4DCYzUT8GjOHCcrJlIpDBU3og-9aOYGsr9gok2PvZG98CTmQSapVOnRpEieILFAsNKiJFNlIUI77eH8edU6sI1bCwiugnLU40U7tlBCRxTcV0Ts_j08U787RWEBI6Lms36Cjwh4zH5lM4u4v6D2pGxF6Rj90i3pOLhw1mFBPrINQIt30zRVImoW7mawqGHcH3zBvySQ0OwA_Osie6sVY6kT6ZY4XdZJPKF9yU2ORhWp-lN8JMDjz97kCcjJG6Mob-S-wGX5L5HPalv8BkyalF0YQ-78dnWl51LRCrU2W", // own Google photo, name+town verified 2026-08-11 (27.8946,-82.6698)
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
    photoRef: "places/ChIJPXKIA6PRwogR1RMJ-1_IMbc/photos/AWCwydigUXVVspjjujjEL9W7l3XSoal36dG2ki86hEaOpAH2SwYoYHZ_FaUtCsLQpfzFas-Mws07maUZ1NXRWsp7S9o-_sqBUzSIe6PNw7cPzMnqQ21R9yrskMs8vfCaomC2wB7NTE7XtQSTiHrsQw_R7up6TOqBWRGDOiAAMP95IVKRHDUQPU-b3aqhX8xwQmFal1WgIdP4WkOyPHUL3P4ywLgWa_LnPEgLNNOOhukbSxodQmEiT0oeszxmCbefC0UBkfvoMfwtF16fV8XZuz0hgb1EUTdef41MMUnzvc_BPnrQ87JKVmbpzQdnsH0C0MNjaic2gepyS4qdC7R-qXPGfXHaYEWy-30j54LFLJDgC1u0_2Xw-clYA85rZrOg5E4NozAyJ1Tz-efK7Aes1lsi3HAW7iCfT7XmANdFiV2k06ayYsDOea8D1CPEN0HCjCJf", // own Google photo, name+town verified 2026-08-11 (27.8343,-82.3268)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-marcos-lithia", icon: "🍕", merchant: "Marco's Pizza - Lithia", area: "Lithia", kind: "dining",
    title: "$15 for $30 of pizza & subs", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-pizza-subs-more-lithia-fl-deal-12853410",
    photoRef: "places/ChIJ58_X4y4t3YgRiG24cVR1c5M/photos/AWCwydhPnHn8RVIdQgeqU7YHUO8sanJLB6GJTYXOlSO21AT5yYWiCCQE_jM8jjFeei2E0OB1dk_9ODzQa0h0fJjMNYqCwdtChv12lnQvvE1yziQkkJNQ9psNRusL9XDfCAdJlwhDSLC9udZx5-eHl7U8cb4LOEGzK2NeERzly8i4RHJMopDwAPA_A5l4yJG5krFja3ZsvhC3_b2csK40bwZ7z0ZhkvMyL-QjCDqc4DuKPq7Q7V84drMc3fQsGNM4DST-bNRsTkrEXEQojXIEsmMCUTq4EGsYHSxQB4JpimhCaDe9V5S6tg8StOcrT13qcDRy43JDQf_JI4BrayDsN9Gw6K6vFLMfKH214_uxZ6Zjnqg81S5xRVnXoBtuEqrA1kiJdLdlmWSDdUGl7OPoJ6EPyA1iJL8xH87f5t7QbnoaAUNa9zoI", // own Google photo, name+town verified 2026-08-11 (27.8527,-82.2052)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-qdoba-riverview", icon: "🌮", merchant: "QDOBA - Riverview", area: "Riverview", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-riverview-fl-deal-12815454",
    photoRef: "places/ChIJ1WisOtDWwogRmHaZUFBKGNk/photos/AWCwydhB8ZRxk-Vhi_bgw28BwGAXSQjWuNGZdGGKmRIg30m5nT-_jSeJCN3UT6HnCPsIFLsgIW8O3p_b_LmzQgvBxJ7ldpnbcxjwpzqAUeyh_5pjVScPZ1BEPTQrX8fAlFxPMgUMV7247jG0d8uZgTfidENIzPuURvZCUFKSN9zkv35OYbXA0AjJtWiYI6wKde8Lx6d2HzNKchrkZfwpD5ZNzLDwA9wfc1veJObKKR00veKWL2Pya79ADUAqOmaC9FS2U5YhKWhQf32PVS40oDcOWsJr4swOUzNgwjdsvo3hTSvLUhVryZsbjcMUwyxGe1vNFVN96Fjeu6GguyXVvWwDFjWouKBaGyuu3-YyoKZegYGyZ_wz5Ld6MIFj1w8lI5T-kjpnwHM2RIUX6TZaJ3NZIyUQwBt9pQhhMW_xwS5Na2EVbmQL85f_EjkmUnyD2vDP", // own Google photo, name+town verified 2026-08-11 (27.7936,-82.3354)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-bubbakoos", icon: "🌮", merchant: "Bubbakoo's Burritos", area: "Riverview", kind: "dining",
    title: "$7 for $20 of Mexican cuisine", badge: "65% off",
    dest: "https://www.clipp.com/all-offers/20-mexican-cuisine-deal-10060634",
    photoRef: "places/ChIJy_AuPHzPwogRzNAPPNWH1xw/photos/AWCwydjcPj-hvGvErsrSlAUzWiF0mzkmikAeqb41M83I5NzenpR2iTzfuwYT-ExdTJLyjElcQlan0MmlZA2sMCRYZ2y7PGS3AlbOCluUk92yAZtJ1O3tz4zKmcbdjnNQZZui46nMKnjO-UnDwqcpoiJgDN3fvbUK7WJCAE64sfrjIWTS-KilymVS69wPszRWDgoWyJuiY0GiThaY8N_3HSEOJCGlUIrZXDvQ9TYoYl_R-DdWc8EAnLVWiLfiG_yY5K64VLLutQWCtls_2oUg0C9uHgO8Xy9iLsa0fYf-GXluAGJmo4nSpVXEP_UxhVVP0bntoQg-E9iJiUl_DGrhNKPs_vaIcMcQmQ03fY_Tl2avD0UYRZAlYHJ6Te11qJeqsqd278WChDnaBLI2jljPUns5yGw8sKMkRpR6MZm81j08iB5LVLox", // own Google photo, name+town verified 2026-08-11 (27.9124,-82.3471)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-voodoo-valrico", icon: "🍺", merchant: "Voodoo Brewing Co - Valrico", area: "Valrico", kind: "dining",
    title: "$25 for $50 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/50-casual-dining-valrico-fl-deal-12829472",
    photoRef: "places/ChIJlbXrdgDNwogR6S5SHIqr79g/photos/AWCwydhErhnfQXAtysDAyUxjy5_iySR9S9LiQFl0Fd9NF5RFT-NQ5SIG7RkPoU5DWC7Fnvwu6r9oqTKRBMX0znzl-6HatwLjDkAlhuTuz7PvtfsFKv_bw8riKUzSXXoX-Sfr6cLVXl2sNE2-lXR3Woxzg6bNJ9fbwunPnA5X6-zF7BMIiGzU_9UR5lTjShmBedRHp4YcZGluuc-7lTIX6cJYKC1fZt7DJZIBIGv8B7fHwxcd7dfZNURwCplGRrRBpafRjyFfTp_XAqBfD77eNPtOL-vwJEdQO4tKiGx6Almrj7MkTa_0Ro-sK7j2Kl_0PKI_qLz_taG6tTlDQ5QK2Te05dWpuEZApIHv-6erBYrdKRqisfY15ZF0SJ23Hv8t6bvX2DaK94A_BPVDDMrHb054P-SPxXD5hhI8LfZ_PYSW1jwkHqYhYNIaDC0u94RZIU5D", // own Google photo, name+town verified 2026-08-11 (27.9383,-82.2248)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-beanies-ruskin", icon: "🍺", merchant: "Beanie's Bar & Sports Grill", area: "Ruskin", kind: "dining",
    title: "$15 for $30 of American cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-american-cuisine-ruskin-fl-deal-12846182",
    photoRef: "places/ChIJY8QiKnAnw4gRh1QETfS30sE/photos/AWCwydhSV1D4NGkw7j1pGmoAzJAtsWUgvcekyAsvCjOfFsPCDC0k028iBo_Y8JB5GAOGrw--oNLnRokce5ouYdBFdQNPWE1_TZLrgNN5Sd2bRY3vgtc1vPw8B3w_5uqYNWsxTsqxiEBc5ky-YuEKeHan13RhSB0aJ8dnVliwYMhlAQffiOcZZ30hOSYoeSAgHNhqWIVik-E-mEZDFCdfn2HbGqJpsnyMnNidtzSRXPOeBCumsGxUAxDr_-A1cEhS4PNNnXFGwgGDahacuXRk6H92m9Lz6QG7YgXYdhBzYGTsV0vhs1_zw8zDRuuylSZwUp-DqRZsAYXdXhy1TSrtj_CBwx2w-2YWiMzQhMQQH2zrFuYtJvNkPniBaLggtwCOihZ-mwl2wlGsWS_o9QqXc2L3GxqGMsJ-qoEYr8w3dvcSK36mUQ", // own Google photo, name+town verified 2026-08-11 (27.7043,-82.4426)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-village-inn-lol", icon: "🥞", merchant: "Village Inn - Land O' Lakes", area: "Land O' Lakes", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-land-o-lakes-fl-deal-12865739",
    photoRef: "places/ChIJqdfnINi7wogRxMrYLHz7Qis/photos/AWCwydh7E_f4Vl4hTcgxnfzE70YPk-gEOnuWoyUWrO_ar9yDkY8dRslt05m5ujPcEk2y7ElTID-o9zUKTP6h6sww4JK56bkuGlaI-NqA4EJbBmLA9tLbZvNnPr9eK5R-MGE1i-sBqjyim3qCa3w-RJSS7emPSfN6LvXcC1S5jQ4htlPVgf27eJucgUgKZDPHbil31KOItzxFKCdpOSOGYjIjvsfaaZeHfzWUXFnamiVreSndM8m0U51jxumTNZYp3R8pwfv8J8iNE_WoTEEHuKc5QHhnGEWM7Cj20PUeD8FXaphXcAwRNpGcsf-3PfVBx291iSdZDGqJG-XMuDwcwYWWDaumcvW1YEjJVR2JICBiKg1Ga4q5AtqfQtwEC7YIi7wGQe0DzQZIZtJqbauNgXXJhnSTRcxdRiWgSYj2yFm7ln0clczM", // own Google photo, name+town verified 2026-08-11 (28.1866,-82.4428)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-obriens-plant-city", icon: "🍺", merchant: "O'Brien's Irish Pub & Grill - Plant City", area: "Plant City", kind: "dining",
    title: "$15 for $30 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-casual-dining-plant-city-fl-deal-11108607",
    photoRef: "places/ChIJc0G9_Rk03YgRxU9RIq3Es74/photos/AWCwydiJIY77r7FZ32YtSkinh_6h2VHEh1384fVOIzXWV-OlidiiN93wTd-pw15g3e2iC6ThLNZFm3o3u25QP4VpUMoqXS_nSkWiaB9M65qeMu46qm7Ch4m1cX-AMlpRGXZRN4GjzsIqE46WVMX3NN0p39WA1UgrXoLS6NzXVr7qVWWb6K1S5yH2D-BsYNb4nQ6eBrTd2SEFpVHSQWLeOQqK3-dYQuqS7TN2ByGlYygptPgtvi46sUdKq_xH5UrcdeCB3-0boWORJ2ix_bFkig5AgsRzCsh72T2_SB4uMkp71UXOMEM3NXcp7qKvNWkkGru8scaMXez3889Z5Sk5eAscihNhfLF_NxAjS_yHV1McfaIoC5TtM-Tc5XCsus3lI5tF8z4YNyIYF3HrTwznzbVjKYCY2ksr-3lRAO7zhxwUSPec_YU24xREXrs12kmZdVS8", // own Google photo, name+town verified 2026-08-11 (27.9990,-82.1386)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "wesley-chapel" }) }),
  // ── Bradenton / Parrish side ──
  Object.freeze({ offerId: "clipp-m-orange-blossom", icon: "☕", merchant: "Orange Blossom Coffee", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of coffee & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-coffee-more-bradenton-fl-deal-12824076",
    photoRef: "places/ChIJPfVM-xIXw4gRiT1_XuUakks/photos/AWCwydgBGErmZyzdzjYnOGJeEh4AnxZ0tyq7S_hqBZzGuiprR4hqPeTUWgejCgzxRFrclHrlV7AR-E4KgF51Ad31yLDJuIs-VtzW_5V5WRcTcdtHMYlFS8woC2DZ4UhwP-3fz39FJADmQDpuflf5go1fmDN_ZfMfSD5jcChdISLsXS9-u6kz2kLoY7RqQsGPPq5cUA28hZOEx53_GZj-9PYk_eRKFypZ7L_EZpvI3aEgGvpn17DgRY8ESMgDvzP9gWp5z47YluZDRyKHxpMD_pV3LeZ_1u8fFqxDYDkajCGCTXdCUNdtI8cM1V8zpx6L_cEr2BCo22G7rr7L2ykQdqyq0WnV97ttVe-1ZOEA3IicqpWIRIMjdzBGHwV6fGizNWRwUkC8_IweFpBfK5F1SeP5S330BZ-3hT9Mq5_Y-r9w4bpBoavK", // own Google photo, name+town verified 2026-08-11 (27.4975,-82.5732)
    match: Object.freeze([]), // registry's first per-merchant seed (real-user detail_open evidence)
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-el-warike", icon: "🥘", merchant: "El Warike Peruvian Cuisine", area: "Bradenton", kind: "dining",
    title: "$20 for $40 of casual dining", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/40-casual-dining-bradenton-fl-deal-12831352",
    photoRef: "places/ChIJ1-3fCmwWw4gRZ3jzqZZumVM/photos/AWCwydjbWfH0ka5N1HEwlyYw5W0N0QiJ6GM8Eg4iQ99eyiK5E01WVrE33AdzqHw7Y16FCyYuyi_Gzw8QBB1zpNUjaKPtHE_Xwoy-Zi_I-p1q2jxAWiOuSt3BeMhu7eO2FmCDWvTGVpr4HFqOqFtxFPVR2S5cmjRwCaHhOn23WbCEAvHxlNQFr62lT7C_Dte9bAgvspOFNwrk6Tf5xa4vQH3z4vTzvUT3nIJg-w6iCYUpOzKE7117L1NN7N1-cTtg5FaXq_oTowDzIsS6o2pWpRoYPbzp-qgChdg7iPOUbcW9XmsVpNR-nVPOX5xo1NbXcMg8U5Q4jxNk5IA7YuRrS1rL25GG_1K1O8tHiDiXR9Vw4H9ODJW9ahJ0G8P1HtXiIwdN7R6WHg4QDKptijPPThRyqtQ3LhQzWeZjg4ngfXYxDS9L88iu91qGT22Yg4fPhM40", // own Google photo, name+town verified 2026-08-11 (27.4638,-82.5881)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-guac-shop", icon: "🌮", merchant: "Guac Shop Mexican Grill", area: "Bradenton", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-bradenton-fl-deal-12745796",
    photoRef: "places/ChIJHxaMmjo7w4gRoHwbVT6EKQY/photos/AWCwydgFv1BtPz4PViTFs1tKHI_PldJ5GcyvLgDrNnzcOrLTi-f635zyqCL1_vEAxHMqApxdltQOad_DRgMeoImXtp2OJoEeISkx4rKp0gGMFyQOkN17hl0O0zDxNYDva1KEg1Mwvnjj6SQTELwaHSRfLuwrgvMVcJLA_Ux-qxg8eg1FwAYT8PC5PZhLCv-lnGHzUlM3_SCXritYGvbXpydOwhICj2lQqya50T1TZJSgxoRplvR6dhhchoFXSAaS427L4lzxENxVu8cAYOUg1gNsTm5fp6vvjelhY1kODdXWF_kwaqDr9BsJmiBsVxTF-izWqOFomi65nLytAO0LTTXf4KS3absMDV069qJE7QXhx12o6JjfIGJx3JaPrHVoJB09caFEchYWzQmVz5uSdnZEeT4Y8SwPhZ2WTwJhZv8tsVE", // own Google photo, name+town verified 2026-08-11 (27.4449,-82.4663)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-peach-cobbler-bradenton", icon: "🧁", merchant: "The Peach Cobbler Factory - Bradenton", area: "Bradenton", kind: "dining",
    title: "$10 for $20 of cobbler & ice cream", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-cobbler-ice-cream-more-bradenton-fl-deal-12829469",
    photoRef: "places/ChIJ6TpnBFYXw4gR9SKCJeTnIjY/photos/AWCwydjd7vzbQ9wczmV1gs6yaOfgsJwYnc8Syqom-rT2nyzi5FOpWWc9t_kEXoMnTP_tUQK3sDcS-6eBouryZCnE_A1sL7aI3hU-QInoznl2SBXp4_ywHOYtdksQYmDERivaew7-Lb66trlWFrRhf0E_B0e96d_FbYS98UTYjJyUb61MP2Y0yIytobNVtIxPLPSJYRBN0nSJU5ZviCB1JTC37OWc1Nr_x_bbsEW7-8H2SpPIdBTuFLtlnTnhoy6Fc97qfTDMhRJcd6_Q2T636g5LyzM5ngvOS-rLLZS3kg-ZubTOh4E0V6sTglt40bsOmdclJ46XHh3fgR8B4X6C-AjP7G9caaiNEB0sZSV9qNjXf98nLC7kwt_z4tTrLdjiMGIykKpkUHZDeEe98fXQdpOw-8IyubdeTNm7WfUl4-YH47WSD3-BdBWibI9gEOAOjw95", // own Google photo, name+town verified 2026-08-11 (27.4616,-82.5684)
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
    photoRef: "places/ChIJQ2lqiihBw4gRKikqAzm9Lhc/photos/AWCwydgjQ9Veb_DMwliLqj3t8XLGiiYQo85BfEtKcise8sYmE_Z7_0iKvOyvEAUs0l4fHCKjbmVkN0XgcHxhCAr4dhJzLZIPId4l5ahVbIUO8wK9TN4kbwAuEzaPp3Wh7V51ER_EWlVkA4ZbEw5M1SZX7dPMoLTMASMXgnMtU9zT1XqmLaB5TF_Na-Q0gzd9hpOfYd26rNjbkEuQub1QLP9X2vstNHwjrjtAjL5aO3mNDtwSTaL-fe0mvKfJBg92ZRk_r1K24lOBGRAElZ8cHSdt28xtN9QZ5N54wpeJnFjKBUXqpwBdAJ4BtgYP33Uhn7PEoiNUITWpxMIwUejjOgMvPaeXF1SJy6rleiKDQOnPljFhPxxkSf1JTXTNQrpq1zn3Z6vxKzu3AjxiOkLLGcBeVEukH_tSAxo-6j5TXqX8kkLfgzIMacbL7yBRLFR3ykfA", // own Google photo, name+town verified 2026-08-11 (27.2700,-82.4876)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-five-o-donut", icon: "🍩", merchant: "Five-O Donut Co", area: "Sarasota", kind: "dining",
    title: "$10 for $20 of donuts", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-donuts-deal-12515586",
    photoRef: "places/ChIJ0-3_7GRAw4gRmttY9pKuGss/photos/AWCwydgUw8jA097wq6pPidDc-kxLQ_xU0QwI1ll-UdkholsiN9YP2eo8qjSBpnafv4AyqUYTaQtYYRlL-a6-m_w03d41WWWS-EMkkYEGp8hW0aJu4PLIhgyKPFP9f7iVPQdNfzekIRmWjncWXUXzHoq2Ai9yVYAI_xaymY7cTVXE95FBoJIlg24u8ts9R4dNxPQVihQf_o5gX5WB7yubSEb5zBBl2am_e8QFwNXls1LxrdChIsJg5xn6P__Mb09L6POczw22FusucZL-uEfv0sTzWVEz9cplXIvZbFlI2yuKCAnlGZp49exu77R1l-RpFr9-7uUSKNmUh0DEnZkw4NvPAYKQWpSXRhrgOmxf4HvuDspbpiy-rZn-q4b1PXxrCeSlKVz8JR90YaWDMZwe2CjB9SGGawl5OdmBv44mNJdTuf8", // own Google photo, name+town verified 2026-08-11 (27.3359,-82.5255)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "parrish" }) }),
  Object.freeze({ offerId: "clipp-m-rosys-ice-cream", icon: "🍦", merchant: "Rosy's Ice Cream", area: "Osprey", kind: "dining",
    title: "$10 for $20 of ice cream & more", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/20-ice-cream-more-osprey-fl-deal-12832419",
    photoRef: "places/ChIJ2aQyshdDw4gRmmFabE8pyLY/photos/AWCwydhTaUDBILeiWBx0lGkik1ArC-f3hb-8MfR-J_TkT_2Y_xO87qnKO2i8C93Jc4txwznlvRhtnnASSUjMegO7jkBNw9rcp6kRymUWENp82FE7SGLVn6qA56M_yEZSTB4RYT962nJZRV1dsUzuBNB1wvXNjhzcnpBYdRAe6_0ZvXrGKuAOuRKdxRY_deWLBDZHfZC9IYscA7rPz7QGusyvb4hjP6CliJ_Res-uToKQc5UrRRLydMNMH9XgpWW9chC2BiR9fN-zd6XU8ibcLNqZH13ZmHQI20qLpjVlA5ufkTFo8XhvT5xMCkzaHiU9_JN6pSXtfJoaOv3HSYl-ApgJs5oGBhdNh-4A-uaTGO3LA68Vxf8zcSMWegHmWsKkec5iO0FO9PHWcYy1Z3qNo_pMj4AbYgVcrhxNuDClKcPrZl3wxotgZcFL7NTw42V8qAzW", // own Google photo, name+town verified 2026-08-11 (27.1779,-82.4827)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "bradenton" }) }),
  Object.freeze({ offerId: "clipp-m-el-jalisco-englewood", icon: "🌮", merchant: "El Jalisco - Englewood", area: "Englewood", kind: "dining",
    title: "$15 for $30 of Mexican cuisine", badge: "50% off",
    dest: "https://www.clipp.com/all-offers/30-mexican-cuisine-englewood-fl-deal-12810263",
    photoRef: "places/ChIJtXq6zcqpxIgR3x_z2a0f3-Q/photos/AWCwydjkgtNuiJM2Iz2oylAXeazXNSvLgGv46LueRgN1XopfkpH5QXnzjtP41MRLR37L90i2HpT8ZdA4tzmQ6-uDWKaoSgggdJxdfGtdX3Fex8uisZLzOh9y9vRkGyPKFAdAhbDG2hi9_Nbw4c9AChrqMiuwHPbz-qOxh78tj76YrZKEnjv2UKlbTbJMWTcfl5SF8mzKaZmOZDANfpkR9G4BB2LtBzYVEjXcvqI6iccjqKhlmJ-FRjV8Y1dOPjAk1o_UPxXhj_FhHSAE14eFhKWW_9rq-ccmErULpBJ2FKwlveYF5l_qsJPs12st1clWNMtnWpZWB3740YejLz9msq9WKStRuyhm86hyWdkB4Uvvw6Nb3FxWrheAIJjMLqp9zKiFMljmNykJIKTkc3RDdb5voL2qbh-DGbe9CyeNUqH_-nilVFKyOebdcYnUiZTs3l9X", // own Google photo, name+town verified 2026-08-11 (26.9373,-82.3386)
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
    photoRef: "places/ChIJyU4ElHnNwogRaEgOyxAxSZQ/photos/AWCwydhBJRqaHspdydnzoDon4cDEK8eQsy4gwHegWbw1xli5FFBgxY7aIKILod3q--VoAURpHZ6ZiWDYVwqqrkDrntRY3yMxA0_ugP8MBB0g-hj0A8hLoQVUtDFlg8YO7CaaVa-e7afJSG3tKTSasZc5Y5QoQJt0RtD3ZJOv3Bry3RrBnNRupWnkypcJyX62CHe06zO7lX8o3NoEFSSbNxHwVz0Qyd4nxy-uaYVZvcZ45qCXdSOE4P6CVlXc-nCdMksRXBd17NTmgHFUTCE01BO3rrbgfkqOdpjR84iwjJv8XseRdfVtpuqS4tbtqCAHcqL8NpUdAPHzE0cV7t-8r59pMOiaKVkpMdlL5NONWwk6VZzmJIcn59h8hxju1qQdTzkuQxQttPzPNJD1huNG7bvFH1OdPaGKwd23PItid0759QkkXYIzaBADKXH3qvTXNQ", // own Google photo, name+town verified 2026-08-11 (27.9384,-82.2637)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "tampa" }) }),
  Object.freeze({ offerId: "clipp-m-golf-social", icon: "⛳", merchant: "Golf Social", area: "Clearwater", kind: "activity",
    title: "1 hour of play (reg. $50)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/50-for-1-hour-play-clearwater-fl-deal-12871011",
    photoRef: "places/ChIJVwUpGlXvwogR_7eky4bf2H4/photos/AWCwydi-oaxaDKtQTz7p0p-nsdfn3V8Zel_lU9ctk2adwDvXeoHnoo23uy3VR4g2lt5QjAmJVCvHkUJM12hvxtZ4VcKrTI_Fk_2nJo90HB1vXImVf9avJJJmHenZ8yfTh-fm6lVL7-bPCi4q3TwujKiArfnJoThGiRc3MGLfEidWor__h4v6o4MQrSoq3KnFrN7-oYik3-pH1cxaFQc4b9esN_AJHrEqle6FK4QbYuHi650yjdoyFAqmf_zd5VkjGUOcpmO6vCs05oh5jwk1fOHrv0B36yuIGJcdn5xr-brV6JaJvlReFOt55bcRhKP8mniVBWNQfBxsQPD1HZsgqy8lrKXtXH8pFmcCsTAf5-Xne3zhFgpqkpEgx4qvlu3VyeuTKSG6PbFEZ_ZlUcvjWPhOgMrRV8Z0h1mSOJVRDFwcGakASMLsaGRPMboP2G8YUg", // own Google photo, name+town verified 2026-08-11 (27.9841,-82.7304)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-t4-kartplex", icon: "🏎️", merchant: "T4 KartPlex", area: "Palmetto", kind: "activity",
    title: "Standard go-kart session for 2 (reg. $70)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/70-for-standard-session-go-kart-rental-for-2-people-palmetto-fl-deal-12856611",
    photoRef: "places/ChIJX_xfN8sjw4gRk4k8uynBAnQ/photos/AWCwydj8bfQf24pMzUziRRbnTYeAWIQNgDn9V2i-FWM99UZXyI4y1gfcOFwgtyw8RkWd-jLqxqE0kWPMCgZ_5WfkHPB9IhT9ZDFhVIJonPSTQHpH1WPhKyPJjtlbrqmmnYUMIXPfVwafe7a5LiAWfaVVNuGlQcaozraJhzbBs23io-NP8Kw-oCynIhg60hJfc3d0869XU2cEJaQKmMrWZMibQhmmV59aTAKmKaNVhSL8ikVPlbBauJ819S-10t-PQEYMTGY-DsXbOumJQHorzEDlDJ0FyXAuxeAv_ahefm-0CUZ-Nk6EZObzs4LyTgiX2kXeFbyMHWVosuRpOtAXzODu1k6hoDc2rZBjrmU_ygc7WWn1j92E44tGw8RNJu1TWdUImhCwB5gyhJCUuBpTb6jW7kA848Q81J1aLnxNcTC6OQyAY1Gc", // own Google photo, name+town verified 2026-08-11 (27.6059,-82.5417)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-indoor-fairways", icon: "⛳", merchant: "Indoor Fairways", area: "Bradenton", kind: "activity",
    title: "2-hour golf simulator session, up to 4 people (reg. $120)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/120-for-2-hour-golf-simulator-session-for-up-to-4-people-bradenton-fl-deal-12856765",
    photoRef: "places/ChIJ8XeJ2toXw4gRDBBf0zczYj4/photos/AWCwydiJiO2txixR-eoKUC6ll62NlyGg-JUyKIJrT7d39r-Br2ofzf3iPQBXIK3cO8z37Ox9eNhZqJpMOpdzp-Tk-Ml9UTRs1kYeLma28LdiPrir65HAT1MintKBof1lDQQQuwQkLfURwxNn9SiVgKph1d3EQGxUN8wGcJnBwKpYGBEb2FTJPTIRN84iqSpI88wjtjtjysHIuABMgCxgysxxP9Qoj1ai3XrD3bojdCY2WiB_GPwwTrUkJ0dWQtuIGzfcIstK6nC50Kq6CyYBkWbxSKTbMEEpdzdbxSpcdIX7GhH4cnWs6yXBN-NxUQHPtXtldG0TabFpnozbaLmPrTF2AHiXlSPMb3me3RTykPOB-fx6tYXCtVuxS39YQCCvZasB2v0Un5jlDAIHEfo-ogCZIlUoYs43UZLydKdfCJLlsso1kkkjzLQLDdBSnkfRrdzl", // own Google photo, name+town verified 2026-08-11 (27.4953,-82.6138)
    match: Object.freeze([]),
    verified: Object.freeze({ on: "2026-08-07", seenOn: "saint-petersburg" }) }),
  Object.freeze({ offerId: "clipp-m-back-nine", icon: "⛳", merchant: "The Back Nine", area: "Bradenton", kind: "activity",
    title: "One-month membership for new members (reg. $199)", badge: "Deal",
    dest: "https://www.clipp.com/all-offers/199-for-one-month-membership-for-new-members-bradenton-fl-deal-12789349",
    photoRef: "places/ChIJKVRP_EYXw4gRac5SKnbSMKo/photos/AWCwydjn3vx7gbNuXfLspa1-TB2tlzkJc0dsLi0it1ryFQnQ72MaO0CDMd8Qdm3mO_0jPM5tB_CIF62kF5U529JGtNCOvUxG4ytR7Hyqo2ljsobmEkpBmWWMaX_BUqrGaxAa6Wz7MBYIfefMeOMd81VJZizrdQjiy8YgJe14bRitT0dCAlv68W-JfljcIZBJT3Wg2ELYWaW-3Yr2bGyH5IccsStogY-V8s4E9lsptWeqSrIgKxAWxzLYeKA45bNmfGlEm3ri9bdMplGBWO-YIwpnbfVGhfXqH0szJAfyZqKiAGnXe4Z8ImEEpxEgiCBZEGr2RCeGHK9MKlIWETfbEW8UGuaLXTfjbzoL9YYtMFdwvsNnY-W9mx_ozbh56ASnLo1pWz_9B_CVPx-3X--5sYK_62TIjUUktj2zImBmWtiAYFC9ebk4", // own Google photo, name+town verified 2026-08-11 (27.4617,-82.5832)
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
