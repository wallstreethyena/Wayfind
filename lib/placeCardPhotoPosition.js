// lib/placeCardPhotoPosition.js — reviewed focal points for place cards whose
// Google cover photo crops badly in the phone card's photo column.
//
// WHY (owner, 2026-11-27, live iPhone screenshot): the #1 Trending Food card,
// Dry Dock Waterfront Grill, showed an "empty pale photo area". The photo had
// loaded; the card column is 96 x 268 px (lib/placeCardStandard.js), so a
// centered cover crop of a wide 3:2 photo shows only its middle ~24%, and for
// this shot that strip is sky over Sarasota Bay. The dock and the diners sit on
// the right of the frame, so the card aims there instead.
//
// RULES. One entry per place, added only after looking at the actual photo in
// a 96 x 268 crop. The value is a CSS object-position. It applies only while
// the card shows that place's own Google photo (lib/placeCardPhotoPosition's
// caller checks the src), never to a fallback or another venue's image. The
// place-only photo ref can re-resolve to a different cover later; re-check an
// entry when its card looks wrong again.
export const PLACE_CARD_PHOTO_POSITION = Object.freeze({
  // Dry Dock Waterfront Grill, Longboat Key. Reviewed 2026-11-27: cover photo
  // is a wide dockside shot, pelican and pilings left, patio diners right.
  ChIJ38CBz8Vqw4gRg0oFYUGBU_s: "80% 50%",
});

const POSITION = /^\d{1,3}% \d{1,3}%$/;

/** The reviewed object-position for this place's own photo, else null. */
export function placeCardPhotoPosition(placeId, src) {
  const id = typeof placeId === "string" ? placeId : "";
  if (!id || !Object.prototype.hasOwnProperty.call(PLACE_CARD_PHOTO_POSITION, id)) return null;
  const pos = PLACE_CARD_PHOTO_POSITION[id];
  if (!POSITION.test(pos)) return null;
  const s = String(src || "");
  let decoded = s;
  try { decoded = decodeURIComponent(s); } catch { /* keep raw */ }
  const ownPhoto = decoded.includes("places/" + id + "/photos/") || new RegExp("[?&]place=" + id + "(?:&|$)").test(decoded);
  return ownPhoto ? pos : null;
}
