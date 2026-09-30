// lib/photoWorthy.js — IS THIS A PLACE PEOPLE ACTUALLY PHOTOGRAPH?
//
// Owner, 2026-09-30: "if there are instagrammable places make sure we add that
// element there also." Wayfind has no "instagrammable" inventory flag, and a
// type or name guess ("it's a pier, so it must be photogenic") is a claim we
// cannot back. So the answer comes ONLY from two kinds of proof we already own:
//
//   1. "creator"  real Instagram/TikTok creators filmed this place
//                 (lib/creatorSignals.js, the same registry the card's creator
//                 mark reads). Strongest proof: someone posted it.
//   2. "curated"  a hand-written lib/curated.js entry tagged instagrammable,
//                 rooftop or view, matched by exact name in the same city.
//
// Anything else returns null. Never a heuristic, never a guess.
//
// PURE and server safe: no I/O, no React, no clock.
import { creatorCountFor } from "./creatorSignals.js";
import { CURATED } from "./curated.js";

const PHOTO_TAGS = new Set(["instagrammable", "rooftop", "view"]);

export const PHOTO_WORTHY_COPY = {
  creator: "Filmed by local creators",
  curated: "A photo stop worth planning",
};

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// "St. Pete" and "St. Petersburg" are one city in every source we read.
const cityKey = (s) => norm(s).replace(/\bst pete\b(?! beach)/g, "st petersburg").replace(/\bsaint\b/g, "st");

const CURATED_PHOTO = new Map();
for (const entry of CURATED) {
  if (!entry || !entry.name || !Array.isArray(entry.tags)) continue;
  if (!entry.tags.some((t) => PHOTO_TAGS.has(t))) continue;
  const key = norm(entry.name);
  if (!key) continue;
  const list = CURATED_PHOTO.get(key) || [];
  list.push(cityKey(entry.area));
  CURATED_PHOTO.set(key, list);
}

function curatedPhotoStop(place, locName) {
  const areas = CURATED_PHOTO.get(norm(place && place.name));
  if (!areas) return false;
  // City gated: a Sarasota rooftop never vouches for a same named bar in
  // Tampa. With no city to check against, the name alone is not proof.
  const city = cityKey(locName || (place && place.city));
  if (!city) return false;
  return areas.some((a) => a && (city === a || city.includes(a) || a.includes(city)));
}

/**
 * @param {{id?:string,name?:string,city?:string,address?:string}} place
 * @param {string|null} [locName] the event's city
 * @returns {{level:"creator"|"curated", copy:string}|null}
 */
export function photoWorthy(place, locName) {
  if (!place || !place.name) return null;
  let creators = 0;
  try { creators = creatorCountFor(place, locName || place.city || null); } catch { creators = 0; }
  if (creators >= 1) return { level: "creator", copy: PHOTO_WORTHY_COPY.creator };
  if (curatedPhotoStop(place, locName)) return { level: "curated", copy: PHOTO_WORTHY_COPY.curated };
  return null;
}
