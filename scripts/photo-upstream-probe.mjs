#!/usr/bin/env node
// scripts/photo-upstream-probe.mjs — WHAT GOOGLE ACTUALLY SAID, MEASURED LIVE.
//
// WARNING: EVERY ROW THIS SCRIPT PRINTS SPENDS ONE REAL `photos` LEDGER GRANT
// ON PRODUCTION. This is NOT a probe header request (unlike
// scripts/photo-monitor.mjs, which never spends) — it deliberately fetches an
// UNCACHED ref from https://www.gowayfind.com/api/photo so the real Google
// media call runs and the new x-wayfind-photo-upstream classification
// (scripts/test-photo-upstream-truth.mjs, lib/placePhotoServe.js) can be read
// off a live response. --n is capped at 5 for exactly this reason.
//
// NOT GUARD-SHAPED ON PURPOSE (a `photo-` prefix, not `check-`/`test-`), so it
// sits outside scripts/guards.txt, scripts/check-guard-manifest.mjs and the
// guard registry by construction — same status as scripts/photo-monitor.mjs
// and scripts/photo-cache-sweep.mjs. It touches the network, a live database,
// and live spend; the prebuild suite must stay hermetic and free.
//
// CREDENTIALS: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the environment
// (never printed, never logged). No GOOGLE_MAPS_SERVER_KEY is needed here —
// production holds that key; this script only ever calls production's own
// /api/photo endpoint, exactly like a real browser would.
//
// QUOTA TRUTH (2026-09-16): a row that comes back quota/key-denied/server is
// refunded to the ledger by lib/placePhotoServe.js itself (defaultFetchOwnedUri)
// before this script ever sees the response — this script only OBSERVES the
// spend, it does not do the refunding. When CRON_SECRET is set alongside the
// Supabase env, this script also reads app/api/health/photos' photoAllowance
// block once before and once after the batch, so the same terminal shows the
// ledger's used/remaining count moving (or not, on a refunded row) next to the
// per-request classification.
//
// USAGE
//   node scripts/photo-upstream-probe.mjs            # n=1 (default)
//   node scripts/photo-upstream-probe.mjs --n=3       # up to 5
//   node scripts/photo-upstream-probe.mjs --base-url=https://staging.example
import { classifyPhotoUriProbe } from "../lib/photoUriLiveness.js";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const pref = "--" + name + "=";
  const hit = args.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : dflt;
};
const BASE_URL = String(opt("base-url", "https://www.gowayfind.com")).replace(/\/+$/, "");
const rawN = parseInt(opt("n", "1"), 10);
if (Number.isFinite(rawN) && rawN > 5) {
  console.error(`photo-upstream-probe: --n=${rawN} refused — this script spends a real Google-photo ledger grant per row, and 5 is the hard ceiling. Run it again with --n=5 or lower.`);
  process.exit(2);
}
const N = Math.max(1, Math.min(5, Number.isFinite(rawN) ? rawN : 1));
const CRON_SECRET = process.env.CRON_SECRET || "";

async function readPhotoAllowance() {
  if (!CRON_SECRET) return null;
  try {
    const r = await fetch(BASE_URL + "/api/health/photos", { headers: { authorization: "Bearer " + CRON_SECRET }, cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.photoAllowance ? d.photoAllowance : null;
  } catch { return null; }
}
function printAllowance(label, a) {
  if (!a) { console.log(`photoAllowance (${label}): (unavailable — set CRON_SECRET to see it)`); return; }
  console.log(`photoAllowance (${label}): month=${a.month} used=${a.used} cap=${a.cap} remaining=${a.remaining} breaker.open=${a.breaker && a.breaker.open} today=${JSON.stringify(a.today)}`);
}

const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("photo-upstream-probe: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (not printed)");
  process.exit(2);
}
const H = { apikey: key, Authorization: "Bearer " + key };

const PHOTO_CACHE_PREFIX = "photo|";
function photoCacheKey(ref, w) {
  return PHOTO_CACHE_PREFIX + String(ref || "") + "|" + String(w || 640);
}

async function fetchCandidateRefs(limit) {
  const r = await fetch(
    url + "/rest/v1/wf_inventory?select=photo_ref&photo_ref=like.places%2F*&limit=" + limit,
    { headers: H, cache: "no-store" }
  );
  if (!r.ok) throw new Error("wf_inventory read failed HTTP " + r.status);
  const rows = await r.json();
  return Array.from(new Set((Array.isArray(rows) ? rows : []).map((row) => row && row.photo_ref).filter(Boolean)));
}

async function filterUncached(refs) {
  if (!refs.length) return [];
  const keys = refs.map((ref) => photoCacheKey(ref, 640));
  const inList = keys.map((k) => encodeURIComponent(k)).join(",");
  const r = await fetch(
    url + "/rest/v1/wf_places_cache?select=k&k=in.(" + inList + ")",
    { headers: H, cache: "no-store" }
  );
  if (!r.ok) throw new Error("wf_places_cache read failed HTTP " + r.status);
  const rows = await r.json();
  const cachedKeys = new Set((Array.isArray(rows) ? rows : []).map((row) => row && row.k).filter(Boolean));
  return refs.filter((ref) => !cachedKeys.has(photoCacheKey(ref, 640)));
}

async function probeOne(ref) {
  const dest = BASE_URL + "/api/photo?ref=" + encodeURIComponent(ref) + "&w=640";
  const started = Date.now();
  try {
    const r = await fetch(dest, {
      method: "GET",
      redirect: "manual",
      headers: {
        Referer: "https://www.gowayfind.com/",
        "Sec-Fetch-Site": "same-origin",
      },
    });
    return {
      ref,
      status: r.status,
      result: r.headers.get("x-wayfind-photo-result") || "(none)",
      upstream: r.headers.get("x-wayfind-photo-upstream") || "(none)",
      probeHeader: r.headers.get("x-wayfind-photo-probe") || "(none)",
      ms: Date.now() - started,
    };
  } catch (e) {
    return { ref, status: 0, result: "(fetch failed)", upstream: classifyPhotoUriProbe(0), probeHeader: "(none)", ms: Date.now() - started, error: String((e && e.message) || e) };
  }
}

console.error(`photo-upstream-probe: WARNING — every row below spends one real photos-ledger grant against ${BASE_URL} (n=${N}); a quota/key-denied/server outcome is refunded automatically, ok/stale/network/redirect rows are not`);

const allowanceBefore = await readPhotoAllowance();
printAllowance("before", allowanceBefore);

let candidates;
try {
  const pool = await fetchCandidateRefs(Math.max(60, N * 12));
  candidates = (await filterUncached(pool)).slice(0, N);
} catch (e) {
  console.error("photo-upstream-probe: setup failed — " + (e && e.message ? e.message : e));
  process.exit(1);
}

if (!candidates.length) {
  console.log("photo-upstream-probe: no uncached candidate refs found (every sampled ref already has a wf_places_cache row at w=640) — nothing spent");
  process.exit(0);
}

console.log(`photo-upstream-probe: ${candidates.length} uncached ref(s) selected out of a sample of up to 60`);
console.log("ref | status | x-wayfind-photo-result | x-wayfind-photo-upstream | ms");
let failures = 0;
for (const ref of candidates) {
  const row = await probeOne(ref);
  if (row.error) failures++;
  console.log(`${ref} | ${row.status} | ${row.result} | ${row.upstream} | ${row.ms}ms${row.error ? " | ERROR: " + row.error : ""}`);
}

const allowanceAfter = await readPhotoAllowance();
printAllowance("after", allowanceAfter);

process.exit(failures === candidates.length ? 1 : 0);
