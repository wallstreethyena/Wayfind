-- Reverse of supabase/migrations/20261103230000_wf_inventory_postal_city.sql
-- Clears the 11 values this migration wrote, then drops the two columns ONLY if no
-- other row has since been given a postal_city (never discards someone else's data).
begin;
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJKVDd7v_bkIgRv0FaG2bnP9g' and postal_city = 'Gulf Breeze';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJhzWIGZUe24gRZ0qRx2ErnPI' and postal_city = 'Naples';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJ7_PseA9n54gRpWhEjEiG3uo' and postal_city = 'Orlando';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJ9RHZGx6H3YgRnWVYIWsHNPM' and postal_city = 'Orlando';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJN9FTnbF754gRwLFDBN_ahJ4' and postal_city = 'Orlando';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJOWyInLF_54gRgRgjDQy9zhw' and postal_city = 'Orlando';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJRQw4SiI35IgRSAIrKfRvWEg' and postal_city = 'Ponte Vedra Beach';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJTRfRfgpBw4gR-u488ol_SOw' and postal_city = 'Sarasota';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJWfHLuGMs5IgRZHXJPtNZCr0' and postal_city = 'St. Augustine';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJJQVMQuJXw4gRhD0CpEOETGo' and postal_city = 'Venice';
update public.wf_inventory set postal_city = null, postal_city_source = null where place_id = 'ChIJ7zRUJ9CowogRM70pcoqrdUM' and postal_city = 'Dade City';
do $$
begin
  if exists (select 1 from public.wf_inventory where postal_city is not null or postal_city_source is not null) then
    raise exception 'postal_city holds values this migration did not write; columns kept';
  end if;
end $$;
alter table public.wf_inventory drop column if exists postal_city_source;
alter table public.wf_inventory drop column if exists postal_city;
commit;
