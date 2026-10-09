// lib/curatedPhotoRefs.js — SERVER ONLY. Photo resource names for curated
// places that are not in wf_inventory.
//
// WHY THIS FILE EXISTS, and why the refs are NOT next to the places they
// belong to (v8.95). Chef Ron Duprat's seven picks sit in five metros the
// owned library does not cover, so /api/photo?place= had nothing to resolve
// and all seven cards shipped blank (owner, 2026-08-30: "these places are
// missing the pictures").
//
// The obvious fix — a `photoRef` field on each entry in lib/chefPicks.js —
// was written, measured, and REVERTED. chefPicks is imported by DaypartRail,
// a client component, so those seven Google resource names (~700 chars each,
// high-entropy, gzip-hostile) shipped to every phone that loads the homepage
// and took the route bundle from 494.9KB to 497.8KB gz against a 496KB
// budget. check-bundle went red, and a red prebuild blocks EVERY deploy —
// including an outage fix. A photo ref is data the SERVER needs to fetch
// bytes; the browser only ever needs the place id it already has.
//
// So the client says /api/photo?place=<id> — the same string for every card
// on the site — and the server decides where that id's ref comes from:
// wf_inventory first, this map second. Nothing here widens what a card may
// wear: lib/placePhoto photoRefOwnedByPlace still holds, and every ref below
// is asserted to belong to its own key by scripts/check-no-imageless-card.
//
// ADDING TO THIS MAP IS A LAST RESORT. A place that belongs in the owned
// library belongs in wf_inventory, where the backfill scripts can refresh it.
// This is for curated rows that are deliberately NOT inventory — testimony
// (a chef's list) rather than coverage.
export const CURATED_PHOTO_REFS = Object.freeze({
  // Fall 2026 venue-identity bridge. These four official event venues were
  // resolved after their event rows shipped without place_id. Inventory wins
  // automatically once promotion lands; until then /api/photo?place= can still
  // serve each card's own verified venue photo instead of collection artwork.
  "ChIJkyg5UW6654gRECAKyCherD8":
    "places/ChIJkyg5UW6654gRECAKyCherD8/photos/wfplacediscovery",
  "ChIJ68SLYriZ54gRaJgw169KqYA":
    "places/ChIJ68SLYriZ54gRaJgw169KqYA/photos/wfplacediscovery",
  "ChIJ-aI9NvSI54gRrVByB84z-AY":
    "places/ChIJ-aI9NvSI54gRrVByB84z-AY/photos/wfplacediscovery",
  "ChIJQZ8lbY-O54gRJSKIfjA-Wr4":
    "places/ChIJQZ8lbY-O54gRJSKIfjA-Wr4/photos/wfplacediscovery",
  // 1. Cafe La Trova — Miami, FL
  "ChIJZzgtHTW32YgR-k9p8IqD5m0":
    "places/ChIJZzgtHTW32YgR-k9p8IqD5m0/photos/wfplacediscovery",
  // 2. Red Rooster Harlem — New York, NY
  "ChIJFcYLJw32wokRnP5A9xO9JqM":
    "places/ChIJFcYLJw32wokRnP5A9xO9JqM/photos/wfplacediscovery",
  // 3. Le Bernardin — New York, NY
  "ChIJV7QQ6kdZwokRax4615zpSGU":
    "places/ChIJV7QQ6kdZwokRax4615zpSGU/photos/wfplacediscovery",
  // 4. Sea Salt — Naples, FL
  "ChIJp-Z3mQzh2ogRLZyfV3MShoc":
    "places/ChIJp-Z3mQzh2ogRLZyfV3MShoc/photos/wfplacediscovery",
  // 5. Chef Creole Seasoned Restaurant — Miami, FL
  "ChIJPeQtHkOx2YgR4SI1-m0ugng":
    "places/ChIJPeQtHkOx2YgR4SI1-m0ugng/photos/wfplacediscovery",
  // 6. Steak 954 — Fort Lauderdale, FL
  "ChIJGUenndMB2YgR3IXwJ2YfGIA":
    "places/ChIJGUenndMB2YgR3IXwJ2YfGIA/photos/wfplacediscovery",
  // 7. Roots Southern Table — Farmers Branch, TX
  "ChIJaRaBhbcnTIYRWorlkgfpBGM":
    "places/ChIJaRaBhbcnTIYRWorlkgfpBGM/photos/wfplacediscovery",
});
