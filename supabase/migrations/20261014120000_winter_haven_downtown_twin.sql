-- PENDING APPLY. NOT applied by the agent that wrote it: the orchestrator/owner reviews
-- the PR, then applies through scripts/apply-migration.mjs from a clean commit of this file.
-- Declared in scripts/migration-pending-apply.json.
--
-- Owner-approved (conditional on identity verification, done 2026-10-14):
-- "Downtown Winter Haven" and "Downtown, Winter Haven, Fl" are ONE destination - the
-- Downtown Winter Haven Historic District (NRHP 2002; Main Street Winter Haven's
-- district; centroid 28.02167,-81.73028). Both pins are inside it, 87 m apart.
--   KEEPER  ChIJ_wzoOQAT3YgR5o8e69WR3UU  "Downtown Winter Haven"  tourist_attraction
--           3 reviews, 4.3, owns the only wf_place_photo row (wikimedia, active)
--   RETIRED ChIJr9OaGuES3YgRCkHnqB00tbo  "Downtown, Winter Haven, Fl"  event_venue
--           22 reviews, 4.5, no photo. Google's "event_venue" is a loose label on a
--           user-style listing, not a distinct venue (no Central Park / event-site
--           record exists in inventory within 800 m).
--
-- Soft exclusion only, same mechanism as the Siesta Key Village twin
-- (20260929_siesta_key_village_split_venue_dedupe.sql): status EXCLUDED, excluded true,
-- exclusion_reason 'duplicate_of:<keeper>', locked true. NOTHING IS DELETED. The row,
-- its wf_place_ids row and its promotion-queue row ('done') stay, so it is not
-- re-promoted. No other table references either id (information_schema column scan +
-- full-row text scan of every public table, 2026-10-14); the only extra hits are two
-- expiring search-result rows in wf_places_cache, which age out on their own.
-- The keeper's photo row is untouched (no copy needed: the keeper already has it).
-- /p/<retired id> keeps resolving: app/p/[id] renders Home with the id and the detail
-- loader fetches the place by id, exactly as for the retired Siesta twin.
--
-- REVERSE: supabase/data-fixes/20261014_winter_haven_downtown_twin_REVERSE.sql
-- VALIDATION (run after apply; expected results in the comments at the bottom).
--
-- Every precondition is checked INSIDE this transaction on rows locked FOR UPDATE; any
-- mismatch raises and the migration rolls back. Replays raise (0 rows changed).

do $$
declare
  keeper constant text := 'ChIJ_wzoOQAT3YgR5o8e69WR3UU';
  twin   constant text := 'ChIJr9OaGuES3YgRCkHnqB00tbo';
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
    when no_data_found then raise exception 'winter haven dedupe: keeper % not found', keeper;
    when too_many_rows then raise exception 'winter haven dedupe: keeper % matches more than one row', keeper;
  end;
  if k.name is distinct from 'Downtown Winter Haven' or k.metro is distinct from 'florida'
     or k.status is distinct from 'OPERATIONAL' or coalesce(k.excluded, false) then
    raise exception 'winter haven dedupe: keeper % is not a serving "Downtown Winter Haven" card (name=%, metro=%, status=%, excluded=%)',
      keeper, k.name, k.metro, k.status, k.excluded;
  end if;

  begin
    select place_id, name, metro, status, excluded, exclusion_reason, locked
      into strict t
      from public.wf_inventory
     where place_id = twin
       for update;
  exception
    when no_data_found then raise exception 'winter haven dedupe: duplicate % not found', twin;
    when too_many_rows then raise exception 'winter haven dedupe: duplicate % matches more than one row', twin;
  end;
  if t.name is distinct from 'Downtown, Winter Haven, Fl' or t.metro is distinct from 'florida'
     or t.status is distinct from 'OPERATIONAL' or coalesce(t.excluded, false)
     or t.exclusion_reason is not null or coalesce(t.locked, false) then
    raise exception 'winter haven dedupe: duplicate % is not in the expected serving, unlocked state (name=%, metro=%, status=%, excluded=%, exclusion_reason=%, locked=%)',
      twin, t.name, t.metro, t.status, t.excluded, t.exclusion_reason, t.locked;
  end if;

  -- Keeper must still own its photo row (the card's image).
  if not exists (select 1 from public.wf_place_photo where place_id = keeper and status = 'active') then
    raise exception 'winter haven dedupe: keeper % has no active wf_place_photo row', keeper;
  end if;

  update public.wf_inventory
     set status = 'EXCLUDED',
         excluded = true,
         exclusion_reason = 'duplicate_of:' || keeper,
         locked = true
   where place_id = twin
     and name = 'Downtown, Winter Haven, Fl'
     and metro = 'florida'
     and status = 'OPERATIONAL'
     and coalesce(excluded, false) = false
     and exclusion_reason is null
     and coalesce(locked, false) = false;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'winter haven dedupe: expected exactly 1 row changed, got %', n;
  end if;

  if not exists (
    select 1 from public.wf_inventory
     where place_id = keeper and name = 'Downtown Winter Haven' and metro = 'florida'
       and status = 'OPERATIONAL' and coalesce(excluded, false) = false
  ) then
    raise exception 'winter haven dedupe: keeper % stopped serving during the write', keeper;
  end if;
end
$$;

-- VALIDATION (read-only; run after apply):
--   select place_id, status, excluded, exclusion_reason, locked from public.wf_inventory
--    where place_id in ('ChIJ_wzoOQAT3YgR5o8e69WR3UU','ChIJr9OaGuES3YgRCkHnqB00tbo') order by place_id;
--   expect: keeper OPERATIONAL/false/null/false ; twin EXCLUDED/true/'duplicate_of:ChIJ_wzoOQAT3YgR5o8e69WR3UU'/true
--   select count(*) from public.wf_inventory where name ilike '%downtown%winter haven%'
--    and status='OPERATIONAL' and excluded is not true;            -- expect 1
--   select count(*) from public.wf_place_photo where place_id='ChIJ_wzoOQAT3YgR5o8e69WR3UU' and status='active'; -- expect 1
--   select count(*) from public.wf_inventory;                      -- unchanged vs before (nothing deleted)
