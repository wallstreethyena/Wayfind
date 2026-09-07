-- 20260907_wf_deploy_contract_audit.sql — THE INTROSPECTION #1150/#1153 DID NOT HAVE.
--
-- THE INCIDENT THIS EXISTS TO PREVENT (2026-09-07). #1150 created
-- wf_popularity_attempts and a 3-argument wf_popularity_stale_batch(p_source,
-- p_categories, p_n). #1153 widened it to 5 arguments, adding p_primary_types
-- and p_min_reviews, and shipped app/api/cron/popularity/route.js calling
-- db.rpc("wf_popularity_stale_batch", { p_source, p_categories, p_n,
-- p_primary_types, p_min_reviews }) — five named arguments. #1153's migration
-- was never applied (it had been blocked on #1150's table existing, and after
-- that unblocked nobody went back for it). Both PRs merged and deployed. The
-- application code was internally correct. The database schema was internally
-- correct. They were incompatible with each other, and 553 passing guards
-- could not see it, because every one of them reads the REPO, and the repo's
-- migration file describes what was INTENDED, not what PostgREST actually has
-- loaded. PostgREST matched zero overloads to five named arguments against a
-- three-argument function. The 08:23 UTC cron did zero work across all four
-- providers — worse than the starvation bug it shipped to fix.
--
-- WHY THIS CANNOT BE A PREBUILD GUARD. Same reasoning as
-- 20260825_wf_schema_audit.sql: the schema is the one part of Wayfind that
-- never passes through a commit (a migration FILE existing here proves intent,
-- not application — "merging is not applying"), and check-guard-hermeticity
-- rightly forbids a build-time guard from holding a live credential. The
-- contract has to be checked against the live system, which means it runs in
-- the scheduled canary, which means it needs something to call over
-- PostgREST — these three functions are that something.
--
-- WHY THREE FUNCTIONS, EACH READ-ONLY AND SERVICE-ROLE-ONLY:
--
--   wf_rpc_signatures()  — proname + INPUT argument names in order + how many
--     are required (no default) + how many overloads share the name. This is
--     the ONLY thing that would have caught #1153: not "does
--     wf_popularity_stale_batch exist" (it did, throughout the incident — an
--     existence-only check is worthless here) but "what NAMED arguments does
--     it actually accept", because PostgREST resolves an RPC call by matching
--     the JSON body's key set against a function's parameter names, not by
--     position and not by arity alone. Read by
--     scripts/check-rpc-schema-contract.mjs.
--
--   wf_migration_ledger() — supabase_migrations.schema_migrations verbatim.
--     Not exposed to PostgREST directly (it lives outside the schemas the API
--     serves), so, same as wf_schema_audit already does for its "recent
--     migration" rows, a SECURITY DEFINER function is the only way to read it
--     over REST with a service-role key. Read by
--     scripts/check-migration-reconciliation.mjs.
--
--   wf_schema_objects() — every table, view, function, constraint, trigger,
--     index and column in the public schema, as (kind, name) pairs. Built
--     while auditing this repo's own migration history for the ledger check:
--     schema_migrations undercounts what is actually live. 155 rows are
--     applied; 39 files exist in supabase/migrations/; and three of those 39
--     (20260904_editorial_publish_gate_symmetry.sql,
--     20260905_editorial_read_gate.sql,
--     20260905_editorial_requires_servable_place.sql) were run directly
--     against production — proven live, by probe, per their own file headers
--     — with NO schema_migrations row at all, because they did not go through
--     migration tooling. A ledger-only reconciliation check would report all
--     three as "never applied" and be WRONG, which is exactly the kind of
--     false alarm that trains people to stop reading a guard. This function
--     lets the ledger check verify the CLAIM instead of trusting the prose:
--     scripts/check-migration-reconciliation.mjs allowlists those three files
--     by name only after confirming, against THIS function, that the specific
--     object each one creates is actually live.
--
-- All three are SECURITY DEFINER (pg_proc/pg_catalog access for
-- wf_schema_objects and wf_rpc_signatures does not itself require it, but
-- wf_migration_ledger's source table does, and matching that shape for all
-- three keeps the grant/revoke story identical and auditable) and revoked
-- from public/anon/authenticated per security_hardening_v5 — a new function
-- is born with no grants at all now, so the explicit grant to service_role
-- below is required, not decorative.

create or replace function public.wf_rpc_signatures()
returns table (
  proname text,
  arg_names text[],
  required_count integer,
  total_count integer,
  overload_count integer
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    p.proname::text,
    coalesce(p.proargnames[1:p.pronargs], array[]::text[]) as arg_names,
    (p.pronargs - p.pronargdefaults)::integer as required_count,
    p.pronargs::integer as total_count,
    count(*) over (partition by p.proname)::integer as overload_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'wf\_%' escape '\'
  order by p.proname;
$$;

revoke all on function public.wf_rpc_signatures() from public, anon, authenticated;
grant execute on function public.wf_rpc_signatures() to service_role;
comment on function public.wf_rpc_signatures() is
  'Deploy-time RPC contract source of truth: one row per public wf_* function with its INPUT argument names in order (PostgREST resolves an rpc() call by NAME SET, not position), how many are required vs defaulted, and how many overloads share the name (overload_count > 1 is a PostgREST ambiguity hazard on its own, independent of whether any one call site matches). Added 2026-09-07 after #1153 shipped a 5-arg caller for wf_popularity_stale_batch against a still-3-arg production function; existence alone (the function was there throughout) would not have caught it. Read by scripts/check-rpc-schema-contract.mjs via the canary workflow. Service role only.';

create or replace function public.wf_migration_ledger()
returns table (version text, name text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select m.version::text, m.name::text
  from supabase_migrations.schema_migrations m
  order by m.version;
$$;

revoke all on function public.wf_migration_ledger() from public, anon, authenticated;
grant execute on function public.wf_migration_ledger() to service_role;
comment on function public.wf_migration_ledger() is
  'supabase_migrations.schema_migrations verbatim — the ONLY record of what has actually been applied, as opposed to supabase/migrations/*.sql in the repo, which is what was INTENDED (merging a migration file applies nothing; see 20260825_wf_schema_audit.sql). Not exposed to PostgREST directly (outside the served schemas), hence SECURITY DEFINER. Added 2026-09-07 after #1153''s migration sat unapplied while its caller deployed. Read by scripts/check-migration-reconciliation.mjs via the canary workflow. Service role only.';

create or replace function public.wf_schema_objects()
returns table (kind text, name text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select 'table'::text, c.relname::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  union all
  select 'view'::text, c.relname::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  union all
  select 'function'::text, p.proname::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  union all
  select 'constraint'::text, co.conname::text
    from pg_constraint co
    join pg_class c on c.oid = co.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  union all
  select 'trigger'::text, t.tgname::text
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
  union all
  select 'index'::text, i.relname::text
    from pg_class i
    join pg_index ix on ix.indexrelid = i.oid
    join pg_class c on c.oid = ix.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and i.relkind = 'i'
  union all
  select 'column'::text, (t.relname || '.' || a.attname)::text
    from pg_attribute a
    join pg_class t on t.oid = a.attrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relkind in ('r','p','v')
      and a.attnum > 0 and not a.attisdropped;
$$;

revoke all on function public.wf_schema_objects() from public, anon, authenticated;
grant execute on function public.wf_schema_objects() to service_role;
comment on function public.wf_schema_objects() is
  'Existence catalog of every table, view, function, constraint, trigger, index and column in the public schema, as (kind, name) pairs. Built so scripts/check-migration-reconciliation.mjs can verify a migration applied OUTSIDE the tracked ledger (see wf_migration_ledger comment) by checking the specific object it claims to create, instead of trusting a file''s own prose. Added 2026-09-07. Service role only.';

-- MERGING THIS FILE APPLIES NOTHING (AGENTS.md: merging is not applying).
-- scripts/check-rpc-schema-contract.mjs and scripts/check-migration-
-- reconciliation.mjs will FAIL LOUDLY — not skip — with a "not deployed yet"
-- message until an operator applies this migration to production. That is the
-- correct, intended state for a PR that has not yet been applied: the same
-- shape wf_schema_audit shipped in on 2026-08-25.
