// scripts/test-reserve-schema.mjs - "Reserve a table" database guard.
//
// STATIC (comments stripped, syntactic role): both tables have RLS on; the five wf_reserve_*
// functions are SECURITY DEFINER with search_path pinned, EXECUTE revoked from public, anon and
// authenticated and granted to service_role ONLY; no client role can read partners or write bookings.
// RUNTIME (PGlite, a real PostgreSQL engine in memory, like test-group-plan-schema.mjs): the migration
// is applied, supabase/tests/reserve_booking_test.sql is RUN (capacity, idempotent retry, overlap, lead
// time, closed days, cancel, propose/accept/decline, phone-needs-consent), the roles are exercised
// (anon/authenticated are refused), and the seed script scripts/reserve-seed-test-kitchen.sql is run
// twice (idempotent) and then BOOKED against through the real function.
// The real lib/reserveRepository.js is then driven against the real functions (a fetch shim runs each rpc
// call in PGlite as service_role), so its named arguments are proven to match the SQL parameters.
// It cannot prove hosted Supabase grants or multi-connection races; the advisory lock is asserted
// statically and by the SQL test's serial behaviour only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createReserveRepository } from "../lib/reserveRepository.js";

let count = 0;
const ok = (c, m) => { assert.ok(c, m); count++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); count++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const MIG = "supabase/migrations/20261111210000_wf_reserve_partners_requests.sql";
const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const mig = stripSql(read(MIG));

// ---- static -------------------------------------------------------------------------------------
{
  const tables = [...mig.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]);
  eq(tables.sort(), ["wf_reserve_bookings", "wf_reserve_partners"], "the migration creates exactly the two reserve tables");
  for (const t of tables) ok(new RegExp(`alter table public\\.${t} enable row level security`, "i").test(mig), `${t} has RLS enabled`);
  ok(/revoke all on public\.wf_reserve_partners, public\.wf_reserve_bookings from public, anon, authenticated/i.test(mig), "all table access is revoked from public, anon and authenticated first");
  const tableGrants = [...mig.matchAll(/grant\s+([^;]+?)\s+on\s+(?:table\s+)?([^;]+?)\s+to\s+([^;]+);/gi)].filter((m) => /wf_reserve_(partners|bookings)/.test(m[2]));
  const toClients = tableGrants.filter((m) => /\b(anon|authenticated|public)\b/i.test(m[3]));
  ok(toClients.length === 1 && /^select$/i.test(toClients[0][1].trim()) && /wf_reserve_bookings$/.test(toClients[0][2].trim()) && /^authenticated$/i.test(toClients[0][3].trim()), "the ONLY client table grant is select on wf_reserve_bookings to authenticated (partners, with the contact email and token hash, are never client readable)");
  ok(/create policy wf_reserve_bookings_own_select[\s\S]{0,200}using \(user_id = auth\.uid\(\)\)/i.test(mig) && !/create policy[^;]*wf_reserve_partners/i.test(mig), "the one policy lets a guest read only their own bookings; partners have no policy");
  const blocks = mig.split(/create (?:or replace )?function /i).slice(1);
  const names = blocks.map((b) => /^public\.(wf_reserve_\w+)/.exec(b)[1]);
  eq(names.sort(), ["wf_reserve_book", "wf_reserve_cancel", "wf_reserve_propose", "wf_reserve_respond_proposal", "wf_reserve_slots"], "the migration defines exactly the five reserve functions");
  for (let i = 0; i < blocks.length; i++) {
    const header = blocks[i].slice(0, blocks[i].indexOf("$fn$"));
    ok(/\bsecurity definer\b/i.test(header) && /set search_path = public, pg_temp/i.test(header), `${names[i]} is SECURITY DEFINER with search_path = public, pg_temp`);
  }
  const revokes = [...mig.matchAll(/revoke all on function public\.(wf_reserve_\w+)\([^)]*\) from public, anon, authenticated/gi)].map((m) => m[1]).sort();
  const grants = [...mig.matchAll(/grant execute on function public\.(wf_reserve_\w+)\([^)]*\) to ([\w, ]+);/gi)];
  eq(revokes, [...names].sort(), "EXECUTE is revoked from public, anon and authenticated on every function");
  eq(grants.map((m) => m[1]).sort(), [...names].sort(), "EXECUTE is granted on every function...");
  ok(grants.every((m) => m[2].trim() === "service_role"), "...to service_role and nobody else");
  const clientGrant = /grant execute on function [^;]*? to [^;]*\b(anon|authenticated|public)\b/i;
  ok(clientGrant.test("grant execute on function public.wf_reserve_book(text) to anon;") && clientGrant.test("grant execute on function public.f(int) to service_role, authenticated;") && !clientGrant.test("grant execute on function public.f(int) to service_role;"), "positive control: the client-grant probe finds a known bad grant and passes a known good one");
  ok(!clientGrant.test(mig), "no function is granted to a client role");
  ok((mig.match(/pg_advisory_xact_lock\(hashtext\('wf_reserve:'/g) || []).length >= 2, "booking (and the move paths) take the per place per day advisory lock");
  const bookBlock = blocks[names.indexOf("wf_reserve_book")];
  ok(bookBlock.indexOf("pg_advisory_xact_lock") < bookBlock.indexOf("wf_reserve_slots") || bookBlock.indexOf("pg_advisory_xact_lock") < bookBlock.search(/\bsum\(/i), "wf_reserve_book takes the lock BEFORE it counts capacity");
  // the repository only ever calls these five names through the service role
  const repo = stripSql(read("lib/reserveRepository.js").replace(/\/\/.*$/gm, ""));
  for (const n of names) ok(read("lib/reserveRepository.js").includes(n), `lib/reserveRepository.js calls ${n}`);
  ok(!/\.from\(|\/rest\/v1\/wf_reserve_bookings["'`]?\s*,\s*\{[^}]*method:\s*["']POST/.test(repo), "the repository never inserts a booking row directly: only the database function creates bookings");
}

// ---- runtime (PGlite) ------------------------------------------------------------------------------
const db = new PGlite();
const asRole = async (role, sql, params = []) => {
  await db.exec(`begin; set local role ${role};`);
  try { const r = await db.query(sql, params); await db.exec("commit"); return r; } catch (e) { await db.exec("rollback"); throw e; }
};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;`);
  await db.exec(read(MIG));
  count++;
  // 1. the SQL test file: BEGIN ... ROLLBACK, every check raises on failure
  await db.exec(read("supabase/tests/reserve_booking_test.sql"));
  count++;
  // 2. roles
  const u = randomUUID();
  await db.query("insert into auth.users values ($1)", [u]);
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(() => asRole(role, "select * from public.wf_reserve_partners"), /permission denied/i); count++;
    await assert.rejects(() => asRole(role, "insert into public.wf_reserve_bookings(confirmation_code,place_id,user_id,guest_name,party_size,reserve_date,reserve_time,idempotency_key) values ('AAAAAA','x',$1,'x',2,current_date,'18:00',$2)", [u, randomUUID()]), /permission denied/i); count++;
    for (const call of ["wf_reserve_slots('x', current_date, 2, null)", `wf_reserve_book('x', '${u}', current_date, '18:00', 2, 'n', null, null, false, '${randomUUID()}')`, `wf_reserve_cancel('${randomUUID()}', 'guest', '${u}', null, null)`, `wf_reserve_propose('${randomUUID()}', 'x', current_date, '18:00')`, `wf_reserve_respond_proposal('${randomUUID()}', '${u}', true)`]) {
      await assert.rejects(() => asRole(role, `select public.${call}`), /permission denied/i, `${role} must not run ${call.split("(")[0]}`); count++;
    }
  }
  await assert.rejects(() => asRole("anon", "select * from public.wf_reserve_bookings"), /permission denied/i); count++;
  eq((await asRole("authenticated", "select * from public.wf_reserve_bookings")).rows.length, 0, "a signed in role sees no bookings that are not its own (RLS)");
  ok((await asRole("service_role", "select count(*)::int as n from public.wf_reserve_partners")).rows[0].n === 0, "the service role can read the (still empty) partner table");
  // 3. the seed: idempotent, then bookable through the real function
  const seed = read("scripts/reserve-seed-test-kitchen.sql");
  await db.exec(seed); await db.exec(seed);
  const p = (await db.query("select * from public.wf_reserve_partners")).rows;
  ok(p.length === 1 && p[0].place_id === "wf-test-kitchen" && p[0].stage === "demo" && p[0].active === true && p[0].manage_token_hash === null, "the seed is idempotent (one row after two runs), demo stage, active, and sets no token hash");
  const future = (dow) => { const d = new Date(Date.now() + 10 * 86400000); while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  const call = async (sql, params) => (await asRole("service_role", sql, params)).rows[0].v;
  const tue = future(2), mon = future(1);
  const slots = (await asRole("service_role", "select slot::text as s from public.wf_reserve_slots('wf-test-kitchen', $1, 2, null)", [tue])).rows.map((r) => r.s);
  ok(slots.includes("18:00:00") && slots.includes("21:00:00") && !slots.includes("21:15:00") && !slots.some((s) => s < "17:00:00"), "the seed's Tuesday hours give open times from 17:00 through the 21:00 last seating (the window end is the last start time, inclusive)");
  eq((await asRole("service_role", "select slot::text as s from public.wf_reserve_slots('wf-test-kitchen', $1, 2, null)", [mon])).rows.length, 0, "the seed's Monday is closed: no open times");
  const u2 = randomUUID(), u3 = randomUUID();
  await db.query("insert into auth.users values ($1), ($2)", [u2, u3]);
  const key = randomUUID();
  const booked = await call("select public.wf_reserve_book('wf-test-kitchen', $1, $2, '18:00', 2, 'Gabe', null, null, false, $3) as v", [u, tue, key]);
  ok(booked.ok === true && /^[A-HJKMNP-Z2-9]{6}$/.test(booked.booking.confirmation_code) && booked.booking.status === "confirmed" && booked.booking.restaurant_name === "Wayfind Test Kitchen" && booked.booking.restaurant_phone === "(941) 555-0100", "the seeded test kitchen takes a real booking and returns the saved row with the restaurant name and phone");
  const again = await call("select public.wf_reserve_book('wf-test-kitchen', $1, $2, '18:00', 2, 'Gabe', null, null, false, $3) as v", [u, tue, key]);
  ok(again.ok === true && again.booking.id === booked.booking.id, "the same idempotency key returns the same booking");
  eq((await db.query("select count(*)::int as n from public.wf_reserve_bookings")).rows[0].n, 1, "...and exactly one row exists");
  const dup = await call("select public.wf_reserve_book('wf-test-kitchen', $1, $2, '19:00', 2, 'Gabe', null, null, false, $3) as v", [u, tue, randomUUID()]);
  eq(dup.code, "DUPLICATE", "the same guest cannot hold two overlapping tables at the restaurant on one day");
  const closed = await call("select public.wf_reserve_book('wf-test-kitchen', $1, $2, '18:00', 2, 'Gabe', null, null, false, $3) as v", [u, mon, randomUUID()]);
  eq(closed.code, "CLOSED", "booking on the closed Monday is refused with CLOSED");
  const ph = await call("select public.wf_reserve_book('wf-test-kitchen', $1, $2, '19:00', 2, 'Gabe', null, '(941) 555-0199', false, $3) as v", [u2, tue, randomUUID()]);
  ok(ph.ok === true && ph.booking.guest_phone === null && ph.booking.phone_consent_at === null, "a phone passed without consent is stored as nothing");
  const ph2 = await call("select public.wf_reserve_book('wf-test-kitchen', $1, $2, '19:15', 2, 'Gabe', null, '(941) 555-0199', true, $3) as v", [u3, tue, randomUUID()]);
  ok(ph2.ok === true && ph2.booking.guest_phone === "(941) 555-0199" && ph2.booking.phone_consent_at !== null, "a phone with consent is stored with the consent time");
  // 4. the REAL repository against the REAL functions: its named rpc arguments must match the SQL parameter names and types
  const rpcShim = async (url, init) => {
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(String(url));
    if (!m) return { ok: false, status: 404, json: async () => null };
    const args = JSON.parse(init.body), keys = Object.keys(args);
    const named = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
    try {
      const sql = m[1] === "wf_reserve_slots" ? `select slot::text as slot from public.wf_reserve_slots(${named})` : `select public.${m[1]}(${named}) as v`;
      const r = await asRole("service_role", sql, keys.map((k) => args[k]));
      return { ok: true, status: 200, json: async () => (m[1] === "wf_reserve_slots" ? r.rows : r.rows[0].v) };
    } catch (e) { return { ok: false, status: 400, json: async () => ({ message: String(e.message) }) }; }
  };
  const repo = createReserveRepository({ url: "https://db.invalid", key: "svc" }, rpcShim);
  const u4 = randomUUID(), u5 = randomUUID();
  await db.query("insert into auth.users values ($1), ($2)", [u4, u5]);
  const wed = future(3);
  const rs = await repo.slots("wf-test-kitchen", wed, 2);
  ok(rs.includes("18:00") && rs.includes("21:00") && !rs.includes("21:15"), "repository.slots returns HH:MM times through the real function");
  const rb = await repo.book({ placeId: "wf-test-kitchen", userId: u4, date: wed, time: "18:00", partySize: 2, guestName: "Gab", note: "Window", phone: null, phoneConsent: false, idempotencyKey: randomUUID() });
  ok(rb.ok === true && rb.booking.status === "confirmed" && rb.booking.guest_name === "Gab" && rb.booking.note === "Window", "repository.book: the argument names match the SQL parameters and the booking is saved");
  const pr = await repo.propose({ bookingId: rb.booking.id, placeId: "wf-test-kitchen", date: wed, time: "19:30" });
  ok(pr.ok === true && pr.booking.status === "proposed" && pr.booking.proposed_time === "19:30:00", "repository.propose moves the booking to proposed");
  const stranger = await repo.respondProposal({ bookingId: rb.booking.id, userId: u5, accept: true });
  eq(stranger.code, "NOT_FOUND", "another guest cannot answer the proposal");
  const ac = await repo.respondProposal({ bookingId: rb.booking.id, userId: u4, accept: true });
  ok(ac.ok === true && ac.booking.status === "confirmed" && ac.booking.reserve_time === "19:30:00", "repository.respondProposal(accept) moves the booking to the proposed time");
  const wrongPlace = await repo.cancel({ bookingId: rb.booking.id, actor: "restaurant", placeId: "some-other-place", reason: "x" });
  eq(wrongPlace.code, "NOT_FOUND", "a restaurant cannot cancel a booking that is not at its place");
  const wrongGuest = await repo.cancel({ bookingId: rb.booking.id, actor: "guest", userId: u5 });
  eq(wrongGuest.code, "NOT_FOUND", "another guest cannot cancel it");
  const cx = await repo.cancel({ bookingId: rb.booking.id, actor: "guest", userId: u4 });
  ok(cx.ok === true && cx.booking.status === "cancelled" && cx.booking.cancelled_by === "guest", "repository.cancel as the guest cancels");
  const rb2 = await repo.book({ placeId: "wf-test-kitchen", userId: u5, date: wed, time: "18:30", partySize: 2, guestName: "Sam", idempotencyKey: randomUUID() });
  const rc2 = await repo.cancel({ bookingId: rb2.booking.id, actor: "restaurant", placeId: "wf-test-kitchen", reason: "Kitchen closed" });
  ok(rc2.ok === true && rc2.booking.cancelled_by === "restaurant" && rc2.booking.cancel_reason === "Kitchen closed", "repository.cancel as the restaurant records the reason");
  const ex = await repo.slots("wf-test-kitchen", wed, 2, rb2.booking.id);
  ok(Array.isArray(ex) && ex.length > 0, "repository.slots passes p_exclude (the argument name matches)");
  await assert.rejects(() => repo.book({ placeId: "wf-test-kitchen", userId: "nope", idempotencyKey: "nope" }), /Invalid booking/); count++;
  await assert.rejects(() => createReserveRepository({ url: "https://db.invalid", key: "svc" }, async () => ({ ok: false, status: 500, json: async () => ({}) })).book({ placeId: "wf-test-kitchen", userId: u4, date: wed, time: "18:00", partySize: 2, guestName: "G", idempotencyKey: randomUUID() }), (e) => e.code === "RESERVE_STORAGE_UNAVAILABLE"); count++;
} finally { await db.close?.(); }
console.log(`test-reserve-schema: OK - ${count} assertions (static grants/RLS/definer + PGlite runtime: migration applied, SQL test file run, roles refused, seed idempotent and bookable, the real lib/reserveRepository.js driven against the real functions)`);
