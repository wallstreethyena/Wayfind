-- Wayfind: shareable list short links
-- Run this once in your Supabase SQL editor (Dashboard > SQL Editor > New query > paste > Run).
-- Until this table exists, sharing a list falls back to a clean link to the app
-- (no giant text blob), but the recipient will not see the specific list.
-- After this runs, sharing a list creates a short /s/{code} link that opens the
-- exact list and unfurls into a rich preview card.

create table if not exists public.shared_lists (
  code        text primary key,
  payload     text not null,
  title       text,
  loc         text,
  n           integer,
  created_at  timestamptz not null default now()
);

alter table public.shared_lists enable row level security;

-- Anyone can create a share link (the app uses the anon key from the browser).
drop policy if exists "shared_lists insert" on public.shared_lists;
create policy "shared_lists insert" on public.shared_lists
  for insert with check (true);

-- Anyone with the link can read the shared list.
drop policy if exists "shared_lists read" on public.shared_lists;
create policy "shared_lists read" on public.shared_lists
  for select using (true);
