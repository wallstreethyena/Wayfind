#!/usr/bin/env node
// scripts/record-workflow-pulse.mjs — let a GitHub Actions workflow leave a
// heartbeat in wf_job_pulse, so its SILENCE becomes detectable.
//
// WHY THIS EXISTS (2026-09-09). Two measurements from the same afternoon:
//
//   1. `canary` and `synthetic-monitor` both declare `cron: "*/30 * * * *"`.
//      Measured from the Actions API, canary ran 10 times in 36 hours and
//      synthetic 8 in 27 — roughly every 3.5 hours. GitHub drops scheduled
//      invocations under load, which is documented behaviour and was
//      documented nowhere in this repo.
//
//   2. Both had ALSO been failing on every one of those runs for a day and a
//      half, and nothing said so. job-watch emails incidents out of
//      wf_job_pulse and, since #1195, does not spam — but a workflow that
//      fails inside GitHub writes no pulse, so that path never saw it.
//
// A job that stops running produces NO ROW, and lib/jobPulse.classifyHealth
// can only classify rows that exist — so silence reads as health.
//
// DELIBERATELY FAIL-SOFT, and deliberately NOT the verdict. This exits 0 no
// matter what: a heartbeat that can fail a build would let a Supabase blip
// turn a green canary red, and the step that actually judges production has
// already run by the time this executes.
//
// BUT NOT MUTE. The first live canary heartbeat printed only
// "NOT RECORDED — Supabase env missing or write failed", which is two guesses
// joined by "or", and diagnosing it cost another full workflow round trip.
// That is the same "instrument that fails quietly" pattern this lane exists to
// end, so a beat that does not land now says exactly what happened.
//
// Usage, from a workflow step with `if: always()`:
//   node scripts/record-workflow-pulse.mjs --job=canary --outcome=success
//   node scripts/record-workflow-pulse.mjs --job=canary --outcome=failure --note="..."
import { recordPulseDetailed } from "../lib/jobPulse.js";
import { sbEnv } from "../lib/serverCache.js";

// SHAPES ONLY — host, presence, length, HTTP status. Never the key, never a
// token, never a URL query. Same rule the synthetic monitor's redaction layer
// follows.
export function describeEnv(env) {
  const rawUrl = String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "");
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "");
  let host = "";
  try { host = rawUrl ? new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : "https://" + rawUrl).host : ""; } catch { host = "(unparseable)"; }
  return {
    urlPresent: rawUrl.length > 0,
    host,
    keyPresent: key.length > 0,
    keyLength: key.length,
    // Legacy service_role keys are three-segment JWTs; the current ones are
    // `sb_secret_...`. Reported rather than judged — both are valid, and the
    // length plus this flag is enough to tell which one a secret holds without
    // ever printing it.
    keyLooksJwt: key.split(".").length === 3,
  };
}

async function probeWriteFailure() {
  const shape = describeEnv(process.env);
  if (!shape.urlPresent || !shape.keyPresent) {
    return `env: url=${shape.urlPresent ? shape.host : "MISSING"} key=${shape.keyPresent ? "present" : "MISSING"}`;
  }
  const s = sbEnv();
  if (!s) return `env: sbEnv() returned null despite url=${shape.host} and a key of ${shape.keyLength} chars`;
  let status = "no-response";
  try {
    // An empty insert: PostgREST answers with the same auth and permission
    // verdict a real write would get, without adding a row.
    const r = await fetch(`${s.url}/rest/v1/wf_job_pulse`, {
      method: "POST",
      headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json", prefer: "return=minimal" },
      body: "[]",
      signal: AbortSignal.timeout(15000),
    });
    status = `HTTP ${r.status}`;
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      // PostgREST error bodies describe the SCHEMA and the grant, not the
      // caller's credentials — safe to surface, and it is the one line that
      // turns "it failed" into "here is what to fix".
      status += ` ${body.slice(0, 180)}`;
    }
  } catch (e) {
    status = `threw ${String((e && e.message) || e).slice(0, 120)}`;
  }
  return `host=${shape.host} keyLen=${shape.keyLength} jwtShaped=${shape.keyLooksJwt} probe=${status}`;
}

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

  const w = await recordPulseDetailed(args.job, { attempted, succeeded, failed, note });
  console.log(`record-workflow-pulse: ${args.job} ${succeeded}/${attempted}/${failed} — ${note}`);
  if (w.ok) return;
  if (w.indeterminate) {
    // The request never completed, which is NOT the same as a refusal: the
    // abort is client-side and the server may already have committed. Saying
    // "not recorded" here is how a written row gets reported as lost — observed
    // live on 2026-09-09 (wf_job_pulse id 8788 existed while the run said it
    // did not).
    console.log(`record-workflow-pulse: WRITE OUTCOME UNKNOWN — ${w.error}. The row may or may not exist; check wf_job_pulse for job="${args.job}" before treating this run as unreported.`);
    return;
  }
  // A definite refusal. Name it, and probe for the reason.
  console.log(`record-workflow-pulse: NOT RECORDED (${w.status ? "HTTP " + w.status : "no response"}) — ${w.error}. ${await probeWriteFailure()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Never fail the workflow on a heartbeat problem — see the header.
  await main().catch((e) => console.log(`record-workflow-pulse: swallowed ${String((e && e.message) || e).slice(0, 160)}`));
}
