// One numeric contract for every place-card surface. CSS renderers interpolate
// these values; guards import them so future card work cannot create a second
// size ladder without changing the product contract here.
// Outer height is this one token on rails AND stacked lists. Content-sized
// height (height:auto / a 235px list reserve / a per-variant tall card) is
// forbidden — optional slots stay empty, they do not grow the card.
export const PLACE_CARD_HEIGHT_PX = 268;
export const PLACE_CARD_MAX_WIDTH_PX = 440;
export const PLACE_CARD_PAGE_GUTTER_PX = 13;
// Peek is for horizontal swipe rails only. Stacked homepage / Food lists
// use min(100%, maxWidth) so a phone fills the same 13px gutters as the
// search box (2026-09-14 founder screenshot: 1.08 on .wf-place-card-list
// left a ~44px dead strip).
export const PLACE_CARD_PHONE_PEEK = 1.08;
export const PLACE_CARD_GAP_PX = 10;
// Stacked-list photo column. 96px on a 268px-tall card chopped venue
// photos into a useless sliver; 36% stays inside the 32–38% mobile band.
export const PLACE_CARD_LIST_MEDIA_PCT = 36;
export const PLACE_CARD_LIST_MEDIA_MIN_PCT = 32;
export const PLACE_CARD_LIST_MEDIA_MAX_PCT = 38;
export const PLACE_CARD_RADIUS_PX = 17;
// Canonical compact hierarchy from PR #1302. Applies at <=430px. Do not
// "improve" these without founder UI approval — they are the premium card.
export const PLACE_CARD_MOBILE_BP_PX = 430;
export const PLACE_CARD_MOBILE_CONTENT_PAD = "10px 10px 8px";
export const PLACE_CARD_MOBILE_NAME_PX = 15;
export const PLACE_CARD_MOBILE_META_MARGIN = "3px 0 2px";
export const PLACE_CARD_MOBILE_META_PX = 9.75;
export const PLACE_CARD_MOBILE_AWARD_MIN_H_PX = 22;
export const PLACE_CARD_MOBILE_HIGHLIGHT_MIN_H_PX = 21;
export const PLACE_CARD_MOBILE_HIGHLIGHT_PAD = "1px 7px";
export const PLACE_CARD_MOBILE_ACT_H_PX = 34;
export const PLACE_CARD_MOBILE_ACT_PAD_TOP_PX = 4;
export const PLACE_CARD_MOBILE_ACTION_GRID = "44px 26px 26px minmax(0,1fr)";
export const PLACE_CARD_MOBILE_ACTION_GAP_PX = 4;

export const PLACE_CARD_STANDARD = Object.freeze({
  height: PLACE_CARD_HEIGHT_PX,
  maxWidth: PLACE_CARD_MAX_WIDTH_PX,
  pageGutter: PLACE_CARD_PAGE_GUTTER_PX,
  phonePeek: PLACE_CARD_PHONE_PEEK,
  gap: PLACE_CARD_GAP_PX,
  listMediaPct: PLACE_CARD_LIST_MEDIA_PCT,
  radius: PLACE_CARD_RADIUS_PX,
  mobileBp: PLACE_CARD_MOBILE_BP_PX,
});
