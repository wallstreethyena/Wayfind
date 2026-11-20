-- 20261119120000_wf_inventory_broward_metro_labels.sql
-- Owner-approved 2026-11-19 ("yes, fix the Broward tag").
--
-- Two OPERATIONAL rows carry a metro label no coverage reader knows; both are in
-- Broward County, whose coverage key is 'broward' (lib/promoteIndex.js, 1,376 rows):
--   wfadd_anthonys_runway_84_fort_lauderdale  Anthony's Runway 84, Fort Lauderdale  metro 'fort-lauderdale'
--   ChIJ98tz7B_j2IgRkUEg8l49PMQ              Ocean Brews & Blues Festival, Deerfield Beach  metro 'pompano-beach-fl'
-- Found by the corrected photo-coverage check (#2605) as "stray" metro keys.
-- Only metro changes; each update is compare-and-set on the old label and county.
-- Rollback: set metro back to 'fort-lauderdale' / 'pompano-beach-fl' for these two place_ids.

begin;

update public.wf_inventory set metro = 'broward'
 where place_id = 'wfadd_anthonys_runway_84_fort_lauderdale' and metro = 'fort-lauderdale' and county = 'Broward';

update public.wf_inventory set metro = 'broward'
 where place_id = 'ChIJ98tz7B_j2IgRkUEg8l49PMQ' and metro = 'pompano-beach-fl' and county = 'Broward';

do $$
begin
  if (select count(*) from public.wf_inventory
       where place_id in ('wfadd_anthonys_runway_84_fort_lauderdale', 'ChIJ98tz7B_j2IgRkUEg8l49PMQ') and metro = 'broward') <> 2 then
    raise exception 'broward relabel: expected both rows to hold broward; rolled back';
  end if;
end $$;

commit;
