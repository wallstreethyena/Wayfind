-- PENDING APPLY. Declared in scripts/migration-pending-apply.json.
-- Lane claude.exe, owner-approved city model (2026-11-03), step 3 of 3.
-- Requires, IN PRODUCTION: 20261103230000_wf_inventory_postal_city applied, and the
-- matcher change that reads postal_city deployed (otherwise these localities would
-- make lib/venueAnchor.js refuse every event listed under the mailing city).
-- Reverse: supabase/data-fixes/20261103233000_wf_inventory_locality_census_conflicts_REVERSE.sql
--
-- 1. The 10 #2128 conflict rows get the canonical geography of their own point:
--    locality = the Census place (incorporated city, else CDP), county = bare Census
--    county. Evidence: docs/audits/20261103230000_wf_inventory_postal_city.census.json
--    (stored point AND matched listing-address point fall in the same Census place).
--    Each update requires locality and county still NULL, the verified postal_city
--    already present, and the exact point the lookup used.
-- 2. Scream-A-Geddon Horror Park: its point is in NO Census place (Pasco). locality
--    'Dade City' is its mailing city, already preserved in postal_city by
--    20261103230000. Under the contract a point in no Census place is represented as
--    locality NULL with county set; the update requires postal_city = 'Dade City'
--    and county = 'Pasco' first, so the mailing city is never lost.
-- No name, address, coordinate, metro, status or Google content is written.

begin;

update public.wf_inventory set locality = 'Woodlawn Beach', county = 'Santa Rosa'
 where place_id = 'ChIJKVDd7v_bkIgRv0FaG2bnP9g' and locality is null and county is null
   and postal_city = 'Gulf Breeze' and lat::numeric = 30.4011616 and lng::numeric = -86.9844129;  -- Gulf Breeze Zoo (CDP)
update public.wf_inventory set locality = 'Pelican Marsh', county = 'Collier'
 where place_id = 'ChIJhzWIGZUe24gRZ0qRx2ErnPI' and locality is null and county is null
   and postal_city = 'Naples' and lat::numeric = 26.253053 and lng::numeric = -81.7989509;  -- Mercato (CDP)
update public.wf_inventory set locality = 'Alafaya', county = 'Orange'
 where place_id = 'ChIJ7_PseA9n54gRpWhEjEiG3uo' and locality is null and county is null
   and postal_city = 'Orlando' and lat::numeric = 28.5535505 and lng::numeric = -81.1961931;  -- KEG SOCIAL ORLANDO (CDP)
update public.wf_inventory set locality = 'Southchase', county = 'Orange'
 where place_id = 'ChIJ9RHZGx6H3YgRnWVYIWsHNPM' and locality is null and county is null
   and postal_city = 'Orlando' and lat::numeric = 28.3556496 and lng::numeric = -81.4022109;  -- Gatorland (CDP)
update public.wf_inventory set locality = 'Edgewood', county = 'Orange'
 where place_id = 'ChIJN9FTnbF754gRwLFDBN_ahJ4' and locality is null and county is null
   and postal_city = 'Orlando' and lat::numeric = 28.4959541 and lng::numeric = -81.3737661;  -- Children's Planet (incorporated)
update public.wf_inventory set locality = 'Doctor Phillips', county = 'Orange'
 where place_id = 'ChIJOWyInLF_54gRgRgjDQy9zhw' and locality is null and county is null
   and postal_city = 'Orlando' and lat::numeric = 28.4509863 and lng::numeric = -81.4793931;  -- American Social Orlando (CDP)
update public.wf_inventory set locality = 'Sawgrass', county = 'St. Johns'
 where place_id = 'ChIJRQw4SiI35IgRSAIrKfRvWEg' and locality is null and county is null
   and postal_city = 'Ponte Vedra Beach' and lat::numeric = 30.2171646 and lng::numeric = -81.3714758;  -- 1912 Ocean Bar & Rooftop (CDP)
update public.wf_inventory set locality = 'Ridge Wood Heights', county = 'Sarasota'
 where place_id = 'ChIJTRfRfgpBw4gR-u488ol_SOw' and locality is null and county is null
   and postal_city = 'Sarasota' and lat::numeric = 27.282012 and lng::numeric = -82.5194997;  -- Riverview Performing Arts Center (CDP)
update public.wf_inventory set locality = 'World Golf Village', county = 'St. Johns'
 where place_id = 'ChIJWfHLuGMs5IgRZHXJPtNZCr0' and locality is null and county is null
   and postal_city = 'St. Augustine' and lat::numeric = 29.9903954 and lng::numeric = -81.4682239;  -- World Golf Village Renaissance (CDP)
update public.wf_inventory set locality = 'North Port', county = 'Sarasota'
 where place_id = 'ChIJJQVMQuJXw4gRhD0CpEOETGo' and locality is null and county is null
   and postal_city = 'Venice' and lat::numeric = 27.0462517 and lng::numeric = -82.3272153;  -- Downtown Wellen Park (incorporated)

update public.wf_inventory set locality = null
 where place_id = 'ChIJ7zRUJ9CowogRM70pcoqrdUM' and locality = 'Dade City' and postal_city = 'Dade City'
   and county = 'Pasco' and lat::numeric = 28.3753419 and lng::numeric = -82.3554912;  -- Scream-A-Geddon Horror Park

do $$
declare wrong integer;
begin
  select count(*) into wrong
  from (values
    ('ChIJKVDd7v_bkIgRv0FaG2bnP9g', 'Woodlawn Beach', 'Santa Rosa', 'Gulf Breeze'),
    ('ChIJhzWIGZUe24gRZ0qRx2ErnPI', 'Pelican Marsh', 'Collier', 'Naples'),
    ('ChIJ7_PseA9n54gRpWhEjEiG3uo', 'Alafaya', 'Orange', 'Orlando'),
    ('ChIJ9RHZGx6H3YgRnWVYIWsHNPM', 'Southchase', 'Orange', 'Orlando'),
    ('ChIJN9FTnbF754gRwLFDBN_ahJ4', 'Edgewood', 'Orange', 'Orlando'),
    ('ChIJOWyInLF_54gRgRgjDQy9zhw', 'Doctor Phillips', 'Orange', 'Orlando'),
    ('ChIJRQw4SiI35IgRSAIrKfRvWEg', 'Sawgrass', 'St. Johns', 'Ponte Vedra Beach'),
    ('ChIJTRfRfgpBw4gR-u488ol_SOw', 'Ridge Wood Heights', 'Sarasota', 'Sarasota'),
    ('ChIJWfHLuGMs5IgRZHXJPtNZCr0', 'World Golf Village', 'St. Johns', 'St. Augustine'),
    ('ChIJJQVMQuJXw4gRhD0CpEOETGo', 'North Port', 'Sarasota', 'Venice'),
    ('ChIJ7zRUJ9CowogRM70pcoqrdUM', null::text, 'Pasco', 'Dade City')
  ) as v(place_id, loc, cty, pc)
  left join public.wf_inventory i using (place_id)
  where i.locality is distinct from v.loc or i.county is distinct from v.cty or i.postal_city is distinct from v.pc;
  if wrong > 0 then raise exception 'locality conflicts: % row(s) do not hold the expected values; rolled back', wrong; end if;
end $$;

commit;
