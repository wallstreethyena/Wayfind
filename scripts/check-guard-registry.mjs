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
//   5. THE SNAPSHOT DISAGREES WITH THE FILES IT DESCRIBES (added 2026-09-07)
//
// Rule 5 is the one that closes the hole the first four left open. Rules 1-4
// can only check things this file knows how to enumerate itself, so every
// MECHANICALLY-DERIVED field — class, assertionCount, hasStructuralOnlyTag,
// unprovenAbsenceCount, honestyViolations, selfDocumentsRedProve, wiring,
// gating, critical, criticalReasons, the aggregate counts, and the merged
// hand-authored protects/blastRadius/owner — was unverifiable. It could say
// anything and this guard reported OK.
//
// That was not hypothetical. Measured on main at 76e76968: the registry said
// scripts/test-api-guard.mjs was class CALL with 26 assertions when the file
// on disk was class RENDER with 49. Four entries were wrong and this check
// printed OK. The registry is the machine-readable answer to "is this guard
// real and what does it do"; one that can be wrong about a guard's class is
// the exact failure it exists to prevent.
//
// The fix was structural. The derivation moved out of the generator into
// scripts/lib/deriveGuardRegistry.mjs, and BOTH sides call it: the generator
// writes what it returns, this guard re-derives it in memory and compares.
// There is no second implementation to drift, and a stale snapshot now names
// the exact field it is wrong about instead of passing silently.
//
// The comparison covers the WHOLE document except `generated` (a date stamp,
// the one thing that is not a function of the repo). Deliberately not a
// hand-typed list of fields to check: a list would have to be extended every
// time the schema grows, and the field nobody remembered to add is precisely
// the one that goes stale.
//
// WHAT THE CONTRACT ACTUALLY IS — say it precisely, because a guard that
// overstates itself is the thing this repo keeps getting burned by. This is
// DOCUMENT PARITY, not byte equality. Two deliberate exemptions:
//   - `generated` is ignored (a clock read is not a function of the repo)
//   - entry ORDER is non-semantic; entries are matched by file path / npm
//     script identity, never by array position
// So two registry files that differ only in entry order or date stamp both
// pass, and that is correct. Every other field, on every entry, plus every
// aggregate count, must equal what the repo derives right now.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { repoRoot, guardShapedFilesOnDisk, guardsTxtReachedFiles } from "./lib/guardWiring.mjs";
import { deriveGuardRegistry, diffRegistry, NONDETERMINISTIC_TOP_LEVEL_FIELDS } from "./lib/deriveGuardRegistry.mjs";

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
// fewer entries than it should have. 400 is comfortably below the current
// entry count but far above zero or a half-written file. Deliberately a loose
// floor and not an exact count: Rule 5 below already pins the exact number
// (counts.totalRegistryEntries is compared against a fresh derivation), so
// this stays a crash-shaped backstop that never needs editing.
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

// ── Rule 5: PARITY — the committed snapshot must equal a fresh derivation ──
// Re-derives every mechanically-derived field from the repo (the same call the
// generator makes) and compares. `generated` is skipped: it is a clock read,
// not a function of the repo, so a registry regenerated on a different day is
// not drift. Entries are matched by file path, never by array position, so a
// guard inserted mid-alphabet reports as one added entry rather than as
// several hundred shifted ones.
let derivedDoc;
try {
  const derivation = deriveGuardRegistry(ROOT);
  derivedDoc = derivation.doc;
  if (derivation.missingOverrides.length) {
    console.error(`check-guard-registry: FAIL — ${derivation.missingOverrides.length} CRITICAL guard(s) have no entry in scripts/lib/guard-registry-overrides.json:`);
    derivation.missingOverrides.forEach((f) => console.error(`    ${f}`));
    console.error("Add {protects, blastRadius:{category,detail}, owner} for each, then run `node scripts/lib/build-guard-registry.mjs`.");
    process.exit(1);
  }
} catch (e) {
  fail(`could not re-derive the registry to compare against the committed snapshot: ${e.message}\n` +
    "  This is not a stale-registry failure — the derivation itself threw. Fix scripts/lib/deriveGuardRegistry.mjs (or whatever it reads) first.");
}

const drift = diffRegistry(registry, derivedDoc);
if (drift.length) {
  console.error(`check-guard-registry: FAIL — the committed scripts/lib/guard-registry.json disagrees with the repo it describes in ${drift.length} place(s):`);
  drift.slice(0, 20).forEach((d) => {
    const c = typeof d.committed === "object" ? JSON.stringify(d.committed) : String(d.committed);
    const v = typeof d.derived === "object" ? JSON.stringify(d.derived) : String(d.derived);
    console.error(`    ${d.path}\n        committed: ${c.slice(0, 200)}\n        actual:    ${v.slice(0, 200)}`);
  });
  if (drift.length > 20) console.error(`  ...and ${drift.length - 20} more`);
  console.error("");
  console.error("The registry is the machine-readable answer to 'is this guard real and what does it do'.");
  console.error("A snapshot that disagrees with the files is worse than no snapshot, because it reads as an answer.");
  console.error("Run `node scripts/lib/build-guard-registry.mjs` and commit the regenerated registry.");
  process.exit(1);
}

const gatingCounts = {};
for (const e of registry.entries) gatingCounts[e.gating] = (gatingCounts[e.gating] || 0) + 1;

const comparedEntryFields = new Set();
for (const e of registry.entries) Object.keys(e).forEach((k) => comparedEntryFields.add(k));
console.log(
  `check-guard-registry: OK — ${registry.entries.length} registry entries (${onDiskFiles.size} on-disk guard files), ` +
  `${criticalEntries.length} critical, 0 disconnected critical, gating: ${JSON.stringify(gatingCounts)}`
);
console.log(
  `  parity: committed registry is SEMANTICALLY EQUAL to a fresh repo derivation across ${comparedEntryFields.size} protected ` +
  `per-entry field(s) (${[...comparedEntryFields].sort().join(", ")}) plus every aggregate count. ` +
  `\`${NONDETERMINISTIC_TOP_LEVEL_FIELDS.join(", ")}\` is the only exempt field (a clock read, not a function of the repo), and ` +
  `registry entry ORDER is non-semantic (entries are matched by file path / npm script, never by array position). ` +
  `This is document parity, NOT byte equality — two registries that differ only in entry order or date stamp both pass.`
);
