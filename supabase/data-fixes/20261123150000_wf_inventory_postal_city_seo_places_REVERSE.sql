-- Reverse of supabase/migrations/20261123150000_wf_inventory_postal_city_seo_places.sql
begin;
update public.wf_inventory set postal_city = null, postal_city_source = null
 where place_id = 'ChIJcxJRMYe42YgRDSlj6Z_CDxk' and postal_city = 'Miami';
update public.wf_inventory set postal_city = null, postal_city_source = null
 where place_id = 'ChIJcxJRXuvH5YgRwiUwwRpPoAk' and postal_city = 'Orange Park';
commit;
