-- Recovered canonical file created by Supabase CLI in the original session.
-- New introspection only. Never replay the historical catalog repair.
-- Hash UTF-8 PostgreSQL to_json(text[]) text, preserving statement order,
-- boundaries, whitespace, and NULL versus empty arrays. No SQL normalization.
create or replace function public.wf_migration_ledger_hashes()
returns table(version text, name text, statements_sha256 text)
language sql stable security definer
set search_path = pg_catalog
as $$
  select m.version::text, m.name::text,
    encode(sha256(convert_to(to_json(m.statements)::text, 'UTF8')), 'hex')
  from supabase_migrations.schema_migrations m
  order by m.version;
$$;
revoke all on function public.wf_migration_ledger_hashes() from public, anon, authenticated;
grant execute on function public.wf_migration_ledger_hashes() to service_role;
