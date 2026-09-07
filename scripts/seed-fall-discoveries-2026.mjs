#!/usr/bin/env node
/**
 * Seed the owner supplied 2026 Fall in Florida discoveries.
 *
 * All coordinates and dates are already verified in the owned data module.
 * This script deliberately performs no Google lookup and creates no provider
 * spend. It is idempotent on event_id (PostgREST upsert, merge-duplicates),
 * and one request = one Postgres transaction: all rows land or none do.
 *
 *   node scripts/seed-fall-discoveries-2026.mjs --dry
 *   node scripts/seed-fall-discoveries-2026.mjs
 *   node scripts/seed-fall-discoveries-2026.mjs --only=id1,id2 [--insert-only]
 *   node scripts/seed-fall-discoveries-2026.mjs --exclude=id1,id2
 *
 * Lane D (2026-09-07) — owner's production-write rules, now enforced HERE
 * rather than remembered:
 *   --only / --exclude   seed a named subset; the rest of the registry is
 *                        never sent (no unrelated inventory changes).
 *   --insert-only        refuse to run if ANY selected event_id already
 *                        exists (a seed meant as a first write must not
 *                        silently become an overwrite). Re-running the same
 *                        command is still safe: it fails loudly, writes nothing.
 *   preflight            re-asserts, immediately before the write: every
 *                        selected id absent (when --insert-only), no slug
 *                        collision with any existing row, and records the
 *                        wf_events row count as the baseline.
 *   postflight           row count == baseline + inserted (or == baseline on
 *                        a pure re-upsert), and every selected id returned.
 */
import { readFileSync } from "node:fs";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const INSERT_ONLY = args.includes("--insert-only");
const listArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const ONLY = listArg("only");
const EXCLUDE = listArg("exclude");
if (ONLY && EXCLUDE) { console.error("seed-fall-discoveries-2026: use --only or --exclude, not both"); process.exit(1); }

function env() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

const registryIds = new Set(FALL_DISCOVERIES_2026.map((r) => r.event_id));
for (const id of [...(ONLY || []), ...(EXCLUDE || [])]) {
  if (!registryIds.has(id)) { console.error(`seed-fall-discoveries-2026: unknown event_id in flag: ${id}`); process.exit(1); }
}
let selected = FALL_DISCOVERIES_2026;
if (ONLY) selected = selected.filter((r) => ONLY.includes(r.event_id));
if (EXCLUDE) selected = selected.filter((r) => !EXCLUDE.includes(r.event_id));
if (!selected.length) { console.error("seed-fall-discoveries-2026: selection is empty"); process.exit(1); }

const rows = selected.map((row) => ({ ...row }));
const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
const normalized = rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null])));
const selectedIds = normalized.map((r) => r.event_id);
const selectedSlugs = normalized.map((r) => r.slug);
if (new Set(selectedSlugs).size !== selectedSlugs.length) {
  console.error("seed-fall-discoveries-2026: FAIL, duplicate slug inside the selection"); process.exit(1);
}

console.log(`seed-fall-discoveries-2026: selection ${normalized.length}/${FALL_DISCOVERIES_2026.length} rows${ONLY ? " (--only)" : EXCLUDE ? " (--exclude " + EXCLUDE.length + ")" : " (whole registry)"}${INSERT_ONLY ? ", insert-only" : ""}`);
for (const r of normalized) console.log(`  ${r.event_id}  →  /florida-events/${r.slug}  (${r.start_date}..${r.end_date ?? "open"}, tier ${r.source_tier}/${r.verification_confidence})`);

if (DRY) {
  console.log(`seed-fall-discoveries-2026: DRY OK, ${normalized.length} rows prepared, zero provider calls, nothing written`);
  process.exit(0);
}

const E = env();
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) {
  console.error("seed-fall-discoveries-2026: missing Supabase environment");
  process.exit(1);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const inList = (xs) => `(${xs.map((x) => `"${x.replace(/"/g, '\\"')}"`).join(",")})`;

async function countRows() {
  const r = await fetch(`${SUPA}/rest/v1/wf_events?select=event_id`, { method: "HEAD", headers: { ...H, prefer: "count=exact" } });
  if (!r.ok) throw new Error(`count failed ${r.status}`);
  const range = r.headers.get("content-range") || "";
  const n = Number(range.split("/")[1]);
  if (!Number.isFinite(n)) throw new Error(`count unreadable: ${range}`);
  return n;
}

// ── PREFLIGHT (immediately before the write) ─────────────────────────────
const baseline = await countRows();
const existingById = await (await fetch(`${SUPA}/rest/v1/wf_events?select=event_id,slug&event_id=in.${encodeURIComponent(inList(selectedIds))}`, { headers: H })).json();
const existingBySlug = await (await fetch(`${SUPA}/rest/v1/wf_events?select=event_id,slug&slug=in.${encodeURIComponent(inList(selectedSlugs))}`, { headers: H })).json();
const present = new Set((existingById || []).map((r) => r.event_id));
const slugCollisions = (existingBySlug || []).filter((r) => !selectedIds.includes(r.event_id));
console.log(`seed-fall-discoveries-2026: preflight — baseline ${baseline} rows; ${present.size}/${selectedIds.length} selected ids already present; ${slugCollisions.length} slug collision(s) with other rows`);
if (slugCollisions.length) {
  console.error(`seed-fall-discoveries-2026: FAIL, slug already used by a different event: ${slugCollisions.map((r) => `${r.slug}←${r.event_id}`).join(", ")}`);
  process.exit(1);
}
if (INSERT_ONLY && present.size) {
  console.error(`seed-fall-discoveries-2026: FAIL (insert-only), already present: ${[...present].join(", ")} — nothing written`);
  process.exit(1);
}
const expectedAfter = baseline + selectedIds.filter((id) => !present.has(id)).length;

// ── WRITE (one request, one transaction) ─────────────────────────────────
const response = await fetch(`${SUPA}/rest/v1/wf_events?on_conflict=event_id`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify(normalized),
});

if (!response.ok) {
  console.error(`seed-fall-discoveries-2026: FAIL ${response.status}, ${await response.text()}`);
  process.exit(1);
}

const written = await response.json();
const ids = new Set(written.map((row) => row.event_id));
const missing = normalized.filter((row) => !ids.has(row.event_id)).map((row) => row.event_id);
if (written.length !== normalized.length || missing.length) {
  console.error(`seed-fall-discoveries-2026: FAIL verification, wrote ${written.length}/${normalized.length}; missing ${missing.join(", ")}`);
  process.exit(1);
}

// ── POSTFLIGHT ───────────────────────────────────────────────────────────
const after = await countRows();
if (after !== expectedAfter) {
  console.error(`seed-fall-discoveries-2026: FAIL postflight, row count ${after} ≠ expected ${expectedAfter} (baseline ${baseline})`);
  process.exit(1);
}
console.log(`seed-fall-discoveries-2026: OK, ${written.length} rows upserted and returned (${expectedAfter - baseline} new); wf_events ${baseline} → ${after}`);
