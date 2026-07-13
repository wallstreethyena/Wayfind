-- Wayfind cache hardening (v5.90). APPLY IN THE SUPABASE DASHBOARD (SQL editor).
-- Non-destructive: adds a column + a new table. No data is dropped.

-- 1. wf_places_cache: record WHEN each row was written, so the stale-serve
--    fallback can enforce an age cap (Google ToS: place content <= 30 days).
alter table if exists public.wf_places_cache
  add column if not exists wrote_at timestamptz;
-- Backfill existing rows conservatively (assume a 10-day fresh TTL) so the age
-- cap treats them sensibly instead of as brand-new.
update public.wf_places_cache
  set wrote_at = (exp - interval '10 days')
  where wrote_at is null;

-- 2. wf_place_ids: PERMANENT index of Google Place IDs (allowed indefinitely by
--    the ToS) + our derived signals and a minimal skeleton, so feeds/tiles can
--    show known places when detail caches are cold and re-hydrate cheaply by ID.
create table if not exists public.wf_place_ids (
  place_id   text primary key,          -- Google Place ID (indefinite per ToS)
  name       text,                       -- minimal skeleton (owner-retained; refresh <=30d for strict ToS)
  lat        double precision,
  lng        double precision,
  category   text,                       -- OUR derived coarse category
  signals    jsonb,                      -- OUR derived ranking signals (wfScore, reviews, ...)
  seen_at    timestamptz not null default now()
);
create index if not exists wf_place_ids_seen on public.wf_place_ids(seen_at);

-- 3. RLS: writes are SERVICE-ROLE ONLY (the service role bypasses RLS, so no
--    write policy is defined). Anon may READ the skeleton index (non-sensitive,
--    lets a cold client render a known-places skeleton). The wf_places_cache
--    content stays admin-only unless you already expose it.
alter table public.wf_place_ids enable row level security;
drop policy if exists wf_place_ids_public_read on public.wf_place_ids;
create policy wf_place_ids_public_read on public.wf_place_ids
  for select to anon using (true);
-- No insert/update/delete policy for anon/auth => only the service role can write.
