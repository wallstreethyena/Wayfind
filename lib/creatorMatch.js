// lib/creatorMatch.js — the two identity rules BOTH creator resolvers share
// (lib/creatorVideos.js creatorVideosFor and lib/creatorSignals.js's lean
// mirror), so the full and eager resolvers cannot drift apart.
//
// 2026-10-01 (owner: "FIX EVERYTHING"; the Ryan finding). The name+city
// fallback matched a curated root anywhere in a place's name: "Ryan" handed
// Ryan's Coffee House's video — and its +0.2 Wayfind Score bonus — to any
// Parrish place whose name merely began with "Ryan", and even mid-word
// ("Bryant"). Two rules close it:
//   1. A Google place id IS the venue. When the curated entry names its exact
//      Google id and the candidate carries a DIFFERENT Google id, the
//      candidate is provably another business; the name may not override that.
//   2. A name root matches on WORD boundaries only.

/** A Google Places id (ChIJ…, or the longer Gh…/Ei… forms). Other providers' rows carry prefixed ids (fsq:, osm:, ridb:, nps:). */
export function isGooglePlaceId(id) {
  return /^(ChIJ|GhIJ|Ei|EhI)[A-Za-z0-9_-]{10,}$/.test(String(id || ""));
}

/** True when this curated entry may be matched to the candidate by NAME at all. */
export function nameFallbackAllowed(entryPlaceId, candidateId) {
  if (!entryPlaceId) return true;
  return !isGooglePlaceId(candidateId) || String(entryPlaceId) === String(candidateId);
}

/** Index of `word` inside normalized `hay` at word boundaries only, else -1. */
export function indexOfWord(hay, word) {
  if (!hay || !word) return -1;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(word, from);
    if (at < 0) return -1;
    const end = at + word.length;
    if ((at === 0 || hay[at - 1] === " ") && (end === hay.length || hay[end] === " ")) return at;
    from = at + 1;
  }
}
