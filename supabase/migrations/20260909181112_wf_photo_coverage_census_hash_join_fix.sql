-- Corrective re-apply of wf_photo_coverage_census from
-- supabase/migrations/20260909_wf_photo_repair_queue_budget_blocked.sql.
--
-- MEASURED 2026-09-09: the original spelling, `c.k like 'photo|' ||
-- ai.photo_ref || '|%'`, cannot use any index -- a prefix LIKE is only
-- index-eligible when the prefix is a CONSTANT, and here it is built from the
-- other side of the join. EXPLAIN on production returned a Nested Loop with a
-- Join Filter at cost 39,556,129 (~19.8k inventory rows x ~44.8k live cache
-- rows) and the view timed out. split_part(k,'|',2) IS the ref, so joining it
-- to photo_ref by EQUALITY plans as a Parallel Hash Join at cost 12,266 --
-- same result, 3,200x cheaper. If this ever needs to be faster still, the next
-- step is an expression index on split_part(k,'|',2), not a return to the LIKE.
create or replace view public.wf_photo_coverage_census
with (security_invoker = true) as
with active_inventory as (
  select i.place_id, i.photo_ref
  from public.wf_inventory i
  where i.status = 'OPERATIONAL'
),
cache_exact as (
  select ai.place_id, min(c.exp) as earliest_exp
  from active_inventory ai
  join public.wf_places_cache c
    on split_part(c.k, '|', 2) = ai.photo_ref
   and c.k like 'photo|%'
   and c.exp > now()
  where ai.photo_ref is not null
  group by ai.place_id
)
select
  count(*)                                                                       as total,
  count(*) filter (where ai.photo_ref is not null)                               as with_ref,
  count(*) filter (where vp.status = 'active')                                   as vault_active,
  count(*) filter (where vp.status = 'rejected')                                 as vault_rejected,
  count(*) filter (where ce.place_id is not null)                                as fresh_exact_cache,
  count(*) filter (where ce.earliest_exp is not null
                      and ce.earliest_exp <= now() + interval '7 days')          as expiring_7d,
  count(*) filter (where ce.earliest_exp is not null
                      and ce.earliest_exp <= now() + interval '30 days')         as expiring_30d
from active_inventory ai
left join cache_exact ce      on ce.place_id = ai.place_id
left join public.wf_place_photo vp on vp.place_id = ai.place_id;

revoke all on public.wf_photo_coverage_census from anon, authenticated;
grant select on public.wf_photo_coverage_census to service_role;

comment on view public.wf_photo_coverage_census is
  'Real photo coverage over active (OPERATIONAL) wf_inventory (2026-09-09). total/with_ref describe the population; vault_active/vault_rejected describe how much of it the permanent free lane has resolved; fresh_exact_cache/expiring_7d/expiring_30d describe the Google-rented population''s cliff, using the same photo|<ref>|<width> key-parsing shape wf_photo_at_risk proved -- split_part(k,''|'',2) joined to photo_ref by EQUALITY (a hash join), never a LIKE built from the joined column, which plans as a 39.5M-cost nested loop because a prefix LIKE is only index-eligible when the prefix is constant. expiring_* counts only places WITH a fresh exact-ref cache row (excludes places already showing a placeholder). security_invoker=true, service_role only.';