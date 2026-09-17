// lib/photoLivenessSweep.js — find dead cached Google photo links BEFORE a
// reader does (v8.56.34, 2026-09-17).
//
// PRODUCTION FACT. A real-browser check found Universal Orlando Resort blank
// in "Florida's Biggest Parks": /api/photo answered 302 "cache" to a
// lh3.googleusercontent.com link that Google now answers 403. Opening all
// 1,993 links the site served that morning found 55 dead (79 cache rows).
// Their median age was 21 hours and some had been validated only 7 hours
// earlier, so the request-time check (grace + revalidate window in
// lib/photoUriLiveness.js) could not catch them in time, and the coverage
// crawl counted them as real because it never opened the image.
//
// This sweep walks the cached Google photo rows, least recently validated
// first, and asks the photo host (HEAD, lh3.googleusercontent.com only — not
// a billable Places call) whether each still serves:
//   alive   -> the row's `vok` is re-stamped IN PLACE (PATCH v only): the
//              30-day ToS clock (wrote_at / exp) is never restarted.
//   dead    -> the row is deleted, so the next reader (or photo-warm) takes
//              the normal path: same-place recovery, the free vault, or one
//              ledger-gated Google fetch.
//   unknown -> left alone (our failure, never the photo's).
// Never logs a URL, key or ref.
import { sbEnv } from "./serverCache.js";
import { probePhotoUri, isGoogleHostedPhotoUri, PHOTO_URI_ALIVE, PHOTO_URI_DEAD } from "./photoUriLiveness.js";

export const SWEEP_DEFAULT_LIMIT = 300;
export const SWEEP_CONCURRENCY = 8;

function headers(s, extra = {}) {
  return { apikey: s.key, Authorization: `Bearer ${s.key}`, ...extra };
}

async function defaultListRows(limit, nowMs) {
  const s = sbEnv();
  if (!s) return [];
  const q = new URLSearchParams({
    select: "k,v",
    k: "like.photo|*",
    exp: "gt." + new Date(nowMs).toISOString(),
    order: "v->>vok.asc.nullsfirst",
    limit: String(limit),
  });
  const r = await fetch(`${s.url}/rest/v1/wf_places_cache?${q}`, { headers: headers(s), cache: "no-store" });
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

async function defaultMarkValid(k, v) {
  const s = sbEnv();
  if (!s) return false;
  const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(k)}`, {
    method: "PATCH",
    headers: headers(s, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ v }),
  });
  return r.ok;
}

async function defaultEvict(k) {
  const s = sbEnv();
  if (!s) return false;
  const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(k)}`, {
    method: "DELETE",
    headers: headers(s, { Prefer: "return=minimal" }),
  });
  return r.ok;
}

function rowUri(v) {
  if (typeof v === "string") return v;
  return v && typeof v === "object" ? (v.uri || v.photo_url || v.url || null) : null;
}

/**
 * One bounded sweep. Every dependency is injectable (hermetic tests).
 * @returns {{listed:number, checked:number, alive:number, dead:number, evicted:number, unknown:number, skipped:number}}
 */
export async function runPhotoLivenessSweep({
  limit = SWEEP_DEFAULT_LIMIT,
  concurrency = SWEEP_CONCURRENCY,
  deadlineAt = Date.now() + 45_000,
  now = Date.now,
  listRows = defaultListRows,
  probe = (uri) => probePhotoUri(uri),
  markValid = defaultMarkValid,
  evict = defaultEvict,
} = {}) {
  const out = { listed: 0, checked: 0, alive: 0, dead: 0, evicted: 0, unknown: 0, skipped: 0 };
  let rows = [];
  try { rows = await listRows(Math.max(0, Number(limit) || 0), now()); } catch { rows = []; }
  out.listed = rows.length;
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      if (now() >= deadlineAt) return;
      const row = rows[next++];
      const k = row && row.k;
      const uri = rowUri(row && row.v);
      if (!k || !String(k).startsWith("photo|") || !isGoogleHostedPhotoUri(uri)) { out.skipped++; continue; }
      let verdict = null;
      try { verdict = await probe(uri); } catch { verdict = null; }
      out.checked++;
      if (verdict === PHOTO_URI_DEAD) {
        out.dead++;
        try { if (await evict(k)) out.evicted++; } catch { /* best effort; the request path still refuses it when due */ }
      } else if (verdict === PHOTO_URI_ALIVE) {
        out.alive++;
        const v = row.v && typeof row.v === "object" ? { ...row.v, uri, vok: now() } : { uri, vok: now() };
        try { await markValid(k, v); } catch { /* best effort */ }
      } else {
        out.unknown++;
      }
    }
  };
  const n = Math.max(1, Math.min(Number(concurrency) || 1, rows.length || 1));
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}
