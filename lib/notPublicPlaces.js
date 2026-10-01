// lib/notPublicPlaces.js — places that are REAL but NOT open to the public, so
// they never belong on a public discovery surface (landing lists, inventory
// rails, the /places sitemap). Zero imports, pure, client-safe.
//
// WHY A REGISTRY AND NOT A DELETE. The owned inventory row is ingested data and
// stays exactly as it is; this list only decides what a PUBLIC surface may show.
// Keyed by the EXACT Google place_id, never by name: a name match would also
// swallow an honest namesake elsewhere. Each entry carries the reason and the
// owner decision date so the call is reviewable and reversible.
//
// Same intent as the inventory `excluded` column (lib/inventoryServe.js
// rankInventory, lib/ownedPool.js isServableRow), for a row we cannot flip in
// the database from a code change.
export const NOT_PUBLIC_PLACES = Object.freeze([
  {
    place_id: "ChIJWSN54VZBw4gRJeqLPipSLEM",
    name: "Le Mans Kitchen",
    address: "707 S Washington Blvd, Sarasota",
    reason: "A kitchen inside the Sarasota Ford dealership, curated exclusively for its customers. Not a public restaurant.",
    decided: "2026-09-29",
    decidedBy: "owner",
  },
]);

const IDS = new Set(NOT_PUBLIC_PLACES.map((e) => e.place_id));

/** Exact place_id match only. Accepts an id string or a row/place object. */
export function isNotPublicPlace(x) {
  if (!x) return false;
  const id = typeof x === "string" ? x : (x.id || x.place_id || null);
  return typeof id === "string" && IDS.has(id);
}
