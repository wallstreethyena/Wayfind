// lib/christmasPhotos.js: licensed venue photos for Christmas cards.
// Source of truth for provenance is data/christmas-photo-provenance.json;
// scripts/check-christmas-photo-provenance.mjs keeps this map and that file equal.
// Each entry: research id -> { file, credit, href }. Files live in public/events/christmas/.
export const CHRISTMAS_LICENSED_PHOTOS = Object.freeze({});

// Adds hero_image (venue photo) and its visible credit when a licensed photo exists.
export function withChristmasPhoto(row, id = row?.christmas_research_id || row?.event_id) {
  const p = CHRISTMAS_LICENSED_PHOTOS[id];
  if (!row || !p) return row;
  return { ...row, hero_image: "/events/christmas/" + p.file, hero_image_kind: "venue", image_is_venue: true, photoAttr: p.credit, photoAttrHref: p.href || null };
}
