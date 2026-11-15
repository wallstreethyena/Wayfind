-- supabase/data-fixes/20261115_wf_inventory_fort_de_soto_st_pete.sql
-- Owner-approved 2026-11-15 ("I approve this narrowly scoped correction").
--
-- Historic Fort De Soto (ChIJlwvmVssEw4gRPXl1cMrP_ao, Pinellas, lat 27.6155323)
-- arrived 2026-11-13 14:10Z from wf_promotion_queue with the Tampa sweep's
-- metro ('tampa'); the daily county fill gave it county 'Pinellas' on
-- 2026-11-14 09:47Z and the canary's south-Pinellas rule
-- (lib/placeIdentity.js) has flagged it since. Its two neighbours at the same
-- coordinates (Fort De Soto, Fort De Soto Park Batteries And Military Post)
-- are already 'st-pete'. Verified before applying: exactly ONE row matches
-- metro='tampa' AND county='Pinellas' AND lat <= 27.98 (the st-pete box's
-- north edge). Only metro changes.
-- Reverse: supabase/data-fixes/20261115_wf_inventory_fort_de_soto_st_pete_REVERSE.sql
-- Recurrence is closed in code: lib/localityFill.js now applies the same rule
-- when the county arrives.

begin;

update public.wf_inventory
   set metro = 'st-pete'
 where place_id = 'ChIJlwvmVssEw4gRPXl1cMrP_ao'
   and metro = 'tampa' and county = 'Pinellas' and lat <= 27.98;

do $$
begin
  if (select count(*) from public.wf_inventory where place_id = 'ChIJlwvmVssEw4gRPXl1cMrP_ao' and metro = 'st-pete') <> 1 then
    raise exception 'Fort De Soto relabel: row does not hold st-pete; rolled back';
  end if;
  if (select count(*) from public.wf_inventory where metro = 'tampa' and county = 'Pinellas' and lat <= 27.98) <> 0 then
    raise exception 'Fort De Soto relabel: other south-Pinellas tampa rows remain; rolled back';
  end if;
end $$;

commit;
