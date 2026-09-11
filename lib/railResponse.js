// Keep first paint small without hiding inventory. The first response carries
// a useful ranked window and the exact total. A reader can request the full
// cached answer without repeating database work.
export const FIRST_RAIL_WINDOW = 12;

// These posters compose their display rails from the shared /api/rails
// inventory.  They own the *rendering* of their subrails, not the upstream
// page stream: a 12-card first window still needs to grow to the server's
// complete ranked answer as the reader reaches its end.
export const SHARED_POOL_COMPOSER_RAILS = Object.freeze(["breakfast", "eat", "locals"]);

/**
 * Rendering ownership and paging ownership are deliberately different axes.
 * An independently fetched intent (Date Night, Night Out, etc.) pages through
 * its own endpoint. Breakfast, Actually Worth Eating, and Creators Pick render
 * their own subrails but must use the shared /api/rails pager that delivered
 * their source rows. A generic shared-pool rail also uses that pager.
 */
export function railUsesSharedPaging(railId, renderOwnsAnswer) {
  return !renderOwnsAnswer || SHARED_POOL_COMPOSER_RAILS.includes(railId);
}

/** The route's explicit hasMore wins; total is the backwards-compatible fall-back. */
export function railHasNextPage(loaded, total, hasMore) {
  if (hasMore === true) return true;
  const count = Number.isFinite(loaded) ? loaded : 0;
  const full = Number.isFinite(total) ? total : 0;
  return count < full;
}

/**
 * A continuation page belongs to one exact ranked answer. Include the rail,
 * snapped ranking cell, daypart, and exact-city override; a late response for
 * any other answer is stale and must be ignored by the client.
 */
export function railPageScope(railId, cell, daypart, citySlug = "") {
  if (!railId || !cell || !daypart) return "";
  return `${railId}|${cell}|${daypart}|${citySlug || ""}`;
}

export function isCurrentRailPageScope(currentScope, requestScope) {
  return !!requestScope && currentScope === requestScope;
}

/**
 * Continuation UI state belongs to the same immutable scope as its request.
 * If a reader changes city/poster/daypart while a request is in flight, remove
 * that old scope's state instead of leaving a `loading` flag attached to the
 * poster id they may reopen later.
 */
export function settleRailPageStateForScope(state, currentScope, requestScope, status) {
  const previous = state && typeof state === "object" ? state : {};
  if (!isCurrentRailPageScope(currentScope, requestScope)) {
    if (!Object.prototype.hasOwnProperty.call(previous, requestScope)) return previous;
    const next = { ...previous };
    delete next[requestScope];
    return next;
  }
  return { ...previous, [requestScope]: status };
}

/** True when a horizontal rail is close enough to its end to prefetch more. */
export function railScrollNeedsMore(element, thresholdPx = 180) {
  if (!element) return false;
  const left = Number(element.scrollLeft) || 0;
  const width = Number(element.clientWidth) || 0;
  const total = Number(element.scrollWidth) || 0;
  return total > width && left + width >= total - Math.max(0, Number(thresholdPx) || 0);
}

export function windowRailAnswer(answer, full = false, size = FIRST_RAIL_WINDOW) {
  if (full || !answer || !Array.isArray(answer.rails)) return answer;
  let hasMore = false;
  const rails = answer.rails.map((rail) => {
    const field = Array.isArray(rail.places) ? "places" : (Array.isArray(rail.cards) ? "cards" : null);
    if (!field) return rail;
    const rows = rail[field];
    if (rows.length > size) hasMore = true;
    return { ...rail, total: rows.length, [field]: rows.slice(0, size) };
  });
  return { ...answer, rails, hasMore };
}
