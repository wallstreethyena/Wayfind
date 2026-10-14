-- Command Center: count the partner clicks the app actually writes, and let
-- confirmed test devices be excluded by device_id (2026-10-02, analytics
-- reconciliation; #1603).
--
-- 1. PARTNER CLICKS. wf_cc_out_actions() counted maps_list (a "see this list
--    on the map" intent, never a partner click) and missed book_it_out,
--    partner_program_out and sponsor_out, which the app writes. hotel_out /
--    eats_out / ta_out are kept: 16 stored July rows are real partner clicks.
--    The Detail sheet's primary CTA (primary_cta_clicked) also fires for
--    plan/directions/menu taps, so it is counted through the new predicate
--    wf_cc_is_out(action, meta): partner when meta.monetized is true (written
--    since 2026-10-02); older rows when they carry a provider (production,
--    2026-10-02: 11 provider rows, all partner rungs; 95 without, none).
--    Every out-click reader (kpis, daily, top_places, breakdown, funnel,
--    time_to_action) now calls the predicate instead of the bare list.
--    A read-time change: no events row is written, updated or deleted.
--
-- 2. REFERRERS. Session rows written before #1623 (2026-10-02) stored the entry
--    type ("share"/"direct") in meta.ref, which wf_cc_breakdown('referrer') then
--    showed as if it were a referring site (W1 2026-09-24..10-01: "share" 343,
--    "direct" 111). Those legacy values now read "(entry: Wayfind share link)" and
--    "(direct/none)"; new rows carry the real referring host.
--
-- 3. #1603 DEVICE EXCLUSION. wf_cc_excluded_devices() also returns the device
--    ids listed in wf_cc_settings 'exclude_devices' (jsonb array). The row does
--    not exist after this migration: nothing is excluded until the owner adds a
--    CONFIRMED test device id. Reversible by editing or deleting that row.
--
-- Mirrors supabase/command-center.sql exactly (the function bodies below are
-- copied from it; scripts/test-cc-partner-click-predicate.mjs checks they match
-- byte for byte. The SQL was executed against PGlite at authoring time; the
-- guard itself is text-only).
--
-- ROLLBACK: re-run the previous definitions from git (supabase/command-center.sql
-- at the parent commit) and `drop function if exists public.wf_cc_is_out(text,jsonb);`.

create or replace function public.wf_cc_out_actions()
returns text[] language sql immutable as
$$ select array['tickets_out','coupon_out','tour_card_out','book_it_out','partner_program_out','sponsor_out','hotel_out','eats_out','ta_out'] $$;

create or replace function public.wf_cc_is_out(_action text, _meta jsonb)
returns boolean language sql immutable as
$$ select _action = any(public.wf_cc_out_actions())
       or (_action = 'primary_cta_clicked'
           and case when (coalesce(_meta, '{}'::jsonb) -> 'monetized') is not null then (_meta->>'monetized') = 'true'
                    else coalesce(_meta->>'provider','') <> '' end) $$;

create or replace function public.wf_cc_excluded_devices()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct e.device_id from public.events e
  where e.user_id in (select public.wf_cc_excluded_users()) and e.device_id is not null
  union
  select trim(d) from public.wf_cc_settings s, jsonb_array_elements_text(
    case when jsonb_typeof(s.v) = 'array' then s.v else '[]'::jsonb end) as d
  where s.k = 'exclude_devices' and nullif(trim(d), '') is not null
$$;

create or replace function public.wf_cc_kpis(_from timestamptz, _to timestamptz)
returns table(metric text, n bigint)
language sql stable security definer set search_path = public as $$
  with w as (
    select action, device_id, user_id, public.wf_cc_is_out(action, meta) as is_out from public.events
    where created_at >= _from and created_at < _to
      and (device_id is null or device_id not in (select public.wf_cc_excluded_devices()))
      and (user_id is null or user_id not in (select public.wf_cc_excluded_users()))
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
    union all select 'out_clicks', count(*) filter (where is_out) from w
    union all select 'engaged_devices', count(distinct device_id) filter (where action = any(public.wf_cc_engage_actions()) or is_out) from w
    union all select 'signed_in_devices', count(distinct device_id) filter (where user_id is not null) from w
    union all select 'browse_devices', count(distinct device_id) filter (where action = any(public.wf_cc_browse_actions())) from w
    union all select 'open_devices', count(distinct device_id) filter (where action in ('detail_open','event_open')) from w
  ) m
$$;

create or replace function public.wf_cc_daily(_from timestamptz, _to timestamptz, _tz text default 'America/New_York')
returns table(day date, devices bigint, sessions bigint, screen_views bigint, detail_opens bigint,
              saves bigint, likes bigint, shares bigint, directions bigint, out_clicks bigint,
              searches bigint, no_results bigint, engaged_devices bigint,
              browse_devices bigint, open_devices bigint)
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
         count(*) filter (where public.wf_cc_is_out(action, meta)) as out_clicks,
         count(*) filter (where action = 'search') as searches,
         count(*) filter (where action = 'places_none') as no_results,
         count(distinct device_id) filter (where action = any(public.wf_cc_engage_actions()) or public.wf_cc_is_out(action, meta)) as engaged_devices,
         count(distinct device_id) filter (where action = any(public.wf_cc_browse_actions())) as browse_devices,
         count(distinct device_id) filter (where action in ('detail_open','event_open')) as open_devices
  from public.events
  where created_at >= _from and created_at < _to
    and (device_id is null or device_id not in (select public.wf_cc_excluded_devices()))
    and (user_id is null or user_id not in (select public.wf_cc_excluded_users()))
  group by 1 order by 1
$$;

create or replace function public.wf_cc_top_places(_from timestamptz, _to timestamptz, _bucket text, _limit int default 5)
returns table(place_id text, place_name text, n bigint, devices bigint)
language sql stable security definer set search_path = public as $$
  select place_id, max(coalesce(nullif(place_name,''), place_id)) as place_name,
         count(*) as n, count(distinct device_id) as devices
  from public.events
  where created_at >= _from and created_at < _to
    and place_id is not null and place_id <> ''
    and (device_id is null or device_id not in (select public.wf_cc_excluded_devices()))
    and case _bucket
          when 'view' then action in ('detail_open','event_open')
          when 'save' then action = 'save'
          when 'like' then action = 'like'
          when 'share' then action = 'share'
          when 'directions' then action = 'directions'
          when 'out' then public.wf_cc_is_out(action, meta)
          else false
        end
  group by place_id
  order by n desc, devices desc
  limit least(greatest(coalesce(_limit,5),1),50)
$$;

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
        -- Locations can carry precise street addresses (observed live); any
        -- leading comma-segment containing a digit is stripped to city level.
        when 'no_result'  then coalesce(nullif(meta->>'cat',''),'?') || ' · ' ||
                               coalesce(nullif(regexp_replace(coalesce(meta->>'loc',''), '^[^,]*[0-9][^,]*,\\s*', ''),''),'(unknown area)')
        when 'no_result_city' then coalesce(nullif(regexp_replace(coalesce(meta->>'loc',''), '^[^,]*[0-9][^,]*,\\s*', ''),''),'(unknown area)')
        -- rows before 2026-10-02 (#1623) stored the entry type, not a site: label it as such
        when 'referrer'   then case lower(coalesce(meta->>'ref',''))
                                 when 'share'  then '(entry: Wayfind share link)'
                                 when 'direct' then '(direct/none)'
                                 else coalesce(nullif(lower(split_part(regexp_replace(meta->>'ref','^https?://',''),'/',1)),''),'(direct/none)') end
        when 'share_kind' then nullif(meta->>'kind','')
        when 'curated'    then nullif(meta->>'kind','')
        when 'out_provider' then action
        when 'out_src'    then nullif(meta->>'src','')
      end as k
    from public.events
    where created_at >= _from and created_at < _to
      and (device_id is null or device_id not in (select public.wf_cc_excluded_devices()))
      and case _kind
        when 'screen' then action = 'screen_view'
        when 'category' then action = 'result_count_shown'
        when 'search' then action = 'search' and nullif(trim(meta->>'q'),'') is not null
        when 'no_result' then action = 'places_none'
        when 'no_result_city' then action = 'places_none'
        when 'referrer' then action = 'session'
        when 'share_kind' then action = 'share'
        when 'curated' then action = 'curated_open'
        when 'out_provider' then public.wf_cc_is_out(action, meta)
        when 'out_src' then public.wf_cc_is_out(action, meta)
        else false
      end
  ) t
  where k is not null
  group by k
  order by n desc
  limit least(greatest(coalesce(_limit,10),1),100)
$$;

create or replace function public.wf_cc_funnel(_from timestamptz, _to timestamptz)
returns table(step text, ord int, devices bigint)
language sql stable security definer set search_path = public as $$
  with w as (
    select action, device_id, public.wf_cc_is_out(action, meta) as is_out from public.events
    where created_at >= _from and created_at < _to and device_id is not null
      and device_id not in (select public.wf_cc_excluded_devices())
  )
  select s.step, s.ord, s.devices from (
    select 'Visited'::text as step, 1 as ord, count(distinct device_id) as devices
      from w where action in ('session','screen_view')
    union all
    select 'Browsed or searched', 2, count(distinct device_id)
      from w where action = any(public.wf_cc_browse_actions())
    union all
    select 'Opened a place', 3, count(distinct device_id)
      from w where action in ('detail_open','event_open')
    union all
    select 'Engaged (save/like/share/directions)', 4, count(distinct device_id)
      from w where action = any(public.wf_cc_engage_actions())
    union all
    select 'Clicked a partner link', 5, count(distinct device_id)
      from w where is_out
  ) s order by s.ord
$$;

create or replace function public.wf_cc_time_to_action(_from timestamptz, _to timestamptz)
returns table(devices_measured bigint, median_s numeric, p75_s numeric)
language sql stable security definer set search_path = public as $$
  with per_device as (
    select device_id,
           min(created_at) as t0,
           min(created_at) filter (where action in ('detail_open','event_open')
                                      or action = any(public.wf_cc_engage_actions())
                                      or public.wf_cc_is_out(action, meta)) as t1
    from public.events
    where created_at >= _from and created_at < _to and device_id is not null
      and device_id not in (select public.wf_cc_excluded_devices())
    group by device_id
  ), deltas as (
    select extract(epoch from (t1 - t0)) as s from per_device where t1 is not null and t1 > t0
  )
  select count(*)::bigint,
         round(percentile_cont(0.5) within group (order by s)::numeric, 1),
         round(percentile_cont(0.75) within group (order by s)::numeric, 1)
  from deltas
$$;

-- New function: server-only, like every wf_cc_* function (lock block in
-- supabase/command-center.sql). create or replace keeps the existing grants
-- of the redefined functions.
revoke all on function public.wf_cc_is_out(text,jsonb) from public, anon, authenticated;
grant execute on function public.wf_cc_is_out(text,jsonb) to service_role;
