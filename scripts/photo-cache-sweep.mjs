#!/usr/bin/env node
// scripts/photo-cache-sweep.mjs — EVICT THE PHOTO CACHE ROWS GOOGLE HAS ALREADY KILLED.
//
// 2026-09-15. lib/photoUriLiveness.js validates a cached Google photo uri on
// READ, once a day, so a dead row cannot be served twice. This sweep is the
// one-time (and optionally nightly) counterpart: walk every photo|… row in
// wf_places_cache, HEAD its Google-hosted uri, and DELETE the rows the host
// answers 403/404/410 for. It never writes a uri, never touches the ledger,
// never calls a googleapis.com endpoint — one free HEAD per row, and a
// DELETE only for an explicit death. Unknown (timeout/5xx/429) is left alone.
//
// After a sweep the next reader of an evicted ref goes down the ordinary
// ladder: inventory → same-place recovery → free permanent photo → ONE
// ledger-granted Google fetch (if the month has headroom) → honest miss. That
// is strictly better than a 302 to a 403: same worst case (monogram), better
// best case (a real photo), and the ledger spends only on cards people view.
//
// Credentials: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment
// (never printed). Dry run by default; --apply deletes.
//
//   node scripts/photo-cache-sweep.mjs            # report only
//   node scripts/photo-cache-sweep.mjs --apply    # evict dead rows
//   node scripts/photo-cache-sweep.mjs --apply --concurrency 12 --max-age-days 30
import { classifyPhotoUriProbe, isGoogleHostedPhotoUri, PHOTO_URI_DEAD, PHOTO_URI_ALIVE, PHOTO_URI_VALIDATE_GRACE_MS } from "../lib/photoUriLiveness.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const CONCURRENCY = Math.max(1, Math.min(32, parseInt(opt("--concurrency", "12"), 10) || 12));
const PAGE = 1000;
const TIMEOUT_MS = 6000;

const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("photo-cache-sweep: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (not printed)");
  process.exit(2);
}
const H = { apikey: key, Authorization: "Bearer " + key };

function rowUri(row) {
  const v = row && row.v;
  return typeof v === "string" ? v : (v && (v.uri || v.photo_url || v.url)) || "";
}

async function probe(uri) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(uri, { method: "HEAD", redirect: "manual", cache: "no-store", signal: ctrl.signal });
    return classifyPhotoUriProbe(r.status);
  } catch { return "unknown"; } finally { clearTimeout(t); }
}

async function del(k) {
  const r = await fetch(url + "/rest/v1/wf_places_cache?k=eq." + encodeURIComponent(k), { method: "DELETE", headers: H });
  return r.ok;
}

async function pool(items, limit, fn) {
  let i = 0; const out = [];
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

const started = Date.now();
let rows = [];
for (let off = 0; ; off += PAGE) {
  const r = await fetch(url + "/rest/v1/wf_places_cache?select=k,v,wrote_at,exp&k=like.photo%7C*&order=k&offset=" + off + "&limit=" + PAGE, { headers: H, cache: "no-store" });
  if (!r.ok) { console.error("photo-cache-sweep: read failed HTTP " + r.status); process.exit(1); }
  const page = await r.json();
  rows = rows.concat(page);
  if (page.length < PAGE) break;
}
const now = Date.now();
const candidates = rows.filter((row) => {
  const uri = rowUri(row);
  if (!isGoogleHostedPhotoUri(uri)) return false;
  const wrote = Date.parse(row.wrote_at);
  return !Number.isFinite(wrote) || now - wrote >= PHOTO_URI_VALIDATE_GRACE_MS;
});
console.log(`photo-cache-sweep: ${rows.length} photo rows, ${candidates.length} Google-hosted and old enough to check (${APPLY ? "APPLY" : "DRY RUN"})`);

const tally = { alive: 0, dead: 0, unknown: 0, deleted: 0, deleteFailed: 0 };
const deadKeys = [];
await pool(candidates, CONCURRENCY, async (row) => {
  const verdict = await probe(rowUri(row));
  tally[verdict === PHOTO_URI_ALIVE ? "alive" : verdict === PHOTO_URI_DEAD ? "dead" : "unknown"]++;
  if (verdict === PHOTO_URI_DEAD) {
    deadKeys.push(row.k);
    if (APPLY) { (await del(row.k)) ? tally.deleted++ : tally.deleteFailed++; }
  }
});

const secs = ((Date.now() - started) / 1000).toFixed(0);
console.log(`photo-cache-sweep: alive ${tally.alive} · dead ${tally.dead} · unknown ${tally.unknown}` + (APPLY ? ` · deleted ${tally.deleted} · delete-failed ${tally.deleteFailed}` : "") + ` · ${secs}s`);
if (!APPLY && deadKeys.length) console.log("photo-cache-sweep: re-run with --apply to evict " + deadKeys.length + " dead rows");
process.exit(tally.deleteFailed ? 1 : 0);
