// lib/summerPlaceIds.js — resolver SIDECAR for lib/summerUniverse.js.
//
// Maps SUMMER_UNIVERSE entry keys -> Google place IDs for the entries that
// shipped with venue.placeId:null (their ids were not in the permanent
// wf_place_ids index on 2026-08-18). WRITTEN BY MACHINE: run
//
//   node scripts/resolve-summer-place-ids.mjs
//
// with GOOGLE_MAPS_SERVER_KEY set — it searchTexts each unresolved venue,
// verifies the result is the right venue (name similarity + within 30 miles
// of the registry's own coordinates, fail-closed), and rewrites this file.
// Place IDs are permanently cacheable under the Google ToS, so committing
// them is allowed and correct. Until an entry appears here it simply does not
// serve — never guessed into a card.
//
// 2026-08-18: first 19 IDs from wf_place_ids (exact-name + distance). Then
// the remaining 23 unresolved venues were filled by Places searchText:
// name-root + <=30mi of the registry coordinates, fail-closed. 0 misses.
// This file holds place IDs only.
export const SUMMER_PLACE_IDS = {
  st_armands_circle: "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8",
  lido_beach: "ChIJW6xBqPJqw4gRkZ0ywCfa94I",
  ami_coquina: "ChIJzzGPjSkRw4gRfecn6X09ufk",
  ami_sandbar: "ChIJ_dUxZ-APw4gRPqkNKZjuYxg",
  venice_beach: "ChIJpY1xybu6woARL9_iGplujMI",
  pier_60: "ChIJG_fsz9b2wogRiW9DrnVgZ8Q",
  universal_orlando: "ChIJvRBCrN9-54gRGZuuaCLGrQE",
  disney_springs: "ChIJ-0qgNoF_3YgRg3Lh7xHDooU",
  hogwarts_universal: "ChIJPYAZtR9_54gR15yvE8YK9QU",
  wakulla_springs: "ChIJny8VYW-I7IgRDri7905NC2o",
  florida_caverns: "ChIJYWAVz2HfkogR1C_ap5AI570",
  miami_beach_evening: "ChIJ--RbNpK02YgRuBwrQraWUZQ",
  fairchild_garden: "ChIJu_e4BnTI2YgREAOg3GxMK8g",
  fruit_spice_park: "ChIJM6cv59Pn2YgRdXaKYZKWWms",
  pensacola_beach: "ChIJ86kIPeDFkIgRdsrbssu0Jwk",
  summer_fruit_fest: "ChIJM6cv59Pn2YgRdXaKYZKWWms",
  mango_festival: "ChIJu_e4BnTI2YgREAOg3GxMK8g",
  sarasota_music_fest: "ChIJew4bcA9Aw4gR3bU-SA7qAgU",
  orlando_seafood_fest: "ChIJcQyYH85654gRPh6gV_UpsDY",
  bk_adventure_bio: "ChIJNV0Tdv5654gRRCM0P3vkMo4",
  kelly_park_tubing: "ChIJw5hmHut154gRI1LE7BjQiEg",
  ginnie_springs: "ChIJo1lbzETO6IgRX4KI-Zi8fc4",
  devils_den: "ChIJQ_mWlR2S6IgR9iXXyzVZkdY",
  dry_tortugas: "ChIJV_YGBNFVzogRoR0zV_0OsVs",
  ding_darling: "ChIJS7NZPXEx24gROKOrF8ols0w",
  loggerhead_center: "ChIJydB_C0wq34gRxC9m-bp4pSs",
  venice_downtown: "ChIJ6f2bM71bw4gRm0YJYqc4FMY",
  ft_myers_music_walk: "ChIJxQh1CuNB24gRy6jB0Nwo2as",
  tigertail_marco: "ChIJ28LTIB3v2ogRUiWmd2oH2MU",
  captiva_mucky_duck: "ChIJQXuFIOg024gRusADjWHhRIg",
  apalachicola_waterfront: "ChIJ8W-pgKe1lIgRKuK-2EjZsO0",
  versailles_little_havana: "ChIJt9yvFgu32YgRrk-vKGEQB6g",
  mallory_square: "ChIJwYxPGfu30YgRBuPGwZRZp-g",
  el_siboney: "ChIJxw-J5MS20YgRD1sUx45uC7k",
  robbies_islamorada: "ChIJ960sQ9k514gRzJnHxYzRgW8",
  marathon_waterfront: "ChIJQYkdRiba0IgRqUnb3B7oxu0",
  turtle_archie_carr: "ChIJyQ7UrCdr3ogRiy_YkEsIvzE",
  kw_lobsterfest: "ChIJ-61h3uq20YgRrPFtCkair2E",
  key_lime_festival: "ChIJ-61h3uq20YgRrPFtCkair2E",
  hemingway_days: "ChIJbbo4A-i20YgR6klffX8jpBM",
  goombay: "ChIJSeldnOi32YgR2eJbcYG2F4A",
  supercon: "ChIJH-Mtg4O02YgRk_YbakHl9OY"
};
