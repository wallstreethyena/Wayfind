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

export const INV_CAT_FOR_TILE = Object.freeze({
  today: "attractions",
  experiences: "attractions",
  food: "food",
  nightlife: "nightlife",
  shopping: "shopping",
  stays: "hotels",
  // bestof spans food + attractions + shopping; it keeps the live-only path.
});

const idKey = (list) => (Array.isArray(list) ? list : []).map((p) => p && p.id).filter(Boolean).sort().join(",");

export function sameIdSet(lists) {
  if (!Array.isArray(lists) || lists.length < 2) return false;
  const first = idKey(lists[0]);
  if (!first) return false;
  return lists.every((l) => idKey(l) === first);
}
