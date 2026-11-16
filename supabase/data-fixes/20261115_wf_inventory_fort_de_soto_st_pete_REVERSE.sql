-- Reverse of supabase/data-fixes/20261115_wf_inventory_fort_de_soto_st_pete.sql
begin;
update public.wf_inventory set metro = 'tampa'
 where place_id = 'ChIJlwvmVssEw4gRPXl1cMrP_ao' and metro = 'st-pete';
commit;
