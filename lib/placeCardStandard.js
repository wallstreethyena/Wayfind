// One numeric contract for every place-card surface. CSS renderers interpolate
// these values; guards import them so future card work cannot create a second
// size ladder without changing the product contract here.
export const PLACE_CARD_HEIGHT_PX = 268;
export const PLACE_CARD_MAX_WIDTH_PX = 440;
export const PLACE_CARD_PAGE_GUTTER_PX = 13;
export const PLACE_CARD_PHONE_PEEK = 1.08;
export const PLACE_CARD_GAP_PX = 10;

export const PLACE_CARD_STANDARD = Object.freeze({
  height: PLACE_CARD_HEIGHT_PX,
  maxWidth: PLACE_CARD_MAX_WIDTH_PX,
  pageGutter: PLACE_CARD_PAGE_GUTTER_PX,
  phonePeek: PLACE_CARD_PHONE_PEEK,
  gap: PLACE_CARD_GAP_PX,
});
