// lib/mapRailFollow.js — pin-tap-holds-the-rail arithmetic shared by every
// guide's map+rail explorer (app/components/GuideMapExplorer.js).
//
// Extracted from the fix that originally shipped only on the Florida Fall
// Guide's bespoke FallGuideExplorer.js (#1429, e9453520): tapping a map pin
// must hold that pin selected (and its card foregrounded) while the rail
// smooth-scrolls to it, rather than losing the hold to the very first scroll
// frame re-selecting whatever card the rail is still passing over. When
// #1422 generalized the Fall Guide's bespoke explorer into this shared
// GuideMapExplorer, the merge that reconciled #1422 with #1429 had to
// hand-port this logic — FallGuideExplorer.js, the file it originally lived
// in, no longer exists — with no guard behind that port. That is exactly the
// kind of step a later merge can silently drop again. These functions are
// pulled out on their own so a guard can EXECUTE the real decision logic
// (not just grep source text for it), and so GuideMapExplorer.js's own
// wiring can be checked against the same functions it actually calls.
//
// No JSX, no browser globals, no dependency on GuideMapExplorer's refs —
// pure arithmetic plus a plain `{ id, left }` shape for the held pin.

// Two positions this close are the same position for scroll-sync purposes —
// a smooth-scroll animation never lands on an exact pixel.
export const FOLLOW_SNAP_PX = 2;

/** True once `scrollLeft` is close enough to `target` that no further scroll
 * event will refine it. Used both to release a pin-tap hold immediately when
 * the tapped card is already in view (no scroll event is coming to release
 * it otherwise), and to detect arrival by position for a card that can never
 * centre on the rail (the last card). */
export function isAtRailTarget(scrollLeft, target) {
  return Math.abs(scrollLeft - target) < FOLLOW_SNAP_PX;
}

/** Clamp a desired rail scrollLeft to the rail's real scrollable range, so a
 * pin tap never asks the rail to scroll past either end. */
export function clampRailTarget(desired, scrollWidth, clientWidth) {
  return Math.min(Math.max(0, scrollWidth - clientWidth), Math.max(0, desired));
}

/**
 * Whether a pin-tap hold on `follow` ({ id, left }) should be released,
 * given:
 *   - `bestId`: the card the rail's scroll handler currently judges
 *     best-centred (or null if none is fully in view), and
 *   - `scrollLeft`: the rail's current scroll position.
 *
 * Released the moment the rail arrives at the tapped card by CONTENT
 * (bestId matches the held id), or arrives at the tapped card's own scroll
 * target by POSITION — the only way the last card on a rail ever releases,
 * since it can never centre. Anything else (no hold set, or neither
 * condition true) keeps the hold, so the scroll handler does not fight the
 * tap by re-selecting every card the rail passes on the way there.
 */
export function followShouldRelease(follow, bestId, scrollLeft) {
  if (!follow) return false;
  if (bestId != null && String(bestId) === follow.id) return true;
  return follow.left != null && isAtRailTarget(scrollLeft, follow.left);
}
