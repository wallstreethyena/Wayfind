// lib/photoCacheRecovery.js — SERVER-ONLY free recovery for rotated Google photo refs.
//
// Google photo resource names can rotate while an older resource for the SAME
// Place ID is still fresh in wf_places_cache. When the current ref is cold and
// the monthly media budget is exhausted, that used to leave a monogram even
// though Wayfind already held valid bytes for this exact venue.
//
// This helper is deliberately read-only:
//   * SAME Place ID only — never a neighbour, category stock image, or fallback.
//   * FRESH cache rows only — expired rows are refused.
//   * The response inherits the source row's REMAINING lifetime; it never gets a
//     fresh 30-day clock and never writes a new cache row.
//   * The lookup uses the existing wf_places_cache primary-key range. No new
//     index or migration is required on the 1+ GB cache table.

const PLACE_ID_RX = /^[A-Za-z0-9_-]{10,}$/;
const PHOTO_REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const GOOGLE_USER_CONTENT_RX = /(?:^|\.)googleusercontent\.com$/i;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const LOOKUP_TIMEOUT_MS = 1200;

function cfg(env = process.env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim().replace(/^[\"']+|[\"']+$/g, "").replace(/\/+$/, "");
  const url = raw
    ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://")
      : (/^https:\/\//i.test(raw) ? raw : "https://" + raw))
    : "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

function requestedWidths(width) {
  let w = parseInt(width || 640, 10);
  if (!Number.isFinite(w) || w < 64) w = 640;
  if (w > 1600) w = 1600;
  return w < 640 ? new Set([w, 640]) : new Set([w]);
}

function rowParts(key) {
  const m = String(key || "").match(/^photo\|(places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+)\|(\d+)$/);
  if (!m || !PHOTO_REF_RX.test(m[1])) return null;
  return { ref: m[1], placeId: m[1].split("/")[1] || "", width: Number(m[2]) };
}

function rowUri(row) {
  const v = row && row.v;
  const raw = typeof v === "string" ? v : (v && (v.uri || v.photo_url || v.url));
  if (!raw) return "";
  try {
    const u = new URL(String(raw));
    return u.protocol === "https:" && GOOGLE_USER_CONTENT_RX.test(u.hostname) ? u.href : "";
  } catch {
    return "";
  }
}

export function selectSamePlaceCachedPhoto(rows, { placeId, width = 640, now = Date.now() } = {}) {
  if (!PLACE_ID_RX.test(String(placeId || ""))) return null;
  const widths = requestedWidths(width);
  let best = null;

  for (const row of Array.isArray(rows) ? rows : []) {
    const parts = rowParts(row && row.k);
    if (!parts || parts.placeId !== placeId || !widths.has(parts.width)) continue;
    const expMs = Date.parse(row && row.exp);
    if (!Number.isFinite(expMs) || expMs <= now) continue;
    const uri = rowUri(row);
    if (!uri) continue;
    const ttlSeconds = Math.min(THIRTY_DAYS_SECONDS, Math.floor((expMs - now) / 1000));
    if (ttlSeconds <= 0) continue;
    if (!best || expMs > best.expMs) {
      best = {
        uri,
        ref: parts.ref,
        width: parts.width,
        expMs,
        ttlSeconds,
        cacheControl: `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}, immutable`,
      };
    }
  }
  return best;
}

export async function findSamePlaceCachedPhoto({ placeId, width = 640, now = Date.now(), fetchImpl = fetch, env = process.env } = {}) {
  const id = String(placeId || "");
  if (!PLACE_ID_RX.test(id)) return null;
  const s = cfg(env);
  if (!s) return null;

  // `k` is the primary key. The lexical interval below is exactly the cache
  // family `photo|places/<id>/photos/...`; `photos0` is the first string after
  // every `photos/` key because '/' sorts before '0'. This keeps the lookup on
  // the existing btree instead of scanning the 1+ GB table.
  const lower = `photo|places/${id}/photos/`;
  const upper = `photo|places/${id}/photos0`;
  const u = new URL(s.url + "/rest/v1/wf_places_cache");
  u.searchParams.set("select", "k,v,exp,wrote_at");
  u.searchParams.append("k", "gte." + lower);
  u.searchParams.append("k", "lt." + upper);
  u.searchParams.set("exp", "gt." + new Date(now).toISOString());
  u.searchParams.set("order", "exp.desc");
  u.searchParams.set("limit", "64");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const r = await fetchImpl(u, {
      headers: { apikey: s.key, Authorization: "Bearer " + s.key },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!r.ok) return null;
    return selectSamePlaceCachedPhoto(await r.json(), { placeId: id, width, now });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
