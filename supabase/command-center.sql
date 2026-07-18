-- ============================================================
-- Wayfind Command Center — read-only aggregate RPCs (v1)
-- ============================================================
-- ADDITIVE ONLY: creates functions + one index. No table changes, no data
-- changes, no policy changes. Rollback = the DROP block at the bottom.
--
-- Security model:
--   • Every function is SECURITY DEFINER with a pinned search_path, so it can
--     aggregate tables that RLS hides from clients (events, auth.users).
--   • EXECUTE is REVOKED from PUBLIC/anon/authenticated and granted ONLY to
--     service_role — these are reachable exclusively from server code holding
--     SUPABASE_SERVICE_ROLE_KEY (the /api/command-center routes). A browser
--     with the anon key gets "permission denied" by construction.
--   • Nothing row-level ever leaves: no device_id, no user_id, no emails —
--     aggregates only. Search terms are length-capped and email-masked.
--
-- Timezone: "a day" is a SITE-LOCAL (US Eastern) day, matching
-- lib/siteTime.js — never a UTC day (the 8 PM ET rollover bug class).
-- ============================================================

create index if not exists events_created_idx on public.events (created_at);

-- Affiliate / outbound partner click actions (kept in ONE place server-side;
-- lib/commandCenter/eventMap.js mirrors this list for the UI legend).
create or replace function public.wf_cc_out_actions()
returns text[] language sql immutable as
$$ select array['tickets_out','hotel_out','coupon_out','eats_out','ta_out','tour_card_out','maps_list'] $$;

-- Engagement actions = a "meaningful action" on a place or surface.
create or replace function public.wf_cc_engage_actions()
returns text[] language sql immutable as
$$ select array['save','like','share','directions','coupon_save','user_comment'] $$;

create or replace function public.wf_cc_tz(_tz text)
returns text language sql immutable as
$$ select case when _tz in ('America/New_York','UTC') then _tz else 'America/New_York' end $$;

-- ------------------------------------------------------------
-- 1) One-scan KPI counts for an arbitrary window.
-- ------------------------------------------------------------
create or replace function public.wf_cc_kpis(_from timestamptz, _to timestamptz)
returns table(metric text, n bigint)
language sql stable security definer set search_path = public as $$
  with w as (
    select action, device_id, user_id from public.events
    where created_at >= _from and created_at < _to
  )
  select m.metric, m.n from (
    select 'sessions'::text as metric, count(*) filter (where action = 'session') as n from w
    union all select 'active_devices', count(distinct device_id) from w
    union all select 'screen_views', count(*) filter (where action = 'screen_view') from w
    union all select 'detail_opens', count(*) filter (where action in ('detail_open','event_open')) from w
    union all select 'saves', count(*) filter (where action = 'save') from w
    union all select 'likes', count(*) filter (where action = 'like') from w
    union all select 'shares', count(*) filter (where action = 'share') from w
    union all select 'directions', count(*) filter (where action = 'directions') from w
    union all select 'searches', count(*) filter (where action = 'search') from w
    union all select 'no_result_searches', count(*) filter (where action = 'places_none') from w
    union all select 'out_clicks', count(*) filter (where action = any(public.wf_cc_out_actions())) from w
    union all select 'engaged_devices', count(distinct device_id) filter (where action = any(public.wf_cc_engage_actions()) or action = any(public.wf_cc_out_actions())) from w
    union all select 'signed_in_devices', count(distinct device_id) filter (where user_id is not null) from w
  ) m
$$;

-- ------------------------------------------------------------
-- 2) Daily series (site-local days).
-- ------------------------------------------------------------
create or replace function public.wf_cc_daily(_from timestamptz, _to timestamptz, _tz text default 'America/New_York')
returns table(day date, devices bigint, sessions bigint, screen_views bigint, detail_opens bigint,
              saves bigint, likes bigint, shares bigint, directions bigint, out_clicks bigint,
              searches bigint, no_results bigint, engaged_devices bigint)
language sql stable security definer set search_path = public as $$
  select (created_at at time zone public.wf_cc_tz(_tz))::date as day,
         count(distinct device_id) as devices,
         count(*) filter (where action = 'session') as sessions,
         count(*) filter (where action = 'screen_view') as screen_views,
         count(*) filter (where action in ('detail_open','event_open')) as detail_opens,
         count(*) filter (where action = 'save') as saves,
         count(*) filter (where action = 'like') as likes,
         count(*) filter (where action = 'share') as shares,
         count(*) filter (where action = 'directions') as directions,
         count(*) filter (where action = any(public.wf_cc_out_actions())) as out_clicks,
         count(*) filter (where action = 'search') as searches,
         count(*) filter (where action = 'places_none') as no_results,
         count(distinct device_id) filter (where action = any(public.wf_cc_engage_actions()) or action = any(public.wf_cc_out_actions())) as engaged_devices
  from public.events
  where created_at >= _from and created_at < _to
  group by 1 order by 1
$$;

-- ------------------------------------------------------------
-- 3) Per-minute live series (last hour view).
-- ------------------------------------------------------------
create or replace function public.wf_cc_minutes(_from timestamptz, _to timestamptz)
returns table(minute timestamptz, devices bigint, events bigint)
language sql stable security definer set search_path = public as $$
  select date_trunc('minute', created_at) as minute,
         count(distinct device_id) as devices,
         count(*) as events
  from public.events
  where created_at >= _from and created_at < _to
  group by 1 order by 1
$$;

-- ------------------------------------------------------------
-- 4) Top places by interaction bucket.
--    _bucket: view | save | like | share | directions | out
-- ------------------------------------------------------------
create or replace function public.wf_cc_top_places(_from timestamptz, _to timestamptz, _bucket text, _limit int default 5)
returns table(place_id text, place_name text, n bigint, devices bigint)
language sql stable security definer set search_path = public as $$
  select place_id, max(coalesce(nullif(place_name,''), place_id)) as place_name,
         count(*) as n, count(distinct device_id) as devices
  from public.events
  where created_at >= _from and created_at < _to
    and place_id is not null and place_id <> ''
    and case _bucket
          when 'view' then action in ('detail_open','event_open')
          when 'save' then action = 'save'
          when 'like' then action = 'like'
          when 'share' then action = 'share'
          when 'directions' then action = 'directions'
          when 'out' then action = any(public.wf_cc_out_actions())
          else false
        end
  group by place_id
  order by n desc, devices desc
  limit least(greatest(coalesce(_limit,5),1),50)
$$;

-- ------------------------------------------------------------
-- 5) Generic breakdowns (searches, referrers, screens, categories…).
--    Search terms: length-capped, email-masked. Referrers: host only.
-- ------------------------------------------------------------
create or replace function public.wf_cc_breakdown(_from timestamptz, _to timestamptz, _kind text, _limit int default 10)
returns table(k text, n bigint, devices bigint)
language sql stable security definer set search_path = public as $$
  select k, count(*) as n, count(distinct device_id) as devices from (
    select device_id,
      case _kind
        when 'screen'     then nullif(meta->>'screen','')
        when 'category'   then nullif(meta->>'cat','')
        when 'search'     then case when (meta->>'q') ~ '@' then '[contains email — hidden]'
                                    else left(lower(trim(meta->>'q')), 80) end
        when 'no_result'  then coalesce(nullif(meta->>'cat',''),'?') || ' · ' || coalesce(nullif(meta->>'loc',''),'?')
        when 'referrer'   then coalesce(nullif(lower(split_part(regexp_replace(meta->>'ref','^https?://',''),'/',1)),''),'(direct/none)')
        when 'share_kind' then nullif(meta->>'kind','')
        when 'curated'    then nullif(meta->>'kind','')
        when 'out_provider' then action
        when 'out_src'    then nullif(meta->>'src','')
      end as k
    from public.events
    where created_at >= _from and created_at < _to
      and case _kind
        when 'screen' then action = 'screen_view'
        when 'category' then action = 'result_count_shown'
        when 'search' then action = 'search' and nullif(trim(meta->>'q'),'') is not null
        when 'no_result' then action = 'places_none'
        when 'referrer' then action = 'session'
        when 'share_kind' then action = 'share'
        when 'curated' then action = 'curated_open'
        when 'out_provider' then action = any(public.wf_cc_out_actions())
        when 'out_src' then action = any(public.wf_cc_out_actions())
        else false
      end
  ) t
  where k is not null
  group by k
  order by n desc
  limit least(greatest(coalesce(_limit,10),1),100)
$$;

-- ------------------------------------------------------------
-- 6) Journey funnel — distinct devices per step, one scan.
-- ------------------------------------------------------------
create or replace function public.wf_cc_funnel(_from timestamptz, _to timestamptz)
returns table(step text, ord int, devices bigint)
language sql stable security definer set search_path = public as $$
  with w as (
    select action, device_id from public.events
    where created_at >= _from and created_at < _to and device_id is not null
  )
  select s.step, s.ord, s.devices from (
    select 'Visited'::text as step, 1 as ord, count(distinct device_id) as devices
      from w where action in ('session','screen_view')
    union all
    select 'Browsed or searched', 2, count(distinct device_id)
      from w where action in ('result_count_shown','search','intent_chip','curated_open','mood_tile','map_pin_selected','discovery_tile','hero_tap')
    union all
    select 'Opened a place', 3, count(distinct device_id)
      from w where action in ('detail_open','event_open')
    union all
    select 'Engaged (save/like/share/directions)', 4, count(distinct device_id)
      from w where action = any(public.wf_cc_engage_actions())
    union all
    select 'Clicked a partner link', 5, count(distinct device_id)
      from w where action = any(public.wf_cc_out_actions())
  ) s order by s.ord
$$;

-- ------------------------------------------------------------
-- 7) Signups per site-local day (auth.users; definer read).
-- ------------------------------------------------------------
create or replace function public.wf_cc_signups(_from timestamptz, _to timestamptz, _tz text default 'America/New_York')
returns table(day date, signups bigint)
language sql stable security definer set search_path = public as $$
  select (created_at at time zone public.wf_cc_tz(_tz))::date as day, count(*) as signups
  from auth.users
  where created_at >= _from and created_at < _to and coalesce(is_anonymous, false) = false
  group by 1 order by 1
$$;

-- ------------------------------------------------------------
-- 8) Account + engagement totals (all-time).
-- ------------------------------------------------------------
create or replace function public.wf_cc_user_totals()
returns table(metric text, n bigint)
language sql stable security definer set search_path = public as $$
  select 'total_users'::text, count(*)::bigint from auth.users where coalesce(is_anonymous,false) = false
  union all select 'confirmed_users', count(*)::bigint from auth.users where email_confirmed_at is not null
  union all select 'users_with_saves', count(distinct user_id)::bigint from public.saved_places
  union all select 'users_with_likes', count(distinct user_id)::bigint from public.likes
  union all select 'users_with_comments', count(distinct user_id)::bigint from public.comments where user_id is not null
  union all select 'users_active_ever', count(distinct user_id)::bigint from public.events where user_id is not null
  union all select 'saved_places_total', count(*)::bigint from public.saved_places
  union all select 'shared_lists_total', count(*)::bigint from public.shared_lists
$$;

-- ------------------------------------------------------------
-- 9) Device retention by first-seen day: D1 / D7 / D30 returns.
-- ------------------------------------------------------------
create or replace function public.wf_cc_retention(_from timestamptz, _to timestamptz, _tz text default 'America/New_York')
returns table(day date, new_devices bigint, d1 bigint, d7 bigint, d30 bigint)
language sql stable security definer set search_path = public as $$
  with firsts as (
    select device_id, min(created_at) as first_at
    from public.events where device_id is not null group by device_id
  ), cohort as (
    select device_id, first_at, (first_at at time zone public.wf_cc_tz(_tz))::date as day
    from firsts where first_at >= _from and first_at < _to
  )
  select c.day, count(distinct c.device_id) as new_devices,
    count(distinct c.device_id) filter (where exists (
      select 1 from public.events e where e.device_id = c.device_id
        and e.created_at >= c.first_at + interval '1 day' and e.created_at < c.first_at + interval '2 day')) as d1,
    count(distinct c.device_id) filter (where exists (
      select 1 from public.events e where e.device_id = c.device_id
        and e.created_at >= c.first_at + interval '1 day' and e.created_at < c.first_at + interval '8 day')) as d7,
    count(distinct c.device_id) filter (where exists (
      select 1 from public.events e where e.device_id = c.device_id
        and e.created_at >= c.first_at + interval '1 day' and e.created_at < c.first_at + interval '31 day')) as d30
  from cohort c group by c.day order by c.day
$$;

-- ------------------------------------------------------------
-- 10) Weekly signup cohorts — signed-in activity by weeks since signup.
-- ------------------------------------------------------------
create or replace function public.wf_cc_cohorts_weekly(_weeks int default 8, _tz text default 'America/New_York')
returns table(week_start date, new_users bigint, week_offset int, active_users bigint)
language sql stable security definer set search_path = public as $$
  with u as (
    select id, date_trunc('week', created_at at time zone public.wf_cc_tz(_tz))::date as wk
    from auth.users
    where coalesce(is_anonymous,false) = false
      and created_at >= now() - make_interval(weeks => least(greatest(coalesce(_weeks,8),1),26))
  ), sizes as (
    select wk, count(*) as new_users from u group by wk
  ), act as (
    select u.wk, (((e.created_at at time zone public.wf_cc_tz(_tz))::date - u.wk) / 7)::int as week_offset,
           count(distinct u.id) as active_users
    from u join public.events e on e.user_id = u.id
    where (e.created_at at time zone public.wf_cc_tz(_tz))::date >= u.wk
    group by u.wk, 2
  )
  select s.wk as week_start, s.new_users, a.week_offset, a.active_users
  from sizes s left join act a on a.wk = s.wk
  order by s.wk, a.week_offset
$$;

-- ------------------------------------------------------------
-- 11) New vs returning devices per day.
-- ------------------------------------------------------------
create or replace function public.wf_cc_new_returning(_from timestamptz, _to timestamptz, _tz text default 'America/New_York')
returns table(day date, new_devices bigint, returning_devices bigint)
language sql stable security definer set search_path = public as $$
  with firsts as (
    select device_id, min(created_at) as first_at
    from public.events where device_id is not null group by device_id
  ), act as (
    select e.device_id, (e.created_at at time zone public.wf_cc_tz(_tz))::date as day, min(f.first_at) as first_at
    from public.events e join firsts f on f.device_id = e.device_id
    where e.created_at >= _from and e.created_at < _to
    group by e.device_id, 2
  )
  select day,
         count(*) filter (where (first_at at time zone public.wf_cc_tz(_tz))::date = day) as new_devices,
         count(*) filter (where (first_at at time zone public.wf_cc_tz(_tz))::date <> day) as returning_devices
  from act group by day order by day
$$;

-- ------------------------------------------------------------
-- 12) Lab Core Web Vitals — latest PageSpeed cron run per URL + 7-day trend.
-- ------------------------------------------------------------
create or replace function public.wf_cc_lab_cwv()
returns table(url text, strategy text, runs_7d bigint, last_run timestamptz,
              perf_score int, lcp_ms numeric, cls numeric, tbt_ms numeric, ttfb_ms numeric,
              avg7_lcp_ms numeric, avg7_cls numeric)
language sql stable security definer set search_path = public as $$
  with recent as (
    select * from public.cwv_runs where run_at >= now() - interval '7 days'
  ), latest as (
    select distinct on (url) url, strategy, run_at, perf_score, lcp_ms, cls, tbt_ms, ttfb_ms
    from recent order by url, run_at desc
  ), avg7 as (
    select url, count(*) as runs, round(avg(lcp_ms)) as avg_lcp, round(avg(cls)::numeric, 3) as avg_cls
    from recent group by url
  )
  select l.url, l.strategy, coalesce(a.runs, 0), l.run_at,
         l.perf_score, l.lcp_ms, l.cls, l.tbt_ms, l.ttfb_ms,
         a.avg_lcp, a.avg_cls
  from latest l left join avg7 a on a.url = l.url
  order by l.run_at desc
  limit 40
$$;

-- ------------------------------------------------------------
-- Lock down: server-only execution.
-- ------------------------------------------------------------
do $lock$
declare fn text;
begin
  foreach fn in array array[
    'wf_cc_out_actions()','wf_cc_engage_actions()','wf_cc_tz(text)',
    'wf_cc_kpis(timestamptz,timestamptz)',
    'wf_cc_daily(timestamptz,timestamptz,text)',
    'wf_cc_minutes(timestamptz,timestamptz)',
    'wf_cc_top_places(timestamptz,timestamptz,text,int)',
    'wf_cc_breakdown(timestamptz,timestamptz,text,int)',
    'wf_cc_funnel(timestamptz,timestamptz)',
    'wf_cc_signups(timestamptz,timestamptz,text)',
    'wf_cc_user_totals()',
    'wf_cc_retention(timestamptz,timestamptz,text)',
    'wf_cc_cohorts_weekly(int,text)',
    'wf_cc_new_returning(timestamptz,timestamptz,text)',
    'wf_cc_lab_cwv()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end
$lock$;

-- ============================================================
-- ROLLBACK (run to remove everything this file added):
--   drop function if exists public.wf_cc_lab_cwv();
--   drop function if exists public.wf_cc_new_returning(timestamptz,timestamptz,text);
--   drop function if exists public.wf_cc_cohorts_weekly(int,text);
--   drop function if exists public.wf_cc_retention(timestamptz,timestamptz,text);
--   drop function if exists public.wf_cc_user_totals();
--   drop function if exists public.wf_cc_signups(timestamptz,timestamptz,text);
--   drop function if exists public.wf_cc_funnel(timestamptz,timestamptz);
--   drop function if exists public.wf_cc_breakdown(timestamptz,timestamptz,text,int);
--   drop function if exists public.wf_cc_top_places(timestamptz,timestamptz,text,int);
--   drop function if exists public.wf_cc_minutes(timestamptz,timestamptz);
--   drop function if exists public.wf_cc_daily(timestamptz,timestamptz,text);
--   drop function if exists public.wf_cc_kpis(timestamptz,timestamptz);
--   drop function if exists public.wf_cc_tz(text);
--   drop function if exists public.wf_cc_engage_actions();
--   drop function if exists public.wf_cc_out_actions();
--   drop index if exists public.events_created_idx;
-- ============================================================
