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
import { classifyHealth, incidentLine, DEAD_RUN_THRESHOLD, isDeterministicFailureNote } from "../lib/jobPulse.js";
import { pulseFor } from "./record-workflow-pulse.mjs";

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
  ok(/recordPulse\("atlas-refresh", opts\)/.test(atlas) && /recordPulse\("atlas-retry", opts\)/.test(atlas) && /recordPulse\("atlas-build", opts\)/.test(atlas),
    "atlas-build reports a pulse — a watcher with nothing reporting is the same blindness");
  ok(/"atlas-refresh"/.test(atlas) && /"atlas-retry"/.test(atlas) && /"atlas-build"/.test(atlas),
    "build, retry, and refresh pulse under DISTINCT job names — one healthy path must not mask another");
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

// ── A REQUIRED INPUT THAT COULD NOT BE READ MUST PAGE, NOT FILE AS IDLE ────
// THE DEFECT (2026-09-09). At 19:35:19Z the hourly at-risk photo drain could
// not read wf_photo_at_risk (PostgREST 500 / 57014 statement timeout) and
// filed `attempted=0 succeeded=0 failed=0 note="place-photos: wf_photo_at_risk
// unavailable"`. The OLD classifyHealth checked `zero >= threshold` first,
// then `attempted === 0 && zero === 0` — a note saying the read had failed
// never entered into either branch, so the row landed in `idle`. That job
// could stay dead forever and never page, and the bug is generic: it applies
// to ANY job that fails before it can attempt anything.
{
  // (a) THE HEADLINE INVARIANT — the exact shape of the production row that
  // hid, with the fix applied to its note, is an INCIDENT, not idle.
  const lostRead = { job: "place-photos", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: "unavailable: place-photos wf_photo_at_risk read failed (HTTP 500)" };
  {
    const { incidents, idle } = classifyHealth([lostRead]);
    ok(incidents.length === 1 && incidents[0].job === "place-photos",
      `(a) a deterministic "unavailable:" note with attempted=0 and consecutive_zero=0 is an INCIDENT — the exact row shape that used to hide as idle (incidents=${incidents.length})`);
    ok(idle.length === 0, "(a) …and it must not ALSO appear in idle");
  }
  // (b) a run that is genuinely idle — same attempted/succeeded/zero shape,
  // an ordinary note with no deterministic prefix — must STAY idle. This is
  // the guard against over-firing: paging on every idle run would train
  // everyone to ignore the alert, which is the exact failure classifyHealth
  // exists to prevent.
  {
    const genuinelyIdle = { job: "place-photos", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: "nothing to do" };
    const { incidents, idle } = classifyHealth([genuinelyIdle]);
    ok(idle.length === 1 && idle[0].job === "place-photos", "(b) a plain idle note with no deterministic prefix stays idle");
    ok(incidents.length === 0, "(b) …and must not become an incident just because the shape resembles (a)");
  }
  // (c) billing:/quota: behaviour is unchanged by this reordering — both
  // still escalate immediately, including at consecutive_zero=0, which is a
  // strict WIDENING (the old code required zero>=1) but must not have
  // regressed the cases it already covered.
  {
    const billingZero = { job: "atlas-build", attempted: 10, succeeded: 0, consecutive_zero: 0, last_note: "billing: anthropic 400: credit balance too low" };
    const quotaOne = { job: "scout", attempted: 5, succeeded: 0, consecutive_zero: 1, last_note: "quota: monthly usage limit exceeded" };
    const { incidents } = classifyHealth([billingZero, quotaOne]);
    const names = incidents.map((r) => r.job);
    ok(names.includes("atlas-build"), "(c) billing: still escalates on the first run (now even at consecutive_zero=0)");
    ok(names.includes("scout"), "(c) quota: still escalates on the first run");
  }
  // (d) the ordinary DEAD_RUN_THRESHOLD path (no deterministic prefix) is
  // unchanged: one dead run is still a blip, two is still an incident.
  {
    const oneDead = { job: "inventory-refresh", attempted: 10, succeeded: 0, consecutive_zero: 1, last_note: "http 500" };
    const twoDead = { job: "inventory-refresh", attempted: 10, succeeded: 0, consecutive_zero: DEAD_RUN_THRESHOLD, last_note: "http 500" };
    ok(classifyHealth([oneDead]).incidents.length === 0, "(d) one generic dead run is still below threshold");
    ok(classifyHealth([twoDead]).incidents.length === 1, "(d) two generic dead runs still page — the ordinary threshold path is unweakened");
  }
  // The prefix predicate itself, and the self-test that a bare substring
  // (not at column 0) does NOT match — the whole point of `^`.
  ok(isDeterministicFailureNote("unavailable: x"), "isDeterministicFailureNote: unavailable: at column 0 matches");
  ok(isDeterministicFailureNote("billing: x") && isDeterministicFailureNote("quota: x"), "isDeterministicFailureNote: billing:/quota: still match");
  ok(!isDeterministicFailureNote("place-photos: unavailable: x"),
    "isDeterministicFailureNote: a deterministic prefix NOT at column 0 does not match — this is exactly why route.js must not blanket-prefix a note that already carries one");
  ok(!isDeterministicFailureNote("nothing to do") && !isDeterministicFailureNote(null) && !isDeterministicFailureNote(undefined),
    "isDeterministicFailureNote: an ordinary note, null and undefined are all non-matches");
}

// ── THE TWO LAYERS CANNOT DRIFT APART: SAME THREE PREFIXES, COUNTED ────────
// lib/jobPulse.js's DETERMINISTIC_NOTE_PREFIX and
// supabase/migrations/20260909_wf_job_health_unavailable_is_dead.sql's `dead`
// expression each name the SAME three prefixes independently (JS and SQL
// cannot share one regex literal). This does not read either as a fixed
// literal — it extracts the prefix list from BOTH real files and compares
// the sets, so a future prefix added to one side without the other goes red
// here instead of silently drifting. Counted (`.length === 3`), never
// `includes` — `includes` cannot tell "the same three" from "a superset".
{
  const jsSrc = read("lib/jobPulse.js");
  const jsMatch = /DETERMINISTIC_NOTE_PREFIX\s*=\s*\/\^\(([a-z|]+)\):\/i/.exec(jsSrc);
  ok(!!jsMatch, "lib/jobPulse.js: DETERMINISTIC_NOTE_PREFIX is declared in the exact `/^(a|b|c):/i` shape this guard parses");
  const jsPrefixes = jsMatch ? jsMatch[1].split("|").sort() : [];

  const sql = read("supabase/migrations/20260909_wf_job_health_unavailable_is_dead.sql");
  const sqlMatch = /r\.note\s*~\*\s*'\^\(([a-z|]+)\):'/.exec(sql);
  ok(!!sqlMatch, "20260909_wf_job_health_unavailable_is_dead.sql: the `dead` expression's note check is in the exact `~* '^(a|b|c):'` shape this guard parses");
  const sqlPrefixes = sqlMatch ? sqlMatch[1].split("|").sort() : [];

  ok(jsPrefixes.length === 3, `lib/jobPulse.js names exactly 3 deterministic prefixes (got ${jsPrefixes.length}: ${jsPrefixes.join(",")})`);
  ok(sqlPrefixes.length === 3, `the migration names exactly 3 deterministic prefixes (got ${sqlPrefixes.length}: ${sqlPrefixes.join(",")})`);
  ok(JSON.stringify(jsPrefixes) === JSON.stringify(sqlPrefixes),
    `lib/jobPulse.js and the migration must name the SAME three prefixes — JS has [${jsPrefixes.join(",")}], SQL has [${sqlPrefixes.join(",")}]`);
  ok(jsPrefixes.includes("billing") && jsPrefixes.includes("quota") && jsPrefixes.includes("unavailable"),
    "the three are billing, quota and unavailable specifically, not just any matching triple");

  // The migration also carries the OLD attempted/failed-gated dead clause
  // (widened with OR, not replaced) and REVOKEs public access same as its
  // predecessor — this migration is an addition to wf_job_health, not a
  // narrower rewrite that silently drops a prior invariant.
  ok(/\(r\.attempted > 0 OR r\.failed > 0\) AND r\.succeeded = 0/.test(sql),
    "the original attempted/failed dead clause is preserved (widened with OR), not replaced");
  ok(/REVOKE ALL ON FUNCTION public\.wf_job_health\(integer\) FROM PUBLIC, anon, authenticated;/.test(sql),
    "the function keeps the same REVOKE — service_role only, same as every other wf_job_health revision");
}

// ── SCHEDULED WORKFLOWS MUST LEAVE A BEAT (2026-09-09) ────────────────────
// The hole this closes, measured the same day: `canary` and
// `synthetic-monitor` had failed on EVERY run for 36 and 21 hours and nothing
// said so. A workflow that fails inside GitHub writes no wf_job_pulse row, and
// classifyHealth above can only classify rows that EXIST — so a failing
// monitor and an absent one both read as silence, and silence reads as health.
//
// They also run far less often than they claim: measured against a declared
// */30, canary ran 10 times in 36 hours and synthetic 8 in 27. GitHub drops
// scheduled invocations under load. So the absence of a run is a real, routine
// state that has to be observable, not an edge case.
//
// This asserts the WRITING side — every scheduled workflow beats every run,
// pass or fail. Alerting on an OVERDUE beat is the reading side and is a
// separate piece; it has nothing to read until this exists.
{
  const wf = (p) => read(".github/workflows/" + p);
  // Strip full-line comments first: both files' new comments quote the very
  // literals asserted below, so a raw grep would pass on the prose alone.
  const strip = (s) => s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

  for (const [file, job] of [["canary.yml", "canary"], ["synthetic-monitor.yml", "synthetic-monitor"]]) {
    const code = strip(wf(file));
    ok(new RegExp(`record-workflow-pulse\\.mjs[^\\n]*--job=${job}`).test(code),
      `${file}: records a wf_job_pulse heartbeat for "${job}" in a run: step — without it, this workflow's silence is undetectable`);
    ok(/if:\s*always\(\)/.test(code),
      `${file}: the heartbeat runs with if: always() — a beat that only fires on success is not a heartbeat, it is a success notification`);
    ok(/SUPABASE_SERVICE_ROLE_KEY/.test(code),
      `${file}: the heartbeat step is given SUPABASE_SERVICE_ROLE_KEY, or it silently records nothing`);
  }

  // The canary fans out into five jobs; its beat must reflect ALL of them, or
  // a single red job would still beat green. That is the exact failure mode
  // that hid the migration drift behind the RPC parser bug.
  const canary = strip(wf("canary.yml"));
  ok(/needs:\s*\[incident-delivery,\s*routes,\s*inventory,\s*promote-metros,\s*deploy-contract\]/.test(canary),
    "canary.yml: the heartbeat job needs all five canary jobs, so its beat is the aggregate rather than one job's luck");
  ok(/outcome=failure/.test(canary) && /jobs not green/.test(canary),
    "canary.yml: a non-green job produces a FAILURE beat naming which jobs were not green");

  // Self-tests for the stripper, so a future edit cannot satisfy these checks
  // with a comment.
  ok(!/record-workflow-pulse\.mjs/.test(strip("# node scripts/record-workflow-pulse.mjs --job=canary\njobs: {}")),
    "self-test: a commented-out heartbeat does NOT satisfy the check");
  ok(/record-workflow-pulse\.mjs/.test(strip("  run: node scripts/record-workflow-pulse.mjs --job=canary")),
    "self-test: a real run: step IS detected after stripping (not vacuously false)");

  // pulseFor: only an unambiguous pass beats healthy. "cancelled" and
  // "skipped" mean the check did not happen, and a monitor that did not happen
  // must never look like one that passed.
  ok(pulseFor("success").succeeded === 1 && pulseFor("success").failed === 0, "pulseFor: success is a healthy beat");
  for (const bad of ["failure", "cancelled", "skipped", "", undefined, "SUCCESS_ISH"]) {
    const p = pulseFor(bad);
    ok(p.succeeded === 0 && p.failed === 1 && p.attempted === 1,
      `pulseFor: "${bad}" must beat as a FAILURE — anything that is not an unambiguous pass means the check did not happen`);
  }
  ok(pulseFor("SUCCESS").succeeded === 1, "pulseFor: the outcome comparison is case-insensitive");

  // ── A TIMED-OUT WRITE IS NOT A REFUSED WRITE ─────────────────────────────
  // 2026-09-09, observed live. A heartbeat printed "NOT RECORDED" and the row
  // was already in the table (wf_job_pulse id 8788). recordPulse returns a
  // bare boolean, and that boolean collapsed three states into one: written,
  // refused, and never-completed. The abort is CLIENT-side — the server may
  // have committed — so reporting it as "not recorded" is the instrument
  // lying about itself, which is the defect class this whole lane exists to
  // catch. recordPulseDetailed keeps the three states apart; recordPulse
  // still returns the same boolean for every existing caller.
  {
    const src = read("lib/jobPulse.js");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    ok(/export async function recordPulseDetailed/.test(code),
      "lib/jobPulse.js exports recordPulseDetailed — anything that REPORTS on a pulse write needs the outcome, not a boolean");
    ok(/indeterminate/.test(code),
      "recordPulseDetailed distinguishes an INDETERMINATE write (timeout / socket death, row may exist) from a refusal");
    ok(/const r = await recordPulseDetailed\(job, opts\);\s*return r\.ok;/.test(code.replace(/\s+/g, " ").replace(/ /g, " ")) || /return r\.ok/.test(code),
      "recordPulse delegates to recordPulseDetailed and still returns a plain boolean — no existing caller changes behaviour");
    ok(/AbortSignal\.timeout\(15000\)/.test(code),
      "the write timeout is 15s, not 10s — a cold process pays DNS + TLS first (measured 3.8s on an ordinary connection) and an abort here reports a committed row as lost");
    // Self-test: the comment stripper must not let the prose above satisfy
    // these checks on its own.
    ok(!/recordPulseDetailed/.test(("// recordPulseDetailed named only in a comment\nconst x=1;").replace(/^\s*\/\/.*$/gm, " ")),
      "self-test: the identifier named only in a comment does NOT satisfy the check");

    // The reporting CLI must use the detailed form, or the distinction is
    // academic — this is where the false "NOT RECORDED" was printed.
    const cli = read("scripts/record-workflow-pulse.mjs").replace(/^\s*\/\/.*$/gm, " ");
    ok(/recordPulseDetailed/.test(cli),
      "scripts/record-workflow-pulse.mjs uses recordPulseDetailed — the caller that PRINTS the outcome must know it");
    ok(/WRITE OUTCOME UNKNOWN/.test(cli),
      "…and says the outcome is UNKNOWN on an indeterminate write rather than claiming the beat was lost");
    ok(/NOT RECORDED \(/.test(cli),
      "…and reserves NOT RECORDED for a definite refusal, with the status alongside it");
  }
  // And the beat has to be classifiable by the machinery above, or it is inert.
  ok(classifyHealth([{ job: "canary", attempted: 1, succeeded: 0, consecutive_zero: DEAD_RUN_THRESHOLD, last_note: "jobs not green: routes=failure" }]).incidents.length === 1,
    "a repeated failure beat is classified as an INCIDENT by the existing watcher — the heartbeat reaches the alert path already proven in #1183/#1195");
  ok(classifyHealth([{ job: "canary", attempted: 1, succeeded: 1, consecutive_zero: 0, last_note: "workflow run completed: success" }]).healthy.length === 1,
    "a passing beat is classified healthy, not idle — attempted work that succeeded is health");
}

ok(classifyHealth([{job:"config-failure",attempted:0,succeeded:0,consecutive_zero:2,last_note:"cannot run"}]).incidents.length === 1, "explicit failures before any request are incidents, not idle");
ok(classifyHealth([{job:"empty",attempted:0,succeeded:0,consecutive_zero:0}]).idle.length === 1, "a healthy zero-work run remains idle");

console.log(`test-job-pulse: OK — ${pass} assertions (incident vs healthy vs idle, threshold binds both ways, generic not atlas-specific, succeeded=published, empty table is not health)`);
