#!/usr/bin/env node
// scripts/audit/census.mjs — CENSUS TOOL for the 2026-09-04 extended
// guard-honesty audit (docs/audits/guard-honesty-extended-2026-09-04.md).
// Not wired into prebuild. Runs scripts/lib/guardHonestyAnalysis.mjs (the
// 2026-09-04 guard-honesty audit's engine, reused rather than re-built) over
// every guard scripts/guards.txt actually resolves, and tabulates the
// classes it can approximate:
//   class 3 — STRUCTURAL guards (source-text-only, no import/render/exec)
//   class 4 — no positive control anywhere the analyzer can see (proxy: the
//             file has real exec capability, zero absence problems, but ALSO
//             the analyzer's own hasAssertionOnReturnedValue is false — i.e.
//             every assertion is a source-text check even though the file
//             COULD execute something. This is an approximation of "only the
//             negative case is exercised" — see the report for its limits)
//   class 5 — unproven absence checks (the engine's core signal)
//   class 6 is NOT approximated here (console.warn-downgrade requires a
//     different signal); done separately in the report by hand.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { analyzeGuardFile } from "../lib/guardHonestyAnalysis.mjs";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "scripts/guards.txt");
const NPM_SCRIPTS = {
  "check:version": "scripts/check-version.mjs", "check:jsx": null,
  "check:dupes": "scripts/check-dupes.mjs", "check:env": "scripts/check-env.mjs",
  "check:gate": "scripts/check-gate.mjs", "check:categories": "scripts/check-categories.mjs",
  "check:photos": "scripts/check-photos.mjs", "check:seo": "scripts/check-seo.mjs",
  "check:events": "scripts/check-events.mjs",
};
function guardFilesFromManifest() {
  const raw = readFileSync(MANIFEST, "utf8");
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
    if (file) files.push(file);
  }
  return files;
}

const files = guardFilesFromManifest();
let structural = 0, decorative = 0, call = 0, render = 0;
const unprovenAbsence = [];
const noReturnedValueAssertion = [];
const structuralUndeclared = [];
let analyzed = 0;

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) continue;
  analyzed++;
  let r;
  try { r = analyzeGuardFile(abs); } catch (e) { console.error(`SKIP ${rel}: ${e.message}`); continue; }
  const isRender = r.hasRenderHarness;
  const isCall = !isRender && (r.hasLibAppImport || r.hasChildProcessExec);
  const isStructural = !r.canExecute;
  if (isRender) render++;
  else if (isCall) call++;
  else if (isStructural) structural++;
  if (isStructural && !r.hasStructuralOnlyTag) structuralUndeclared.push(rel);
  if (r.canExecute && !require_hasAssertionOnReturnedValue(r)) noReturnedValueAssertion.push(rel);
  if (r.unproven && r.unproven.length) unprovenAbsence.push({ file: rel, count: r.unproven.length });
  if (r.canExecute && (r.unproven && r.unproven.length) === 0 && !hasAnyAssertionOnReturnedValue(r)) decorative++;
}

// re-derive (analyzeGuardFile doesn't export the boolean directly, only via violations text)
function require_hasAssertionOnReturnedValue(r) {
  return !r.violations.some((v) => v.includes("zero assertions whose subject is a value RETURNED"));
}
function hasAnyAssertionOnReturnedValue(r) { return require_hasAssertionOnReturnedValue(r); }

console.log(`census: ${files.length} manifest lines resolved to files, ${analyzed} analyzed`);
console.log(`  RENDER: ${render}`);
console.log(`  CALL: ${call}`);
console.log(`  STRUCTURAL: ${structural} (${structuralUndeclared.length} undeclared — no // STRUCTURAL-ONLY tag)`);
console.log(`  class 5 (unproven absence checks): ${unprovenAbsence.length} files, ${unprovenAbsence.reduce((a, b) => a + b.count, 0)} total probes`);
console.log(`  class 4 proxy (has exec capability, zero assertion on a returned value — every check is on source text despite being able to execute): ${noReturnedValueAssertion.length}`);
console.log("");
console.log("class 5 files (file: unproven-absence-count):");
for (const u of unprovenAbsence.sort((a, b) => b.count - a.count)) console.log(`  ${u.file}: ${u.count}`);
console.log("");
console.log("class 4-proxy files (exec capability, but zero assertion reads a returned value):");
for (const f of noReturnedValueAssertion) console.log(`  ${f}`);
