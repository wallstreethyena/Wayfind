#!/usr/bin/env node
// scripts/test-anchor-workflow-gate.mjs — the production-data write gate for
// the anchor-watch workflow, tested by EXECUTING the gate, not by reading it.
//
// WHY (owner, 2026-10-14): "Require explicit owner approval for production
// database changes ... Confirm a missing approval blocks execution rather than
// merely generating a warning. Test both allowed and denied cases." GitHub
// auto-creates an UNPROTECTED environment the first time a job names it, so
// `environment: production-data` alone is not a gate. The apply-fixes job's
// first step reads the environment's protection rules and fails the job unless
// a required reviewer exists. This guard runs that exact step's shell with a
// stub `gh` for the allowed and denied cases, and checks the job layout that
// makes the step meaningful (it runs before any secret is used; main only;
// dispatch only; the watch job never runs the writer). It also checks that the
// fixes files and the writer are owner-only paths, so a change plan for
// production records needs an /owner-approve on its pull request.
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { isOwnerOnly } from "./lib/ownerApproval.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WF = readFileSync(path.join(ROOT, ".github/workflows/anchor-watch.yml"), "utf8");
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// --- split the workflow into its two jobs (2-space job keys under `jobs:`) ---
const jobsAt = WF.indexOf("\njobs:\n");
ok(jobsAt > 0, "workflow has a jobs: block");
const jobsText = WF.slice(jobsAt + 7);
const jobStarts = [...jobsText.matchAll(/^ {2}([a-z][a-z0-9-]*):\s*$/gm)].map((m) => ({ name: m[1], at: m.index }));
const job = (name) => {
  const i = jobStarts.findIndex((j) => j.name === name);
  if (i < 0) return "";
  return jobsText.slice(jobStarts[i].at, i + 1 < jobStarts.length ? jobStarts[i + 1].at : undefined);
};
const watch = job("watch"), apply = job("apply-fixes");
ok(jobStarts.length === 2 && watch && apply, `exactly the jobs watch + apply-fixes (found ${jobStarts.map((j) => j.name).join(",")})`);

// --- steps of a job, each as its raw text ---
const steps = (jobText) => {
  const s = jobText.indexOf("\n    steps:\n");
  if (s < 0) return [];
  const body = jobText.slice(s + 12);
  const starts = [...body.matchAll(/^ {6}- /gm)].map((m) => m.index);
  return starts.map((st, i) => body.slice(st, i + 1 < starts.length ? starts[i + 1] : undefined));
};
const applySteps = steps(apply), watchSteps = steps(watch);
const usesSecretKey = (t) => /secrets\.SUPABASE_SERVICE_ROLE_KEY/.test(t);

// apply-fixes layout
ok(/^\s{4}environment:\s*production-data\s*$/m.test(apply), "apply-fixes runs in the production-data environment");
const ifLine = (apply.match(/^\s{4}if:\s*(.+)$/m) || [])[1] || "";
ok(/github\.event_name == 'workflow_dispatch'/.test(ifLine) && /inputs\.fixes_file != ''/.test(ifLine) && /github\.ref == 'refs\/heads\/main'/.test(ifLine),
  "apply-fixes runs only on a manual dispatch, with a fixes file, from main");
ok(/^\s{6}contents:\s*read\s*$/m.test(apply) && !/write/.test((apply.match(/\n {4}permissions:\n((?: {6}.+\n)+)/) || [, ""])[1]),
  "apply-fixes token permissions are read-only");
ok(applySteps.length > 0 && /Verify production-data requires an owner reviewer/.test(applySteps[0]), "the FIRST apply-fixes step is the protection check");
const firstSecret = applySteps.findIndex(usesSecretKey);
ok(firstSecret > 0, `the service key is first used after the protection check (step ${firstSecret})`);
ok(applySteps.filter(usesSecretKey).length === 2, "the service key is used by exactly two apply-fixes steps (dry run, apply)");
const dryIdx = applySteps.findIndex((t) => /apply\.mjs --dry/.test(t));
const applyIdx = applySteps.findIndex((t) => /apply\.mjs --apply/.test(t));
ok(dryIdx > 0 && applyIdx > dryIdx, "the dry run comes before the apply");
ok(/--audit audit\.jsonl --rollback rollback\.json/.test(applySteps[applyIdx] || ""), "the apply writes an audit log and a rollback file");
ok(!/\$\{\{\s*inputs\./.test(applySteps.map((t) => (t.match(/run: \|\n([\s\S]*)/) || [, ""])[1]).join("\n")),
  "no inputs.* expression is interpolated into any apply-fixes shell script");

// watch job never writes
ok(watchSteps.length > 0 && !watchSteps.some((t) => /apply\.mjs/.test(t)), "the watch job never runs the writer");
ok(watchSteps.filter(usesSecretKey).length === 1, "the watch job uses the service key in exactly one step");
ok(/^\s{4}environment:/m.test(apply) && !/^\s{4}environment:/m.test(watch), "the probe finds the environment key on apply-fixes (positive control) and not on watch: watch needs no approval because it cannot write wf_events");

// --- EXECUTE the protection step: allowed and denied cases ---
const verify = applySteps[0] || "";
const script = ((verify.match(/run: \|\n([\s\S]*)$/) || [, ""])[1]).split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
ok(/gh api "repos\/\$REPO\/environments\/production-data"/.test(script), "the step reads the production-data environment through the GitHub API");
const runGate = (ghBody) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "anchor-gate-"));
  try {
    writeFileSync(path.join(dir, "gh"), `#!/bin/sh\n${ghBody}\n`);
    chmodSync(path.join(dir, "gh"), 0o755);
    const r = spawnSync("bash", ["-c", script], { env: { PATH: `${dir}:/usr/bin:/bin`, REPO: "o/r", GH_TOKEN: "x" }, encoding: "utf8" });
    return r.status;
  } finally { rmSync(dir, { recursive: true, force: true }); }
};
ok(runGate("echo 1") === 0, "ALLOWED: one required reviewer -> the step passes");
ok(runGate("echo 2") === 0, "ALLOWED: two required reviewers -> the step passes");
ok(runGate("echo 0") !== 0, "DENIED: an environment with no required reviewer stops the job");
ok(runGate("echo") !== 0, "DENIED: an empty answer stops the job");
ok(runGate("echo 'Not Found' >&2; exit 1") !== 0, "DENIED: an API error (environment missing, no permission) stops the job");

// --- change plans for production records are owner-approved ---
ok(isOwnerOnly("scripts/anchor-events/fixes/2026-10-14-link-repairs.json"), "fixes files are owner-only (need /owner-approve)");
ok(isOwnerOnly("scripts/anchor-events/apply.mjs"), "the writer is owner-only");
ok(!isOwnerOnly("scripts/anchor-events/watch.mjs") && !isOwnerOnly("data/florida-anchor-events.json"), "NEGATIVE: the read-only watcher and the anchor list stay ordinary files");

if (fails.length) { console.error(`test-anchor-workflow-gate: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`test-anchor-workflow-gate: OK - ${pass} assertions (protection step executed: allowed with reviewers, denied without or on API error; runs before any secret; main + dispatch only; watch never writes; fixes/** and apply.mjs owner-only)`);
