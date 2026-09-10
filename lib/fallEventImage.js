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
  // Exact owned venue photos verified for the September 10 Sarasota publication.
  "sarasota-opera-food-wine-2026": "ChIJ6_YRRRJAw4gRE5XF42pZOxo",
  "lights-at-spooky-point-2026": "ChIJNwQxUnFDw4gRlEruVgcCmu0",
  "siesta-key-scarecrow-stroll-2026": "ChIJSZdWvAlqw4gRo53EHrAL5gU",
  "fruitville-grove-pumpkin-2026": "ChIJhWqZvoVHw4gRehUSFsbZARo",
  "wellen-park-oktoberfest-2026": "ChIJJQVMQuJXw4gRhD0CpEOETGo",
  "dakin-harvest-festival-2026": "ChIJB_GKfW81w4gRsCQHi5hjasA",
  "sarasota-oktoberfest-benderson-2026": "ChIJczkDFL04w4gRwfowcSv8Tro",
  "mpac-carrie-2026": "ChIJB-QyVtEXw4gRk5F8bn3YV28",
  "goblin-gathering-bradenton-2026": "ChIJhW6JF_MWw4gRUxIRevnpN4k",
  "boo-at-the-bay-2026": "ChIJLZ2vzRxBw4gRMOtW0ArhBhw",
  "sharktoberfest-mote-2026": "ChIJRyOEfAo5w4gR664aD_YYBLU",
  "selby-spooktacular-2026": "ChIJPTvxtmpAw4gReToYD5mTNwE",
  "hocus-pocus-pops-ii-2026": "ChIJTRfRfgpBw4gR-u488ol_SOw",
  "freedom-factory-halloween-destruction-2026": "ChIJdSO-6RIxw4gR8mqEBQELC84",
  "wellen-park-spooktacular-2026": "ChIJJQVMQuJXw4gRhD0CpEOETGo",
  "sarasota-boos-booze-bar-crawl-2026": "ChIJzcd5L6hBw4gRAON6hbly9cE",
  "sarasota-medieval-fair-2026": "ChIJS2qQ6sw1w4gRUJfWmSdAvXE",
  "amber-brooke-fall-festival-2026": "ChIJkyg5UW6654gRECAKyCherD8",
  "great-scott-fall-fest-2026": "ChIJ68SLYriZ54gRaJgw169KqYA",
  "southern-hill-farms-fall-festival-2026": "ChIJ-aI9NvSI54gRrVByB84z-AY",
  "clermont-harvest-festival-2026": "ChIJQZ8lbY-O54gRJSKIfjA-Wr4",
  // Lane C (2026-09-06) — Miami / South Florida Fall 2026. Every id below was
  // proven against LIVE wf_inventory on 2026-09-06 (OPERATIONAL, not
  // excluded, owned photo_ref present, coordinates within 0.6 mi of the
  // sourced event row) — the proof rows are checked in at
  // scripts/fixtures/fall-venue-identity-proof-2026-09-06.json and
  // scripts/test-fall-venue-identity.mjs re-asserts them. No Places call was
  // spent: these venues were already owned. No fuzzy-name identity: each is
  // the exact intended venue named on the official event page.
  "the-horrorland-jungle-island-2026": "ChIJkWXRuBC02YgRripCIoUAN9g", // Jungle Island
  "house-of-horror-carnival-2026": "ChIJcxJRMYe42YgRDSlj6Z_CDxk", // Tropical Park
  "nightmare-village-xtreme-action-park-2026": "ChIJhdEC7MUD2YgRWqeIwaYujc4", // Xtreme Action Park
  "not-so-scary-halloween-bash-miami-childrens-museum-2026": "ChIJoVWX_Rm02YgRllHsIZGN16c", // Miami Children's Museum
  "zoo-boo-zoo-miami-2026": "ChIJFY7wCsjD2YgRn8R_2IMRjtw", // Zoo Miami
  "roars-smores-snores-spooktacular-campout-zoo-miami-2026": "ChIJFY7wCsjD2YgRn8R_2IMRjtw", // Zoo Miami
  "zoo-miami-monster-masquerade-2026": "ChIJFY7wCsjD2YgRn8R_2IMRjtw", // Zoo Miami
  "bonnet-house-halloween-fest-2026": "ChIJOzaIz9AB2YgRJozqXFy4BIw", // Bonnet House Museum & Gardens
  "boo-in-bloom-fruit-spice-park-2026": "ChIJM6cv59Pn2YgRdXaKYZKWWms", // Fruit & Spice Park
  "halloween-at-faena-miami-beach-2026": "ChIJBVShAmez2YgRvNWv6nIzzzY", // Faena Miami Beach
  // Pompano: the official page names "Community Park | 1801 NE 6th Street";
  // the owned row "Pompano Community Park" sits 0.55 mi from the sourced
  // event point. Name + address + coordinates agree — proof, not a guess.
  "boo-bash-pompano-beach-2026": "ChIJb2lV-JgC2YgRBh1dLP6EQlw", // Pompano Community Park
  // 2026-09-08 Sarasota evidence audit — each is an already-owned production
  // venue identity with a verified photo, so the fall card can show the
  // named venue rather than collection art.
  "ghostbusters-in-concert-van-wezel-2026": "ChIJew4bcA9Aw4gR3bU-SA7qAgU", // Van Wezel
  "trick-or-treat-on-the-lake-benderson-2026": "ChIJczkDFL04w4gRwfowcSv8Tro", // Nathan Benderson Park
  "venice-night-market-halloween-2026": "ChIJg1HuP9xbw4gRs9PHCFmC4VU", // Maxine Barritt Park
  "sun-fiesta-venice-2026": "ChIJu73by6Rbw4gR857K3YRfLQo", // Venice Centennial Park
  "night-of-wonder-ringling-2026": "ChIJ6y2dx9g_w4gRWoZIRhLk-JI", // The Ringling
  "uf-ifas-edfest-plant-sale-2026": "ChIJ8SekLo9Gw4gR81Gftma1QvU", // Twin Lakes Park
  "wellen-park-wine-festival-2026": "ChIJJQVMQuJXw4gRhD0CpEOETGo", // Downtown Wellen Park
  "utc-night-market-tailgate-2026-09-17": "ChIJHcu6u2BHw4gRDKuRC9sow20", // UTC
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
