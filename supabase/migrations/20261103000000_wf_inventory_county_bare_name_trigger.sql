-- PENDING APPLY. Not applied by the agent that wrote it.
-- Declared in scripts/migration-pending-apply.json.
--
-- WHY. The production canary (check-inventory-integrity) kept failing on rows
-- whose county is stored with a trailing County suffix (Scream-A-Geddon Horror
-- Park [Pasco County], Sir Henry's Haunted Trail [Hillsborough County]). The
-- convention is the bare name (Pinellas, not Pinellas County). The data repair
-- for those two rows is 20261029223000_holmes_beach_one_card_and_county_suffix.sql.
-- No code in this repository writes those values (every seed and lib writer
-- already stores the bare name), so the writer is outside the repo (hand SQL or
-- a connector). A guard in the repo cannot stop that, so the rule is enforced
-- where every writer converges: the table.
--
-- WHAT. A BEFORE INSERT OR UPDATE OF county trigger on public.wf_inventory that
-- strips a trailing " County" from the value being written. It normalises and
-- never raises, so no writer can start failing because of it.
--
-- IMPACT. Schema: one function, one trigger. Data: none now (only future
-- writes, and only values ending in County). RLS/grants: none (no table or
-- policy change; a trigger function needs no EXECUTE grant). Rollback:
-- supabase/data-fixes/20261103000000_wf_inventory_county_bare_name_trigger_REVERSE.sql.
-- Ordering: apply after 20261029223000 (or before; independent). Safe to apply
-- at any time.
--
-- The regex mirrors lib/placeIdentity.js normalizeCountyName, locked by
-- scripts/test-county-bare-name.mjs.

create or replace function public.wf_county_bare_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.county is not null then
    new.county := nullif(btrim(regexp_replace(new.county, '\s+county\s*$', '', 'i')), '');
  end if;
  return new;
end
$$;

revoke all on function public.wf_county_bare_name() from public;

drop trigger if exists wf_inventory_county_bare_name on public.wf_inventory;
create trigger wf_inventory_county_bare_name
  before insert or update of county on public.wf_inventory
  for each row execute function public.wf_county_bare_name();
