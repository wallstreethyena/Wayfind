-- Phone requests: Santa asks a restaurant for a table by phone, only after the guest taps Confirm.
-- NOT APPLIED. Empty allowlist in the app (RESERVE_PHONE_ENABLED defaults off, RESERVE_PHONE_ALLOWLIST empty).
-- No audio is stored. Florida is a two party consent state, so this schema has no recording, transcript, or bytea column.
-- Service role only. RLS on, no policies. Rollback = drop the four tables below.
-- A verified phone row is inserted later by the owner for the one restaurant they pick. This file inserts nothing.

create table if not exists public.wf_reserve_phone_places (
  place_id text primary key,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  timezone text not null check (char_length(timezone) between 3 and 64),
  hours jsonb not null check (jsonb_typeof(hours) = 'object'),
  verified_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wf_reserve_phone_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  place_id text not null,
  restaurant_name text not null check (char_length(restaurant_name) between 1 and 80),
  idempotency_key uuid not null,
  guest_label text not null check (char_length(guest_label) between 1 and 42 and guest_label !~ '[0-9]'),
  party_size int not null check (party_size between 1 and 20),
  reserve_date date not null,
  reserve_time time not null,
  window_minutes int not null check (window_minutes between 15 and 180),
  outcome text check (outcome is null or outcome in ('confirmed', 'declined', 'alternative_offered', 'needs_guest', 'failed')),
  summary text check (summary is null or (char_length(summary) <= 180 and summary !~ '[0-9]{10}')),
  alternative_time time,
  accepted_within_window boolean not null default false,
  confirmation_detail text check (confirmation_detail is null or (char_length(confirmation_detail) between 2 and 12 and confirmation_detail ~ '^[A-Za-z0-9]+$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_reserve_phone_requests_user_idem unique (user_id, idempotency_key)
);

create table if not exists public.wf_reserve_phone_calls (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.wf_reserve_phone_requests(id) on delete cascade,
  place_id text not null,
  provider text not null check (provider = 'twilio'),
  provider_call_id text check (provider_call_id is null or provider_call_id ~ '^CA[0-9a-f]{32}$'),
  status text not null check (status in ('claimed', 'placed', 'completed', 'failed')),
  outcome text check (outcome is null or outcome in ('confirmed', 'declined', 'alternative_offered', 'needs_guest', 'failed')),
  summary text check (summary is null or (char_length(summary) <= 180 and summary !~ '[0-9]{10}')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_reserve_phone_calls_provider_sid unique (provider, provider_call_id)
);

create index if not exists wf_reserve_phone_calls_created on public.wf_reserve_phone_calls (created_at);

create table if not exists public.wf_reserve_phone_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid,
  place_id text not null check (char_length(place_id) between 1 and 200),
  event text not null check (event in ('refused', 'placed', 'outcome')),
  code text check (code is null or char_length(code) <= 40),
  outcome text check (outcome is null or outcome in ('confirmed', 'declined', 'alternative_offered', 'needs_guest', 'failed')),
  summary text check (summary is null or (char_length(summary) <= 180 and summary !~ '[0-9]{10}')),
  created_at timestamptz not null default now()
);

alter table public.wf_reserve_phone_places enable row level security;
alter table public.wf_reserve_phone_requests enable row level security;
alter table public.wf_reserve_phone_calls enable row level security;
alter table public.wf_reserve_phone_audit enable row level security;

revoke all on table public.wf_reserve_phone_places, public.wf_reserve_phone_requests, public.wf_reserve_phone_calls, public.wf_reserve_phone_audit from public, anon, authenticated;
grant select, insert, update, delete on table public.wf_reserve_phone_places, public.wf_reserve_phone_requests, public.wf_reserve_phone_calls, public.wf_reserve_phone_audit to service_role;

comment on table public.wf_reserve_phone_requests is
  'One guest Confirm for a phone request. Stores the spoken first name and last initial, the outcome, and a short summary.';
comment on table public.wf_reserve_phone_calls is
  'At most one outbound call per phone request.';
