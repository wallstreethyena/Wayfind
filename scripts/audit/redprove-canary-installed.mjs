#!/usr/bin/env node
// Red-prove for check-canary-workflow-installed.mjs (Fix 1 of the 2026-09-04
// extended guard-honesty audit). Reproduces the EXACT regression the guard
// exists to catch — the workflow file moved back out of .github/workflows/,
// the same "parked" state it sat in before this fix — asserts the guard
// fails, then restores and asserts green again.
import { readFileSync, existsSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const INSTALLED = path.resolve(".github/workflows/canary.yml");
const PARKED = path.resolve("ops/canary.workflow.yml");

if (!existsSync(INSTALLED)) { console.error("redprove-canary-installed: ABORT — .github/workflows/canary.yml does not exist; nothing to mutate."); process.exit(2); }
if (existsSync(PARKED)) { console.error("redprove-canary-installed: ABORT — ops/canary.workflow.yml already exists; refusing to overwrite it."); process.exit(2); }

const before = readFileSync(INSTALLED, "utf8");
renameSync(INSTALLED, PARKED);
console.log("APPLIED mutation: moved .github/workflows/canary.yml -> ops/canary.workflow.yml (reproducing the exact pre-fix 'parked' regression).");
console.log("  verified: .github/workflows/canary.yml now " + (existsSync(INSTALLED) ? "STILL EXISTS (mutation failed!)" : "absent") + "; ops/canary.workflow.yml now " + (existsSync(PARKED) ? "present" : "MISSING (mutation failed!)"));

let redRc = 0;
try { execFileSync("node", ["scripts/check-canary-workflow-installed.mjs"], { stdio: "pipe" }); }
catch (e) { redRc = e.status ?? 1; console.log("check-canary-workflow-installed output on the mutated tree:\n" + (e.stdout || "").toString()); }

renameSync(PARKED, INSTALLED);
const after = readFileSync(INSTALLED, "utf8");
if (after !== before) { console.error("redprove-canary-installed: FAIL — restore did not reproduce the original file byte-for-byte."); process.exit(2); }
console.log("RESTORED .github/workflows/canary.yml (verified byte-identical); ops/canary.workflow.yml removed again.");

let greenRc = 0;
try { execFileSync("node", ["scripts/check-canary-workflow-installed.mjs"], { stdio: "pipe" }); }
catch (e) { greenRc = e.status ?? 1; }

console.log(`\nred-prove result: mutated-tree rc=${redRc} (expected nonzero), restored-tree rc=${greenRc} (expected 0)`);
if (redRc === 0) { console.error("redprove-canary-installed: FAIL — the guard did NOT catch the workflow being moved back out of .github/workflows/."); process.exit(1); }
if (greenRc !== 0) { console.error("redprove-canary-installed: FAIL — the guard is not green after restore."); process.exit(1); }
console.log("redprove-canary-installed: PASS — check-canary-workflow-installed.mjs catches the workflow being parked back outside .github/workflows/, and the tree is clean after restore.");
