// lib/restorePosition.js — PURE, import-free rules for restoring a saved
// browsing position. Split out of app/home.js's readPosition() so a guard can
// IMPORT AND CALL it (app/home.js is a client component a plain-node guard
// cannot load). Do not add an import here.

/**
 * Drop a standalone full-screen view from a GENERIC position restore.
 *
 * THE BUG THIS FIXES (reproduced on prod gowayfind.com 2026-10-30,
 * deterministic in a brand-new tab):
 *
 *   1. open https://www.gowayfind.com/map
 *   2. navigate to https://www.gowayfind.com/
 *   -> you land back on /map, rendering the map, with the HOMEPAGE <title>
 *
 * app/home.js keeps two kinds of position snapshot. An ENTRY-KEYED one
 * (`wf_pos_entry_<historyKey>`) belongs to one history entry and is how
 * Back/Forward returns you to exactly where you were — including a standalone
 * screen, which is correct. A GENERIC one (`wf_pos`) has no history entry and
 * is read on a bare "/" to restore the FEED's scroll position.
 *
 * The generic snapshot carried `screen: "map"`, so a fresh visit to "/"
 * reopened the map and the address-bar sync effect rewrote the URL to /map.
 * That stranded people, because the map is the one standalone screen that
 * hides the global header — on /map `document.querySelectorAll('a[href="/"]')`
 * is empty, and the category chips and "Browse list" all keep you on it. For
 * the snapshot's 30-minute TTL the homepage was unreachable both by typing the
 * address and through the UI.
 *
 * @param {object|null} position  the parsed snapshot, or null
 * @param {boolean} generic       true when it came from `wf_pos`, not an entry key
 * @param {Record<string,string>} screenPaths  SCREEN_PATH — the single source of
 *   truth for which screens are standalone. Passed in rather than duplicated
 *   so the two cannot drift.
 * @returns {object|null} the snapshot, with `screen` neutralised when a generic
 *   restore would otherwise reopen a standalone screen.
 */
export function sanitizeRestoredPosition(position, generic, screenPaths) {
  if (!position || !generic) return position;
  const paths = screenPaths && typeof screenPaths === "object" ? screenPaths : {};
  if (position.screen && Object.prototype.hasOwnProperty.call(paths, position.screen)) {
    return { ...position, screen: "suggested" };
  }
  return position;
}
