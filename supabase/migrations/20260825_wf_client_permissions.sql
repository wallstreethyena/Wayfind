-- 20260825_wf_client_permissions.sql
-- APPLIED TO PRODUCTION 2026-08-25 as wf_client_permissions_snapshot_source.
-- Merging this file applies nothing — it is the record.
--
-- The source of truth behind lib/policySnapshot.json. The repo cannot hold a
-- live credential (check-guard-hermeticity), so
-- scripts/check-client-writes-have-policies.mjs compares the browser's writes
-- against a COMMITTED snapshot, and scripts/sync-policy-snapshot.mjs refreshes
-- that snapshot from this function. Deliberate refresh, reviewable diff.
--
-- "Effective" means BOTH halves: the role holds the grant AND a policy names it
-- (directly or through `public`) for that command. Either half alone is not
-- permission — a grant with no policy returns zero rows, a policy with no grant
-- returns 42501. Wayfind has been bitten by each separately.
create or replace function public.wf_client_permissions()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  with t as (
    select c.oid, c.relname::text as tbl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  ),
  roles as (select unnest(array['anon','authenticated']) as r),
  cmds as (select unnest(array['SELECT','INSERT','UPDATE','DELETE']) as cmd),
  eff as (
    select t.tbl, roles.r, cmds.cmd
    from t cross join roles cross join cmds
    where has_table_privilege(roles.r, t.oid, cmds.cmd)
      and exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = t.tbl
          and (p.roles @> array['public']::name[] or p.roles @> array[roles.r]::name[])
          and (upper(p.cmd) = cmds.cmd or upper(p.cmd) = 'ALL')
      )
  )
  select coalesce(jsonb_object_agg(tbl, perms), '{}'::jsonb)
  from (
    select tbl, jsonb_object_agg(r, cmds) as perms
    from (
      select tbl, r, jsonb_agg(cmd order by cmd) as cmds
      from eff group by tbl, r
    ) x group by tbl
  ) y;
$$;

comment on function public.wf_client_permissions() is
  'Effective client permissions per table (grant AND policy). Regenerates lib/policySnapshot.json via scripts/sync-policy-snapshot.mjs. Service role only.';

revoke all on function public.wf_client_permissions() from public, anon, authenticated;
grant execute on function public.wf_client_permissions() to service_role;
