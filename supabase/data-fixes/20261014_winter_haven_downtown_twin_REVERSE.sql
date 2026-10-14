-- REVERSE of supabase/migrations/20261014120000_winter_haven_downtown_twin.sql.
-- Not auto-applied (lives in data-fixes/, not migrations/). Restores the retired twin to
-- exactly its pre-migration serving state (OPERATIONAL, excluded false, no reason, unlocked
-- - the values the forward migration asserted before writing). Refuses unless the row is
-- still the one the forward migration retired, so it can never un-exclude something else.
do $$
declare
  twin   constant text := 'ChIJr9OaGuES3YgRCkHnqB00tbo';
  keeper constant text := 'ChIJ_wzoOQAT3YgR5o8e69WR3UU';
  n integer;
begin
  update public.wf_inventory
     set status = 'OPERATIONAL', excluded = false, exclusion_reason = null, locked = false
   where place_id = twin
     and name = 'Downtown, Winter Haven, Fl'
     and status = 'EXCLUDED'
     and excluded is true
     and exclusion_reason = 'duplicate_of:' || keeper;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'winter haven reverse: expected exactly 1 row restored, got % (already reversed, or the row was changed since)', n;
  end if;
end
$$;
-- VALIDATION: select place_id,status,excluded,exclusion_reason,locked from public.wf_inventory
--   where place_id='ChIJr9OaGuES3YgRCkHnqB00tbo';  -- expect OPERATIONAL,false,null,false
