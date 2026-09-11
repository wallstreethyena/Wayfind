// lib/freePhoto.js — SERVER-ONLY read of the FREE, PERMANENT photo lane.
//
// wf_place_photo holds photos Wayfind is actually LICENSED to keep forever —
// Wikimedia Commons today, possibly an owner/creator upload later — as
// opposed to every other row this app serves, which is a Google Places photo
// rented under Google's ToS (cacheable 30 days, gone the moment the ledger or
// the ref goes cold). 10,028 cached Google photo URIs expire 2026-09-25 to
// 2026-10-04 and the photos ledger sits at 950/950; this table is the escape
// from re-renting the same venue's picture every month.
//
// Modelled directly on lib/photoCacheRecovery.js's shape (same env-var
// resolution, same fail-soft timeout-guarded PostgREST GET, same "read-only,
// never throws" contract) because /api/photo already trusts that shape.
//
// The served URL is also run through lib/placePhotoServe's isOwnedPhotoUrl —
// the SAME gate every other photo source in this app answers to — rather
// than a private https-only check. Verified (not assumed): an
// upload.wikimedia.org URL already passes it unmodified (STOCK_RX matches
// only pexels/market-photo/stock-photo/the branded SVG; upload.wikimedia.org
// falls through to the "place-owned https" true). That is the correct
// answer, not a coincidence — a Commons photo of a specific, verified place
// is place-owned, not a shared stock pool, so it is legal under that
// module's Law #3 ("never a shared stock pool"), exactly like an
// inventory-stored owned https URL already is.
//
// VAULT-FIRST SERVING (2026-09-09, the permanent-vault wiring). A row can now
// carry `storage_path` — Wayfind's OWN copy in the `place-photos` Supabase
// Storage bucket (lib/photoVault.js, a sibling lane) — alongside `image_url`,
// which stays the ORIGIN url for provenance/attribution and is never
// overwritten. When storage_path is present this module serves the vault's
// own public URL instead of hotlinking the origin; when it is null (the vault
// hasn't backfilled this place yet, or storePhotoPermanently declined it) it
// falls back to image_url exactly as before — nothing regresses while the
// vault fills in. lib/photoVault.js is loaded LAZILY (dynamic import, at call
// time, cached) rather than statically imported at the top of this file —
// same seam lib/inventoryServe.js/lib/ownedPool.js already use for a
// same-shaped reason ("keeps this module test-importable") — so this module
// never hard-depends on that sibling lane's file existing, and a guard can
// drive the exact same selection logic with an injected vaultPublicUrl and
// zero knowledge of lib/photoVault.js at all.
//
// Behaviour this module is responsible for:
//   * Read-only. This module NEVER writes wf_place_photo — ingestion is the
//     data lane's job (lib/commonsPhotos.js, scripts/backfill-place-photos.mjs,
//     app/api/cron/place-photos/route.js — none of which this file touches
//     or depends on).
//   * `status = 'active'` only. 'rejected' and 'stale' rows exist in the same
//     table on purpose and must never be served.
//   * A row with no license text or no attribution is not a match. Wikimedia
//     CC licenses REQUIRE visible author + license credit — serving a photo
//     Wayfind cannot credit is the same compliance failure as serving one it
//     cannot legally keep, so this fails closed on missing attribution rather
//     than degrading it to an unattributed image.
//   * Dependency-injectable (`fetchImpl`, `env`) so a guard can exercise the
//     selection logic and the fail-soft paths with zero network and zero DB.

import { isOwnedPhotoUrl } from "./placePhotoServe.js";

const PLACE_ID_RX = /^[A-Za-z0-9_-]{10,}$/;
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

function trimmedString(v) {
  return typeof v === "string" ? v.trim() : "";
}

// A served free photo must be a real https URL and must carry both halves of
// its credit — an image Wayfind cannot attribute is not eligible to serve,
// even if it is otherwise a perfectly good row. Never fabricate the missing
// half; refuse the row instead.
function validUrl(value, { httpsOnly = false } = {}) {
  const s = trimmedString(value);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (httpsOnly && u.protocol !== "https:") return "";
    if (!httpsOnly && u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.href;
  } catch {
    return "";
  }
}

/**
 * Pure selector — one wf_place_photo row (already scoped to the right
 * place_id and status='active' by the caller/query) → the shape /api/photo
 * needs, or null when the row is not a servable, attributable photo. No I/O,
 * so a guard can exercise every accept/reject path with hand-built rows.
 *
 * `opts.vaultPublicUrl`, when the row carries a non-empty `storage_path`, is
 * called as `vaultPublicUrl(storagePath, opts.supabaseUrl)` to produce the
 * served URL — Wayfind's own permanent copy — instead of `row.image_url`
 * (the origin url, kept only for provenance/attribution below, never for
 * serving once a vault copy exists). Still a PURE function: the vault-url
 * computation is injected, never fetched or imported in here, so this stays
 * exercisable with hand-built rows and a hand-built vaultPublicUrl double —
 * no dependency on lib/photoVault.js existing. Any of "no storage_path",
 * "no vaultPublicUrl given", or "vaultPublicUrl produced an unusable url"
 * falls back to image_url — the same "nothing regresses" contract as a
 * missing vault entirely.
 */
export function selectFreePhotoRow(row, opts = {}) {
  if (!row || typeof row !== "object") return null;
  const storagePath = trimmedString(row.storage_path);
  let url = "";
  if (storagePath && typeof opts.vaultPublicUrl === "function") {
    let vaultUrl;
    try {
      vaultUrl = opts.vaultPublicUrl(storagePath, opts.supabaseUrl);
    } catch {
      vaultUrl = "";
    }
    url = validUrl(vaultUrl, { httpsOnly: true });
  }
  if (!url) {
    url = validUrl(row.image_url, { httpsOnly: true });
  }
  if (!url || !isOwnedPhotoUrl(url)) return null;
  const license = trimmedString(row.license);
  const attributionText = trimmedString(row.attribution_text);
  const attributionUrl = validUrl(row.attribution_url);
  if (!license || !attributionText || !attributionUrl) return null;
  const source = trimmedString(row.source) || "wikimedia";
  return {
    url,
    attributionText,
    attributionUrl,
    license,
    source,
  };
}

// Lazily-loaded real lib/photoVault.js#vaultPublicUrl, cached after the first
// successful load. A dynamic import (not a static top-of-file one) so this
// module never hard-fails to load if lib/photoVault.js is absent (a sibling
// lane's file, mid-build) — findFreePhoto just falls back to image_url, the
// documented "nothing regresses" contract, exactly as if the row had no
// storage_path at all.
let _cachedVaultPublicUrl;
async function loadVaultPublicUrl() {
  if (_cachedVaultPublicUrl !== undefined) return _cachedVaultPublicUrl;
  try {
    const mod = await import("./photoVault.js");
    _cachedVaultPublicUrl = typeof mod.vaultPublicUrl === "function" ? mod.vaultPublicUrl : null;
  } catch {
    _cachedVaultPublicUrl = null;
  }
  return _cachedVaultPublicUrl;
}

/**
 * findFreePhoto({ placeId, width }, deps?) → the active, attributable free
 * photo for this exact place, or null. Read-only, never throws, never writes.
 *
 * `width` is accepted for the same call shape as photoCacheRecovery / the
 * Google photo resolver, but is not used to vary the served URL: wf_place_photo
 * stores one already-sized image per place, not a resizable Google media ref.
 *
 * `deps` is the injection seam for tests: { fetchImpl, env }. Bare-Node
 * importable — no Next.js request context required.
 */
export async function findFreePhoto({ placeId, width } = {}, deps = {}) {
  const id = String(placeId || "");
  if (!PLACE_ID_RX.test(id)) return null;
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const s = cfg(env);
  if (!s) return null;

  const u = new URL(s.url + "/rest/v1/wf_place_photo");
  u.searchParams.set("select", "image_url,license,attribution_text,attribution_url,source,storage_path");
  u.searchParams.set("place_id", "eq." + id);
  u.searchParams.set("status", "eq.active");
  u.searchParams.set("limit", "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const r = await fetchImpl(u, {
      headers: { apikey: s.key, Authorization: "Bearer " + s.key },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    // `deps.vaultPublicUrl` is the test seam (a guard passes its own double
    // and never touches lib/photoVault.js); omitted (undefined, the normal
    // production call shape) it falls through to the lazy real loader above.
    const vaultPublicUrl = deps.vaultPublicUrl !== undefined ? deps.vaultPublicUrl : await loadVaultPublicUrl();
    return selectFreePhotoRow(row, { supabaseUrl: s.url, vaultPublicUrl });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
