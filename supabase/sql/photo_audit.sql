-- supabase/sql/photo_audit.sql — Wayfind photo inventory audit. READ-ONLY, zero spend.
-- Only SELECTs. No DDL, no DML, no Google calls. Run each query separately
-- (Supabase SQL editor, or the execute_sql tool). Definitions: docs/PHOTO_AUDIT.md.
-- published = not coalesce(excluded,false) and status = 'OPERATIONAL'.

-- Q1. Published inventory: total, with/without a photo_ref, malformed refs, hard gap.
-- PHOTO_REF_RX (lib/placePhotoServe.js) = ^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$
with pub as (
  select i.place_id, nullif(btrim(i.photo_ref), '') as ref
  from public.wf_inventory i
  where not coalesce(i.excluded, false) and i.status = 'OPERATIONAL'
), act as (
  select place_id from public.wf_place_photo where status = 'active'
)
select
  count(*)                                                                            as published,
  count(*) filter (where ref is not null)                                             as has_ref,
  count(*) filter (where ref is null)                                                 as no_ref,
  count(*) filter (where ref is not null and ref !~ '^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$') as malformed_ref,
  count(*) filter (where p.place_id in (select place_id from act))                    as has_active_owned_photo,
  count(*) filter (where ref is null and p.place_id not in (select place_id from act)) as hard_gap_no_ref_no_owned
from pub p;

-- Q2. wf_place_photo by status (and how many rows have a stored file).
select status, count(*) as n, count(*) filter (where storage_path is not null) as with_storage_path
from public.wf_place_photo
group by status order by n desc;

-- Q3. wf_photo_repair_queue: status x failure_reason histogram.
select status, failure_reason, count(*) as n
from public.wf_photo_repair_queue
group by status, failure_reason order by status, n desc;

-- Q4. wf_photo_outcome_daily, last 14 days, by class (production classes are bare;
-- preview:/dev: prefixes are non-production). Bucketing is done by the script / doc.
select class, sum(n) as n, min(day) as first_day, max(day) as last_day
from public.wf_photo_outcome_daily
where day >= (now() at time zone 'America/New_York')::date - 14
group by class order by n desc;

-- Q5. Events: hero image kind (columns hero_image, hero_image_kind on wf_events).
select coalesce(hero_image_kind, case when nullif(btrim(hero_image), '') is null then '(no image)' else '(unclassified)' end) as image_kind,
       count(*) as n
from public.wf_events
group by 1 order by n desc;

-- Q6. Blog posts (published rows). Resolving each pick to a venue is name + distance
-- logic (lib/creditedPhotoTargets.js blogTargets); scripts/photo-inventory-audit.mjs does it.
select count(*) as published_blog_posts
from public.wf_blog_posts
where published_at <= now();
