// The home events primer (app/layout.js) starts /api/events before hydration
// and warms the first event image with `new Image()`. That image is assigned
// to img.src, so it must be a URL that returns image bytes.
//
// An uncredited `/api/photo?place=<id>&g=2&w=640` does not. The photo route
// refuses it as not-google-surface (404 JSON) unless the request is a credited
// surface (`s=detail` / `s=card`). Fall cards build exactly that uncredited
// URL from a bare place id (lib/placePhoto.ownedPlacePhotoSrc). On a cold
// load the primer's center is Parrish, the first image in that feed is Seed &
// Bean Venice, and every page — including /things-to-do/orlando — requested
// the 404 at high priority. Measured live 2026-10-18, three Lighthouse runs.
//
// The primer runs before any module can load, so the browser gets
// EVENT_IMAGE_PRIME_SOURCE, not this module. isDisplayableEventImage is the
// same predicate for the lock test. The test fails if the two disagree.

export const EVENT_IMAGE_PRIME_SOURCE =
  "function isDisplayableEventImage(src){if(typeof src!==\"string\"||!src)return false;if(src.indexOf(\"/api/photo?\")!==-1&&/[?&]place=/.test(src)&&!/[?&]s=(?:detail|card)(?:&|$)/.test(src))return false;return true}";

export function isDisplayableEventImage(src) {
  if (typeof src !== "string" || !src) return false;
  if (src.indexOf("/api/photo?") !== -1 && /[?&]place=/.test(src) && !/[?&]s=(?:detail|card)(?:&|$)/.test(src)) return false;
  return true;
}
