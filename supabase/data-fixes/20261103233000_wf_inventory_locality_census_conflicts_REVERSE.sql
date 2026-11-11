-- Reverse of supabase/migrations/20261103233000_wf_inventory_locality_census_conflicts.sql
-- Before-image (2026-11-03): the 10 rows had locality NULL and county NULL;
-- Scream-A-Geddon had locality 'Dade City'. Only rows still holding the written values change.
begin;
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJKVDd7v_bkIgRv0FaG2bnP9g' and locality = 'Woodlawn Beach' and county = 'Santa Rosa';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJhzWIGZUe24gRZ0qRx2ErnPI' and locality = 'Pelican Marsh' and county = 'Collier';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJ7_PseA9n54gRpWhEjEiG3uo' and locality = 'Alafaya' and county = 'Orange';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJ9RHZGx6H3YgRnWVYIWsHNPM' and locality = 'Southchase' and county = 'Orange';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJN9FTnbF754gRwLFDBN_ahJ4' and locality = 'Edgewood' and county = 'Orange';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJOWyInLF_54gRgRgjDQy9zhw' and locality = 'Doctor Phillips' and county = 'Orange';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJRQw4SiI35IgRSAIrKfRvWEg' and locality = 'Sawgrass' and county = 'St. Johns';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJTRfRfgpBw4gR-u488ol_SOw' and locality = 'Ridge Wood Heights' and county = 'Sarasota';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJWfHLuGMs5IgRZHXJPtNZCr0' and locality = 'World Golf Village' and county = 'St. Johns';
update public.wf_inventory set locality = null, county = null where place_id = 'ChIJJQVMQuJXw4gRhD0CpEOETGo' and locality = 'North Port' and county = 'Sarasota';
update public.wf_inventory set locality = 'Dade City' where place_id = 'ChIJ7zRUJ9CowogRM70pcoqrdUM' and locality is null and postal_city = 'Dade City';
commit;
