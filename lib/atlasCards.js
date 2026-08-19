// lib/atlasCards.js — the owner's publish-ready Atlas-590 editorial cards.
//
// Atlas is the cached place set in data/atlas (590 rows joining wf_inventory
// by place_id). Purpose: place editorial on those places. The writeup standard
// is docs/editorial-standard.md (atlas-590-v1) / docs/WAYFIND_CARD_STANDARD.md.
//
// data/atlas/editorial-cards.json holds the PUBLISH-READY CANDIDATE cards
// (scripts/ingest-atlas-editorial.mjs). /api/editorial already served them on
// the detail sheet. /api/known-for — the rail take — did not, so Siesta and
// Lido rendered empty while the same place_ids had full researched cards.
//
// This module is the ONE mapping both routes use. Pure: no fetches, no env.
// Nothing here generates copy. A place with no card returns nothing.

import { knownForLine } from "./knownFor.js";

const un = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Map an Atlas card into the editorial shape the Detail "Wayfind take" block
// consumes. `move` is omitted — Atlas cards carry Insider Move instead.
export function cardToEditorial(c) {
  if (!c) return null;
  return {
    name: c.name,
    vibe: un(c.vibeCheck), why: un(c.whyGo), knownFor: un(c.knownFor), bestFor: un(c.bestFor),
    foodMove: un(c.foodMove), drinkMove: un(c.drinkMove), insiderMove: un(c.insiderMove),
    proMove: un(c.proMove),
    story: un(c.verifiedStory), proof: un(c.powerhouseProof), goodToKnow: un(c.currentUsefulDetail),
    funFact: un(c.funFact), watchOut: un(c.watchOut),
  };
}

// Same shape knownForLine() already composes for a wf_editorial row, so Atlas
// and fleet copy compress through ONE function.
export function atlasAsRow(c) {
  if (!c) return null;
  return {
    place_id: c.placeId,
    hook: un(c.knownFor),
    why_here: un(c.whyGo),
    local_tip: un(c.insiderMove),
    issues: null,
    verified: true,
  };
}

// Same-place IDs from data/atlas/review-same-place.tsv. Google / the rail may
// return either id for one beach; only one of them has a publish-ready card.
// Alias → the id that holds the card. Never invents a second writeup.
export const ATLAS_PLACE_ALIASES = {
  "ChIJPbX5AxsTw4gROkfgzEmV-5M": "ChIJzzGPjSkRw4gRfecn6X09ufk", // Coquina Beach
  "ChIJp6kyPa1Dw4gR5BhsSYE8pdo": "ChIJ9RsHDcVDw4gRg3ftHUNMwco", // Turtle Beach
  "ChIJmy-zP61Dw4gR3lJSoG7CBZE": "ChIJ9RsHDcVDw4gRg3ftHUNMwco",
  "ChIJ_SArr7sRw4gRHxAqkNcKTX4": "ChIJ4azy4NsTw4gRggI1e2ak_Rs", // Coquina Beach Cafe
  "ChIJaWeoBbURw4gRDYfwKuwOVW0": "ChIJh6_HnNcRw4gR2SpbLik_gEk", // Holmes Beach pin → Manatee Public Beach
  "ChIJSwkmjpkRw4gRSkHtkHlTv_U": "ChIJJWCbj5kRw4gRYkZ7QJ-L91s", // Kokonut Hut → Gulf Drive Cafe
  "ChIJvYtWPXtbw4gRsWlOnut5anE": "ChIJvYtWPXtbw4gR4vWll6xKQCM", // Pop's nightlife pin → food-batch Pop's / Driftage (#807)
};

export function resolveAtlasId(id) {
  return ATLAS_PLACE_ALIASES[id] || id;
}

export function indexAtlasCards(cards) {
  const map = new Map();
  for (const c of Array.isArray(cards) ? cards : []) {
    if (c && c.placeId) map.set(c.placeId, c);
  }
  return map;
}

export function atlasCardFor(index, placeId) {
  if (!index || !placeId) return null;
  return index.get(placeId) || index.get(resolveAtlasId(placeId)) || null;
}

/** place_id (as requested) -> known-for line, skipping every id with no card. */
export function atlasLinesFor(cards, ids) {
  const index = indexAtlasCards(cards);
  const out = {};
  for (const id of Array.isArray(ids) ? ids : []) {
    const line = knownForLine(atlasAsRow(atlasCardFor(index, id)));
    if (line) out[id] = line;
  }
  return out;
}

export function parseAtlas590(tsv) {
  const rows = [];
  for (const line of String(tsv || "").split(/\r?\n/)) {
    if (!line || line.startsWith("category\t")) continue;
    const parts = line.split("\t");
    if (parts.length < 4) continue;
    const place_id = String(parts[3] || "").trim();
    if (!place_id) continue;
    rows.push({
      category: String(parts[0] || "").trim(),
      name: String(parts[1] || "").trim(),
      address: String(parts[2] || "").trim(),
      place_id,
    });
  }
  return rows;
}

// Atlas-590 place_ids that have no publish-ready editorial card. Covered if
// the id itself has a card, or it aliases to one. Does not invent copy.
export function missingAtlasEditorial(atlas590, cards) {
  const have = new Set();
  for (const c of Array.isArray(cards) ? cards : []) {
    if (c && c.placeId) have.add(c.placeId);
  }
  for (const [alias, canon] of Object.entries(ATLAS_PLACE_ALIASES)) {
    if (have.has(canon)) have.add(alias);
  }
  return (Array.isArray(atlas590) ? atlas590 : []).filter((r) => r && r.place_id && !have.has(r.place_id));
}
