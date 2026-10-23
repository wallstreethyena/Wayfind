// lib/mapListScope.js — THE MAP OPENED FROM A LIST DRAWS THAT LIST.
// Client-safe and pure except readMapList (one same-origin POST).
//
// Owner, 2026-10-22: "When someone opens the map from a list, search,
// category, or rail, show every place in that result set that has valid,
// verified coordinates. Preserve the selected filters and region. Do not apply
// an additional hidden 9.2 cutoff when switching to the map. Keep the
// standalone 'All places' map's current threshold unchanged ... Places without
// verified coordinates remain in the list with the map limitation explained
// clearly. Never guess coordinates or match a different business."
//
// Two scopes (app/components/screens/Map.js):
//   list  the result set the reader came from: a rail/theme/badge list
//         (mapListOverride), or the category/search list when the reader chose
//         a category, chip or search this session. Pins = the list's ids that
//         the server read (/api/places/map/list -> lib/mapAreaData.
//         readMapPlacesByIds) returns with a permitted coordinate
//         (lib/coordProvenance.js, unchanged) plus session-only Apple pins for
//         list ids (lib/appleMapRecovery.js, minScore null). No score floor, no
//         viewport cut; the list already carries its filters.
//   area  the standalone map: the "All places · 9.2+" button, an in-map
//         category/sub choice, or a first open with nothing chosen. Unchanged:
//         the viewport inventory read with MAP_MIN_SCORE (9.2).
// The coordinate a pin uses is ALWAYS the server-resolved one (or Apple's live
// one); a list row's own lat/lng is never drawn, so an expired Google
// coordinate cannot reach the map through a list.
import { NO_PERMITTED_COORDINATE } from "./coordProvenance.js";
import { toDisplayScore } from "./score.js";
import { byGovernedScore } from "./lawfulOrder.js";

export const MAP_LIST_CLIENT_MAX = 2000; // ids per list-scoped map (4 requests of 500)
const CHUNK = 500;

// The list the map must draw, or null for the standalone area map.
export function mapListSource({ areaOnly = false, override = null, enteredFromList = false, list = null } = {}) {
  if (areaOnly) return null;
  if (Array.isArray(override) && override.some((p) => p && p.id)) return override.filter((p) => p && p.id);
  if (enteredFromList && Array.isArray(list) && list.some((p) => p && p.id)) return list.filter((p) => p && p.id);
  return null;
}

// "Did the reader arrive with a result set?" — a category/chip choice or a
// search this session (the same signal lib/mapExplorer.shouldApplyMapDefault
// uses to keep the map on the reader's list), or an explicit list override.
export function enteredMapFromList({ chosen = false, searchMode = false, override = null } = {}) {
  return !!chosen || !!searchMode || (Array.isArray(override) && override.length > 0);
}

export function mapListIdsOf(list) {
  const out = [];
  const seen = new Set();
  for (const p of list || []) {
    const id = p && typeof p.id === "string" ? p.id : "";
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
    if (out.length >= MAP_LIST_CLIENT_MAX) break;
  }
  return out;
}

// The list with the server's FRESH verdict: drawn ids keep theirs, every other
// id is "no permitted coordinate" once the read settled (a stale cached "ok"
// cannot claim a pin the server refused). Apple Place IDs read fresh by the
// server are attached so PlaceLookup can try them.
export function listScopeTruth(list, pins, status, appleIds = null) {
  const drawn = new Set((pins || []).map((p) => p && p.id));
  return (list || []).map((p) => {
    if (!p || !p.id) return p;
    let next = p;
    if (status === "ready" && !drawn.has(p.id) && !(p.mapCoord && p.mapCoord.ok === false)) next = { ...next, mapCoord: { ok: false, reason: NO_PERMITTED_COORDINATE } };
    const a = appleIds && typeof appleIds[p.id] === "string" ? appleIds[p.id] : null;
    if (a && next.applePlaceId !== a) next = { ...next, applePlaceId: a };
    return next;
  });
}

// Pins for a list-scoped map: exactly the list's ids, one per place (so a
// native cluster's count is the number of places under it), no score floor,
// no viewport. A pin still needs a drawable point and a score for its chip.
export function selectListMapPlaces(listIds, candidates) {
  const allowed = new Set((listIds || []).map(String));
  const seen = new Set();
  return (candidates || []).filter((p) => p && p.id && allowed.has(String(p.id)) && !seen.has(p.id)
    && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
    && toDisplayScore(Number.isFinite(p.governed_score) ? p.governed_score : p.wfScore) != null && seen.add(p.id))
    .sort((a, b) => byGovernedScore(a, b) || String(a.id).localeCompare(String(b.id)));
}

export async function readMapList({ ids, origin, signal, fetcher = fetch }) {
  const places = [];
  const appleIds = {};
  for (let i = 0; i < ids.length; i += CHUNK) {
    const r = await fetcher("/api/places/map/list", { method: "POST", signal, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ids.slice(i, i + CHUNK), originLat: origin.lat, originLng: origin.lng }) });
    if (!r || !r.ok) throw new Error("Map list unavailable");
    const j = await r.json();
    if (!j || !Array.isArray(j.places)) throw new Error("Invalid map list response");
    places.push(...j.places);
    if (j.appleIds && typeof j.appleIds === "object") Object.assign(appleIds, j.appleIds);
  }
  return { places, appleIds };
}
