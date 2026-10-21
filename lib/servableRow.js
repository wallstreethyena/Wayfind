// lib/servableRow.js — ONE row-level answer to "may a public surface serve this
// owned inventory row at all?" Pure, client-safe (two pure imports), so the map
// (lib/mapAreaData.js, bundled into the browser) and the list readers
// (lib/ownedPool.js, lib/nightOutPool.js) call the SAME function instead of
// keeping look-alike copies that drift.
//
// 2026-10-20 (live parity probe, scripts/verify-map-list-parity-live.mjs): the
// list served Atelier St. Pete, Art Deco Tours and Miami G with a drawable
// coordinate verdict, and /api/places/map never returned them. All three rows
// carry needs_review=true; the map's row gate refused needs_review while the
// list's never has (rankInventory, isServableRow). One surface showed a card,
// the other silently had no pin. The map now admits exactly the rows the list
// admits, decided here.
//
// The refusals (identical to lib/inventoryServe.js rankInventory's inline gate):
//   · no stored coordinate  — nothing to rank by distance
//   · not operational       — never serve a closed place (lib/businessStatus.js)
//   · excluded              — the classifier already rejected it
//   · not public            — owner-decided registry (lib/notPublicPlaces.js)
//   · no real rating        — an unenriched row has no Wayfind Score
// `needs_review` is deliberately NOT a refusal here: it flags an uncertain
// category for a human, and the list has always served those rows (Siesta
// Beach, Mote Marine Laboratory, Anna Maria Public Beach are needs_review as of
// 2026-10-20). Category correctness stays with the category gates that run
// after this one (placeAllowed / mapCategoryMatches). Hiding needs_review rows
// is an owner decision that must change THIS function, so list and map move
// together.
import { isOperational } from "./businessStatus.js";
import { isNotPublicPlace } from "./notPublicPlaces.js";

export function isServableRow(row) {
  if (!row || row.lat == null || row.lng == null) return false;
  if (!isOperational(row)) return false;
  if (row.excluded === true) return false;
  if (isNotPublicPlace(row.place_id)) return false;
  const rating = row.signals && row.signals.rating;
  return typeof rating === "number" && rating > 0;
}
