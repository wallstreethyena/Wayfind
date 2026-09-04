#!/usr/bin/env node
// scripts/check-guard-registry.mjs — the CI guard for the MACHINE-READABLE
// GUARD REGISTRY (scripts/lib/guard-registry.json). Answers, for every guard
// in this repo: what it protects, what breaks if it fails, where it's
// wired, whether it blocks CI/deploy or only warns, and who owns it.
//
// This guard does NOT trust the registry's own cached data for anything
// load-bearing. Every rule below re-ENUMERATES the real files and the real
// wiring, live, via scripts/lib/guardWiring.mjs — the same helper the
// registry's generator (scripts/lib/build-guard-registry.mjs) uses — so a
// stale or hand-edited registry can never report a disconnected guard as
// connected, or a deleted guard as present. There is no hardcoded list of
// guard names anywhere in this file.
//
// Four failure modes, in order:
//   1. a guard-shaped file exists on disk but has no registry entry
//   2. a registry entry names a file that no longer exists on disk
//   3. a guard the registry marks CRITICAL is not wired into
//      scripts/guards.txt (the disconnected-guard check) — checked LIVE
//      against guards.txt, never against the registry's own cached
//      `wiring.guardsTxt` field
//   4. a CRITICAL registry entry is missing a required hand-authored field
//      (protects / blastRadius.category / blastRadius.detail / owner)
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { repoRoot, guardShapedFilesOnDisk, guardsTxtReachedFiles } from "./lib/guardWiring.mjs";

const ROOT = repoRoot(import.meta.url);
const REGISTRY_PATH = path.join(ROOT, "scripts/lib/guard-registry.json");

const fail = (m) => { console.error("check-guard-registry: FAIL — " + m); process.exit(1); };

let registry;
try {
  registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
} catch (e) {
  fail(`cannot read/parse ${path.relative(ROOT, REGISTRY_PATH)}: ${e.message}`);
}
if (!Array.isArray(registry.entries)) fail(`${path.relative(ROOT, REGISTRY_PATH)} has no entries array`);

// Sanity floor — mirrors the FLOOR pattern scripts/run-guards.mjs and
// several other guards in this repo already use: a truncated or badly
// re-generated registry (half the entries lost to a bad merge, a hand-edit
// that clobbered the file) must fail loudly rather than silently pass with
// fewer entries than it should have. 400 is comfortably below today's 524
// but far above zero or a half-written file.
const FLOOR = 400;
if (registry.entries.length < FLOOR) {
  fail(`registry has ${registry.entries.length} entries, floor is ${FLOOR} — this looks like a truncated or badly-merged registry.mjs`);
}

// ── LIVE enumeration — never from the registry, never cached ──────────────
const onDiskFiles = new Set(guardShapedFilesOnDisk(ROOT)); // "scripts/xxx.mjs"
const { reached: guardsTxtReachedBasenames } = guardsTxtReachedFiles(ROOT);

// ── Rule 1 + 2: registry <-> disk must be a bijection on file-backed entries ─
const registryFiles = new Set();
const duplicates = [];
for (const e of registry.entries) {
  if (e.file === null) continue; // the documented tsc-wrapper exception (npm run check:jsx) — not file-backed, never enumerated on disk
  if (registryFiles.has(e.file)) duplicates.push(e.file);
  registryFiles.add(e.file);
}
if (duplicates.length) {
  fail(`registry has duplicate entries for the same file: ${[...new Set(duplicates)].join(", ")}`);
}

const unregistered = [...onDiskFiles].filter((f) => !registryFiles.has(f)).sort();
const ghosts = [...registryFiles].filter((f) => !existsSync(path.join(ROOT, f))).sort();

if (unregistered.length) {
  console.error(`check-guard-registry: FAIL — ${unregistered.length} guard-shaped file(s) on disk have no scripts/lib/guard-registry.json entry:`);
  unregistered.slice(0, 25).forEach((f) => console.error(`    ${f}`));
  if (unregistered.length > 25) console.error(`  ...and ${unregistered.length - 25} more`);
  console.error("Run `node scripts/lib/build-guard-registry.mjs` and commit the regenerated registry.");
  process.exit(1);
}
if (ghosts.length) {
  console.error(`check-guard-registry: FAIL — ${ghosts.length} registry entr${ghosts.length === 1 ? "y names" : "ies name"} a guard file that no longer exists on disk:`);
  ghosts.forEach((f) => console.error(`    ${f}`));
  console.error("The guard was renamed or deleted without regenerating the registry. Run `node scripts/lib/build-guard-registry.mjs`.");
  process.exit(1);
}

// ── Rule 3 + 4: every CRITICAL entry must be wired into guards.txt AND
// carry every required hand-authored field. Both checked LIVE. ────────────
const criticalEntries = registry.entries.filter((e) => e.critical);
if (criticalEntries.length === 0) {
  fail("zero entries are marked critical:true — either the registry was regenerated with a broken money/top-20 rule, or a hand-edit wiped every critical flag. Either way this check cannot do its job.");
}

const disconnectedCritical = [];
const incompleteCritical = [];
for (const e of criticalEntries) {
  const id = e.file ?? `npm:${e.npmScript}`;
  if (e.file) {
    const basename = path.basename(e.file);
    // LIVE check against scripts/guards.txt — deliberately NOT e.wiring.guardsTxt.
    const wiredNow = guardsTxtReachedBasenames.has(basename);
    if (!wiredNow) disconnectedCritical.push(id);
  }
  const missing = [];
  if (!e.protects || !e.protects.trim()) missing.push("protects");
  if (!e.blastRadius || !e.blastRadius.category || !e.blastRadius.category.trim()) missing.push("blastRadius.category");
  if (!e.blastRadius || !e.blastRadius.detail || !e.blastRadius.detail.trim()) missing.push("blastRadius.detail");
  if (!e.owner || !e.owner.trim()) missing.push("owner");
  const VALID_CATEGORIES = new Set(["revenue", "trust", "correctness", "cosmetic"]);
  if (e.blastRadius?.category && !VALID_CATEGORIES.has(e.blastRadius.category)) missing.push(`blastRadius.category (invalid value "${e.blastRadius.category}", must be one of revenue|trust|correctness|cosmetic)`);
  if (missing.length) incompleteCritical.push({ id, missing });
}

if (disconnectedCritical.length) {
  console.error(`check-guard-registry: FAIL — ${disconnectedCritical.length} CRITICAL guard(s) are NOT wired into scripts/guards.txt right now (checked live, not from the registry's cached wiring):`);
  disconnectedCritical.forEach((f) => console.error(`    ${f}`));
  console.error("A critical guard that isn't in scripts/guards.txt does not run in `npm run prebuild` or the guards.yml CI job — it protects nothing on the paths that gate a merge or a deploy.");
  console.error("Either add it back to scripts/guards.txt, or (if it was deliberately demoted) remove critical:true from its registry entry with a reviewed reason.");
  process.exit(1);
}
if (incompleteCritical.length) {
  console.error(`check-guard-registry: FAIL — ${incompleteCritical.length} CRITICAL registry entr${incompleteCritical.length === 1 ? "y is" : "ies are"} missing required field(s):`);
  incompleteCritical.forEach(({ id, missing }) => console.error(`    ${id}: missing ${missing.join(", ")}`));
  console.error("Add {protects, blastRadius:{category,detail}, owner} in scripts/lib/guard-registry-overrides.json and regenerate.");
  process.exit(1);
}

const gatingCounts = {};
for (const e of registry.entries) gatingCounts[e.gating] = (gatingCounts[e.gating] || 0) + 1;

console.log(
  `check-guard-registry: OK — ${registry.entries.length} registry entries (${onDiskFiles.size} on-disk guard files), ` +
  `${criticalEntries.length} critical, 0 disconnected critical, gating: ${JSON.stringify(gatingCounts)}`
);
