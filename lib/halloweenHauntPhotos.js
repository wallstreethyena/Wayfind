// Google Places and Wayfind Vault photos for the haunt cards on /halloween-in-florida.
//
// FREE LANE ONLY. This reads wf_google_photo_store through readStoredGooglePhoto()
// (lib/googlePhotoStore.js) plus the venue's vaulted 1280x853 photos in
// wf_place_photo and wf_inventory.signals.photo_gallery: a database read, never a
// Google call, never a ledger grant, no new SKU, no cap change. A venue gets a
// Google photo only when that exact Google place id already has a READY stored
// photo with its same-photo author credit, and gets vaulted photos only when that
// exact place id has active vaulted photos in the place-photos bucket. A photo the
// owner removed, or a place with nothing stored, simply yields nothing: a card
// with fewer photos is better than a wrong photo (owner rule).
//
// The place ids are the venue's own Google listing, never a neighbour's.
import { readStoredGooglePhoto } from "./googlePhotoStore.js";

export const MAX_HAUNT_PHOTOS = 5;

// haunt id -> exact Google place id of the venue (or the event's own listing).
export const HAUNT_GOOGLE_PLACE = Object.freeze({
  howlTampa: "ChIJhRo4DU_GwogRUgjhMAj-pag", // Busch Gardens Tampa Bay
  howlOrlando: "ChIJfyPWjCh-54gR1SvWozmef5k", // SeaWorld Orlando
  hhn: "ChIJvRBCrN9-54gRGZuuaCLGrQE", // Universal Orlando Resort
  zooTampa: "ChIJBQ5SjLHGwogRL4X19g4J5tI", // ZooTampa at Lowry Park
  mickey: "ChIJgUulalN-3YgRGoTaWM2LawY", // Magic Kingdom Park
  spooktacular: "ChIJfyPWjCh-54gR1SvWozmef5k", // SeaWorld Orlando
  brick: "ChIJ38rlfogN3YgRGic46M9dbLw", // LEGOLAND Florida Resort
  peppa: "ChIJu5o2QZAN3YgRMruJ3jk1KG8", // PEPPA PIG Theme Park Florida
  spookquarium: "ChIJiZrtZSvxwogRE9eu4Xpy9Yc", // Clearwater Marine Aquarium
  screamageddon: "ChIJ7zRUJ9CowogRM70pcoqrdUM", // Scream-A-Geddon Horror Park
  sirHenry: "ChIJeZM_F1A23YgRFICuRhA_pIo", // Sir Henry's Haunted Trail
  petrified: "ChIJaRU86ORx54gRK3zyCcF94hw", // A Petrified Forest Scare Trail
  undead: "ChIJnf4V7fDEwogRSLy2fzGSEvE", // American Victory Ship & Museum
  frightfest: "ChIJPWsUhY9Aw4gRoltOtGa3nPM", // Sarasota Fairgrounds
});

const plain = (t) => String(t || "").replace(/[-–—]/g, " ").replace(/\s{2,}/g, " ").trim();
const VAULT_URL_RX = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/place-photos\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
const CHRISTMAS_REF_RX = /christmas|holiday|santa|noel|yuletide/i;

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

/** One strip entry from a vaulted place-photos item (wf_place_photo or signals.photo_gallery). */
export function vaultStripPhoto(row, entry) {
  if (!entry || typeof entry !== "object") return null;
  if (CHRISTMAS_REF_RX.test(String(entry.source_ref || entry.original_url || entry.image_url || ""))) return null;
  const src = String(entry.url || entry.vault_url || "").trim();
  if (!VAULT_URL_RX.test(src)) return null;
  const rawCredit = plain(entry.attribution_text || entry.credit || "");
  if (!rawCredit) return null;
  const credit = /^photo\b/i.test(rawCredit) ? rawCredit : "Photo by " + rawCredit;
  const creditHref = /^https:\/\//.test(String(entry.attribution_url || "")) ? entry.attribution_url : null;
  return {
    src,
    width: Number.isFinite(entry.width) && entry.width > 0 ? entry.width : 1280,
    height: Number.isFinite(entry.height) && entry.height > 0 ? entry.height : 853,
    alt: plain("Photo of " + (row.venueName || row.where || row.name)),
    credit,
    source: "vault",
    authorUri: creditHref,
  };
}

function vaultConfig(deps = {}) {
  const env = deps.env || process.env;
  try {
    const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!raw || !key) return null;
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return {
      origin: u.origin,
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      fetch: deps.fetchImpl || fetch,
    };
  } catch {
    return null;
  }
}

/** Read active vaulted photos for a place_id from wf_place_photo and wf_inventory.signals.photo_gallery. */
export async function readVaultedPlacePhotos(placeId, deps = {}) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(String(placeId || ""))) return [];
  const s = vaultConfig(deps);
  if (!s) return [];
  const out = [];
  try {
    const q1 = new URLSearchParams({
      place_id: `eq.${placeId}`,
      status: "eq.active",
      select: "storage_path,image_url,width,height,attribution_text,attribution_url,source_ref",
      limit: "5",
    });
    const q2 = new URLSearchParams({
      place_id: `eq.${placeId}`,
      select: "signals",
      limit: "1",
    });
    const [r1, r2] = await Promise.all([
      s.fetch(`${s.origin}/rest/v1/wf_place_photo?${q1}`, { headers: s.headers, cache: "no-store", signal: AbortSignal.timeout(4000) }).catch(() => null),
      s.fetch(`${s.origin}/rest/v1/wf_inventory?${q2}`, { headers: s.headers, cache: "no-store", signal: AbortSignal.timeout(4000) }).catch(() => null),
    ]);
    if (r1 && r1.ok) {
      const rows = await r1.json();
      for (const r of Array.isArray(rows) ? rows : []) {
        if (r && r.storage_path) {
          out.push({
            url: `${s.origin}/storage/v1/object/public/place-photos/${r.storage_path}`,
            width: r.width || 1280,
            height: r.height || 853,
            attribution_text: r.attribution_text,
            attribution_url: r.attribution_url,
            source_ref: r.source_ref || r.image_url || "",
          });
        }
      }
    }
    if (r2 && r2.ok) {
      const inv = await r2.json();
      const gal = inv && inv[0] && inv[0].signals && Array.isArray(inv[0].signals.photo_gallery) ? inv[0].signals.photo_gallery : [];
      for (const g of gal) {
        if (g && (g.url || g.storage_path)) {
          out.push({
            url: g.url || `${s.origin}/storage/v1/object/public/place-photos/${g.storage_path}`,
            width: g.width || 1280,
            height: g.height || 853,
            attribution_text: g.attribution_text,
            attribution_url: g.attribution_url,
            source_ref: g.source_ref || g.original_url || "",
          });
        }
      }
    }
  } catch {
    return [];
  }
  return out;
}

/** The owner/partner photo (photo 1) first, then Google and vaulted photos, at most five, no repeats. */
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

/** Server side: returns the model with `photos` filled (Google photos + vaulted 1280x853 photos read from the free store). */
export async function withHauntPhotos(model, deps = {}) {
  const read = deps.read || readStoredGooglePhoto;
  const readVault = deps.readVault || (deps.read ? async () => [] : readVaultedPlacePhotos);
  const haunts = await Promise.all(model.haunts.map(async (row) => {
    const id = Object.hasOwn(HAUNT_GOOGLE_PLACE, row.id) ? HAUNT_GOOGLE_PLACE[row.id] : null;
    let extra = [];
    if (id) {
      let google = [];
      let vaulted = [];
      try { google = [googleStripPhoto(row, await read(id, deps.storeDeps))].filter(Boolean); } catch { google = []; }
      try { vaulted = (await readVault(id, deps.storeDeps) || []).map((v) => vaultStripPhoto(row, v)).filter(Boolean); } catch { vaulted = []; }
      extra = [...google, ...vaulted];
    }
    return { ...row, photos: mergeHauntPhotos(row, extra) };
  }));
  return { ...model, haunts };
}
