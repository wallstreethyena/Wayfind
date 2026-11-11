// lib/feedDeferral.js — decides when the HOME FEED subtree may render under a
// place page that was opened directly (/p/{id}).
//
// Why this exists (field INP, 2026-11): a visitor who lands on /p/{id} gets the
// whole home feed mounted under the place sheet. Every feed fetch then
// re-renders that giant tree while the visitor reads and taps the place, so
// p75 mobile INP was 430ms (good is <= 200ms), dominated by input delay.
//
// Rule: on a direct place landing the feed is DEFERRED until the visitor leaves
// the place (closes the sheet), changes screen, or the place never opened. The
// flag is one-way: once released it is never deferred again.
//
// The initial value must be computable identically on the server and in the
// first client render (it only reads the initialPlaceId prop), so hydration
// matches.

// Fail-safe. If no place sheet has opened this long after a direct landing,
// nothing is going to cover the feed (a superseded or stalled open): release it
// so the page can never sit on an empty placeholder.
export const FEED_DEFERRAL_MAX_WAIT_MS = 8000;

/** Initial released flag. A direct place landing starts deferred. */
export function initialFeedReleased(initialPlaceId) {
  return !initialPlaceId;
}

/** True while the heavy feed subtree must not render. */
export function isFeedDeferred(initialPlaceId, released) {
  return !!initialPlaceId && !released;
}

/**
 * Should the feed be released now? Inputs are all observable state:
 *  - detailOpen: the place sheet is currently open
 *  - detailWasOpen: the sheet has been open at least once on this landing
 *  - screen: current screen id ("suggested" is the home feed)
 *  - placeOpenSettled: the deep-link open finished WITHOUT opening a sheet
 *    (place not found or lookup failed), so nothing will ever cover the feed
 * Pure: never returns false after a caller has already released (callers keep
 * the released flag and never call this again once true).
 */
export function shouldReleaseFeed({ detailOpen, detailWasOpen, screen, placeOpenSettled }) {
  if (placeOpenSettled) return true;
  if (screen && screen !== "suggested") return true;
  if (!detailOpen && detailWasOpen) return true;
  return false;
}
