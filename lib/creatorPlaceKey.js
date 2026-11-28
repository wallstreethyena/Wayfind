// lib/creatorPlaceKey.js — the short lookup key the EAGER creator mirror
// (lib/creatorSignalsData.generated.js) stores in place of a full place id.
//
// WHY (2026-11-28). Every curated creator entry ships to every homepage
// visitor inside LEAN_CURATED, and its 27-character Google place id is the
// one field gzip cannot shrink: a place id is ~20 bytes of pure entropy, so
// ~500 of them were ~10KB of the homepage's first-load JS. The eager readers
// (lib/creatorBoost.js, lib/trendSignal.js, CreatorCardMark) never show the
// id; they only ask "is this card's id one of the curated ones?". A 64-bit
// key answers that question exactly as well: with a few thousand curated ids
// against tens of thousands of indexed places, the chance of any accidental
// match is about one in a billion, and scripts/check-creator-place-key.mjs
// fails the build if two distinct curated ids ever share a key.
//
// The FULL registry (lib/creatorVideos.js) keeps the real ids; only the lean
// mirror is keyed. scripts/gen-creator-signals.mjs and lib/creatorSignals.js
// both import THIS function, so the writer and the reader cannot disagree.

/** Two independent 32-bit FNV-style hashes of the id, base36, joined by ".". */
export function creatorPlaceKey(id) {
  const s = String(id);
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return (a >>> 0).toString(36) + "." + (b >>> 0).toString(36);
}
