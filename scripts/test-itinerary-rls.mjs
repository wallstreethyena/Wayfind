// Runtime PostgreSQL for the itinerary migration. Isolated PGlite: this does
// not connect to production and does not apply the file anywhere but memory.
// auth.uid() is created here because Supabase already provides it in production;
// the migration itself must not redefine it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { addPlaceToTrips } from "../lib/trips.js";
import { setStopDate } from "../lib/tripDays.js";
import { tripsToRecords, recordsToTrips, mergeTrips } from "../lib/itineraryMigrate.js";
import { pushTrips, fetchRemoteTrips } from "../lib/itinerarySync.js";
import {
  encodeItineraryShare,
  decodeItineraryShare,
  importSharedTripToTrips,
  isSharedTripSaved,
} from "../lib/itineraryShare.js";

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
    () => asUser(other,
      "insert into public.wf_itinerary_items (itinerary_id, user_id, local_item_id) values ($1, $2, 'foreign-parent')",
      [itineraryId, other]),
    /foreign key|row-level security/i
  );
  count += 1;
  await assert.rejects(
    () => asUser(other, "update public.wf_itineraries set share_code = 'abc1234' where user_id = $1 returning id", [other]).then(async () => {
      await asUser(other, "insert into public.wf_itineraries (user_id, local_key, share_code) values ($1, 'forged', 'abc1234')", [other]);
    }),
    /check constraint|permission denied/i
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

  let mappedTrips = addPlaceToTrips({}, {
    id: "stop-map",
    name: "Pier",
    address: "1 Main St, Sarasota, FL 34236, USA",
    lat: 27.33,
    lng: -82.53,
  }, 1000);
  mappedTrips = addPlaceToTrips(mappedTrips, {
    id: "stop-beach",
    name: "Siesta Key Beach",
    address: "948 Beach Rd, Sarasota, FL 34242, USA",
    lat: 27.26,
    lng: -82.55,
  }, 1100);
  mappedTrips = setStopDate(mappedTrips, "fl_sarasota", "stop-map", "2026-10-24", 1200);
  const records = tripsToRecords(mappedTrips, owner);
  eq(records[0].itinerary.visibility, "private", "the sync mapper stores visibility private");
  eq(records[0].items.map((it) => ({ id: it.local_item_id, scheduled_on: it.scheduled_on })), [
    { id: "stop-map", scheduled_on: "2026-10-24" },
    { id: "stop-beach", scheduled_on: null },
  ], "tripsToRecords maps item.day to scheduled_on and leaves undated stops null");

  // PGlite-backed Supabase client adapter for testing pushTrips + fetchRemoteTrips against real Postgres RLS
  const makePgClient = (userId) => ({
    from(table) {
      return {
        upsert(payload) {
          const rows = Array.isArray(payload) ? payload : [payload];
          const execUpsert = async () => {
            try {
              if (table === "wf_itineraries") {
                const r = rows[0];
                const res = await asUser(
                  userId,
                  `insert into public.wf_itineraries (user_id, local_key, title, city, state, start_date, end_date, visibility, share_code, updated_at)
                   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                   on conflict (user_id, local_key) do update set
                     title = excluded.title, city = excluded.city, state = excluded.state,
                     start_date = excluded.start_date, end_date = excluded.end_date,
                     visibility = excluded.visibility, updated_at = excluded.updated_at
                   returning id, visibility`,
                  [r.user_id, r.local_key, r.title, r.city, r.state, r.start_date, r.end_date, r.visibility, r.share_code, r.updated_at]
                );
                return { data: res.rows[0], error: null };
              }
              for (const it of rows) {
                await asUser(
                  userId,
                  `insert into public.wf_itinerary_items (itinerary_id, user_id, local_item_id, kind, ref_id, day_index, nights, sort_key, locked, visited, note, place, added_via, scheduled_on)
                   values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
                   on conflict (itinerary_id, local_item_id) do update set
                     sort_key = excluded.sort_key, visited = excluded.visited,
                     note = excluded.note, place = excluded.place, scheduled_on = excluded.scheduled_on`,
                  [it.itinerary_id, it.user_id, it.local_item_id, it.kind, it.ref_id, it.day_index, it.nights, it.sort_key, it.locked, it.visited, it.note, JSON.stringify(it.place), it.added_via, it.scheduled_on]
                );
              }
              return { data: rows, error: null };
            } catch (error) {
              return { data: null, error };
            }
          };
          const promise = execUpsert();
          promise.select = () => ({ maybeSingle: () => promise });
          return promise;
        },
        select() {
          const filters = {};
          const chain = {
            eq(col, val) {
              filters[col] = val;
              return chain;
            },
            then(resolve, reject) {
              (async () => {
                if (table === "wf_itineraries") {
                  const itins = await asUser(
                    userId,
                    "select id, local_key, title, city, state, start_date, end_date, visibility, share_code, created_at, updated_at from public.wf_itineraries where user_id = $1",
                    [filters.user_id]
                  );
                  const out = [];
                  for (const row of itins.rows) {
                    const itemsRes = await asUser(
                      userId,
                      "select local_item_id, kind, ref_id, day_index, nights, sort_key, locked, visited, note, place, added_via, scheduled_on from public.wf_itinerary_items where itinerary_id = $1 and user_id = $2",
                      [row.id, filters.user_id]
                    );
                    out.push({ ...row, wf_itinerary_items: itemsRes.rows });
                  }
                  return { data: out, error: null };
                }
                const itemsRes = await asUser(
                  userId,
                  "select id, local_item_id from public.wf_itinerary_items where itinerary_id = $1 and user_id = $2",
                  [filters.itinerary_id, filters.user_id]
                );
                return { data: itemsRes.rows, error: null };
              })().then(resolve, reject);
            },
          };
          return chain;
        },
      };
    },
  });

  const ownerClient = makePgClient(owner);
  const pushed = await pushTrips(ownerClient, owner, mappedTrips, []);
  eq(pushed, true, "pushTrips writes the itinerary and scheduled_on dates under owner RLS");

  const storedDates = await asUser(
    owner,
    "select local_item_id, scheduled_on::text as scheduled_on from public.wf_itinerary_items order by sort_key"
  );
  eq(storedDates.rows, [
    { local_item_id: "stop-map", scheduled_on: "2026-10-24" },
    { local_item_id: "stop-beach", scheduled_on: null },
  ], "PostgreSQL stores scheduled_on = 2026-10-24 for the dated stop and null for the undated stop");

  // Second device (empty local storage) fetches from Supabase via fetchRemoteTrips
  const remoteOnDevice2 = await fetchRemoteTrips(ownerClient, owner);
  const device2Trips = mergeTrips({}, remoteOnDevice2);
  eq(
    device2Trips.fl_sarasota.items.map((it) => ({ id: it.id, day: it.day })),
    [
      { id: "stop-map", day: "2026-10-24" },
      { id: "stop-beach", day: null },
    ],
    "second device receives the scheduled date and unscheduled stop through fetchRemoteTrips + recordsToTrips"
  );

  // Same device reload merges localStorage with remote without shifting or losing the date
  const reloadedOnDevice1 = mergeTrips(mappedTrips, remoteOnDevice2);
  eq(
    reloadedOnDevice1.fl_sarasota.items.map((it) => ({ id: it.id, day: it.day })),
    [
      { id: "stop-map", day: "2026-10-24" },
      { id: "stop-beach", day: null },
    ],
    "reloading while signed in keeps item.day = 2026-10-24 without shifting"
  );

  const server = await asRole("service_role", "select local_key from public.wf_itineraries");
  eq(server.rows.map((row) => row.local_key), [records[0].itinerary.local_key], "service_role can read the owner's itinerary");

  const third = randomUUID();
  await db.query("insert into auth.users(id) values ($1)", [third]);
  await asUser(third, "insert into public.wf_itineraries (user_id, local_key) values ($1, 'fl_tampa')", [third]);
  await db.query("delete from auth.users where id = $1", [third]);
  const gone = await db.query("select count(*)::int as n from public.wf_itineraries where user_id = $1", [third]);
  eq(gone.rows[0].n, 0, "deleting the auth user cascades their itineraries");

  // Whole-trip shared import ("Save this trip to my Itinerary") roundtrip through PostgreSQL RLS:
  // A recipient saves a shared trip (signed-out or signed-in), pushes to wf_itineraries + wf_itinerary_items,
  // and hydrates on a second device with title, stop order, scheduled_on dates, undated stops, notes, and place details intact.
  const recipientId = randomUUID();
  await db.query("insert into auth.users(id) values ($1)", [recipientId]);
  const recipientClient = makePgClient(recipientId);
  const sharedPayload = encodeItineraryShare({
    key: "fl_sarasota",
    city: "Sarasota",
    state: "FL",
    title: "Sarasota Birthday Weekend",
    items: [
      {
        id: "sh-1",
        order: 0,
        day: "2026-10-24",
        note: "Patio table",
        place: {
          id: "sh-1",
          name: "Owen's Fish Camp",
          address: "516 Burns Ct, Sarasota, FL 34236, USA",
          lat: 27.331,
          lng: -82.539,
          rating: 4.8,
          reviews: 1200,
          price: "$$",
          type: "Seafood",
        },
      },
      {
        id: "sh-2",
        order: 1,
        day: null,
        note: "",
        place: {
          id: "sh-2",
          name: "Marie Selby Botanical Gardens",
          address: "1534 Mound St, Sarasota, FL 34236, USA",
          lat: 27.327,
          lng: -82.539,
          rating: 4.9,
          reviews: 3100,
          price: "$$",
          type: "Garden",
        },
      },
    ],
  });
  const decodedShared = decodeItineraryShare(sharedPayload);
  const imported = importSharedTripToTrips({}, decodedShared, 2000);
  const recipientPushed = await pushTrips(recipientClient, recipientId, imported.trips, []);
  eq(recipientPushed, true, "recipient pushes imported shared trip to PostgreSQL under recipient RLS");
  const recipientRemoteOnDevice2 = await fetchRemoteTrips(recipientClient, recipientId);
  const recipientDevice2Trips = mergeTrips({}, recipientRemoteOnDevice2);
  eq(recipientDevice2Trips.fl_sarasota.title, "Sarasota Birthday Weekend", "recipient Device 2 preserves the shared trip title from wf_itineraries.title");
  eq(
    recipientDevice2Trips.fl_sarasota.items.map((it) => ({
      id: it.id,
      order: it.order,
      day: it.day,
      note: it.note,
      rating: it.place.rating,
    })),
    [
      { id: "sh-1", order: 0, day: "2026-10-24", note: "Patio table", rating: 4.8 },
      { id: "sh-2", order: 1, day: null, note: "", rating: 4.9 },
    ],
    "recipient Device 2 receives the full imported shared trip (order, scheduled_on date, undated stop, note, and place rating)"
  );
  ok(
    isSharedTripSaved(recipientDevice2Trips, decodedShared).saved === true,
    "reopening the shared link on recipient Device 2 recognizes the trip as already saved without duplicating"
  );

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
