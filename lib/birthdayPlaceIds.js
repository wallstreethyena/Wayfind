// lib/birthdayPlaceIds.js — resolver SIDECAR for lib/birthdayUniverse.js.
// Same contract as lib/summerPlaceIds.js: WRITTEN BY MACHINE — run
//
//   node scripts/resolve-birthday-place-ids.mjs
//
// with GOOGLE_MAPS_SERVER_KEY set (fail-closed geo+name matching; a miss
// writes nothing and the entry keeps not serving). Place IDs are permanently
// cacheable under the Google ToS, so committing them is allowed and correct.
export const BIRTHDAY_PLACE_IDS = {};
