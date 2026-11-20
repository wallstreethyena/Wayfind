// lib/atlasDecisionEnrichment.js — SERVER-ONLY verified decision fields
// (price tier / free admission + typical visit duration) for the top 55+
// holiday-traffic Atlas places across Tampa, St. Petersburg, Sarasota,
// Bradenton, and Orlando.
//
// HARD RULES:
//   1. Never import this module from any `"use client"` component (zero client-bundle cost).
//   2. Every `priceBand` / `admission` / `isFree` entry below is sourced directly from
//      Wayfind's researched `data/atlas/editorial-cards.json` facts (`foodMove`,
//      `drinkMove`, `hours`, `currentUsefulDetail`) or verified county/state/NPS park
//      admission schedules — never inferred from generic venue types or unverified prose.
//   3. Never sets or invents `lat` / `lng` on Atlas-only records (`test-atlas-place-pages.mjs`
//      invariant: `wf_inventory` owns coordinates).
//   4. Actionability Coverage never modifies `wayfindScore` or organic ranking.

export const ATLAS_DECISION_ENRICHMENT_BY_ID = Object.freeze({
  // ── Attractions, Museums, Gardens & Tours (Sarasota / Bradenton / Tampa / Orlando) ──
  "ChIJlXJqE9k_w4gRySJ2BPEXcR0": Object.freeze({ admission: "Paid performance tickets", isFree: false, duration: "2–2.5 hours" }), // Asolo Repertory Theatre
  "ChIJ08zZpRpBw4gRiDJBlBXfAHw": Object.freeze({ admission: "Free park admission", isFree: true, duration: "1–2 hours" }), // Bee Ridge Park
  "ChIJNxf8h55Hw4gRSaBE_mEdfxo": Object.freeze({ admission: "$25 adult, $10 child", isFree: false, duration: "2–3 hours" }), // Big Cat Habitat & Gulf Coast Sanctuary
  "ChIJD7cZSFBDw4gRsEpfMoip9BE": Object.freeze({ admission: "Free park entry", isFree: true, duration: "1–2 hours" }), // Blackburn Point Park
  "ChIJpXGK53VC24gRWMneFVtK6hY": Object.freeze({ admission: "Paid museum/mansion ticket", isFree: false, duration: "60–90 min" }), // Ca' d'Zan
  "ChIJVcqB2MUQw4gRbN_T0WF8QEw": Object.freeze({ admission: "Free admission (NPS)", isFree: true, duration: "1.5–2 hours" }), // De Soto National Memorial
  "ChIJPTvxtmpAw4gReToYD5mTNwE": Object.freeze({ admission: "$28 adult (Downtown campus)", isFree: false, duration: "2–3 hours" }), // Marie Selby Botanical Gardens
  "ChIJNwQxUnFDw4gRlEruVgcCmu0": Object.freeze({ admission: "$20 adult, $12 youth", isFree: false, duration: "2 hours" }), // Historic Spanish Point
  "ChIJLZ2vzRxBw4gRMOtW0ArhBhw": Object.freeze({ admission: "Free public park", isFree: true, duration: "1–2 hours" }), // The Bay Park
  "ChIJnXtixd5bw4gRrKDqLZC8Dlk": Object.freeze({ admission: "Free pier access", isFree: true, duration: "45–90 min" }), // Venice Fishing Pier
  "ChIJPXlTqYFTw4gRveHTZWG55DY": Object.freeze({ admission: "$15–$20 adult day pass", isFree: false, duration: "2–3 hours" }), // Warm Mineral Springs
  "ChIJg1HuP9xbw4gRs9PHCFmC4VU": Object.freeze({ admission: "Free park entry", isFree: true, duration: "1–2 hours" }), // Maxine Barritt Park
  "ChIJr7ec9tEXw4gRwicCx3wfH2w": Object.freeze({ admission: "$25 adult ticket", isFree: false, duration: "2–3 hours" }), // The Bishop Museum of Science and Nature
  "ChIJx1DBNl1Aw4gR6Zi9XjSh7r4": Object.freeze({ admission: "$20 adult (Free Second Sundays)", isFree: false, duration: "1.5–2 hours" }), // Sarasota Art Museum
  "ChIJmToCpQ4J3YgRof6hhxcoTIM": Object.freeze({ admission: "Paid garden admission", isFree: false, duration: "2–3 hours" }), // Bok Tower Gardens
  "ChIJ9RHZGx6H3YgRnWVYIWsHNPM": Object.freeze({ admission: "Paid park admission", isFree: false, duration: "3–4 hours" }), // Gatorland (Orlando)
  "ChIJ4XkjoBtw54gRGiqFxtWvbM8": Object.freeze({ admission: "$20 adult, $10 child", isFree: false, duration: "1 hour" }), // Scenic Boat Tour (Winter Park / Orlando)
  "ChIJlcJ_05B654gRLlHWvJUolWg": Object.freeze({ admission: "Paid museum admission", isFree: false, duration: "1–1.5 hours" }), // Mennello Museum of American Art (Orlando)
  "ChIJwXQNJk1Bw4gRJRP61Kgtuv8": Object.freeze({ priceBand: "$$", isFree: false, duration: "1.5–2.5 hours" }), // Livingston's Amusements

  // ── Public Beaches (Gulf Coast) ──
  "ChIJaW-sUB9rw4gRrQvxVM94nOY": Object.freeze({ admission: "Free public beach", isFree: true, duration: "2–4 hours" }), // Lido Beach
  "ChIJjfu2YPBBw4gRo41o9hwHfmg": Object.freeze({ admission: "Free public beach", isFree: true, duration: "2–4 hours" }), // Siesta Beach
  "ChIJ9RsHDcVDw4gRg3ftHUNMwco": Object.freeze({ admission: "Free public beach", isFree: true, duration: "2–3 hours" }), // Turtle Beach
  "ChIJ93GmrXxbw4gRwpdoUmSQPO8": Object.freeze({ admission: "Free public beach", isFree: true, duration: "2–3 hours" }), // Nokomis Public Beach
  "ChIJqXOk48Jbw4gRr3On4Tgi36U": Object.freeze({ admission: "Free beach park", isFree: true, duration: "1–2 hours" }), // Service Club Park

  // ── Dining, Cafes, Markets & Nightlife (Tampa / St. Pete / Orlando / Sarasota / Bradenton) ──
  "ChIJC4qBgvHHwogRpobL5gaayiQ": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–75 min" }), // Keke's Breakfast Cafe (Tampa)
  "ChIJm_MbVcLHwogRdDvs5papv1A": Object.freeze({ priceBand: "$$", isFree: false, duration: "45–60 min" }), // Burger Culture Lutz (Tampa metro)
  "ChIJY_kA8nfjwogR1AhPPGA2k7o": Object.freeze({ priceBand: "$–$$", isFree: false, duration: "30–60 min" }), // Tealicious Cafe (St. Petersburg)
  "ChIJbyotrqf-wogRJwMPtUFijn8": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–75 min" }), // The Frog Pond North Redington Beach
  "ChIJO3PrEmdx54gRW1c11w1Yxlo": Object.freeze({ priceBand: "$$$$", isFree: false, duration: "2–2.5 hours" }), // ÔMO by Jônt (Winter Park / Orlando)
  "ChIJwQne8wd754gRvBfDab1krMk": Object.freeze({ priceBand: "$$$", isFree: false, duration: "90 min" }), // The Pinery (Orlando)
  "ChIJIyOEEvd954gR4F34yBVuWSo": Object.freeze({ admission: "Free mall entry", isFree: true, duration: "2–3 hours" }), // The Florida Mall (Orlando)
  "ChIJfUTGO2uA3YgR8t5QlAd-jTY": Object.freeze({ admission: "Free outlet entry", isFree: true, duration: "2–3 hours" }), // Orlando Vineland Premium Outlets
  "ChIJjRUQibCB3YgRc19RWjbKwrY": Object.freeze({ admission: "Free shopping center entry", isFree: true, duration: "1.5–2.5 hours" }), // Lake Buena Vista Factory Stores
  "ChIJEUEmzE1Bw4gRHHXe_oxJF7E": Object.freeze({ priceBand: "$$", isFree: false, duration: "45–75 min" }), // Hashtag Café (Sarasota)
  "ChIJaTQEjpFqw4gRnHJU2Klfw0o": Object.freeze({ priceBand: "$$–$$$", isFree: false, duration: "90 min" }), // Columbia Restaurant (St. Armands)
  "ChIJASGZttk4w4gRJaBZXzV3-Fw": Object.freeze({ priceBand: "$–$$", isFree: false, duration: "60–90 min" }), // Oak & Stone
  "ChIJEUM6S7JOw4gRSeCj4mQQrQ0": Object.freeze({ admission: "$6 per vehicle park entry", isFree: false, duration: "1–2 hours" }), // Myakka Outpost
  "ChIJN3Cny9Y8w4gRolf8PlS1tuU": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Anna Maria Oyster Bar (Ellenton)
  "ChIJV0e-x5MVw4gRM1jn5H1xnYE": Object.freeze({ priceBand: "$$$", isFree: false, duration: "60–90 min" }), // Anna Maria Oyster Bar (Landside)
  "ChIJ9050DL0Ww4gRquWht0P2vsQ": Object.freeze({ priceBand: "$$$", isFree: false, duration: "60–90 min" }), // Anna Maria Oyster Bar (Cortez)
  "ChIJZ0W_vt04w4gRlbOczIeB2k0": Object.freeze({ priceBand: "$$", isFree: false, duration: "75–90 min" }), // The Cheesecake Factory (UTC)
  "ChIJ-1_UDBs_w4gRvIMj4gJYjNo": Object.freeze({ priceBand: "$–$$", isFree: false, duration: "30–45 min" }), // Detwiler's Farm Market
  "ChIJB_GKfW81w4gRsCQHi5hjasA": Object.freeze({ priceBand: "$–$$", isFree: false, duration: "60–90 min" }), // Dakin Dairy Farm
  "ChIJ7e4ZhRQ5w4gRW7u641t5TI8": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Linger Lodge Restaurant & Bar
  "ChIJ38CBz8Vqw4gRg0oFYUGBU_s": Object.freeze({ priceBand: "$$–$$$", isFree: false, duration: "75–90 min" }), // Dry Dock Waterfront Grill
  "ChIJ14i7EM4Xw4gRhmjGq7zknhg": Object.freeze({ priceBand: "$$$", isFree: false, duration: "75–90 min" }), // PIER 22 Restaurant
  "ChIJ89v5es48w4gR3A1gqsRwFtI": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Woody's River Roo Pub & Grill
  "ChIJTRrY-N45w4gRK-gntDx49-o": Object.freeze({ priceBand: "$$$", isFree: false, duration: "75–90 min" }), // GROVE Restaurant
  "ChIJyYi3Yw4Ww4gRaJbXtbjk_oc": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Good Liquid Brewing Company
  "ChIJB8ystAE5w4gRJqnBOZatjbo": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Ed's Tavern — Lakewood Ranch
  "ChIJvdrqPr85w4gRA6C9TTnUdnY": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–75 min" }), // Keke's Breakfast Cafe (LWR)
  "ChIJ7QsLgxQ5w4gRSLtMON-sOaI": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Agave Bandido
  "ChIJg2jnUiFCw4gRiYPUEhJoxhg": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Captain Curt's Crab & Oyster Bar
  "ChIJ4azy4NsTw4gRggI1e2ak_Rs": Object.freeze({ priceBand: "$$", isFree: false, duration: "45–75 min" }), // Coquina Beach Cafe
  "ChIJSxtyZcBAw4gRrgOGwbkWXIU": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Der Dutchman
  "ChIJf5M5VmBZw4gRVHX-dcX1dBk": Object.freeze({ priceBand: "$$$$", isFree: false, duration: "90–120 min" }), // Fins At Sharky's
  "ChIJH9Womvo8w4gR3b99nAsCHXY": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Gecko's Grill & Pub — SR-64
  "ChIJRcH7zGBHw4gRek5qQU0_8wg": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Gecko's Grill & Pub — Fruitville
  "ChIJJWCbj5kRw4gRYkZ7QJ-L91s": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Gulf Drive Cafe
  "ChIJx-U-VRFAw4gRUUDwK8ht44s": Object.freeze({ priceBand: "$$$–$$$$", isFree: false, duration: "90 min" }), // Marina Jack
  "ChIJs8HMPKxDw4gR8rXHdqdvpmE": Object.freeze({ priceBand: "$$$$", isFree: false, duration: "90–120 min" }), // Ophelia's on the Bay
  "ChIJIwZqEutAw4gR-1cOUgiln24": Object.freeze({ priceBand: "$$", isFree: false, duration: "60–90 min" }), // Yoder's Restaurant
});

export function atlasDecisionEnrichmentFor(placeId) {
  if (!placeId) return null;
  return ATLAS_DECISION_ENRICHMENT_BY_ID[String(placeId).trim()] || null;
}
