#!/usr/bin/env node
// Runs analyzeGuardFile() for every guard, each in its OWN subprocess with a
// timeout, so one pathological file (a regex hang, an infinite loop) cannot
// take the whole census down — it is reported as a TIMEOUT row instead.
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
let i = 0;
for (const cmd of lines) {
  i++;
  const file = resolveFile(cmd);
  if (!file || !existsSync(file)) continue;
  const r = spawnSync("node", [worker, path.resolve(file)], { timeout: 5000, encoding: "utf8" });
  if (r.error && r.error.code === "ETIMEDOUT") {
    results.push({ file, violations: ["TIMEOUT"] });
  } else if (r.status !== 0 || !r.stdout) {
    results.push({ file, violations: ["ANALYSIS_ERROR: exit " + r.status + " " + (r.stderr || "").slice(0, 200)] });
  } else {
    try { results.push(JSON.parse(r.stdout)); }
    catch (e) { results.push({ file, violations: ["PARSE_ERROR: " + e.message] }); }
  }
  if (i % 50 === 0) process.stderr.write(`...${i}/${lines.length}\n`);
}
console.log(JSON.stringify(results, null, 1));
