// A collection poster identifies the Fall in Florida rail. It is not a photo
// of Haraz House, a pottery studio, a farm, or any other named destination.
// Legacy seeded rows may still carry this value, so the serve-time boundary
// must reject it even after the source registry is corrected.
import { cardImageSrc } from "./placePhoto.js";

export const FALL_COLLECTION_POSTER = "/cards-v8/augtober-760.webp";

// Exact venue identities resolved from Wayfind's own place search. Kept at the
// serve boundary so a lagging wf_events seed cannot turn a known venue back
// into an image-less, direction-less card.
export const FALL_EVENT_VENUE_PLACE_IDS = Object.freeze({
  "amber-brooke-fall-festival-2026": "ChIJkyg5UW6654gRECAKyCherD8",
  "great-scott-fall-fest-2026": "ChIJ68SLYriZ54gRaJgw169KqYA",
  "southern-hill-farms-fall-festival-2026": "ChIJ-aI9NvSI54gRrVByB84z-AY",
  "clermont-harvest-festival-2026": "ChIJQZ8lbY-O54gRJSKIfjA-Wr4",
});

export function withFallVenueIdentity(row) {
  if (!row || row.place_id) return row;
  const placeId = FALL_EVENT_VENUE_PLACE_IDS[row.event_id];
  return placeId ? { ...row, place_id: placeId } : row;
}

export function fallEventCardImageSrc(event, w = 640, inventoryRow = null) {
  const hero = String(event?.hero_image || "").trim();
  if (hero && hero !== FALL_COLLECTION_POSTER) return hero;
  return cardImageSrc({
    place_id: event?.place_id,
    photo_ref: inventoryRow?.photo_ref,
    photo_url: inventoryRow?.photo_url,
  }, w);
}

const HEALTH_FIELDS = ["link_ok", "link_verdict", "link_checked_at", "link_final_url"];

// The checked-in registry contains the owner's newest verified identity facts.
// A lagging seed must not erase its place_id, coordinates or copy, while the
// database remains authoritative for mutable link-health verdicts and any
// real event-specific photo harvested after publication.
export function mergeFallDiscoveryRows(databaseRows, discoveries) {
  const dbRows = Array.isArray(databaseRows) ? databaseRows : [];
  const sourceRows = Array.isArray(discoveries) ? discoveries : [];
  const dbById = new Map(dbRows.filter((row) => row?.event_id).map((row) => [row.event_id, row]));
  const sourceIds = new Set(sourceRows.map((row) => row?.event_id).filter(Boolean));
  const merged = sourceRows.map((source) => {
    const db = dbById.get(source.event_id);
    if (!db) return source;
    const row = { ...db, ...source };
    const sourceHero = String(source.hero_image || "").trim();
    const dbHero = String(db.hero_image || "").trim();
    row.hero_image = sourceHero || (dbHero && dbHero !== FALL_COLLECTION_POSTER ? dbHero : null);
    for (const field of HEALTH_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(db, field)) row[field] = db[field];
    }
    return row;
  });
  return [...dbRows.filter((row) => !sourceIds.has(row?.event_id)), ...merged].map(withFallVenueIdentity);
}
