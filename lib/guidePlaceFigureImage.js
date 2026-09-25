import { findSamePlaceCachedPhoto as readSamePlaceCache } from "./photoCacheRecovery.js";
import { isPlaceOwnedPhotoUrl } from "./placePhoto.js";

// Server-resolved editorial media. No photo endpoint or Google media request:
// a cache miss is honest typography, never spend or a different venue.
export async function guidePlaceFigureImage(place, { findFreePhoto, findSamePlaceCachedPhoto, findCredit = findEditorialPhotoCredit, findAlternative = findCreditedEditorialCache } = {}) {
  if (!place) return null;
  const base = { alt: place.name || "", width: 1600, height: 900 };
  if (isPlaceOwnedPhotoUrl(place.photo) && place.photoAttr) {
    return { ...base, src: place.photo, credit: place.photoAttr, creditHref: place.photoAttrHref || null };
  }
  const placeId = place.place_id || place.id;
  if (!placeId) return null;
  try {
    const free = await findFreePhoto?.({ placeId, width: 1200 });
    if (free?.url && free.attributionText && free.attributionUrl) {
      return { ...base, src: free.url, credit: free.attributionText, creditHref: free.attributionUrl, license: free.license || null, licenseUrl: free.licenseUrl || free.licenseURL || null };
    }
  } catch {}
  try {
    const cached = await findSamePlaceCachedPhoto?.({ placeId, width: 1200, evict: async () => {} });
    // The article revalidates every 900 seconds. Do not knowingly publish
    // an asset whose allowed cache lifetime ends before that next refresh.
    if (cached?.uri && cached.ttlSeconds > 900) {
      const credit = await findCredit(cached.ref, placeId);
      if (credit) return { ...base, src: cached.uri, credit: credit.author_name, creditHref: credit.author_uri, providerHref: credit.maps_uri };
    }
  } catch {
    // Image availability must never turn a useful article into a failed page.
  }
  try {
    const alternate = await findAlternative(placeId);
    if (alternate) return { ...base, ...alternate };
  } catch {}
  return null;
}

// Exact cached photo credit only. A newer photo's author cannot credit an
// older cached URI. Missing author/profile/Maps link means no eligible photo.
export async function findEditorialPhotoCredit(ref, placeId, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  if (typeof ref !== "string" || !ref.startsWith(`places/${placeId}/photos/`)) return null;
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const query = new URLSearchParams({ select: "photo_name,place_id,author_name,author_uri,maps_uri,expires_at", photo_name: `eq.${ref}`, place_id: `eq.${placeId}`, expires_at: `gt.${new Date(now + 900000).toISOString()}`, limit: "1" });
    const response = await fetchImpl(`${url}/rest/v1/wf_photo_credit?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(800), cache: "no-store" });
    if (!response.ok) return null;
    const [credit] = await response.json();
    if (credit?.photo_name !== ref || credit?.place_id !== placeId || !credit.author_name?.trim() || !(Date.parse(credit.expires_at) > now + 900000)) return null;
    if (![credit.author_uri, credit.maps_uri].every((link) => typeof link === "string" && link.startsWith("https://"))) return null;
    return credit;
  } catch { return null; }
}

// A newer cached image can lack credit while an older image of the same venue
// is fully attributable. Query a bounded credit set once, then let the shared
// liveness/identity/expiry selector choose only among matching cached rows.
// No refresh, cache write, paid call, or repeated retry is performed.
export async function findCreditedEditorialCache(placeId, { env = process.env, fetchImpl = fetch, now = Date.now(), readCache = readSamePlaceCache, probeUri } = {}) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(String(placeId || ""))) return null;
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const query = new URLSearchParams({ select: "photo_name,place_id,author_name,author_uri,maps_uri,expires_at", place_id: `eq.${placeId}`, expires_at: `gt.${new Date(now + 900000).toISOString()}`, order: "expires_at.desc", limit: "8" });
    const response = await fetchImpl(`${url}/rest/v1/wf_photo_credit?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(800), cache: "no-store" });
    if (!response.ok) return null;
    const rows = await response.json();
    const credits = new Map((Array.isArray(rows) ? rows.slice(0, 8) : []).filter((c) =>
      c?.place_id === placeId && typeof c.photo_name === "string" && c.photo_name.startsWith(`places/${placeId}/photos/`) && c.author_name?.trim() && Date.parse(c.expires_at) > now + 900000 && [c.author_uri, c.maps_uri].every((link) => typeof link === "string" && link.startsWith("https://"))
    ).map((c) => [c.photo_name, c]));
    if (!credits.size) return null;
    const filteredFetch = async (...args) => {
      const r = await fetchImpl(...args);
      if (!r.ok) return r;
      const cacheRows = await r.json();
      return { ok: true, json: async () => (Array.isArray(cacheRows) ? cacheRows : []).filter((row) => {
        const ref = /^photo\|(places\/[^|]+)\|\d+$/.exec(row.k || "")?.[1];
        return credits.has(ref) && Date.parse(row.exp) > now + 900000;
      }) };
    };
    const cached = await readCache({ placeId, width: 1200, now, env, fetchImpl: filteredFetch, evict: async () => {}, ...(probeUri ? { probeUri } : {}) });
    const credit = cached && credits.get(cached.ref);
    if (!cached?.uri || cached.ttlSeconds <= 900 || !credit) return null;
    return { src: cached.uri, credit: credit.author_name, creditHref: credit.author_uri, providerHref: credit.maps_uri };
  } catch { return null; }
}
