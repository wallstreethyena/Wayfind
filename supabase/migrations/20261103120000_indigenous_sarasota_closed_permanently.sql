-- Indigenous Restaurant (Towles Court, Sarasota) has closed.
--
-- Evidence read 2026-11-03: Sarasota Magazine reported on 2026-09-15 that
-- Indigenous closed after 15 years, and the restaurant's OpenTable page shows
-- "Permanently Closed". Wayfind still served it as a top rated place (status
-- OPERATIONAL), so it reached lists, its place page and the Top Rated badge.
--
-- Same soft mechanism as the other closures and twins: NOTHING IS DELETED.
-- status CLOSED_PERMANENTLY drops it from every surface that serves only
-- OPERATIONAL rows (lists, verified editorial, badge eligibility), and
-- locked true keeps the Google refresh from flipping it back.
--
-- REVERSE (one row): update public.wf_inventory set status = 'OPERATIONAL',
--   exclusion_reason = null, locked = false
--   where place_id = 'ChIJZUZzwm5Aw4gR1qnftvzg0lg';
--
-- Every precondition is checked INSIDE this transaction on the row locked FOR
-- UPDATE; any mismatch raises and the migration rolls back. A replay raises.
do $$
declare
  pid constant text := 'ChIJZUZzwm5Aw4gR1qnftvzg0lg';
  r record;
  n integer;
begin
  begin
    select place_id, name, metro, status, excluded, exclusion_reason, locked
      into strict r
      from public.wf_inventory
     where place_id = pid
       for update;
  exception
    when no_data_found then raise exception 'indigenous closure: % not found', pid;
    when too_many_rows then raise exception 'indigenous closure: % matches more than one row', pid;
  end;
  if r.name is distinct from 'Indigenous Restaurant' or r.metro is distinct from 'manatee-sarasota'
     or r.status is distinct from 'OPERATIONAL' or coalesce(r.excluded, false)
     or r.exclusion_reason is not null or coalesce(r.locked, false) then
    raise exception 'indigenous closure: % is not the expected serving, unlocked row (name=%, metro=%, status=%, excluded=%, exclusion_reason=%, locked=%)',
      pid, r.name, r.metro, r.status, r.excluded, r.exclusion_reason, r.locked;
  end if;

  update public.wf_inventory
     set status = 'CLOSED_PERMANENTLY',
         exclusion_reason = 'closed_permanently:sarasota_magazine_2026-09-15_and_opentable',
         locked = true
   where place_id = pid
     and name = 'Indigenous Restaurant'
     and status = 'OPERATIONAL'
     and exclusion_reason is null
     and coalesce(locked, false) = false;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'indigenous closure: expected exactly 1 row changed, got %', n;
  end if;
end
$$;

-- VALIDATION (read-only; run after apply):
--   select place_id, name, status, excluded, exclusion_reason, locked from public.wf_inventory
--    where place_id = 'ChIJZUZzwm5Aw4gR1qnftvzg0lg';
--   expect: CLOSED_PERMANENTLY / false / 'closed_permanently:sarasota_magazine_2026-09-15_and_opentable' / true
