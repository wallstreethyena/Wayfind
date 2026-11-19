// lib/inventoryDetailGallery.js — the ONE place an inventory place's detail
// gallery is assembled, shared by /api/places/details (what the detail panel
// renders) and app/p/[id]/page.js (the hero preload), so the preloaded image
// and the rendered hero cannot drift apart.
//
// DESKTOP LCP (2026-11-18 alert, 2688ms p75): a /p/<id> visit rendered the app
// shell, then the client asked /api/places/details, then the photo lane, and
// only THEN started the hero image: Lighthouse desktop measured LCP 9019ms with
// a 7070ms "load delay" before the hero request even began. The server already
// knows the hero (same reads, no Google spend), so the page now hands the
// browser a high-priority preload for exactly that URL in the first HTML.
import { getInventoryIdentity } from "./inventoryIdentity.js";
import { loadPlaceDetailPhotos } from "./placeDetailGallery.js";
import { isPlaceOwnedPhotoUrl } from "./placePhoto.js";

export function inventoryCoverSrc(signals) {
  const s = signals || {};
  return typeof s.photo_url === "string" ? s.photo_url : (typeof s.photoUrl === "string" ? s.photoUrl : "");
}

/** The detail gallery for an inventory row (never throws; [] on any failure). */
export async function inventoryDetailGallery(row) {
  if (!row || !row.place_id) return [];
  const signals = row.signals || {};
  try {
    return (await loadPlaceDetailPhotos(row.place_id, { name: row.name, signals, coverSrc: inventoryCoverSrc(signals) })) || [];
  } catch {
    return [];
  }
}

const STORED_PHOTO_RX = /^\/api\/photo\/stored\/[A-Za-z0-9_-]+\?v=[a-f0-9]{64}$/;

/**
 * The hero URL worth preloading: the gallery's first photo, only when it is a
 * image the panel renders as-is (a stored, versioned photo, an owned /path
 * image, or an owned photo on the venue's https host). Anything resolved later in the browser (/api/photo JSON
 * lane, remote hosts) returns null: a preload is never a guess.
 */
export function heroPreloadSrc(gallery) {
  const first = Array.isArray(gallery) && gallery[0] && typeof gallery[0].src === "string" ? gallery[0].src.trim() : "";
  if (!first) return null;
  if (STORED_PHOTO_RX.test(first)) return first;
  if (/[\s"'<>]/.test(first)) return null;
  if (first.startsWith("/") && !first.startsWith("//") && !first.startsWith("/api/")) return first;
  // Owned photos on a venue's own https host render as-is in the panel too
  // (PlaceDetailPhotoHeader railPhotos / CardPhoto's ordinary <img>).
  if (/^https:\/\//.test(first) && isPlaceOwnedPhotoUrl(first)) return first;
  return null;
}

/** Hero preload for /p/<id>, bounded so it can never slow the page: null after timeoutMs. */
export async function placeHeroPreloadSrc(placeId, { placeParam = "", timeoutMs = 350, identity = getInventoryIdentity, gallery = inventoryDetailGallery } = {}) {
  if (typeof placeId !== "string" || !/^[A-Za-z0-9_-]{6,}$/.test(placeId)) return null;
  // app/home.js opens params.get("place") ahead of the path id: preload only
  // the place the client will actually render.
  if (placeParam && placeParam !== placeId) return null;
  let timer = null;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
  const work = (async () => {
    try {
      const row = await identity(placeId);
      if (!row || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return null;
      return heroPreloadSrc(await gallery(row));
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
