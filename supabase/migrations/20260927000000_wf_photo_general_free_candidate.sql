-- Exclude existing decisions before the hourly worker's bounded scan. Reading
-- the first 1000 inventory rows and excluding decisions afterward permanently
-- hid undecided places later in the catalogue. Legacy replay remains separate.
create or replace view public.wf_photo_general_free_candidate
with (security_invoker = true) as
select i.place_id, i.name, i.lat, i.lng, i.category, i.tags, i.status
from public.wf_inventory i
where i.status = 'OPERATIONAL'
  and i.category in ('beach', 'attractions')
  and not exists (
    select 1 from public.wf_place_photo p where p.place_id = i.place_id
  );

revoke all on public.wf_photo_general_free_candidate from anon, authenticated;
grant select on public.wf_photo_general_free_candidate to service_role;

comment on view public.wf_photo_general_free_candidate is
  'Undecided OPERATIONAL beach/attractions places for bounded free-photo scans. Any existing photo decision excludes a place before LIMIT. Controlled legacy rejected:no_wiki_candidate replay remains on its dedicated worklist.';
