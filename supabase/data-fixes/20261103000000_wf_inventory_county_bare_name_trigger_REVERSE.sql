-- Reverse of supabase/migrations/20261103000000_wf_inventory_county_bare_name_trigger.sql
-- Removes the trigger and its function. Does not restore any County suffix
-- (the trigger only ever rewrote values on write, and never stored the original).
drop trigger if exists wf_inventory_county_bare_name on public.wf_inventory;
drop function if exists public.wf_county_bare_name();
