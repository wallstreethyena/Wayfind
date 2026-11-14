
-- Carousel -> Wayfind inventory reconciliation (owner rule 2026-11-12):
-- every featured experience on a Wayfind carousel must map to a verified
-- canonical record, be eligible for the right Trending shelf, and a carousel
-- may only read 'synced' when every item is resolved.
create table if not exists public.wf_carousels (
  carousel_key text primary key,
  title text not null,
  carousel_date date,
  publish_status text not null default 'unknown' check (publish_status in ('draft','delivered','posted','unknown')),
  sources jsonb not null default '[]'::jsonb,
  sync_state text not null default 'pending' check (sync_state in ('pending','synced','blocked')),
  sync_checked_at timestamptz,
  sync_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wf_carousel_items (
  carousel_key text not null references public.wf_carousels(carousel_key) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null,
  venue text,
  city text,
  region text,
  kind text not null check (kind in ('event','attraction','restaurant','bar','shop','park','destination','deal','transit','other')),
  when_text text,
  canonical_kind text not null default 'none' check (canonical_kind in ('event','place','parent_event','none')),
  event_id text references public.wf_events(event_id) on delete restrict,
  place_id text,
  match_state text not null default 'pending' check (match_state in ('pending','matched','created','pending_evidence','expired_not_created','not_listable')),
  blocker text,
  trending_state text not null default 'unknown' check (trending_state in ('unknown','tagged','eligible_when_in_window','needs_code','not_applicable','expired','blocked')),
  trend_rail text check (trend_rail in ('food','festivals','parties','shows','more')),
  image_state text not null default 'unknown' check (image_state in ('unknown','venue_photo','owned','creator','scene_fallback','missing','not_applicable')),
  image_credit text,
  ticket_state text not null default 'unknown' check (ticket_state in ('unknown','verified','none_needed','broken','not_applicable')),
  evidence text,
  prod_verified_at timestamptz,
  prod_evidence text,
  updated_at timestamptz not null default now(),
  primary key (carousel_key, item_key),
  constraint resolved_needs_ref check (
    match_state not in ('matched','created')
    or (canonical_kind in ('event','parent_event') and event_id is not null)
    or (canonical_kind = 'place' and place_id is not null)),
  constraint blocked_needs_reason check (match_state not in ('pending_evidence','not_listable','expired_not_created') or blocker is not null),
  constraint creator_needs_credit check (image_state <> 'creator' or image_credit is not null)
);
create index if not exists wf_carousel_items_event_idx on public.wf_carousel_items(event_id);
create index if not exists wf_carousel_items_place_idx on public.wf_carousel_items(place_id);

alter table public.wf_carousels enable row level security;
alter table public.wf_carousel_items enable row level security;
revoke all on public.wf_carousels, public.wf_carousel_items from anon, authenticated;

-- The guard. Every row is a violation; severity 'error' blocks 'synced'.
create or replace function public.wf_carousel_guard()
returns table(check_name text, severity text, carousel_key text, item_key text, detail text)
language sql stable set search_path = public as $$
  with today as (select (now() at time zone 'America/New_York')::date d),
  it as (select i.*, c.sync_state, c.created_at c_created from wf_carousel_items i join wf_carousels c using (carousel_key)),
  ev as (select it.*, e.event_status, e.start_date, coalesce(e.end_date,e.start_date) e_end, e.tags e_tags, e.city e_city,
                e.hero_image, e.link_ok, e.link_verdict, e.official_ticket_url, e.verification_confidence, e.event_series_id, e.year e_year
         from it join wf_events e on e.event_id = it.event_id)
  -- 1 carousel items with no canonical decision
  select 'item_unresolved', case when now() - it.c_created > interval '24 hours' then 'error' else 'warn' end, it.carousel_key, it.item_key,
         'match_state=pending: "'||it.name||'" has no Wayfind record decision' from it where it.match_state = 'pending'
  union all
  -- 2 place reference that does not exist / is excluded
  select 'dangling_place', 'error', it.carousel_key, it.item_key, 'place_id '||it.place_id||' not in wf_inventory (or excluded)'
  from it where it.place_id is not null and it.match_state in ('matched','created')
    and not exists (select 1 from wf_inventory i where i.place_id = it.place_id and coalesce(i.excluded,false) = false)
  union all
  -- 3 duplicate canonical rows for the same series+year that are both displayable
  select 'duplicate_canonical', 'error', ev.carousel_key, ev.item_key,
         'series '||ev.event_series_id||' has '||(select count(*) from wf_events d where d.event_series_id=ev.event_series_id and d.year=ev.e_year and d.event_status in ('scheduled','sold_out'))||' displayable rows'
  from ev where (select count(*) from wf_events d where d.event_series_id=ev.event_series_id and d.year=ev.e_year and d.event_status in ('scheduled','sold_out')) > 1
  union all
  -- 4 expired event still shown as upcoming
  select 'expired_displayed', 'error', ev.carousel_key, ev.item_key, ev.event_id||' ended '||ev.e_end||' but event_status='||ev.event_status
  from ev, today where ev.e_end < today.d and ev.event_status in ('scheduled','sold_out')
  union all
  -- 5 live event featured on a carousel but not eligible for Trending
  select 'trending_missing', 'error', ev.carousel_key, ev.item_key,
         ev.event_id||' is live/upcoming but lacks wf-trending + trend-<shelf> tags'
  from ev, today where ev.event_status in ('scheduled','sold_out') and ev.e_end >= today.d
    and ev.trending_state not in ('blocked','not_applicable')
    and not (ev.e_tags @> array['wf-trending'] and exists (select 1 from unnest(ev.e_tags) t where t in ('trend-food','trend-festivals','trend-parties','trend-shows','trend-more')))
  union all
  -- 6 region mismatch between the carousel claim and the record
  select 'wrong_region', 'warn', ev.carousel_key, ev.item_key, 'carousel city '||ev.city||' vs record city '||coalesce(ev.e_city,'null')
  from ev where ev.city is not null and ev.e_city is not null and ev.canonical_kind = 'event'
    and lower(ev.e_city) <> lower(ev.city) and position(lower(ev.e_city) in lower(ev.city)) = 0 and position(lower(ev.city) in lower(ev.e_city)) = 0
  union all
  -- 7 broken photo or ticket link on a live record
  select 'image_missing', 'warn', ev.carousel_key, ev.item_key, ev.event_id||' has no hero_image (scene fallback renders)'
  from ev, today where ev.hero_image is null and ev.event_status in ('scheduled','sold_out') and ev.e_end >= today.d
  union all
  select 'link_broken', 'error', ev.carousel_key, ev.item_key, ev.event_id||' link_ok=false / verdict '||coalesce(ev.link_verdict,'?')
  from ev, today where ev.event_status in ('scheduled','sold_out') and ev.e_end >= today.d and (ev.link_ok = false or ev.link_verdict in ('dead','broken','not_found'))
  union all
  select 'ticket_broken', 'error', it.carousel_key, it.item_key, 'ticket_state=broken' from it where it.ticket_state = 'broken'
  union all
  -- 8 creator media with no credit (also blocked by constraint; kept as defence in depth)
  select 'creator_credit_missing', 'error', it.carousel_key, it.item_key, 'creator image without credit'
  from it where it.image_state = 'creator' and coalesce(it.image_credit,'') = ''
  union all
  -- 9 false success: a carousel says synced while an item is unresolved
  select 'false_success', 'error', it.carousel_key, it.item_key, 'carousel marked synced but item match_state='||it.match_state||' trending_state='||it.trending_state
  from it where it.sync_state = 'synced' and (it.match_state = 'pending' or it.trending_state = 'unknown');
$$;
revoke all on function public.wf_carousel_guard() from public, anon, authenticated;

-- The runner: recompute each carousel's sync state from the guard, write a pulse.
create or replace function public.wf_carousel_sync_run()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_err int; v_warn int; v_items int; v_open int; v_sum jsonb; v_note text;
begin
  -- a carousel is synced only when it has items, none pending/unknown, and zero error violations
  update wf_carousels c set
    sync_state = case
      when not exists (select 1 from wf_carousel_items i where i.carousel_key = c.carousel_key) then 'pending'
      when exists (select 1 from wf_carousel_guard() g where g.carousel_key = c.carousel_key and g.severity = 'error' and g.check_name <> 'false_success') then 'blocked'
      when exists (select 1 from wf_carousel_items i where i.carousel_key = c.carousel_key and (i.match_state = 'pending' or i.trending_state = 'unknown')) then 'pending'
      else 'synced' end,
    sync_checked_at = now(), updated_at = now();
  select count(*) filter (where severity='error'), count(*) filter (where severity='warn') into v_err, v_warn from wf_carousel_guard();
  select count(*), count(*) filter (where match_state in ('pending','pending_evidence')) into v_items, v_open from wf_carousel_items;
  select jsonb_object_agg(check_name, n) into v_sum from (select check_name, count(*) n from wf_carousel_guard() group by 1) s;
  v_note := case when v_err = 0 then 'clean: ' else 'RED: ' end || v_err || ' error, ' || v_warn || ' warn | items ' || v_items || ' open ' || v_open
            || ' | carousels synced ' || (select count(*) from wf_carousels where sync_state='synced') || '/' || (select count(*) from wf_carousels)
            || ' | ' || coalesce(v_sum::text,'{}');
  insert into wf_job_pulse(job, attempted, succeeded, failed, note) values ('carousel-sync', 1, case when v_err=0 then 1 else 0 end, case when v_err=0 then 0 else 1 end, left(v_note, 480));
  return jsonb_build_object('errors', v_err, 'warns', v_warn, 'items', v_items, 'open', v_open, 'by_check', coalesce(v_sum,'{}'::jsonb));
end $$;
revoke all on function public.wf_carousel_sync_run() from public, anon, authenticated;
