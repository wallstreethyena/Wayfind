#!/usr/bin/env node
// One-shot, authoritative census run for the guard-honesty audit report.
// Classifies every guard into CALL/RENDER/STRUCTURAL/DECORATIVE per the WO
// taxonomy, and records analyzeGuardFile()'s violations for each.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const NPM_SCRIPTS = {
  "check:version": "scripts/check-version.mjs", "check:jsx": null,
  "check:dupes": "scripts/check-dupes.mjs", "check:env": "scripts/check-env.mjs",
  "check:gate": "scripts/check-gate.mjs", "check:categories": "scripts/check-categories.mjs",
  "check:photos": "scripts/check-photos.mjs", "check:seo": "scripts/check-seo.mjs",
  "check:events": "scripts/check-events.mjs",
};
const raw = readFileSync("scripts/guards.txt", "utf8");
const seen = new Set(); const lines = [];
for (const line of raw.split(/\r?\n/)) {
  const cmd = line.trim();
  if (!cmd || cmd.startsWith("#")) continue;
  if (seen.has(cmd)) continue;
  seen.add(cmd); lines.push(cmd);
}
function resolveFile(cmd) {
  const npmMatch = cmd.match(/^npm run ([\w:.-]+)/);
  if (npmMatch) return NPM_SCRIPTS[npmMatch[1]] || null;
  const m = cmd.match(/(scripts\/[^\s]+\.mjs)/);
  return m ? m[1] : null;
}

const worker = path.resolve("scripts/audit/analyze-one.mjs");
const results = [];
let i = 0, unresolved = 0;
for (const cmd of lines) {
  i++;
  const file = resolveFile(cmd);
  if (!file) { unresolved++; continue; }
  if (!existsSync(file)) { results.push({ file, cmd, violations: ["MISSING_FILE"], class: "MISSING" }); continue; }
  const r = spawnSync("node", [worker, path.resolve(file)], { timeout: 8000, encoding: "utf8" });
  let parsed;
  if (r.error && r.error.code === "ETIMEDOUT") parsed = { file, violations: ["TIMEOUT"] };
  else if (r.status !== 0 || !r.stdout) parsed = { file, violations: ["ANALYSIS_ERROR: exit " + r.status + " " + (r.stderr || "").slice(0, 300)] };
  else { try { parsed = JSON.parse(r.stdout); } catch (e) { parsed = { file, violations: ["PARSE_ERROR: " + e.message] }; } }
  // classification
  let cls;
  if (parsed.hasRenderHarness) cls = "RENDER";
  else if (parsed.hasLibAppImport || parsed.hasChildProcessExec) cls = "CALL";
  else if (!parsed.canExecute) cls = "STRUCTURAL";
  else cls = "CALL"; // canExecute true via some other path, defensive default
  // DECORATIVE overrides: canExecute is true (real capability) but the file
  // asserts nothing on a returned value -> the capability is decorative.
  const decorative = parsed.canExecute && parsed.violations && parsed.violations.some((v) => v.includes("zero assertions whose subject is a value RETURNED"));
  if (decorative) cls = "DECORATIVE";
  results.push({ file, cmd, class: cls, ...parsed });
  if (i % 50 === 0) process.stderr.write(`...${i}/${lines.length}\n`);
}
const counts = {};
for (const r of results) counts[r.class] = (counts[r.class] || 0) + 1;
console.error("unresolved (non-.mjs, e.g. tsc):", unresolved, "total guard lines:", lines.length, "analyzed:", results.length);
console.error("counts:", JSON.stringify(counts));
console.log(JSON.stringify({ counts, unresolved, totalLines: lines.length, results }, null, 1));
