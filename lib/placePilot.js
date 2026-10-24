// lib/placePilot.js — the bounded /places practical-value pilot cohort.
//
// Live audit 2026-10-24 (8 sampled sitemap pages, browser UA): every sampled
// /places page is one researched paragraph + hours + nearby names. The Atlas
// cards behind 464 of those pages already hold verified `bestFor` ("who it
// suits") and `watchOut` ("good to know" logistics/cautions) copy that
// mergePlacePage never surfaced. This pilot renders those two fields for
// ONLY the ten places below — each hand-checked to carry a complete,
// visitor-safe bestFor + watchOut on its publish-ready card — so the gain
// can be measured before any wider rollout. Every other page is byte-for-
// byte unchanged (mergePlacePage returns null for both fields off-cohort).
//
// Deliberately NOT rendered: card `insiderMove`. Several cohort cards carry
// internal research instructions in that field ("Do not treat …", "stay off
// the rail", "this pass"), so it is not visitor-safe raw copy. It stays off
// the page until an editorial pass cleans it; wf_editorial `local_tip`
// remains the only "Local tip" source.
//
// Pure: no fetches, no env, no fs — same testability contract as
// lib/placeEligibility.js.

export const PLACE_PILOT_IDS = new Set([
  "ChIJlXJqE9k_w4gRySJ2BPEXcR0", // Asolo Repertory Theatre — attractions (Sarasota)
  "ChIJpXGK53VC24gRWMneFVtK6hY", // Ca' d'Zan — museum (Sarasota)
  "ChIJRVIh8swTw4gRd4IN3N4R8vw", // Beer Can Island — beaches (Longboat Key)
  "ChIJ1-Da3XpZw4gRyPAkVf4SSAo", // Caspersen Beach Park — beaches (Venice)
  "ChIJ7QsLgxQ5w4gRSLtMON-sOaI", // Agave Bandido — food (Lakewood Ranch)
  "ChIJ4azy4NsTw4gRggI1e2ak_Rs", // Coquina Beach Cafe — food (Anna Maria Island)
  "ChIJn_4zMBJAw4gRnyPviItiNRs", // Art Ovation Hotel — hotels (Sarasota)
  "ChIJr1xnGG1Aw4gRgQvFL3emTcI", // 1592 Wood Fired Kitchen & Cocktails — nightlife (Sarasota)
  "ChIJVTHzC7QRw4gRTqoG4Rljw6s", // Alvin's Island — shopping (Holmes Beach)
  "ChIJ08zZpRpBw4gRiDJBlBXfAHw", // Bee Ridge Park — attractions (Sarasota)
]);

/** True when this page is in the pilot — by the requested id, or by the
 *  canonical card id an alias resolved to (atlas.placeId). */
export function isPlacePilot(id, atlasPlaceId) {
  return PLACE_PILOT_IDS.has(id) || (!!atlasPlaceId && PLACE_PILOT_IDS.has(atlasPlaceId));
}
