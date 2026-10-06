// lib/googlePhotoSrc.js — is this image src a Google Places photo?
//
// WHY (owner, 2026-09-30). Google's Places terms require that a Places photo
// is shown with its author attribution (name + profile link) and a way to
// open the photo on Google Maps. Wayfind will not knowingly show a Google
// photo without that credit, so every surface that can suppress an
// uncredited Google photo asks this one function what counts as one.
//
// FAIL CLOSED. `/api/photo` can also serve a licensed (Wikimedia) photo, but
// the URL alone cannot say which, so every `/api/photo` src counts as Google.
// A surface that wants a licensed photo resolves it server-side with its
// licence credit (lib/freePhoto.js findFreePhoto) and passes that URL, which
// is never an `/api/photo` URL.
//
// Pure and tiny on purpose: RailCard and IconicPlaceCard import it, and both
// ship in the homepage bundle.

const GOOGLE_HOST_RX = /(?:^|\.)(?:googleusercontent\.com|ggpht\.com|googleapis\.com)$/i;
const OWN_HOST_RX = /(?:^|\.)gowayfind\.com$/i;

/** True when `src` is (or may be) a Google Places photo. */
export function isGooglePhotoSrc(src) {
  const s = String(src || "").trim();
  if (!s) return false;
  if (/^\/api\/photo(?:[/?#]|$)/i.test(s)) return true;
  let u;
  try { u = new URL(s, "https://www.gowayfind.com"); } catch { return false; }
  if (OWN_HOST_RX.test(u.hostname) && /^\/api\/photo(?:[/?#]|$)/i.test(u.pathname)) return true;
  if (GOOGLE_HOST_RX.test(u.hostname)) return true;
  return false;
}

/** `src` unless it is a Google photo, in which case "". */
export function withoutGooglePhoto(src) {
  return isGooglePhotoSrc(src) ? "" : (src || "");
}

/**
 * True for the guide pipeline's no-spend cached rung only: the media object is
 * marked by lib/guidePlaceFigureImage.js AND its src is the read-only
 * `nospend=1` form of the photo route. Either half alone is not enough.
 */
export function isNoSpendCachedMedia(media) {
  return !!media && media.noSpendCached === true && /^\/api\/photo\?[^#]*\bnospend=1\b/i.test(String(media.src || ""));
}
