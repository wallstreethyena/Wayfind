-- Wayfind schema — the five tables the app reads/writes that were never
-- provisioned. comments.sql already covers community takes; run this file once
-- in the Supabase SQL editor to add the rest. Without these, saves, likes,
-- shared links, offers, and the giveaway's event log all fail silently.
-- Every statement is idempotent (if not exists), so it is safe to re-run.
-- Column names here match exactly what the app inserts/selects — do not rename.

-- 1. events — analytics log AND the giveaway's entry source. Rows can be
--    anonymous (user_id null). Inserted from the browser with the anon key, so
--    insert is open; there is no public SELECT, since the Nov 1 giveaway draw
--    runs in the SQL editor under the service role, which bypasses RLS.
--    NOTE: the app currently logs share events with user_id = null (see the
--    audit). The giveaway draw filters on "user_id is not null", so until the
--    app sets user_id on share events, this table fills but the draw stays
--    empty. Creating the table is necessary but not sufficient for the giveaway.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  place_id text,
  place_name text,
  device_id text,
  user_id uuid references auth.users(id) on delete set null,
  meta jsonb,
  created_at timestamptz default now()
);
create index if not exists events_share_idx on public.events (action, user_id, created_at);
alter table public.events enable row level security;
create policy "insert any event" on public.events for insert with check (true);

-- 2. saved_places — cloud-synced lists (Favorites, Disliked, Shared) per user.
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  place jsonb not null,
  list_name text not null,
  created_at timestamptz default now(),
  unique (user_id, place_id, list_name)
);
alter table public.saved_places enable row level security;
create policy "own saved read"   on public.saved_places for select using (auth.uid() = user_id);
create policy "own saved insert" on public.saved_places for insert with check (auth.uid() = user_id);
create policy "own saved update" on public.saved_places for update using (auth.uid() = user_id);
create policy "own saved delete" on public.saved_places for delete using (auth.uid() = user_id);

-- 3. likes — cloud-synced per-place likes.
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  place jsonb,
  created_at timestamptz default now(),
  unique (user_id, place_id)
);
alter table public.likes enable row level security;
create policy "own likes read"   on public.likes for select using (auth.uid() = user_id);
create policy "own likes insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "own likes delete" on public.likes for delete using (auth.uid() = user_id);

-- 4. shared_lists — share-a-list-by-link. Anyone can create a share; anyone
--    holding the code can read it (public by design). No user_id: shares are
--    anonymous links, read by /s/[code].
create table if not exists public.shared_lists (
  code text primary key,
  payload jsonb not null,
  title text,
  loc text,
  n int,
  created_at timestamptz default now()
);
alter table public.shared_lists enable row level security;
create policy "read shared by code" on public.shared_lists for select using (true);
create policy "create shared"       on public.shared_lists for insert with check (true);

-- 5. offers — admin-curated deals shown on matching places. READ-ONLY from the
--    app, matched by google_place_id or normalized_business_name; you populate
--    it yourself from the dashboard. The app queries those two keys and reads
--    offer.id. The remaining display columns (title/description/url/cta) are a
--    reasonable starting point — confirm them against your offer card before
--    relying on this; adjust names to match whatever the card renders.
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  google_place_id text,
  normalized_business_name text,
  title text,
  description text,
  url text,
  cta text,
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists offers_gpid_idx on public.offers (google_place_id);
create index if not exists offers_name_idx on public.offers (normalized_business_name);
alter table public.offers enable row level security;
create policy "read offers" on public.offers for select using (true);
