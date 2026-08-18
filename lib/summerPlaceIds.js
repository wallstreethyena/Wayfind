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
// 2026-08-18: GOOGLE_MAPS_SERVER_KEY is a Vercel placeholder on this Mac, so
// searchText could not run. IDs below were matched from wf_place_ids (the
// same permanent index the original 51 came from) with an exact-name +
// distance check. Loose token matches (Epic Universe for Universal Studios,
// a burger for Pensacola Beach, Lion King for Festival Park) were refused.
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
  orlando_seafood_fest: "ChIJcQyYH85654gRPh6gV_UpsDY"
};
