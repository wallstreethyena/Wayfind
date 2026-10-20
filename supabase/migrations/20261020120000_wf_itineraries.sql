-- Itinerary option B. Additive. Not applied to production by this change.
-- Owner rows only. A share link is a separate shared_lists snapshot, created
-- only when the person taps Share. visibility defaults to private.
-- Tested on isolated PGlite by scripts/test-itinerary-rls.mjs.
-- Apply with scripts/apply-migration.mjs after owner approval. Do not run
-- this against the production project from a feature branch.

begin;

create table public.wf_itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_key text not null check (char_length(local_key) between 1 and 80),
  title text not null default '',
  city text not null default 'Unsorted',
  state text,
  start_date date,
  end_date date,
  visibility text not null default 'private' check (visibility in ('private', 'link')),
  share_code text check (share_code is null or share_code ~ '^[a-z0-9]{7}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (user_id, local_key)
);

create index wf_itineraries_owner_updated on public.wf_itineraries (user_id, updated_at desc);

create table public.wf_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.wf_itineraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_item_id text not null check (char_length(local_item_id) between 1 and 200),
  kind text not null default 'place' check (kind in ('place', 'event', 'note')),
  ref_id text,
  day_index integer,
  nights integer,
  sort_key text not null default '000000',
  locked boolean not null default false,
  visited boolean not null default false,
  note text not null default '' check (char_length(note) <= 2000),
  place jsonb not null default '{}'::jsonb,
  added_via text,
  scheduled_on date,
  created_at timestamptz not null default clock_timestamp(),
  unique (itinerary_id, local_item_id),
  check (pg_column_size(place) <= 12000)
);

create index wf_itinerary_items_itinerary on public.wf_itinerary_items (itinerary_id, sort_key);

create function public.wf_itineraries_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end $$;

create trigger wf_itineraries_touch
  before update on public.wf_itineraries
  for each row execute function public.wf_itineraries_touch();

alter table public.wf_itineraries enable row level security;
alter table public.wf_itinerary_items enable row level security;

revoke all on public.wf_itineraries, public.wf_itinerary_items from public, anon;
grant select, insert, update, delete on public.wf_itineraries, public.wf_itinerary_items to authenticated, service_role;

create policy wf_itineraries_select on public.wf_itineraries
  for select to authenticated using (auth.uid() = user_id);
create policy wf_itineraries_insert on public.wf_itineraries
  for insert to authenticated with check (auth.uid() = user_id);
create policy wf_itineraries_update on public.wf_itineraries
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_itineraries_delete on public.wf_itineraries
  for delete to authenticated using (auth.uid() = user_id);

create policy wf_itinerary_items_select on public.wf_itinerary_items
  for select to authenticated using (auth.uid() = user_id);
create policy wf_itinerary_items_insert on public.wf_itinerary_items
  for insert to authenticated with check (auth.uid() = user_id);
create policy wf_itinerary_items_update on public.wf_itinerary_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wf_itinerary_items_delete on public.wf_itinerary_items
  for delete to authenticated using (auth.uid() = user_id);

commit;
