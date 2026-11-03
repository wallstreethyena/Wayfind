#!/usr/bin/env node
/**
 * ingest-verified-2026-10-31-creator — carry the creator-registry places
 * that verified as real, operating, and address-matched on 2026-10-31 into
 * wf_inventory, so the guarded editorial publisher can attach verified
 * lines to them.
 *
 * Same law as the owner-batch ingests (#1019 pattern): FAIL-CLOSED, never
 * calls Google Places / Place Details / Text Search / photo backfill.
 * Every ADD row carries the Google place id already printed in the creator
 * registry (lib/creatorVideos.js) plus coordinates from an official page
 * or address-matched OpenStreetMap Nominatim, with the source recorded in
 * the batch JSON. HOLD/REJECT rows write nothing.
 *
 * Insert-if-absent only: an existing inventory row is never overwritten,
 * and signals/photo are never blanked (check-ingest-never-blanks).
 *
 *   node scripts/ingest-verified-2026-10-31-creator.mjs            # DRY RUN
 *   node scripts/ingest-verified-2026-10-31-creator.mjs --commit   # write wf_inventory
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COMMIT = process.argv.includes("--commit");
const BATCH = JSON.parse(readFileSync(join(ROOT, "data/atlas/owner-batch-2026-10-31-creator.json"), "utf8"));

const ADD = BATCH.places.filter((p) => p.status === "add");
// Literal pin: a drifted batch JSON cannot silently retarget ingest.
export const PINNED_IDS = Object.fromEntries(ADD.map((p) => [p.key, p.placeId]));
for (const p of ADD) {
  if (!p.placeId || !/^ChIJ/.test(p.placeId)) { console.error(`ADD ${p.name} lacks a public ChIJ id — fail-closed`); process.exit(1); }
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) { console.error(`ADD ${p.name} lacks coordinates — fail-closed`); process.exit(1); }
  if (!p.coordSource) { console.error(`ADD ${p.name} lacks coordSource — fail-closed`); process.exit(1); }
}
const nowIso = new Date().toISOString();
const rows = ADD.map((c) => ({
  place_id: c.placeId, name: c.name, lat: c.lat, lng: c.lng,
  category: c.wantCategory, tags: [], google_types: c.types,
  primary_type: c.primaryType, metro: c.metro,
  signals: {}, editorial: c.ingestLine || null, photo_ref: null,
  status: "OPERATIONAL", anchor: false, source: "owner-verified",
  needs_review: false, last_verified_at: nowIso, locked: true,
}));

console.log(`\ningest-verified-2026-10-31-creator ${COMMIT ? "(COMMIT)" : "(DRY RUN)"} — Places API off\n`);
for (const r of rows) console.log(`  + ${r.name}  ${r.place_id}  ${r.lat},${r.lng}`);
console.log(`\n  holds/rejects (nothing written): ${BATCH.holds.length}`);
if (!COMMIT) { console.log(`\nDRY RUN — would insert-if-absent ${rows.length} place rows. Re-run with --commit.`); process.exit(0); }

if (existsSync(join(ROOT, ".env.local"))) {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]+$/g, "").trim();
  }
}
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SVC = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!URL_ || !SVC) { console.error("missing SUPABASE url/service key"); process.exit(1); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };

let wrote = 0, present = 0;
for (const row of rows) {
  const dup = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(row.place_id)}&select=place_id`, { headers: H }).then((r) => r.json());
  if (Array.isArray(dup) && dup.length) { present++; console.log(`  - present, skipped: ${row.name}`); continue; }
  const res = await fetch(`${URL_}/rest/v1/wf_inventory`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!res.ok) { console.error(`insert failed for ${row.name}: ${res.status} ${(await res.text()).slice(0, 200)}`); process.exit(1); }
  wrote++; console.log(`  + wrote: ${row.name}`);
}
console.log(`\ndone: ${wrote} inserted, ${present} already present.`);
