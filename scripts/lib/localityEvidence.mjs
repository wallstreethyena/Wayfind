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
// 3. A MAILING CITY IS NOT A LOCALITY (found 2026-11-03, before apply). Even the
//    corrected city-slot rule passed 36 of 118 rows whose MAILING city is not
//    the place the venue sits in: SeaWorld / The Orlando Eye / Madame Tussauds
//    carry "Orlando" addresses but sit in unincorporated Orange County;
//    Downtown Wellen Park's "Venice" address is inside North Port; Children's
//    Planet's "Orlando" address is inside the Town of Edgewood. The accepted
//    rule (docs/audits/2026-10-08-statewide/README.md) is the Census place that
//    CONTAINS the venue's point. So a row is written only when the Census place
//    for its own point equals the owned-evidence city. censusLocality() is that
//    rule: the incorporated place, else the Census-designated place, else null.
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

// The locality the accepted Census rule gives for one point's geographies
// ({ inc: [...], cdp: [...] } from the Census geocoder's Incorporated Places /
// Census Designated Places layers). Null when the point is in no Census place
// (unincorporated) or the answer is ambiguous (more than one place).
export function censusLocality(geo) {
  const inc = Array.isArray(geo?.inc) ? geo.inc.filter(Boolean) : [];
  const cdp = Array.isArray(geo?.cdp) ? geo.cdp.filter(Boolean) : [];
  if (inc.length > 1 || (!inc.length && cdp.length > 1)) return null;
  return inc[0] || cdp[0] || null;
}

const cityKey = (s) => String(s || "").trim().toLowerCase().replace(/^saint\s+/, "st. ").replace(/\./g, "");

// True only when the Census place containing the point IS the city.
export function censusCorroboratesCity(geo, city) {
  const place = censusLocality(geo);
  return !!place && !!String(city || "").trim() && cityKey(place) === cityKey(city);
}

// One disposition per candidate: eligible | conflicting | unsupported.
export function censusDisposition(geo, city) {
  if (censusCorroboratesCity(geo, city)) return "eligible";
  return censusLocality(geo) ? "conflicting" : "unsupported";
}
