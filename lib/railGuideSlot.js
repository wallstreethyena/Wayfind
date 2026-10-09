// lib/railGuideSlot.js: WHERE A GUIDE CARD GOES IN A RAIL. One helper, used by
// every rail system.
//
// OWNER RULE (2026-10-08), verbatim intent: "I don't like how you are entering
// the guide in its own rail. Place it in the 3rd place in each of the rail
// system it belongs, not on an individual rail. The rails are the centerpiece,
// don't add things in between. Make sure this is the global rule for all of the
// rails."
//
// So a guide is never rendered BETWEEN rails. It rides INSIDE the rail it
// belongs to, as the third card of that rail's own track (index 2). A rail with
// fewer than two cards gets it last. The guide is not a place: it carries no
// rank (the places keep their own 1, 2, 3 numbering around it, because the
// caller builds the place cards first and only then inserts the guide), and it
// is never counted as a place by rail counters, ranking or place analytics.
// Locked by scripts/check-guide-in-rail.mjs.
//
// Pure: no React, no DOM. Works on any array (place rows or rendered elements).

export const GUIDE_SLOT_INDEX = 2;

/** The index the guide takes in a rail of `length` items. */
export function guideSlotIndex(length) {
  const n = Number.isFinite(length) && length > 0 ? Math.floor(length) : 0;
  return n < GUIDE_SLOT_INDEX ? n : GUIDE_SLOT_INDEX;
}

/** A new array with `guide` inserted at the guide slot. No guide: a copy. */
export function insertGuideAt(items, guide) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (guide == null || guide === false) return list;
  list.splice(guideSlotIndex(list.length), 0, guide);
  return list;
}
