-- Reverse of supabase/migrations/20261103120000_indigenous_sarasota_closed_permanently.sql
-- Puts Indigenous Restaurant back in service (only if it reopens).
update public.wf_inventory
   set status = 'OPERATIONAL',
       exclusion_reason = null,
       locked = false
 where place_id = 'ChIJZUZzwm5Aw4gR1qnftvzg0lg'
   and exclusion_reason = 'closed_permanently:sarasota_magazine_2026-09-15_and_opentable';
