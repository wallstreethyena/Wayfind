// Google Places photos for the haunt cards on /halloween-in-florida.
//
// FREE LANE ONLY. This reads wf_google_photo_store through the existing
// readStoredGooglePhoto() (lib/googlePhotoStore.js): a database read, never a
// Google call, never a ledger grant, no new SKU, no cap change. A venue gets a
// Google photo only when that exact Google place id already has a READY stored
// photo with its same-photo author credit. A photo the owner removed, or a place
// with nothing stored, simply yields nothing: a card with fewer photos is better
// than a wrong photo (owner rule).
//
// The place ids are the venue's own Google listing, never a neighbour's.
import { readStoredGooglePhoto } from "./googlePhotoStore.js";

export const MAX_HAUNT_PHOTOS = 5;

// haunt id -> exact Google place id of the venue (or the event's own listing).
export const HAUNT_GOOGLE_PLACE = Object.freeze({
  howlTampa: "ChIJDyeQAFLGwogRiPv7rOjgl90", // "Busch Gardens Tampa Bay Howl-O-Scream" listing
  howlOrlando: "ChIJfyPWjCh-54gR1SvWozmef5k", // SeaWorld Orlando
  hhn: "ChIJvRBCrN9-54gRGZuuaCLGrQE", // Universal Orlando Resort
  zooTampa: "ChIJBQ5SjLHGwogRL4X19g4J5tI", // ZooTampa at Lowry Park
  mickey: "ChIJgUulalN-3YgRGoTaWM2LawY", // Magic Kingdom Park
  spooktacular: "ChIJfyPWjCh-54gR1SvWozmef5k", // SeaWorld Orlando
  peppa: "ChIJu5o2QZAN3YgRMruJ3jk1KG8", // PEPPA PIG Theme Park Florida
  spookquarium: "ChIJiZrtZSvxwogRE9eu4Xpy9Yc", // Clearwater Marine Aquarium
  petrified: "ChIJaRU86ORx54gRK3zyCcF94hw", // A Petrified Forest Scare Trail
  undead: "ChIJnf4V7fDEwogRSLy2fzGSEvE", // American Victory Ship & Museum
  frightfest: "ChIJPWsUhY9Aw4gRoltOtGa3nPM", // Sarasota Fairgrounds
});

const plain = (t) => String(t || "").replace(/[-–—]/g, " ").replace(/\s{2,}/g, " ").trim();

/** One strip entry from a stored Google photo: { src, alt, credit, width, height, source, author, authorUri, mapsUri }. */
export function googleStripPhoto(row, stored) {
  if (!stored || stored.source !== "google" || !/^\/api\/photo\/stored\/[A-Za-z0-9_-]+\?v=[a-f0-9]{64}$/.test(stored.src || "")) return null;
  const c = stored.credit || {};
  const authors = Array.isArray(c.authors) ? c.authors : [];
  const author = plain((authors[0] && (authors[0].name || authors[0].displayName)) || c.name || "");
  if (!author) return null;
  return {
    src: stored.src,
    width: stored.width,
    height: stored.height,
    alt: plain("Photo of " + (row.venueName || row.where || row.name) + " from Google Maps"),
    credit: "Photo by " + author + " on Google Maps",
    source: "google",
    author,
    authorUri: (authors[0] && authors[0].uri) || c.uri || null,
    mapsUri: c.mapsUri || null,
  };
}

/** The owner/partner photo (photo 1) first, then Google photos, at most five, no repeats. */
export function mergeHauntPhotos(row, googlePhotos) {
  const out = [];
  if (row.photo && row.photo.src) {
    out.push({ src: row.photo.src, width: row.photo.width, height: row.photo.height, alt: row.photo.alt, credit: row.photo.credit || "", source: "owned" });
  }
  for (const g of googlePhotos || []) {
    if (g && !out.some((p) => p.src === g.src)) out.push(g);
  }
  return out.slice(0, MAX_HAUNT_PHOTOS);
}

/** Server side: returns the model with `photos` filled (Google photos read from the free store). */
export async function withHauntPhotos(model, deps = {}) {
  const read = deps.read || readStoredGooglePhoto;
  const haunts = await Promise.all(model.haunts.map(async (row) => {
    const id = Object.hasOwn(HAUNT_GOOGLE_PLACE, row.id) ? HAUNT_GOOGLE_PLACE[row.id] : null;
    let google = [];
    if (id) {
      try { google = [googleStripPhoto(row, await read(id, deps.storeDeps))].filter(Boolean); } catch { google = []; }
    }
    return { ...row, photos: mergeHauntPhotos(row, google) };
  }));
  return { ...model, haunts };
}
