-- Wayfind Live Trips: real-time group itineraries (owner order 2026-11-27).
-- Design: https://claude.ai/artifact/EoyYytVrKH5BwTsvgZB9ib
--
-- One row per shared trip holds the whole itinerary as jsonb plus a revision
-- number. Every batch of edits is ONE row update made by
-- public.wf_live_trip_commit (service role only), which compares the revision
-- (compare-and-swap), remembers the op ids it applied (idempotent retries) and
-- broadcasts the accepted ops on the private Realtime topic
-- 'live-trip:<id>' in the SAME transaction, so nobody ever receives an edit
-- that was not saved.
--
-- Access: both tables have RLS on. Clients never read or write wf_live_trips;
-- the API route does, with the service role. A signed-in user may read only
-- their OWN membership rows; that is what lets the realtime.messages policy
-- below admit members (and only members) to the trip's private channel.
--
-- Additive. Reverse: drop policy wf_live_trip_rt_select on realtime.messages;
-- drop policy wf_live_trip_rt_presence on realtime.messages;
-- drop function public.wf_live_trip_commit(uuid,integer,jsonb,text[],jsonb);
-- drop table public.wf_live_trip_members; drop table public.wf_live_trips;
-- Tested on isolated PGlite by scripts/test-live-trip-db.mjs.

begin;

create table if not exists public.wf_live_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'live' check (status in ('live', 'ended')),
  state jsonb not null,
  revision integer not null default 0 check (revision >= 0),
  recent_op_ids text[] not null default '{}',
  -- The invite code is an HMAC of (id, invite_version) under this per-trip
  -- secret, so the code itself is never stored; bumping the version kills
  -- every old link. Service role only, like every column here.
  invite_secret text not null check (invite_secret ~ '^[0-9a-f]{64}$'),
  invite_version integer not null default 1 check (invite_version between 1 and 100000),
  source_key text check (source_key is null or char_length(source_key) <= 80),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(state) = 'object'),
  check (pg_column_size(state) <= 70000),
  check (cardinality(recent_op_ids) <= 500)
);

create index if not exists wf_live_trips_owner on public.wf_live_trips (owner_id, updated_at desc);

create table if not exists public.wf_live_trip_members (
  trip_id uuid not null references public.wf_live_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  display_name text not null default 'Friend' check (char_length(display_name) between 1 and 40),
  color text not null default '#F97316' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  joined_at timestamptz not null default clock_timestamp(),
  primary key (trip_id, user_id)
);

create index if not exists wf_live_trip_members_user on public.wf_live_trip_members (user_id);

alter table public.wf_live_trips enable row level security;
alter table public.wf_live_trip_members enable row level security;

revoke all on public.wf_live_trips, public.wf_live_trip_members from public, anon, authenticated;
grant select, insert, update, delete on public.wf_live_trips, public.wf_live_trip_members to service_role;
grant select on public.wf_live_trip_members to authenticated;

drop policy if exists wf_live_trip_members_self on public.wf_live_trip_members;
create policy wf_live_trip_members_self on public.wf_live_trip_members
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.wf_live_trip_commit(
  p_id uuid,
  p_expected_revision integer,
  p_state jsonb,
  p_op_ids text[],
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row public.wf_live_trips;
  next_revision integer;
begin
  select * into row from public.wf_live_trips where id = p_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if row.status <> 'live' then return jsonb_build_object('error', 'ended'); end if;
  if row.revision <> p_expected_revision then
    return jsonb_build_object('error', 'conflict', 'revision', row.revision);
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    return jsonb_build_object('error', 'state');
  end if;
  next_revision := row.revision + 1;
  update public.wf_live_trips
     set state = p_state,
         revision = next_revision,
         recent_op_ids = (
           select coalesce(array_agg(x order by ord), '{}')
           from (
             select x, ord from unnest(row.recent_op_ids || coalesce(p_op_ids, '{}')) with ordinality as t(x, ord)
             order by ord desc limit 500
           ) kept
         ),
         updated_at = clock_timestamp()
   where id = p_id;
  perform realtime.send(
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('revision', next_revision),
    'ops',
    'live-trip:' || p_id::text,
    true
  );
  return jsonb_build_object('revision', next_revision);
end $$;

revoke all on function public.wf_live_trip_commit(uuid, integer, jsonb, text[], jsonb) from public, anon, authenticated;
grant execute on function public.wf_live_trip_commit(uuid, integer, jsonb, text[], jsonb) to service_role;

-- Realtime Authorization for the private channel 'live-trip:<trip id>'.
-- Members receive broadcasts and presence; members may also SEND presence
-- (who is here, which stop they are editing). Nobody can send a broadcast
-- from a client: ops only come from wf_live_trip_commit.
drop policy if exists wf_live_trip_rt_select on realtime.messages;
create policy wf_live_trip_rt_select on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1 from public.wf_live_trip_members m
      where m.user_id = (select auth.uid())
        and 'live-trip:' || m.trip_id::text = (select realtime.topic())
    )
  );

drop policy if exists wf_live_trip_rt_presence on realtime.messages;
create policy wf_live_trip_rt_presence on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and exists (
      select 1 from public.wf_live_trip_members m
      where m.user_id = (select auth.uid())
        and 'live-trip:' || m.trip_id::text = (select realtime.topic())
    )
  );

commit;
