#!/usr/bin/env node
// scripts/check-canary-workflow-installed.mjs — THE CANARY MUST ACTUALLY FLY.
//
// 2026-09-04 extended guard-honesty audit, class 2 ("guards that exist but
// are not wired into scripts/guards.txt, package.json scripts the build
// actually invokes, or CI").
//
// THE DEFECT. The canary workflow (production route contract, inventory data
// integrity, promote-metros live drift — the layer CLAUDE.md's own incident
// note says exists BECAUSE a regex cannot see a render) was authored and
// committed as `ops/canary.workflow.yml`, with `ops/README-canary.md`
// explaining it was "parked" there because the pushing credential lacked the
// `workflow` OAuth scope GitHub requires to create or edit a file under
// `.github/workflows/`. GitHub Actions ONLY runs workflow files that live at
// that exact path. So for however long the file sat parked, three real
// guards — check-inventory-integrity.mjs, check-promote-metros-live-drift.mjs,
// and the production route-contract E2E spec — never ran on a schedule or a
// push, DESPITE check-guard-manifest.mjs's EXCLUDED map describing them as
// "runs in the scheduled canary workflow" as if they did. A guard whose home
// doesn't exist is not "excluded from prebuild on purpose" — it is unwired,
// silently, and the exclusion reason was reading as protection while
// providing none.
//
// THE FIX (this audit): `git mv ops/canary.workflow.yml
// .github/workflows/canary.yml`. This guard is what stops the regression —
// it fails the build if the file is ever moved back out, renamed, or edited
// to drop one of the three jobs it exists to keep alive.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let failed = 0;
const die = (m) => { console.error("check-canary-workflow-installed: FAIL — " + m); failed++; };

const INSTALLED = path.resolve(".github/workflows/canary.yml");
const PARKED = path.resolve("ops/canary.workflow.yml");

// 1. It must live at the ONE path GitHub Actions actually reads.
if (!existsSync(INSTALLED)) {
  die(".github/workflows/canary.yml does not exist — GitHub Actions will never run it. If it is parked at ops/canary.workflow.yml, that is the exact regression this guard exists to catch: `git mv ops/canary.workflow.yml .github/workflows/canary.yml`.");
} else {
  const src = readFileSync(INSTALLED, "utf8");

  // 2. It must actually be a schedule (workflow_dispatch alone means "someone
  // has to remember to click a button", which is the same failure shape with
  // extra steps — the whole point is a clock, not a memory).
  if (!/schedule:\s*\n\s*-\s*cron:/.test(src)) {
    die(".github/workflows/canary.yml has no `schedule: - cron:` trigger — a canary that only runs on workflow_dispatch is not on a clock.");
  }

  // 3. The three jobs this file exists to keep alive must all still be
  // present and pointed at the real guard scripts / spec — asserted on the
  // ACTUAL run: lines, not just job names, so a job that's renamed to look
  // present but stopped calling the real check would still be caught.
  const REQUIRED_RUN_LINES = [
    ["production route contract (shell-route-contract.spec.js against live production)", /run:\s*npx playwright test tests\/e2e\/shell-route-contract\.spec\.js/],
    ["production data integrity (check-inventory-integrity.mjs)", /run:\s*node scripts\/check-inventory-integrity\.mjs/],
    ["promote-metros live drift (check-promote-metros-live-drift.mjs)", /run:\s*node scripts\/check-promote-metros-live-drift\.mjs/],
  ];
  for (const [label, rx] of REQUIRED_RUN_LINES) {
    if (!rx.test(src)) die(`.github/workflows/canary.yml no longer runs the ${label} step — one of the three jobs this workflow exists for was removed or edited away from the real script.`);
  }

  // 4. Every scripts/*.mjs this workflow's `run:` lines name must actually
  // exist — a canary step that "runs" a deleted script is decoration.
  const scriptRefs = [...src.matchAll(/run:\s*node (scripts\/[\w.-]+\.mjs)/g)].map((m) => m[1]);
  if (scriptRefs.length < 2) die(`only found ${scriptRefs.length} scripts/*.mjs run: line(s) in the canary workflow — expected 2 (inventory + promote-metros); the parse or the file broke.`);
  for (const rel of scriptRefs) {
    if (!existsSync(path.resolve(rel))) die(`.github/workflows/canary.yml runs ${rel}, which does not exist on disk.`);
  }
}

// 5. The parked copy must be GONE, not duplicated — a stray second copy at
// ops/canary.workflow.yml is exactly the state that let this regress
// silently once already (edited there, never synced to the real path).
if (existsSync(PARKED)) {
  die("ops/canary.workflow.yml still exists alongside .github/workflows/canary.yml — a stray parked copy is how this drifted out of sync before; delete it once .github/workflows/canary.yml is confirmed live.");
}

if (failed) { console.error(`check-canary-workflow-installed: ${failed} failure(s)`); process.exit(1); }
console.log("check-canary-workflow-installed: OK — .github/workflows/canary.yml is installed at the path GitHub Actions actually reads, on a cron schedule, running all three real guard steps against real scripts, no stray parked copy.");
