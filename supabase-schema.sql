-- Wayfind backend schema
-- Paste this whole file into Supabase: Dashboard > SQL Editor > New query > Run.
-- It is safe to run more than once.

-- S1 (2026-07-17 audit): this older bootstrap file previously created
-- "for select using (true)" READ policies on the user-identity tables below
-- (profiles/likes/saved_places/follows), which let anon read every user's rows.
-- The live DB was fixed to owner-only reads (see supabase/RLS-APPLY-STEPS.md §4);
-- this file now produces the SAME owner-scoped state so re-running the bootstrap
-- can never reintroduce the leak. shared_lists keeps its intentional public
-- read (share-by-code). scripts/check-favorites-auth.mjs enforces both halves.

-- 1. PROFILES (each user's own identity row; NOT publicly readable)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
-- No shipped feature reads other users' profiles; a user reads only their own
-- via "users manage own profile" (for all). Drop any legacy public-read policy
-- without recreating it.
drop policy if exists "profiles are public" on profiles;
drop policy if exists "users manage own profile" on profiles;
create policy "users manage own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 2. LIKES (owner-only; a user reads only their own likes)
create table if not exists likes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade,
  place_id text not null,
  place jsonb,
  created_at timestamptz default now(),
  unique (user_id, place_id)
);
alter table likes enable row level security;
-- owner-only reads (was "for select using (true)").
drop policy if exists "likes are public" on likes;
drop policy if exists "own likes read" on likes;
create policy "own likes read" on likes for select using (auth.uid() = user_id);
drop policy if exists "users manage own likes" on likes;
create policy "users manage own likes" on likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. SAVED PLACES / LISTS (owner-only; a user reads only their own saves)
create table if not exists saved_places (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade,
  place_id text not null,
  place jsonb,
  list_name text default 'Favorites',
  created_at timestamptz default now(),
  unique (user_id, place_id, list_name)
);
alter table saved_places enable row level security;
-- owner-only reads (was "for select using (true)").
drop policy if exists "saved are public" on saved_places;
drop policy if exists "own saved read" on saved_places;
create policy "own saved read" on saved_places for select using (auth.uid() = user_id);
drop policy if exists "users manage own saved" on saved_places;
create policy "users manage own saved" on saved_places
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. FOLLOWS (who follows whom; owner-scoped, not public)
create table if not exists follows (
  follower_id uuid references auth.users on delete cascade,
  following_id uuid references auth.users on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);
alter table follows enable row level security;
-- Drop the public-read policy without recreating it; a user reads only their own
-- follow rows via "users manage own follows".
drop policy if exists "follows are public" on follows;
drop policy if exists "users manage own follows" on follows;
create policy "users manage own follows" on follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- 5. Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Shared lists: short codes for shareable links with rich previews
create table if not exists public.shared_lists (
  code text primary key,
  payload text not null,
  title text,
  loc text,
  n int,
  created_at timestamptz default now()
);
alter table public.shared_lists enable row level security;
drop policy if exists "shared_lists public read" on public.shared_lists;
create policy "shared_lists public read" on public.shared_lists for select using (true);
drop policy if exists "shared_lists public insert" on public.shared_lists;
create policy "shared_lists public insert" on public.shared_lists for insert with check (true);
