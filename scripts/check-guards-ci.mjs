#!/usr/bin/env node
// scripts/check-guards-ci.mjs — the merge gate cannot time out in silence,
// and a cancelled check cannot be the green one.
//
// 2026-11-03. Four pushes to main (#2155, #2156, #2157, and the photo batch
// that followed) cancelled the `guards` job at timeout-minutes: 20. The suite
// wall time on the runs that finished it was 704–744s, the same as the last
// green main run (716s, Actions run 41674809734). Checkout of the full 689MB
// history was 241s, 682s, 330s, and 375s against 76s on that green run.
// The job log says "The operation was canceled" at started+20 minutes. The
// next main push was created after the cancel. That is the clock, not
// cancel-in-progress and not a red guard.
//
// This file locks the repair in .github/workflows/guards.yml:
//   - the full suite, the two --require-browser gates, and the production
//     build plus the homepage ratchet all still run
//   - they are parallel jobs, so build time is not added to the suite clock
//   - the suite checkout stays non-shallow (fetch-depth: 0) for
//     check-doc-ownership, and uses a blobless filter so historical blobs
//     are not what blows the clock
//   - the job named `guards` runs even when a dependency was cancelled, and
//     exits 1 unless every dependency result is exactly "success"
//   - guard-suite timeout-minutes stays at or above the measured worst case
//
// It also locks the canary heartbeat, which already recorded a failure pulse
// but exited 0, so the heartbeat CHECK could be green while a sibling was
// cancelled. And it locks guards-main-monitor.yml, which fails when the
// newest completed push to main did not succeed.
//
// Hermetic. Reads the workflow files. The broken-fixture proof lives in
// scripts/test-guards-ci.mjs and calls evaluateGuardsWorkflow().

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const stripHash = (src) => String(src || "").replace(/^\s*#.*$/gm, "");

export function parseJobs(src) {
  const lines = stripHash(src).split(/\n/);
  const jobs = {};
  let inJobs = false;
  let current = null;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) { inJobs = true; current = null; continue; }
    if (!inJobs) continue;
    if (/^\S/.test(line)) break;
    const header = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (header) { current = header[1]; jobs[current] = []; continue; }
    if (current) jobs[current].push(line);
  }
  return jobs;
}

function timeoutOf(body) {
  const match = body.join("\n").match(/timeout-minutes:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

export function evaluateGuardsWorkflow(src) {
  const failures = [];
  const bad = (message) => failures.push(message);
  if (!/name:\s*guards\b/.test(src)) bad("positive control: workflow must still be named guards");
  const jobs = parseJobs(src);
  const suite = jobs["guard-suite"];
  const rendered = jobs["rendered-guards"];
  const build = jobs["production-build"];
  const gate = jobs.guards;
  if (!suite) bad("guard-suite job is missing");
  if (!rendered) bad("rendered-guards job is missing");
  if (!build) bad("production-build job is missing");
  if (!gate) bad("the required job named guards is missing");
  if (suite) {
    const text = suite.join("\n");
    if (!/fetch-depth:\s*0\b/.test(text)) bad("guard-suite checkout must set fetch-depth: 0 so origin/main is readable");
    if (!/filter:\s*blob:none\b/.test(text)) bad("guard-suite checkout must set filter: blob:none (full history without every historical blob)");
    if (!/node scripts\/run-guards\.mjs/.test(text)) bad("guard-suite must run node scripts/run-guards.mjs");
    const timeout = timeoutOf(suite);
    if (timeout == null || timeout < 30) bad(`guard-suite timeout-minutes must be >= 30 (measured worst checkout 682s + suite 744s), got ${timeout}`);
  }
  if (rendered) {
    const text = rendered.join("\n");
    if (!/node scripts\/check-place-card-standard\.mjs --require-browser/.test(text)) {
      bad("rendered-guards must run check-place-card-standard.mjs --require-browser");
    }
    if (!/node scripts\/test-map-pin-standard\.mjs --require-browser/.test(text)) {
      bad("rendered-guards must run test-map-pin-standard.mjs --require-browser");
    }
    const timeout = timeoutOf(rendered);
    if (timeout == null || timeout < 20) bad(`rendered-guards timeout-minutes must be >= 20, got ${timeout}`);
  }
  if (build) {
    const text = build.join("\n");
    if (!/npx next build/.test(text) && !/npm run build/.test(text)) bad("production-build must run the production build");
    if (!/node scripts\/check-bundle\.mjs/.test(text)) bad("production-build must run check-bundle.mjs (npx next build alone is how #949 shipped)");
    const timeout = timeoutOf(build);
    if (timeout == null || timeout < 20) bad(`production-build timeout-minutes must be >= 20, got ${timeout}`);
  }
  if (gate) {
    const text = gate.join("\n");
    if (!/if:\s*always\(\)/.test(text)) bad("the guards job must set if: always() so a cancelled dependency does not skip the required check");
    for (const need of ["guard-suite", "rendered-guards", "production-build"]) {
      if (!new RegExp(`needs\\.[\\w.-]*${need}\\.result`).test(text) && !text.includes(`needs.${need}.result`)) {
        bad(`the guards job must read needs.${need}.result`);
      }
    }
    if (!/needs:\s*\[guard-suite,\s*rendered-guards,\s*production-build\]/.test(text)) {
      bad("the guards job must need guard-suite, rendered-guards, and production-build");
    }
    if (!/!==\s*"success"/.test(text)) bad("the guards job must treat any result other than success as failure");
    if (!/process\.exit\(1\)/.test(text)) bad("the guards job must exit 1 when a dependency is not success");
    if (/continue-on-error:\s*true/.test(text)) bad("the guards job must not set continue-on-error");
  }
  if (/continue-on-error:\s*true/.test(stripHash(src))) bad("guards.yml must not mark a step continue-on-error: true");
  return failures;
}

export function evaluateCanaryHeartbeat(src) {
  const failures = [];
  const jobs = parseJobs(src);
  const beat = jobs.heartbeat;
  if (!beat) {
    failures.push("canary heartbeat job is missing");
    return failures;
  }
  const text = beat.join("\n");
  if (!/if:\s*always\(\)/.test(text)) failures.push("canary heartbeat must set if: always()");
  const timeout = timeoutOf(beat);
  if (timeout == null || timeout < 15) failures.push(`canary heartbeat timeout-minutes must be >= 15 (the 3 minute cap cancelled run 41684161308 before the pulse), got ${timeout}`);
  if (!/outcome=failure/.test(text) || !/jobs not green/.test(text)) {
    failures.push("canary heartbeat must record a failure pulse naming the jobs that were not green");
  }
  if (!/outcome=failure[\s\S]*\bexit 1\b/.test(text)) {
    failures.push("canary heartbeat must exit 1 after a non-success sibling — recording a pulse and exiting 0 leaves the heartbeat check green");
  }
  return failures;
}

export function evaluateMonitorWorkflow(src) {
  const failures = [];
  const code = stripHash(src);
  if (!/schedule:/.test(code) || !/cron:/.test(code)) failures.push("guards-main-monitor must be scheduled");
  if (!/node scripts\/guards-main-run\.mjs/.test(code)) failures.push("guards-main-monitor must run node scripts/guards-main-run.mjs");
  if (!/actions:\s*read/.test(code)) failures.push("guards-main-monitor needs actions: read to see the main guards run");
  if (!/!\/public\//.test(code)) failures.push("guards-main-monitor must skip public/ so a full-tree fetch cannot eat the job");
  const timeout = code.match(/timeout-minutes:\s*(\d+)/);
  if (!timeout || Number(timeout[1]) < 15) failures.push(`guards-main-monitor timeout-minutes must be >= 15 (a 5 minute cap cancelled a depth-1 checkout at 300s), got ${timeout ? timeout[1] : "none"}`);
  if (/continue-on-error:\s*true/.test(code)) failures.push("guards-main-monitor must not continue on error");
  return failures;
}

function report(label, failures) {
  if (!failures.length) return 0;
  console.error(`${label}: FAIL`);
  for (const failure of failures) console.error("  ✗ " + failure);
  return 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  const guardsFailures = evaluateGuardsWorkflow(read(".github/workflows/guards.yml"));
  const canaryFailures = evaluateCanaryHeartbeat(read(".github/workflows/canary.yml"));
  const monitorFailures = evaluateMonitorWorkflow(read(".github/workflows/guards-main-monitor.yml"));
  const failed = report("check-guards-ci guards.yml", guardsFailures)
    + report("check-guards-ci canary.yml", canaryFailures)
    + report("check-guards-ci guards-main-monitor.yml", monitorFailures);
  if (failed) process.exit(1);
  console.log("check-guards-ci: OK — guards.yml keeps the suite, both browser gates, and the production build; the required guards job exits 1 unless every dependency succeeded; guard-suite timeout is >= 30; canary heartbeat exits 1 on a non-success sibling; guards-main-monitor judges the latest main run");
}
