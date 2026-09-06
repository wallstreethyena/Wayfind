#!/usr/bin/env node
// scripts/check-guard-honesty.mjs — the META-GUARD from the 2026-09-04
// guard-honesty audit (docs/audits/guard-honesty-2026-09-04.md), answering
// the owner's question ("why does the guard keep lying to me") going
// forward: it runs the same static-analysis engine every guard in this
// audit was read with (scripts/lib/guardHonestyAnalysis.mjs) over the WHOLE
// suite and fails the build on a NEW guard that:
//
//   1. contains no import of any lib/ or app/ module AND no render harness
//      AND no child-process execution (i.e. it is pure regex over source)
//      WITHOUT a `// STRUCTURAL-ONLY: <reason>` declaration on its first 20
//      lines;
//   2. asserts an absence with no positive control in the same file;
//   3. has zero assertions whose subject is a value RETURNED by code.
//
// PRE-EXISTING offenders (193, as of 2026-09-04 — see
// scripts/lib/guard-honesty-known-weak.json) are GRANDFATHERED so this does
// not fail the whole suite on day one. The debt is explicit, dated, and
// each entry carries a one-line reason. Grandfathering is not
// forgiveness — it is a ledger:
//
//   - a KNOWN_WEAK guard that still matches its listed reason is silently
//     accepted (the debt exists, it is just already counted);
//   - a KNOWN_WEAK guard that no longer violates ANYTHING is reported as a
//     WIN in the success line (fixed for real, or the analyzer was wrong —
//     either way, remove its entry so the count drops);
//   - a KNOWN_WEAK entry for a file check-guard-honesty can no longer find
//     is reported the same way (removed/renamed).
//   - any guard NOT in KNOWN_WEAK that fails ANY rule is a build-blocking
//     FAIL — that is the actual enforcement. A brand-new guard is real, or
//     it says why it isn't, on day one.
//
// The KNOWN_WEAK count is printed on every run (both success and failure)
// so a reviewer can watch it — it must never exceed the count recorded the
// last time someone touched this list; growing it requires a human to add a
// NEW entry with a NEW reason, which is a reviewable diff.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeGuardFile } from "./lib/guardHonestyAnalysis.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const fail = (m) => { console.error("check-guard-honesty: FAIL — " + m); process.exit(1); };

const NPM_SCRIPTS = {
  "check:version": "scripts/check-version.mjs", "check:jsx": null,
  "check:dupes": "scripts/check-dupes.mjs", "check:env": "scripts/check-env.mjs",
  "check:gate": "scripts/check-gate.mjs", "check:categories": "scripts/check-categories.mjs",
  "check:photos": "scripts/check-photos.mjs", "check:seo": "scripts/check-seo.mjs",
  "check:events": "scripts/check-events.mjs",
};

function guardFilesFromManifest() {
  const manifestPath = path.join(ROOT, "scripts/guards.txt");
  let raw;
  try { raw = readFileSync(manifestPath, "utf8"); }
  catch (e) { fail(`cannot read ${manifestPath}: ${e.message}`); }
  const seen = new Set(); const files = [];
  for (const line of raw.split(/\r?\n/)) {
    const cmd = line.trim();
    if (!cmd || cmd.startsWith("#")) continue;
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    const npmMatch = cmd.match(/^npm run ([\w:.-]+)/);
    let file;
    if (npmMatch) file = NPM_SCRIPTS[npmMatch[1]] ?? null;
    else { const m = cmd.match(/(scripts\/[^\s]+\.mjs)/); file = m ? m[1] : null; }
    if (file) files.push(file); // null = not a guard-honesty-analyzable target (e.g. tsc)
  }
  return files;
}

// ── load KNOWN_WEAK ───────────────────────────────────────────────────────
const knownWeakPath = path.join(ROOT, "scripts/lib/guard-honesty-known-weak.json");
let knownWeakDoc;
try { knownWeakDoc = JSON.parse(readFileSync(knownWeakPath, "utf8")); }
catch (e) { fail(`cannot read/parse ${knownWeakPath}: ${e.message}`); }
if (!Array.isArray(knownWeakDoc.entries)) fail(`${knownWeakPath} has no entries array`);
for (const e of knownWeakDoc.entries) {
  if (!e || typeof e.file !== "string" || typeof e.reason !== "string" || !e.reason.trim()) {
    fail(`every KNOWN_WEAK entry needs a file and a non-empty one-line reason (bad entry: ${JSON.stringify(e)})`);
  }
}
const knownWeakFiles = new Set(knownWeakDoc.entries.map((e) => e.file));
if (knownWeakFiles.size !== knownWeakDoc.entries.length) {
  fail("KNOWN_WEAK has a duplicate file entry — that would silently hide one of the two reasons");
}

// ── analyze every guard the manifest actually runs ─────────────────────────
const files = guardFilesFromManifest();
if (files.length < 100) fail(`guards.txt only resolved ${files.length} guard file(s) — expected 300+; the manifest parse or the resolver broke`);

const newOffenders = [];
const stillWeak = [];
const nowClean = []; // was in KNOWN_WEAK, analyzer finds nothing wrong today
const missingKnownWeakFiles = [];
let analyzedCount = 0;

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) continue; // resolved but the file is gone; not this guard's problem
  analyzedCount++;
  let result;
  try { result = analyzeGuardFile(abs); }
  catch (e) { fail(`analyzer crashed on ${rel}: ${e.message}`); }
  const isKnownWeak = knownWeakFiles.has(rel);
  if (result.isClean) {
    if (isKnownWeak) nowClean.push(rel);
    continue;
  }
  if (isKnownWeak) { stillWeak.push(rel); continue; }
  newOffenders.push({ file: rel, violations: result.violations });
}

// KNOWN_WEAK entries whose file the manifest no longer resolves to (renamed,
// deleted, or dropped from guards.txt) — informational, not a failure.
for (const rel of knownWeakFiles) {
  if (!files.includes(rel)) missingKnownWeakFiles.push(rel);
}

// ── verdict ──────────────────────────────────────────────────────────────
if (newOffenders.length > 0) {
  console.error(`check-guard-honesty: FAIL — ${newOffenders.length} guard(s) not in KNOWN_WEAK fail the honesty check:`);
  for (const o of newOffenders.slice(0, 25)) {
    console.error(`  ${o.file}`);
    for (const v of o.violations) console.error(`      - ${v}`);
  }
  if (newOffenders.length > 25) console.error(`  ...and ${newOffenders.length - 25} more`);
  console.error("");
  console.error("Fix the guard for real (import the real lib/app code and assert on what it");
  console.error("returns, or render it), OR — only if it truly cannot be executed — add");
  console.error("`// STRUCTURAL-ONLY: <reason>` in its first 20 lines AND add a dated entry");
  console.error(`to ${path.relative(ROOT, knownWeakPath)} with a one-line reason.`);
  console.error(`KNOWN_WEAK count: ${knownWeakDoc.entries.length} (generated ${knownWeakDoc.generated})`);
  process.exit(1);
}

const lines = [
  `check-guard-honesty: OK — ${analyzedCount} guard(s) analyzed`,
  `KNOWN_WEAK: ${knownWeakDoc.entries.length} grandfathered (generated ${knownWeakDoc.generated}), ${stillWeak.length} still match their reason`,
];
if (nowClean.length) lines.push(`${nowClean.length} KNOWN_WEAK entr${nowClean.length === 1 ? "y" : "ies"} now pass — remove from the ledger: ${nowClean.join(", ")}`);
if (missingKnownWeakFiles.length) lines.push(`${missingKnownWeakFiles.length} KNOWN_WEAK entr${missingKnownWeakFiles.length === 1 ? "y" : "ies"} reference a file the manifest no longer resolves — prune: ${missingKnownWeakFiles.join(", ")}`);
console.log(lines.join("\n"));
