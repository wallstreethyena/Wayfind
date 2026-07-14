// scripts/repair-inventory.mjs — re-classify wf_inventory with the ONE classifier.
//
//   node scripts/repair-inventory.mjs            # DRY RUN (default). Writes nothing.
//   node scripts/repair-inventory.mjs --apply    # writes, after the SQL migration
//
// GUARANTEES
//   • IDEMPOTENT — re-running after an --apply produces zero further changes.
//   • NO DELETES — a junk row is flagged `excluded`, never removed. Every row
//     stays inspectable and reversible.
//   • ROLLBACK — refuses to --apply unless wf_inventory_backup_2026_07_14 exists
//     and is non-empty (created by supabase/inventory-repair.sql).
//   • LOCKED ROWS ARE SACRED — a hand-corrected row (locked=true) is never touched.
//   • AMBIGUOUS => REVIEW, NOT EXCLUSION. A short-term-rental match that has real
//     reviews might be a genuine small inn (Ramblers Rest Resort, 61 reviews), so
//     it is flagged needs_review and LEFT VISIBLE rather than silently removed.
//     Only the unambiguous junk (zero-review rentals, trades, residences) is
//     excluded. Owner rule: do not silently delete uncertain records.
//
// Writes review lists to data/atlas/ either way, so a dry run is a full preview.

import fs from "node:fs";
import path from "node:path";
import { classify, EXCLUSION } from "../lib/placeCategory.js";

const APPLY = process.argv.includes("--apply");
const OUT = path.join("data", "atlas");

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL_ = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!URL_ || !KEY) { console.error("repair: Supabase URL / service-role key missing"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const sameSet = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());

// ── read ───────────────────────────────────────────────────────────────────
const rows = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${URL_}/rest/v1/wf_inventory?select=*`, { headers: { ...H, Range: `${from}-${from + 999}` } });
  if (!r.ok) { console.error(`repair: read failed ${r.status}`); process.exit(1); }
  const j = await r.json();
  rows.push(...j);
  if (j.length < 1000) break;
}
console.log(`repair: ${rows.length} rows read${APPLY ? "" : "  (DRY RUN — nothing will be written)"}\n`);

// ── preflight for --apply: migration + backup must exist ───────────────────
if (APPLY) {
  const probe = await fetch(`${URL_}/rest/v1/wf_inventory?select=excluded,secondary_categories&limit=1`, { headers: H });
  if (!probe.ok) {
    console.error("repair: the migration has NOT been applied — `excluded` / `secondary_categories` are missing.");
    console.error("        Run supabase/inventory-repair.sql in the Supabase SQL editor first.");
    process.exit(1);
  }
  const backup = await fetch(`${URL_}/rest/v1/wf_inventory_backup_2026_07_14?select=place_id&limit=1`, { headers: H });
  if (!backup.ok || (await backup.json()).length === 0) {
    console.error("repair: refusing to write — the rollback backup (wf_inventory_backup_2026_07_14) is missing or empty.");
    console.error("        It is created by supabase/inventory-repair.sql. No rollback path, no write.");
    process.exit(1);
  }
  console.log("repair: migration + rollback backup confirmed.\n");
}

// ── classify ───────────────────────────────────────────────────────────────
const updates = [], review = [], excludedRows = [], unchanged = [];
const before = {}, after = {}, reasons = {};

for (const r of rows) {
  before[r.category] = (before[r.category] || 0) + 1;

  if (r.locked) { unchanged.push(r); after[r.category] = (after[r.category] || 0) + 1; continue; } // hand-corrected: sacred

  const c = classify({ types: r.google_types || [], primaryType: r.primary_type, name: r.name });
  const reviews = (r.signals || {})?.reviews ?? 0;

  // AMBIGUITY RULE: a rental match WITH real reviews may be a genuine small inn.
  // Flag it, keep it visible, let a human decide. Never silently remove it.
  const ambiguousRental = c.excluded && c.reason === EXCLUSION.RENTAL && reviews > 0;

  const next = {
    place_id: r.place_id,
    category: c.excluded && !ambiguousRental ? r.category : (c.category || r.category), // keep last-known category on an excluded row; it is not served anyway
    tags: c.excluded && !ambiguousRental ? (r.tags || []) : c.tags,
    secondary_categories: c.secondary || [],
    excluded: c.excluded && !ambiguousRental,
    exclusion_reason: c.excluded && !ambiguousRental ? c.reason : null,
    // via==="name" means the category was recovered from the NAME, not a real
    // Google type — the seeder's long-standing rule: the name net may FLAG, it may
    // never silently decide. Those rows, and every ambiguous rental, need a human.
    needs_review: ambiguousRental || c.via === "name" || (!c.excluded && !c.category),
  };

  const changed =
    next.category !== r.category ||
    !sameSet(next.tags, r.tags) ||
    !sameSet(next.secondary_categories, r.secondary_categories) ||
    next.excluded !== (r.excluded === true) ||
    (next.exclusion_reason ?? null) !== (r.exclusion_reason ?? null) ||
    next.needs_review !== (r.needs_review === true);

  if (changed) updates.push(next); else unchanged.push(r);

  if (next.excluded) { excludedRows.push({ ...r, reason: next.exclusion_reason }); reasons[next.exclusion_reason] = (reasons[next.exclusion_reason] || 0) + 1; }
  else {
    after[next.category] = (after[next.category] || 0) + 1;
    if (next.needs_review) review.push({ ...r, why: ambiguousRental ? "ambiguous_rental (has reviews — may be a real inn)" : c.via === "name" ? "category recovered from NAME, not a Google type" : "no category" });
  }
}

// ── review lists (written on a dry run too — a dry run IS the preview) ──────
const tsv = (f, rows_, cols) => fs.writeFileSync(path.join(OUT, f), [cols.join("\t"), ...rows_.map((x) => cols.map((c) => Array.isArray(x[c]) ? x[c].join("|") : String(x[c] ?? "")).join("\t"))].join("\n") + "\n");
fs.mkdirSync(OUT, { recursive: true });
tsv("repair-excluded.tsv", excludedRows.map((r) => ({ ...r, reviews: (r.signals || {})?.reviews ?? 0 })), ["place_id", "name", "category", "reason", "reviews", "primary_type"]);
tsv("repair-needs-review.tsv", review.map((r) => ({ ...r, reviews: (r.signals || {})?.reviews ?? 0 })), ["place_id", "name", "category", "why", "reviews", "primary_type"]);

console.log("── CATEGORY COVERAGE ────────────────────────────────");
console.log("  before:", JSON.stringify(before));
console.log("  after :", JSON.stringify(after));
console.log("\n── JUNK (excluded, never deleted) ───────────────────");
console.log(" ", excludedRows.length, "rows:", JSON.stringify(reasons));
console.log("\n── REVIEW QUEUE (kept visible, flagged for a human) ──");
console.log(" ", review.length, "rows → data/atlas/repair-needs-review.tsv");
console.log("\n── CHANGES ──────────────────────────────────────────");
console.log("  rows to update:", updates.length, " unchanged:", unchanged.length);

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply after supabase/inventory-repair.sql.");
  process.exit(0);
}

// ── write (upsert, batched) ────────────────────────────────────────────────
let done = 0;
for (let i = 0; i < updates.length; i += 200) {
  const batch = updates.slice(i, i + 200);
  const r = await fetch(`${URL_}/rest/v1/wf_inventory?on_conflict=place_id`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(batch),
  });
  if (!r.ok) { console.error(`repair: write failed ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
  done += batch.length;
  process.stdout.write(`\r  wrote ${done}/${updates.length}`);
}
console.log(`\n\nrepair: applied. Re-run WITHOUT --apply to confirm idempotency (expect "rows to update: 0").`);
console.log("rollback: see the UPDATE ... FROM wf_inventory_backup_2026_07_14 block in supabase/inventory-repair.sql");
