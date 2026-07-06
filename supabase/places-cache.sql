-- v4.08 shared Places search cache. Service-role access only; no public policies.
create table if not exists public.wf_places_cache (
  k text primary key,
  v jsonb not null,
  exp timestamptz not null
);
alter table public.wf_places_cache enable row level security;
-- No RLS policies on purpose: only the service role (used by the API route) can read/write.
create index if not exists wf_places_cache_exp_idx on public.wf_places_cache (exp);
