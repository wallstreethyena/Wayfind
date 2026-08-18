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
export const SUMMER_PLACE_IDS = {};
