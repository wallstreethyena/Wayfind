// Confirmed on 2026-10-19, and deliberately NOT imported by the Fall or
// Christmas routes. Each venue is an exact place_id. None of them has a stored
// photo in wf_inventory, so serving them would put /api/photo on a card that
// cannot show that venue's own picture. Do not point any of these at a
// different city's row.
//
// They render only after both of these are true:
//   1. The place is in wf_inventory. scripts/data/seasonal-live-area-places-2026-10-19.sql
//      inserts Coachman Park and Clearwater Marine Aquarium. Benchmark
//      International Arena and Seminole Heights United Methodist Church are
//      already there. The SQL does not invent a photo_ref.
//   2. A stored photo exists for that place_id, and a later change spreads this
//      array into the serving registry. The Commons backfill
//      (node scripts/backfill-place-photos.mjs) does not take a place_id and
//      must not be run against production from this change.

export const SEASONAL_LIVE_AREA_PENDING_2026_10_19 = Object.freeze([
  {
    event_id: "coachman-park-holiday-arts-festival-2026",
    season: "fall",
    rail: "festivals",
    event_name: "Holiday Arts, Crafts and Food Festival 2026",
    city: "Clearwater",
    venue: "Coachman Park",
    place_id: "ChIJ9_6n_N7wwogR0_89wCluWV0",
    lat: 27.96560,
    lng: -82.80233,
    start_date: "2026-11-06",
    end_date: "2026-11-08",
    official_url: "https://www.eventbrite.com/e/holiday-artscrafts-and-food-festival-2026-tickets-2002860023245",
    checked: "2026-10-19",
    blocked_by: "Coachman Park is in wf_place_ids and not in wf_inventory, and it has no stored photo. The splash pad row is a different place.",
  },
  {
    event_id: "benchmark-for-king-country-drummer-boy-2026",
    season: "christmas",
    rail: "shows-outings",
    event_name: "for KING + COUNTRY A Drummer Boy Christmas",
    city: "Tampa",
    venue: "Benchmark International Arena",
    place_id: "ChIJSV2_Mo3EwogRc8CZwwOroSs",
    lat: 27.94274,
    lng: -82.45178,
    start_date: "2026-11-29",
    end_date: "2026-11-29",
    official_url: "https://www.benchmarkintlarena.com/release-for-king-country-brings-a-drummer-boy-christmas-tour-to-tampa/",
    checked: "2026-10-19",
    blocked_by: "Arena row is operational and has no photo_ref. Show time was not on the July 20, 2026 release.",
  },
  {
    event_id: "benchmark-tso-ghosts-of-christmas-eve-2026",
    season: "christmas",
    rail: "shows-outings",
    event_name: "Trans-Siberian Orchestra The Ghosts of Christmas Eve",
    city: "Tampa",
    venue: "Benchmark International Arena",
    place_id: "ChIJSV2_Mo3EwogRc8CZwwOroSs",
    lat: 27.94274,
    lng: -82.45178,
    start_date: "2026-12-20",
    end_date: "2026-12-20",
    official_url: "https://www.benchmarkintlarena.com/event/trans-siberian-orchestra-26/",
    checked: "2026-10-19",
    blocked_by: "Same arena row, no stored photo. Two show times that day, 3:00 PM and 7:30 PM.",
  },
  {
    event_id: "seminole-heights-candlelight-carols-2026",
    season: "christmas",
    rail: "shows-outings",
    event_name: "Candlelight Christmas Carols on Strings",
    city: "Tampa",
    venue: "Seminole Heights United Methodist Church",
    place_id: "ChIJY8ox6qHGwogRuVDBPjx0laE",
    lat: 28.00297,
    lng: -82.45460,
    start_date: "2026-12-18",
    end_date: "2026-12-18",
    official_url: "https://feverup.com/m/657462",
    checked: "2026-10-19",
    blocked_by: "Church row is operational and has no photo_ref. December 19 is a different church and is not this card.",
  },
  {
    event_id: "clearwater-marine-aquarium-candlelight-2026",
    season: "christmas",
    rail: "shows-outings",
    event_name: "Candlelight Christmas Carols on Strings",
    city: "Clearwater",
    venue: "Clearwater Marine Aquarium",
    place_id: "ChIJiZrtZSvxwogRE9eu4Xpy9Yc",
    lat: 27.97693,
    lng: -82.81770,
    start_date: "2026-12-19",
    end_date: "2026-12-19",
    official_url: "https://feverup.com/m/404284",
    checked: "2026-10-19",
    blocked_by: "Aquarium place_id is in wf_place_ids and not in wf_inventory, and it has no stored photo.",
  },
]);
