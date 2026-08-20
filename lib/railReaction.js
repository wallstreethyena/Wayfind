// lib/railReaction.js — Like/Dislike are a signal, never a page.
//
// THE BUG (2026-08-01, still live on the Amazon/home rail 2026-08-20):
// IconicPlaceCard fell back to <a href="/p/<id>?action=like"> when the caller
// did not pass onLike. The tap left the rail, loaded /p/{id}?action=like as a
// full route, opened the detail sheet, and the circular Back control could
// not restore the originating rail (an extra history.pushState for the sheet
// ate the first Back).
//
// This module is the callable contract those surfaces share:
//   stayOnRailReaction  — the click handler (preventDefault, no navigation)
//   reactionSourceNavigates / reactionMarkupNavigates — the forbidden href
//   placeRouteBackPlan  — what Back does on a leftover /p/{id}?action=like

/** Click contract for Like/Dislike on any rail/place card. Never a navigation. */
export function stayOnRailReaction(event, handler, place) {
  if (event) {
    if (typeof event.stopPropagation === "function") event.stopPropagation();
    if (typeof event.preventDefault === "function") event.preventDefault();
  }
  if (typeof handler === "function") handler(event, place);
}

function stripComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * True when SOURCE still ships the navigate-away Like/Dislike href.
 * Comments are stripped so the 2026-08-01 bug writeup cannot trip this.
 */
export function reactionSourceNavigates(src) {
  const code = stripComments(src);
  return (
    /href=\{actionHref\("(like|dislike)"\)\}/.test(code) ||
    /href=\{?`\/p\/\$\{[^}]+\}[^`]*\?action=(like|dislike)/.test(code) ||
    /href=["']\/p\/[^"']*\?action=(like|dislike)/.test(code)
  );
}

/** True when RENDERED markup still uses an <a href="/p/...?action=like|dislike">. */
export function reactionMarkupNavigates(html) {
  return /<a\b[^>]*href=["'][^"']*\/p\/[^"']*\?action=(like|dislike)/i.test(String(html || ""));
}

/**
 * What Back should do when the reader is already on /p/{id} (old share or
 * leftover ?action=like navigation). CALL this; do not re-derive it in UI.
 *
 * @param {{ pathname?: string, search?: string, referrer?: string, origin?: string }} loc
 */
export function placeRouteBackPlan(loc) {
  const pathname = (loc && loc.pathname) || "";
  const search = (loc && loc.search) || "";
  const referrer = (loc && loc.referrer) || "";
  const origin = (loc && loc.origin) || "";
  const onPlace = /^\/p\//.test(pathname);
  let action = "";
  try {
    action = new URLSearchParams(String(search).replace(/^\?/, "")).get("action") || "";
  } catch (e) {}
  const isSignal = action === "like" || action === "dislike";
  const isSave = action === "save";
  let sameOriginPrev = false;
  try {
    if (referrer && origin) {
      const ref = new URL(referrer);
      sameOriginPrev = ref.origin === origin;
    }
  } catch (e) {}
  return {
    stripAction: onPlace && (isSignal || isSave),
    // First Back leaves /p/{id} entirely when the reader came from our own
    // surface (rail, homepage, guide, intent). That is what restores the rail.
    leavePlaceRoute: onPlace && sameOriginPrev,
    // Old ?action=like share with no same-origin previous page: close onto
    // "/" so the place route cannot trap them as the only UI.
    replaceHomeOnClose: onPlace && isSignal && !sameOriginPrev,
  };
}
