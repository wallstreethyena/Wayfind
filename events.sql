-- ============================================================
-- Wayfind: pooled engagement events
-- Run this once in Supabase → SQL Editor → New query → Run.
-- This is the proprietary signal Google can't give you:
-- what real people like, save, and share.
-- ============================================================

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  action      text not null,          -- like | dislike | save | share | share_open
  place_id    text,                   -- Google place id (null for app/list shares)
  place_name  text,
  device_id   text,                   -- anonymous, stable per device
  user_id     uuid references auth.users(id),  -- set only when signed in
  meta        jsonb                   -- e.g. {"kind":"list","n":5}
);

create index if not exists events_action_created_idx on public.events (action, created_at);
create index if not exists events_place_idx           on public.events (place_id);
create index if not exists events_device_idx          on public.events (device_id);

-- Row-level security: allow INSERT from the app, but NO client read access.
-- (You read the data in the SQL editor below, which bypasses RLS. This stops
-- anyone from scraping your pooled signal through the public app.)
alter table public.events enable row level security;

drop policy if exists "events_insert_anon" on public.events;
create policy "events_insert_anon"
  on public.events
  for insert
  to anon, authenticated
  with check (true);


-- ============================================================
-- WEEKLY REPORT — run any of these in the SQL Editor.
-- Change '7 days' to '30 days' etc. as needed.
-- ============================================================

-- 1) Totals by action, last 7 days
-- select action, count(*) as total
-- from public.events
-- where created_at > now() - interval '7 days'
-- group by action
-- order by total desc;

-- 2) Most-loved places (unique people who liked OR saved), last 7 days
-- select coalesce(place_name, place_id) as place,
--        count(distinct device_id) as people
-- from public.events
-- where action in ('like','save')
--   and created_at > now() - interval '7 days'
-- group by 1
-- order by people desc
-- limit 20;

-- 3) Share loop health — shares created vs shares opened, last 7 days
-- select action, count(*) as total
-- from public.events
-- where action in ('share','share_open')
--   and created_at > now() - interval '7 days'
-- group by action;

-- 4) Engagement return — devices that took an action on 2+ separate days
--    (a proxy for "came back"; for true visit-return, log an 'open' event on load)
-- select count(*) as returning_devices from (
--   select device_id
--   from public.events
--   where created_at > now() - interval '30 days'
--     and device_id is not null
--   group by device_id
--   having count(distinct date(created_at)) >= 2
-- ) t;

-- 5) Daily activity, last 14 days (paste into a chart)
-- select date(created_at) as day, count(*) as events
-- from public.events
-- where created_at > now() - interval '14 days'
-- group by day
-- order by day;
