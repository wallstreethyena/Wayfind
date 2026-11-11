// lib/christmasPhotos.js: licensed venue photos for Christmas cards (Wikimedia Commons).
// Provenance source of truth: data/christmas-photo-provenance.json;
// scripts/check-christmas-photo-provenance.mjs keeps this map and that file equal.
// Each entry: research id -> { file, credit, href }. Files live in public/events/christmas/.
export const CHRISTMAS_LICENSED_PHOTOS = Object.freeze({
  "dickens-on-centre-2026": {
    "file": "dickens-on-centre-2026.webp",
    "credit": "Ebyabe · CC BY-SA",
    "href": "https://commons.wikimedia.org/wiki/File:Fernandina_Beach_FL_HD_Centre_Street02.jpg"
  },
  "selby-lights-in-bloom-2026": {
    "file": "selby-lights-in-bloom-2026.jpg",
    "credit": "Kimberli Mäkäräinen · CC BY-SA 4.0",
    "href": "https://commons.wikimedia.org/wiki/File:Marie_Selby_Botanical_Gardens_12DEC2024.jpg"
  },
  "delray-100ft-tree-2026": {
    "file": "delray-100ft-tree-2026.jpg",
    "credit": "Gatorfan252525 · CC BY-SA 4.0",
    "href": "https://commons.wikimedia.org/wiki/File:Christmas_tree_on_display_in_Delray_Beach,_Florida_on_Atlantic_Avenue.jpg"
  },
});

// Adds hero_image (venue photo) and its visible credit when a licensed photo exists.
export function withChristmasPhoto(row, id = row?.christmas_research_id || row?.event_id) {
  const p = CHRISTMAS_LICENSED_PHOTOS[id];
  if (!row || !p) return row;
  return { ...row, hero_image: "/events/christmas/" + p.file, hero_image_kind: "venue", image_is_venue: true, photoAttr: p.credit, photoAttrHref: p.href || null };
}
