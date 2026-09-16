// lib/curatedLibrary.js — the curated tiles' owned-library contract.
//
// 2026-09-15 incident: "Best things to do today" (and Top 10 Experiences /
// Food / Nightlife / Shopping) rendered "Not enough data for this filter" the
// morning September's free Google text_pro ledger hit 4800/4800. The server
// had 40 owned attractions within 25 miles of Parrish and a working
// inventory fallback (/api/places/search -> serveFromInventory) — but each
// tile's slot searches went out with no category, so the fallback never ran.
//
// Two pure pieces, kept out of app/home.js so a guard can execute them:
//
//   INV_CAT_FOR_TILE  the wf_inventory category each tile stands in for. The
//                     server reads `cat` ONLY on the no-Google path (gate shut,
//                     free budget spent, 429); it is never part of the paid
//                     request or its cache key, so this adds zero spend.
//
//   sameIdSet(lists)  true when every slot came back as the same id set — the
//                     shape of an inventory answer (one category, one point,
//                     one radius). The tile then renders ONE merit-ranked list
//                     with no slot headers, because printing "Theme parks"
//                     over rows that never matched that query breaks the v4.61
//                     rule that a slot label is a promise.

import { isOuting } from "./outing.js";

export const INV_CAT_FOR_TILE = Object.freeze({
  today: "attractions",
  experiences: "attractions",
  food: "food",
  nightlife: "nightlife",
  shopping: "shopping",
  stays: "hotels",
  // bestof spans food + attractions + shopping; it keeps the live-only path.
});

// 2026-09-16 — WHAT, NOT HOW GOOD. Live check the day the library fallback
// shipped: "Best things to do today" near Parrish opened with Elite Medical
// Spa, Bakers Ranch Wedding Venue, MassageLuXe. The attractions library
// admits spa/wellness on purpose (the Spa chip is a real section); the tile
// question is "what should I go and DO", and lib/outing.js already answers
// it for the things-to-do rail. The same rule, unchanged, now governs the two
// tiles that ask that question. Food / nightlife / shopping / stays / bestof
// are not outing questions and are untouched. Measured: within 25 miles of
// Parrish the rule vetoes 279 of 1,024 rated attractions (gyms, spas,
// wellness centers, yoga, med spas, wedding venues); statewide 771 of 5,534.
// No row moves, no category changes, the Spa chip keeps every one of them.
export const OUTING_TILES = Object.freeze(new Set(["today", "experiences"]));

export function tileAdmits(kind, p) {
  return OUTING_TILES.has(kind) ? isOuting(p) : true;
}

const idKey = (list) => (Array.isArray(list) ? list : []).map((p) => p && p.id).filter(Boolean).sort().join(",");

export function sameIdSet(lists) {
  if (!Array.isArray(lists) || lists.length < 2) return false;
  const first = idKey(lists[0]);
  if (!first) return false;
  return lists.every((l) => idKey(l) === first);
}
