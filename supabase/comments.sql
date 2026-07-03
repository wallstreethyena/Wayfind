-- Wayfind community takes. Paste into Supabase SQL editor and run once.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  place_name text,
  user_id uuid not null references auth.users(id) on delete cascade,
  author text,
  type text not null,
  body text not null,
  rating int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, place_id)
);
alter table public.comments enable row level security;
create policy "read all comments" on public.comments for select using (true);
create policy "insert own comment" on public.comments for insert with check (auth.uid() = user_id);
create policy "update own comment" on public.comments for update using (auth.uid() = user_id);

create policy "delete own comment" on public.comments for delete using (auth.uid() = user_id);
