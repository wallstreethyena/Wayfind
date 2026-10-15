#!/usr/bin/env node
// scripts/test-anchor-watch-heartbeat.mjs — proves the alarm around the daily
// anchor-watch job actually fires, by running the REAL evaluators:
//
//   STALENESS (silence). The evaluator is SQL: public.wf_heartbeat_overdue()
//   and public.wf_heartbeat_watch() (Supabase pg_cron, every 15 min). It is not
//   re-implemented here. This test starts a throwaway local Postgres, applies
//   the repo's real migrations (wf_job_pulse, wf_job_health, wf_heartbeat_*,
//   and 20261014120000_wf_heartbeat_anchor_watch.sql), inserts pulses with
//   chosen ages, and asks the functions. The tolerance is PARSED from the
//   anchor-watch migration, never hardcoded.
//   FAILURE. watch.mjs is run as a child with a preloaded fetch that fails the
//   database read and captures the real recordPulse() body; that body goes
//   into wf_job_pulse, wf_job_health() computes the streak, and the real
//   lib/jobPulse.classifyHealth() (what /api/cron/job-watch calls) decides
//   whether it pages.
//
// What it cannot prove: pg_cron really firing in production, Resend delivery,
// or that the migration has been APPLIED to the live project (owner step; the
// read-only SELECT is in the PR body). Needs Postgres server binaries
// (ubuntu GitHub runners have them). Without them it FAILS, unless
// --sql-optional is passed (Vercel's build container has none): then the SQL
// half prints a loud NOT RUN line and only the JS half is asserted.
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { classifyHealth, DEAD_RUN_THRESHOLD } from "../lib/jobPulse.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = path.join(ROOT, "supabase/migrations");
const sqlOptional = process.argv.includes("--sql-optional");
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const ENV = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C", LC_ALL: "C" };

// ---- the expectation row, parsed from the migration under review
const anchorSql = readFileSync(path.join(MIG, "20261014120000_wf_heartbeat_anchor_watch.sql"), "utf8");
const m = /\(\s*'anchor-watch'\s*,\s*(\d+)\s*,/.exec(anchorSql);
ok(!!m, "anchor-watch expectation row is parseable from the migration");
const MINS = m ? Number(m[1]) : NaN;
ok(MINS > 1440, `tolerance (${MINS} min) is longer than the daily schedule (1440 min)`);
const H = 60; // minutes

// ---- FAILURE half: real watch.mjs failure pulse (no Postgres needed)
const tmp = mkdtempSync(path.join(tmpdir(), "anchor-hb-"));
const pulseOut = path.join(tmp, "pulse.json");
const preload = "data:text/javascript," + encodeURIComponent(`
import { writeFileSync } from "node:fs";
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes("/rest/v1/wf_job_pulse") && init.method === "POST") { writeFileSync(${JSON.stringify(pulseOut)}, init.body); return { ok: true, status: 201, text: async () => "" }; }
  return { ok: false, status: 500, text: async () => "boom", json: async () => ({}) };
};`);
const w = spawnSync(process.execPath, ["--import", preload, path.join(ROOT, "scripts/anchor-events/watch.mjs"),
  "--anchors", path.join(ROOT, "scripts/anchor-events/fixtures/anchors.sample.json"), "--out", path.join(tmp, "report.md"), "--today", "2026-10-14"],
  { env: { ...ENV, SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_ROLE_KEY: "k" }, encoding: "utf8" });
const failPulse = existsSync(pulseOut) ? JSON.parse(readFileSync(pulseOut, "utf8")) : null;
ok(w.status === 1, `watch.mjs exits 1 when the database read fails (got ${w.status})`);
ok(failPulse && failPulse.job === "anchor-watch" && failPulse.succeeded === 0 && failPulse.failed > 0, `watch.mjs records a failure pulse (ok:false): ${JSON.stringify(failPulse)}`);
const pulseRow = (n) => failPulse ? { job: "anchor-watch", runs: n, attempted: failPulse.attempted * n, succeeded: 0, consecutive_zero: n, last_note: failPulse.note } : {};
const one = classifyHealth([pulseRow(1)]);
ok(one.incidents.length === 1, `job-watch rules: ONE failure pulse pages (note ${JSON.stringify(failPulse && failPulse.note)}; DEAD_RUN_THRESHOLD=${DEAD_RUN_THRESHOLD})`);
const two = classifyHealth([pulseRow(DEAD_RUN_THRESHOLD)]);
ok(two.incidents.length === 1, "job-watch rules: a dead streak of DEAD_RUN_THRESHOLD pages");
const okRun = classifyHealth([{ job: "anchor-watch", runs: 1, attempted: 5, succeeded: 5, consecutive_zero: 0, last_note: "ok" }]);
ok(okRun.incidents.length === 0 && okRun.healthy.length === 1, "control: a healthy pulse does not page");

// ---- STALENESS half: real SQL on a throwaway Postgres
const binDir = (() => {
  const base = "/usr/lib/postgresql";
  if (!existsSync(base)) return null;
  const v = readdirSync(base).filter((d) => existsSync(path.join(base, d, "bin/initdb"))).sort((a, b) => Number(b) - Number(a))[0];
  return v ? path.join(base, v, "bin") : null;
})();
let sqlRan = false;
if (!binDir) {
  if (sqlOptional) console.log("test-anchor-watch-heartbeat: SQL STALENESS HALF NOT RUN (no Postgres server binaries; --sql-optional). Only the failure-pulse half was asserted.");
  else ok(false, "Postgres server binaries not found: the staleness evaluator (SQL) cannot be run. Install postgresql or pass --sql-optional.");
} else {
  const root = process.getuid && process.getuid() === 0;
  const asPg = (cmd, args, opts = {}) => (root
    ? spawnSync("runuser", ["-u", "postgres", "--", cmd, ...args], { env: ENV, encoding: "utf8", ...opts })
    : spawnSync(cmd, args, { env: ENV, encoding: "utf8", ...opts }));
  const data = path.join(tmp, "data"), sock = path.join(tmp, "s");
  spawnSync("mkdir", ["-p", sock]);
  if (root) spawnSync("chown", ["-R", "postgres", tmp]);
  const init = asPg(path.join(binDir, "initdb"), ["-D", data, "-A", "trust", "-U", "postgres", "--no-sync"]);
  const start = init.status === 0 ? asPg(path.join(binDir, "pg_ctl"), ["-D", data, "-w", "-l", path.join(tmp, "pg.log"), "-o", `-k ${sock} -c listen_addresses= -c fsync=off`, "start"]) : init;
  ok(init.status === 0 && start.status === 0, `throwaway Postgres starts (${(start.stderr || start.stdout || "").slice(-200)})`);
  if (init.status === 0 && start.status === 0) {
    try {
      const psql = (args) => asPg(path.join(binDir, "psql"), ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", sock, "-U", "postgres", "-d", "postgres", ...args]);
      const q = (sql) => { const r = psql(["-c", sql]); if (r.status !== 0) throw new Error(`psql: ${r.stderr.trim()} :: ${sql.slice(0, 120)}`); return r.stdout.trim(); };
      q("create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema cron; create function cron.schedule(text, text, text) returns bigint language sql as 'select 1::bigint';");
      // the real migrations, in version order (numeric prefix; "20260909_x" sorts BEFORE "20260909184548_x")
      const wanted = ["20260729_wf_job_pulse.sql", "20260907141934_wf_job_health_failed_preflight.sql", "20260909_wf_job_health_unavailable_is_dead.sql",
        "20260909184548_wf_heartbeat_watch.sql", "20260909191654_wf_heartbeat_expected_revenue_jobs.sql", "20260930120000_wf_heartbeat_github_monitor_tolerance.sql",
        "20261014120000_wf_heartbeat_anchor_watch.sql"];
      for (const f of wanted) {
        if (root) spawnSync("chmod", ["a+r", path.join(MIG, f)]);
        const r = psql(["-f", path.join(MIG, f)]);
        if (r.status !== 0) throw new Error(`migration ${f} failed on a clean database: ${r.stderr.trim().slice(0, 300)}`);
      }
      ok(q(`select max_staleness_minutes from public.wf_heartbeat_expected where job='anchor-watch'`) === String(MINS), "applied migration leaves the parsed tolerance in wf_heartbeat_expected");
      const overdue = () => q(`select coalesce(string_agg(job || ':' || coalesce(minutes_since::text,'never'), ',' order by job), '') from public.wf_heartbeat_overdue() where job='anchor-watch'`);
      const reset = () => q(`delete from public.wf_job_pulse; update public.wf_heartbeat_expected set created_at = now()`);
      const beat = (agoMin, att = 5, suc = 5) => q(`insert into public.wf_job_pulse (job, ran_at, attempted, succeeded, failed, note) values ('anchor-watch', now() - make_interval(mins => ${agoMin}), ${att}, ${suc}, ${att - suc}, 'test')`);
      const lastWatch = () => q(`select succeeded || '|' || note from public.wf_job_pulse where job='heartbeat-watch' order by id desc limit 1`);

      // a pulse 1h old is healthy
      reset(); beat(1 * H);
      ok(overdue() === "", `1h-old pulse: no alarm (got ${overdue()})`);
      q("select public.wf_heartbeat_watch()");
      ok(/^1\|healthy/.test(lastWatch()), `1h-old pulse: wf_heartbeat_watch() records a healthy run (${lastWatch()})`);
      // just inside tolerance: healthy; a full missed day (tolerance + 1h = 49h today): alarms
      reset(); beat(MINS - 1 * H);
      ok(overdue() === "", "a pulse 1h inside the tolerance is still healthy (a day-late GitHub run does not page)");
      reset(); beat(MINS + 1 * H);
      ok(/^anchor-watch:/.test(overdue()), `a pulse ${((MINS + H) / 60)}h old (tolerance + 1h) alarms (got ${overdue()})`);
      q("select public.wf_heartbeat_watch()");
      ok(/^0\|OVERDUE .*anchor-watch/.test(lastWatch()), `49h-old pulse: wf_heartbeat_watch() records the dead run that job-watch pages on (${lastWatch()})`);
      const hw = classifyHealth([{ job: "heartbeat-watch", runs: 2, attempted: 2, succeeded: 0, consecutive_zero: 2, last_note: lastWatch().split("|")[1] }]);
      ok(hw.incidents.length === 1, "the heartbeat-watch dead streak is an incident under the real classifyHealth");
      // 49h literal from the brief, independent of the parsed value, so a loosened tolerance is noticed
      reset(); beat(49 * H);
      ok(MINS < 49 * H ? /^anchor-watch:/.test(overdue()) : overdue() === "", `49h-old pulse behaviour matches the parsed tolerance (${MINS} min)`);

      // no pulse ever: measured from created_at (the bootstrap grace), then alarms as 'never'
      reset();
      ok(overdue() === "", "no pulse ever, just deployed: NO alarm yet (measured from created_at, grace = the tolerance)");
      q(`update public.wf_heartbeat_expected set created_at = now() - make_interval(mins => ${MINS + H}) where job='anchor-watch'`);
      ok(overdue() === "anchor-watch:never", `no pulse ever, tolerance elapsed since the row was created: alarms as 'never' (got ${overdue()})`);
      q("select public.wf_heartbeat_watch()");
      ok(/^0\|OVERDUE .*anchor-watch \(never/.test(lastWatch()), `no pulse ever: wf_heartbeat_watch() note names it (${lastWatch()})`);

      // a failure pulse is FRESH, so staleness is quiet; the failure channel is job-watch
      reset();
      if (failPulse) {
        const ins = () => q(`insert into public.wf_job_pulse (job, attempted, succeeded, failed, note) values ('anchor-watch', ${failPulse.attempted}, ${failPulse.succeeded}, ${failPulse.failed}, $n$${failPulse.note}$n$)`);
        ins();
        ok(overdue() === "", "a fresh failure pulse is not 'stale' (staleness only watches silence)");
        const health = (n) => q(`select job||'|'||consecutive_zero||'|'||attempted||'|'||succeeded||'|'||last_note from public.wf_job_health(48) where job='anchor-watch'`).split("|");
        const h1 = health(); const r1 = { job: h1[0], consecutive_zero: Number(h1[1]), attempted: Number(h1[2]), succeeded: Number(h1[3]), last_note: h1.slice(4).join("|") };
        ok(r1.consecutive_zero === 1, `wf_job_health counts the failure pulse as a dead run (consecutive_zero=${r1.consecutive_zero})`);
        ok(classifyHealth([r1]).incidents.length === 1, `wf_job_health row -> real classifyHealth: one failure pulse pages`);
        ins();
        const h2 = health(); const r2 = { job: h2[0], consecutive_zero: Number(h2[1]), attempted: Number(h2[2]), succeeded: Number(h2[3]), last_note: h2.slice(4).join("|") };
        ok(r2.consecutive_zero === 2 && classifyHealth([r2]).incidents.length === 1, "two consecutive failure pulses page");
        beat(0); // a recovered run ends the streak
        const h3 = health(); const r3 = { job: h3[0], consecutive_zero: Number(h3[1]), attempted: Number(h3[2]), succeeded: Number(h3[3]), last_note: h3.slice(4).join("|") };
        ok(r3.consecutive_zero === 0 && classifyHealth([r3]).incidents.length === 0, "a later successful run clears the incident");
      }
      sqlRan = true;
    } catch (e) {
      ok(false, "SQL half threw: " + (e && e.message || e));
    } finally {
      asPg(path.join(binDir, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"]);
    }
  }
}
try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }

if (fails.length) { console.error(`test-anchor-watch-heartbeat: ${pass} passed, ${fails.length} FAILED`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`test-anchor-watch-heartbeat: OK - ${pass} assertions (${sqlRan ? "real SQL evaluators on a throwaway Postgres" : "SQL half NOT RUN"}; tolerance ${MINS} min parsed from the migration; failure pulse from real watch.mjs)`);
