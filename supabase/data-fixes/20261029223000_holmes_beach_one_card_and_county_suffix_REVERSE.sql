-- Reverse of supabase/migrations/20261029223000_holmes_beach_one_card_and_county_suffix.sql
-- Before-image (read 2026-11-03): town row ChIJ2VOdeTYQw4gRALlkLfzdBwc was
-- status OPERATIONAL, excluded false, exclusion_reason null, locked false;
-- counties were 'Pasco County' and 'Hillsborough County'.
-- Each statement only touches a row still holding the value the migration wrote.

begin;

update public.wf_inventory
   set status = 'OPERATIONAL', excluded = false, exclusion_reason = null, locked = false
 where place_id = 'ChIJ2VOdeTYQw4gRALlkLfzdBwc'
   and exclusion_reason = 'not_a_venue:municipality (Town of Holmes Beach); beach card is ChIJaWeoBbURw4gRDYfwKuwOVW0';

update public.wf_inventory set county = 'Pasco County'
 where place_id = 'ChIJ7zRUJ9CowogRM70pcoqrdUM' and county = 'Pasco';

update public.wf_inventory set county = 'Hillsborough County'
 where place_id = 'ChIJeZM_F1A23YgRFICuRhA_pIo' and county = 'Hillsborough';

commit;
