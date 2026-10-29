-- Reverse of supabase/migrations/20261029223000_holmes_beach_one_card_and_county_suffix.sql
-- Restores the locality card and the County suffix. Removes only the gallery
-- entry this migration appended. Does not touch wf_google_photo_store.

update public.wf_inventory
   set status = 'OPERATIONAL',
       excluded = false,
       exclusion_reason = null,
       locked = false
 where place_id = 'ChIJ2VOdeTYQw4gRALlkLfzdBwc'
   and exclusion_reason = 'duplicate_of:ChIJaWeoBbURw4gRDYfwKuwOVW0';

update public.wf_inventory
   set signals = jsonb_set(
         signals,
         '{photo_gallery}',
         (
           select coalesce(jsonb_agg(e), '[]'::jsonb)
             from jsonb_array_elements(coalesce(signals->'photo_gallery', '[]'::jsonb)) e
            where e->>'source_ref' is distinct from 'File:Manatee_County_Florida_Incorporated_and_Unincorporated_areas_Holmes_Beach_Highlighted.svg'
         )
       )
 where place_id = 'ChIJaWeoBbURw4gRDYfwKuwOVW0';

update public.wf_inventory
   set county = 'Pasco County'
 where place_id = 'ChIJ7zRUJ9CowogRM70pcoqrdUM'
   and county = 'Pasco';

update public.wf_inventory
   set county = 'Hillsborough County'
 where place_id = 'ChIJeZM_F1A23YgRFICuRhA_pIo'
   and county = 'Hillsborough';
