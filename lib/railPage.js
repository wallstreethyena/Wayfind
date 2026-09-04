// lib/railPage.js — the shared paging contract every poster/rail endpoint
// speaks (WO11, 2026-09-02, owner: "load the top ten based on the Wayfind
// score, and as they scroll ... start loading 10 more cards, and 10 more,
// instead of loading everything at once. Have everything there in the
// library and just stream it in 10 at a time").
//
// WHY THIS IS A SEPARATE, TINY MODULE. It is deliberately NOT inside
// lib/railSelect.js, lib/nearbyPool.js or lib/railsData.js — those three
// files are where scripts/check-no-card-cap.mjs enforces "there is no max"
// (owner, 2026-08-22): a rail's SELECTION must never be trimmed. Paging is a
// different thing wearing a similar shape — it trims the WIRE RESPONSE, never
// the ranked pool the rail computed. The full ranked list is still built once
// and still lives in the fast-cache entry untouched; this module only slices
// a WINDOW of it for one HTTP response. lib/railResponse.js's
// `windowRailAnswer` already established that split (a first-paint window,
// full=1 for everything) — this module gives the same split an explicit
// page/size contract so a scroller can ask for page 1, 2, 3… without
// re-fetching everything it already has.
//
// DETERMINISM. Every page for a given cache generation is a pure slice of
// the SAME cached, already-ordered array (lib/railFastCache.js keeps one
// value per key for up to an hour), so two requests for page 1 of the same
// rail — concurrent or five minutes apart, as long as the cache entry has
// not rolled — return byte-identical rows. Pages therefore cannot overlap or
// skip: page N is exactly rows[N*size, N*size+size) of a list that does not
// reorder itself between requests. This module does not re-sort what it is
// given — each rail's own composer already orders it (governed score desc,
// then a rail-specific tiebreak: reviews desc for the daypart/day­part-fed
// rails, near-ring-then-score for Night Out and Fall Intent) and re-imposing
// a different comparator here would undo that real product logic.
export const RAIL_PAGE_SIZE = 10;

function toPage(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function toSize(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : RAIL_PAGE_SIZE;
}

/**
 * Slice one already-ordered list into page N of `size`.
 * @param {any[]} rows
 * @param {{page?:number, size?:number}} [opts]
 * @returns {{places:any[], total:number, page:number, size:number, hasMore:boolean}}
 */
export function pageOf(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const page = toPage(opts.page);
  const size = toSize(opts.size);
  const start = page * size;
  const places = start < list.length ? list.slice(start, start + size) : [];
  const total = list.length;
  const hasMore = start + places.length < total;
  return { places, total, page, size, hasMore };
}

// The key a rail keeps its rows under varies by endpoint: the daypart-fed
// composers (night-out, date-night, birthday, today-discovery) use `places`;
// Fall Intent's rails mix events and places under `cards`. Auto-detect so one
// helper serves both shapes.
function itemsKeyOf(rail) {
  if (Array.isArray(rail?.cards)) return "cards";
  return "places";
}

/**
 * Page ONE named rail out of a `{ rails: [{id, places|cards, …}] }` answer —
 * the shape night-out/date-night/birthday/today-discovery/fall all return.
 * Returns null when the rail id does not exist in this answer (caller decides
 * whether that is a 404 or an honest empty page).
 */
export function pageOneRail(rails, railId, opts = {}) {
  const rail = (Array.isArray(rails) ? rails : []).find((r) => r && r.id === railId);
  if (!rail) return null;
  const key = itemsKeyOf(rail);
  const paged = pageOf(rail[key], opts);
  return {
    id: rail.id, title: rail.title, deck: rail.deck,
    [key]: paged.places, total: paged.total, page: paged.page, hasMore: paged.hasMore,
  };
}

/**
 * Page EVERY rail in a `{ rails: [...] }` answer to the same page/size — the
 * bulk shape used when no single rail was asked for (kept for symmetry; the
 * routes below default to shipping the FULL first response unchanged, which
 * is what "page 0 must be as fast as today or faster" requires, and only use
 * this when a caller explicitly opts into windowing every rail at once).
 */
export function pageAllRails(rails, opts = {}) {
  return (Array.isArray(rails) ? rails : []).map((rail) => {
    const key = itemsKeyOf(rail);
    const paged = pageOf(rail[key], opts);
    return { ...rail, [key]: paged.places, total: paged.total, page: paged.page, hasMore: paged.hasMore };
  });
}

/**
 * Page ONE named rail out of railMenuData's flat shape: `{ places: { railId:
 * [...] , … } }` (app/api/rails). Returns null when the rail id is unknown.
 */
export function pageRailMenuRail(placesById, railId, opts = {}) {
  if (!placesById || !Object.prototype.hasOwnProperty.call(placesById, railId)) return null;
  const paged = pageOf(placesById[railId], opts);
  return { id: railId, places: paged.places, total: paged.total, page: paged.page, hasMore: paged.hasMore };
}
