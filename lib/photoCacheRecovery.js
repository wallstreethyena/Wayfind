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

//   * LIVENESS (2026-09-15): a recovered row is a Google-hosted URI that may
//     have died since it was cached (lib/photoUriLiveness.js — 27% of the
//     cache had). The best candidate is HEAD-probed when its age says it is
//     due; a dead row is evicted and the next candidate is tried. Unknown is
//     not dead. Still no cache WRITE here: eviction of a proven-dead row is
//     the only mutation, and it can only ever remove a row.

import {
  PHOTO_REDIRECT_TTL_SECONDS,
  PHOTO_URI_DEAD,
  photoUriValidationDue,
  probePhotoUri,
} from "./photoUriLiveness.js";

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

// SPEND EFFICIENCY (2026-09-16). Google Cloud metrics: every billed photo
// call goes through defaultFetchOwnedUri, one ledger grant per outbound
// request — and cards were asking for the SAME photo at eight different
// widths (240/280/400/480/600/640/720/800, plus 1200 heroes), each width its
// own cache key (photoCacheKey) and, cold, its own paid Google fetch. The
// rule this file and the server-side photo resolver now enforce together:
// ONE paid fetch per photo, at its canonicalWidth (see canonicalPhotoWidth
// below, exported so resolvePlacePhoto and this file's own recovery agree);
// every card size, cold or warm, reuses that one row. The candidate list
// below is deliberately WIDE — not just "the canonical width" — because the
// existing cache (written before this change) still holds thousands of rows
// at the old per-width keys, and harvesting those for free is strictly
// better than a paid re-fetch merely because the request happened to ask
// for 720 instead of 800. The resolver's own liveness check means only a
// FRESH, still-alive row is ever actually served, so widening this list
// costs nothing when the wider candidates are stale or dead — it can only
// ever turn a paid miss into a free hit.
//
// (Formerly this list was narrow — exact width, plus 640 only for w<640 or
// w===800 — with an explicit note not to widen it further, referencing #1300.
// That caution no longer applies: #1300 was about not inventing width
// substitutions the resolver had no fetch-side story for. Now that the FETCH
// itself is canonicalized (canonicalPhotoWidth), a wider READ-side candidate
// list is just catching up to how narrow the WRITE side has become.)
export function canonicalPhotoWidth(width) {
  let w = parseInt(width || 640, 10);
  if (!Number.isFinite(w) || w < 64) w = 640;
  if (w > 1600) w = 1600;
  return w <= 800 ? 640 : w;
}

// Candidate cache widths for one request. Exact requested width is always
// first (a warm row at the EXACT size wins over a same-photo substitute),
// then the canonical width this exact request would have fetched Google at
// (see canonicalPhotoWidth — every card size <=800 canonicalizes to 640, a
// hero width >800 stays itself). For a card request (<=800) the other common
// card widths this codebase has ever asked Google for are tried next
// (800/720/600/480/400 — the pre-canonicalization write set); for a hero
// request (>800) the common card widths (800/720/640) are tried as a
// last-resort fallback rather than serving nothing. Every entry is deduped;
// only a row that is still FRESH is ever actually served (see the callers).
export function photoCacheCandidateWidths(width) {
  let w = parseInt(width || 640, 10);
  if (!Number.isFinite(w) || w < 64) w = 640;
  if (w > 1600) w = 1600;
  const widths = [w];
  const canon = canonicalPhotoWidth(w);
  if (!widths.includes(canon)) widths.push(canon);
  const fallbacks = w <= 800 ? [800, 720, 600, 480, 400] : [800, 720, 640];
  for (const fb of fallbacks) {
    if (!widths.includes(fb)) widths.push(fb);
  }
  return widths;
}

function isBetterCachedRow(candidate, best, requestedWidth) {
  if (!best) return true;
  const candExact = candidate.width === requestedWidth;
  const bestExact = best.width === requestedWidth;
  if (candExact !== bestExact) return candExact;
  return candidate.expMs > best.expMs;
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
  const candidates = photoCacheCandidateWidths(width);
  const widths = new Set(candidates);
  const requested = candidates[0];
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
    // Downstream (CDN + browser) lifetime is the SMALLER of the row's remaining
    // clock and the daily liveness cadence — never `immutable`, never longer
    // than a day, for a rented URI that has been seen to die inside a week.
    const cacheSeconds = Math.min(ttlSeconds, PHOTO_REDIRECT_TTL_SECONDS);
    const wroteMs = Date.parse(row && row.wrote_at);
    const v = row && row.v;
    const vok = v && typeof v === "object" && Number.isFinite(Number(v.vok)) ? Number(v.vok) : null;
    const next = {
      key: String(row.k),
      uri,
      ref: parts.ref,
      width: parts.width,
      expMs,
      ttlSeconds,
      ageMs: Number.isFinite(wroteMs) ? now - wroteMs : null,
      vok,
      cacheControl: `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
    };
    if (isBetterCachedRow(next, best, requested)) best = next;
  }
  return best;
}

async function defaultEvict(key) {
  const { cdel } = await import("./serverCache.js");
  return cdel(key);
}

// Pick the best fresh same-place row that is ALIVE. Pure over `rows` apart
// from the injected probe/evict: a dead best is evicted and the selection
// runs again without it; unknown (timeout, 5xx, network) is served as-is.
export async function selectLiveSamePlaceCachedPhoto(rows, { placeId, width = 640, now = Date.now(), probeUri = probePhotoUri, evict = defaultEvict } = {}) {
  let pool = Array.isArray(rows) ? rows.slice() : [];
  for (let guard = 0; guard < 8 && pool.length; guard++) {
    const best = selectSamePlaceCachedPhoto(pool, { placeId, width, now });
    if (!best) return null;
    if (!photoUriValidationDue({ ageMs: best.ageMs, vok: best.vok, now })) return best;
    let verdict = null;
    try { verdict = await probeUri(best.uri); } catch { verdict = null; }
    if (verdict !== PHOTO_URI_DEAD) return best;
    try { await evict(best.key); } catch { /* best-effort; the row is dropped from this selection regardless */ }
    pool = pool.filter((r) => String(r && r.k) !== best.key);
  }
  return null;
}

export async function findSamePlaceCachedPhoto({ placeId, width = 640, now = Date.now(), fetchImpl = fetch, env = process.env, probeUri = probePhotoUri, evict = defaultEvict } = {}) {
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
    return await selectLiveSamePlaceCachedPhoto(await r.json(), { placeId: id, width, now, probeUri, evict });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
