-- PENDING APPLY. Declared in scripts/migration-pending-apply.json.
-- Lane claude.exe, owner-approved 2026-11-05 ("approve all"): the Census-CDP
-- postal_city backfill, same method as 20261103230000.
-- Reverse: supabase/data-fixes/20261105120000_wf_inventory_postal_city_orpheum_REVERSE.sql
--
-- Survey (docs/audits/20261105120000_wf_inventory_postal_city_orpheum.census.json):
-- of 3,359 rows with a locality and no postal_city, 126 have an owned wf_events
-- listing address, and ONE has a listing city that differs from its Census
-- locality: The Orpheum (locality University, a CDP; listing and US Census
-- address match both TAMPA 33613; stored point and address point both in
-- University CDP). Only postal_city / postal_city_source are written.

begin;

update public.wf_inventory
   set postal_city = 'Tampa',
       postal_city_source = 'wf_events:hw26-emo-night-brooklyn-halloween-edition-tampa-2026 listing address city; US Census address match TAMPA 33613 (2026-11-05)'
 where place_id = 'ChIJidr4f1HEwogRxDn8aulMSl4' and postal_city is null and locality = 'University'
   and lat::numeric = 28.0832711 and lng::numeric = -82.451646;

do $$
begin
  if (select count(*) from public.wf_inventory where place_id = 'ChIJidr4f1HEwogRxDn8aulMSl4' and postal_city = 'Tampa' and postal_city_source is not null and locality = 'University') <> 1 then
    raise exception 'postal_city Orpheum: row does not hold the verified value; rolled back';
  end if;
end $$;

commit;
