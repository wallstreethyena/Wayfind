#!/usr/bin/env node
// Turn verified identity markers into served hotel photos — safely, and the
// same way every time.
//
// WHY THIS EXISTS. lib/ownedHotelIdentity.js writes a `hotelid|<card>` marker
// when Google's answer passes the 200 m + lodging + street-number gate. But
// lib/hotels.js serves `h.gpid` out of lib/ownedHotels.json, so a verified
// marker changes NOTHING until someone copies it into that file. Until now
// that copy was done by hand, from an ad-hoc database query, which is how the
// 2026-09-29 audit found two cards wearing another property's photo: the hand
// step had no invariant to enforce.
//
// So the dangerous part lives here instead, in code, with the same rules the
// guard asserts:
//
//   1. ONE PLACE, ONE CARD. A place id already held by another SERVED card is
//      refused, never duplicated. Two cards on one place means one hotel
//      serving two listings with the same photo.
//   2. NO BORROWED PHOTOS. A stored photo_ref carries the place it belongs to
//      ("places/<id>/photos/..."), and lib/hotelImage.js prefers it over gpid.
//      Repointing a row without clearing a foreign photo_ref would keep
//      serving the old property's picture — exactly the Anna Maria Island Inn
//      defect. A foreign photo_ref is cleared with the write.
//   3. NEVER OVERWRITE A DIFFERENT ID. A row that already holds a different
//      place id is reported and left alone, because that is either a
//      correction someone made deliberately or a conflict a human must judge.
//   4. EXCLUDED AND JUNK ROWS ARE SKIPPED. They are not served, so an id on
//      them is dead weight that a future change could turn into a live card.
//
// DRY RUN BY DEFAULT. Nothing is written without --write.
//
// TWO WAYS TO GET THE MARKERS, one code path for the decisions:
//   --markers <file>   a file of "cardKey<TAB|~V~>placeId" lines, or a JSON
//                      object/array. Use this when the markers were exported
//                      by another tool.
//   (default)          read them straight from the cache over the service-role
//                      REST API. Needs SUPABASE_URL and
//                      SUPABASE_SERVICE_ROLE_KEY in the environment; nothing
//                      is printed from either value.
//
// USAGE
//   node scripts/harvest-owned-hotel-identity.mjs                 # dry run
//   node scripts/harvest-owned-hotel-identity.mjs --write         # apply
//   node scripts/harvest-owned-hotel-identity.mjs --markers m.tsv # from a file
//
// This is NOT a prebuild guard (it is declared in check-guard-manifest's
// EXCLUDED): it is an operator tool that writes a data file on purpose. The
// invariants it enforces are independently asserted by
// scripts/check-owned-hotel-identity.mjs, which DOES gate every build.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
// --file lets the test drive this against a throwaway copy of the library.
// Production runs always omit it and hit the real file.
const fileArg = (() => { const i = argv.indexOf("--file"); return i >= 0 ? argv[i + 1] : null; })();
const OWNED = fileArg ? path.resolve(fileArg) : path.join(ROOT, "lib/ownedHotels.json");
const WRITE = argv.includes("--write");
const markersArg = (() => {
  const i = argv.indexOf("--markers");
  return i >= 0 ? argv[i + 1] : null;
})();

const { ownedHotelKey, isExcludedOwnedHotel } = await import(path.join(ROOT, "lib/ownedHotelExclusions.js"));
const { MARK_PREFIX_GPID } = await import(path.join(ROOT, "lib/ownedHotelIdentity.js"));

// Same junk rule lib/hotels.js applies, so "served" here means served there.
function isJunk(h) {
  const n = ((h && h.name) || "").trim();
  if (!n) return true;
  if (/^\d+\s+[A-Za-z]/.test(n)) return true;
  if (/\bvacation rental|\brentals\b|\bby owner\b|redawning/i.test(n)) return true;
  return isExcludedOwnedHotel(h);
}
function photoOwner(h) {
  const m = String((h && h.photo_ref) || "").match(/^places\/([^/]+)\//);
  return m ? m[1] : null;
}

function parseMarkersFile(file) {
  const raw = fs.readFileSync(file, "utf8").trim();
  const out = new Map();
  if (raw.startsWith("{") || raw.startsWith("[")) {
    const j = JSON.parse(raw);
    const entries = Array.isArray(j)
      ? j.map((r) => [r.key || r.card || r.k, r.gpid || r.placeId || r.v])
      : Object.entries(j).map(([k, v]) => [k, typeof v === "string" ? v : (v && (v.gpid || v.placeId))]);
    for (const [k, v] of entries) if (k && v) out.set(String(k).replace(MARK_PREFIX_GPID, ""), String(v));
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.includes("~") ? t.split("~") : t.split(/\t+/);
    const key = String(parts[0] || "").replace(MARK_PREFIX_GPID, "").trim();
    const gpid = String(parts[parts.length - 1] || "").trim();
    if (key && gpid && key !== gpid) out.set(key, gpid);
  }
  return out;
}

async function readMarkersFromCache() {
  const rawUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    console.error("harvest: need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment,");
    console.error("         or pass --markers <file>. Neither value is ever printed.");
    process.exit(2);
  }
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : "https://" + rawUrl;
  const out = new Map();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const q = `${url}/rest/v1/wf_places_cache?k=like.${encodeURIComponent(MARK_PREFIX_GPID + "*")}&select=k,v`;
    const r = await fetch(q, {
      headers: { apikey: key, Authorization: "Bearer " + key, Range: `${from}-${from + PAGE - 1}` },
      cache: "no-store",
    });
    if (!r.ok) { console.error(`harvest: cache read failed with HTTP ${r.status}`); process.exit(2); }
    const rows = await r.json();
    for (const row of rows || []) {
      const k = String(row.k || "").replace(MARK_PREFIX_GPID, "");
      const gpid = row.v && typeof row.v === "object" ? row.v.gpid : null;
      if (k && gpid) out.set(k, String(gpid));
    }
    if (!Array.isArray(rows) || rows.length < PAGE) break;
  }
  return out;
}

const markers = markersArg ? parseMarkersFile(markersArg) : await readMarkersFromCache();
const rows = JSON.parse(fs.readFileSync(OWNED, "utf8"));
const byKey = new Map();
for (const r of rows) byKey.set(ownedHotelKey(r), r);

// Places already held by a SERVED card — the one-place-one-card ledger.
const heldBy = new Map();
for (const r of rows) {
  if (!r.gpid || isJunk(r)) continue;
  if (!heldBy.has(r.gpid)) heldBy.set(r.gpid, ownedHotelKey(r));
}

const applied = [];
const refused = [];
const already = [];
const clearedPhotos = [];

for (const [key, gpid] of markers) {
  const row = byKey.get(key);
  if (!row) { refused.push([key, gpid, "no such card in the library"]); continue; }
  if (isJunk(row)) { refused.push([key, gpid, isExcludedOwnedHotel(row) ? "card is excluded from serving" : "card is junk-filtered"]); continue; }
  if (row.gpid === gpid) { already.push([key, gpid]); continue; }
  if (row.gpid && row.gpid !== gpid) { refused.push([key, gpid, `card already holds a DIFFERENT place (${row.gpid}) — a human decides this one`]); continue; }
  const owner = heldBy.get(gpid);
  if (owner && owner !== key) { refused.push([key, gpid, `one place one card: already served by ${owner}`]); continue; }

  // Safe to write. Clear a photo that belongs to another place in the same
  // step, or the card keeps serving the old property's picture.
  const foreign = photoOwner(row);
  if (foreign && foreign !== gpid) { clearedPhotos.push([key, foreign]); if (WRITE) row.photo_ref = null; }
  if (WRITE) row.gpid = gpid;
  heldBy.set(gpid, key);
  applied.push([key, gpid, (row.name || "").trim(), (row.address || "").trim()]);
}

console.log(`harvest-owned-hotel-identity: ${markers.size} verified markers, ${rows.length} library rows`);
console.log(`  already in the file : ${already.length}`);
console.log(`  WOULD WRITE         : ${applied.length}${WRITE ? " (writing)" : " (dry run — pass --write to apply)"}`);
console.log(`  refused             : ${refused.length}`);
console.log(`  borrowed photos cleared with the write: ${clearedPhotos.length}`);
for (const [k, g, name, addr] of applied) console.log(`    + ${k}  ${g}  | ${name} | ${addr}`);
for (const [k, g, why] of refused) console.log(`    ! ${k}  ${g}  — ${why}`);
for (const [k, g] of clearedPhotos) console.log(`    ~ ${k} had a photo belonging to ${g}; cleared`);

if (WRITE && applied.length) {
  fs.writeFileSync(OWNED, JSON.stringify(rows, null, 2) + "\n");
  console.log(`harvest: wrote ${applied.length} place id(s) to lib/ownedHotels.json`);
  console.log("harvest: now run `node scripts/run-guards.mjs` — check-owned-hotel-identity re-proves the invariants independently.");
} else if (WRITE) {
  console.log("harvest: nothing to write.");
}
