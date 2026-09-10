#!/usr/bin/env node
// Validate and optionally publish a reviewed, source-grounded editorial pack.
// Default is offline and read-only. --live adds Supabase preflight reads.
// --commit inserts only rows whose three editorial slots are still blank.
// No AI or Places provider is called anywhere in this path.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atlasCardForName, indexAtlasCards, resolveAtlasId } from "../lib/atlasCards.js";
import { editorialFor } from "../lib/editorial.js";
import { preflightOwnedEditorial, writeOwnedEditorial } from "./lib/ownedEditorialPublisher.mjs";
import {
  findStaticEditorialConflicts,
  reviewOwnedEditorialPack,
} from "../lib/ownedEditorialReview.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = join(ROOT, "docs/editorial/free-first-beach-pilot-2026-09-09/beach-editorial-pilot.json");

export function parseArgs(argv) {
  const args = { input: DEFAULT_INPUT, live: false, commit: false, reviewedBy: "" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = resolve(argv[++i] || "");
    else if (argv[i] === "--live") args.live = true;
    else if (argv[i] === "--commit") { args.commit = true; args.live = true; }
    else if (argv[i] === "--reviewed-by") args.reviewedBy = String(argv[++i] || "").trim();
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!args.input) throw new Error("--input needs a path");
  if (args.commit && !args.reviewedBy) throw new Error("--commit requires --reviewed-by with the actual reviewer attribution");
  return args;
}

function loadLocalEnv() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "").trim();
  }
}

function jsonFilesUnder(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) jsonFilesUnder(path, out);
    else if (name.endsWith(".json")) out.push(path);
  }
  return out;
}

export function loadStaticEditorialDocuments(inputPath) {
  const input = resolve(inputPath);
  const files = [
    ...jsonFilesUnder(join(ROOT, "data/atlas")),
    ...jsonFilesUnder(join(ROOT, "docs/editorial")),
  ].filter((path) => resolve(path) !== input);
  const documents = [];
  for (const path of files) {
    try { documents.push({ path: path.replace(ROOT + "/", ""), value: JSON.parse(readFileSync(path, "utf8")) }); }
    catch { /* malformed unrelated snapshots are handled by their owning checks */ }
  }
  return documents;
}

/** Mirror /api/editorial's deployed name/alias fallbacks before claiming blank. */
export function findRuntimeEditorialConflicts(candidates) {
  const cards = JSON.parse(readFileSync(join(ROOT, "data/atlas/editorial-cards.json"), "utf8"));
  const byId = indexAtlasCards(cards);
  const conflicts = [];
  for (const candidate of candidates) {
    const resolvedId = resolveAtlasId(candidate.place_id);
    const atlasById = byId.get(candidate.place_id) || byId.get(resolvedId);
    const atlasByName = atlasCardForName(cards, candidate.name);
    const legacyByName = editorialFor(candidate.name);
    if (atlasById) conflicts.push({ place_id: candidate.place_id, check: "atlas-id-or-alias", field: "place_id", value: atlasById.name || resolvedId });
    if (atlasByName) conflicts.push({ place_id: candidate.place_id, check: "atlas-name", field: "name", value: atlasByName.name });
    if (legacyByName) conflicts.push({ place_id: candidate.place_id, check: "legacy-name", field: "name", value: legacyByName.name });
  }
  return conflicts;
}

function printErrors(label, errors) {
  console.error(`${label}: ${errors.length} problem(s)`);
  for (const error of errors.slice(0, 30)) {
    console.error(`  ${error.place_id || "(pack)"} ${error.check} ${error.field || error.path}${error.value ? `: ${error.value}` : ""}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pack = JSON.parse(readFileSync(args.input, "utf8"));
  const review = reviewOwnedEditorialPack(pack);
  if (!review.ok) { printErrors("offline review failed", review.errors); process.exitCode = 1; return; }

  const staticConflicts = findStaticEditorialConflicts(pack.candidates, loadStaticEditorialDocuments(args.input));
  if (staticConflicts.length) {
    printErrors("static editorial conflict", staticConflicts.map((item) => ({ ...item, check: "already-in-versioned-editorial", field: item.path })));
    process.exitCode = 1; return;
  }
  const runtimeConflicts = findRuntimeEditorialConflicts(pack.candidates);
  if (runtimeConflicts.length) {
    printErrors("runtime editorial conflict", runtimeConflicts);
    process.exitCode = 1; return;
  }

  console.log(`offline review: ${review.rows.length}/${pack.candidates.length} publishable; ${review.reports.reduce((sum, row) => sum + row.source_count, 0)} checked source links; no versioned or runtime Atlas/legacy conflict`);
  for (const row of review.reports) console.log(`  ${row.place_id}  ${row.name}  sources=${row.source_count}`);
  if (!args.live) {
    console.log("dry run: no database read or write; no provider call");
    return;
  }

  loadLocalEnv();
  const env = {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  };
  if (!env.url || !env.key) throw new Error("--live requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const preflight = await preflightOwnedEditorial(pack.candidates, env);
  if (!preflight.ok) { printErrors("live blank-slot preflight failed", preflight.errors); process.exitCode = 1; return; }
  console.log(`live preflight: ${preflight.reports.length}/${pack.candidates.length} exact identities are operational, unflagged, and blank in all three editorial stores`);
  if (!args.commit) {
    console.log("live read-only run: no database write; no provider call");
    return;
  }

  const saved = await writeOwnedEditorial(review.rows, env);
  console.log(`inserted ${saved.length}/${review.rows.length} verified wf_editorial rows; reviewer=${args.reviewedBy}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`publish-owned-editorial: ${error.message}`); process.exitCode = 1; });
}
