// lib/localPicks.js — THE OWNER'S HANDPICKED LOCAL BOARD, batch 1.
//
// v8.30 (owner, 2026-08-22): "i am going to give you places for you to add to
// the amazon rail cards … it will be broken down by time of the day,
// market/town … make sure to create a place card for them." He then handed
// over 225 slots: 15 picks for morning, afternoon and night across Parrish,
// Bradenton, Lakewood Ranch, Palmetto and Ellenton, closing with the standard
// this file exists to meet — "ranked, handpicked, and timely, instead of
// simply showing a long directory."
//
// WHAT THIS IS NOT. It is not a sixteenth rail. Every rail tile's headline is
// PIXELS (see the note in app/components/DaypartRail.js and
// scripts/check-rail-art-matches-copy.mjs), so a new rail with no artwork
// renders no tile and the picks would be invisible. It is not a second card
// stylesheet either — these ride the one .wf-place-card contract like
// everything else.
//
// ONE CARD. The owner pointed at the tile and said so (2026-08-22, on a
// screenshot of the homepage rail): "Its for this card btw" — "What Should We
// Do Today? / Your best day, sorted. / Handpicked, ranked and ready for right
// now." So the whole registry feeds exactly one rail, `today`, and every other
// rail's composition is untouched. scripts/check-local-picks.mjs asserts that
// in both directions, because the tempting next step — letting the dinner
// picks also feed Tonight's Move — is a change to six other rails made without
// anyone deciding to make it.
//
// WHEN A BOARD EXISTS, THE BOARD IS THE CARD. Same shape as v8.13's summer
// rule ("in summer, the owner's list IS the axis"): if the reader's town has a
// board for this hour, `today` serves that board and nothing else. Outside the
// five towns there is no board and the rail keeps its organic behaviour
// exactly. The tile promises "only what's actually worth it" — merging a
// handpicked list into the ranked pool and taking the top twelve by score is
// how that promise quietly becomes a directory again.
//
// HOW THE TIME OF DAY IS HONOURED. The hour FILTERS: at 8am the reader sees
// the morning board, at 8pm the night board, and never the other two. It
// cannot reorder — display order is the governed Wayfind Score on every rail,
// highest first (owner's global rule, v8.10) — so membership is the only lever
// the hour has, and this is it.
//
// That filter has a cost, paid deliberately. /api/rails is CDN-cached for an
// hour and the band is corrected in the reader's browser, so the band has to
// reach the SERVER or the cache would freeze whichever band it was warmed in.
// `/api/rails?...&band=` is that parameter. It multiplies the route's cache
// keys by four on paper and by roughly nothing in practice, because the four
// bands are disjoint in time: at any given moment every reader in a metro is
// asking for the same one.
//
// SAME FAIL-CLOSED RULE AS lib/summerUniverse.js AND lib/birthdayUniverse.js.
// Every venue is a REAL Google place; place IDs were resolved 2026-08-22 from
// the permanent wf_place_ids / wf_inventory index. An unresolved venue ships
// placeId:null and serves NOTHING until scripts/resolve-local-pick-ids.mjs
// fills lib/localPickIds.js. `rank` is CURATION order only — display order on
// every surface is the governed Wayfind Score, highest first (owner's global
// rule, v8.10).
//
// COPY DISCIPLINE. `why` is selection metadata capped at 110 chars, NOT the
// card hook: DaypartRail renders Atlas / wf_editorial only (owner, 2026-08-20)
// and slimPlace carries `pickWhy` for selection and tests the same way it
// carries summerWhy and birthdayWhy.
//
// WHAT WAS REMOVED FROM THE OWNER'S LIST, AND WHY. Nine of the 225 slots named
// a place that does not exist or has permanently closed; shipping them would
// have sent readers to nothing. Verified against primary sources 2026-08-22:
//
//   Hickory Hollow Farm (Parrish)  no such business — Hickory Hollow BARBEQUE
//                                  is in Ellenton. Substituted Gamble Creek
//                                  Farms, the real Parrish farm stand.
//   The Strawberry Shack (Parrish) does not exist in Manatee; the real one is
//                                  in Plant City, Hillsborough County.
//   Birdrock Taco Shack            permanently closed late 2024.
//   Caddy's Bradenton              permanently closed after Hurricane Milton,
//                                  October 2024.
//   Paris Baguette UTC             no Sarasota location; nearest is Tampa.
//   Caffe Italia (Bradenton)       is in Riverview. Substituted Arte Caffe,
//                                  the actual Bradenton Italian café.
//   Topgolf Sarasota-Bradenton     never existed; nearest venue is Tampa.
//   The Chateau Sarasota           closed; the operator's live room is The
//                                  Chateau Anna Maria.
//   Masa Asian Bistro & Bar        real, but in Weeki Wachee — 90 miles north.
//
// Three more were renamed rather than dropped: Andersen RacePark is now T4
// KartPlex (2024, same site), ArtCenter Manatee is now the Herrig Center for
// the Arts (renamed AND relocated to 888 3rd Ave W, reopened March 2026), and
// no Popi's Place in Lakewood Ranch could be confirmed operating, so the
// nearest confirmed-open branch carries those slots.
//
// Two entries are RECURRING MARKETS, not venues open daily — the Bradenton
// Public Market (Saturdays, October to May) and the Farmers Market at
// Lakewood Ranch (Sundays, year-round). They carry `market: true` handling
// nowhere yet; until they do, the businessStatus law is what stops a card
// claiming "open now" on a Tuesday.
//
// Four entries in the owner's list were DISTRICTS or EVENT FEEDS rather than
// places — "Main Street Lakewood Ranch restaurants", "University Town Center
// dining district", "Main Street Live / Waterside events" and "St. Pete /
// Tampa event listings". A district is not a place card; the first two collapse
// onto their anchor venue and the last two belong to the events pipeline.
import { LOCAL_PICK_IDS } from "./localPickIds.js";

export const LOCAL_PICK_MARKETS = {
  parrish: { label: "Parrish", lat: 27.5714, lng: -82.4276 },
  bradenton: { label: "Bradenton", lat: 27.4989, lng: -82.5748 },
  lakewood_ranch: { label: "Lakewood Ranch", lat: 27.4106, lng: -82.429 },
  palmetto: { label: "Palmetto", lat: 27.5214, lng: -82.5723 },
  ellenton: { label: "Ellenton", lat: 27.5231, lng: -82.5273 },
};

export const LOCAL_PICK_VENUES = {
  frm: {
    name: "Florida Railroad Museum", city: "Parrish", lat: 27.59013, lng: -82.42348,
    placeId: "ChIJ______8sw4gRMudh58gsGMU" },
  gamble_creek: {
    // substitute for the owner's "Hickory Hollow Farm", which does not exist in Manatee County
    name: "Gamble Creek Farms", city: "Parrish", lat: 27.55419, lng: -82.39111,
    placeId: "ChIJfUYeWmAlw4gReflS439GCg0" },
  parrish_park: {
    name: "Parrish Community Park", city: "Parrish", lat: 27.58243, lng: -82.43507,
    placeId: "ChIJJSK6DAolw4gR2-tcgDhSPVI" },
  fort_hamer: {
    name: "Fort Hamer Park", city: "Parrish", lat: 27.52528, lng: -82.43028,
    placeId: "ChIJu9V8cNY6w4gR14jQbFoNfsE" },
  jiggs: {
    name: "Jiggs Landing", city: "Bradenton", lat: 27.43248, lng: -82.48192,
    placeId: "ChIJq_OdjK4-w4gRHDtAsN8WP34" },
  detwilers_univ: {
    // University Parkway store
    name: "Detwiler's Farm Market", city: "Sarasota", lat: 27.387, lng: -82.50433,
    placeId: "ChIJ-1_UDBs_w4gRvIMj4gJYjNo" },
  sage_biscuit: {
    // owner flagged evenings as event-only, so no tonight rail
    name: "The Sage Biscuit Cafe - Downtown", city: "Bradenton", lat: 27.49528, lng: -82.57528,
    placeId: "ChIJl1FW_swXw4gRK7sqP64gV3s" },
  robins: {
    name: "Robin's Downtown Cafe", city: "Bradenton", lat: 27.49614, lng: -82.57371,
    placeId: "ChIJ69Iqkc0Xw4gR30-FXKOFlRI" },
  amob_ellenton: {
    name: "Anna Maria Oyster Bar Ellenton", city: "Ellenton", lat: 27.52819, lng: -82.51318,
    placeId: "ChIJN3Cny9Y8w4gRolf8PlS1tuU" },
  amob_landside: {
    name: "Anna Maria Oyster Bar Landside", city: "Bradenton", lat: 27.41797, lng: -82.57638,
    placeId: "ChIJV0e-x5MVw4gRM1jn5H1xnYE" },
  waterside: {
    name: "Waterside Place", city: "Lakewood Ranch", lat: 27.36487, lng: -82.41741,
    placeId: "ChIJi43QGNE5w4gRgxvO7rqqJfE" },
  lwr_main: {
    name: "Main Street At Lakewood Ranch", city: "Lakewood Ranch", lat: 27.39454, lng: -82.43526,
    placeId: "ChIJg2IFCAE5w4gRjoL2et_wuBw" },
  palmetto_hist: {
    name: "Palmetto Historical Park", city: "Palmetto", lat: 27.51632, lng: -82.57588,
    placeId: "ChIJU2tY1-kXw4gROk66zvWlDnQ" },
  gamble: {
    name: "Gamble Plantation Historic State Park", city: "Ellenton", lat: 27.52213, lng: -82.5267,
    placeId: "ChIJjZhUvSU9w4gRCuTRgyrctZA" },
  outlets: {
    name: "Ellenton Premium Outlets", city: "Ellenton", lat: 27.53425, lng: -82.50669,
    placeId: "ChIJKYwJVy0jw4gRkXnEq-Or48M" },
  t4_kartplex: {
    // the owner's "Andersen RacePark" - renamed T4 KartPlex in 2024, same site
    name: "T4 KartPlex", city: "Palmetto", lat: 27.60586, lng: -82.54169,
    placeId: "ChIJX_xfN8sjw4gRk4k8uynBAnQ" },
  manatee_village: {
    name: "Manatee Village Historical Park", city: "Bradenton", lat: 27.49495, lng: -82.54816,
    placeId: "ChIJy76z4HY9w4gROaX_C6lQu8g" },
  bishop: {
    name: "The Bishop Museum of Science and Nature", city: "Bradenton", lat: 27.49843, lng: -82.57162,
    placeId: "ChIJr7ec9tEXw4gRwicCx3wfH2w" },
  riverwalk: {
    name: "Riverwalk", city: "Bradenton", lat: 27.49921, lng: -82.56979,
    placeId: "ChIJY3qV_tYXw4gRoy-jOe1OAo4" },
  village_arts: {
    name: "Village of The Arts District", city: "Bradenton", lat: 27.48959, lng: -82.57309,
    placeId: "ChIJO22PfDIWw4gRIaovrmfAoKo" },
  utc_mall: {
    name: "The Mall at University Town Center", city: "Sarasota", lat: 27.38451, lng: -82.45284,
    placeId: "ChIJ9_YnI8k_w4gRRiuNIcvA5y8" },
  popis_bradenton: {
    // nearest confirmed-open Popi's; no Lakewood Ranch location is confirmed operating
    name: "Popi's Place Bradenton", city: "Bradenton", lat: 27.49457, lng: -82.62672,
    placeId: "ChIJxy-B-d8Ww4gRbHoPBQH54mU" },
  popis_palmetto: {
    name: "Popi's Place Too", city: "Palmetto", lat: 27.51924, lng: -82.57315,
    placeId: "ChIJiVejg-gXw4gRD38sHFCOIuQ" },
  treeumph: {
    name: "TreeUmph! Adventure Course", city: "Bradenton", lat: 27.40569, lng: -82.31878,
    placeId: "ChIJx-UjxpU2w4gRdU-iwVM6HW4" },
  lecom: {
    name: "LECOM Park", city: "Bradenton", lat: 27.48559, lng: -82.5705,
    placeId: "ChIJW183nLIXw4gRcuHFpjCkCGc" },
  mixon: {
    name: "Mixon Farms", city: "Bradenton", lat: 27.47715, lng: -82.52963,
    placeId: "ChIJC-_r_q89w4gRDYRrBTY8euM" },
  robinson: {
    name: "Robinson Preserve", city: "Bradenton", lat: 27.51382, lng: -82.66175,
    placeId: "ChIJR0i18icRw4gRbyGIoLLoSo0" },
  emerson: {
    name: "Emerson Point Preserve", city: "Palmetto", lat: 27.53288, lng: -82.62583,
    placeId: "ChIJ1XLnHF0Xw4gRk6bBUmmf2sU" },
  oak_stone_utc: {
    // University Parkway / UTC
    name: "Oak & Stone", city: "Sarasota", lat: 27.38962, lng: -82.46285,
    placeId: "ChIJASGZttk4w4gRJaBZXzV3-Fw" },
  oak_stone_bradenton: {
    // downtown Bradenton
    name: "Oak & Stone", city: "Bradenton", lat: 27.49896, lng: -82.57356,
    placeId: "ChIJpdqmHNAXw4gR6MMjnrOs2ZM" },
  whiskey_joes: {
    name: "Whiskey Joe's Manatee River", city: "Palmetto", lat: 27.52809, lng: -82.50928,
    placeId: "ChIJ9dbga9Q9w4gRVW8lSxsuB7A" },
  pier22: {
    name: "PIER 22", city: "Bradenton", lat: 27.50047, lng: -82.57354,
    placeId: "ChIJ14i7EM4Xw4gRhmjGq7zknhg" },
  obricks: {
    name: "O'bricks Irish Pub & Martini Bar", city: "Bradenton", lat: 27.49599, lng: -82.57336,
    placeId: "ChIJqQsqj80Xw4gRev0L3y4_-lM" },
  loaded_barrel: {
    // owner listed it as Parrish; the operating venue is in Bradenton
    name: "The Loaded Barrel Tavern", city: "Bradenton", lat: 27.49581, lng: -82.5737,
    placeId: "ChIJ14-Hmc0Xw4gRzZYgIy6qqAA" },
  woodys: {
    name: "Woody's River Roo Pub, Grill & Tiki Bar", city: "Ellenton", lat: 27.529, lng: -82.50556,
    placeId: "ChIJ89v5es48w4gR3A1gqsRwFtI" },
  grove: {
    name: "GROVE", city: "Lakewood Ranch", lat: 27.39341, lng: -82.43628,
    placeId: "ChIJTRrY-N45w4gRK-gntDx49-o" },
  eds_tavern: {
    name: "Ed's Tavern Lakewood Ranch", city: "Lakewood Ranch", lat: 27.39552, lng: -82.43437,
    placeId: "ChIJB8ystAE5w4gRJqnBOZatjbo" },
  good_liquid: {
    name: "Good Liquid Brewing Company", city: "Lakewood Ranch", lat: 27.3636, lng: -82.41724,
    placeId: "ChIJyYi3Yw4Ww4gRaJbXtbjk_oc" },
  amc: {
    name: "AMC Bradenton 20", city: "Bradenton", lat: 27.44939, lng: -82.53177,
    placeId: "ChIJ1wH4N3QWw4gREDvfx8VmUSY" },
  manatee_pac: {
    name: "Manatee Performing Arts Center", city: "Bradenton", lat: 27.49773, lng: -82.56804,
    placeId: "ChIJB-QyVtEXw4gRk5F8bn3YV28" },
  public_market: {
    // recurring Saturday market, Oct-May - not open daily
    name: "Bradenton Public Market", city: "Bradenton", lat: 27.49658, lng: -82.57347,
    placeId: "ChIJ9Zr5_dEXw4gRWXr3bcnjiIQ" },
  coquina: {
    name: "Coquina Beach", city: "Bradenton Beach", lat: 27.44833, lng: -82.69216,
    placeId: "ChIJ5eLMVXE9w4gR15l0tMZGkMY" },
  granary: {
    // the owner's Bradenton and Lakewood Ranch entries are the same restaurant
    name: "The Granary Breakfast & Lunch Restaurant", city: "Lakewood Ranch", lat: 27.47476, lng: -82.43331,
    placeId: "ChIJb1-IFa07w4gR46Q8DGkNkYY" },
  arte_caffe: {
    // substitute for the owner's "Caffe Italia", which is in Riverview not Bradenton
    name: "Arte Caffe", city: "Bradenton", lat: 27.49099, lng: -82.57344,
    placeId: "ChIJXdZdgzIWw4gRtHuM7uUVQVs" },
  desoto: {
    name: "De Soto National Memorial", city: "Bradenton", lat: 27.5233, lng: -82.6432,
    placeId: "ChIJVcqB2MUQw4gRbN_T0WF8QEw" },
  star_fish: {
    // the visitable anchor of the historic Cortez fishing village
    name: "Star Fish Company", city: "Cortez", lat: 27.46589, lng: -82.68534,
    placeId: "ChIJmcZ22HARw4gR5Th1Pxcl9II" },
  cortez_beach: {
    name: "Cortez Beach", city: "Bradenton Beach", lat: 27.4619, lng: -82.69746,
    placeId: "ChIJTfJKmoQRw4gRQN6jA1QanJA" },
  herrig: {
    // the owner's "ArtCenter Manatee" - renamed and relocated, reopened March 2026
    name: "Herrig Center for the ARTS", city: "Bradenton", lat: 27.49761, lng: -82.57099,
    placeId: "ChIJKdx4JtIXw4gROjjdFo_Ae6E" },
  red_barn: {
    name: "Red Barn Flea Market", city: "Bradenton", lat: 27.48363, lng: -82.56185,
    placeId: "ChIJJ2DbfIc9w4gRM-UmRpZNBeM" },
  gt_bray: {
    name: "G.T. Bray Park", city: "Bradenton", lat: 27.47364, lng: -82.61652,
    placeId: "ChIJhW6JF_MWw4gRUxIRevnpN4k" },
  paddywagon: {
    name: "Paddy Wagon Irish Pub", city: "Bradenton", lat: 27.49677, lng: -82.57364,
    placeId: "ChIJ6xecXf0Xw4gR7GzISRu8qnc" },
  clam_house: {
    name: "The Clam House Bar & Grill", city: "Palmetto", lat: 27.51768, lng: -82.56638,
    placeId: "ChIJpX2t2-AXw4gRsUxHGrnwBfM" },
  first_watch_lwr: {
    name: "First Watch", city: "Lakewood Ranch", lat: 27.43261, lng: -82.39576,
    placeId: "ChIJiV0dD305w4gRBa3PG1RT9x0" },
  breakfast_co: {
    // branch nearest Lakewood Ranch; a second Bradenton branch also exists
    name: "The Breakfast Company", city: "Lakewood Ranch", lat: 27.39087, lng: -82.45427,
    placeId: "ChIJU-JqYJo5w4gRTKYuKEM5uH0" },
  kekes: {
    name: "Keke's Breakfast Cafe", city: "Lakewood Ranch", lat: 27.43396, lng: -82.42557,
    placeId: "ChIJvdrqPr85w4gRA6C9TTnUdnY" },
  legacy_golf: {
    name: "Legacy Golf Club At Lakewood Ranch", city: "Lakewood Ranch", lat: 27.38811, lng: -82.41604,
    placeId: "ChIJWTZSFEs4w4gR8G07Qb7vdwk" },
  lwr_ymca: {
    name: "Lakewood Ranch YMCA", city: "Lakewood Ranch", lat: 27.44966, lng: -82.43389,
    placeId: "ChIJO1n8gdI7w4gR_BOt3UmR0Mg" },
  waterside_park: {
    name: "Waterside Park", city: "Lakewood Ranch", lat: 27.36429, lng: -82.41924,
    placeId: "ChIJ70rJA_w5w4gRrx0l1ukJBDc" },
  benderson: {
    name: "Nathan Benderson Park", city: "Sarasota", lat: 27.37424, lng: -82.45009,
    placeId: "ChIJczkDFL04w4gRwfowcSv8Tro" },
  polo: {
    name: "Sarasota Polo Club", city: "Sarasota", lat: 27.38019, lng: -82.40057,
    placeId: "ChIJNe66qjE4w4gRpHKbVHdNhbQ" },
  popstroke: {
    name: "PopStroke", city: "Sarasota", lat: 27.38154, lng: -82.45109,
    placeId: "ChIJATacWyI5w4gR-qfYvgyJnfk" },
  lwr_cinemas: {
    name: "Lakewood Ranch Cinemas", city: "Lakewood Ranch", lat: 27.39569, lng: -82.4345,
    placeId: "ChIJgVTe3wA5w4gRdOCwRQO35h0" },
  fish_hole: {
    name: "The Fish Hole at Lakewood Ranch", city: "Lakewood Ranch", lat: 27.39503, lng: -82.43413,
    placeId: "ChIJR5Tu5AA5w4gRWPVxWB-ZLww" },
  mote_sea: {
    // open to the public since 8 October 2025
    name: "Mote Science Education Aquarium (SEA)", city: "Sarasota", lat: 27.38048, lng: -82.4519,
    placeId: "ChIJRyOEfAo5w4gR664aD_YYBLU" },
  celery: {
    name: "Celery Fields", city: "Sarasota", lat: 27.32537, lng: -82.4336,
    placeId: "ChIJ7-I5X4tHw4gRAK6g4JEha7M" },
  siesta_beach: {
    name: "Siesta Key Beach", city: "Siesta Key", lat: 27.2636, lng: -82.55225,
    placeId: "ChIJRepzNwBBw4gRxfUTuzPlfaE" },
  lido_beach: {
    name: "Lido Beach", city: "Sarasota", lat: 27.31019, lng: -82.57606,
    placeId: "ChIJaW-sUB9rw4gRrQvxVM94nOY" },
  korean_ssam: {
    name: "Korean Ssam Bar", city: "Sarasota", lat: 27.33968, lng: -82.49886,
    placeId: "ChIJtwr9IIg_w4gRRY--pRQ2_7g" },
  linger_lodge: {
    name: "Linger Lodge Restaurant & Bar", city: "Bradenton", lat: 27.41238, lng: -82.44872,
    placeId: "ChIJ7e4ZhRQ5w4gRW7u641t5TI8" },
  cinebistro: {
    name: "CMX CineBistro Siesta Key", city: "Sarasota", lat: 27.30019, lng: -82.52939,
    placeId: "ChIJ3-wcgLJBw4gR9UGr_yLsHJY" },
  regatta: {
    name: "Safe Harbor Regatta Pointe", city: "Palmetto", lat: 27.51184, lng: -82.57563,
    placeId: "ChIJJbrLpsMXw4gR70RvYqSWNrM" },
  riverhouse: {
    name: "Riverhouse Waterfront Restaurant", city: "Palmetto", lat: 27.51004, lng: -82.57566,
    placeId: "ChIJFTFugcMXw4gRCyDgUVkK9CQ" },
  motorworks: {
    // HELD - closed for remodel since Aug 2026, reopening about 1 Feb 2027 under new ownership
    name: "Motorworks Brewing", city: "Bradenton", lat: 27.49066, lng: -82.57159,
    placeId: null },
  cortez_cultural: {
    // HELD - temporarily closed for rehabilitation of the 1912 schoolhouse
    name: "Florida Maritime Museum", city: "Cortez", lat: 27.46775, lng: -82.68078,
    placeId: null },
  img_golf: {
    // UNRESOLVED - open and operating, but no place_id in the index yet
    name: "IMG Academy Golf Club", city: "Bradenton", lat: null, lng: null,
    placeId: null },
  palmetto_riverside: {
    // UNRESOLVED - the Riverside Drive waterfront park, split into Riverside Park East and West. Not Sutton Park
    name: "Riverside Park", city: "Palmetto", lat: null, lng: null,
    placeId: null },
  lwr_farmers: {
    // UNRESOLVED - recurring Sunday market at Waterside Place, year-round. Needs event handling, not a place card
    name: "The Farmers Market at Lakewood Ranch", city: "Lakewood Ranch", lat: null, lng: null,
    placeId: null },
};

export const LOCAL_PICKS = [
  // ── Bradenton · afternoon ─────────────────────────
  { market: "bradenton", daypart: "afternoon", rank: 1, key: "bishop",
    why: "The strongest all-weather cultural attraction in the county." },
  { market: "bradenton", daypart: "afternoon", rank: 2, key: "riverwalk",
    why: "Splash area, playground, skate space and the riverfront." },
  { market: "bradenton", daypart: "afternoon", rank: 3, key: "village_arts",
    why: "Galleries, studios, cafes and shopping." },
  { market: "bradenton", daypart: "afternoon", rank: 4, key: "lecom",
    why: "Marauders baseball and ballpark atmosphere." },
  { market: "bradenton", daypart: "afternoon", rank: 5, key: "robinson",
    why: "Coastal paddling and the observation tower." },
  { market: "bradenton", daypart: "afternoon", rank: 6, key: "desoto",
    why: "History, exhibits and a waterfront setting." },
  { market: "bradenton", daypart: "afternoon", rank: 7, key: "cortez_cultural",
    why: "Maritime heritage in the heart of the fishing village." },
  { market: "bradenton", daypart: "afternoon", rank: 8, key: "cortez_beach",
    why: "A beach afternoon near food and island access." },
  { market: "bradenton", daypart: "afternoon", rank: 9, key: "utc_mall",
    why: "Air-conditioned shopping and dining." },
  { market: "bradenton", daypart: "afternoon", rank: 10, key: "treeumph",
    why: "Ziplining and a full ropes course." },
  { market: "bradenton", daypart: "afternoon", rank: 11, key: "t4_kartplex",
    why: "Go-karts for families and groups." },
  { market: "bradenton", daypart: "afternoon", rank: 12, key: "img_golf",
    why: "A golf outing or range time." },
  { market: "bradenton", daypart: "afternoon", rank: 13, key: "herrig",
    why: "Local art exhibitions and workshops in the new arts centre." },
  { market: "bradenton", daypart: "afternoon", rank: 14, key: "red_barn",
    why: "Browsing, snacks and local-market energy." },
  { market: "bradenton", daypart: "afternoon", rank: 15, key: "gt_bray",
    why: "Sports, playground, pickleball and recreation facilities." },
  // ── Bradenton · morning ───────────────────────────
  { market: "bradenton", daypart: "morning", rank: 1, key: "public_market",
    why: "Downtown market day - vendors, coffee, people-watching. Saturdays, October to May." },
  { market: "bradenton", daypart: "morning", rank: 2, key: "sage_biscuit",
    why: "The signature breakfast destination downtown." },
  { market: "bradenton", daypart: "morning", rank: 3, key: "robins",
    why: "Local breakfast in the downtown core." },
  { market: "bradenton", daypart: "morning", rank: 4, key: "riverwalk",
    why: "A waterfront start with playground and public-art stops." },
  { market: "bradenton", daypart: "morning", rank: 5, key: "bishop",
    why: "An early museum visit, aquarium and planetarium included." },
  { market: "bradenton", daypart: "morning", rank: 6, key: "village_arts",
    why: "Galleries, studios and colourful historic bungalows." },
  { market: "bradenton", daypart: "morning", rank: 7, key: "manatee_village",
    why: "Historic buildings and local heritage." },
  { market: "bradenton", daypart: "morning", rank: 8, key: "mixon",
    why: "A citrus-themed family stop." },
  { market: "bradenton", daypart: "morning", rank: 9, key: "star_fish",
    why: "The working-waterfront anchor of the historic Cortez fishing village." },
  { market: "bradenton", daypart: "morning", rank: 10, key: "coquina",
    why: "The beach before peak heat and peak parking pressure." },
  { market: "bradenton", daypart: "morning", rank: 11, key: "robinson",
    why: "Kayak launch, tower views and wildlife." },
  { market: "bradenton", daypart: "morning", rank: 12, key: "jiggs",
    why: "Fishing, paddling and an old-Florida setting." },
  { market: "bradenton", daypart: "morning", rank: 13, key: "granary",
    why: "Bakery-style coffee and a proper breakfast." },
  { market: "bradenton", daypart: "morning", rank: 14, key: "arte_caffe",
    why: "Espresso and an Italian bakery counter downtown." },
  { market: "bradenton", daypart: "morning", rank: 15, key: "lecom",
    why: "Game-day morning energy when the schedule is active." },
  // ── Bradenton · night ─────────────────────────────
  { market: "bradenton", daypart: "night", rank: 1, key: "pier22",
    why: "The polished riverfront dinner." },
  { market: "bradenton", daypart: "night", rank: 2, key: "motorworks",
    why: "Outdoor beer garden, food trucks and events." },
  { market: "bradenton", daypart: "night", rank: 3, key: "obricks",
    why: "Downtown drinks and pub food." },
  { market: "bradenton", daypart: "night", rank: 4, key: "oak_stone_bradenton",
    why: "Pizza, beer wall and a casual group setting." },
  { market: "bradenton", daypart: "night", rank: 5, key: "loaded_barrel",
    why: "A local bar-food night out." },
  { market: "bradenton", daypart: "night", rank: 6, key: "paddywagon",
    why: "The casual downtown pub option." },
  { market: "bradenton", daypart: "night", rank: 10, key: "manatee_pac",
    why: "Theatre, musicals, concerts and comedy when scheduled." },
  { market: "bradenton", daypart: "night", rank: 11, key: "amc",
    why: "The dependable movie option." },
  { market: "bradenton", daypart: "night", rank: 12, key: "woodys",
    why: "Waterfront dinner just up the river." },
  { market: "bradenton", daypart: "night", rank: 13, key: "amob_landside",
    why: "Casual seafood and a family dinner." },
  { market: "bradenton", daypart: "night", rank: 15, key: "clam_house",
    why: "Seafood dinner and local atmosphere across the bridge." },
  // ── Ellenton · afternoon ──────────────────────────
  { market: "ellenton", daypart: "afternoon", rank: 1, key: "outlets",
    why: "The primary shopping draw." },
  { market: "ellenton", daypart: "afternoon", rank: 2, key: "gamble",
    why: "The cultural attraction in town." },
  { market: "ellenton", daypart: "afternoon", rank: 3, key: "t4_kartplex",
    why: "Go-karts and family competition." },
  { market: "ellenton", daypart: "afternoon", rank: 4, key: "frm",
    why: "Museum and train activity." },
  { market: "ellenton", daypart: "afternoon", rank: 5, key: "bishop",
    why: "Indoor learning and manatee rehabilitation." },
  { market: "ellenton", daypart: "afternoon", rank: 6, key: "riverwalk",
    why: "A kid-friendly waterfront afternoon." },
  { market: "ellenton", daypart: "afternoon", rank: 7, key: "village_arts",
    why: "Studios, art and local shops." },
  { market: "ellenton", daypart: "afternoon", rank: 8, key: "manatee_village",
    why: "Preserved historic structures." },
  { market: "ellenton", daypart: "afternoon", rank: 9, key: "robinson",
    why: "Kayaks, wildlife and views." },
  { market: "ellenton", daypart: "afternoon", rank: 10, key: "emerson",
    why: "Coastal history and kayaking." },
  { market: "ellenton", daypart: "afternoon", rank: 11, key: "desoto",
    why: "A historic waterfront experience." },
  { market: "ellenton", daypart: "afternoon", rank: 12, key: "mixon",
    why: "Citrus, snacks and family appeal." },
  { market: "ellenton", daypart: "afternoon", rank: 13, key: "treeumph",
    why: "Ropes course and ziplines." },
  { market: "ellenton", daypart: "afternoon", rank: 14, key: "lecom",
    why: "A game-day attraction when active." },
  { market: "ellenton", daypart: "afternoon", rank: 15, key: "utc_mall",
    why: "The larger indoor shopping and dining outing." },
  // ── Ellenton · morning ────────────────────────────
  { market: "ellenton", daypart: "morning", rank: 1, key: "gamble",
    why: "The historic house and grounds, right here in town." },
  { market: "ellenton", daypart: "morning", rank: 2, key: "outlets",
    why: "Early shopping before the crowds." },
  { market: "ellenton", daypart: "morning", rank: 3, key: "amob_ellenton",
    why: "Waterfront brunch." },
  { market: "ellenton", daypart: "morning", rank: 4, key: "woodys",
    why: "A river setting that carries from brunch into lunch." },
  { market: "ellenton", daypart: "morning", rank: 5, key: "frm",
    why: "The family activity next door in Parrish." },
  { market: "ellenton", daypart: "morning", rank: 6, key: "palmetto_hist",
    why: "Regional heritage across the river." },
  { market: "ellenton", daypart: "morning", rank: 7, key: "palmetto_riverside",
    why: "A waterfront start on Riverside Drive." },
  { market: "ellenton", daypart: "morning", rank: 8, key: "riverwalk",
    why: "Riverfront, coffee and a play area nearby." },
  { market: "ellenton", daypart: "morning", rank: 9, key: "public_market",
    why: "The Saturday market experience, October to May." },
  { market: "ellenton", daypart: "morning", rank: 10, key: "sage_biscuit",
    why: "The strongest nearby breakfast." },
  { market: "ellenton", daypart: "morning", rank: 11, key: "robins",
    why: "Breakfast in downtown Bradenton." },
  { market: "ellenton", daypart: "morning", rank: 12, key: "mixon",
    why: "A citrus-themed family stop." },
  { market: "ellenton", daypart: "morning", rank: 13, key: "manatee_village",
    why: "The historical-village experience." },
  { market: "ellenton", daypart: "morning", rank: 14, key: "waterside",
    why: "Coffee and market-day browsing." },
  { market: "ellenton", daypart: "morning", rank: 15, key: "lwr_main",
    why: "Breakfast and boutique browsing." },
  // ── Ellenton · night ──────────────────────────────
  { market: "ellenton", daypart: "night", rank: 1, key: "woodys",
    why: "The top Ellenton waterfront night option." },
  { market: "ellenton", daypart: "night", rank: 2, key: "amob_ellenton",
    why: "Seafood dinner, water views, family fit." },
  { market: "ellenton", daypart: "night", rank: 3, key: "whiskey_joes",
    why: "Sunset drinks and dinner nearby." },
  { market: "ellenton", daypart: "night", rank: 4, key: "riverhouse",
    why: "The polished Palmetto dinner." },
  { market: "ellenton", daypart: "night", rank: 5, key: "clam_house",
    why: "Seafood and local atmosphere." },
  { market: "ellenton", daypart: "night", rank: 6, key: "pier22",
    why: "Bradenton riverfront dinner." },
  { market: "ellenton", daypart: "night", rank: 7, key: "motorworks",
    why: "Brewery patio and events." },
  { market: "ellenton", daypart: "night", rank: 8, key: "obricks",
    why: "Pub food and downtown atmosphere." },
  { market: "ellenton", daypart: "night", rank: 9, key: "oak_stone_bradenton",
    why: "Beer wall and pizza." },
  { market: "ellenton", daypart: "night", rank: 10, key: "loaded_barrel",
    why: "A casual night out." },
  { market: "ellenton", daypart: "night", rank: 11, key: "manatee_pac",
    why: "Plays and performances when scheduled." },
  { market: "ellenton", daypart: "night", rank: 12, key: "amc",
    why: "The reliable film option." },
  { market: "ellenton", daypart: "night", rank: 13, key: "grove",
    why: "Bowling, gaming and dinner." },
  { market: "ellenton", daypart: "night", rank: 14, key: "good_liquid",
    why: "A casual beer-and-bites outing." },
  // ── Lakewood Ranch · afternoon ────────────────────
  { market: "lakewood_ranch", daypart: "afternoon", rank: 1, key: "waterside",
    why: "Shops, food, mini golf, events and lakeside seating." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 2, key: "utc_mall",
    why: "Retail, restaurants and indoor flexibility." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 3, key: "lwr_main",
    why: "Boutique shopping and a casual lunch." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 4, key: "popstroke",
    why: "Mini golf, food and social play." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 6, key: "benderson",
    why: "Rowing events, waterfront views and recreation." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 7, key: "polo",
    why: "Polo-season matches and tailgating." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 8, key: "legacy_golf",
    why: "A golf afternoon." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 9, key: "lwr_cinemas",
    why: "The movie option on Main Street." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 10, key: "grove",
    why: "Bowling, arcade games and dining." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 11, key: "fish_hole",
    why: "A casual family activity right on Main Street." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 12, key: "mote_sea",
    why: "The indoor family attraction at Benderson, open since October 2025." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 14, key: "celery",
    why: "Birding and hilltop views for the interest-driven visitor." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 15, key: "siesta_beach",
    why: "Worth the drive, and labelled with the real distance." },
  { market: "lakewood_ranch", daypart: "afternoon", rank: 16, key: "lido_beach",
    why: "Worth the drive, and labelled with the real distance." },
  // ── Lakewood Ranch · morning ──────────────────────
  { market: "lakewood_ranch", daypart: "morning", rank: 1, key: "lwr_farmers",
    why: "The core Sunday morning draw at Waterside Place, year-round." },
  { market: "lakewood_ranch", daypart: "morning", rank: 2, key: "waterside",
    why: "Lakefront coffee, shops and outdoor seating." },
  { market: "lakewood_ranch", daypart: "morning", rank: 3, key: "lwr_main",
    why: "Breakfast, boutiques and people-watching." },
  { market: "lakewood_ranch", daypart: "morning", rank: 4, key: "granary",
    why: "Coffee and a proper breakfast on the Ranch." },
  { market: "lakewood_ranch", daypart: "morning", rank: 6, key: "first_watch_lwr",
    why: "Reliable brunch." },
  { market: "lakewood_ranch", daypart: "morning", rank: 7, key: "breakfast_co",
    why: "Substantial brunch and family-friendly seating." },
  { market: "lakewood_ranch", daypart: "morning", rank: 8, key: "kekes",
    why: "Pancakes, waffles and an easy family breakfast." },
  { market: "lakewood_ranch", daypart: "morning", rank: 9, key: "legacy_golf",
    why: "An early tee time." },
  { market: "lakewood_ranch", daypart: "morning", rank: 10, key: "lwr_ymca",
    why: "An active morning - pools and recreation." },
  { market: "lakewood_ranch", daypart: "morning", rank: 11, key: "waterside_park",
    why: "Lakefront play and a picnic setting." },
  { market: "lakewood_ranch", daypart: "morning", rank: 12, key: "utc_mall",
    why: "Early shopping and a cafe start." },
  { market: "lakewood_ranch", daypart: "morning", rank: 13, key: "benderson",
    why: "Rowing-lake views and regatta activity." },
  { market: "lakewood_ranch", daypart: "morning", rank: 14, key: "polo",
    why: "Morning matches and events in season." },
  { market: "lakewood_ranch", daypart: "morning", rank: 15, key: "popis_bradenton",
    why: "Dependable diner breakfast." },
  // ── Lakewood Ranch · night ────────────────────────
  { market: "lakewood_ranch", daypart: "night", rank: 1, key: "grove",
    why: "Dinner, bowling, games and a movie in one building." },
  { market: "lakewood_ranch", daypart: "night", rank: 2, key: "good_liquid",
    why: "Brewery, food and a relaxed gathering place." },
  { market: "lakewood_ranch", daypart: "night", rank: 3, key: "eds_tavern",
    why: "Casual drinks, sports and pub food." },
  { market: "lakewood_ranch", daypart: "night", rank: 4, key: "lwr_main",
    why: "The flexible date-night district." },
  { market: "lakewood_ranch", daypart: "night", rank: 5, key: "waterside",
    why: "Dinner plus lakefront atmosphere." },
  { market: "lakewood_ranch", daypart: "night", rank: 7, key: "korean_ssam",
    why: "Social, shareable dinner." },
  { market: "lakewood_ranch", daypart: "night", rank: 9, key: "linger_lodge",
    why: "A quirky Old Florida dinner worth the drive." },
  { market: "lakewood_ranch", daypart: "night", rank: 10, key: "oak_stone_utc",
    why: "Beer wall, pizza and casual groups." },
  { market: "lakewood_ranch", daypart: "night", rank: 11, key: "popstroke",
    why: "Evening mini golf and drinks." },
  { market: "lakewood_ranch", daypart: "night", rank: 13, key: "cinebistro",
    why: "The dinner-and-a-movie experience nearby." },
  { market: "lakewood_ranch", daypart: "night", rank: 14, key: "polo",
    why: "Special-event evenings only." },
  // ── Palmetto · afternoon ──────────────────────────
  { market: "palmetto", daypart: "afternoon", rank: 1, key: "emerson",
    why: "The premier nearby coastal-history and kayaking option." },
  { market: "palmetto", daypart: "afternoon", rank: 2, key: "palmetto_riverside",
    why: "Riverfront leisure and family time." },
  { market: "palmetto", daypart: "afternoon", rank: 3, key: "palmetto_hist",
    why: "A cultural stop that fits in an hour." },
  { market: "palmetto", daypart: "afternoon", rank: 4, key: "frm",
    why: "The major Parrish-area attraction." },
  { market: "palmetto", daypart: "afternoon", rank: 5, key: "gamble",
    why: "The historic house and its grounds." },
  { market: "palmetto", daypart: "afternoon", rank: 6, key: "outlets",
    why: "Shopping, and heat-friendly." },
  { market: "palmetto", daypart: "afternoon", rank: 7, key: "t4_kartplex",
    why: "Go-karting for groups and families." },
  { market: "palmetto", daypart: "afternoon", rank: 8, key: "bishop",
    why: "Aquarium, planetarium and manatees." },
  { market: "palmetto", daypart: "afternoon", rank: 9, key: "riverwalk",
    why: "Splash and play space on the waterfront." },
  { market: "palmetto", daypart: "afternoon", rank: 10, key: "village_arts",
    why: "Galleries and independent businesses." },
  { market: "palmetto", daypart: "afternoon", rank: 11, key: "robinson",
    why: "Paddling and the observation tower." },
  { market: "palmetto", daypart: "afternoon", rank: 12, key: "desoto",
    why: "History and a waterfront environment." },
  { market: "palmetto", daypart: "afternoon", rank: 13, key: "treeumph",
    why: "The higher-energy outing." },
  { market: "palmetto", daypart: "afternoon", rank: 14, key: "lecom",
    why: "Baseball during the season." },
  { market: "palmetto", daypart: "afternoon", rank: 15, key: "manatee_village",
    why: "Regional history and preserved structures." },
  // ── Palmetto · morning ────────────────────────────
  { market: "palmetto", daypart: "morning", rank: 1, key: "palmetto_hist",
    why: "Local history and preserved buildings." },
  { market: "palmetto", daypart: "morning", rank: 2, key: "regatta",
    why: "Coffee, boats and Manatee River views at the marina." },
  { market: "palmetto", daypart: "morning", rank: 3, key: "palmetto_riverside",
    why: "A waterfront morning on Riverside Drive." },
  { market: "palmetto", daypart: "morning", rank: 4, key: "emerson",
    why: "Bay views, cultural history and a paddling launch." },
  { market: "palmetto", daypart: "morning", rank: 5, key: "gamble",
    why: "A heritage stop just over in Ellenton." },
  { market: "palmetto", daypart: "morning", rank: 6, key: "frm",
    why: "An excursion, or a museum-style family outing." },
  { market: "palmetto", daypart: "morning", rank: 7, key: "detwilers_univ",
    why: "Produce, bakery and local food browsing." },
  { market: "palmetto", daypart: "morning", rank: 8, key: "amob_ellenton",
    why: "Breakfast and brunch by the water." },
  { market: "palmetto", daypart: "morning", rank: 9, key: "riverwalk",
    why: "An easy waterfront start across the bridge." },
  { market: "palmetto", daypart: "morning", rank: 10, key: "public_market",
    why: "Best on a Saturday, October to May." },
  { market: "palmetto", daypart: "morning", rank: 11, key: "sage_biscuit",
    why: "The local-favourite breakfast, minutes over the bridge." },
  { market: "palmetto", daypart: "morning", rank: 12, key: "robins",
    why: "Downtown breakfast worth the short bridge trip." },
  { market: "palmetto", daypart: "morning", rank: 13, key: "mixon",
    why: "Citrus and a family-friendly activity." },
  { market: "palmetto", daypart: "morning", rank: 14, key: "star_fish",
    why: "Working-waterfront culture and a dockside seafood market." },
  { market: "palmetto", daypart: "morning", rank: 15, key: "waterside",
    why: "Coffee, market days and people-watching." },
  // ── Palmetto · night ──────────────────────────────
  { market: "palmetto", daypart: "night", rank: 1, key: "riverhouse",
    why: "The top Palmetto waterfront dinner." },
  { market: "palmetto", daypart: "night", rank: 2, key: "clam_house",
    why: "A seafood-focused local dinner." },
  { market: "palmetto", daypart: "night", rank: 3, key: "whiskey_joes",
    why: "Waterside food, drinks and sunset." },
  { market: "palmetto", daypart: "night", rank: 4, key: "woodys",
    why: "Seafood, drinks and a river deck." },
  { market: "palmetto", daypart: "night", rank: 5, key: "amob_ellenton",
    why: "Family-friendly seafood dinner." },
  { market: "palmetto", daypart: "night", rank: 6, key: "pier22",
    why: "Elevated riverfront dinner just across the bridge." },
  { market: "palmetto", daypart: "night", rank: 7, key: "motorworks",
    why: "Beer garden and programming." },
  { market: "palmetto", daypart: "night", rank: 8, key: "obricks",
    why: "Downtown pub and a late dinner." },
  { market: "palmetto", daypart: "night", rank: 9, key: "oak_stone_bradenton",
    why: "Pizza and the beer wall." },
  { market: "palmetto", daypart: "night", rank: 10, key: "loaded_barrel",
    why: "A casual local night option." },
  { market: "palmetto", daypart: "night", rank: 11, key: "manatee_pac",
    why: "Theatre when scheduled." },
  { market: "palmetto", daypart: "night", rank: 12, key: "amc",
    why: "Movie night." },
  { market: "palmetto", daypart: "night", rank: 13, key: "grove",
    why: "Bowling, games and dinner." },
  { market: "palmetto", daypart: "night", rank: 14, key: "good_liquid",
    why: "A casual brewery outing." },
  // ── Parrish · afternoon ───────────────────────────
  { market: "parrish", daypart: "afternoon", rank: 1, key: "frm",
    why: "Museum exhibits, or a scheduled excursion if the timetable lines up." },
  { market: "parrish", daypart: "afternoon", rank: 2, key: "outlets",
    why: "The reliable shopping afternoon, and mostly out of the heat." },
  { market: "parrish", daypart: "afternoon", rank: 3, key: "t4_kartplex",
    why: "Go-karts and active family competition on the old Andersen circuit." },
  { market: "parrish", daypart: "afternoon", rank: 4, key: "manatee_village",
    why: "Preserved buildings and regional history in one walkable block." },
  { market: "parrish", daypart: "afternoon", rank: 5, key: "bishop",
    why: "Aquarium, planetarium and rescued manatees under one roof." },
  { market: "parrish", daypart: "afternoon", rank: 6, key: "riverwalk",
    why: "Riverfront attractions, playgrounds and shaded stops along the water." },
  { market: "parrish", daypart: "afternoon", rank: 7, key: "village_arts",
    why: "Colourful studios, galleries and independent shops." },
  { market: "parrish", daypart: "afternoon", rank: 8, key: "utc_mall",
    why: "Indoor shopping and dining when the afternoon turns hot." },
  { market: "parrish", daypart: "afternoon", rank: 9, key: "popis_bradenton",
    why: "Casual lunch with a local-diner feel." },
  { market: "parrish", daypart: "afternoon", rank: 10, key: "waterside",
    why: "Lunch, mini golf, shopping and lakefront activity in one stop." },
  { market: "parrish", daypart: "afternoon", rank: 11, key: "treeumph",
    why: "A climbing and zipline course that fills a whole afternoon." },
  { market: "parrish", daypart: "afternoon", rank: 12, key: "lecom",
    why: "Baseball when the schedule is active." },
  { market: "parrish", daypart: "afternoon", rank: 13, key: "mixon",
    why: "A Florida citrus experience that still works as a family stop." },
  { market: "parrish", daypart: "afternoon", rank: 14, key: "robinson",
    why: "Kayak, tower and coastal ecosystem, all in one preserve." },
  { market: "parrish", daypart: "afternoon", rank: 15, key: "emerson",
    why: "Waterfront history and bay views at the mouth of the river." },
  // ── Parrish · morning ─────────────────────────────
  { market: "parrish", daypart: "morning", rank: 1, key: "frm",
    why: "Heritage train rides and a family outing that starts the day with something memorable." },
  { market: "parrish", daypart: "morning", rank: 2, key: "gamble_creek",
    why: "Local produce and seasonal farm shopping, minutes from home." },
  { market: "parrish", daypart: "morning", rank: 4, key: "parrish_park",
    why: "Playground and a low-key morning reset before the day starts properly." },
  { market: "parrish", daypart: "morning", rank: 5, key: "fort_hamer",
    why: "River views and a quick outdoor start on the Manatee." },
  { market: "parrish", daypart: "morning", rank: 6, key: "jiggs",
    why: "Morning kayak launch and fishing access on old-Florida water." },
  { market: "parrish", daypart: "morning", rank: 7, key: "detwilers_univ",
    why: "Fresh food and local browsing worth the short drive down University." },
  { market: "parrish", daypart: "morning", rank: 8, key: "sage_biscuit",
    why: "The breakfast locals drive for, a short hop into Bradenton." },
  { market: "parrish", daypart: "morning", rank: 9, key: "robins",
    why: "Local breakfast in the middle of downtown Bradenton." },
  { market: "parrish", daypart: "morning", rank: 10, key: "amob_ellenton",
    why: "Waterfront brunch on the Manatee River without leaving the county." },
  { market: "parrish", daypart: "morning", rank: 11, key: "waterside",
    why: "Coffee, shops and lakefront air - the easy Lakewood Ranch morning." },
  { market: "parrish", daypart: "morning", rank: 12, key: "lwr_farmers",
    why: "Market-day browsing and breakfast vendors along the lakefront." },
  { market: "parrish", daypart: "morning", rank: 13, key: "lwr_main",
    why: "Coffee, boutiques and people-watching on Main Street." },
  { market: "parrish", daypart: "morning", rank: 14, key: "palmetto_hist",
    why: "Local history and a short cultural outing across the bridge." },
  { market: "parrish", daypart: "morning", rank: 15, key: "gamble",
    why: "A historic house and grounds you can walk in under an hour." },
  // ── Parrish · night ───────────────────────────────
  { market: "parrish", daypart: "night", rank: 1, key: "oak_stone_utc",
    why: "Craft beer wall and casual dinner at University Parkway." },
  { market: "parrish", daypart: "night", rank: 2, key: "whiskey_joes",
    why: "Waterfront dinner and sunset energy on the Manatee River." },
  { market: "parrish", daypart: "night", rank: 3, key: "pier22",
    why: "The polished riverfront dinner downtown." },
  { market: "parrish", daypart: "night", rank: 4, key: "motorworks",
    why: "Brewery patio and event programming." },
  { market: "parrish", daypart: "night", rank: 5, key: "obricks",
    why: "Pub food and downtown atmosphere." },
  { market: "parrish", daypart: "night", rank: 6, key: "loaded_barrel",
    why: "Local-casual drinks and food." },
  { market: "parrish", daypart: "night", rank: 7, key: "woodys",
    why: "Waterfront restaurant and tiki bar on the Manatee River." },
  { market: "parrish", daypart: "night", rank: 8, key: "amob_ellenton",
    why: "Seafood dinner by the water." },
  { market: "parrish", daypart: "night", rank: 9, key: "grove",
    why: "Dining and an entertainment centre in the same building." },
  { market: "parrish", daypart: "night", rank: 10, key: "eds_tavern",
    why: "The local pub option on Main Street." },
  { market: "parrish", daypart: "night", rank: 11, key: "good_liquid",
    why: "Beer, bites and a relaxed night out." },
  { market: "parrish", daypart: "night", rank: 12, key: "lwr_main",
    why: "Dinner and a stroll - the Lakewood Ranch date-night zone." },
  { market: "parrish", daypart: "night", rank: 13, key: "waterside",
    why: "Restaurants and lakefront atmosphere after dark." },
  { market: "parrish", daypart: "night", rank: 14, key: "amc",
    why: "The movie-night fallback." },
  { market: "parrish", daypart: "night", rank: 15, key: "manatee_pac",
    why: "Theatre when a performance is scheduled." },
];

/** The ONE rail these picks feed (owner, 2026-08-22, on a screenshot of the
 *  tile: "Its for this card btw"). Not a spread across ten rails — this card
 *  and only this card. Every other rail's composition is untouched by the
 *  registry, and scripts/check-local-picks.mjs asserts that in both
 *  directions. */
export const LOCAL_PICK_RAIL = "today";

/** How near the reader must be to a market's centre for that board to apply.
 *  Parrish↔Bradenton is ~11mi and Lakewood Ranch↔Bradenton ~13mi, so 12 lets
 *  neighbouring towns share a board without letting Sarasota inherit
 *  Parrish's. Same spirit as the beach rule: near means near. */
export const LOCAL_PICK_MARKET_MI = 12;

/** The furthest a pick may sit from the READER and still enter the pool.
 *  Matched to WIDEN_RADIUS_MI (lib/todaysBest.js) so the board and the rail's
 *  own near/widen gate agree — building a row the rail is about to discard
 *  just makes a Place Details call nobody sees. Measured: every pick in batch
 *  1 sits within 17.5mi of its own market centre, so nothing is lost. */
export const LOCAL_PICK_REACH_MI = 25;

/** The owner files picks under three dayparts. lib/dayparts.js renders FOUR
 *  bands, because "what should we eat" and "what should we do with the rest of
 *  the day" order the rail differently — so his afternoon covers both lunch
 *  and afternoon. This is the whole mapping, and it is what makes the hour
 *  MEAN something on this card: at 8am the reader is shown the morning board,
 *  at 8pm the night board, and never the other two. */
export const BAND_TO_PICK_DAYPART = {
  morning: "morning",
  lunch: "afternoon",
  afternoon: "afternoon",
  night: "night",
};
export const LOCAL_PICK_DAYPARTS = ["morning", "afternoon", "night"];

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
function miBetween(aLat, aLng, bLat, bLng) {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

/** A venue with its resolver sidecar applied. The sidecar only ever FILLS a
 *  missing id — it never overrides one already committed here. */
export function localPickVenue(key) {
  const v = LOCAL_PICK_VENUES[key];
  if (!v) return null;
  const placeId = v.placeId || (LOCAL_PICK_IDS && LOCAL_PICK_IDS[key]) || null;
  return { ...v, key, placeId };
}

/** Every placement joined to its venue; unresolved ones dropped. Fail-closed:
 *  no place_id means no card, not a guess. */
export function localPickEntries() {
  const out = [];
  for (const p of LOCAL_PICKS) {
    const v = localPickVenue(p.key);
    if (!v || !v.placeId) continue;
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) continue;
    out.push({ ...p, venue: v });
  }
  return out;
}

/**
 * The board that applies to a reader's point: the NEAREST market, and only
 * that one, when the reader is inside LOCAL_PICK_MARKET_MI of it.
 *
 * ONE TOWN, ONE BOARD. Every centroid in this registry sits within about 11
 * miles of every other — Parrish to Ellenton is 6.6, Bradenton to Palmetto is
 * 2.6 — so a radius wide enough to cover a town also swallows its neighbours,
 * and a Parrish reader would be served all five boards merged. That is a
 * directory again, which is the exact thing the owner asked this not to be.
 * Empty when the reader is outside every market: batch 1 covers five towns,
 * not the state, and a reader in Tampa gets the organic rail.
 */
export function localPickMarketsNear(origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const ranked = Object.entries(LOCAL_PICK_MARKETS)
    .map(([id, m]) => ({ id, ...m, mi: miBetween(origin.lat, origin.lng, m.lat, m.lng) }))
    .sort((a, b) => a.mi - b.mi);
  return ranked.length && ranked[0].mi <= LOCAL_PICK_MARKET_MI ? [ranked[0]] : [];
}

/**
 * The board for a reader AND an hour — the two gates that make this card
 * "handpicked, ranked and ready for right now" instead of a directory.
 *
 * @param {{lat:number,lng:number}} origin the reader's own point
 * @param {string} band a lib/dayparts.js band id (morning|lunch|afternoon|night).
 *   Omitted → every daypart, which is the shape the guards and the resolver
 *   want and NOT the shape the rail is served from.
 */
export function localPickEntriesNear(origin, band) {
  const near = localPickMarketsNear(origin);
  if (!near.length) return [];
  const market = near[0].id;
  const daypart = band == null ? null : BAND_TO_PICK_DAYPART[band];
  if (band != null && !daypart) return [];        // unknown band → empty, never "all"
  const seen = new Set();
  const out = [];
  for (const e of localPickEntries()) {
    if (e.market !== market) continue;
    if (daypart && e.daypart !== daypart) continue;
    if (miBetween(origin.lat, origin.lng, e.venue.lat, e.venue.lng) > LOCAL_PICK_REACH_MI) continue;
    if (seen.has(e.venue.placeId)) continue;      // a venue filed twice in one board cards once
    seen.add(e.venue.placeId);
    out.push(e);
  }
  return out;
}

let _seedIds = null;
/** Place IDs the owner handpicked. Membership only — never a score. */
export function localPickIds() {
  if (!_seedIds) _seedIds = new Set(localPickEntries().map((e) => e.venue.placeId));
  return _seedIds;
}

/** Venues still waiting on the resolver. Reported by the guard so a pending
 *  entry is visible instead of quietly serving nothing forever. */
export function localPickPending() {
  return Object.keys(LOCAL_PICK_VENUES).filter((k) => !localPickVenue(k).placeId);
}
