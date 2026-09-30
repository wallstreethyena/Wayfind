// lib/guideSpotPhotos.js — the photo each guide map card may show.
//
// 2026-09-30 (owner): a guide never shows a Google photo without Google's
// required visible credit, and the map-explorer cards (RailCard) have no room
// for that credit. So, per spot, in the owner's order of preference:
//   1-3. Wayfind-owned, creator/business-submitted or licensed free photo of
//        that exact place (wf_place_photo via lib/freePhoto.js findFreePhoto;
//        one row per place, whatever its source), shown with its licence
//        credit (RailCard's credit badge);
//   4.   a Google photo is NOT an option on these cards;
//   else no photo: the card's existing monogram state.
// A spot whose image is already non-Google (a local or partner image) keeps
// it untouched. Read-only; never calls Google.
import { isGooglePhotoSrc } from "./googlePhotoSrc.js";

const PLACE_ID_RX = /^ChIJ[A-Za-z0-9_-]{10,200}$/;

function creditLine(free) {
  const text = String(free.attributionText || "").trim();
  const license = String(free.license || "").trim();
  if (!text) return null;
  return license && !text.includes(license) ? `${text} (${license})` : text;
}

/**
 * spots: [{ id, image?, photo?, photoPlaceId? }]. Returns new spot objects;
 * never mutates. `findFreePhoto` is injected (lib/freePhoto.js in pages, a
 * fake in guards). A lookup that fails means "no licensed photo", never a
 * thrown page.
 */
export async function withAttributableSpotPhotos(spots, { findFreePhoto: lookupLicensed } = {}) {
  const list = Array.isArray(spots) ? spots : [];
  return Promise.all(list.map(async (spot) => {
    if (!spot || typeof spot !== "object") return spot;
    const current = spot.image || spot.photo || null;
    if (current && !isGooglePhotoSrc(current)) return spot;
    const placeId = String(spot.photoPlaceId || spot.id || "");
    let free = null;
    if (PLACE_ID_RX.test(placeId) && typeof lookupLicensed === "function") {
      try { free = await lookupLicensed({ placeId, width: 800 }); } catch { free = null; }
    }
    const credit = free && free.url && !isGooglePhotoSrc(free.url) && free.attributionUrl ? creditLine(free) : null;
    if (credit) {
      return { ...spot, image: free.url, photo: null, photoAttr: credit, photoAttrHref: free.attributionUrl, photoSource: free.source || "licensed" };
    }
    return { ...spot, image: null, photo: null, photoAttr: null, photoAttrHref: null, photoSource: null };
  }));
}
