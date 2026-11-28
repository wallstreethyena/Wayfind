-- Owner name-based place intake (lib/placeNameIngest.js, /api/cron/place-name-ingest).
-- One row per place the owner wants on Wayfind, named the way a creator names
-- it. Service role only: RLS on, no policies, so no visitor can read or add one.
create table if not exists public.wf_place_name_requests (
  id bigserial primary key,
  name text not null check (length(trim(name)) between 2 and 160),
  area text not null check (length(trim(area)) between 2 and 80),
  match_words text[],
  near_lat double precision not null check (near_lat between 24 and 31.5),
  near_lng double precision not null check (near_lng between -88 and -79.5),
  source_note text,
  status text not null default 'pending' check (status in (
    'pending','waiting_lookup','waiting_rating',
    'published','already_card','below_9','no_rating','no_photo','no_match',
    'ambiguous','closed','outside_metros','unclassified','failed')),
  place_id text,
  matched_name text,
  address text,
  primary_type text,
  google_types text[],
  rating numeric,
  reviews integer,
  score integer,
  metro text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (name, area)
);
alter table public.wf_place_name_requests enable row level security;
revoke all on public.wf_place_name_requests from anon, authenticated;
create index if not exists wf_place_name_requests_open on public.wf_place_name_requests (updated_at)
  where status in ('pending','waiting_lookup','waiting_rating');
