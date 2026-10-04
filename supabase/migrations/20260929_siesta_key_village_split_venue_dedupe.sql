-- APPLY-BEFORE-MERGE. Owner-authorized (#1593); revised 2026-10-01 so the
-- transaction itself refuses anything but exactly one intended change. Apply
-- only through scripts/apply-migration.mjs, from a clean commit of this file.
--
-- Incident 2026-09-29: scripts/check-inventory-integrity.mjs FAIL —
-- "Siesta Key Village stored as 2 records 86m apart".
--
-- Two Google listings of the same shopping district, both business_center, same
-- metro (manatee-sarasota), 86m apart:
--   ChIJK1nJH9xrw4gRIr9IhuzYVQI  562 reviews, 4.7, card since 2026-08-22  <- keeps
--   ChIJq2xCMQpqw4gRuG2G3EKqDBs  167 reviews, 4.8, promoted 2026-09-29 16:40Z
--                                (phase2-astra-adjudicated lane) <- retired here
-- The second was promoted because promote-index / promote-worker only deduped by
-- place_id. Code fix: lib/promoteIndex.js findSplitVenueTwin/partitionSplitVenues.
--
-- Same mechanism as every earlier split-venue retirement (rows carry
-- exclusion_reason 'duplicate_of:<place_id>'): status EXCLUDED, excluded true,
-- locked true. Nothing is deleted; the pre-apply snapshot restores it. The
-- promotion queue row stays 'done', so it is not re-promoted.
--
-- Every precondition is checked INSIDE this transaction, on rows locked FOR
-- UPDATE, so a concurrent writer cannot change either record between the check
-- and the write. Any mismatch raises and the whole migration rolls back:
--   keeper: exactly one row, name 'Siesta Key Village', metro 'manatee-sarasota',
--           OPERATIONAL, not excluded — and still so after the write;
--   twin:   exactly one row, same name and metro, OPERATIONAL, not excluded, no
--           exclusion_reason, not locked (a locked row was pinned by a human —
--           same rule as scripts/repair-canary-2026-09-06.mjs, locked=is.false);
--   write:  exactly 1 row changed. 0 (already retired, replay) raises too.

do $$
declare
  keeper constant text := 'ChIJK1nJH9xrw4gRIr9IhuzYVQI';
  twin   constant text := 'ChIJq2xCMQpqw4gRuG2G3EKqDBs';
  venue  constant text := 'Siesta Key Village';
  metro_ constant text := 'manatee-sarasota';
  k record;
  t record;
  n integer;
begin
  begin
    select place_id, name, metro, status, excluded
      into strict k
      from public.wf_inventory
     where place_id = keeper
       for update;
  exception
    when no_data_found then raise exception 'siesta dedupe: keeper % not found', keeper;
    when too_many_rows then raise exception 'siesta dedupe: keeper % matches more than one row', keeper;
  end;
  if k.name is distinct from venue or k.metro is distinct from metro_
     or k.status is distinct from 'OPERATIONAL' or coalesce(k.excluded, false) then
    raise exception 'siesta dedupe: keeper % is not a serving % card in % (name=%, metro=%, status=%, excluded=%)',
      keeper, venue, metro_, k.name, k.metro, k.status, k.excluded;
  end if;

  begin
    select place_id, name, metro, status, excluded, exclusion_reason, locked
      into strict t
      from public.wf_inventory
     where place_id = twin
       for update;
  exception
    when no_data_found then raise exception 'siesta dedupe: duplicate % not found', twin;
    when too_many_rows then raise exception 'siesta dedupe: duplicate % matches more than one row', twin;
  end;
  if t.name is distinct from venue or t.metro is distinct from metro_
     or t.status is distinct from 'OPERATIONAL' or coalesce(t.excluded, false)
     or t.exclusion_reason is not null or coalesce(t.locked, false) then
    raise exception 'siesta dedupe: duplicate % is not in the expected serving, unlocked state (name=%, metro=%, status=%, excluded=%, exclusion_reason=%, locked=%)',
      twin, t.name, t.metro, t.status, t.excluded, t.exclusion_reason, t.locked;
  end if;

  update public.wf_inventory
     set status = 'EXCLUDED',
         excluded = true,
         exclusion_reason = 'duplicate_of:' || keeper,
         locked = true
   where place_id = twin
     and name = venue
     and metro = metro_
     and status = 'OPERATIONAL'
     and coalesce(excluded, false) = false
     and exclusion_reason is null
     and coalesce(locked, false) = false;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'siesta dedupe: expected exactly 1 row changed, got %', n;
  end if;

  if not exists (
    select 1 from public.wf_inventory
     where place_id = keeper and name = venue and metro = metro_
       and status = 'OPERATIONAL' and coalesce(excluded, false) = false
  ) then
    raise exception 'siesta dedupe: keeper % stopped serving during the write', keeper;
  end if;
end
$$;
