#!/usr/bin/env node
// scripts/check-response-imports.mjs — a route may not reference an identifier
// it never imports.
//
// THE INCIDENT (2026-08-25). The spend-gate early-returns added
// `return NextResponse.json({ skipped: ... })` to five routes that only
// imported { gateShut } — and nothing failed at build time, because the gate
// branch is dead until WAYFIND_GATE flips. The moment FREE MODE went live,
// every fire of atlas-build, scout, inventory-refresh and promote-index threw
// ReferenceError: NextResponse is not defined, and the whole content pipeline
// was down behind a fresh deploy. A crash that only exists on one branch of an
// env var is exactly the kind CI never exercises — so this guard checks the
// SOURCE, not the behavior: any route file that mentions NextResponse must
// import it from next/server.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const API_ROOT = path.join(REPO, "app", "api");

function* routeFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* routeFiles(p);
    else if (name === "route.js" || name === "route.ts") yield p;
  }
}

const offenders = [];
let scanned = 0;
for (const file of routeFiles(API_ROOT)) {
  scanned++;
  const src = readFileSync(file, "utf8");
  // Strip line comments so a mention inside prose (like this guard's own
  // description of the incident) can never trip the check.
  const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const uses = /\bNextResponse\s*[.(]/.test(code);
  const imports = /import\s+[^;]*\bNextResponse\b[^;]*from\s+["']next\/server["']/.test(code);
  if (uses && !imports) offenders.push(path.relative(REPO, file));
}

if (!scanned) {
  console.error("check-response-imports: FAIL — scanned zero route files; the walker is broken, which is not the same as the tree being clean");
  process.exit(1);
}
if (offenders.length) {
  console.error("check-response-imports: FAIL — NextResponse referenced but never imported (crashes at runtime the moment that branch executes):");
  for (const f of offenders) console.error("  " + f);
  console.error('Fix: use plain Response.json(...) (this repo\'s convention) or add `import { NextResponse } from "next/server"`.');
  process.exit(1);
}
console.log(`check-response-imports: OK — ${scanned} route files, every NextResponse reference is imported`);
