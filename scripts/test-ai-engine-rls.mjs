// Runtime PostgreSQL for the AI engine migration (20261127150000). Isolated
// PGlite on top of the trip rewards migration: never connects to production.
//
// Proves: anon reads only PUBLISHED templates and nothing else; a member reads
// only their own guides and can write nothing; push subscriptions and AI usage
// are service role only; wf_award_guide pays once per guide and at most 3 a
// month; wf_ai_user_take stops at its cap; the leaderboard lists only opted in
// members with a public name; public names are unique case blind and limited
// to safe characters.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

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
await db.exec(await readFile(new URL("../supabase/migrations/20261127150000_wf_ai_engine_community.sql", import.meta.url), "utf8"));
// Idempotent: a second apply must not fail.
await db.exec(await readFile(new URL("../supabase/migrations/20261127150000_wf_ai_engine_community.sql", import.meta.url), "utf8"));
count += 1;

const alice = randomUUID(), bob = randomUUID(), carol = randomUUID();
await db.query("insert into auth.users(id) values ($1), ($2), ($3)", [alice, bob, carol]);

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
const H = "a".repeat(64);
const stops = JSON.stringify([{ kind: "place", ref_id: "ChIJa" }, { kind: "place", ref_id: "ChIJb" }, { kind: "place", ref_id: "ChIJc" }]);
const guide = (user, key, slug, status = "published") => as("service_role",
  "insert into public.wf_community_guides (user_id, itinerary_key, slug, status, title, city, stops, source_hash) values ($1, $2, $3, $4, 'A day in Tampa', 'Tampa', $5::jsonb, $6) returning id",
  [user, key, slug, status, stops, H]).then((r) => r.rows[0].id);

// ── guides ────────────────────────────────────────────────────────────────
const g1 = await guide(alice, "k1", "tampa-day-aaa111");
const gBob = await guide(bob, "k1", "tampa-day-bbb222");
await rejects(() => as("anon", "select * from public.wf_community_guides"), /permission denied/i, "anon cannot read guides directly");
eq((await as("authenticated", "select slug from public.wf_community_guides", [], alice)).rows.map((r) => r.slug), ["tampa-day-aaa111"], "a member sees only their own guides");
await rejects(() => as("authenticated", "update public.wf_community_guides set title = 'hacked' where id = $1", [g1], alice), /permission denied/i, "a member cannot edit a guide directly");
await rejects(() => as("authenticated", "insert into public.wf_community_guides (user_id, itinerary_key, slug, title, city, stops, source_hash) values ($1, 'k9', 'x-y-z', 'T T', 'Tampa', $2::jsonb, $3)", [alice, stops, H], alice), /permission denied/i, "a member cannot publish around the server");
await rejects(() => guide(alice, "k2", "Bad Slug!"), /check/i, "slugs are url safe");
await rejects(() => as("service_role", "insert into public.wf_community_guides (user_id, itinerary_key, slug, title, city, stops, source_hash) values ($1, 'k3', 'too-few', 'T T', 'Tampa', '[{\"a\":1}]'::jsonb, $2)", [alice, H]), /check/i, "a guide needs at least 3 stops");
await rejects(() => guide(alice, "k1", "dup-key-ccc333"), /duplicate|unique/i, "one guide per trip");

// ── templates ─────────────────────────────────────────────────────────────
await as("service_role", "insert into public.wf_itinerary_templates (slug, metro, city, theme, title, stops, input_hash) values ('tampa-perfect-day', 'tampa', 'Tampa', 'perfect_day', 'A day', $1::jsonb, $2)", [stops, H]);
await as("service_role", "insert into public.wf_itinerary_templates (slug, metro, city, theme, title, stops, input_hash, status) values ('miami-old', 'miami_dade', 'Miami', 'perfect_day', 'Old', $1::jsonb, $2, 'retired')", [stops, H]);
eq((await as("anon", "select slug from public.wf_itinerary_templates order by slug")).rows.map((r) => r.slug), ["tampa-perfect-day"], "anon reads published templates only");
await rejects(() => as("anon", "insert into public.wf_itinerary_templates (slug, metro, city, theme, title, stops, input_hash) values ('x-y', 'tampa', 'T', 'perfect_day', 'T T', $1::jsonb, $2)", [stops, H]), /permission denied/i, "anon cannot write templates");

// ── service role only tables ──────────────────────────────────────────────
for (const t of ["wf_web_push_subscriptions", "wf_ai_user_usage"]) {
  await rejects(() => as("anon", `select * from public.${t}`), /permission denied/i, `anon cannot read ${t}`);
  await rejects(() => as("authenticated", `select * from public.${t}`, [], alice), /permission denied/i, `a member cannot read ${t}`);
}
await rejects(() => as("service_role", "insert into public.wf_web_push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'http://evil.example/x', $2, $3)", [alice, "B".repeat(87), "A".repeat(22)]), /check/i, "push endpoints must be https");

// ── per member AI limit ───────────────────────────────────────────────────
const take = () => as("service_role", "select public.wf_ai_user_take($1, 'guide_write', 2) as g", [alice]).then((r) => r.rows[0].g);
eq([await take(), await take(), await take()], [true, true, false], "the per member daily cap stops at its limit");
await rejects(() => as("authenticated", "select public.wf_ai_user_take($1, 'guide_write', 99)", [alice], alice), /permission denied/i, "a member cannot grant themselves calls");

// ── guide points: once per guide, 3 a month ───────────────────────────────
const award = (user, id) => as("service_role", "select public.wf_award_guide($1, $2) as r", [user, id]).then((r) => r.rows[0].r);
eq((await award(alice, g1)).awarded, true, "a published guide earns points");
eq((await award(alice, g1)).reason, "already_awarded", "the same guide never pays twice");
eq((await award(alice, gBob)).reason, "not_published", "a member cannot claim someone else's guide");
const g2 = await guide(alice, "k4", "tampa-two-ddd444"), g3 = await guide(alice, "k5", "tampa-three-eee555"), g4 = await guide(alice, "k6", "tampa-four-fff666");
eq([(await award(alice, g2)).awarded, (await award(alice, g3)).awarded], [true, true], "second and third guides pay");
eq((await award(alice, g4)).reason, "monthly_cap", "the fourth guide this month does not");
const held = await guide(alice, "k7", "tampa-held-ggg777", "held");
eq((await award(alice, held)).reason, "not_published", "a held guide earns nothing");
const prof = (await as("service_role", "select points, guides_published from public.wf_rewards_profile where user_id = $1", [alice])).rows[0];
eq([prof.points, prof.guides_published], [60, 3], "60 points and 3 guides on the profile");
await rejects(() => as("authenticated", "select public.wf_award_guide($1, $2)", [alice, g4], alice), /permission denied/i, "a member cannot award themselves");

// ── leaderboard ───────────────────────────────────────────────────────────
await as("service_role", "select public.wf_log_visit($1::uuid, 'place', 'ChIJbobvisit01', (now() at time zone 'America/New_York')::date, 'nearby', 'under_quarter_mile', null, null, null, null)", [bob]);
await as("service_role", "insert into public.wf_rewards_profile (user_id) values ($1) on conflict do nothing", [carol]);
await as("service_role", "update public.wf_rewards_profile set public_name = 'Sunny', leaderboard_opt_in = true where user_id = $1", [alice]);
await as("service_role", "update public.wf_rewards_profile set public_name = 'Bob B', leaderboard_opt_in = false where user_id = $1", [bob]);
const month = (await db.query("select to_char(now() at time zone 'America/New_York', 'YYYY-MM') as m")).rows[0].m;
const board = (await as("service_role", "select public_name, points from public.wf_leaderboard($1, 25)", [month])).rows;
eq(board.map((r) => [r.public_name, Number(r.points)]), [["Sunny", 60]], "only opted in members with a name appear");
await as("service_role", "update public.wf_rewards_profile set leaderboard_opt_in = true where user_id = $1", [bob]);
eq((await as("service_role", "select public_name from public.wf_leaderboard($1, 25)", [month])).rows.map((r) => r.public_name), ["Sunny", "Bob B"], "ranked by this month's points");
await rejects(() => as("service_role", "update public.wf_rewards_profile set public_name = 'SUNNY' where user_id = $1", [carol]), /duplicate|unique/i, "public names are unique, case blind");
await rejects(() => as("service_role", "update public.wf_rewards_profile set public_name = '<b>x</b>' where user_id = $1", [carol]), /check/i, "public names allow safe characters only");
await rejects(() => as("anon", "select * from public.wf_leaderboard($1, 25)", [month]), /permission denied/i, "anon cannot call the leaderboard function directly");
eq((await as("service_role", "select count(*)::int as n from public.wf_leaderboard('bad', 25)")).rows[0].n, 0, "a malformed month returns nothing");

// ── the reward kind constraint still guards the ledger ───────────────────
await rejects(() => as("service_role", "insert into public.wf_reward_events (user_id, kind, points, month) values ($1, 'free_points', 10, $2)", [alice, month]), /check/i, "unknown reward kinds are refused");

console.log(`test-ai-engine-rls: ${count} assertions passed`);
