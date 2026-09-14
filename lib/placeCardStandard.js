// One numeric contract for every place-card surface. CSS renderers interpolate
// these values; guards import them so future card work cannot create a second
// size ladder without changing the product contract here.
export const PLACE_CARD_HEIGHT_PX = 268;
export const PLACE_CARD_MAX_WIDTH_PX = 440;
export const PLACE_CARD_PAGE_GUTTER_PX = 13;
// Peek is for horizontal swipe rails only. Stacked homepage / Food lists
// use min(100%, maxWidth) so a phone fills the same 13px gutters as the
// search box (2026-09-14 founder screenshot: 1.08 on .wf-place-card-list
// left a ~44px dead strip).
export const PLACE_CARD_PHONE_PEEK = 1.08;
export const PLACE_CARD_GAP_PX = 10;
// Shared photo column for every standard place card — list AND rail.
// 96px / 108px rail overrides chopped venue photos into a sliver on a
// 268px-tall card. 36% is the one media contract and stays inside the
// 32–38% mobile band.
export const PLACE_CARD_MEDIA_PCT = 36;
export const PLACE_CARD_MEDIA_MIN_PCT = 32;
export const PLACE_CARD_MEDIA_MAX_PCT = 38;
// Back-compat aliases — same shared contract, not list-only.
export const PLACE_CARD_LIST_MEDIA_PCT = PLACE_CARD_MEDIA_PCT;
export const PLACE_CARD_LIST_MEDIA_MIN_PCT = PLACE_CARD_MEDIA_MIN_PCT;
export const PLACE_CARD_LIST_MEDIA_MAX_PCT = PLACE_CARD_MEDIA_MAX_PCT;

export const PLACE_CARD_STANDARD = Object.freeze({
  height: PLACE_CARD_HEIGHT_PX,
  maxWidth: PLACE_CARD_MAX_WIDTH_PX,
  pageGutter: PLACE_CARD_PAGE_GUTTER_PX,
  phonePeek: PLACE_CARD_PHONE_PEEK,
  gap: PLACE_CARD_GAP_PX,
  mediaPct: PLACE_CARD_MEDIA_PCT,
  listMediaPct: PLACE_CARD_MEDIA_PCT,
});
