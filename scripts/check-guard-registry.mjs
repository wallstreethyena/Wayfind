#!/usr/bin/env node
// scripts/check-guard-registry.mjs — the CI guard for the GUARD REGISTRY.
// Answers, for every guard in this repo: does it exist, does it run, what
// class is it, is it critical, who owns it — and has any of that changed
// without a reviewed edit.
//
// 2026-10-01 — WHAT CHANGED AND WHY. Until today the full registry
// (scripts/lib/guard-registry.json, ~540KB, ~760 entries) was COMMITTED and
// this check compared it to a fresh derivation. The JSON is a pure function
// of the repo, so the snapshot added no information — but its aggregate
// `counts` block and `generated` date stamp made nearly every guard-adding PR
// conflict with every other one (measured: two PRs adding two unrelated
// guards on the same base conflicted in guard-registry.json every time).
//
// The JSON is now a GENERATED, GITIGNORED artifact (this check runs the
// generator, so it exists after every guard-suite run). What a reviewer
// needs — and what the snapshot's diff used to show — lives in the
// committed, one-line-per-guard scripts/lib/guard-expectations.tsv. This
// check derives the truth live and compares it against THAT file, which it
// never writes. "Generate and compare to itself" is not what happens here:
// the comparison target is hand-committed and changes only in review.
//
// Failure modes (all exit 1):
//   A. the expectation file is missing, malformed, unsorted, below FLOOR, or
//      lists the same guard twice (duplicate registration)
//   B. scripts/guards.txt has the same command line twice (duplicate wiring —
//      run-guards would silently dedupe it, hiding a re-landed/doubled PR)
//   C. the derivation throws, or the generator (build-guard-registry.mjs)
//      throws / exits non-zero, or its bytes differ from the derivation
//   D. a guard-shaped file on disk has no expectation line (unregistered)
//   E. an expectation line names a guard that no longer exists (removal
//      without an explicit edit — ghost)
//   F. a CRITICAL guard (by expectation OR by derivation) is not wired into
//      scripts/guards.txt right now — checked LIVE, never from a cache
//   G. a CRITICAL guard is missing protects / blastRadius / owner in
//      scripts/lib/guard-registry-overrides.json
//   H. critical 1 -> 0 (downgrade) or 0 -> 1 without the line being edited
//   I. guards_txt 1 -> 0: a guard expected to run in the suite no longer does
//   J. assertion count below the recorded value (drop) — or above it (ratchet:
//      raise the recorded value so a later drop back is still visible)
//   K. class / gating / owner / honesty-violation / unproven-absence drift,
//      or any complete-entry metadata/wiring/schema-field drift (SHA-256)
//   L. registry-wide rule metadata drift, or aggregate counts inconsistent
//      with the live guard census and derived entries
//
// Usage:
//   node scripts/check-guard-registry.mjs                  # the check
//   node scripts/check-guard-registry.mjs --suggest <path> # print the derived
//        expectation line for one guard (a typing aid; the committed line is
//        still what is compared, and a reviewer still sees it)
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { repoRoot, guardShapedFilesOnDisk, guardsTxtReachedFiles } from "./lib/guardWiring.mjs";
import { deriveGuardRegistry, serializeRegistry } from "./lib/deriveGuardRegistry.mjs";
import {
  EXPECTATIONS_REL,
  readExpectations,
  compareExpectations,
  expectationRowFor,
  formatRow,
  entryId,
  entryDigestFor,
  registryMetaDigestFor,
} from "./lib/guardExpectations.mjs";

const ROOT = repoRoot(import.meta.url);
const GENERATOR = path.join(ROOT, "scripts/lib/build-guard-registry.mjs");
const REGISTRY_REL = "scripts/lib/guard-registry.json";

// Truncation backstop, as before: a badly-merged expectation file that lost
// half its rows must fail loudly. Rule D (every on-disk guard needs a line)
// already pins the exact set; this only guards against a catastrophic parse.
const FLOOR = 400;

const fail = (m) => { console.error("check-guard-registry: FAIL — " + m); process.exit(1); };
const failList = (head, items, hint) => {
  console.error(`check-guard-registry: FAIL — ${head}`);
  items.slice(0, 40).forEach((s) => console.error(`    ${s}`));
  if (items.length > 40) console.error(`  ...and ${items.length - 40} more`);
  if (hint) console.error(hint);
  process.exit(1);
};

// ── C (part 1): derive in-process ─────────────────────────────────────────
let derivation;
try {
  derivation = deriveGuardRegistry(ROOT);
} catch (e) {
  fail(`the registry derivation threw: ${e.message}\n  Fix scripts/lib/deriveGuardRegistry.mjs (or whatever it reads) first.`);
}
const derivedDoc = derivation.doc;

// --suggest: print the derived line(s) and exit. Never writes the TSV.
const sIdx = process.argv.indexOf("--suggest");
if (sIdx !== -1) {
  const want = process.argv.slice(sIdx + 1);
  if (!want.length) fail("--suggest needs at least one guard path (e.g. scripts/check-foo.mjs)");
  let missing = 0;
  for (const id of want) {
    const e = derivedDoc.entries.find((x) => entryId(x) === id);
    if (!e) { console.error(`check-guard-registry: no guard-shaped file ${id} on disk`); missing++; continue; }
    console.log(formatRow(expectationRowFor(e)));
  }
  process.exit(missing ? 1 : 0);
}

// ── A: the committed expectation must parse cleanly ───────────────────────
let parsed;
try {
  parsed = readExpectations(ROOT);
} catch (e) {
  fail(`cannot read ${EXPECTATIONS_REL}: ${e.message}`);
}
if (parsed.errors.length) {
  failList(`${EXPECTATIONS_REL} is malformed (${parsed.errors.length} problem(s)):`, parsed.errors,
    "One guard per line, tab-separated, sorted by path, no duplicates. See the header comment in the file.");
}
const rows = parsed.rows;
if (rows.length < FLOOR) {
  fail(`${EXPECTATIONS_REL} has ${rows.length} rows, floor is ${FLOOR} — this looks like a truncated or badly-merged expectation file`);
}

// ── B: duplicate command lines in scripts/guards.txt ──────────────────────
{
  const seen = new Map();
  const dups = [];
  readFileSync(path.join(ROOT, "scripts/guards.txt"), "utf8").split(/\r?\n/).forEach((l, i) => {
    const cmd = l.trim();
    if (!cmd || cmd.startsWith("#")) return;
    if (seen.has(cmd)) dups.push(`line ${i + 1} repeats line ${seen.get(cmd)}: ${cmd}`);
    else seen.set(cmd, i + 1);
  });
  if (dups.length) {
    failList(`scripts/guards.txt registers the same command ${dups.length} extra time(s) (duplicate registration):`, dups,
      "run-guards de-duplicates silently, so a doubled line hides a re-landed or doubled PR. Delete the later copy.");
  }
}

// ── C (part 2): the generator itself must run clean and emit the derivation ─
// Writes the gitignored scripts/lib/guard-registry.json, so the full JSON
// exists after every guard-suite run (prebuild, CI) for anything that reads it.
{
  const r = spawnSync(process.execPath, [GENERATOR], { cwd: ROOT, encoding: "utf8" });
  if (r.error || r.status !== 0) {
    fail(`the registry generator failed (exit ${r.status}${r.error ? `, ${r.error.message}` : ""}):\n` +
      `${(r.stderr || "").trim().split("\n").slice(0, 15).map((l) => "    " + l).join("\n")}`);
  }
  const written = readFileSync(path.join(ROOT, REGISTRY_REL), "utf8");
  if (written !== serializeRegistry(derivedDoc)) {
    fail(`${REGISTRY_REL} as written by the generator is not byte-identical to an in-process derivation of the same tree — the generation is nondeterministic or the generator diverged from deriveGuardRegistry`);
  }
}

// ── D + E: the expectation set must equal the on-disk set ─────────────────
const onDisk = guardShapedFilesOnDisk(ROOT);
const findings = compareExpectations(rows, derivedDoc);
if (findings.unregistered.length) {
  failList(`${findings.unregistered.length} guard(s) exist but have no line in ${EXPECTATIONS_REL} (unregistered):`,
    findings.unregistered.map((f) => `${f.id}\n        add: ${f.suggested.replace(/\t/g, "<TAB>")}`),
    `Add the line(s) shown (sorted position), or run \`node scripts/check-guard-registry.mjs --suggest <path>\`.`);
}
if (findings.missing.length) {
  failList(`${findings.missing.length} expected guard(s) are missing (named in ${EXPECTATIONS_REL}, no such guard on disk):`,
    findings.missing.map((f) => `${f.id}  (line ${f.line})`),
    "Removing a guard is a reviewed act: restore the file, or delete its expectation line in the same PR with the reason in the description.");
}

// ── F + G: critical guards wired LIVE and fully described ─────────────────
const { reached } = guardsTxtReachedFiles(ROOT);
const guardsTxtLines = readFileSync(path.join(ROOT, "scripts/guards.txt"), "utf8").split(/\r?\n/).map((l) => l.trim());
const runsInSuiteNow = (id) =>
  id.startsWith("npm:") ? guardsTxtLines.includes(`npm run ${id.slice(4)}`) : reached.has(path.basename(id));

const derivedById = new Map(derivedDoc.entries.map((e) => [entryId(e), e]));
const criticalIds = new Set([
  ...rows.filter((r) => r.critical === "1").map((r) => r.path),
  ...derivedDoc.entries.filter((e) => e.critical).map(entryId),
]);
if (criticalIds.size === 0) fail("zero guards are critical by expectation or by derivation — the critical rule is broken, so this check cannot do its job");

const disconnected = [...criticalIds].filter((id) => !runsInSuiteNow(id)).sort();
if (disconnected.length) {
  failList(`${disconnected.length} CRITICAL guard(s) are NOT wired into scripts/guards.txt right now (checked live):`, disconnected,
    "A critical guard outside scripts/guards.txt does not run in `npm run prebuild` or the guards CI job. Re-add it, or demote it with a reviewed edit to its expectation line.");
}
if (derivation.missingOverrides.length) {
  failList(`${derivation.missingOverrides.length} CRITICAL guard(s) have no entry in scripts/lib/guard-registry-overrides.json:`, derivation.missingOverrides,
    "Add {protects, blastRadius:{category,detail}, owner} for each.");
}
const VALID_CATEGORIES = new Set(["revenue", "trust", "correctness", "cosmetic"]);
const incomplete = [];
for (const id of criticalIds) {
  const e = derivedById.get(id);
  if (!e) continue; // reported as missing above
  const miss = [];
  if (!e.protects || !String(e.protects).trim()) miss.push("protects");
  if (!e.blastRadius?.category || !String(e.blastRadius.category).trim()) miss.push("blastRadius.category");
  if (!e.blastRadius?.detail || !String(e.blastRadius.detail).trim()) miss.push("blastRadius.detail");
  if (!e.owner || !String(e.owner).trim()) miss.push("owner");
  if (e.blastRadius?.category && !VALID_CATEGORIES.has(e.blastRadius.category)) miss.push(`blastRadius.category (invalid "${e.blastRadius.category}", must be revenue|trust|correctness|cosmetic)`);
  if (miss.length) incomplete.push(`${id}: missing ${miss.join(", ")}`);
}
if (incomplete.length) {
  failList(`${incomplete.length} CRITICAL guard(s) are missing required metadata:`, incomplete.sort(),
    "Fill them in scripts/lib/guard-registry-overrides.json.");
}

// ── L: preserve whole-document parity without aggregate merge hotspots ────
if (parsed.registryMetaSha256 !== registryMetaDigestFor(derivedDoc)) {
  fail("registry-wide rule metadata changed without an expectation edit (generator/derivation/schema notes/money regex/top-20 audit rules or a future field)");
}
const liveWiring = guardsTxtReachedFiles(ROOT);
const expectedCounts = {
  totalOnDiskGuardFiles: onDisk.length,
  totalRegistryEntries: derivedDoc.entries.length,
  guardsTxtLineCount: liveWiring.lineCount,
  guardsTxtReachedFileCount: liveWiring.reached.size,
  criticalCount: derivedDoc.entries.filter((e) => e.critical).length,
  unwiredCriticalCount: derivedDoc.entries.filter((e) => e.critical && e.file && !e.wiring.guardsTxt).length,
  classCounts: Object.fromEntries(["CALL", "RENDER", "STRUCTURAL", "OTHER"]
    .map((klass) => [klass, derivedDoc.entries.filter((e) => e.class === klass).length])),
};
if (entryDigestFor(derivedDoc.counts) !== entryDigestFor(expectedCounts)) {
  fail("registry aggregate counts disagree with the live census and derived entries");
}

// ── H–K: every protected property must match the reviewed line ────────────
const show = (f, extra = "") => `${f.id} (line ${f.line})${extra}\n        line should read: ${f.suggested.replace(/\t/g, "<TAB>")}`;
const red = [];
if (findings.criticalDowngrade.length) red.push([`CRITICAL DOWNGRADE without an expectation edit (${findings.criticalDowngrade.length}):`, findings.criticalDowngrade.map((f) => show(f, " — derivation no longer marks it critical"))]);
if (findings.criticalUpgrade.length) red.push([`derivation marks these CRITICAL but the expectation records critical=0 (${findings.criticalUpgrade.length}) — record it, never type a downgrade the code does not make:`, findings.criticalUpgrade.map((f) => show(f, ` — ${f.reasons.join("; ")}`))]);
if (findings.unwired.length) red.push([`expected to run in scripts/guards.txt, no longer does — SKIPPED EXECUTION (${findings.unwired.length}):`, findings.unwired.map((f) => show(f))]);
if (findings.newlyWired.length) red.push([`newly wired into scripts/guards.txt, not yet recorded (${findings.newlyWired.length}):`, findings.newlyWired.map((f) => show(f))]);
if (findings.assertionDrop.length) red.push([`ASSERTION COUNT DROPPED below the recorded floor (${findings.assertionDrop.length}):`, findings.assertionDrop.map((f) => show(f, ` — recorded ${f.expected}, now ${f.actual}`))]);
if (findings.assertionRaise.length) red.push([`assertion count rose; raise the recorded floor so a later drop is caught (${findings.assertionRaise.length}):`, findings.assertionRaise.map((f) => show(f, ` — recorded ${f.expected}, now ${f.actual}`))]);
if (findings.changed.length) red.push([`protected metadata changed without an expectation edit (${findings.changed.length}):`, findings.changed.map((f) => show(f, `\n        ${f.diffs.join("\n        ")}`))]);
if (red.length) {
  for (const [head, items] of red) {
    console.error(`check-guard-registry: FAIL — ${head}`);
    items.slice(0, 25).forEach((s) => console.error(`    ${s}`));
    if (items.length > 25) console.error(`  ...and ${items.length - 25} more`);
  }
  console.error(`Every change to a guard's protected properties is an explicit, reviewed edit to its line in ${EXPECTATIONS_REL}.`);
  process.exit(1);
}

const critical = rows.filter((r) => r.critical === "1").length;
console.log(
  `check-guard-registry: OK — ${rows.length} expectation lines = ${onDisk.length} on-disk guard files + ${rows.length - onDisk.length} npm entr${rows.length - onDisk.length === 1 ? "y" : "ies"}; ` +
  `${critical} critical, all wired live; 8 readable protected properties plus complete-entry SHA-256 parity per guard (critical, class, gating, guards_txt, owner, min_assertions, max_violations, max_unproven, entry_sha256) ` +
  `against the committed ${EXPECTATIONS_REL}; generator exit 0 and byte-identical to an in-process derivation (${REGISTRY_REL}, gitignored); ` +
  `registry-wide rule metadata matches its reviewed digest; aggregate counts checked live; no duplicate lines in the expectation file or scripts/guards.txt.`
);
