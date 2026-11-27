// Wayfind Live Trips — the migration on an isolated in-memory PostgreSQL
// (PGlite). Production is never contacted. Supabase's auth.uid(), the
// realtime schema, realtime.topic() and realtime.send() are stubbed here the
// way Supabase provides them; the migration itself must not define them.
//
// Proves: clients can never read or write trips; a user reads only their own
// membership rows; the commit function is service-role only, compare-and-swap
// on revision, idempotency ids capped at 500, ended trips refuse edits, and the
// broadcast is written in the SAME transaction as the save (and only then);
// the private channel admits members only, members may send presence but no
// client may send a broadcast.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { stateFromTrip, applyOps, formatHlc, checksum } from "../lib/liveTrip.js";

let count = 0;
const ok = (v, label) => { assert.ok(v, label); count += 1; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); count += 1; };
const rejects = async (fn, re, label) => { await assert.rejects(fn, re, label); count += 1; };

const MIGRATION = "../supabase/migrations/20261127140000_wf_live_trips.sql";
const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;

    create schema realtime;
    create table realtime.messages (
      id bigserial primary key, topic text not null, extension text not null,
      payload jsonb, event text, private boolean default true, inserted_at timestamptz default now()
    );
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql stable
      as $$ select nullif(current_setting('realtime.topic', true), '') $$;
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
      returns void language plpgsql as $$
      begin insert into realtime.messages(topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private); end $$;
    grant usage on schema realtime to anon, authenticated, service_role;
    grant select, insert on realtime.messages to authenticated, service_role;
    grant usage on sequence realtime.messages_id_seq to authenticated, service_role;
    grant execute on function realtime.topic() to authenticated, service_role;
    grant execute on function realtime.send(jsonb, text, text, boolean) to service_role;
  `);
  const sql = await readFile(new URL(MIGRATION, import.meta.url), "utf8");
  ok(!/create\s+(or\s+replace\s+)?function\s+(auth|realtime)\./i.test(sql), "the migration does not redefine Supabase-owned functions");
  await db.exec(sql);
  await db.exec(sql); // idempotent re-run (if not exists / or replace / drop policy if exists)
  count += 1;

  const owner = randomUUID();
  const friend = randomUUID();
  const stranger = randomUUID();
  await db.query("insert into auth.users(id) values ($1), ($2), ($3)", [owner, friend, stranger]);

  const tx = async (setup, q, params = []) => {
    await db.exec("begin");
    try {
      for (const s of setup) await db.query(s[0], s[1] || []);
      const r = await db.query(q, params);
      await db.exec("commit");
      return r;
    } catch (e) { await db.exec("rollback"); throw e; }
  };
  const asUser = (uid, q, params, topic = null) => tx([
    ["set local role authenticated"],
    ["select set_config('request.jwt.claim.sub', $1, true)", [uid]],
    ["select set_config('realtime.topic', $1, true)", [topic || ""]],
  ], q, params);
  const asRole = (role, q, params) => tx([[`set local role ${role}`]], q, params);

  const state0 = stateFromTrip({ title: "Miami weekend", city: "Miami", state: "FL", items: [{ id: "a", place: { id: "a", name: "Joe's" }, order: 0 }] }, owner);
  const ins = await asRole("service_role",
    "insert into public.wf_live_trips(owner_id, state, invite_secret) values ($1, $2, $3) returning id, revision, status, invite_version",
    [owner, state0, "ab".repeat(32)]);
  const tripId = ins.rows[0].id;
  eq([ins.rows[0].revision, ins.rows[0].status, ins.rows[0].invite_version], [0, "live", 1], "defaults: revision 0, live, invite version 1");
  await asRole("service_role", "insert into public.wf_live_trip_members(trip_id, user_id, role, display_name) values ($1, $2, 'owner', 'Gabe'), ($1, $3, 'editor', 'Maria')", [tripId, owner, friend]);

  // ── no client access to trip rows ──
  await rejects(() => asRole("anon", "select * from public.wf_live_trips"), /permission denied/i, "anon cannot read trips");
  await rejects(() => asUser(owner, "select * from public.wf_live_trips"), /permission denied/i, "even the owner cannot read trip rows directly");
  await rejects(() => asUser(owner, "update public.wf_live_trips set revision = 99"), /permission denied/i, "no client writes");
  await rejects(() => asRole("anon", "select * from public.wf_live_trip_members"), /permission denied/i, "anon cannot read members");
  eq((await asUser(friend, "select user_id from public.wf_live_trip_members")).rows.map((r) => r.user_id), [friend], "a member sees only their own membership row");
  eq((await asUser(stranger, "select user_id from public.wf_live_trip_members")).rows, [], "a stranger sees no membership rows");
  await rejects(() => asUser(stranger, "insert into public.wf_live_trip_members(trip_id, user_id) values ($1, $2)", [tripId, stranger]), /permission denied/i, "nobody can add themselves");
  await rejects(() => asUser(owner, "select public.wf_live_trip_commit($1, 0, '{}'::jsonb, '{}', '{}'::jsonb)", [tripId]), /permission denied/i, "clients cannot call the commit function");
  await rejects(() => asRole("service_role", "insert into public.wf_live_trips(owner_id, state, invite_secret) values ($1, '{}'::jsonb, 'short')", [owner]), /check constraint/i, "invite secret must be 32 random bytes");

  // ── commit: compare-and-swap + idempotency + same-transaction broadcast ──
  const op = { id: "op-commit-0001", hlc: formatHlc(1700000000000, 0, "dev1"), type: "set", itemId: "a", field: "note", value: "book a table", by: friend };
  const s1 = applyOps(state0, [op]).state;
  const commit = (rev, st, ids, payload) => asRole("service_role", "select public.wf_live_trip_commit($1, $2, $3, $4, $5) as r", [tripId, rev, st, ids, payload]).then((x) => x.rows[0].r);
  eq(await commit(0, s1, [op.id], { v: 1, ops: [op], checksum: checksum(s1) }), { revision: 1 }, "first commit succeeds at revision 1");
  const stale = await commit(0, s1, ["op-commit-0002"], { v: 1, ops: [] });
  eq([stale.error, stale.revision], ["conflict", 1], "a commit against a stale revision is refused with the current revision");
  const row = (await asRole("service_role", "select state, revision, recent_op_ids from public.wf_live_trips where id = $1", [tripId])).rows[0];
  ok(row.revision === 1 && row.state.items.a.note === "book a table" && checksum(row.state) === checksum(s1), "saved state is exactly what was committed (checksum survives jsonb)");
  eq(row.recent_op_ids, [op.id], "applied op id remembered");
  const msgs = (await asRole("service_role", "select topic, event, payload, private, extension from realtime.messages order by id")).rows;
  eq(msgs.length, 1, "exactly one broadcast for one successful commit (none for the refused one)");
  eq([msgs[0].topic, msgs[0].event, msgs[0].private, msgs[0].extension, msgs[0].payload.revision], ["live-trip:" + tripId, "ops", true, "broadcast", 1], "broadcast goes to the private trip topic with the new revision");

  // A failing transaction rolls back the broadcast with the save.
  await db.exec("begin");
  await db.exec("set local role service_role");
  await db.query("select public.wf_live_trip_commit($1, 1, $2, '{op-rolled-back-1}', '{}'::jsonb)", [tripId, s1]);
  await db.exec("rollback");
  eq(Number((await asRole("service_role", "select count(*)::int n from realtime.messages")).rows[0].n), 1, "a rolled-back commit leaves no broadcast behind");

  // Idempotency window caps at 500 ids, newest kept.
  let rev = 1;
  const many = Array.from({ length: 520 }, (_, i) => "op-cap-" + String(i).padStart(6, "0"));
  for (let i = 0; i < many.length; i += 130) {
    const r = await commit(rev, s1, many.slice(i, i + 130), {});
    rev = r.revision;
  }
  const capped = (await asRole("service_role", "select recent_op_ids from public.wf_live_trips where id = $1", [tripId])).rows[0].recent_op_ids;
  ok(capped.length === 500 && capped[capped.length - 1] === "op-cap-000519" && !capped.includes(op.id), "idempotency ids keep the newest 500 in order");

  // Ended trips refuse edits.
  await asRole("service_role", "update public.wf_live_trips set status = 'ended' where id = $1", [tripId]);
  eq((await commit(rev, s1, ["op-after-end-1"], {})).error, "ended", "an ended trip refuses commits");
  await asRole("service_role", "update public.wf_live_trips set status = 'live' where id = $1", [tripId]);
  eq((await asRole("service_role", "select public.wf_live_trip_commit($1, 0, '{}'::jsonb, '{}', '{}'::jsonb) as r", [randomUUID()])).rows[0].r.error, "not_found", "unknown trip");

  // ── Realtime authorization on the private channel ──
  const topic = "live-trip:" + tripId;
  eq((await asUser(friend, "select count(*)::int n from realtime.messages where topic = $1", [topic], topic)).rows[0].n, Number((await asRole("service_role", "select count(*)::int n from realtime.messages where topic = $1", [topic])).rows[0].n), "a member can receive the trip's broadcasts");
  eq((await asUser(stranger, "select count(*)::int n from realtime.messages", [], topic)).rows[0].n, 0, "a non-member receives nothing on the trip channel");
  eq((await asUser(friend, "select count(*)::int n from realtime.messages", [], "live-trip:" + randomUUID())).rows[0].n, 0, "a member of one trip cannot listen to another trip");
  await asUser(friend, "insert into realtime.messages(topic, extension, payload) values ($1, 'presence', '{}'::jsonb)", [topic], topic);
  count += 1; // member presence allowed
  await rejects(() => asUser(friend, "insert into realtime.messages(topic, extension, event, payload) values ($1, 'broadcast', 'ops', '{}'::jsonb)", [topic], topic), /row-level security/i, "no client may broadcast ops");
  await rejects(() => asUser(stranger, "insert into realtime.messages(topic, extension, payload) values ($1, 'presence', '{}'::jsonb)", [topic], topic), /row-level security/i, "a non-member cannot announce presence");

  // Deleting an account removes its memberships and owned trips.
  await db.query("delete from auth.users where id = $1", [friend]);
  eq((await asRole("service_role", "select count(*)::int n from public.wf_live_trip_members where user_id = $1", [friend])).rows[0].n, 0, "account deletion cascades to memberships");
  await db.query("delete from auth.users where id = $1", [owner]);
  eq((await asRole("service_role", "select count(*)::int n from public.wf_live_trips")).rows[0].n, 0, "account deletion cascades to owned trips");
} finally {
  await db.close();
}
console.log(`test-live-trip-db: OK — ${count} assertions on isolated PGlite (production not contacted).`);
