#!/usr/bin/env node
// scripts/promote-index.mjs — promote the discovery INDEX (wf_place_ids) into the
// owned LIBRARY (wf_inventory). RUN BY HAND, read the output. Same posture as the
// seeder: not a cron, not a route — a hand-run tool whose every mutation is gated.
//
// SAFETY MODEL (three explicit gears; each costs strictly more than the last):
//   (default) PLAN        — FREE. Reads both tables, computes the missing set +
//                           a record-by-record report + a cost ESTIMATE. No Google
//                           calls, no writes. This is what you run first.
//   --enrich              — PAID (Google Place Details) up to the caps, builds +
//                           VALIDATES every row, prints the exact would-write diff
//                           and every rejected row. STILL NO WRITE.
//   --enrich --apply      — after a snapshot BACKUP and a typed CONFIRMATION,
//                           upserts the validated rows (service role, idempotent
//                           merge-duplicates). Writes an AUDIT log. Prints ROLLBACK.
//   --restore <backup>    — re-upsert a backup file (rollback of an UPDATE).
//
// USAGE:
//   SUPABASE_URL=..  SUPABASE_SERVICE_ROLE_KEY=..  node scripts/promote-index.mjs --metro orlando
//   ... add GOOGLE_MAPS_SERVER_KEY and --enrich to price + preview the real rows
//   ... add --apply (and confirm) to write
//   Flags:
//     --metro <key>          orlando (default) | tampa | st-pete | manatee-sarasota
//     --limit <n>            max records to enrich THIS run (default 500)
//     --max-spend <usd>      hard spend cap; never exceeded (default 25)
//     --cost-per-record <n>  Place Details SKU rate (default 0.017 = ~$17/1k, Pro)
//     --skip-review          exclude name-recovered rows (needs_review) from the write
//     --enrich               make the paid Place Details calls (no write without --apply)
//     --apply                write to wf_inventory (implies --enrich; requires confirm)
//     --yes "<phrase>"       non-interactive confirmation (must equal the printed phrase)
//     --restore <file>       re-upsert a backup JSON (rollback); requires confirm
//     --refresh              re-fetch from Google even if a place is cached
//
// IDEMPOTENT: upsert by place_id (merge-duplicates); a rerun promotes only what is
// still missing and can never create a duplicate. NEVER deletes. NEVER writes a
// non-operational place or a row that fails validation.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createInterface } from "readline";
import {
  PROMOTE_METROS, computeMissing, planEnrichment, buildInventoryRow, reconcile,
  computeDiff, categoryCounts, toWriteRow, validateInventoryRow, dedupeById, auditEntry,
} from "../lib/promoteIndex.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT_DIR = join(ROOT, ".promote-audit");
const BACKUP_DIR = join(ROOT, ".promote-backup");
// v2: cache the EXPENSIVE half (raw Google Place Details resources) per metro so
// a --enrich preview and the later --apply — or a re-apply, or the next metro's
// overlap — never pay Google twice. The cheap half (classify + validate) always
// re-runs live off the cached resource. --refresh ignores the cache.
const CACHE_DIR = join(ROOT, ".promote-cache");

// Place Details (New) field mask — EXACTLY the fields extractPlaceFields/buildInventoryRow
// consume, and no more. Deliberately excludes atmosphere fields (hours/utcOffset):
// inventory stores none of them, so requesting them would only raise the SKU tier.
const DETAILS_MASK = [
  "id", "displayName", "location", "types", "primaryType",
  "rating", "userRatingCount", "priceLevel", "businessStatus", "editorialSummary", "photos",
].join(",");

function parseArgs(argv) {
  const a = { metro: "orlando", limit: 500, maxSpend: 25, costPerRecord: 0.017, skipReview: false, enrich: false, apply: false, yes: null, restore: null, refresh: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--metro") a.metro = argv[++i];
    else if (k === "--limit") a.limit = Math.max(0, Math.floor(Number(argv[++i])));
    else if (k === "--max-spend") a.maxSpend = Math.max(0, Number(argv[++i]));
    else if (k === "--cost-per-record") a.costPerRecord = Math.max(0, Number(argv[++i]));
    else if (k === "--skip-review") a.skipReview = true;
    else if (k === "--enrich") a.enrich = true;
    else if (k === "--apply") { a.apply = true; a.enrich = true; }
    else if (k === "--yes") a.yes = String(argv[++i] ?? "");
    else if (k === "--restore") a.restore = String(argv[++i] ?? "");
    else if (k === "--refresh") a.refresh = true;
    else if (k === "--help" || k === "-h") a.help = true;
  }
  return a;
}

function env(needGoogle) {
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  const missing = [];
  if (!url) missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!service) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (needGoogle && !key) missing.push("GOOGLE_MAPS_SERVER_KEY");
  return { url, service, key, missing };
}
const hostOf = (url) => { try { return new URL(url).host; } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function hr(t) { console.log("\n" + "─".repeat(66) + "\n" + t); }
function stamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

// ── Supabase reads (free, read-only) ─────────────────────────────────────────
async function sbGet(url, service, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function readIndex(url, service) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${url}/rest/v1/wf_place_ids?select=place_id,name,lat,lng`, {
      headers: { apikey: service, Authorization: `Bearer ${service}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`read wf_place_ids → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
async function readInventoryIds(url, service) {
  const ids = new Set();
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${url}/rest/v1/wf_inventory?select=place_id`, {
      headers: { apikey: service, Authorization: `Bearer ${service}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`read wf_inventory ids → ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json();
    for (const row of rows) ids.add(row.place_id);
    if (rows.length < 1000) break;
  }
  return ids;
}
// Full existing rows for a set of ids — the pre-write BACKUP (rollback source).
async function readRowsForIds(url, service, ids) {
  const list = [...ids];
  const out = [];
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100).map((x) => `"${x}"`).join(",");
    const rows = await sbGet(url, service, `wf_inventory?place_id=in.(${chunk})&select=*`);
    out.push(...rows);
  }
  return out;
}

// ── Google Place Details (PAID — only called under --enrich) ─────────────────
async function enrichOne(key, placeId, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_MASK },
    });
    if (r.ok) return r.json();
    if (![429, 500, 502, 503].includes(r.status)) throw new Error(`details ${placeId} → ${r.status}: ${(await r.text()).slice(0, 160)}`);
    await sleep(600 * (attempt + 1));
  }
  throw new Error(`details ${placeId}: exhausted retries (429/5xx)`);
}

// ── idempotent upsert (the ONLY write; never a delete) ───────────────────────
async function upsert(url, service, rows) {
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const r = await fetch(`${url}/rest/v1/wf_inventory`, {
      method: "POST",
      headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (!r.ok) throw new Error(`upsert → ${r.status}: ${(await r.text()).slice(0, 300)}`);
    written += batch.length;
    process.stdout.write(`  upserted ${written}/${rows.length}\r`);
  }
  console.log(`  upserted ${written}/${rows.length}     `);
  return written;
}

function ensureDirs() { for (const d of [AUDIT_DIR, BACKUP_DIR, CACHE_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
function appendAudit(file, entry) { try { writeFileSync(file, JSON.stringify(entry) + "\n", { flag: "a" }); } catch (e) { console.warn("  (audit write failed: " + e.message + ")"); } }

function confirm(phrase, presetYes) {
  if (presetYes != null) return Promise.resolve(presetYes.trim() === phrase);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(`\nType exactly this phrase to write to PRODUCTION, or anything else to abort:\n  ${phrase}\n> `, (ans) => { rl.close(); res(String(ans).trim() === phrase); }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 34).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  ensureDirs();
  const nowIso = new Date().toISOString();

  // ── restore (rollback) ─────────────────────────────────────────────────────
  if (args.restore) {
    const { url, service, missing } = env(false);
    if (missing.length) { console.error("Missing env: " + missing.join(", ")); process.exit(1); }
    const backup = JSON.parse(readFileSync(args.restore, "utf8"));
    const rows = (backup.rows || []).map((r) => toWriteRow(r, nowIso));
    console.log(`RESTORE — re-upsert ${rows.length} row(s) from ${args.restore} to ${hostOf(url)}`);
    const phrase = `RESTORE ${rows.length}`;
    if (!(await confirm(phrase, args.yes))) { console.log("Aborted — phrase did not match. Nothing written."); return; }
    await upsert(url, service, rows);
    appendAudit(join(AUDIT_DIR, `restore-${stamp()}.jsonl`), auditEntry({ mode: "restore", metroKey: null, args, host: hostOf(url), counts: { restored: rows.length }, nowIso }));
    console.log("Restore complete.");
    return;
  }

  if (!PROMOTE_METROS[args.metro]) { console.error(`Unknown --metro "${args.metro}". Known: ${Object.keys(PROMOTE_METROS).join(", ")}`); process.exit(1); }
  const { url, service, key, missing } = env(args.enrich);
  if (missing.length) { console.error("Missing env: " + missing.join(", ")); process.exit(1); }
  const host = hostOf(url);
  const auditFile = join(AUDIT_DIR, `promote-${args.metro}-${stamp()}.jsonl`);

  // ── PLAN (free) ─────────────────────────────────────────────────────────────
  console.log(`Promote "${args.metro}" — reading index + library from ${host} …`);
  const [index, existingIds] = await Promise.all([readIndex(url, service), readInventoryIds(url, service)]);
  const { missing: missingRows, skipped } = computeMissing(index, existingIds, args.metro);
  const plan = planEnrichment(missingRows.length, { costPerRecord: args.costPerRecord, maxSpendUSD: args.maxSpend, recordLimit: args.limit });

  hr(`PLAN — ${args.metro}`);
  console.log(`  index rows read ............ ${index.length}`);
  console.log(`  already in library ......... ${skipped.existing}`);
  console.log(`  out of ${args.metro} box ....... ${skipped.outOfBox}`);
  console.log(`  unlocatable (no coords) .... ${skipped.unlocatable}`);
  console.log(`  duplicate ids in index ..... ${skipped.dupe}`);
  console.log(`  MISSING (promotable) ....... ${missingRows.length}`);
  hr("COST ESTIMATE (computed BEFORE any paid call)");
  console.log(`  SKU rate (per record) ...... $${plan.costPerRecord.toFixed(4)}  (--cost-per-record)`);
  console.log(`  record limit ............... ${plan.recordLimit}  (--limit)`);
  console.log(`  spend cap .................. $${plan.spendCapUSD.toFixed(2)}  (--max-spend; never exceeded)`);
  console.log(`  WILL ENRICH this run ....... ${plan.willEnrich}${plan.cappedBySpend ? "  [capped by spend]" : plan.cappedByLimit ? "  [capped by --limit]" : ""}`);
  console.log(`  estimated cost this run .... $${plan.estimateUSD.toFixed(2)}`);
  console.log(`  full backlog would cost .... $${plan.fullEstimateUSD.toFixed(2)} for all ${missingRows.length}`);

  const slice = missingRows.slice(0, plan.willEnrich);
  hr(`WOULD ENRICH — record-by-record (${slice.length})`);
  for (const m of slice) console.log(`  + ${(m.name || "(name pending)").slice(0, 40).padEnd(40)} [${m.place_id}]  ${m.lat.toFixed(4)},${m.lng.toFixed(4)}`);

  appendAudit(auditFile, auditEntry({ mode: args.apply ? "apply" : args.enrich ? "enrich" : "plan", metroKey: args.metro, args, host, counts: { index: index.length, missing: missingRows.length, willEnrich: plan.willEnrich, skipped }, costPlan: plan, sampleIds: slice.map((m) => m.place_id), nowIso }));

  if (!args.enrich) {
    hr("PLAN ONLY — no paid calls, nothing written.");
    console.log(`  Next (PAID preview, still no write):  node scripts/promote-index.mjs --metro ${args.metro} --enrich`);
    console.log(`  Audit: ${auditFile}`);
    return;
  }
  if (plan.willEnrich === 0) { hr("Nothing to enrich (missing set is empty or caps are 0)."); return; }

  // ── ENRICH (cached raw resources → paid ONLY on a cache miss) ───────────────
  const cachePath = join(CACHE_DIR, `enrich-${args.metro}.json`);
  let cache = {};
  if (!args.refresh) { try { cache = JSON.parse(readFileSync(cachePath, "utf8")); } catch {} }
  const cachedInSlice = slice.filter((m) => cache[m.place_id]).length;
  const toFetch = slice.length - cachedInSlice;
  hr(`ENRICHING ${slice.length} place(s) — ${cachedInSlice} cached (free), ${toFetch} paid via Google Place Details (~$${(toFetch * args.costPerRecord).toFixed(2)})${args.refresh ? "  [--refresh: ignoring cache]" : ""}`);
  const built = [];
  const enrichFail = [];
  let paid = 0, hits = 0, dirty = false;
  for (let i = 0; i < slice.length; i++) {
    try {
      let res = cache[slice[i].place_id];
      if (res) { hits++; }
      else { res = await enrichOne(key, slice[i].place_id); paid++; cache[slice[i].place_id] = res; dirty = true; await sleep(60); }
      const b = buildInventoryRow(res, args.metro, { nowIso });
      if (!b.row) { enrichFail.push({ place_id: slice[i].place_id, reason: b.reason }); }
      else built.push(b.row);
    } catch (e) { enrichFail.push({ place_id: slice[i].place_id, reason: e.message }); }
    process.stdout.write(`  processed ${i + 1}/${slice.length} (paid ${paid}, cached ${hits})\r`);
  }
  console.log("");
  if (dirty) { try { writeFileSync(cachePath, JSON.stringify(cache)); } catch (e) { console.warn("  (cache write failed: " + e.message + ")"); } }
  console.log(`  enrichment: ${paid} paid Google call(s) (~$${(paid * args.costPerRecord).toFixed(2)}), ${hits} reused from cache → ${cachePath}`);

  // reconcile → project → VALIDATE every row → dedupe
  const { rows: recon } = reconcile(built.map((row) => ({ row })));
  let candidates = args.skipReview ? recon.filter((r) => !r.needs_review) : recon;
  const writeRows = [], rejected = [];
  for (const r of candidates) {
    const w = toWriteRow(r, nowIso);
    const v = validateInventoryRow(w, { metroKey: args.metro });
    if (v.ok) writeRows.push(w); else rejected.push({ place_id: w.place_id, name: w.name, errors: v.errors });
  }
  const deduped = dedupeById(writeRows);
  const needsReview = deduped.rows.filter((r) => r.needs_review).length;

  const existingForDiff = new Map();
  // (diff needs existing rows; we only fetched ids. For the preview we mark
  // all as ADD unless the id was already in the library — which computeMissing
  // already excluded, so every validated row is an ADD. Kept explicit for clarity.)
  const diff = computeDiff(deduped.rows, existingForDiff);

  hr(`VALIDATION — ${deduped.rows.length} ready, ${rejected.length} rejected, ${enrichFail.length} enrich-failed, ${deduped.dropped} dup-dropped`);
  const cc = categoryCounts(deduped.rows);
  for (const c of ["food", "nightlife", "attractions", "beach", "hotels", "shopping"]) if (cc[c]) console.log(`  ${c.padEnd(12)} ${cc[c]}`);
  if (needsReview) console.log(`  (${needsReview} flagged needs_review — name-recovered; ${args.skipReview ? "excluded" : "included, use --skip-review to drop"})`);
  if (rejected.length) { console.log(`  --- REJECTED (never written) ---`); for (const x of rejected) console.log(`   ✗ ${(x.name || "?").slice(0, 34).padEnd(34)} [${x.place_id}] ${x.errors.join("; ")}`); }
  if (enrichFail.length) { console.log(`  --- ENRICH FAILED ---`); for (const x of enrichFail) console.log(`   ✗ ${x.place_id} — ${x.reason}`); }

  hr(`WOULD WRITE — ADD ${diff.add.length} row(s) to wf_inventory @ ${host}`);
  for (const r of diff.add) console.log(`   + ${r.name.slice(0, 40).padEnd(40)} ${r.category}${r.needs_review ? " (review)" : ""}`);

  if (!args.apply) {
    hr("ENRICH PREVIEW — nothing written (add --apply to write).");
    console.log(`  Audit: ${auditFile}`);
    return;
  }

  // ── APPLY: backup → confirm → upsert → audit → rollback note ─────────────────
  const affected = new Set(deduped.rows.map((r) => r.place_id));
  const priorRows = await readRowsForIds(url, service, affected); // rows that ALREADY exist (updates); adds have none
  const backupFile = join(BACKUP_DIR, `backup-${args.metro}-${stamp()}.json`);
  writeFileSync(backupFile, JSON.stringify({ ts: nowIso, metro: args.metro, host, willWriteIds: [...affected], priorRows }, null, 2));
  console.log(`\nBackup written: ${backupFile}  (${priorRows.length} prior row(s) captured; ${affected.size - priorRows.length} are new ADDs)`);

  const phrase = `PROMOTE ${args.metro} ${deduped.rows.length}`;
  if (!(await confirm(phrase, args.yes))) { console.log("Aborted — phrase did not match. Nothing written."); appendAudit(auditFile, auditEntry({ mode: "apply-aborted", metroKey: args.metro, args, host, counts: { wouldWrite: deduped.rows.length }, nowIso: new Date().toISOString() })); return; }

  hr(`APPLY — upserting ${deduped.rows.length} row(s) (idempotent merge-duplicates)`);
  const written = await upsert(url, service, deduped.rows);
  appendAudit(auditFile, auditEntry({ mode: "apply-done", metroKey: args.metro, args, host, counts: { written, added: diff.add.length, rejected: rejected.length, enrichFail: enrichFail.length, backup: backupFile }, sampleIds: [...affected], nowIso: new Date().toISOString() }));

  hr("ROLLBACK");
  console.log(`  UPDATES (${priorRows.length}): restore prior rows with`);
  console.log(`    node scripts/promote-index.mjs --restore ${backupFile}`);
  const addIds = [...affected].filter((id) => !priorRows.some((p) => p.place_id === id));
  if (addIds.length) {
    console.log(`  ADDS (${addIds.length}): the script never deletes. To undo the new rows, run this SQL in Supabase:`);
    console.log(`    delete from public.wf_inventory where place_id in (${addIds.map((x) => `'${x}'`).join(", ")});`);
  }
  console.log(`\n  Audit: ${auditFile}`);
  console.log("Done.");
}

main().catch((e) => { console.error("\nFATAL: " + (e && e.stack || e)); process.exit(1); });
