// The photo list a place detail page shows. A place page follows the card:
// signals.photos in stored order, cover first, then Christmas and haunt
// gallery photos the card list does not already carry, deduped, at most 14.
// A named haunt event still uses that card's own list. SeaWorld Orlando does
// not mix Howl-O-Scream and Spooktacular. Reads only. Never writes a place row.
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

function galleryEntry(item) {
  if (!item || typeof item !== "object") return null;
  const url = String(item.url || item.vault_url || "").trim();
  if (!url) return null;
  return {
    url,
    storage_path: item.storage_path,
    width: item.width,
    height: item.height,
    attribution_text: item.attribution_text || item.credit || "",
    attribution_url: item.attribution_url,
    source_ref: item.source_ref || item.original_url || item.image_url || "",
    haunt_key: item.haunt_key || null,
    christmas_keys: item.christmas_keys || null,
    cover: item.cover === true,
    phash: item.phash || null,
  };
}

function entriesFromSignals(signals) {
  if (!signals || typeof signals !== "object") return [];
  const out = [];
  for (const list of [signals.photo_gallery, signals.haunt_photo_gallery, signals.christmas_photo_gallery]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const entry = galleryEntry(item);
      if (entry) out.push(entry);
    }
  }
  return out;
}

function entryUrl(entry) {
  return String(entry && (entry.url || entry.vault_url) || "").trim();
}

function sourceRefKey(entry) {
  return String(entry && (entry.source_ref || entry.original_url || entry.image_url) || "").trim().toLowerCase();
}

function usableRailUrl(url) {
  return isPlaceOwnedPhotoUrl(url) || isStoredPlacePhotoUrl(url);
}

function railPhoto(url, entry, name, source) {
  return {
    src: url,
    alt: name ? "Photo of " + name : "",
    credit: "",
    source,
    phash: entry && entry.phash || null,
    width: entry && entry.width,
    height: entry && entry.height,
  };
}

/**
 * Place page rail. The card list is signals.photos, cover first. Christmas
 * and haunt galleries are appended when the place card does not already
 * carry them. A shared venue does not mix the two haunts' tagged photos.
 * Distinct card URLs stay even when they share a homepage source_ref.
 * A second gallery URL of a picture already accepted is still dropped.
 */
function assemblePlaceCardRail({ placeId, name = "", coverSrc = "", signals = null, vaultEntries = [], googleStored = null } = {}) {
  const shared = hauntIdsForPlace(placeId).length > 1;
  const signalEntries = entriesFromSignals(signals);
  const vaultList = (Array.isArray(vaultEntries) ? vaultEntries : []).map(galleryEntry).filter(Boolean);
  const taggedUrls = new Set();
  const byUrl = new Map();
  for (const entry of [...signalEntries, ...vaultList]) {
    const url = entryUrl(entry);
    if (!url) continue;
    if (entry.haunt_key) taggedUrls.add(url);
    const key = normalizePhotoUrl(url);
    if (key && !byUrl.has(key)) byUrl.set(key, entry);
  }
  const cardUrls = [];
  if (signals && Array.isArray(signals.photos)) {
    for (const item of signals.photos) {
      const url = typeof item === "string" ? item.trim() : "";
      if (url) cardUrls.push(url);
    }
  }
  if (!cardUrls.length && typeof coverSrc === "string" && usableRailUrl(coverSrc.trim())) cardUrls.push(coverSrc.trim());

  const items = [];
  const acceptedRef = new Set();
  const cardSet = new Set(cardUrls);
  const push = (url, entry, source, { fromCard = false } = {}) => {
    const src = String(url || "").trim();
    if (!src || !usableRailUrl(src)) return;
    if (shared && taggedUrls.has(src)) return;
    const ref = sourceRefKey(entry);
    if (!fromCard && ref && acceptedRef.has(ref)) return;
    if (ref) acceptedRef.add(ref);
    items.push(railPhoto(src, entry, name, source));
  };
  const entryFor = (url) => byUrl.get(normalizePhotoUrl(url)) || null;

  for (const url of cardUrls) push(url, entryFor(url), "signals", { fromCard: true });

  const christmas = signalEntries.filter((entry) => Array.isArray(entry.christmas_keys));
  for (const entry of [...christmas.filter((entry) => entry.cover), ...christmas.filter((entry) => !entry.cover)]) {
    push(entry.url, entry, "christmas");
  }
  if (!shared) {
    for (const entry of signalEntries) {
      if (!entry.haunt_key) continue;
      push(entry.url, entry, "haunt");
    }
    for (const entry of vaultList) {
      if (entry.haunt_key && taggedUrls.has(entry.url)) push(entry.url, entry, "haunt");
      else if (!entry.haunt_key && !cardSet.has(entry.url)) push(entry.url, entry, "vault");
    }
  } else {
    for (const entry of vaultList) {
      if (!entry.haunt_key) push(entry.url, entry, "vault");
    }
  }
  for (const entry of signalEntries) {
    if (entry.haunt_key || entry.christmas_keys) continue;
    push(entry.url, entry, "vault");
  }

  if (!shared && googleStored) {
    const google = googleStripPhoto({ id: "", name, venueName: name, where: name }, googleStored);
    if (google && google.src) items.push({ ...google, phash: null });
  }
  return dedupePhotos(items).slice(0, MAX_HAUNT_PHOTOS);
}

/**
 * Pure. A named haunt keeps that card's filtered list. A place page follows
 * signals.photos (the card), then Christmas and haunt galleries, cover first,
 * at most 14.
 */
export function assemblePlaceDetailPhotos({ placeId, hauntId = null, name = "", coverSrc = "", signals = null, vaultEntries = [], googleStored = null } = {}) {
  if (!hauntId) return assemblePlaceCardRail({ placeId, name, coverSrc, signals, vaultEntries, googleStored });
  const row = { id: hauntId || "", name, venueName: name, where: name };
  const coverOk = typeof coverSrc === "string" && usableRailUrl(coverSrc);
  const cover = coverOk ? { src: coverSrc, alt: name ? "Photo of " + name : "", credit: "", source: "owned" } : null;
  const entries = dedupeVaultEntries([...(Array.isArray(vaultEntries) ? vaultEntries : []), ...entriesFromSignals(signals).filter((entry) => !entry.christmas_keys)]);
  let vaulted = photosForHaunt(hauntId, placeId, entries.map((entry) => vaultStripPhoto(row, entry)).filter(Boolean));
  vaulted = vaulted.filter((photo) => !hauntPhotoBlocked(hauntId, photo && photo.src));
  const shared = hauntIdsForPlace(placeId).length > 1;
  const google = !shared && googleStored ? googleStripPhoto(row, googleStored) : null;
  const merged = mergeHauntPhotos({ photo: cover }, [google, ...vaulted].filter(Boolean));
  const seen = new Set(merged.map((photo) => normalizePhotoUrl(photo.src)));
  const taggedUrls = new Set(entries.filter((entry) => entry && entry.haunt_key).map((entry) => entryUrl(entry)).filter(Boolean));
  if (signals && Array.isArray(signals.photos)) {
    for (const item of signals.photos) {
      const url = typeof item === "string" ? item.trim() : "";
      if (!url || seen.has(normalizePhotoUrl(url))) continue;
      if (shared && taggedUrls.has(url)) continue;
      if (!usableRailUrl(url)) continue;
      seen.add(normalizePhotoUrl(url));
      merged.push(railPhoto(url, null, name, "signals"));
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
  // A named event keeps that card. A place page with inventory signals follows
  // the card list instead of replacing it with a cached one haunt vault read.
  const hauntId = opts.hauntId || (!opts.signals && ids.length === 1 ? ids[0] : null);
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
