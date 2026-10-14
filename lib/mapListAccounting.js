// lib/mapListAccounting.js — EVERY LIST PLACE IS ACCOUNTED FOR ON THE MAP.
// Pure. Given the cards on screen (`listPlaces`), the pins drawn (`pins`) and
// the map's own candidate pool, give each list place exactly ONE status, so a
// place on the list can never be missing from the map without a stated reason.
//
// 2026-10-14 (synthetic `surface-parity-parrish-cafes`): the list showed
// Ryan's Coffee House, the map silently had no pin. The cause was a coordinate
// the map may no longer draw (lib/coordProvenance.js), but nothing on screen or
// in window.__wfMapPins said so. This module is that statement; Map.js renders
// its count and publishes it in window.__wfMapPins.unmapped.
//
// Statuses (exactly one per list place):
//   pinned                   drawn on the map now
//   no-permitted-coordinate  no coordinate we may draw (Google's 30-day window
//                            passed and no independent source exists)
//   area-not-ready           the map area is still loading or failed
//   not-in-map-area          the map's area read (current viewport) did not
//                            return it; the list's radius is wider than the map
//   below-map-floor          returned, but under the map's 9.2 floor or its
//                            category/sub filters
import { mapCoordAllowedNow, NO_PERMITTED_COORDINATE } from "./coordProvenance.js";

export const MAP_LIST_STATUSES = Object.freeze(["pinned", NO_PERMITTED_COORDINATE, "area-not-ready", "not-in-map-area", "below-map-floor"]);

export function accountListOnMap({ listPlaces = [], pins = [], areaPlaces = [], areaStatus = "ready", now = Date.now() } = {}) {
  const pinIds = new Set((pins || []).map((p) => p && p.id).filter(Boolean));
  const areaIds = new Set((areaPlaces || []).map((p) => p && p.id).filter(Boolean));
  const seen = new Set();
  const rows = [];
  for (const p of listPlaces || []) {
    if (!p || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    let status;
    if (pinIds.has(p.id)) status = "pinned";
    else if (mapCoordAllowedNow(p, now) === false) status = NO_PERMITTED_COORDINATE;
    else if (areaStatus !== "ready") status = "area-not-ready";
    else if (!areaIds.has(p.id)) status = "not-in-map-area";
    else status = "below-map-floor";
    rows.push({ id: p.id, status });
  }
  const counts = Object.fromEntries(MAP_LIST_STATUSES.map((s) => [s, 0]));
  for (const r of rows) counts[r.status]++;
  return { rows, counts, total: rows.length, unmapped: rows.filter((r) => r.status !== "pinned") };
}
