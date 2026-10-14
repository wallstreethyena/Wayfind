// lib/christmasPhotos.js: licensed venue photos for Christmas cards (Wikimedia Commons).
// Provenance source of truth: data/christmas-photo-provenance.json;
// scripts/check-christmas-photo-provenance.mjs keeps this map and that file equal.
// Each entry: research id -> { file, credit, href }. Files live in public/events/christmas/.
export const CHRISTMAS_LICENSED_PHOTOS = Object.freeze({
  "legoland-christmas-bricktacular-2026": {
    "file": "legoland-christmas-bricktacular-2026.webp",
    "credit": "A. Heneen · CC BY-SA",
    "href": "https://commons.wikimedia.org/wiki/File:Legoland_Florida_sign.jpg"
  },
  "stetson-mansion-christmas-2026-2": {
    "file": "stetson-mansion-christmas-2026-2.webp",
    "credit": "DanTD · CC BY-SA",
    "href": "https://commons.wikimedia.org/wiki/File:Stetson_Mansion_Driveway_Gate.jpg"
  },
  "nights-of-lights-staug-2026": {
    "file": "nights-of-lights-staug-2026.webp",
    "credit": "Diego Delso, delso.photo · CC BY-SA 3.0",
    "href": "https://commons.wikimedia.org/wiki/File:Flagler_College,_St._Augustine,_Florida,_USA4.jpg"
  },
  "dickens-on-centre-2026": {
    "file": "dickens-on-centre-2026.webp",
    "credit": "Ebyabe · CC BY-SA",
    "href": "https://commons.wikimedia.org/wiki/File:Fernandina_Beach_FL_HD_Centre_Street02.jpg"
  },
  "delray-100ft-tree-2026": {
    "file": "delray-100ft-tree-2026.webp",
    "credit": "Ebyabe · CC BY-SA",
    "href": "https://commons.wikimedia.org/wiki/File:Delray_Beach_FL_Delray_Beach_Schools_Crest_Thtr01.jpg"
  },
  "fishermens-village-festival-of-lights-2026": {
    "file": "fishermens-village-festival-of-lights-2026.webp",
    "credit": "PCHS-NJROTC · CC BY-SA",
    "href": "https://commons.wikimedia.org/wiki/File:Sunset_at_Fisherman%E2%80%99s_Village.jpg"
  },
  "selby-lights-in-bloom-2026": {
    "file": "selby-lights-in-bloom-2026.webp",
    "credit": "Daderot · CC0",
    "href": "https://commons.wikimedia.org/wiki/File:Walkway_-_Marie_Selby_Botanical_Gardens_-_Sarasota,_Florida_-_DSC01620.jpg"
  },
  "cf-zoo-lantern-festival-2026": {
    "file": "cf-zoo-lantern-festival-2026.webp",
    "credit": "Zrowny · CC BY-SA",
    "href": "https://commons.wikimedia.org/wiki/File:Central_Florida_Zoo_Entrance.jpg"
  },
  "boca-tree-lighting-2026": {
    "file": "boca-tree-lighting-2026.webp",
    "credit": "Elfguy (English Wikipedia) · PD",
    "href": "https://commons.wikimedia.org/wiki/File:Mizner_Park.jpg"
  },
});

// Adds hero_image (venue photo) and its visible credit when a licensed photo exists.
export function withChristmasPhoto(row, id = row?.christmas_research_id || row?.event_id) {
  const p = CHRISTMAS_LICENSED_PHOTOS[id];
  if (!row || !p) return row;
  return { ...row, hero_image: "/events/christmas/" + p.file, hero_image_kind: "venue", image_is_venue: true, photoAttr: p.credit, photoAttrHref: p.href || null };
}
