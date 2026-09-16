// One numeric contract for every place-card surface. CSS renderers interpolate
// these values; guards import them so future card work cannot create a second
// size ladder without changing the product contract here.
//
// OWNER STANDARD (2026-09-16): every place card looks like the horizontal rail
// card (the "Kids Empire Bradenton" screenshot): the same photo column, the
// same type, the same four actions (Save, like, dislike, Share) and NO
// Directions button. The card body opens the detail page; Directions lives
// there. Fall cards keep their seasonal skin (lib/fallSkin.js) on top of this
// same geometry. Guards: check-place-card-standard, check-place-card-no-directions.
export const PLACE_CARD_HEIGHT_PX = 268;
export const PLACE_CARD_MAX_WIDTH_PX = 440;
export const PLACE_CARD_PAGE_GUTTER_PX = 13;
// Peek is for horizontal swipe rails only. Stacked homepage / Food lists
// use the full column so a phone fills the same 13px gutters as the
// search box (2026-09-14 founder screenshot: 1.08 on .wf-place-card-list
// left a ~44px dead strip).
export const PLACE_CARD_PHONE_PEEK = 1.08;
export const PLACE_CARD_GAP_PX = 10;
// ONE photo column for every card, stacked or rail (2026-09-16: the stacked
// list's 36% column made its photo bigger than the rail card's, so the two
// read as different cards). Desktop widens it once, for every card.
export const PLACE_CARD_MEDIA_PX = 96;
export const PLACE_CARD_MEDIA_DESKTOP_PX = 108;
// Below this viewport a stacked list fills its column edge to edge instead of
// stopping at the 440px cap (2026-09-16: the list card ended well short of the
// screen edge while the rail card above it filled the width).
export const PLACE_CARD_LIST_FILL_BELOW_PX = 900;

export const PLACE_CARD_STANDARD = Object.freeze({
  height: PLACE_CARD_HEIGHT_PX,
  maxWidth: PLACE_CARD_MAX_WIDTH_PX,
  pageGutter: PLACE_CARD_PAGE_GUTTER_PX,
  phonePeek: PLACE_CARD_PHONE_PEEK,
  gap: PLACE_CARD_GAP_PX,
  mediaPx: PLACE_CARD_MEDIA_PX,
  mediaDesktopPx: PLACE_CARD_MEDIA_DESKTOP_PX,
  listFillBelowPx: PLACE_CARD_LIST_FILL_BELOW_PX,
  directionsOnCard: false,
});
