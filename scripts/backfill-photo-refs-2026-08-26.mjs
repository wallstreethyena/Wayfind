#!/usr/bin/env node
/**
 * backfill-photo-refs-2026-08-26 — give every wf_inventory row a photo_ref.
 *
 * Owner, 2026-08-26: "i need the image now on all place cards." The console
 * photo quota is raised (800 → 10,000/day); what remains are the rows that
 * never had a photo_ref catalogued — their cards render the monogram because
 * /api/photo?ref has nothing to fetch. This resolves each one with a single
 * Place Details call (fields=photos — the same field promote-index pays for)
 * and stores the first photo resource name. Idempotent: only rows still
 * missing a ref are touched; a place Google says has NO photos is recorded in
 * the report and left alone (own photo or the monogram — never stock).
 *
 * HAND-RUN, not a guard (needs the service key + the server key). DRY by
 * default; --commit writes; --limit N caps a run. Spend is printed first:
 * details ~$17/1k => ~275 rows ≈ $4.70.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SVC = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const KEY = String(process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
if (!URL_ || !SVC || !KEY) { console.error("missing env (SUPABASE_URL / SERVICE_ROLE / GOOGLE_MAPS_SERVER_KEY)"); process.exit(2); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}` };
const COMMIT = process.argv.includes("--commit");
const limArg = process.argv.indexOf("--limit");
const LIMIT = limArg > -1 ? parseInt(process.argv[limArg + 1], 10) : 1000;

const rows = await fetch(`${URL_}/rest/v1/wf_inventory?or=(photo_ref.is.null,photo_ref.eq.)&select=place_id,name,metro&limit=${LIMIT}`, { headers: H }).then((r) => r.json());
if (!Array.isArray(rows)) { console.error("inventory read failed:", JSON.stringify(rows).slice(0, 200)); process.exit(1); }
console.log(`${rows.length} rows missing photo_ref — estimated Details spend ~$${(rows.length * 0.017).toFixed(2)}${COMMIT ? "" : "  (DRY RUN — add --commit to write)"}`);

let fixed = 0, noPhoto = 0, failed = 0;
const noPhotoNames = [];
for (const row of rows) {
  try {
    const d = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(row.place_id)}?fields=photos&key=${KEY}`);
    if (!d.ok) { failed++; if (failed <= 5) console.log(`  ✗ ${row.name}: details ${d.status}`); continue; }
    const j = await d.json();
    const ref = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
    if (!ref || !/^places\/[^/]+\/photos\//.test(ref)) { noPhoto++; noPhotoNames.push(row.name); continue; }
    if (COMMIT) {
      const w = await fetch(`${URL_}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(row.place_id)}`, {
        method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ photo_ref: ref }),
      });
      if (!w.ok) { failed++; continue; }
    }
    fixed++;
    if (fixed % 50 === 0) console.log(`  … ${fixed} refs ${COMMIT ? "written" : "resolvable"}`);
  } catch { failed++; }
}
console.log(`\nbackfill-photo-refs: ${COMMIT ? "COMMITTED" : "DRY"} — ${fixed} refs ${COMMIT ? "written" : "resolvable"}, ${noPhoto} places have NO Google photo (monogram is correct), ${failed} failed`);
if (noPhotoNames.length) console.log("  no-photo places (first 15):", noPhotoNames.slice(0, 15).join(" · "));
process.exit(failed > rows.length / 4 ? 1 : 0);
