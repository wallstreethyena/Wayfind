// Server-only, separately labelled Google-origin storage. The lease must be
// claimed before the caller authorizes any paid Details or Photo request.
import { createHash } from "node:crypto";
import sharp from "sharp";

export const GOOGLE_PHOTO_STORE_BUCKET = "google-place-photos";
export const GOOGLE_PHOTO_STORE_MAX_BYTES = 12 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{10,}$/;
const TOKEN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const MAX_PIXELS = 40_000_000;
const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function config(deps) {
  const env = deps.env || process.env;
  try {
    const u = new URL(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
    if (u.protocol !== "https:" || u.username || u.password || u.pathname !== "/" || u.search || u.hash || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
    return { origin: u.origin, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, fetch: deps.fetchImpl || fetch };
  } catch { return null; }
}
function imageUrl(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || !/(?:^|\.)googleusercontent\.com$/.test(u.hostname) || u.username || u.password || u.port || u.hash) throw new Error("invalid_google_image_url");
  return u;
}
function https(value) {
  if (value == null) return null;
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.hash || u.port) throw new Error("invalid_credit_url");
  return u.href;
}
function creditOf(c) {
  if (!c || typeof c !== "object" || !Array.isArray(c.authors) || c.authors.length > 50) throw new Error("missing_same_photo_credit");
  const authors = c.authors.map(a => {
    const name = a?.name ?? a?.displayName;
    if (typeof name !== "string" || !name.trim() || name.length > 1000) throw new Error("invalid_author");
    return { ...a, uri: https(a.uri), photoUri: https(a.photoUri) };
  });
  if (typeof c.name !== "string" || c.name.length > 1000) throw new Error("invalid_credit_name");
  return { ...c, name: c.name, uri: https(c.uri), mapsUri: https(c.mapsUri), authors };
}
async function request(s, path, options = {}) {
  return s.fetch(s.origin + path, { ...options, cache: "no-store", headers: { ...s.headers, ...options.headers }, redirect: "error", signal: AbortSignal.timeout(10000) });
}
async function rpc(s, action, body) {
  const r = await request(s, `/rest/v1/rpc/wf_google_photo_store_${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("store_unavailable");
  return r.json();
}
function photoOf(row) {
  if (!row || row.state !== "ready" || !ID.test(row.place_id) || !HASH.test(row.version || "") ||
      typeof row.storage_path !== "string" || !new RegExp(`^${row.place_id}/[a-f0-9-]{36}/${row.version}$`).test(row.storage_path) ||
      !Object.values(MIME).includes(row.content_type) || !Number.isInteger(row.width) || !Number.isInteger(row.height) || row.width <= 0 || row.height <= 0 || row.width * row.height > MAX_PIXELS || !Number.isInteger(row.bytes) || row.bytes <= 0 || row.bytes > GOOGLE_PHOTO_STORE_MAX_BYTES) return null;
  try {
    const credit = creditOf(row.credit);
    if (!credit.mapsUri) credit.mapsUri = "https://www.google.com/maps/search/?api=1&query=Google&query_place_id=" + encodeURIComponent(row.place_id);
    const src = `/api/photo/stored/${row.place_id}?v=${row.version}`;
    return { src, url: src, source: "google", credit, version: row.version, width: row.width, height: row.height, bytes: row.bytes, contentType: row.content_type };
  } catch { return null; }
}
async function readRow(s, placeId, extra = {}) {
  const q = new URLSearchParams({ place_id: `eq.${placeId}`, select: "*", ...extra });
  const r = await request(s, `/rest/v1/wf_google_photo_store?${q}`);
  if (!r.ok) throw new Error("store_unavailable");
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length > 1) throw new Error("invalid_store_response");
  return rows[0] || null;
}
export async function readStoredGooglePhoto(placeId, deps = {}) {
  if (!ID.test(placeId || "")) return null;
  const s = config(deps); if (!s) return null;
  try { return photoOf(await readRow(s, placeId)); } catch { return null; }
}
export async function claimGooglePhotoStore(placeId, deps = {}) {
  if (!ID.test(placeId || "")) return { state: "unavailable" };
  const s = config(deps); if (!s) return { state: "unavailable" };
  try {
    const r = await rpc(s, "claim", { p_place_id: placeId });
    if (r.state === "ready") { const photo = photoOf(r.row); return photo ? { state: "ready", photo } : { state: "unavailable" }; }
    if (r.state === "claimed" && TOKEN.test(r.token || "")) return { state: "claimed", token: r.token };
    return { state: ["pending", "removed"].includes(r.state) ? r.state : "unavailable" };
  } catch { return { state: "unavailable" }; }
}
export async function failGooglePhotoStore({ placeId, token } = {}, deps = {}) {
  if (!ID.test(placeId || "") || !TOKEN.test(token || "")) return false;
  const s = config(deps); if (!s) return false;
  try { return await rpc(s, "fail", { p_place_id: placeId, p_token: token }) === true; } catch { return false; }
}
async function boundedBody(r) {
  const size = r.headers.get("content-length");
  if (size && (!/^\d+$/.test(size) || Number(size) > GOOGLE_PHOTO_STORE_MAX_BYTES)) throw new Error("invalid_image_size");
  if (!r.body?.getReader) throw new Error("missing_image_body");
  const reader = r.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > GOOGLE_PHOTO_STORE_MAX_BYTES) throw new Error("image_too_large");
      chunks.push(Buffer.from(part.value));
    }
  } catch (e) { await reader.cancel().catch(() => {}); throw e; }
  if (!bytes) throw new Error("empty_image");
  return Buffer.concat(chunks, bytes);
}
async function download(s, uri) {
  let target = imageUrl(uri);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    for (let hops = 0; hops <= 3; hops++) {
      const r = await s.fetch(target, { redirect: "manual", signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        await r.body?.cancel();
        target = imageUrl(new URL(r.headers.get("location") || "", target).href);
        continue;
      }
      if (!r.ok) throw new Error("image_download_failed");
      const declared = r.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!Object.values(MIME).includes(declared)) { await r.body?.cancel(); throw new Error("invalid_image_type"); }
      const body = await boundedBody(r);
      const info = await sharp(body, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).metadata();
      if (!info.width || !info.height || info.width * info.height > MAX_PIXELS || (info.pages || 1) !== 1 || MIME[info.format] !== declared) throw new Error("invalid_image_dimensions");
      // Decode pixels as well as the header: truncated or malformed images fail.
      await sharp(body, { limitInputPixels: MAX_PIXELS, failOn: "warning" }).stats();
      return { body, content_type: declared, width: info.width, height: info.height, bytes: body.length };
    }
    throw new Error("too_many_redirects");
  } finally { clearTimeout(timer); }
}
async function deleteObject(s, path) {
  const r = await request(s, `/storage/v1/object/${GOOGLE_PHOTO_STORE_BUCKET}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefixes: [path] }) });
  return r.ok;
}
export async function saveStoredGooglePhoto({ placeId, token, uri, credit } = {}, deps = {}) {
  if (!ID.test(placeId || "") || !TOKEN.test(token || "")) return null;
  const s = config(deps); if (!s) return null;
  let uploaded = null, completionUncertain = false;
  try {
    imageUrl(uri); const samePhotoCredit = creditOf(credit);
    const current = await readRow(s, placeId, { state: "eq.pending", lease_token: `eq.${token}`, lease_until: `gt.${new Date().toISOString()}` });
    if (!current || current.state !== "pending" || current.lease_token !== token) return null;
    const asset = await download(s, uri);
    const version = createHash("sha256").update(asset.body).digest("hex");
    const path = `${placeId}/${token}/${version}`;
    const upload = await request(s, `/storage/v1/object/${GOOGLE_PHOTO_STORE_BUCKET}/${path}`, { method: "POST", headers: { "content-type": asset.content_type, "x-upsert": "false" }, body: asset.body });
    if (!upload.ok) throw new Error("upload_failed");
    uploaded = path;
    const { body, ...metadata } = asset;
    completionUncertain = true;
    const complete = await rpc(s, "complete", { p_place_id: placeId, p_token: token, p_asset: { ...metadata, version, storage_path: path, credit: samePhotoCredit } });
    completionUncertain = false;
    const photo = complete.state === "ready" ? photoOf(complete.row) : null;
    if (photo) return photo;
  } catch { /* failure never creates a successful ready result */ }
  if (completionUncertain) {
    // A dropped RPC response can hide a committed ready row. Never delete a
    // potentially committed object, even when reconciliation is unavailable.
    try {
      const reconciled = await readRow(s, placeId);
      if (reconciled?.storage_path === uploaded) {
        const photo = photoOf(reconciled); if (photo) return photo;
      }
    } catch { /* leave private bytes intact for later reconciliation */ }
  } else if (uploaded) await deleteObject(s, uploaded).catch(() => false);
  await failGooglePhotoStore({ placeId, token }, deps);
  return null;
}
export async function removeStoredGooglePhoto(placeId, deps = {}) {
  if (!ID.test(placeId || "")) return false;
  const s = config(deps); if (!s) return false;
  try {
    const removed = await rpc(s, "remove", { p_place_id: placeId });
    if (removed.state !== "removed") return false;
    return !removed.storage_path || await deleteObject(s, removed.storage_path);
  } catch { return false; }
}
export async function readStoredGooglePhotoBytes({ placeId, version } = {}, deps = {}) {
  if (!ID.test(placeId || "") || !HASH.test(version || "")) return null;
  const s = config(deps); if (!s) return null;
  try {
    const row = await readRow(s, placeId), photo = photoOf(row);
    if (!photo || photo.version !== version) return null;
    const r = await request(s, `/storage/v1/object/authenticated/${GOOGLE_PHOTO_STORE_BUCKET}/${row.storage_path}`);
    if (!r.ok) return null;
    const body = await boundedBody(r);
    if (createHash("sha256").update(body).digest("hex") !== version) return null;
    const latest = photoOf(await readRow(s, placeId));
    return latest?.version === version ? { photo: latest, body, contentType: latest.contentType } : null;
  } catch { return null; }
}
