#!/usr/bin/env node
// Proves check-guards-ci rejects a workflow that would hide a cancelled run,
// and proves guards-main-run rejects a cancelled main push.
// The live files are the positive control: they must pass the same functions.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluateGuardsWorkflow, evaluateCanaryHeartbeat, evaluateMonitorWorkflow } from "./check-guards-ci.mjs";
import { verdictFromRuns } from "./guards-main-run.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
const failures = [];
const ok = (cond, message) => { if (cond) pass += 1; else failures.push(message); };

const liveGuards = read(".github/workflows/guards.yml");
const liveCanary = read(".github/workflows/canary.yml");
const liveMonitor = read(".github/workflows/guards-main-monitor.yml");

ok(evaluateGuardsWorkflow(liveGuards).length === 0, `live guards.yml must pass, got ${evaluateGuardsWorkflow(liveGuards).join("; ")}`);
ok(evaluateCanaryHeartbeat(liveCanary).length === 0, `live canary.yml heartbeat must pass, got ${evaluateCanaryHeartbeat(liveCanary).join("; ")}`);
ok(evaluateMonitorWorkflow(liveMonitor).length === 0, `live monitor must pass, got ${evaluateMonitorWorkflow(liveMonitor).join("; ")}`);

// Positive control: the probe can see the real required command before any
// absence check is trusted.
ok(/node scripts\/run-guards\.mjs/.test(liveGuards), "positive control: live guards.yml contains the suite command");

const dropExit = liveGuards.replace("process.exit(1)", "process.exit(0)");
const dropped = evaluateGuardsWorkflow(dropExit);
ok(dropped.some((line) => /exit 1/.test(line)), `red proof: exiting 0 on a bad dependency must fail the guard, got ${dropped.join("; ")}`);

const shortClock = liveGuards.replace(
  "    timeout-minutes: 30\n    steps:",
  "    timeout-minutes: 20\n    steps:",
);
const shortened = evaluateGuardsWorkflow(shortClock);
ok(shortened.some((line) => /timeout-minutes must be >= 30/.test(line)), `red proof: putting the suite back on a 20 minute clock must fail, got ${shortened.join("; ")}`);

const shallow = liveGuards.replace(
  "          fetch-depth: 0\n          filter: blob:none",
  "          fetch-depth: 1\n          filter: blob:none",
);
const shallowFailures = evaluateGuardsWorkflow(shallow);
ok(shallowFailures.some((line) => /fetch-depth: 0/.test(line)), `red proof: a shallow suite checkout must fail, got ${shallowFailures.join("; ")}`);

const skipGate = liveGuards.replace(
  "    needs: [guard-suite, rendered-guards, production-build]\n    if: always()",
  "    needs: [guard-suite, rendered-guards, production-build]\n    if: success()",
);
const skipped = evaluateGuardsWorkflow(skipGate);
ok(skipped.some((line) => /if: always\(\)/.test(line)), `red proof: skipping the required check after a cancel must fail, got ${skipped.join("; ")}`);

const shortBeat = evaluateCanaryHeartbeat(liveCanary.replace(
  "    runs-on: ubuntu-latest\n    # 2026-11-03 run 41684161308:",
  "    runs-on: ubuntu-latest\n    timeout-minutes: 3\n    # 2026-11-03 run 41684161308:",
));
ok(shortBeat.some((line) => /timeout-minutes must be >= 15/.test(line)), `red proof: a 3 minute canary heartbeat must fail, got ${shortBeat.join("; ")}`);

const beat = evaluateCanaryHeartbeat(liveCanary.replace(
  /(--note="jobs not green:\$FAILED"\n(?:.*\n)*?)\s*exit 1\n/,
  "$1",
));
ok(beat.some((line) => /exit 1/.test(line)), `red proof: a canary heartbeat that records failure and exits 0 must fail, got ${beat.join("; ")}`);

const mute = evaluateMonitorWorkflow(liveMonitor.replace("node scripts/guards-main-run.mjs", "node scripts/no-such-monitor.mjs"));
ok(mute.some((line) => /guards-main-run/.test(line)), `red proof: a monitor that does not run the checker must fail, got ${mute.join("; ")}`);

const now = Date.parse("2026-11-03T18:00:00Z");
const successRun = {
  id: 1, status: "completed", conclusion: "success", head_sha: "a".repeat(40),
  html_url: "https://example.test/1", created_at: "2026-11-03T17:00:00Z",
};
ok(verdictFromRuns([successRun], now).ok === true, "a completed success is a pass");

for (const conclusion of ["cancelled", "failure", "skipped", "timed_out", "startup_failure", null]) {
  const verdict = verdictFromRuns([{ ...successRun, id: 2, conclusion }], now);
  ok(verdict.ok === false && /not success|concluded/.test(verdict.reason), `conclusion ${conclusion} must not pass (${verdict.reason})`);
}

const stuck = verdictFromRuns([{
  id: 3, status: "in_progress", conclusion: null, created_at: "2026-11-03T16:00:00Z",
  run_started_at: "2026-11-03T16:00:00Z", html_url: "https://example.test/3",
}, successRun], now);
ok(stuck.ok === false && /45 minutes/.test(stuck.reason), `a run still going after 45 minutes must fail (${stuck.reason})`);

const underway = verdictFromRuns([{
  id: 4, status: "in_progress", conclusion: null, created_at: "2026-11-03T17:40:00Z",
  run_started_at: "2026-11-03T17:40:00Z", html_url: "https://example.test/4",
}, successRun], now);
ok(underway.ok === true, `an in-progress run with a previous success is not a failure (${underway.reason})`);

ok(verdictFromRuns([], now).ok === false, "no runs is not a pass");

if (failures.length) {
  console.error("test-guards-ci: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}
console.log(`test-guards-ci: OK — ${pass} assertions; live workflows pass, and a zero-exit gate, a 20 minute suite clock, a shallow checkout, a skipped required check, a green canary heartbeat, a muted monitor, and a cancelled main run all go red`);
