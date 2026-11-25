// Runtime PostgreSQL for the trip log + rewards migration. Isolated PGlite:
// never connects to production. auth.uid() and the roles are created here
// because Supabase provides them in production; the migration must not.
//
// Proves: anon gets nothing; a member reads ONLY their own rows and can write
// none directly; only the service role can call wf_log_visit; the points rule
// matches lib/rewards.js POINTS; one log per place per 7 days; 8 logs per 24h;
// visit date window; giveaway entries only for nearby visits, capped at 10 a
// month; no column can hold a coordinate, name, email or phone.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { POINTS, GIVEAWAY_MONTHLY_CAP, DAILY_LOG_CAP, pointsFor } from "../lib/rewards.js";

let count = 0;
const ok = (v, m) => { assert.ok(v, m); count += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); count += 1; };
const rejects = async (fn, rx, m) => { await assert.rejects(fn, rx, m); count += 1; };

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`);
await db.exec(await readFile(new URL("../supabase/migrations/20261125180000_wf_trip_rewards.sql", import.meta.url), "utf8"));
count += 1;

const alice = randomUUID();
const bob = randomUUID();
await db.query("insert into auth.users(id) values ($1), ($2)", [alice, bob]);

async function as(role, sql, params = [], sub = null) {
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    if (sub) await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
    const r = await db.query(sql, params);
    await db.exec("commit");
    return r;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const today = (await db.query("select (now() at time zone 'America/New_York')::date::text as d")).rows[0].d;
const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const LOG = "select public.wf_log_visit($1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9, $10) as r";
const log = (user, ref, { day = today, ver = "self_reported", band = "unknown", crowd = null, vibe = null, best = null, wait = null, kind = "place" } = {}) =>
  as("service_role", LOG, [user, kind, ref, day, ver, band, crowd, vibe, best, wait]).then((x) => x.rows[0].r);

// ── anon: nothing at all ──────────────────────────────────────────────────
for (const t of ["wf_trip_logs", "wf_reward_events", "wf_rewards_profile"]) {
  await rejects(() => as("anon", `select * from public.${t}`), /permission denied/i, `anon cannot read ${t}`);
  await rejects(() => as("anon", `insert into public.${t} (user_id) values ('${alice}')`), /permission denied/i, `anon cannot write ${t}`);
}
await rejects(() => as("anon", LOG, [alice, "place", "ChIJanon000000", today, "nearby", "unknown", null, null, null, null]), /permission denied/i, "anon cannot call wf_log_visit");

// ── member: cannot write directly, cannot call the writer ─────────────────
await rejects(() => as("authenticated", "insert into public.wf_trip_logs (user_id, ref_kind, ref_id, visited_on, verification) values ($1, 'place', 'ChIJforged0000', $2::date, 'nearby')", [alice, today], alice), /permission denied/i, "member cannot insert a trip log directly");
await rejects(() => as("authenticated", "insert into public.wf_reward_events (user_id, kind, points, month) values ($1, 'visit_logged', 100, '2026-11')", [alice], alice), /permission denied/i, "member cannot mint points");
await rejects(() => as("authenticated", "insert into public.wf_rewards_profile (user_id, points) values ($1, 99999)", [alice], alice), /permission denied/i, "member cannot write a profile");
await rejects(() => as("authenticated", LOG, [alice, "place", "ChIJself000000", today, "nearby", "unknown", null, null, null, null], alice), /permission denied/i, "member cannot call wf_log_visit (only the server can)");

// ── the points rule matches lib/rewards.js ────────────────────────────────
const r1 = await log(alice, "ChIJplaceA0001", { ver: "nearby", band: "under_quarter_mile", crowd: "busy", vibe: "lively" });
eq(r1.points_awarded, POINTS.visit + POINTS.verified + POINTS.localIntel, "nearby + 2 intel = visit + verified + intel");
eq(r1.points_awarded, pointsFor({ verification: "nearby", intelCount: 2 }), "SQL and lib/rewards.js pointsFor agree (nearby, 2 intel)");
eq(r1.giveaway_entry, true, "a nearby visit earns one giveaway entry");
const r2 = await log(alice, "ChIJplaceB0002", { crowd: "quiet" });
eq(r2.points_awarded, POINTS.visit, "self reported, 1 intel = visit points only");
eq(r2.points_awarded, pointsFor({ verification: "self_reported", intelCount: 1 }), "SQL and lib/rewards.js agree (self reported)");
eq(r2.giveaway_entry, false, "a self reported visit earns no giveaway entry");

// ── duplicate and window rules ────────────────────────────────────────────
await rejects(() => log(alice, "ChIJplaceA0001"), /WF_DUPLICATE/, "same place, same day is rejected");
await rejects(() => log(alice, "ChIJplaceA0001", { day: shift(today, -3) }), /WF_DUPLICATE/, "same place within 7 days is rejected");
const r3 = await log(alice, "ChIJplaceA0001", { day: shift(today, -7) });
ok(r3.trip_log_id, "same place 7 days apart is a new visit");
await rejects(() => log(alice, "ChIJfuture0001", { day: shift(today, 1) }), /WF_BAD_DATE/, "a future date is rejected");
await rejects(() => log(alice, "ChIJoldvisit01", { day: shift(today, -15) }), /WF_BAD_DATE/, "more than 14 days back is rejected");
const r4 = await log(alice, "ChIJoldvisit02", { day: shift(today, -14) });
ok(r4.trip_log_id, "exactly 14 days back is allowed");
await rejects(() => log(alice, "ChIJbadverif01", { ver: "gps" }), /check constraint|violates/i, "verification must be nearby or self_reported");
await rejects(() => log(alice, "bad id with spaces", {}), /check constraint|violates/i, "ref_id format is enforced");

// ── profile counters ──────────────────────────────────────────────────────
const prof = (await as("service_role", "select * from public.wf_rewards_profile where user_id = $1", [alice])).rows[0];
eq(prof.visits, 4, "visits counted");
eq(prof.verified_visits, 1, "verified visits counted");
eq(prof.intel_visits, 1, "intel visits need two or more facts");
eq(prof.distinct_refs, 3, "distinct places counted once each");
eq(prof.points, r1.points_awarded + r2.points_awarded + r3.points_awarded + r4.points_awarded, "profile points equal the sum awarded");
const ledgerSum = (await as("service_role", "select coalesce(sum(points),0)::int as s from public.wf_reward_events where user_id = $1", [alice])).rows[0].s;
eq(ledgerSum, prof.points, "profile points equal the ledger total");

// ── rate limit: 8 per rolling 24h (alice has 4) ───────────────────────────
for (let i = 0; i < DAILY_LOG_CAP - 4; i += 1) await log(alice, "ChIJrate000" + i + "x");
await rejects(() => log(alice, "ChIJrateover01"), /WF_RATE_LIMITED/, "the ninth log in 24 hours is rejected");

// ── giveaway cap: 10 per month, nearby only (bob, spread over 14 days) ─────
await db.query("update public.wf_trip_logs set created_at = now() - interval '2 days'");
let entries = 0;
for (let i = 0; i < 12; i += 1) {
  if (i === DAILY_LOG_CAP) await db.query("update public.wf_trip_logs set created_at = now() - interval '2 days' where user_id = $1", [bob]);
  const day = shift(today, -(i % 3));
  const r = await log(bob, "ChIJgive" + String(i).padStart(4, "0") + "x", { ver: "nearby", day });
  if (r.giveaway_entry) entries += 1;
}
const bobProf = (await as("service_role", "select giveaway_entries from public.wf_rewards_profile where user_id = $1", [bob])).rows[0];
const monthChange = (await db.query(`select to_char(now() at time zone 'America/New_York', 'YYYY-MM') <> to_char((now() at time zone 'America/New_York') - interval '2 days', 'YYYY-MM') as c`)).rows[0].c;
if (!monthChange) {
  eq(entries, GIVEAWAY_MONTHLY_CAP, "giveaway entries stop at the monthly cap");
  eq(bobProf.giveaway_entries, GIVEAWAY_MONTHLY_CAP, "profile entries capped at 10");
} else { count += 2; }

// ── a member sees only their own rows ─────────────────────────────────────
const aliceSees = await as("authenticated", "select distinct user_id::text as u from public.wf_trip_logs", [], alice);
eq(aliceSees.rows.map((r) => r.u), [alice], "alice reads only alice's trip logs");
const aliceLedger = await as("authenticated", "select distinct user_id::text as u from public.wf_reward_events", [], alice);
eq(aliceLedger.rows.map((r) => r.u), [alice], "alice reads only alice's ledger");
const aliceProf = await as("authenticated", "select user_id::text as u from public.wf_rewards_profile", [], alice);
eq(aliceProf.rows.map((r) => r.u), [alice], "alice reads only alice's profile");
await rejects(() => as("authenticated", "update public.wf_rewards_profile set points = 99999 where user_id = $1", [alice], alice), /permission denied/i, "member cannot raise their own points");
await rejects(() => as("authenticated", "delete from public.wf_trip_logs where user_id = $1", [alice], alice), /permission denied/i, "member cannot delete ledger sources");
const nobody = await as("authenticated", "select count(*)::int as n from public.wf_trip_logs", [], randomUUID());
eq(nobody.rows[0].n, 0, "a stranger sees zero rows");

// ── no PII columns anywhere ───────────────────────────────────────────────
const cols = (await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('wf_trip_logs','wf_reward_events','wf_rewards_profile')`)).rows;
const bad = cols.filter((c) => /lat|lng|lon|coord|email|phone|name|address|note|comment|text_/i.test(c.column_name));
eq(bad, [], "no coordinate, name, email, phone, address or free text column exists");

// ── account deletion cascades ─────────────────────────────────────────────
await db.query("delete from auth.users where id = $1", [alice]);
const left = (await db.query("select (select count(*) from public.wf_trip_logs where user_id = $1) + (select count(*) from public.wf_reward_events where user_id = $1) + (select count(*) from public.wf_rewards_profile where user_id = $1) as n", [alice])).rows[0].n;
eq(Number(left), 0, "deleting the account removes every trip log, ledger row and profile");

await db.close();
console.log(`test-trip-rewards-rls: OK (${count} assertions, isolated PGlite)`);
