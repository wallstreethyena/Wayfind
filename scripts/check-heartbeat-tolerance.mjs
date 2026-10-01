#!/usr/bin/env node
// scripts/check-heartbeat-tolerance.mjs — a GitHub-scheduled monitor's
// heartbeat tolerance must sit above GitHub's MEASURED worst gap.
//
// 2026-09-30: heartbeat-watch paged the owner "photo-monitor OVERDUE (371min vs
// 240min max)" while photo-monitor was green on every run. GitHub started that
// "hourly" workflow with a median gap of 261 minutes and a worst gap of 516
// (2026-09-16..30), so a 240-minute tolerance went dead on ordinary behaviour.
// See supabase/migrations/20260930120000_wf_heartbeat_github_monitor_tolerance.sql.
//
// What this checks, by EXECUTING the table's history rather than grepping one
// file: every migration that writes public.wf_heartbeat_expected is replayed
// in filename order (insert ... values rows, insert-where-not-exists rows,
// and `update ... set max_staleness_minutes = N ... where job in (...)`) into
// an in-memory table. Then every job a scheduled GitHub workflow beats
// (`record-workflow-pulse.mjs --job=X` in the workflow, or `recordPulse("X")`
// in a script the workflow runs) must be present in that table with a
// tolerance >= MEASURED_WORST_GAP_MIN.
//
// STRUCTURAL-ONLY: the protected thing is SQL applied to production Postgres,
// which prebuild cannot reach; the migrations are replayed by a quote-aware
// statement parser with positive controls for each shape. Real execution was
// proven once against local Postgres 16 (see the PR for the psql output).
// Hermetic: reads repo files only. It cannot read the live table — the
// migration must still be APPLIED to production for the page to stop.
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

// Worst gap between consecutive scheduled runs, 2026-09-16..30, across
// photo-monitor (516.3), canary (510.9) and synthetic-monitor (514.1).
export const MEASURED_WORST_GAP_MIN = 517;

// Quote-aware: splits on `;` and drops `--` / `/* */` comments only OUTSIDE
// '...' literals, so a note like 'hourly at :50; */30' survives intact.
export function splitSqlStatements(sql) {
  const out = [];
  let cur = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], n = sql[i + 1];
    if (c === "'") {
      let j = i + 1;
      for (; j < sql.length; j++) { if (sql[j] === "'") { if (sql[j + 1] === "'") { j++; continue; } break; } }
      cur += sql.slice(i, j + 1); i = j; continue;
    }
    if (c === "-" && n === "-") { while (i < sql.length && sql[i] !== "\n") i++; cur += "\n"; continue; }
    if (c === "/" && n === "*") { const e = sql.indexOf("*/", i + 2); i = e < 0 ? sql.length : e + 1; cur += " "; continue; }
    if (c === ";") { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const stripSqlComments = (sql) => splitSqlStatements(sql).join(";\n");

// Replays one migration's writes to wf_heartbeat_expected into `table`
// (Map job -> minutes). Insert rows use the column order (job, minutes, ...).
// An `on conflict ... do update` insert overwrites; a plain / where-not-exists
// insert only fills jobs that are absent.
export function applyHeartbeatSql(table, rawSql) {
  for (const s of splitSqlStatements(rawSql)) {
    if (/^insert\s+into\s+public\.wf_heartbeat_expected\b/i.test(s)) {
      const overwrite = /on\s+conflict\s*\(\s*job\s*\)\s*do\s+update/i.test(s);
      for (const m of s.matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*(\d+)\s*,/gi)) {
        if (overwrite || !table.has(m[1])) table.set(m[1], Number(m[2]));
      }
    } else if (/^update\s+public\.wf_heartbeat_expected\b/i.test(s)) {
      const mins = /set[\s\S]*?max_staleness_minutes\s*=\s*(\d+)/i.exec(s);
      // The WHERE is the statement's last clause; match it at the end so a
      // literal elsewhere in the SET list can never be read as the filter.
      const where = /\bwhere\s+job\s+in\s*\(([^)]*)\)\s*$/i.exec(s) || /\bwhere\s+job\s*=\s*('[^']+')\s*$/i.exec(s);
      if (!mins || !where) throw new Error("unparseable wf_heartbeat_expected update: " + s.slice(0, 120));
      for (const j of where[1].matchAll(/'([a-z0-9-]+)'/gi)) if (table.has(j[1])) table.set(j[1], Number(mins[1]));
    }
  }
  return table;
}

export function replayMigrations(files) {
  const table = new Map();
  for (const { name, sql } of files) {
    if (!/wf_heartbeat_expected/.test(stripSqlComments(sql))) continue;
    try { applyHeartbeatSql(table, sql); } catch (e) { throw new Error(name + ": " + e.message); }
  }
  return table;
}

// Jobs that a SCHEDULED GitHub workflow beats.
export function githubScheduledPulseJobs() {
  const jobs = new Set();
  const dir = new URL(".github/workflows/", ROOT);
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    const y = read(".github/workflows/" + f).replace(/^\s*#.*$/gm, "");
    if (!/^\s*schedule\s*:/m.test(y) || !/^\s*-\s*cron\s*:/m.test(y)) continue;
    for (const m of y.matchAll(/record-workflow-pulse\.mjs\s+--job=([a-z0-9-]+)/gi)) jobs.add(m[1]);
    for (const m of y.matchAll(/node\s+(scripts\/[\w./-]+\.mjs)/g)) {
      if (/record-workflow-pulse/.test(m[1])) continue;
      let src = "";
      try { src = read(m[1]); } catch { continue; }
      for (const p of src.matchAll(/\brecordPulse\(\s*"([a-z0-9-]+)"/g)) jobs.add(p[1]);
    }
  }
  return jobs;
}

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const migDir = new URL("supabase/migrations/", ROOT);
const files = readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()
  .map((name) => ({ name, sql: read("supabase/migrations/" + name) }));

// Positive controls: the replay understands each statement shape it will meet.
{
  const t = applyHeartbeatSql(new Map(), "insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note) values ('a', 240, 'x'), ('b', 360, 'y') on conflict (job) do update set max_staleness_minutes = excluded.max_staleness_minutes;");
  ok(t.get("a") === 240 && t.get("b") === 360, "control: insert ... values rows are replayed");
  applyHeartbeatSql(t, "insert into public.wf_heartbeat_expected (job, max_staleness_minutes, note) select v.job, v.mins, v.note from (values ('a', 999, 'z'), ('c', 60, 'w')) as v(job, mins, note) where not exists (select 1);");
  ok(t.get("a") === 240 && t.get("c") === 60, "control: a where-not-exists insert fills new jobs and never overwrites");
  applyHeartbeatSql(t, "update public.wf_heartbeat_expected set max_staleness_minutes = 720, note = case job when 'a' then 'n' end where job in ('a', 'b');");
  ok(t.get("a") === 720 && t.get("b") === 720 && t.get("c") === 60, "control: an update ... where job in (...) changes exactly the named jobs");
  ok(splitSqlStatements("update x set note = 'a; -- b */30' where job in ('q'); select 1 -- c; d\n;").length === 2,
    "control: a ';' or '--' inside a string literal neither splits a statement nor starts a comment");
}

// Negative control: the table as it stood BEFORE 20260930120000 is the state
// that paged on 2026-09-30 — the check must reject it.
{
  const before = replayMigrations(files.filter((f) => f.name < "20260930120000"));
  ok(before.get("photo-monitor") === 240, `control: pre-fix history must replay photo-monitor at 240 (the paging value), got ${before.get("photo-monitor")}`);
  ok([...githubScheduledPulseJobs()].some((j) => (before.get(j) || 0) < MEASURED_WORST_GAP_MIN),
    "control: the pre-fix table must fail this check — otherwise the check cannot see the incident");
}

const table = replayMigrations(files);
const jobs = githubScheduledPulseJobs();
ok(jobs.has("canary") && jobs.has("synthetic-monitor") && jobs.has("photo-monitor"),
  `the scan must find the three known GitHub-scheduled monitors, found [${[...jobs].join(", ")}]`);
for (const job of jobs) {
  const mins = table.get(job);
  ok(mins != null, `${job} beats from a scheduled GitHub workflow but has no wf_heartbeat_expected row — its silence would never page`);
  ok(mins == null || mins >= MEASURED_WORST_GAP_MIN,
    `${job} tolerance ${mins}min is below GitHub's measured worst gap (${MEASURED_WORST_GAP_MIN}min) — heartbeat-watch will page on ordinary scheduling`);
}
// The Vercel-scheduled rows are not this file's business, but a GitHub fix must
// not have loosened them by accident.
ok(table.get("promote-index") === 60 && table.get("job-watch") === 180,
  `Vercel job tolerances must be unchanged (promote-index 60, job-watch 180), got ${table.get("promote-index")}/${table.get("job-watch")}`);

if (fail.length) {
  console.error(`check-heartbeat-tolerance: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-heartbeat-tolerance: OK — ${pass} assertions; ${jobs.size} GitHub-scheduled monitors [${[...jobs].sort().join(", ")}] each >= ${MEASURED_WORST_GAP_MIN}min, replayed from ${files.filter((f) => /wf_heartbeat_expected/.test(stripSqlComments(f.sql))).length} migrations`);
