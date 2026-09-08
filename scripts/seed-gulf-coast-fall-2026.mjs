#!/usr/bin/env node
/**
 * Apply the reviewed Gulf Coast fall evidence package.
 *
 * No paid provider calls. Rows and patches are explicitly selected, dry-run
 * validated, written with narrow PostgREST requests, and read back afterward.
 *
 *   node scripts/seed-gulf-coast-fall-2026.mjs --dry
 *   node scripts/seed-gulf-coast-fall-2026.mjs
 *   node scripts/seed-gulf-coast-fall-2026.mjs --only=id1,id2
 */
import { readFileSync } from "node:fs";
import {
  GULF_COAST_FALL_2026_HELD,
  GULF_COAST_FALL_2026_PATCHES,
  GULF_COAST_FALL_2026_ROWS,
} from "../lib/gulfCoastFall2026.js";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const onlyArg = args.find((arg) => arg.startsWith("--only="));
const ONLY = onlyArg ? new Set(onlyArg.slice(7).split(",").map((id) => id.trim()).filter(Boolean)) : null;

const allIds = new Set([
  ...GULF_COAST_FALL_2026_ROWS.map((row) => row.event_id),
  ...GULF_COAST_FALL_2026_PATCHES.map((patch) => patch.event_id),
]);
if (ONLY) {
  for (const id of ONLY) {
    if (!allIds.has(id)) throw new Error(`Unknown --only event_id: ${id}`);
  }
}

const rows = GULF_COAST_FALL_2026_ROWS.filter((row) => !ONLY || ONLY.has(row.event_id));
const patches = GULF_COAST_FALL_2026_PATCHES.filter((patch) => !ONLY || ONLY.has(patch.event_id));

function validate() {
  const errors = [];
  const ids = [...GULF_COAST_FALL_2026_ROWS.map((row) => row.event_id), ...GULF_COAST_FALL_2026_PATCHES.map((patch) => patch.event_id)];
  const slugs = GULF_COAST_FALL_2026_ROWS.map((row) => row.slug);
  if (new Set(ids).size !== ids.length) errors.push("duplicate event_id");
  if (new Set(slugs).size !== slugs.length) errors.push("duplicate slug");
  for (const row of rows) {
    for (const key of ["event_id", "slug", "event_name", "start_date", "venue", "city", "source_url", "source_type", "verification_confidence"]) {
      if (!row[key]) errors.push(`${row.event_id}: missing ${key}`);
    }
    if (row.end_date && row.end_date < row.start_date) errors.push(`${row.event_id}: end precedes start`);
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) errors.push(`${row.event_id}: invalid coordinates`);
    for (const key of ["source_url", "official_event_url", "official_ticket_url"]) {
      if (row[key] && !row[key].startsWith("https://")) errors.push(`${row.event_id}: ${key} must use HTTPS`);
    }
  }
  for (const patch of patches) {
    if (!patch.set || !Object.keys(patch.set).length) errors.push(`${patch.event_id}: empty patch`);
    if ("event_id" in patch.set || "slug" in patch.set) errors.push(`${patch.event_id}: identity fields cannot be patched`);
  }
  if (errors.length) throw new Error(`Validation failed:\n- ${errors.join("\n- ")}`);
}

validate();
console.log(`seed-gulf-coast-fall-2026: ${rows.length} new row(s), ${patches.length} correction(s), ${GULF_COAST_FALL_2026_HELD.length} held package group(s)`);
for (const row of rows) console.log(`  INSERT ${row.event_id} → /florida-events/${row.slug}`);
for (const patch of patches) console.log(`  PATCH  ${patch.event_id}: ${Object.keys(patch.set).join(", ")}`);
for (const held of GULF_COAST_FALL_2026_HELD) console.log(`  HOLD   ${held.id}: ${held.reason}`);
if (DRY) {
  console.log("seed-gulf-coast-fall-2026: DRY OK; no network calls and nothing written");
  process.exit(0);
}

function env() {
  const output = { ...process.env };
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match) output[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return output;
}

const E = env();
const SUPA = E.NEXT_PUBLIC_SUPABASE_URL;
const KEY = E.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !KEY) throw new Error("Missing Supabase environment");
const headers = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const quoteList = (values) => `(${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")})`;

async function getExisting(ids) {
  if (!ids.length) return [];
  const url = `${SUPA}/rest/v1/wf_events?select=event_id,slug&event_id=in.${encodeURIComponent(quoteList(ids))}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Preflight failed ${response.status}: ${await response.text()}`);
  return response.json();
}

const newIds = rows.map((row) => row.event_id);
const patchIds = patches.map((patch) => patch.event_id);
const existingNew = await getExisting(newIds);
const selectedSlugs = new Set(rows.map((row) => row.slug));
if (selectedSlugs.size !== rows.length) throw new Error("Duplicate slug inside selected rows");
if (selectedSlugs.size) {
  const url = `${SUPA}/rest/v1/wf_events?select=event_id,slug&slug=in.${encodeURIComponent(quoteList([...selectedSlugs]))}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Slug preflight failed ${response.status}: ${await response.text()}`);
  const collisions = (await response.json()).filter((row) => !newIds.includes(row.event_id));
  if (collisions.length) throw new Error(`Slug belongs to another event: ${collisions.map((row) => `${row.slug}←${row.event_id}`).join(", ")}`);
}
const existingPatches = await getExisting(patchIds);
const missingPatches = patchIds.filter((id) => !existingPatches.some((row) => row.event_id === id));
if (missingPatches.length) throw new Error(`Refusing partial write; patch targets missing: ${missingPatches.join(", ")}`);

if (rows.length) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const normalized = rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null])));
  const response = await fetch(`${SUPA}/rest/v1/wf_events?on_conflict=event_id`, {
    method: "POST",
    headers: { ...headers, prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(normalized),
  });
  if (!response.ok) throw new Error(`Insert failed ${response.status}: ${await response.text()}`);
  const written = await response.json();
  if (written.length !== rows.length) throw new Error(`Insert verification returned ${written.length}/${rows.length} rows`);
}

for (const patch of patches) {
  const response = await fetch(`${SUPA}/rest/v1/wf_events?event_id=eq.${encodeURIComponent(patch.event_id)}`, {
    method: "PATCH",
    headers: { ...headers, prefer: "return=representation" },
    body: JSON.stringify(patch.set),
  });
  if (!response.ok) throw new Error(`Patch ${patch.event_id} failed ${response.status}: ${await response.text()}`);
  const written = await response.json();
  if (written.length !== 1) throw new Error(`Patch ${patch.event_id} returned ${written.length} rows`);
}

const verified = await getExisting([...newIds, ...patchIds]);
const expected = newIds.length + patchIds.length;
if (verified.length !== expected) throw new Error(`Postflight found ${verified.length}/${expected} selected rows`);
const inserted = newIds.filter((id) => !existingNew.some((row) => row.event_id === id)).length;
console.log(`seed-gulf-coast-fall-2026: OK; ${inserted} inserted, ${rows.length - inserted} refreshed, ${patches.length} corrected, ${verified.length} read back`);
