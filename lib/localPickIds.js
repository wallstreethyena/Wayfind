// lib/localPickIds.js — resolver SIDECAR for lib/localPicks.js.
// Same contract as lib/summerPlaceIds.js and lib/birthdayPlaceIds.js:
// WRITTEN BY MACHINE — run
//
//   node scripts/resolve-local-pick-ids.mjs
//
// with GOOGLE_MAPS_SERVER_KEY set (fail-closed geo+name matching; a miss
// writes nothing and the venue keeps not serving). Place IDs are permanently
// cacheable under the Google ToS, so committing them is allowed and correct.
//
// Pending on 2026-08-22, and why each is still open:
//   img_golf            open and operating, simply not in the index yet
//   palmetto_riverside  the Riverside Drive waterfront park, split by the City
//                       of Palmetto into Riverside Park East and West — the
//                       owner must say which one the card means. NOT Sutton
//                       Park, which is a different, inland park
//   lwr_farmers         a recurring Sunday market at Waterside Place, not a
//                       venue with its own hours
//   motorworks          closed for remodel since August 2026, reopening about
//                       1 February 2027 under new ownership. Deliberately
//                       held: a card for a shut brewery is a broken promise,
//                       and the registry entry is what makes it come back by
//                       itself once the id is filled
//   cortez_cultural     Florida Maritime Museum, temporarily closed for
//                       rehabilitation of the 1912 schoolhouse
export const LOCAL_PICK_IDS = {};
