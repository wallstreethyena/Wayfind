// lib/photoVault.js — SERVER-ONLY. Downloads a licence-cleared photo exactly
// once and stores it PERMANENTLY in Wayfind's own `place-photos` storage
// bucket (2026-09-09).
//
// WHY THIS EXISTS. lib/commonsPhotos.js / lib/placePhotoBackfill.js (owned by
// another lane) resolve a Wayfind place to a free-licensed Wikimedia Commons
// photo and record its ORIGIN url + attribution on wf_place_photo — but an
// `image_url` that merely points AT upload.wikimedia.org is still a hotlink
// to someone else's server, not a copy Wayfind owns outright. This module is
// the "copy it here" half: it downloads the bytes once, uploads them to the
// `place-photos` bucket
// (supabase/migrations/20260909_wf_place_photo_vault.sql), and stamps
// storage_path/stored_at/bytes/content_type on the SAME wf_place_photo row —
// image_url stays exactly as it was, as the origin/provenance/attribution
// url; storage_path is Wayfind's own copy.
//
// THE GATE COMES FIRST, ALWAYS. lib/photoLicense.js's mayStorePermanently is
// called before ANYTHING else in storePhotoPermanently — before validating
// placeId, before touching env, before the first fetch. A refusal (Google by
// name, an unknown source, a missing/non-free licence) returns
// `{ stored:false, reason }` having made ZERO network calls. A second,
// independent check (isGooglePhotoUrl) catches a Google photo mislabelled
// under a storable source string, also before any network call — the gate
// cannot be walked around by relabelling.
//
// IDEMPOTENT. "Never pay twice, never fetch twice": before downloading
// anything, this reads the place's existing wf_place_photo row. A
// storage_path already on that row is returned as-is — no re-download, no
// re-upload, no re-write.
//
// ONE INJECTED `fetch` COVERS BOTH "fetch" AND "storage client". This
// codebase's established convention (lib/photoCacheRecovery.js,
// lib/freePhoto.js, lib/photoRepair.js, lib/placePhotoBackfill.js) talks to
// Supabase entirely over plain fetch against its REST APIs — PostgREST for
// table reads/writes, and Storage's own REST API
// (`POST {url}/storage/v1/object/<bucket>/<path>`) for uploads — never the
// supabase-js SDK. There is therefore only one transport in this file to
// inject: `deps.fetch`. A test can prove a network-refusal claim by call
// count against that single mock (as scripts/test-photo-vault.mjs does),
// and can tell a download from an upload from a DB read/write by inspecting
// each call's URL, exactly like lib/commonsPhotos.js's own
// `calls.push(String(url))` fixtures do.
//
// NEVER THROWS. Modelled on lib/photoCacheRecovery.js's fail-soft contract:
// every path — a bad placeId, missing env, a network failure, a non-image
// response, an oversized body, an unexpected exception — returns
// `{ stored:false, reason }`, never an uncaught error a batch worker would
// have to guard against itself.

import { createHash } from "node:crypto";
import { WIKI_UA } from "./popularity.js";
import { mayStorePermanently, isGooglePhotoUrl } from "./photoLicense.js";

const PLACE_ID_RX = /^[A-Za-z0-9_-]{10,}$/;
const DOWNLOAD_TIMEOUT_MS = 8000;
const IMAGE_CONTENT_TYPE_RX = /^image\/[a-z0-9.+-]+$/i;

// The bucket this module writes to — created by
// supabase/migrations/20260909_wf_place_photo_vault.sql. Exported so the
// hermetic guard can build the exact upload/public URLs it expects without
// duplicating the literal.
export const PLACE_PHOTOS_BUCKET = "place-photos";

// A sane ceiling for a single place photo. Commons "original" files can run
// well past what any Wayfind surface will ever render — refused rather than
// silently accepted, per the task's "enforces a sane max byte size".
// Exported so the guard can build a fixture that is deterministically over
// the line without hardcoding a magic number that could drift from this one.
export const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// 2026-09-17 OVERSIZED ORIGINALS. Production: 13 active wf_place_photo rows
// sat with storage_path NULL, every one a Commons ORIGINAL 3,000-9,000px
// wide (e.g. Spaceship Earth, EPCOT at 6240px) — well past what this card
// ever renders, and often past MAX_BYTES or the DOWNLOAD_TIMEOUT_MS below.
// Those rows never got a vault copy and instead hotlinked the multi-
// megabyte original straight to a phone. 1280px is generously above every
// card width this app actually asks a photo for (lib/photoCacheRecovery.js's
// canonical widths top out well under this) while being a small fraction of
// a multi-thousand-pixel original's bytes. Exported so lib/freePhoto.js's
// serving-side fallback and the hermetic guard share this ONE number.
export const VAULT_RENDITION_WIDTH = 1280;

// A Commons original this module is willing to treat as "safe to store
// as-is" without first trying the smaller rendition. Anything wider (or
// whose width we simply do not know yet) tries the 1280px rendition FIRST —
// same file, same license, same attribution, only a smaller copy of it.
const RENDITION_THRESHOLD_PX = 1600;

// Matched against a URL's `.pathname` ONLY (never the full URL string) —
// the hostname/protocol are checked separately by every caller below.
const COMMONS_ORIGINAL_PATH_RX = /^\/wikipedia\/commons\/([0-9a-fA-F])\/([0-9a-fA-F]{2})\/([^/]+)$/;
const COMMONS_THUMB_PATH_RX = /^\/wikipedia\/commons\/thumb\/([0-9a-fA-F])\/([0-9a-fA-F]{2})\/([^/]+)\/(?:\d+px-.+|lossy-page1-\d+px-.+)$/;

// Extensions Commons serves a rendition for at all, and the URL SUFFIX
// convention for each — see https://commons.wikimedia.org/wiki/Help:Thumbnails.
// A plain raster (jpg/png/gif/webp) keeps its own extension on the
// rendition; an .svg gets a rasterised .png rendition; a multi-page .tif/
// .tiff/.pdf gets a "lossy-page1-" prefix and a .jpg rendition (Commons
// cannot thumbnail a whole multi-page document, only its first page).
// Anything else is not a format this module has confirmed the convention
// for, so it returns null rather than guess a URL that 404s.
function renditionSuffixFor(ext, width, filename) {
  const e = String(ext || "").toLowerCase();
  if (e === "jpg" || e === "jpeg" || e === "png" || e === "gif" || e === "webp") {
    return `${width}px-${filename}`;
  }
  if (e === "svg") {
    return `${width}px-${filename}.png`;
  }
  if (e === "tif" || e === "tiff" || e === "pdf") {
    return `lossy-page1-${width}px-${filename}.jpg`;
  }
  return null;
}

/**
 * Pure. Turns an upload.wikimedia.org Commons file URL (original OR an
 * existing thumbnail) into the standard Commons thumbnail URL rendered at
 * `width` pixels wide — the SAME file, the SAME licence, the SAME
 * attribution (source_ref/attribution_url stay the original File: page;
 * only the bytes served are a smaller rendition of that one file). Returns
 * null for a non-Commons URL, a malformed one, or a file extension this
 * module has not confirmed Commons' rendition convention for.
 *
 * An already-thumbnail URL is re-derived at the requested width from its
 * own /h/hh/filename — calling this with the SAME width it already carries
 * returns the identical URL unchanged.
 *
 * Never throws, never does I/O.
 */
export function commonsRenditionUrl(url, width) {
  const s = typeof url === "string" ? url.trim() : "";
  const w = Number(width);
  if (!s || !Number.isFinite(w) || w <= 0) return null;
  const px = Math.round(w);

  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.hostname.toLowerCase() !== "upload.wikimedia.org") return null;

  const thumbMatch = u.pathname.match(COMMONS_THUMB_PATH_RX);
  if (thumbMatch) {
    const [, h, hh, filename] = thumbMatch;
    const ext = (filename.match(/\.([a-zA-Z0-9]+)$/) || [, ""])[1];
    const suffix = renditionSuffixFor(ext, px, filename);
    if (!suffix) return null;
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h}/${hh}/${filename}/${suffix}`;
  }

  const origMatch = u.pathname.match(COMMONS_ORIGINAL_PATH_RX);
  if (origMatch) {
    const [, h, hh, filename] = origMatch;
    const ext = (filename.match(/\.([a-zA-Z0-9]+)$/) || [, ""])[1];
    const suffix = renditionSuffixFor(ext, px, filename);
    if (!suffix) return null;
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h}/${hh}/${filename}/${suffix}`;
  }

  return null;
}

// Pure. True when `url` is a Commons file at its full original resolution
// (never a /thumb/ URL) — the shape commonsRenditionUrl can shrink.
function isCommonsOriginalUrl(url) {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return false;
  let u;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  return u.protocol === "https:" && u.hostname.toLowerCase() === "upload.wikimedia.org" && COMMONS_ORIGINAL_PATH_RX.test(u.pathname);
}

const EXT_BY_CONTENT_TYPE = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
};

function extensionFor(contentType) {
  return EXT_BY_CONTENT_TYPE[contentType] || "";
}

// Same env-resolution shape as lib/freePhoto.js / lib/photoCacheRecovery.js
// (SUPABASE_URL falling back to NEXT_PUBLIC_SUPABASE_URL, quote-stripped,
// coerced to https, trailing slash dropped) — duplicated locally rather than
// imported, matching this codebase's established per-file convention for
// this exact helper. Accepts an injectable `env` so a hermetic test never
// has to mutate process.env to exercise this module.
function cfg(env = process.env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\/+$/, "");
  const url = raw
    ? /^http:\/\//i.test(raw)
      ? raw.replace(/^http:\/\//i, "https://")
      : /^https:\/\//i.test(raw)
        ? raw
        : "https://" + raw
    : "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Pure. The public URL a stored `storagePath` is servable at, for the
 * `place-photos` bucket (public read — see the migration's storage.objects
 * policy). Never network, never throws; an empty/invalid input yields "".
 */
export function vaultPublicUrl(storagePath, supabaseUrl) {
  const path = typeof storagePath === "string" ? storagePath.trim() : "";
  const base = typeof supabaseUrl === "string" ? supabaseUrl.trim().replace(/\/+$/, "") : "";
  if (!path || !base) return "";
  return `${base}/storage/v1/object/public/${PLACE_PHOTOS_BUCKET}/${path}`;
}

async function fetchExistingRow(fetchImpl, s, placeId) {
  const u = new URL(s.url + "/rest/v1/wf_place_photo");
  u.searchParams.set("select", "place_id,storage_path,bytes,content_type");
  u.searchParams.set("place_id", "eq." + placeId);
  u.searchParams.set("limit", "1");
  const r = await fetchImpl(u, {
    headers: { apikey: s.key, Authorization: "Bearer " + s.key },
    cache: "no-store",
  });
  if (!r || !r.ok) return { ok: false };
  const rows = await r.json();
  return { ok: true, row: Array.isArray(rows) && rows.length ? rows[0] : null };
}

async function patchStorageFields(fetchImpl, s, placeId, fields) {
  const u = new URL(s.url + "/rest/v1/wf_place_photo");
  u.searchParams.set("place_id", "eq." + placeId);
  const r = await fetchImpl(u, {
    method: "PATCH",
    headers: {
      apikey: s.key,
      Authorization: "Bearer " + s.key,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(fields),
  });
  return !!(r && r.ok);
}

function detectContentType(resp, contentTypeHint) {
  const header =
    resp && resp.headers && typeof resp.headers.get === "function" ? resp.headers.get("content-type") : null;
  const raw = header || contentTypeHint || "";
  return String(raw).split(";")[0].trim().toLowerCase();
}

/**
 * storePhotoPermanently({ placeId, sourceUrl, source, license,
 * contentTypeHint }, deps?) →
 *   { stored:true, storagePath, publicUrl, bytes, contentType }
 *   | { stored:false, reason }
 *
 * `deps.fetch` — injectable transport for every network call this function
 * makes (download, PostgREST read/write, storage upload). Defaults to global
 * fetch. `deps.env` — injectable config source, defaults to process.env.
 *
 * Never throws.
 */
export async function storePhotoPermanently({ placeId, sourceUrl, source, license, contentTypeHint, width } = {}, deps = {}) {
  const fetchImpl = typeof deps.fetch === "function" ? deps.fetch : fetch;
  const env = deps.env || process.env;

  try {
    // ── THE GATE. FIRST. No network call may happen before this. ──────────
    const verdict = mayStorePermanently({ source, license });
    if (!verdict.allowed) return { stored: false, reason: verdict.reason };

    const url = typeof sourceUrl === "string" ? sourceUrl.trim() : "";

    // Second, independent half of "refuse Google by name": a mislabelled
    // source whose actual bytes live on a googleusercontent host. Still
    // before any network call.
    if (isGooglePhotoUrl(url)) {
      return { stored: false, reason: "google_places_terms_no_photo_caching" };
    }

    const id = String(placeId || "");
    if (!PLACE_ID_RX.test(id)) return { stored: false, reason: "invalid_place_id" };
    if (!url) return { stored: false, reason: "no_source_url" };

    const s = cfg(env);
    if (!s) return { stored: false, reason: "config_missing" };

    // ── IDEMPOTENT. Ask before ever downloading. ───────────────────────────
    const existing = await fetchExistingRow(fetchImpl, s, id);
    if (!existing.ok) return { stored: false, reason: "row_read_failed" };
    if (!existing.row) return { stored: false, reason: "no_photo_row" };
    if (existing.row.storage_path) {
      return {
        stored: true,
        storagePath: existing.row.storage_path,
        publicUrl: vaultPublicUrl(existing.row.storage_path, s.url),
        bytes: existing.row.bytes,
        contentType: existing.row.content_type,
        alreadyStored: true,
      };
    }

    // ── Download once (usually) — see attemptDownload below. ─────────────
    // IDENTIFY OURSELVES OR GET 429'd (2026-09-09). Wikimedia's User-Agent
    // policy refuses anonymous bulk traffic on upload.wikimedia.org, and
    // this download had no User-Agent at all. Measured against the live
    // host the same day: the identical URL returned 429 with no UA and 200
    // with one. 12 of 46 resolved photos failed here as "download_failed"
    // — a reason that reads like a network blip and was actually us being
    // told to say who we are. Reuses lib/popularity.js's WIKI_UA, the same
    // identity every other Wikimedia request in this codebase already
    // sends, so there is exactly one UA string to keep current.
    async function attemptDownload(targetUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
      let resp;
      try {
        resp = await fetchImpl(targetUrl, { ...WIKI_UA, signal: controller.signal });
      } catch {
        return { ok: false, reason: "download_failed", timedOut: controller.signal.aborted };
      } finally {
        clearTimeout(timer);
      }
      if (!resp || !resp.ok) return { ok: false, reason: "download_failed", timedOut: false };

      // Content-type gate BEFORE reading the body — refuses a non-image
      // response without paying for the download of a body we're going to
      // reject anyway.
      const contentType = detectContentType(resp, contentTypeHint);
      if (!IMAGE_CONTENT_TYPE_RX.test(contentType)) {
        return { ok: false, reason: "not_an_image", timedOut: false };
      }

      let buf;
      try {
        buf = Buffer.from(await resp.arrayBuffer());
      } catch {
        return { ok: false, reason: "download_failed", timedOut: false };
      }
      if (!buf.length) return { ok: false, reason: "empty_body", timedOut: false };
      if (buf.length > MAX_BYTES) return { ok: false, reason: "too_large", timedOut: false };
      return { ok: true, buf, contentType };
    }

    // OVERSIZED ORIGINALS (2026-09-17). 13 production rows sat with
    // storage_path NULL, every one a Commons ORIGINAL 3,000-9,000px wide
    // (Spaceship Earth, EPCOT at 6240px) — well past MAX_BYTES or
    // DOWNLOAD_TIMEOUT_MS, hotlinking a multi-megabyte original to a phone
    // instead. Same file, same licence, same attribution — only the BYTES
    // this module stores change. Prefer the 1280px rendition up front when
    // the row's own width is unknown or already known to be large; when the
    // ORIGINAL is downloaded first and fails specifically as too_large or a
    // timeout, retry ONCE with the rendition before giving up — a photo
    // whose true width this module never learned in advance should not be
    // lost just because the ORIGINAL alone was too big or too slow.
    const isOriginal = isCommonsOriginalUrl(url);
    const renditionUrl = isOriginal ? commonsRenditionUrl(url, VAULT_RENDITION_WIDTH) : null;
    const knownWidth = Number.isFinite(width) ? Number(width) : null;
    const preferRendition = !!renditionUrl && (knownWidth == null || knownWidth > RENDITION_THRESHOLD_PX);

    const firstUrl = preferRendition ? renditionUrl : url;
    let attempt = await attemptDownload(firstUrl);
    if (!attempt.ok && renditionUrl && firstUrl !== renditionUrl && (attempt.reason === "too_large" || attempt.timedOut)) {
      attempt = await attemptDownload(renditionUrl);
    }
    if (!attempt.ok) return { stored: false, reason: attempt.reason };
    const { buf, contentType } = attempt;

    // Deterministic, content-addressed path: a place that resolves to the
    // SAME bytes twice lands at the SAME key; a place whose source image
    // legitimately changes lands at a NEW key instead of silently
    // overwriting the old one under the same name.
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 24);
    const storagePath = `${id}/${hash}${extensionFor(contentType)}`;

    // ── Upload once. Storage's own REST API, same transport as everything
    // else in this file — see the module header for why one `fetch` seam
    // covers this too. ─────────────────────────────────────────────────
    const uploadResp = await fetchImpl(`${s.url}/storage/v1/object/${PLACE_PHOTOS_BUCKET}/${storagePath}`, {
      method: "POST",
      headers: {
        apikey: s.key,
        Authorization: "Bearer " + s.key,
        "content-type": contentType,
        "x-upsert": "true",
      },
      body: buf,
    });
    if (!uploadResp || !uploadResp.ok) return { stored: false, reason: "upload_failed" };

    // Partial PATCH — only the four storage columns. Every other column on
    // this row (attribution_text, attribution_url, license, source_ref, ...)
    // is left exactly as the ingestion lane wrote it.
    const wrote = await patchStorageFields(fetchImpl, s, id, {
      storage_path: storagePath,
      stored_at: new Date().toISOString(),
      bytes: buf.length,
      content_type: contentType,
    });
    if (!wrote) return { stored: false, reason: "row_write_failed" };

    return {
      stored: true,
      storagePath,
      publicUrl: vaultPublicUrl(storagePath, s.url),
      bytes: buf.length,
      contentType,
    };
  } catch (e) {
    return { stored: false, reason: "error:" + String((e && e.message) || e).slice(0, 120) };
  }
}
