#!/usr/bin/env node
// STRUCTURAL-ONLY: the subject is plpgsql in a migration and the build has no
// Postgres to run it; behaviour is proven by scripts/prove-photo-credit-purge.mjs.
// scripts/test-photo-credit-purge.mjs — the expired photo credit purge can only
// ever delete rows that are definitely expired, and can never reach a live one.
//
// WHAT IT PROTECTS (2026-09-30). supabase/migrations/
// 20260930120000_wf_photo_credit_purge_expired.sql deletes wf_photo_credit rows
// hourly. A purge that is one operator away from `expires_at < now() + ...`
// would wipe every live credit Wayfind holds, and those can only come back
// through new paid Google calls. The function has four independent locks
// (cutoff at least 1 hour in the past, a re-check on the locked row, a check
// of every deleted row's expiry, a before/after live-row count). This guard
// pins each of them, the argument bounds, the grants and the schedule, and
// that nothing in the file can call out of the database.
//
// STRENGTH, STATED PLAINLY: this is a STATIC check of the committed SQL (the
// build has no Postgres to execute it). The function's behaviour was proven by
// executing this exact file on Postgres 16 (PGlite), with red-proofs, in the
// PR that added it. Each assertion below targets a syntactic
// position in comment-stripped SQL, not a bare substring.
//
// usage: node scripts/test-photo-credit-purge.mjs [path-to-migration.sql]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = process.argv[2] || path.join(REPO, "supabase/migrations/20260930120000_wf_photo_credit_purge_expired.sql");
const raw = readFileSync(FILE, "utf8");
// Strip `--` comments (outside string literals; this file has no `--` inside
// strings) and collapse whitespace, so prose can never satisfy an assertion.
const sql = raw.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ").toLowerCase();

let n = 0;
const fails = [];
function check(cond, msg) { n++; if (!cond) fails.push(msg); }
const count = (re) => (sql.match(new RegExp(re.source, "g")) || []).length;

// Positive control: the probe finds what must be there before any absence is trusted.
check(count(/create or replace function public\.wf_photo_credit_purge_expired\(/) === 1, "the purge function is defined exactly once");

// 1. Exactly one DELETE, and it targets only wf_photo_credit.
check(count(/\bdelete from\b/) === 1, "exactly one DELETE statement in the migration");
check(/\bdelete from public\.wf_photo_credit c using doomed d where c\.photo_name = d\.photo_name and c\.expires_at < v_cutoff returning c\.expires_at\b/.test(sql),
  "the DELETE joins on photo_name AND re-checks c.expires_at < v_cutoff on the locked row, returning each deleted expiry");
check(!/\b(truncate|drop table|drop function|alter table)\b/.test(sql), "no TRUNCATE / DROP / ALTER TABLE");

// 2. The candidate set is exactly the rows expired before the cutoff.
check(/\bdoomed as \( select photo_name from public\.wf_photo_credit where expires_at < v_cutoff order by expires_at limit p_max_rows for update skip locked \)/.test(sql),
  "candidates = expires_at < v_cutoff only, oldest first, bounded by p_max_rows, locked");

// 3. The cutoff is assigned once, and only as now() minus the grace.
check(count(/\bv_cutoff :=/) === 1 && /\bv_cutoff := now\(\) - p_grace;/.test(sql), "v_cutoff := now() - p_grace, assigned exactly once");

// 4. Argument bounds that keep the cutoff in the past and the batch bounded.
check(/if p_grace is null or p_grace < interval '1 hour' then raise exception/.test(sql), "grace under 1 hour (incl. negative, null) is refused");
check(/if p_max_rows is null or p_max_rows < 1 or p_max_rows > 20000 then raise exception/.test(sql), "p_max_rows outside 1..20000 is refused");

// 5. The two post-delete locks each raise (which undoes the batch).
check(/if v_deleted > 0 and not \(v_newest_deleted < v_cutoff\) then raise exception/.test(sql), "a deleted row not before the cutoff undoes the batch");
check(/select count\(\*\) into v_live_before from public\.wf_photo_credit where expires_at > now\(\);/.test(sql)
  && /select count\(\*\) into v_live_after from public\.wf_photo_credit where expires_at > now\(\); if v_live_after < v_live_before then raise exception/.test(sql),
  "live rows are counted before and after with the same predicate, and a drop undoes the batch");

// 6. The locks live inside one subtransaction whose handler records a failure and deletes nothing.
{
  const blockStart = sql.indexOf("begin select count(*) into v_live_before");
  const handler = sql.indexOf("exception when others then", blockStart);
  const del = sql.indexOf("delete from public.wf_photo_credit");
  check(blockStart > 0 && del > blockStart && handler > del, "the DELETE and both checks sit inside the begin/exception block");
  check(/exception when others then insert into public\.wf_job_pulse \(job, attempted, succeeded, failed, note\) values \('photo-credit-purge', 1, 0, 1,/.test(sql)
    && /'purge undone, nothing deleted: ' \|\| sqlerrm, 300\)\); return 0; end;/.test(sql),
    "a refused batch is rolled back and recorded as failed=1 in wf_job_pulse (job-watch pages on it)");
}

// 7. Only the server can run it.
check(/revoke all on function public\.wf_photo_credit_purge_expired\(integer, interval\) from public, anon, authenticated;/.test(sql), "EXECUTE revoked from public, anon, authenticated");
{
  const grants = sql.match(/grant execute on function public\.wf_photo_credit_purge_expired\(integer, interval\) to ([^;]+);/g) || [];
  check(grants.length === 1 && /to service_role, postgres;$/.test(grants[0]), "EXECUTE granted only to service_role and postgres");
}

// 8. The schedule calls it with safe literal arguments.
{
  const m = /select cron\.schedule\('wf-photo-credit-purge', '([^']+)', \$\$select public\.wf_photo_credit_purge_expired\((\d+), interval '(\d+) (hour|hours|day|days)'\)\$\$\);/.exec(sql);
  check(!!m, "pg_cron job wf-photo-credit-purge calls the function with literal (rows, interval)");
  if (m) {
    check(m[1] === "23 * * * *", `schedule is hourly at :23 (got ${m[1]})`);
    const rows = Number(m[2]);
    check(rows >= 1 && rows <= 20000, `scheduled batch within 1..20000 (got ${rows})`);
    const hours = Number(m[3]) * (m[4].startsWith("day") ? 24 : 1);
    check(hours >= 1, `scheduled grace at least 1 hour (got ${hours}h)`);
  }
  check(count(/cron\.schedule\(/) === 1, "exactly one pg_cron job");
}

// 9. Nothing in the file can make a network call (so, no Google spend).
check(!/\b(net\.http_|http_get|http_post|pg_net|dblink|googleapis)\b/.test(sql), "no network or Google call anywhere in the migration");

if (fails.length) {
  console.error(`test-photo-credit-purge: FAIL (${fails.length}/${n})\n  - ` + fails.join("\n  - "));
  process.exit(1);
}
console.log(`test-photo-credit-purge: OK — ${n} static assertions on the committed purge SQL (one DELETE, expired-only candidates, cutoff >= 1h in the past, re-check + returned-expiry + live-count locks, rollback recorded as a failed pulse, service-only EXECUTE, hourly schedule with safe literals, no network)`);
