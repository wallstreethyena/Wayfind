// lib/railsWire.js — the /api/rails wire format. PURE (no next/server, no
// fetch, no DOM) so scripts/check-rails-wire.mjs can round-trip it in prebuild
// instead of hoping the next deploy notices — the same reason lib/apiGuard.js
// returns a Web-standard Response.
//
// THE MEASUREMENT, production 2026-08-22, right after v8.33 removed every card
// ceiling: one Sarasota response carried 1,885 rows, 1,691KB raw, and Vercel
// served it at 524KB. The rows are not the problem — the owner asked for them
// and every one is a real place that earned a card. The DUPLICATION is: about
// 450 distinct places sit behind those 1,885 rows, because `eat`, `best`,
// `today` and `datenight` legitimately share the same restaurants and each rail
// was shipping a full copy of every one, 180-character photo reference and type
// array included.
//
// Dedupe fixes repeated bytes. The window below fixes first-response depth
// without deleting cards: totals remain explicit and every ordered page is
// reachable as the reader swipes (scripts/check-rails-wire.mjs).

/**
 * Collapse the rail map to one copy of each place plus per-rail id lists.
 * Lossless and ORDER-PRESERVING — lib/locationHonesty.js liveFromRailsResponse
 * rebuilds the exact same arrays. Rails keep their own order; only the
 * duplication BETWEEN them is removed.
 */
export function dedupeWire(data) {
  if (!data || !data.places || typeof data.places !== "object") return data;
  const placeIndex = {};
  const places = {};
  for (const [railId, rows] of Object.entries(data.places)) {
    const ids = [];
    for (const p of Array.isArray(rows) ? rows : []) {
      if (!p || !p.id) continue;
      if (!placeIndex[p.id]) placeIndex[p.id] = p;
      ids.push(p.id);
    }
    places[railId] = ids;
  }
  return { ...data, places, placeIndex };
}

/**
 * Keep every qualified card addressable without shipping every card up front.
 *
 * This is a transport window, not a ranking cap: `railTotals` preserves the
 * complete qualified depth and a reader can request the next ordered page for
 * one rail. The ranking output itself is never changed or truncated in cache.
 */
export function windowRailData(data, { railId = null, offset = 0, limit = 12 } = {}) {
  if (!data || !data.places || typeof data.places !== "object") return data;
  const safeOffset = Math.max(0, Number.isFinite(Number(offset)) ? Math.floor(Number(offset)) : 0);
  const safeLimit = Math.max(1, Math.min(48, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 12));
  const source = data.places;
  const keys = railId && Object.prototype.hasOwnProperty.call(source, railId)
    ? [railId]
    : railId
      ? []
      : Object.keys(source);
  const places = {};
  const railTotals = {};
  const railHasMore = {};
  for (const id of keys) {
    const rows = Array.isArray(source[id]) ? source[id] : [];
    const start = railId ? safeOffset : 0;
    const end = start + safeLimit;
    places[id] = rows.slice(start, end);
    railTotals[id] = rows.length;
    railHasMore[id] = end < rows.length;
  }
  return {
    ...data,
    places,
    railTotals,
    railHasMore,
    railPage: { railId, offset: railId ? safeOffset : 0, limit: safeLimit },
  };
}
