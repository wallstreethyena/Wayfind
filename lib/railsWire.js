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
// That is a payload problem and it gets a payload fix. Trimming rails to make
// the response smaller would be the ceiling coming back through the back door
// (scripts/check-no-card-cap.mjs).

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
