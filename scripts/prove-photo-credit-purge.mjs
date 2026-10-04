#!/usr/bin/env node
// scripts/prove-photo-credit-purge.mjs — EXECUTES the committed purge migration
// on real Postgres (PGlite, Postgres 16 in WebAssembly) and proves what
// scripts/test-photo-credit-purge.mjs can only read: only rows expired over an
// hour ago are deleted, batches are bounded, unsafe arguments are refused, and
// a sabotaged DELETE that reaches live rows is undone and recorded as a failed
// pulse. Ends with a control showing the sabotage DOES delete live rows once
// every lock is removed, so the red-proofs are real.
//
// NOT in guards.txt on purpose: PGlite is a ~25 MB package the build does not
// install. Run it by hand before applying or changing the migration:
//   npm i --no-save @electric-sql/pglite@0.2 && node scripts/prove-photo-credit-purge.mjs
// It never connects to any real database.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
let PGlite;
try { ({ PGlite } = await import("@electric-sql/pglite")); }
catch { console.error("prove-photo-credit-purge: needs @electric-sql/pglite (npm i --no-save @electric-sql/pglite@0.2)"); process.exit(2); }
const MIG = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "supabase/migrations/");
const table = fs.readFileSync(MIG + "20260924120000_wf_photo_credit.sql", "utf8");
const purgeSrc = fs.readFileSync(MIG + "20260930120000_wf_photo_credit_purge_expired.sql", "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  " + m); } else { fail++; console.log("  FAIL " + m); } };
async function fresh(purgeSql = purgeSrc) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema cron; create table cron.job(jobname text, schedule text, command text);
    create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job values (n,s,c); select 1::bigint $$;
    create table public.wf_job_pulse (id bigserial primary key, job text not null, ran_at timestamptz not null default now(), attempted int not null default 0, succeeded int not null default 0, failed int not null default 0, note text);`);
  await db.exec(table); await db.exec(purgeSql); return db;
}
const P = "ChIJtestPlaceAAAAAAAAAAAAAA";
async function seed(db, n, offsetSql, tag) {
  // captured_at is set so the 31-day check constraint holds for every row
  await db.exec(`insert into wf_photo_credit (photo_name, place_id, author_name, expires_at, captured_at)
    select 'places/${P}/photos/${tag}' || g, '${P}', 'a', now() + ${offsetSql}, now() + ${offsetSql} - interval '20 days' from generate_series(1, ${n}) g`);
}
const q = async (db, s) => (await db.query(s)).rows;
const counts = async (db) => (await q(db, `select count(*) filter (where expires_at > now())::int live, count(*) filter (where expires_at <= now())::int expired, count(*)::int total from wf_photo_credit`))[0];

console.log("1. deletes only definitely-expired rows; live and just-expired rows survive");
{ const db = await fresh();
  await seed(db, 50, "interval '10 days'", "live"); await seed(db, 3, "interval '1 second'", "edge");
  await seed(db, 30, "- interval '3 days'", "old"); await seed(db, 10, "- interval '30 minutes'", "recent");
  const n = (await q(db, "select public.wf_photo_credit_purge_expired() n"))[0].n;
  const c = await counts(db);
  ok(n === 30, `returned ${n} deleted (want 30)`);
  ok(c.live === 53, `live rows intact: ${c.live}/53`);
  ok(c.expired === 10, `rows expired < 1h ago kept (grace): ${c.expired}/10`);
  ok((await q(db, "select count(*)::int n from wf_photo_credit where photo_name like '%/old%'"))[0].n === 0, "every old expired row gone");
  const pulse = (await q(db, "select attempted, succeeded, failed, note from wf_job_pulse"))[0];
  ok(pulse.succeeded === 30 && pulse.failed === 0 && /53 live rows kept/.test(pulse.note), "pulse: " + pulse.note);
  ok((await q(db, "select schedule, command from cron.job where jobname='wf-photo-credit-purge'"))[0]?.schedule === "23 * * * *", "hourly pg_cron job registered");
  const n2 = (await q(db, "select public.wf_photo_credit_purge_expired() n"))[0].n;
  ok(n2 === 0, "second run is a no-op");
  const idle = (await q(db, "select attempted from wf_job_pulse order by id desc limit 1"))[0].attempted;
  ok(idle === 0, "idle run records attempted=0 (idle, not a failure streak)"); }

console.log("2. batch bound");
{ const db = await fresh(); await seed(db, 100, "- interval '2 days'", "old"); await seed(db, 5, "interval '1 day'", "live");
  ok((await q(db, "select public.wf_photo_credit_purge_expired(40) n"))[0].n === 40, "40 of 100 deleted with p_max_rows=40");
  await seed(db, 1, "- interval '9 days'", "oldest");
  ok((await q(db, "select public.wf_photo_credit_purge_expired(1) n"))[0].n === 1, "next batch of 1 ...");
  ok((await q(db, "select count(*)::int n from wf_photo_credit where photo_name like '%/oldest%'"))[0].n === 0, "... took the oldest expired row first");
  ok((await counts(db)).live === 5, "live rows intact"); }

console.log("3. unsafe arguments are refused");
{ const db = await fresh(); await seed(db, 5, "- interval '2 days'", "old");
  for (const [args, why] of [["5000, interval '59 minutes'", "grace under 1 hour"], ["5000, interval '-1 day'", "negative grace (would reach live rows)"], ["0", "zero rows"], ["20001", "over 20000"], ["null", "null max"], ["5000, null", "null grace"]]) {
    let threw = false; try { await db.query(`select public.wf_photo_credit_purge_expired(${args})`); } catch { threw = true; }
    ok(threw, `refused: ${why}`); }
  ok((await counts(db)).total === 5, "nothing deleted by refused calls"); }

console.log("4. RED-PROOF: sabotage the DELETE so it reaches live rows -> locks c/d undo the whole batch");
{ const broken = purgeSrc.replace("         and c.expires_at < v_cutoff\n", "").replace("       where expires_at < v_cutoff\n", "       where expires_at < now() + interval '100 days'\n");
  ok(broken !== purgeSrc && !broken.includes("where expires_at < v_cutoff\n       order"), "mutation applied (both predicates removed)");
  const db = await fresh(broken);
  await seed(db, 20, "interval '5 days'", "live"); await seed(db, 20, "- interval '5 days'", "old");
  const n = (await q(db, "select public.wf_photo_credit_purge_expired() n"))[0].n;
  const c = await counts(db);
  ok(n === 0 && c.total === 40, `batch undone: returned ${n}, ${c.total}/40 rows still present (incl. expired, whole batch rolled back)`);
  const p = (await q(db, "select attempted, succeeded, failed, note from wf_job_pulse"))[0];
  ok(p.failed === 1 && p.succeeded === 0 && /refused/.test(p.note), "refusal recorded for job-watch: " + p.note); }

console.log("5. RED-PROOF: also remove the returned-expiry check -> the live-count lock alone still undoes it");
{ let broken = purgeSrc.replace("         and c.expires_at < v_cutoff\n", "").replace("       where expires_at < v_cutoff\n", "       where expires_at < now() + interval '100 days'\n");
  broken = broken.replace("if v_deleted > 0 and not (v_newest_deleted < v_cutoff) then", "if false then");
  ok(broken.includes("if false then"), "mutation applied");
  const db = await fresh(broken); await seed(db, 20, "interval '5 days'", "live");
  await q(db, "select public.wf_photo_credit_purge_expired()");
  ok((await counts(db)).live === 20, "live rows intact"); ok(/live credits would fall/.test((await q(db, "select note from wf_job_pulse"))[0].note), "refused by live-count lock"); }

console.log("6. CONTROL: with every lock removed the sabotage DOES delete live rows (so tests 4-5 are real)");
{ let broken = purgeSrc.replace("         and c.expires_at < v_cutoff\n", "").replace("       where expires_at < v_cutoff\n", "       where expires_at < now() + interval '100 days'\n");
  broken = broken.replace("if v_deleted > 0 and not (v_newest_deleted < v_cutoff) then", "if false then").replace("if v_live_after < v_live_before then", "if false then");
  const db = await fresh(broken); await seed(db, 20, "interval '5 days'", "live");
  await q(db, "select public.wf_photo_credit_purge_expired()");
  ok((await counts(db)).live === 0, "live rows deleted when all locks are gone (control)"); }

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
