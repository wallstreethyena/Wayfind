-- 20261119130100_wf_inventory_exclude_non_florida.sql
-- Owner-approved 2026-11-19 (full audit follow-up: "fix all P2 till P3s").
--
-- wf_inventory holds ~5,017 OPERATIONAL rows outside Florida (Las Vegas,
-- New York, Dubai, Pasig, Istanbul, Kentucky, Oregon clusters ingested under
-- non-Florida metro keys). Verified 2026-11-19: they do NOT reach visitors
-- today (sampled /places/<id> return 404, none in the sitemap), but they sit
-- one missed geo-filter away from breaking Wayfind's Florida scope, and they
-- pollute every inventory count.
--
-- This marks them excluded (reversible; no row is deleted, no status changes):
--   excluded = true, exclusion_reason = 'out_of_scope:non_florida'
-- Scope guard: coordinates outside the Florida bounding box (24.4-31.2,
-- -87.7..-79.7) AND metro NOT one of the verified Florida coverage keys
-- (charlotte = Charlotte County, FL, is a Florida key and is kept). Rows
-- with no coordinates are untouched (cannot be geo-judged). Rows already
-- excluded are untouched.
-- Rollback: update public.wf_inventory set excluded = false,
--   exclusion_reason = null where exclusion_reason = 'out_of_scope:non_florida';

begin;

update public.wf_inventory set excluded = true, exclusion_reason = 'out_of_scope:non_florida'
 where status = 'OPERATIONAL'
   and excluded is not true
   and lat is not null and lng is not null
   and (lat < 24.4 or lat > 31.2 or lng < -87.7 or lng > -79.7)
   and metro not in ('keys','palm-beach','st-pete','florida','orlando','tampa',
                     'broward','miami-dade','manatee-sarasota','immokalee-fl',
                     'spring-hill-fl','panama-city-florida','st-augustine-fl',
                     'ocala-fl','avon-park-fl','jacksonville-fl','charlotte');

do $$
declare n integer;
begin
  select count(*) into n from public.wf_inventory
   where exclusion_reason = 'out_of_scope:non_florida';
  if n < 4000 or n > 6000 then
    raise exception 'non-florida exclusion: expected 4000-6000 rows, got %; rolled back', n;
  end if;
end $$;

commit;
