#!/usr/bin/env node
// scripts/seed-places.mjs — the candidate-set seeder (PR-B slice 2). RUN BY HAND,
// read the output. Deliberately NOT a cron and NOT a Vercel route (owner's call):
// a cron is a self-refilling wrong-data machine (Google still lists closed places
// as open) and a public write endpoint is needless attack surface. This is the
// thing that finally makes Marie Selby and Mote eligible — it seeds Wayfind's own
// inventory by GEOGRAPHY + TYPE instead of letting a text search decide.
//
// USAGE (apply supabase/places-inventory.sql FIRST — even the dry run reads it):
//   GOOGLE_MAPS_SERVER_KEY=..  SUPABASE_URL=..  SUPABASE_SERVICE_ROLE_KEY=..  \
//     node scripts/seed-places.mjs --metro manatee-sarasota            # DRY RUN: prints the full diff, writes nothing
//     node scripts/seed-places.mjs --metro manatee-sarasota --commit   # writes wf_inventory (idempotent upsert)
//   Flags:
//     --grid <km>        grid spacing (default 15; smaller = more coverage + more Google calls)
//     --radius <m>       per-cell search radius (default 11000)
//     --rank <mode>      POPULARITY (default) | DISTANCE
//     --no-anchors       skip the anchor pass
//     --resume           continue a crashed run from its checkpoint (does not re-fetch done cells)
//     --limit-cells <n>  only process the first n grid cells (for a cheap trial run)
//
// UPSERT by Google Place ID, RESUMABLE (a checkpoint is written after every cell;
// --resume continues where a crash stopped, without re-fetching). IMPORTANT:
// re-running --commit OVERWRITES each row's Google-derived columns with fresh data
// (category, tags, editorial, needs_review, ...) — set locked=true on a hand-corrected
// row and the seeder skips it entirely, so a re-run never reinstates away your fix. It
// NEVER commits a non-operational place, and it prints every reconciliation failure and
// every review-queue row IN FULL, not as a count.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  TYPE_GROUPS, METRO_BOUNDS, metroGrid, buildInventoryRow, reconcile, computeDiff, categoryCounts,
} from "../lib/seedPlaces.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// searchNearby mask — validated live against searchNearby via the v6.06 probe.
const FIELD_MASK = [
  "places.id", "places.displayName", "places.primaryType", "places.types", "places.location",
  "places.rating", "places.userRatingCount", "places.priceLevel", "places.businessStatus",
  "places.editorialSummary", "places.photos",
].join(",");
// searchText mask (anchors) — a proven subset the production /api/places/search
// route already uses against searchText. Deliberately drops primaryType +
// editorialSummary (unvalidated for searchText, and an anchor forces its category
// so it needs neither) rather than risk every anchor silently failing on a bad field.
const ANCHOR_MASK = [
  "places.id", "places.displayName", "places.types", "places.location",
  "places.rating", "places.userRatingCount", "places.priceLevel", "places.businessStatus", "places.photos",
].join(",");

// ── args ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { metro: "manatee-sarasota", commit: false, grid: 15, radius: 11000, rank: "POPULARITY", anchors: true, resume: false, limitCells: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--metro") a.metro = argv[++i];
    else if (k === "--commit") a.commit = true;
    else if (k === "--grid") a.grid = Number(argv[++i]);
    else if (k === "--radius") a.radius = Number(argv[++i]);
    else if (k === "--rank") a.rank = String(argv[++i] || "").toUpperCase() === "DISTANCE" ? "DISTANCE" : "POPULARITY";
    else if (k === "--no-anchors") a.anchors = false;
    else if (k === "--resume") a.resume = true;
    else if (k === "--limit-cells") a.limitCells = Number(argv[++i]);
    else if (k === "--help" || k === "-h") { a.help = true; }
  }
  return a;
}

function env() {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [];
  if (!key) missing.push("GOOGLE_MAPS_SERVER_KEY");
  if (!url) missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!service) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return { key, url, service, missing };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One Google Places (New) call with retry on 429/5xx.
async function googlePost(path, body, key, mask) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch("https://places.googleapis.com/v1/places:" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask },
      body: JSON.stringify(body),
    });
    if (r.ok) return (await r.json()).places || [];
    if (![429, 500, 502, 503].includes(r.status)) {
      const t = await r.text();
      throw new Error(`${path} ${r.status}: ${t.slice(0, 300)}`);
    }
    await sleep(600 * (attempt + 1));
  }
  throw new Error(`${path}: exhausted retries (429/5xx)`);
}

const nearby = (cell, includedTypes, rank, key) => googlePost("searchNearby", {
  includedTypes, maxResultCount: 20, rankPreference: rank,
  locationRestriction: { circle: { center: { latitude: cell.lat, longitude: cell.lng }, radius: cell.radius } },
}, key, FIELD_MASK);

const textSearch = (q, center, key) => googlePost("searchText", {
  textQuery: q, maxResultCount: 3, locationBias: { circle: { center, radius: 40000 } },
}, key, ANCHOR_MASK);

// ── Supabase ────────────────────────────────────────────────────────────────
// Fail-fast: confirm the table exists in ONE call, BEFORE spending ~135 Google
// calls — so a forgotten migration costs one request, not the whole quota + the
// reports lost to a FATAL at the end.
async function assertTable(url, service) {
  const r = await fetch(`${url}/rest/v1/wf_inventory?select=place_id&limit=1`, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
  if (!r.ok) throw new Error(`wf_inventory not readable (${r.status}: ${(await r.text()).slice(0, 160)}). Apply supabase/places-inventory.sql first.`);
}

async function readExisting(url, service, metro) {
  const r = await fetch(`${url}/rest/v1/wf_inventory?metro=eq.${encodeURIComponent(metro)}&select=place_id,category,tags,status,signals,locked&limit=20000`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  if (!r.ok) throw new Error(`read wf_inventory ${r.status}: ${(await r.text()).slice(0, 200)} (did you apply supabase/places-inventory.sql?)`);
  const map = new Map();
  for (const row of await r.json()) map.set(row.place_id, row);
  return map;
}

async function upsert(url, service, rows) {
  const cols = (r) => ({
    place_id: r.place_id, name: r.name, lat: r.lat, lng: r.lng, category: r.category, tags: r.tags,
    google_types: r.google_types, primary_type: r.primary_type, metro: r.metro, signals: r.signals,
    editorial: r.editorial, photo_ref: r.photo_ref, status: r.status, anchor: r.anchor, source: r.source,
    needs_review: r.needs_review, last_verified_at: r.last_verified_at, refreshed_at: new Date().toISOString(),
  });
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200).map(cols);
    const r = await fetch(`${url}/rest/v1/wf_inventory`, {
      method: "POST",
      headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (!r.ok) throw new Error(`upsert ${r.status}: ${(await r.text()).slice(0, 300)}`);
    written += batch.length;
    process.stdout.write(`  upserted ${written}/${rows.length}\r`);
  }
  console.log(`  upserted ${written}/${rows.length}     `);
}

// ── checkpoint (crash recovery) ──────────────────────────────────────────────
const ckPath = (metro) => join(ROOT, `.seed-progress.${metro}.json`);
function loadCk(metro) { try { return JSON.parse(readFileSync(ckPath(metro), "utf8")); } catch { return null; } }
function saveCk(metro, ck) { try { writeFileSync(ckPath(metro), JSON.stringify(ck)); } catch (e) { console.warn("  (checkpoint write failed: " + e.message + ")"); } }
function clearCk(metro) { try { unlinkSync(ckPath(metro)); } catch {} }

function hr(t) { console.log("\n" + "─".repeat(64) + "\n" + t); }

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 26).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  if (!METRO_BOUNDS[args.metro]) { console.error(`Unknown metro "${args.metro}". Known: ${Object.keys(METRO_BOUNDS).join(", ")}`); process.exit(1); }
  const { key, url, service, missing } = env();
  if (missing.length) { console.error("Missing env: " + missing.join(", ")); process.exit(1); }
  // Fail in one call if the migration wasn't applied — before burning ~135 Google calls.
  await assertTable(url, service).catch((e) => { console.error(e.message); process.exit(1); });

  const nowIso = new Date().toISOString();
  const b = METRO_BOUNDS[args.metro];
  const center = { latitude: (b.minLat + b.maxLat) / 2, longitude: (b.minLng + b.maxLng) / 2 };
  let cells = metroGrid(args.metro, args.grid, args.radius);
  if (args.limitCells > 0) cells = cells.slice(0, args.limitCells);
  const groups = Object.keys(TYPE_GROUPS);

  console.log(`Seeding "${args.metro}" — ${cells.length} grid cells x ${groups.length} type groups, rank=${args.rank}, ${args.commit ? "COMMIT" : "DRY RUN"}`);

  // checkpoint: { done:[cellIdx], places:{id:rawGooglePlace} }
  let ck = args.resume ? loadCk(args.metro) : null;
  if (ck) console.log(`  resuming: ${ck.done.length}/${cells.length} cells already fetched`);
  else ck = { done: [], places: {} };
  if (!args.resume && loadCk(args.metro)) console.log("  (a checkpoint from a prior run exists; ignoring it — pass --resume to continue that run instead)");

  // ── discovery: grid x type groups ──
  const doneSet = new Set(ck.done);
  for (let i = 0; i < cells.length; i++) {
    if (doneSet.has(i)) continue;
    for (const g of groups) {
      try {
        const places = await nearby(cells[i], TYPE_GROUPS[g], args.rank, key);
        for (const p of places) if (p && p.id) ck.places[p.id] = p;
        await sleep(120);
      } catch (e) { console.warn(`  cell ${i} group ${g}: ${e.message}`); }
    }
    ck.done.push(i);
    saveCk(args.metro, ck);
    process.stdout.write(`  fetched cell ${i + 1}/${cells.length} — ${Object.keys(ck.places).length} unique places\r`);
  }
  console.log(`\n  discovery done: ${Object.keys(ck.places).length} unique places from the grid`);

  const results = Object.values(ck.places).map((p) => buildInventoryRow(p, args.metro, { nowIso }));

  // ── anchors (resolved by name -> forced category) ──
  const anchorReport = [];
  if (args.anchors) {
    let anchors = [];
    try { anchors = (JSON.parse(readFileSync(join(ROOT, "data/anchors.json"), "utf8"))[args.metro]) || []; } catch (e) { console.warn("  anchors.json: " + e.message); }
    for (const a of anchors) {
      try {
        const hits = await textSearch(`${a.name} ${a.city || ""}`.trim(), center, key);
        await sleep(120);
        const p = hits[0];
        if (!p || !p.id) { anchorReport.push({ anchor: a, ok: false, note: "NO Google result" }); continue; }
        const built = buildInventoryRow(p, args.metro, { anchor: a, nowIso });
        results.push(built);
        const name = (p.displayName && p.displayName.text) || "?";
        anchorReport.push({ anchor: a, ok: true, resolvedName: name, place_id: p.id, status: p.businessStatus || "?", closed: !!built.nonOperational });
      } catch (e) { anchorReport.push({ anchor: a, ok: false, note: e.message }); }
    }
  }

  // ── reconcile + classify ──
  const { rows, failures, review } = reconcile(results);
  const committable = rows.filter((r) => !r.status || r.status === "OPERATIONAL");
  const skippedClosed = rows.filter((r) => r.status && r.status !== "OPERATIONAL");

  // ── REPORT ──
  hr("COVERAGE (per-category candidate counts — the 'is the inversion fixed' signal)");
  const counts = categoryCounts(committable);
  for (const c of ["food", "nightlife", "attractions", "beach", "hotels", "shopping"]) console.log(`  ${c.padEnd(12)} ${counts[c] || 0}`);
  console.log(`  ${"TOTAL".padEnd(12)} ${committable.length} committable  (${skippedClosed.length} closed skipped, ${review.length} in review queue)`);

  hr(`ANCHORS (${anchorReport.filter((a) => a.ok).length}/${anchorReport.length} resolved)`);
  for (const a of anchorReport) {
    if (!a.ok) console.log(`  ✗ ${a.anchor.name} (${a.anchor.city}) -> ${a.note}`);
    else console.log(`  ${a.closed ? "⚠ CLOSED" : "✓"} ${a.anchor.name} -> "${a.resolvedName}" [${a.place_id}] ${a.closed ? "(" + a.status + " — FIX THE ANCHOR)" : ""}`);
  }

  hr(`RECONCILIATION FAILURES — could not classify (full list, ${failures.length})`);
  for (const f of failures) {
    const p = f.place || {};
    console.log(`  ${(p.name || "?").padEnd(34)} [${p.place_id || "?"}] primary=${p.primary_type || "-"} types=${(p.google_types || []).slice(0, 5).join(",")} — ${f.reason}`);
  }

  hr(`REVIEW QUEUE — seeded but unverified (name-recovered or non-operational), full list (${review.length})`);
  for (const r of review) console.log(`  ${r.name.padEnd(34)} -> ${r.category} via ${r.via}${r.status && r.status !== "OPERATIONAL" ? " [" + r.status + "]" : ""}`);

  if (skippedClosed.length) {
    hr(`SKIPPED — non-operational, NOT committed (full list, ${skippedClosed.length})`);
    for (const r of skippedClosed) console.log(`  ${r.name.padEnd(34)} [${r.status}] ${r.anchor ? "(ANCHOR — fix it)" : ""}`);
  }

  // ── diff vs current table, protecting locked rows from clobber ──
  const existing = await readExisting(url, service, args.metro);
  const lockedIds = new Set([...existing.entries()].filter(([, v]) => v.locked).map(([k]) => k));
  const toCommit = committable.filter((r) => !lockedIds.has(r.place_id));
  const lockedPreserved = committable.length - toCommit.length;
  const diff = computeDiff(toCommit, existing);
  hr(`DIFF vs current wf_inventory (${existing.size} existing rows${lockedIds.size ? `, ${lockedIds.size} locked` : ""})`);
  console.log(`  ADD ${diff.add.length} · UPDATE ${diff.update.length} · UNCHANGED ${diff.unchanged}${lockedPreserved ? ` · ${lockedPreserved} LOCKED (left untouched)` : ""}`);
  if (diff.add.length) { console.log(`  --- would ADD ---`); for (const r of diff.add) console.log(`   + ${r.name.padEnd(34)} ${r.category}${r.anchor ? " (anchor)" : ""}`); }
  if (diff.update.length) { console.log(`  --- would UPDATE (overwrites the row's Google-derived columns) ---`); for (const r of diff.update) console.log(`   ~ ${r.name.padEnd(34)} ${r.category}`); }

  // ── commit ──
  if (!args.commit) {
    hr("DRY RUN — nothing written.");
    console.log("  First run: `--limit-cells 2` does a ~12-call end-to-end trial (key + table + upsert) before the full run.");
    console.log("  Then `--commit --resume` reuses THIS run's fetched checkpoint instead of paying Google again.");
    return;
  }
  hr(`COMMIT — upserting ${toCommit.length} rows to wf_inventory${lockedPreserved ? ` (${lockedPreserved} locked rows skipped)` : ""}`);
  await upsert(url, service, toCommit);
  clearCk(args.metro);
  console.log("\nHEADS-UP: re-running --commit OVERWRITES each row's Google-derived columns with fresh data");
  console.log("(category, tags, editorial, needs_review, ...). After you hand-correct a row, set locked=true");
  console.log("on it — the seeder then skips it entirely, so your fix is never reinstated away.");
}

main().catch((e) => { console.error("\nFATAL: " + (e && e.stack || e)); process.exit(1); });
