#!/usr/bin/env node
// scripts/record-workflow-pulse.mjs — let a GitHub Actions workflow leave a
// heartbeat in wf_job_pulse, so its SILENCE becomes detectable.
//
// WHY THIS EXISTS (2026-09-09). Two measurements from the same afternoon:
//
//   1. `canary` and `synthetic-monitor` both declare `cron: "*/30 * * * *"`.
//      Measured from the Actions API, canary ran 10 times in 36 hours and
//      synthetic 8 times in 27 — roughly every 3.5 hours. GitHub drops
//      scheduled invocations under load, which is documented behaviour and was
//      documented nowhere in this repo. Every incident note reasoning about
//      "the next 30-minute run" was reasoning from a number that is not true.
//
//   2. Both workflows had ALSO been failing on every one of those runs for a
//      day and a half, and nothing said so. job-watch emails incidents out of
//      wf_job_pulse and, since #1195, does not spam — but a workflow that
//      fails inside GitHub writes no pulse, so that path never saw it.
//
// A job that stops running produces NO ROW, and lib/jobPulse.classifyHealth
// can only classify rows that exist — so silence reads as health. That is the
// hole this closes from the writing side: every scheduled workflow leaves a
// row every run, pass or fail. A watcher that alerts on an OVERDUE row is the
// reading side, and is a separate piece.
//
// DELIBERATELY FAIL-SOFT, and deliberately NOT the verdict. recordPulse
// already swallows its own errors; this exits 0 no matter what. A heartbeat
// that can fail a build would let a Supabase blip turn a green canary red, and
// the workflow step that actually judges production has already run by the
// time this executes. It reports what it did on stdout so a run log still
// shows whether the beat landed.
//
// Usage, from a workflow step with `if: always()`:
//   node scripts/record-workflow-pulse.mjs --job=canary --outcome=success
//   node scripts/record-workflow-pulse.mjs --job=canary --outcome=failure --note="..."
import { recordPulse } from "../lib/jobPulse.js";

function parseArgs(argv) {
  const out = { job: "", outcome: "", note: "" };
  for (const a of argv) {
    if (a.startsWith("--job=")) out.job = a.slice(6).trim();
    else if (a.startsWith("--outcome=")) out.outcome = a.slice(10).trim().toLowerCase();
    else if (a.startsWith("--note=")) out.note = a.slice(7).trim();
  }
  return out;
}

// GitHub's job status vocabulary. Anything that is not an unambiguous pass is
// treated as a failure: "cancelled" and "skipped" mean the check did not
// happen, and a monitor that did not happen must never look like one that
// passed. Only "success" produces a healthy beat.
export function pulseFor(outcome) {
  const ok = String(outcome || "").toLowerCase() === "success";
  return { attempted: 1, succeeded: ok ? 1 : 0, failed: ok ? 0 : 1, ok };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.job) {
    console.log("record-workflow-pulse: no --job given, nothing recorded");
    return;
  }
  const { attempted, succeeded, failed, ok } = pulseFor(args.outcome);
  const note = args.note
    ? args.note.slice(0, 200)
    : ok
      ? `workflow run completed: ${args.outcome}`
      : `workflow run did not pass: ${args.outcome || "unknown"}`;

  const wrote = await recordPulse(args.job, { attempted, succeeded, failed, note });
  console.log(
    `record-workflow-pulse: ${args.job} ${succeeded}/${attempted}/${failed} — ${note}` +
    (wrote ? "" : " (NOT RECORDED — Supabase env missing or write failed; heartbeat lost for this run)")
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Never fail the workflow on a heartbeat problem — see the header.
  await main().catch((e) => console.log(`record-workflow-pulse: swallowed ${String((e && e.message) || e).slice(0, 160)}`));
}
