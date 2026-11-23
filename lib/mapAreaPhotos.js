// lib/mapAreaPhotos.js — SERVER-ONLY batch photo hydration for /api/places/map
// and /api/places/map/list. Imported ONLY by server route handlers (0 bytes in
// client bundles).
//
// Wires GoWayfind's OWN already-stored photos directly onto map place rows:
//   Tier 1: wf_inventory owned/gallery covers (ownedEntryFromRow — 0 DB queries)
//   Tier 2: wf_place_photo permanent licensed/permitted photos (1 batch REST read)
//           + static curated local place photos (0 DB queries)
//   Tier 3: wf_google_photo_store already-retained Google photos (1 batch REST read)
//
// ZERO external API calls, ZERO Google Places requests, ZERO spendAllow grants,
// ZERO database writes. Exact legal credits (Google Maps + photographer authors,
// CC BY / CC BY-SA license + author, venue permission credit) are ALWAYS kept.
// Every remote batch query is strictly fail-soft so map discovery never breaks.

import { ownedEntryFromRow } from "./placePhotoServe.js";
import { selectFreePhotoRow, LICENSED_SOURCES } from "./freePhoto.js";
import { findCuratedPlacePhoto } from "./curatedPlacePhotos.js";
import { storedGooglePhotoFromRow } from "./googlePhotoStore.js";

const PLACE_ID_RX = /^[A-Za-z0-9_-]{10,256}$/;
const BATCH_CHUNK = 150;

let _cachedVaultMod;
async function loadVaultHelpers() {
  if (_cachedVaultMod !== undefined) return _cachedVaultMod;
  try {
    const mod = await import("./photoVault.js");
    _cachedVaultMod = {
      vaultPublicUrl: typeof mod.vaultPublicUrl === "function" ? mod.vaultPublicUrl : null,
      renditionUrl: typeof mod.commonsRenditionUrl === "function" ? mod.commonsRenditionUrl : null,
    };
  } catch {
    _cachedVaultMod = { vaultPublicUrl: null, renditionUrl: null };
  }
  return _cachedVaultMod;
}

function normalizedConfig(config) {
  if (!config || typeof config !== "object") return null;
  const raw = String(config.url || "").trim().replace(/\/+$/, "");
  const key = String(config.key || "").trim();
  if (!raw || !key) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { url: u.origin, key };
  } catch {
    return null;
  }
}

function tier1FromRow(row, place) {
  const srcRow = row || (place && (place.photo_url || place.photoUrl || place.owned_photos || place.photo_gallery)
    ? {
        place_id: place.id,
        photo_url: place.photo_url || place.photoUrl || null,
        signals: {
          photo_url: place.photo_url || place.photoUrl || null,
          photos: place.owned_photos || null,
          photo_gallery: place.photo_gallery || null,
        },
      }
    : null);
  if (!srcRow) return null;
  const entry = ownedEntryFromRow(srcRow);
  if (!entry || !entry.url) return null;
  const c = entry.credit;
  if (c && c.name && c.uri && c.license) {
    return {
      src: entry.url,
      source: entry.photoSource || "permitted",
      credit: { name: c.name, uri: c.uri, license: c.license },
    };
  }
  return { src: entry.url, source: "wayfind", credit: null };
}

function wfPhotoFromFree(free) {
  if (!free || !free.url) return null;
  const source = LICENSED_SOURCES.has(String(free.source || "wikimedia").toLowerCase())
    ? "licensed"
    : "permitted";
  return {
    src: free.url,
    source,
    credit: {
      name: free.attributionText,
      uri: free.attributionUrl,
      license: free.license,
    },
  };
}

function wfPhotoFromStoredGoogle(stored) {
  if (!stored || !stored.src) return null;
  const c = stored.credit || {};
  return {
    src: stored.src,
    source: "google",
    credit: {
      name: c.name || "",
      uri: c.uri || null,
      mapsUri: c.mapsUri || null,
      authors: Array.isArray(c.authors) ? c.authors : [],
    },
  };
}

function rankFreeRow(r) {
  return LICENSED_SOURCES.has(String(r?.source || "wikimedia").toLowerCase()) ? 1 : 0;
}

export async function hydrateMapPlacesWithStoredPhotos(
  places,
  { rawRowsById = null, config = null, fetcher = fetch, stripRawGallery = false, vaultPublicUrl, renditionUrl, env = process.env } = {},
) {
  if (!Array.isArray(places) || !places.length) return Array.isArray(places) ? places : [];

  const resolved = new Map();
  const lookupRaw = (id) => {
    if (!rawRowsById || !id) return null;
    return rawRowsById instanceof Map ? (rawRowsById.get(id) || null) : (rawRowsById[id] || null);
  };

  // Tier 1: Inventory owned/gallery covers (0 DB queries).
  for (const p of places) {
    if (!p || !p.id || resolved.has(p.id)) continue;
    const hit = tier1FromRow(lookupRaw(p.id), p);
    if (hit) resolved.set(p.id, hit);
  }

  const cfg = normalizedConfig(config);
  const headers = cfg ? { apikey: cfg.key, Authorization: "Bearer " + cfg.key } : null;

  // Tier 2: wf_place_photo permanent licensed/permitted free photos (batched <= 150).
  const missingTier2 = [...new Set(places.map((p) => p && p.id).filter((id) => id && PLACE_ID_RX.test(id) && !resolved.has(id)))];
  if (missingTier2.length && cfg && typeof fetcher === "function") {
    const lazyVault = vaultPublicUrl === undefined || renditionUrl === undefined ? await loadVaultHelpers() : null;
    const vpu = vaultPublicUrl !== undefined ? vaultPublicUrl : lazyVault?.vaultPublicUrl;
    const ru = renditionUrl !== undefined ? renditionUrl : lazyVault?.renditionUrl;
    for (let i = 0; i < missingTier2.length; i += BATCH_CHUNK) {
      const chunk = missingTier2.slice(i, i + BATCH_CHUNK);
      try {
        const q = new URLSearchParams({
          select: "place_id,image_url,license,attribution_text,attribution_url,source,storage_path,width",
          place_id: `in.(${chunk.join(",")})`,
          status: "eq.active",
          limit: String(chunk.length * 4),
        });
        const r = await fetcher(`${cfg.url}/rest/v1/wf_place_photo?${q}`, { headers, cache: "no-store" });
        if (!r || !r.ok) continue;
        const rows = await r.json();
        if (!Array.isArray(rows)) continue;
        const byPlace = new Map();
        for (const row of rows) {
          const pid = row && row.place_id;
          if (!pid || !chunk.includes(pid)) continue;
          let list = byPlace.get(pid);
          if (!list) { list = []; byPlace.set(pid, list); }
          list.push(row);
        }
        for (const [pid, list] of byPlace.entries()) {
          if (resolved.has(pid)) continue;
          const ordered = list.slice().sort((a, b) => rankFreeRow(a) - rankFreeRow(b));
          for (const row of ordered) {
            const free = selectFreePhotoRow(row, { supabaseUrl: cfg.url, vaultPublicUrl: vpu, renditionUrl: ru, width: 640 });
            const photo = wfPhotoFromFree(free);
            if (photo) { resolved.set(pid, photo); break; }
          }
        }
      } catch {
        // Fail-soft: map places still return intact if photo store read errors or times out.
      }
    }
  }

  // Static curated local photos (0 DB queries, same fallback as lib/freePhoto.js).
  for (const p of places) {
    if (!p || !p.id || resolved.has(p.id)) continue;
    try {
      const curated = selectFreePhotoRow(findCuratedPlacePhoto(p.id, env || {}));
      const photo = wfPhotoFromFree(curated);
      if (photo) resolved.set(p.id, photo);
    } catch { /* ignore */ }
  }

  // Tier 3: wf_google_photo_store already-retained Google photos (batched <= 150).
  const missingTier3 = [...new Set(places.map((p) => p && p.id).filter((id) => id && PLACE_ID_RX.test(id) && !resolved.has(id)))];
  if (missingTier3.length && cfg && typeof fetcher === "function") {
    for (let i = 0; i < missingTier3.length; i += BATCH_CHUNK) {
      const chunk = missingTier3.slice(i, i + BATCH_CHUNK);
      try {
        const q = new URLSearchParams({
          select: "place_id,state,version,storage_path,content_type,width,height,bytes,credit",
          place_id: `in.(${chunk.join(",")})`,
          state: "eq.ready",
          limit: String(chunk.length),
        });
        const r = await fetcher(`${cfg.url}/rest/v1/wf_google_photo_store?${q}`, { headers, cache: "no-store" });
        if (!r || !r.ok) continue;
        const rows = await r.json();
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const pid = row && row.place_id;
          if (!pid || !chunk.includes(pid) || resolved.has(pid)) continue;
          const stored = storedGooglePhotoFromRow(row);
          const photo = wfPhotoFromStoredGoogle(stored);
          if (photo) resolved.set(pid, photo);
        }
      } catch {
        // Fail-soft: map places still return intact if Google photo store read errors or times out.
      }
    }
  }

  return places.map((p) => {
    if (!p || !p.id) return p;
    const wfPhoto = resolved.get(p.id) || null;
    if (!wfPhoto && !(stripRawGallery && p.photo_gallery)) return p;
    const next = { ...p };
    if (wfPhoto) {
      next.wfPhoto = wfPhoto;
      next.photo = wfPhoto.src;
    }
    if (stripRawGallery && "photo_gallery" in next) {
      delete next.photo_gallery;
    }
    return next;
  });
}
