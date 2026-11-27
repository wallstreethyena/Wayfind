-- Wayfind AI engine: community guides, itinerary templates, leaderboard,
-- web push daily picks and per member AI limits (owner order 2026-11-27:
-- "Get OpenAI to be the AI Architect for Wayfind", plus leaderboard, video
-- previews, share prompts and personalized push in the same mission).
--
--   wf_community_guides        a member's itinerary, published by them on
--                              purpose, as a public guide. Places and order
--                              only: no notes, no dates, no names unless the
--                              member chose to show their public name.
--   wf_itinerary_templates     multi stop plans OpenAI drafts from Wayfind's own
--                              places and events. Every stop is a real row.
--   wf_web_push_subscriptions  browsers that asked for one daily pick.
--   wf_ai_user_usage           per member, per day, per lane AI call counter.
--   wf_rewards_profile         + public_name, leaderboard_opt_in, guides_published
--   wf_reward_events           + guide_id and the 'guide_published' kind.
--
-- SECURITY. RLS is ON for every new table. Nothing new is readable by anon
-- except PUBLISHED templates (no personal data in them). A member may read
-- their own guides. Every write goes through the service role from a route
-- that verified the member's Supabase session first. The new functions are
-- service role only.
--
-- ANTI GAMING (the "spend cap on promotional logic"): a published guide earns
-- 20 points once per guide, at most 3 guides a month per member (60 points),
-- enforced here under a per member advisory lock, not only in the route.
-- Leaderboard points are the current month's ledger, which the existing trip
-- log caps (8 a day, one per place per week) already bound.
--
-- PRIVACY. Push subscriptions hold the browser endpoint and its two public
-- keys, which the browser hands out for exactly this purpose; no location.
-- public_name is optional, chosen by the member, unique (case blind) so no
-- one can pose as another member, and limited to letters, digits, spaces and
-- . _ ' - characters.
--
-- Additive only. Reverse:
--   drop function if exists public.wf_award_guide(uuid, uuid);
--   drop function if exists public.wf_leaderboard(text, integer);
--   drop function if exists public.wf_ai_user_take(uuid, text, integer);
--   alter table public.wf_reward_events drop column if exists guide_id;
--   alter table public.wf_rewards_profile drop column if exists public_name,
--     drop column if exists leaderboard_opt_in, drop column if exists guides_published;
--   drop table if exists public.wf_ai_user_usage, public.wf_web_push_subscriptions,
--     public.wf_itinerary_templates, public.wf_community_guides;
--   (and restore wf_reward_events_kind_check without 'guide_published')

begin;

-- ── community guides ──────────────────────────────────────────────────────
create table if not exists public.wf_community_guides (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  itinerary_key  text not null check (char_length(itinerary_key) between 1 and 80),
  slug           text not null unique check (char_length(slug) between 3 and 90 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status         text not null default 'published' check (status in ('published', 'held', 'unpublished')),
  title          text not null check (char_length(title) between 3 and 90),
  intro          text not null default '' check (char_length(intro) <= 600),
  city           text not null check (char_length(city) between 1 and 80),
  days           integer not null default 1 check (days between 1 and 14),
  stops          jsonb not null check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) between 3 and 12 and pg_column_size(stops) <= 24000),
  show_author    boolean not null default false,
  source_hash    text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  writer         text not null default 'openai' check (writer in ('openai', 'rules')),
  moderation     text not null default 'passed' check (moderation in ('passed', 'flagged', 'unchecked')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  published_at   timestamptz,
  unique (user_id, itinerary_key)
);

create index if not exists wf_community_guides_public on public.wf_community_guides (status, published_at desc);
create index if not exists wf_community_guides_owner on public.wf_community_guides (user_id, updated_at desc);

-- ── itinerary templates ───────────────────────────────────────────────────
create table if not exists public.wf_itinerary_templates (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (char_length(slug) between 3 and 90 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  metro         text not null check (char_length(metro) between 2 and 40 and metro ~ '^[a-z0-9_]+$'),
  city          text not null check (char_length(city) between 1 and 80),
  theme         text not null check (theme ~ '^[a-z0-9_]{2,40}$'),
  status        text not null default 'published' check (status in ('published', 'retired')),
  title         text not null check (char_length(title) between 3 and 90),
  intro         text not null default '' check (char_length(intro) <= 600),
  days          integer not null default 1 check (days between 1 and 3),
  stops         jsonb not null check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) between 3 and 12 and pg_column_size(stops) <= 24000),
  valid_until   date,
  input_hash    text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  writer        text not null default 'openai' check (writer in ('openai', 'rules')),
  generated_at  timestamptz not null default now(),
  unique (metro, theme)
);

create index if not exists wf_itinerary_templates_public on public.wf_itinerary_templates (status, metro);

-- ── web push subscriptions ────────────────────────────────────────────────
create table if not exists public.wf_web_push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique check (char_length(endpoint) between 20 and 1000 and endpoint ~ '^https://'),
  p256dh        text not null check (char_length(p256dh) between 80 and 120 and p256dh ~ '^[A-Za-z0-9_-]+=*$'),
  auth          text not null check (char_length(auth) between 16 and 40 and auth ~ '^[A-Za-z0-9_-]+=*$'),
  tz            text not null default 'America/New_York' check (char_length(tz) between 3 and 64 and tz ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_sent_on  date,
  last_pick_ref text check (last_pick_ref is null or char_length(last_pick_ref) <= 200),
  sent_count    integer not null default 0 check (sent_count >= 0),
  fail_count    integer not null default 0 check (fail_count between 0 and 100)
);

create index if not exists wf_web_push_subscriptions_owner on public.wf_web_push_subscriptions (user_id);

-- ── per member AI limits ──────────────────────────────────────────────────
create table if not exists public.wf_ai_user_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  lane     text not null check (lane ~ '^[a-z_]{1,32}$'),
  n        integer not null default 0 check (n >= 0),
  primary key (user_id, day, lane)
);

-- ── rewards: public name, leaderboard opt in, guide counter ───────────────
alter table public.wf_rewards_profile
  add column if not exists public_name text
    check (public_name is null or (char_length(public_name) between 2 and 24 and public_name ~ '^[A-Za-z0-9][A-Za-z0-9 ._''-]*[A-Za-z0-9]$')),
  add column if not exists leaderboard_opt_in boolean not null default false,
  add column if not exists guides_published integer not null default 0 check (guides_published >= 0);

create unique index if not exists wf_rewards_profile_public_name_unique
  on public.wf_rewards_profile (lower(public_name)) where public_name is not null;

alter table public.wf_reward_events
  add column if not exists guide_id uuid references public.wf_community_guides(id) on delete set null;

alter table public.wf_reward_events drop constraint if exists wf_reward_events_kind_check;
alter table public.wf_reward_events add constraint wf_reward_events_kind_check
  check (kind in ('visit_logged', 'verified_bonus', 'local_intel_bonus', 'giveaway_entry', 'guide_published'));

create unique index if not exists wf_reward_events_one_award_per_guide
  on public.wf_reward_events (guide_id) where kind = 'guide_published' and guide_id is not null;
create index if not exists wf_reward_events_month on public.wf_reward_events (month, user_id);

-- ── RLS and grants ────────────────────────────────────────────────────────
alter table public.wf_community_guides enable row level security;
alter table public.wf_itinerary_templates enable row level security;
alter table public.wf_web_push_subscriptions enable row level security;
alter table public.wf_ai_user_usage enable row level security;

revoke all on public.wf_community_guides, public.wf_itinerary_templates, public.wf_web_push_subscriptions, public.wf_ai_user_usage
  from public, anon, authenticated;

grant select on public.wf_community_guides to authenticated;
grant select on public.wf_itinerary_templates to anon, authenticated;
grant select, insert, update, delete on public.wf_community_guides, public.wf_itinerary_templates,
  public.wf_web_push_subscriptions, public.wf_ai_user_usage to service_role;

drop policy if exists wf_community_guides_owner_select on public.wf_community_guides;
create policy wf_community_guides_owner_select on public.wf_community_guides
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists wf_itinerary_templates_public_select on public.wf_itinerary_templates;
create policy wf_itinerary_templates_public_select on public.wf_itinerary_templates
  for select to anon, authenticated using (status = 'published');

-- ── functions (service role only) ─────────────────────────────────────────

-- One atomic per member, per day, per lane grant. True when granted.
create or replace function public.wf_ai_user_take(p_user_id uuid, p_lane text, p_cap integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date := (pg_catalog.now() at time zone 'America/New_York')::date;
  v_n integer;
begin
  if p_user_id is null or p_lane is null or p_lane !~ '^[a-z_]{1,32}$' or p_cap is null or p_cap < 1 or p_cap > 1000 then
    raise exception 'WF_BAD_INPUT' using errcode = '22023';
  end if;
  insert into public.wf_ai_user_usage (user_id, day, lane, n) values (p_user_id, v_day, p_lane, 1)
  on conflict (user_id, day, lane) do update set n = public.wf_ai_user_usage.n + 1
    where public.wf_ai_user_usage.n < p_cap
  returning n into v_n;
  return v_n is not null;
end $$;

-- Award a published guide once: 20 points, at most 3 guides a month.
create or replace function public.wf_award_guide(p_user_id uuid, p_guide_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_month text := pg_catalog.to_char(pg_catalog.now() at time zone 'America/New_York', 'YYYY-MM');
  v_count integer;
  v_prof public.wf_rewards_profile%rowtype;
begin
  if p_user_id is null or p_guide_id is null then raise exception 'WF_BAD_INPUT' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('wf_trip_log:' || p_user_id::text, 0));
  if not exists (select 1 from public.wf_community_guides where id = p_guide_id and user_id = p_user_id and status = 'published') then
    return pg_catalog.jsonb_build_object('awarded', false, 'reason', 'not_published');
  end if;
  if exists (select 1 from public.wf_reward_events where guide_id = p_guide_id and kind = 'guide_published') then
    return pg_catalog.jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  end if;
  select count(*) into v_count from public.wf_reward_events
    where user_id = p_user_id and kind = 'guide_published' and month = v_month;
  if v_count >= 3 then
    return pg_catalog.jsonb_build_object('awarded', false, 'reason', 'monthly_cap');
  end if;
  insert into public.wf_reward_events (user_id, guide_id, kind, points, month)
    values (p_user_id, p_guide_id, 'guide_published', 20, v_month);
  insert into public.wf_rewards_profile (user_id) values (p_user_id) on conflict (user_id) do nothing;
  update public.wf_rewards_profile set
    points = points + 20,
    guides_published = guides_published + 1,
    updated_at = pg_catalog.now()
  where user_id = p_user_id
  returning * into v_prof;
  return pg_catalog.jsonb_build_object('awarded', true, 'points_awarded', 20, 'profile', pg_catalog.to_jsonb(v_prof));
end $$;

-- This month's leaderboard: opted in members with a public name only.
create or replace function public.wf_leaderboard(p_month text, p_limit integer default 25)
returns table (rank bigint, public_name text, tier text, points bigint, verified_visits integer, guides_published integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with month_points as (
    select e.user_id, sum(e.points)::bigint as pts
    from public.wf_reward_events e
    where e.month = p_month
    group by e.user_id
  )
  select pg_catalog.row_number() over (order by m.pts desc, p.verified_visits desc, p.public_name) as rank,
         p.public_name, p.tier, m.pts, p.verified_visits, p.guides_published
  from month_points m
  join public.wf_rewards_profile p on p.user_id = m.user_id
  where p.leaderboard_opt_in and p.public_name is not null and m.pts > 0
    and p_month ~ '^[0-9]{4}-[0-9]{2}$'
  order by m.pts desc, p.verified_visits desc, p.public_name
  limit least(greatest(coalesce(p_limit, 25), 1), 50)
$$;

revoke all on function public.wf_ai_user_take(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.wf_award_guide(uuid, uuid) from public, anon, authenticated;
revoke all on function public.wf_leaderboard(text, integer) from public, anon, authenticated;
grant execute on function public.wf_ai_user_take(uuid, text, integer) to service_role;
grant execute on function public.wf_award_guide(uuid, uuid) to service_role;
grant execute on function public.wf_leaderboard(text, integer) to service_role;

commit;
