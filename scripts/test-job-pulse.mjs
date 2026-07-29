// scripts/test-job-pulse.mjs — locks the spend-watch layer.
//
// THE DEFECT. atlas-build returned HTTP 200 on every invocation for five days
// while publishing nothing: 525 rows written, 0 published. Four independent
// layers reported green:
//   1. the 200s          — both failure branches returned null and logged nothing
//   2. a guard           — check-editorial-publish asserted the cron was SCHEDULED
//   3. the env audit     — ANTHROPIC_API_KEY was present, and presence was all it checked
//   4. the spend column  — Anthropic spend hit zero on Jul 22 and nobody read it
// The credential was the trigger. The blindness was the bug. Layer 3 was fixed
// in #441 (VALUE_OVERRIDES). This is layer 4, and these assertions are what stop
// it regressing.
import { readFileSync } from "fs";
import { classifyHealth, incidentLine, DEAD_RUN_THRESHOLD } from "../lib/jobPulse.js";

let pass = 0;
const fail = (m) => { console.error("test-job-pulse: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ── the three states, and the one that matters most is IDLE ───────────────
// A self-terminating job legitimately has nothing to do. If idle read as
// failure, the alert would cry wolf and get muted — which is how a real one
// gets missed.
const ROWS = [
  { job: "atlas-build", attempted: 100, succeeded: 0,  consecutive_zero: 4, last_note: "0 published of 25" },
  { job: "deals-health", attempted: 60, succeeded: 58, consecutive_zero: 0, last_note: null },
  { job: "hero-images",  attempted: 0,  succeeded: 0,  consecutive_zero: 0, last_note: "nothing to do" },
  { job: "popularity",   attempted: 40, succeeded: 0,  consecutive_zero: 1, last_note: "one bad run" },
];
{
  const { incidents, healthy, idle } = classifyHealth(ROWS);
  ok(incidents.length === 1, `exactly one incident (got ${incidents.length}: ${incidents.map((i) => i.job).join(",")})`);
  ok(incidents[0].job === "atlas-build", "the 4-run dead streak is the incident");
  ok(idle.length === 1 && idle[0].job === "hero-images",
    "a job that attempted NOTHING is idle, never an incident — otherwise the alert gets muted and a real one is missed");
  ok(healthy.length === 2, `healthy and single-blip jobs are not incidents (got ${healthy.length})`);
  ok(!incidents.some((i) => i.job === "popularity"),
    `one dead run is a blip, not an incident — the threshold is ${DEAD_RUN_THRESHOLD}`);
  // Every bucket non-empty: a classifier exercised on only one shape proves nothing.
  ok(incidents.length && healthy.length && idle.length, "all three buckets are exercised");
}
// The threshold binds in BOTH directions, or it is decoration.
{
  const two = [{ job: "x", attempted: 10, succeeded: 0, consecutive_zero: 2 }];
  const one = [{ job: "x", attempted: 10, succeeded: 0, consecutive_zero: 1 }];
  ok(classifyHealth(two).incidents.length === 1, "2 consecutive dead runs IS an incident");
  ok(classifyHealth(one).incidents.length === 0, "1 dead run is NOT");
  ok(DEAD_RUN_THRESHOLD === 2,
    `the threshold is 2 — the first count that cannot be one transient blip, and at hourly cadence it detects in ~2h instead of the 120h this actually took (got ${DEAD_RUN_THRESHOLD})`);
}
// Loudest first: the longest dead streak is the oldest undetected failure.
{
  const { incidents } = classifyHealth([
    { job: "a", attempted: 5, succeeded: 0, consecutive_zero: 2 },
    { job: "b", attempted: 5, succeeded: 0, consecutive_zero: 9 },
  ]);
  ok(incidents[0].job === "b", "incidents are ordered by streak length, longest first");
}
ok(classifyHealth([]).incidents.length === 0 && classifyHealth(null).incidents.length === 0,
  "classifyHealth is total over empty and null");

// ── the message is actionable without opening a dashboard ─────────────────
{
  const line = incidentLine(ROWS[0]);
  ok(/atlas-build/.test(line) && /4 consecutive/.test(line), "the line names the job and the streak");
  ok(/0\/100/.test(line), "the line carries the succeeded/attempted ratio");
  ok(/last reason: 0 published of 25/.test(line), "the line carries the dominant failure reason");
}

// ── it is GENERIC, not atlas-specific ─────────────────────────────────────
// The brief was explicit: whatever is built must also catch Places going quiet.
{
  const lib = read("lib/jobPulse.js");
  const route = read("app/api/cron/job-watch/route.js");
  ok(!/atlas/i.test(lib.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")),
    "lib/jobPulse.js contains no atlas-specific CODE — the mechanism is generic (comments may cite the incident)");
  ok(/wf_job_health/.test(lib), "health is computed by the RPC, so the alert and any dashboard cannot disagree");
  ok(/recordPulse/.test(lib) && /classifyHealth/.test(lib), "record and classify are separable — classify is pure and testable without a database");
  ok(/DEAD_RUN_THRESHOLD/.test(route), "the route uses the shared threshold rather than a second copy of the number");
}

// ── succeeded means PUBLISHED, not written ────────────────────────────────
// This is the whole lesson. Every layer that was watching counted writes.
{
  const atlas = read("app/api/cron/atlas-build/route.js");
  // v6.67 — the route pulses under a job name chosen by mode. Assert BOTH names
  // reach the pulse: if retry rolled up under "atlas-build", a healthy build
  // path would mask a dead retry path in the watcher, which is the same
  // masking this whole layer exists to prevent.
  ok(/recordPulse\((?:"atlas-build"|retryMode \? "atlas-retry" : "atlas-build")/.test(atlas),
    "atlas-build reports a pulse — a watcher with nothing reporting is the same blindness");
  ok(/"atlas-retry"/.test(atlas) && /"atlas-build"/.test(atlas),
    "build and retry pulse under DISTINCT job names — one healthy path must not mask the other");
  ok(/succeeded: publishedCount/.test(atlas),
    "the pulse's `succeeded` is PUBLISHED rows, not written rows — 525 written / 0 published is precisely the state that must register as failure");
  ok(/attempted: 0, succeeded: 0/.test(atlas), "the idle path pulses too, with attempted 0, so a self-terminating run is not an incident");
  const pulses = (atlas.match(/recordPulse\(/g) || []).length;
  ok(pulses >= 2, `atlas-build pulses on more than one path (got ${pulses}) — a job that only pulses on success is as blind as one that never pulses`);
}

// ── an empty table is not a clean bill of health ──────────────────────────
{
  const route = read("app/api/cron/job-watch/route.js");
  ok(/no pulse rows in window/.test(route),
    "zero pulse rows is reported as 'nothing is reporting', NOT as 'no incidents' — conflating them is the exact mistake this route exists to stop");
  ok(/unauthorized/.test(route) && /CRON_SECRET/.test(route), "the route is CRON_SECRET-gated, fail-closed");
  ok(/RESEND_API_KEY or DIGEST_EMAIL not set/.test(route),
    "a send it could not make is REPORTED — a silent no-send would reproduce the failure mode this route watches for");
}

// ── the migration is in the repo, not only in the database ────────────────
{
  const mig = read("supabase/migrations/20260729_wf_job_pulse.sql");
  ok(/create table if not exists public\.wf_job_pulse/.test(mig), "the pulse table is versioned in the repo");
  ok(/wf_job_health/.test(mig), "the health RPC ships with it");
  ok(/attempted > 0 and .*succeeded = 0/.test(mig), "the RPC's dead-run definition requires attempted work — idle is not dead");
}

console.log(`test-job-pulse: OK — ${pass} assertions (incident vs healthy vs idle, threshold binds both ways, generic not atlas-specific, succeeded=published, empty table is not health)`);
