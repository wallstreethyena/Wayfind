#!/usr/bin/env node
// scripts/audit/class4-only-negative-scan.mjs — CENSUS TOOL, not wired into
// prebuild. Part of the 2026-09-04 extended guard-honesty audit.
//
// Approximates class 4 ("the POSITIVE case is never tested — only proves
// something is absent/rejected") within the SAME `.test(...)` / `.includes(...)`
// idiom scripts/lib/guardHonestyAnalysis.mjs already parses for class 5. A
// file where EVERY `.test()`/`.includes()` occurrence is negated (`!X.test(...)`)
// and NONE is a bare presence check (`X.test(...)`) never demonstrates its
// probe can find a GOOD input, only that specific bad ones are rejected.
//
// FALSE-POSITIVE / FALSE-NEGATIVE SURFACE (stated up front):
//   - scoped to the `.test()`/`.includes()` idiom only, same as class 5 in
//     census.mjs — a file that proves its positive case via `===` equality
//     or a rendered-output assertion (the majority of CALL/RENDER guards in
//     this repo) is invisible to this scan and correctly not flagged; this
//     undercounts class 4, it does not overcount it.
//   - a file with ZERO `.test`/`.includes` occurrences at all is not
//     flagged — silence, not a claim either way.
//   - does not know whether an assertion elsewhere in the SAME expression
//     already IS the positive control (e.g. a compound `ok(a.test(x) &&
//     !b.test(x))`) — CALL_ARG_RX matches sub-expressions independently, so
//     this is a coarse per-occurrence read, not full boolean-expression
//     understanding.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stripCommentsAndStrings } from "../lib/guardHonestyAnalysis.mjs";

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

const CALL_ARG_RX = /\.(test|includes)\(\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\)/g;
function occurrences(code) {
  const out = [];
  CALL_ARG_RX.lastIndex = 0;
  let m;
  while ((m = CALL_ARG_RX.exec(code))) {
    const before = code.slice(Math.max(0, m.index - 4), m.index);
    const negated = /!\s*$/.test(before) && !/!==\s*$|!=\s*$/.test(before);
    out.push({ negated });
  }
  return out;
}

const files = guardFilesFromManifest();
const flagged = [];
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const code = stripCommentsAndStrings(readFileSync(abs, "utf8"));
  const occ = occurrences(code);
  if (occ.length === 0) continue; // silent, not flagged
  const anyPositive = occ.some((o) => !o.negated);
  if (!anyPositive) flagged.push({ file: rel, negativeCount: occ.length });
}
console.log(`class4-only-negative-scan: ${files.length} guard files scanned, ${flagged.length} have .test()/.includes() occurrences that are ALL negated (never prove a positive case in this idiom)`);
for (const f of flagged.sort((a, b) => b.negativeCount - a.negativeCount)) console.log(`  ${f.file}: ${f.negativeCount} negated occurrence(s), 0 positive`);
