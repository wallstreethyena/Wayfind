-- 20261114170000_wf_migration_lease.sql — one production migration at a time.
--
-- WHY. scripts/apply-migration.mjs is the canonical way to apply a migration,
-- but two agents could run it against the same project at the same moment:
-- nothing serialized them (found 2026-11-14 while auditing the merge queue;
-- serial git merges do not serialize database execution). The Management API is
-- stateless per request, so a session advisory lock cannot span the apply, the
-- receipt and the read-back. This single-row lease can: apply-migration.mjs
-- acquires it (atomic UPDATE ... RETURNING) before it sends any SQL and releases
-- it after the outcome receipt; a second applier is refused while it is held.
-- A crashed holder expires after its TTL, so the lease never wedges forever.
--
-- Service-only: RLS on with no policies, and no grants to anon/authenticated.

create table if not exists public.wf_migration_lease (
  id smallint primary key default 1 check (id = 1),
  holder text,
  migration text,
  acquired_at timestamptz,
  expires_at timestamptz
);

insert into public.wf_migration_lease (id) values (1) on conflict (id) do nothing;

alter table public.wf_migration_lease enable row level security;
revoke all on table public.wf_migration_lease from anon, authenticated;

comment on table public.wf_migration_lease is
  'Single-row lease serializing scripts/apply-migration.mjs runs against this project (2026-11-14).';
