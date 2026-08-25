-- 20260825_wf_schema_audit.sql
-- APPLIED TO PRODUCTION 2026-08-25 as migration wf_schema_audit_exposure_watchdog.
-- Merging this file applies nothing (AGENTS.md: merging is not applying).
--
-- WHY A WATCHDOG AND NOT ONLY A DEFAULT. 20260825_security_hardening_v5.sql
-- fixed ALTER DEFAULT PRIVILEGES, so new objects are no longer BORN wide open.
-- It does not stop anyone writing `grant insert ... to anon` by hand, it does
-- not cover objects created by supabase_admin (whose defaults postgres cannot
-- alter), and it cannot see a policy dropped later. The default is prevention;
-- this is detection.
--
-- WHY IN THE DATABASE AND NOT IN A BUILD GUARD. 129 migrations have been applied
-- to this project and 10 exist as files in the repo. The schema is the one part
-- of Wayfind that never passes through a commit, so a repo guard is structurally
-- blind to it — and check-guard-hermeticity rightly forbids a guard from holding
-- a live credential. The invariants have to live where the schema does.
-- scripts/check-schema-watch.mjs locks the shapes; this runs the checks.
--
-- Returns one row per finding, loudest first. Empty result = clean.
-- Read by /api/cron/schema-watch. Service role only.

create or replace function public.wf_schema_audit()
returns table (severity text, kind text, object text, detail text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  -- The RPCs that are SUPPOSED to be callable without signing in. Changing this
  -- list is a deliberate act that requires a migration, and
  -- scripts/check-schema-watch.mjs asserts the repo's copy still matches.
  intentional_public_rpcs text[] := array[
    'wf_join_waitlist', 'wf_log_coverage_gap', 'wf_register_push_token'
  ];
begin
  -- 1. RLS off on a table in the API's own schema. This is the lint the 23 Aug
  --    email led with. Nothing else on this list is more urgent.
  return query
  select 'critical', 'rls_off', c.relname::text,
         'RLS is disabled — the anon key can read and write every row'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and c.relrowsecurity = false;

  -- 2. A view anon can read that does NOT declare security_invoker runs as its
  --    owner and ignores RLS underneath. This is how wf_affiliate_worklist
  --    handed the monetisation worklist to anyone holding the publishable key.
  return query
  select 'critical', 'definer_view_anon', c.relname::text,
         'anon-readable view without security_invoker — it bypasses RLS on every table it reads'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and has_table_privilege('anon', c.oid, 'SELECT')
    and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'off') <> 'on';

  -- 3. A write privilege with no policy behind it. Harmless today because RLS
  --    denies it — and one permissive policy away from a write hole. 88 of these
  --    existed on 2026-08-25.
  return query
  with held as (
    select c.relname::text as tbl, r.role_name, cmd.c as cmd
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (select unnest(array['anon','authenticated']) as role_name) r
    cross join (select unnest(array['INSERT','UPDATE','DELETE']) as c) cmd
    where n.nspname = 'public' and c.relkind in ('r','p')
      and has_table_privilege(r.role_name, c.oid, cmd.c)
  ),
  allowed as (
    select p.tablename::text as tbl, r.role_name, upper(p.cmd) as cmd
    from pg_policies p
    cross join (select unnest(array['anon','authenticated']) as role_name) r
    where p.schemaname = 'public'
      and (p.roles @> array['public']::name[] or p.roles @> array[r.role_name]::name[])
      and upper(p.cmd) in ('INSERT','UPDATE','DELETE','ALL')
  )
  select 'high', 'write_grant_no_policy', h.tbl,
         h.role_name || ' holds ' || h.cmd || ' with no policy granting it — only RLS is in the way'
  from held h
  where not exists (
    select 1 from allowed a
    where a.tbl = h.tbl and a.role_name = h.role_name
      and (a.cmd = h.cmd or a.cmd = 'ALL')
  );

  -- 4. TRUNCATE is NOT subject to RLS. Neither is REFERENCES or TRIGGER, and
  --    PostgREST never issues any of the three. anon held TRUNCATE on all 60
  --    tables before this pass.
  return query
  select 'high', 'rls_exempt_grant', c.relname::text,
         r.role_name || ' holds ' || p.priv || ' — RLS does not restrict it'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (select unnest(array['anon','authenticated']) as role_name) r
  cross join (select unnest(array['TRUNCATE','REFERENCES','TRIGGER']) as priv) p
  where n.nspname = 'public' and c.relkind in ('r','p')
    and has_table_privilege(r.role_name, c.oid, p.priv);

  -- 5. The default itself drifting back. If this fires, every table and function
  --    created from here is born wide open again and findings 1-4 will follow.
  return query
  select 'high', 'default_privileges_drift',
         pg_get_userbyid(d.defaclrole)::text || '/' ||
           case d.defaclobjtype when 'r' then 'tables' when 'f' then 'functions' else d.defaclobjtype::text end,
         'default privileges grant anon/authenticated on new objects in public — new objects are born exposed'
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public'
    and d.defaclobjtype in ('r','f')
    and pg_get_userbyid(d.defaclrole) = 'postgres'
    and (d.defaclacl::text like '%anon=%' or d.defaclacl::text like '%authenticated=%');

  -- 6. A SECURITY DEFINER function anon can call that is not on the list above.
  --    Definer functions ignore RLS by construction, so every one of these is an
  --    unauthenticated endpoint with the owner's authority.
  --    wf_promotion_enqueue_by_score was one of these: anon-callable, and it
  --    enqueues work the cron drains through paid Google Place Details calls.
  return query
  select 'high', 'unlisted_anon_definer_rpc', p.proname::text,
         'SECURITY DEFINER and executable by anon — it runs with the owner''s authority and ignores RLS'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and not (p.proname = any(intentional_public_rpcs));

  -- 7. Context, not an alarm: what changed lately. When something above fires,
  --    this is the list it almost certainly arrived in.
  return query
  select 'info', 'recent_migration', m.version::text,
         coalesce(m.name, '(unnamed)')
  from supabase_migrations.schema_migrations m
  where m.version >= to_char(now() - interval '8 days', 'YYYYMMDD')
  order by m.version desc;
end $$;

comment on function public.wf_schema_audit() is
  'Exposure invariants for the public schema. Empty result = clean. Read by /api/cron/schema-watch. Service role only.';

-- Per the rule v5 established: default privileges no longer grant anything, so
-- exposure is an explicit line. This one is service-role only.
revoke all on function public.wf_schema_audit() from public, anon, authenticated;
grant execute on function public.wf_schema_audit() to service_role;
