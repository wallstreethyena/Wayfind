-- PROPOSED — NOT APPLIED. Needs the owner's explicit approval (no production DB
-- mutation without a git-tracked PR and his say-so). Do not merge this file to
-- main before it is applied: scripts/check-migration-reconciliation.mjs treats
-- a committed migration with no production ledger row as a failure.
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
-- locked true (as on the existing duplicate_of rows).
-- Nothing is deleted; setting the row back to OPERATIONAL / excluded=false
-- restores it. The promotion queue row stays 'done', so it is not re-promoted.
--
-- Preconditions are asserted so a stale replay cannot retire the wrong row: the
-- keeper must still be a serving card, and the retired row must still be the
-- same-name twin. If either is false this raises and changes nothing.

do $$
declare
  keeper constant text := 'ChIJK1nJH9xrw4gRIr9IhuzYVQI';
  twin   constant text := 'ChIJq2xCMQpqw4gRuG2G3EKqDBs';
  n integer;
begin
  if not exists (
    select 1 from public.wf_inventory
    where place_id = keeper and name = 'Siesta Key Village'
      and status = 'OPERATIONAL' and coalesce(excluded, false) = false
  ) then
    raise exception 'siesta dedupe: keeper % is not a serving Siesta Key Village card', keeper;
  end if;

  update public.wf_inventory
     set status = 'EXCLUDED',
         excluded = true,
         exclusion_reason = 'duplicate_of:' || keeper,
         locked = true
   where place_id = twin
     and name = 'Siesta Key Village'
     and metro = 'manatee-sarasota'
     and status = 'OPERATIONAL'
     and coalesce(excluded, false) = false;
  get diagnostics n = row_count;
  if n > 1 then
    raise exception 'siesta dedupe: expected at most 1 row, updated %', n;
  end if;
end
$$;
