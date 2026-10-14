// lib/imageWriteGate.js — the publication gate, applied at the moment an image
// reference is WRITTEN onto a place / event row (seed, backfill and cron paths).
//
// PURE apart from the optional logger. A refused image is dropped (set to null =
// the approved neutral tile); the record itself is NEVER blocked. Callers that
// write one image per write (backfill, cron) use `refused` to skip that write.
import { checkImageRecord, IMAGE_KEYS } from "./imagePublicationGate.js";

/**
 * @returns {{ record: object, refused: boolean, problems: Array<{code:string,message:string}> }}
 */
export function gateImageForWrite(record, ctx = {}, log = console.warn) {
  const res = checkImageRecord(record, ctx);
  if (res.ok) return { record, refused: false, problems: [] };
  const out = { ...record };
  for (const k of IMAGE_KEYS) if (k in out) out[k] = null;
  try {
    const id = (record && (record.event_id || record.id || record.slug || record.place_id)) || "(record)";
    log(`image-gate refused image for ${id}: ${res.problems.map((p) => p.code).join(",")}`);
  } catch { /* logging must never break a write path */ }
  return { record: out, refused: true, problems: res.problems };
}
