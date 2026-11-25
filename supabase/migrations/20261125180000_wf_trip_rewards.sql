-- Trip logs, rewards ledger and rewards profile (owner order 2026-11-25:
-- "Verified Trip Logs & Tiered Rewards / Status Badges").
--
--   wf_trip_logs        one row per visit a signed in member logs on a place
--                       or event page: when, how it was verified, and four
--                       optional pick-list facts (crowd, vibe, best time, wait).
--   wf_reward_events    the append-only points ledger. Every point a member
--                       holds is a row here that names the trip log it came from.
--   wf_rewards_profile  one row per member: running counters the tier and badge
--                       rules in lib/rewards.js read, plus the tier and badges
--                       they produced.
--
-- VERIFICATION is a device position the browser reports, checked once against
-- the place for a visit logged on the day; it is attested, not proven, which
-- is why it adds points and a dormant giveaway entry only, never a prize.
--
-- PRIVACY. No free text, no name, email, phone, or coordinates are stored. A
-- visit's verification is a word ('nearby' or 'self_reported') and a distance
-- band; the device position used to decide it is never written anywhere.
--
-- SECURITY. RLS is ON for all three tables. A signed in member may READ only
-- their own rows. Nobody but the service role can write: every write goes
-- through public.wf_log_visit, called by app/api/trip-log/route.js after it has
-- verified the member's session and the place or event server side. The anon
-- key that ships in the browser gets nothing.
--
-- ANTI SPAM is enforced here, not only in the route: one log per place per 7
-- days (by visit date AND by when it was logged), at most 8 logs per rolling 24 hours, visit date within the last 14 days
-- (US Eastern), and a per member advisory lock so two taps cannot race.
--
-- Additive only. Reverse:
--   drop function if exists public.wf_log_visit(uuid, text, text, date, text, text, text, text, text, text);
--   drop table if exists public.wf_reward_events, public.wf_rewards_profile, public.wf_trip_logs;

begin;

create table if not exists public.wf_trip_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  ref_kind      text not null check (ref_kind in ('place', 'event')),
  ref_id        text not null check (char_length(ref_id) between 3 and 200 and ref_id ~ '^[A-Za-z0-9_:.-]+$'),
  visited_on    date not null,
  verification  text not null check (verification in ('nearby', 'self_reported')),
  distance_band text not null default 'unknown' check (distance_band in ('under_quarter_mile', 'under_mile', 'farther', 'unknown')),
  crowd         text check (crowd in ('quiet', 'steady', 'busy', 'packed')),
  vibe          text check (vibe in ('chill', 'lively', 'romantic', 'family', 'local', 'touristy')),
  best_time     text check (best_time in ('morning', 'midday', 'afternoon', 'evening', 'late')),
  wait          text check (wait in ('none', 'short', 'long')),
  created_at    timestamptz not null default now(),
  unique (user_id, ref_kind, ref_id, visited_on)
);

create index if not exists wf_trip_logs_owner_created on public.wf_trip_logs (user_id, created_at desc);
create index if not exists wf_trip_logs_ref on public.wf_trip_logs (ref_kind, ref_id, visited_on desc);

create table if not exists public.wf_reward_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  trip_log_id  uuid references public.wf_trip_logs(id) on delete set null,
  kind         text not null check (kind in ('visit_logged', 'verified_bonus', 'local_intel_bonus', 'giveaway_entry')),
  points       integer not null default 0 check (points between 0 and 100),
  month        text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  created_at   timestamptz not null default now()
);

create index if not exists wf_reward_events_owner on public.wf_reward_events (user_id, created_at desc);

create table if not exists public.wf_rewards_profile (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  points            integer not null default 0 check (points >= 0),
  visits            integer not null default 0 check (visits >= 0),
  verified_visits   integer not null default 0 check (verified_visits >= 0),
  intel_visits      integer not null default 0 check (intel_visits >= 0),
  event_visits      integer not null default 0 check (event_visits >= 0),
  distinct_refs     integer not null default 0 check (distinct_refs >= 0),
  giveaway_month    text check (giveaway_month is null or giveaway_month ~ '^[0-9]{4}-[0-9]{2}$'),
  giveaway_entries  integer not null default 0 check (giveaway_entries between 0 and 10),
  tier              text not null default 'local_scout' check (tier in ('local_scout', 'florida_insider', 'wayfind_trailblazer')),
  badges            text[] not null default '{}'::text[] check (cardinality(badges) <= 20),
  updated_at        timestamptz not null default now()
);

alter table public.wf_trip_logs enable row level security;
alter table public.wf_reward_events enable row level security;
alter table public.wf_rewards_profile enable row level security;

revoke all on public.wf_trip_logs, public.wf_reward_events, public.wf_rewards_profile from public, anon, authenticated;
grant select on public.wf_trip_logs, public.wf_reward_events, public.wf_rewards_profile to authenticated;
grant select, insert, update, delete on public.wf_trip_logs, public.wf_reward_events, public.wf_rewards_profile to service_role;

create policy wf_trip_logs_owner_select on public.wf_trip_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy wf_reward_events_owner_select on public.wf_reward_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy wf_rewards_profile_owner_select on public.wf_rewards_profile
  for select to authenticated using ((select auth.uid()) = user_id);

-- The only writer. Points: 10 for the visit, 15 more when the device was near
-- the place, 5 more when two or more local intel facts were given. One monthly
-- giveaway entry per NEARBY visit, at most 10 a month. Mirrored by
-- lib/rewards.js POINTS for display; a test asserts the two agree.
create or replace function public.wf_log_visit(
  p_user_id uuid,
  p_ref_kind text,
  p_ref_id text,
  p_visited_on date,
  p_verification text,
  p_distance_band text,
  p_crowd text,
  p_vibe text,
  p_best_time text,
  p_wait text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.now() at time zone 'America/New_York')::date;
  v_month text := pg_catalog.to_char(pg_catalog.now() at time zone 'America/New_York', 'YYYY-MM');
  v_log_id uuid;
  v_intel integer;
  v_points integer := 0;
  v_entry boolean := false;
  v_prof public.wf_rewards_profile%rowtype;
  v_recent integer;
begin
  if p_user_id is null then raise exception 'WF_BAD_INPUT: user' using errcode = '22023'; end if;
  if p_visited_on is null or p_visited_on > v_today or p_visited_on < v_today - 14 then
    raise exception 'WF_BAD_DATE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wf_trip_log:' || p_user_id::text, 0));

  select count(*) into v_recent from public.wf_trip_logs
    where user_id = p_user_id and created_at > pg_catalog.now() - interval '24 hours';
  if v_recent >= 8 then raise exception 'WF_RATE_LIMITED' using errcode = 'P0001'; end if;

  -- Both windows: a visit date within 6 days of an existing one, AND any log
  -- of the same place made in the last 7 days, so back dating cannot farm it.
  if exists (
    select 1 from public.wf_trip_logs
    where user_id = p_user_id and ref_kind = p_ref_kind and ref_id = p_ref_id
      and (visited_on between p_visited_on - 6 and p_visited_on + 6
           or created_at > pg_catalog.now() - interval '7 days')
  ) then
    raise exception 'WF_DUPLICATE' using errcode = 'P0001';
  end if;

  insert into public.wf_trip_logs (user_id, ref_kind, ref_id, visited_on, verification, distance_band, crowd, vibe, best_time, wait)
  values (p_user_id, p_ref_kind, p_ref_id, p_visited_on, p_verification, coalesce(p_distance_band, 'unknown'), p_crowd, p_vibe, p_best_time, p_wait)
  returning id into v_log_id;

  v_intel := (p_crowd is not null)::int + (p_vibe is not null)::int + (p_best_time is not null)::int + (p_wait is not null)::int;

  insert into public.wf_reward_events (user_id, trip_log_id, kind, points, month)
    values (p_user_id, v_log_id, 'visit_logged', 10, v_month);
  v_points := 10;
  if p_verification = 'nearby' then
    insert into public.wf_reward_events (user_id, trip_log_id, kind, points, month)
      values (p_user_id, v_log_id, 'verified_bonus', 15, v_month);
    v_points := v_points + 15;
  end if;
  if v_intel >= 2 then
    insert into public.wf_reward_events (user_id, trip_log_id, kind, points, month)
      values (p_user_id, v_log_id, 'local_intel_bonus', 5, v_month);
    v_points := v_points + 5;
  end if;

  insert into public.wf_rewards_profile (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_prof from public.wf_rewards_profile where user_id = p_user_id for update;

  if v_prof.giveaway_month is distinct from v_month then
    v_prof.giveaway_month := v_month;
    v_prof.giveaway_entries := 0;
  end if;
  if p_verification = 'nearby' and v_prof.giveaway_entries < 10 then
    insert into public.wf_reward_events (user_id, trip_log_id, kind, points, month)
      values (p_user_id, v_log_id, 'giveaway_entry', 0, v_month);
    v_prof.giveaway_entries := v_prof.giveaway_entries + 1;
    v_entry := true;
  end if;

  update public.wf_rewards_profile set
    points = v_prof.points + v_points,
    visits = v_prof.visits + 1,
    verified_visits = v_prof.verified_visits + (p_verification = 'nearby')::int,
    intel_visits = v_prof.intel_visits + (v_intel >= 2)::int,
    event_visits = v_prof.event_visits + (p_ref_kind = 'event')::int,
    distinct_refs = (select count(distinct (ref_kind, ref_id)) from public.wf_trip_logs where user_id = p_user_id),
    giveaway_month = v_prof.giveaway_month,
    giveaway_entries = v_prof.giveaway_entries,
    updated_at = pg_catalog.now()
  where user_id = p_user_id
  returning * into v_prof;

  return pg_catalog.jsonb_build_object(
    'trip_log_id', v_log_id,
    'points_awarded', v_points,
    'giveaway_entry', v_entry,
    'profile', pg_catalog.to_jsonb(v_prof)
  );
end $$;

revoke all on function public.wf_log_visit(uuid, text, text, date, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.wf_log_visit(uuid, text, text, date, text, text, text, text, text, text) to service_role;

commit;
