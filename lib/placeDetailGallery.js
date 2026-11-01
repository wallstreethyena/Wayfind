// The photo list a place detail page shows. It is the same list the Halloween
// card builds in lib/halloweenHauntPhotos.js: cover first, then a stored Google
// photo (never on a place two events share), then vaulted photos from
// wf_place_photo, signals.photo_gallery and signals.haunt_photo_gallery.
// signals.photos is included for a place that is not shared by two events.
// Tagged haunt photos stay on their own event. SeaWorld Orlando does not mix
// Howl-O-Scream and Spooktacular. Reads only. Never writes a place row.
import { dedupePhotos, normalizePhotoUrl } from "./photoDedupe.js";
import { isPlaceOwnedPhotoUrl, isStoredPlacePhotoUrl } from "./placePhoto.js";
import {
  HAUNT_GOOGLE_PLACE,
  MAX_HAUNT_PHOTOS,
  dedupeVaultEntries,
  googleStripPhoto,
  hauntIdsForPlace,
  hauntPhotoBlocked,
  mergeHauntPhotos,
  photosForHaunt,
  readVaultedPlacePhotos,
  vaultStripPhoto,
  withHauntPhotos,
} from "./halloweenHauntPhotos.js";
import { readStoredGooglePhoto } from "./googlePhotoStore.js";
import { readChristmasEventPhotos } from "./christmasPlacePhotos.js";
import { hauntDetailSeedByHref, hauntDetailSeedById } from "./halloweenHauntVault.js";

export { hauntIdsForPlace };

// Static event and place pages cannot use cache:"no-store" (Next throws
// "Page changed from static to dynamic at runtime"). The photo read is cached
// for the same window as the Halloween page.
export function detailGalleryFetch(revalidateSeconds = 600) {
  const seconds = Number.isFinite(revalidateSeconds) && revalidateSeconds > 0 ? revalidateSeconds : 600;
  return (url, init = {}) => {
    const next = { ...init };
    delete next.cache;
    next.next = { ...(next.next || {}), revalidate: seconds };
    return fetch(url, next);
  };
}

function withCachedReads(deps = {}) {
  if (deps.read || deps.readVault || (deps.storeDeps && deps.storeDeps.fetchImpl)) return deps;
  return { ...deps, storeDeps: { ...(deps.storeDeps || {}), fetchImpl: detailGalleryFetch(600) } };
}

function entriesFromSignals(signals) {
  if (!signals || typeof signals !== "object") return [];
  const out = [];
  for (const list of [signals.photo_gallery, signals.haunt_photo_gallery]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      out.push({
        url: item.url || item.vault_url || "",
        storage_path: item.storage_path,
        width: item.width,
        height: item.height,
        attribution_text: item.attribution_text || item.credit || "",
        attribution_url: item.attribution_url,
        source_ref: item.source_ref || item.original_url || item.image_url || "",
        haunt_key: item.haunt_key || null,
        phash: item.phash || null,
      });
    }
  }
  return out;
}

/**
 * Pure. Cover first, then Google and vault photos, then untagged signals.photos
 * on a place that is not shared. Dedupe by URL and by source picture.
 */
export function assemblePlaceDetailPhotos({ placeId, hauntId = null, name = "", coverSrc = "", signals = null, vaultEntries = [], googleStored = null } = {}) {
  const row = { id: hauntId || "", name, venueName: name, where: name };
  const coverOk = typeof coverSrc === "string" && (isPlaceOwnedPhotoUrl(coverSrc) || isStoredPlacePhotoUrl(coverSrc));
  const cover = coverOk ? { src: coverSrc, alt: name ? "Photo of " + name : "", credit: "", source: "owned" } : null;
  const entries = dedupeVaultEntries([...(Array.isArray(vaultEntries) ? vaultEntries : []), ...entriesFromSignals(signals)]);
  let vaulted = photosForHaunt(hauntId, placeId, entries.map((entry) => vaultStripPhoto(row, entry)).filter(Boolean));
  if (hauntId) vaulted = vaulted.filter((photo) => !hauntPhotoBlocked(hauntId, photo && photo.src));
  const shared = hauntIdsForPlace(placeId).length > 1;
  const google = !shared && googleStored ? googleStripPhoto(row, googleStored) : null;
  const merged = mergeHauntPhotos({ photo: cover }, [google, ...vaulted].filter(Boolean));
  const seen = new Set(merged.map((photo) => normalizePhotoUrl(photo.src)));
  // signals.photos has no event tag. On a shared place, drop any URL that
  // already belongs to a tagged gallery so the two events cannot mix.
  const taggedUrls = new Set(entries.filter((entry) => entry && entry.haunt_key).map((entry) => String(entry.url || entry.vault_url || "").trim()).filter(Boolean));
  if (signals && Array.isArray(signals.photos)) {
    for (const item of signals.photos) {
      const url = typeof item === "string" ? item.trim() : "";
      if (!url || seen.has(normalizePhotoUrl(url))) continue;
      if (shared && taggedUrls.has(url)) continue;
      if (!isPlaceOwnedPhotoUrl(url) && !isStoredPlacePhotoUrl(url)) continue;
      seen.add(normalizePhotoUrl(url));
      merged.push({ src: url, alt: name ? "Photo of " + name : "", credit: "", source: "signals" });
    }
  }
  return dedupePhotos(merged).slice(0, MAX_HAUNT_PHOTOS);
}

async function hauntPhotos(seed, deps) {
  const model = await withHauntPhotos({ haunts: [seed] }, withCachedReads(deps || {}));
  return (model.haunts[0] && model.haunts[0].photos) || [];
}

/** Card photos for one haunt, including its cover. Empty when the id is unknown. */
export async function loadHauntDetailPhotos(hauntId, opts = {}) {
  const seed = opts.hauntSeed || hauntDetailSeedById(hauntId);
  if (!seed) return [];
  const placeId = HAUNT_GOOGLE_PLACE[seed.id];
  if (placeId && opts.placeId && opts.placeId !== placeId) return [];
  return hauntPhotos(seed, opts.deps);
}

/**
 * Photos for a place detail. One haunt at this place uses that card's list.
 * Two haunts (SeaWorld) use a list only when the caller names the haunt;
 * otherwise only untagged venue photos, so the two events never mix.
 */
export async function loadPlaceDetailPhotos(placeId, opts = {}) {
  const place = String(placeId || "");
  const ids = hauntIdsForPlace(place);
  const hauntId = opts.hauntId || (ids.length === 1 ? ids[0] : null);
  if (hauntId) {
    const seed = opts.hauntSeed || hauntDetailSeedById(hauntId);
    const mapped = seed && HAUNT_GOOGLE_PLACE[seed.id];
    if (seed && (!mapped || mapped === place)) return hauntPhotos(seed, opts.deps);
  }
  const deps = withCachedReads(opts.deps || {});
  const readVault = deps.readVault || readVaultedPlacePhotos;
  const read = deps.read || readStoredGooglePhoto;
  let vaultEntries = [];
  let googleStored = null;
  try { vaultEntries = (await readVault(place, deps.storeDeps)) || []; } catch { vaultEntries = []; }
  if (ids.length < 2) {
    try { googleStored = await read(place, deps.storeDeps); } catch { googleStored = null; }
  }
  return assemblePlaceDetailPhotos({
    placeId: place,
    hauntId: null,
    name: opts.name || "",
    coverSrc: opts.coverSrc || "",
    signals: opts.signals || null,
    vaultEntries,
    googleStored,
  });
}

/** The Halloween event page for this path, or [] when the path is not a haunt card. A photo-store miss is an empty rail, never a failed event page. */
export async function loadEventDetailPhotos(eventHref, opts = {}) {
  try {
    const seed = opts.hauntSeed || hauntDetailSeedByHref(eventHref);
    if (!seed) {
      // A Christmas event page shows the same tagged rail as its ticket card.
      const slug = String(eventHref || "").split("/").filter(Boolean).pop() || "";
      const fetchImpl = opts.fetchImpl || detailGalleryFetch();
      return await readChristmasEventPhotos(slug, opts.placeId || null, { fetchImpl, env: opts.env, label: opts.name || "" });
    }
    const placeId = HAUNT_GOOGLE_PLACE[seed.id];
    if (!placeId) return [];
    return await loadPlaceDetailPhotos(placeId, { ...opts, hauntId: seed.id, hauntSeed: seed });
  } catch {
    return [];
  }
}
