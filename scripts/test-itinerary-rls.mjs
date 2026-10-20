// Runtime PostgreSQL for the itinerary migration. Isolated PGlite: this does
// not connect to production and does not apply the file anywhere but memory.
// auth.uid() is created here because Supabase already provides it in production;
// the migration itself must not redefine it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { addPlaceToTrips } from "../lib/trips.js";
import { tripsToRecords } from "../lib/itineraryMigrate.js";

let count = 0;
const ok = (value, label) => { assert.ok(value, label); count += 1; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); count += 1; };

const db = new PGlite();
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid
    language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261020120000_wf_itineraries.sql", import.meta.url), "utf8"));
  count += 1;

  const owner = randomUUID();
  const other = randomUUID();
  await db.query("insert into auth.users(id) values ($1), ($2)", [owner, other]);

  const asUser = async (userId, sql, params = []) => {
    await db.exec("begin");
    try {
      await db.exec("set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const result = await db.query(sql, params);
      await db.exec("commit");
      return result;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  };
  const asRole = async (role, sql, params = []) => {
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      const result = await db.query(sql, params);
      await db.exec("commit");
      return result;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  };

  await assert.rejects(
    () => asRole("anon", "select * from public.wf_itineraries"),
    /permission denied/i
  );
  count += 1;
  await assert.rejects(
    () => asRole("anon", "select * from public.wf_itinerary_items"),
    /permission denied/i
  );
  count += 1;

  const inserted = await asUser(
    owner,
    "insert into public.wf_itineraries (user_id, local_key, title, city) values ($1, 'fl_sarasota', 'Sarasota', 'Sarasota') returning id, visibility",
    [owner]
  );
  eq(inserted.rows[0].visibility, "private", "visibility defaults to private");
  const itineraryId = inserted.rows[0].id;

  const own = await asUser(owner, "select local_key from public.wf_itineraries");
  eq(own.rows.map((row) => row.local_key), ["fl_sarasota"], "the owner can read their itinerary");

  const hidden = await asUser(other, "select local_key from public.wf_itineraries");
  eq(hidden.rows, [], "another signed-in user sees zero itineraries");

  await assert.rejects(
    () => asUser(other, "insert into public.wf_itineraries (user_id, local_key) values ($1, 'stolen')", [owner]),
    /row-level security/i
  );
  count += 1;

  await asUser(
    owner,
    "insert into public.wf_itinerary_items (itinerary_id, user_id, local_item_id, place) values ($1, $2, 'stop-1', '{\"id\":\"stop-1\"}'::jsonb)",
    [itineraryId, owner]
  );
  const ownItems = await asUser(owner, "select local_item_id from public.wf_itinerary_items");
  eq(ownItems.rows.map((row) => row.local_item_id), ["stop-1"], "the owner can read their stops");
  const hiddenItems = await asUser(other, "select local_item_id from public.wf_itinerary_items");
  eq(hiddenItems.rows, [], "another signed-in user sees zero stops");

  await assert.rejects(
    () => asUser(
      other,
      "insert into public.wf_itinerary_items (itinerary_id, user_id, local_item_id) values ($1, $2, 'stolen')",
      [itineraryId, owner]
    ),
    /row-level security/i
  );
  count += 1;

  await assert.rejects(
    () => asUser(owner, "insert into public.wf_itineraries (user_id, local_key, visibility) values ($1, 'public-trip', 'public')", [owner]),
    /check constraint/i
  );
  count += 1;

  const huge = JSON.stringify({ blob: "x".repeat(13000) });
  await assert.rejects(
    () => asUser(
      owner,
      "insert into public.wf_itinerary_items (itinerary_id, user_id, local_item_id, place) values ($1, $2, 'huge', $3::jsonb)",
      [itineraryId, owner, huge]
    ),
    /check constraint/i
  );
  count += 1;

  await asUser(owner, "delete from public.wf_itineraries where id = $1", [itineraryId]);
  const after = await asUser(owner, "select count(*)::int as n from public.wf_itinerary_items");
  eq(after.rows[0].n, 0, "deleting an itinerary cascades its stops");

  const mappedTrips = addPlaceToTrips({}, {
    id: "stop-map",
    name: "Pier",
    address: "1 Main St, Sarasota, FL 34236, USA",
    lat: 27.33,
    lng: -82.53,
  }, 1000);
  const records = tripsToRecords(mappedTrips, owner);
  eq(records[0].itinerary.visibility, "private", "the sync mapper stores visibility private");
  const mappedRow = records[0].itinerary;
  const mapped = await asUser(
    owner,
    "insert into public.wf_itineraries (user_id, local_key, title, city, state, visibility) values ($1, $2, $3, $4, $5, $6) returning id, visibility",
    [owner, mappedRow.local_key, mappedRow.title, mappedRow.city, mappedRow.state, mappedRow.visibility]
  );
  eq(mapped.rows[0].visibility, "private", "a row built by the sync mapper inserts under the owner policy");
  const mappedItem = records[0].items[0];
  await asUser(
    owner,
    "insert into public.wf_itinerary_items (itinerary_id, user_id, local_item_id, kind, sort_key, visited, note, place) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)",
    [mapped.rows[0].id, owner, mappedItem.local_item_id, mappedItem.kind, mappedItem.sort_key, mappedItem.visited, mappedItem.note, JSON.stringify(mappedItem.place)]
  );

  const server = await asRole("service_role", "select local_key from public.wf_itineraries");
  eq(server.rows.map((row) => row.local_key), [mappedRow.local_key], "service_role can read the owner's itinerary");

  const third = randomUUID();
  await db.query("insert into auth.users(id) values ($1)", [third]);
  await asUser(third, "insert into public.wf_itineraries (user_id, local_key) values ($1, 'fl_tampa')", [third]);
  await db.query("delete from auth.users where id = $1", [third]);
  const gone = await db.query("select count(*)::int as n from public.wf_itineraries where user_id = $1", [third]);
  eq(gone.rows[0].n, 0, "deleting the auth user cascades their itineraries");

  const flags = await db.query(`
    select relname, relrowsecurity
    from pg_class
    where relname in ('wf_itineraries', 'wf_itinerary_items')
  `);
  eq(flags.rows.length, 2);
  ok(flags.rows.every((row) => row.relrowsecurity), "both tables enable row level security");

  const policies = await db.query(`
    select count(*)::int as n
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname in ('wf_itineraries', 'wf_itinerary_items')
  `);
  eq(policies.rows[0].n, 8, "each table has select, insert, update, and delete policies");

  console.log(`test-itinerary-rls: ${count} assertions passed on embedded PostgreSQL; production was not contacted`);
} finally {
  await db.close();
}
