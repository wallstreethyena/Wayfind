-- Reverse of supabase/migrations/20261105120000_wf_inventory_postal_city_orpheum.sql
begin;
update public.wf_inventory set postal_city = null, postal_city_source = null
 where place_id = 'ChIJidr4f1HEwogRxDn8aulMSl4' and postal_city = 'Tampa';
commit;
