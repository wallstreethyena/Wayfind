// scripts/lib/localityEvidence.mjs — the pure rules behind
// scripts/backfill-locality-from-events.mjs, split out so they can be called
// by a test instead of only read.
//
// Two defects in the first generated backfill (#2075, 2026-10-31) live here:
//
// 1. CORROBORATION WAS A SUBSTRING TEST. `address.includes(city)` let a STREET
//    name corroborate a city: House of Blues Orlando got "Lake Buena Vista" from
//    "1490 East Lake Buena Vista Dr, Orlando, FL 32830". The same test let
//    "Clearwater" match "Clearwater Beach" for Frenchy's. Corroboration now
//    compares the event city to the address's CITY SLOT only — the
//    comma-separated segment immediately before the state segment — by exact,
//    case-insensitive equality. No slot, no corroboration.
//
// 2. AN EMPTY LOCALITY WAS TREATED AS "UNKNOWN". The 2026-10-14 statewide
//    Census pass (docs/audits/2026-10-08-statewide/) set `county` and left
//    `locality` NULL on purpose for points outside every incorporated place:
//    Fox Squirrel Corn Maze and Keel Farms have Plant City MAILING addresses
//    but sit in unincorporated Hillsborough. County present + locality empty is
//    a decision, not a gap, and a backfill must never overwrite it.

const STATE_SEGMENT = /^(fl|florida)(\s+\d{5}(-\d{4})?)?$/i;

// The city slot of a US street address, or null when the address has no
// recognisable "<city>, FL <zip>" shape.
export function addressCitySlot(address) {
  const parts = String(address || "").split(",").map((s) => s.trim()).filter(Boolean);
  const i = parts.findIndex((p) => STATE_SEGMENT.test(p));
  if (i < 1) return null;
  return parts[i - 1];
}

// True only when the address's own city slot IS the city.
export function addressCorroboratesCity(address, city) {
  const slot = addressCitySlot(address);
  const c = String(city || "").trim();
  return !!slot && !!c && slot.toLowerCase() === c.toLowerCase();
}

// A row the backfill may fill: locality empty AND no Census county decision.
export function localityIsFillable(row) {
  if (String(row?.locality || "").trim()) return false;
  if (String(row?.county || "").trim()) return false;
  return true;
}
