// lib/cachePack.js — SERVER-ONLY. Pack a large list for the Next data cache.
//
// ROOT CAUSE (2026-10-09). /florida-events cached ALL curated event rows
// (about 1,000 rows, ~2.15 MB of JSON) in unstable_cache. Next refuses data
// cache entries over 2 MB ("items over 2MB can not be cached"), so every
// hourly revalidation failed to write and the last entry written while the
// list was still under 2 MB was served forever: stale events, and real Google
// photo names that the 2026-10-08 database cleanup had already removed.
//
// The rows are highly repetitive JSON, so a gzip+base64 string is about a
// tenth of the size and stays far below the limit as the list grows. Every
// unpacked value is scrubbed of legacy Google photo data (lib/discoveryRef.js)
// so even an old entry cannot leak it into a page. An entry that still nears
// the limit logs a loud `cache-oversize` error instead of failing silently.
import { gzipSync, gunzipSync } from "node:zlib";
import { scrubLegacyGooglePhotoData } from "./discoveryRef.js";

export const NEXT_CACHE_ENTRY_LIMIT_BYTES = 2 * 1024 * 1024;
export const CACHE_BUDGET_BYTES = Math.floor(1.5 * 1024 * 1024);
export const PACK_VERSION = 1;

export function packForCache(label, value, log = console) {
  const json = JSON.stringify(value === undefined ? null : value);
  const gz = gzipSync(Buffer.from(json, "utf8")).toString("base64");
  const entry = { v: PACK_VERSION, gz, rawBytes: Buffer.byteLength(json, "utf8") };
  const bytes = Buffer.byteLength(JSON.stringify(entry), "utf8");
  if (bytes > CACHE_BUDGET_BYTES) {
    try { log.error("cache-oversize", { label: String(label || ""), bytes, limit: NEXT_CACHE_ENTRY_LIMIT_BYTES }); } catch { /* logging never breaks the read */ }
  }
  return entry;
}

// Accepts a packed entry, or a legacy unpacked value written by older code.
export function unpackFromCache(entry) {
  let value = entry;
  if (entry && typeof entry === "object" && entry.v === PACK_VERSION && typeof entry.gz === "string") {
    value = JSON.parse(gunzipSync(Buffer.from(entry.gz, "base64")).toString("utf8"));
  }
  return scrubLegacyGooglePhotoData(value);
}
