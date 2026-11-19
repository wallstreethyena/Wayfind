-- Booking agent runs. NOT APPLIED. Owner applies after review.
-- The worker is dark until BOOKING_AGENT_ENABLED, BOOKING_AGENT_SITE_OPENTABLE and this site's status are all on.
-- Guest name, phone and email are NOT stored here. They stay on wf_booking_profiles and are read at run time.
-- sms_consent is the guest's opt-in for one confirmation text. It is not the phone number.
-- Writes are service role only. A signed-in guest may select their own runs and the events for those runs.

create table if not exists public.wf_booking_agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  place_id text not null,
  site text not null check (site = 'opentable'),
  external_id text not null check (external_id ~ '^[0-9]{1,9}$'),
  date date not null,
  time time not null,
  party int not null check (party between 1 and 20),
  idempotency_key text not null,
  status text not null check (
    status in (
      'queued', 'opening', 'selecting_slot', 'form_ready', 'filling', 'review', 'submitting', 'awaiting_sms_code', 'confirmed',
      'unknown_after_submit', 'cancelled_by_user', 'refused_flag_off', 'refused_kill_switch'
    )
    or status ~ '^handback:(challenge|login_required|payment_required|phone_verification|slot_unavailable|unrecognized_page|timeout)$'
    or status ~ '^failed:[a-z0-9_]{1,40}$'
  ),
  reason text check (reason is null or char_length(reason) <= 80),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  consent_at timestamptz not null,
  confirmation_number text check (confirmation_number is null or char_length(confirmation_number) <= 40),
  parsed_summary jsonb,
  selector_map_version text not null check (char_length(selector_map_version) between 1 and 40),
  sms_consent boolean not null default false,
  sms_code text check (sms_code is null or sms_code ~ '^[0-9]{4,8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_booking_agent_runs_idem unique (idempotency_key)
);

create index if not exists wf_booking_agent_runs_user_created on public.wf_booking_agent_runs (user_id, created_at desc);
create index if not exists wf_booking_agent_runs_site_status on public.wf_booking_agent_runs (site, status);

create table if not exists public.wf_booking_agent_events (
  run_id uuid not null references public.wf_booking_agent_runs (id) on delete cascade,
  seq int not null check (seq >= 1),
  step text not null check (step ~ '^[a-z_]{1,40}$'),
  outcome text check (outcome is null or char_length(outcome) <= 80),
  url_path text check (url_path is null or (char_length(url_path) <= 200 and url_path !~ '[?@]')),
  http_status int check (http_status is null or http_status between 0 and 599),
  ms int check (ms is null or ms >= 0),
  created_at timestamptz not null default now(),
  primary key (run_id, seq)
);

create unique index if not exists wf_booking_agent_events_sms_once
  on public.wf_booking_agent_events (run_id) where step = 'sms_intent';

create table if not exists public.wf_booking_agent_sites (
  site text primary key check (site = 'opentable'),
  status text not null default 'off' check (status in ('off', 'on', 'paused', 'disabled')),
  paused_until timestamptz,
  last_challenge_at timestamptz,
  challenge_count_7d int not null default 0 check (challenge_count_7d >= 0)
);

insert into public.wf_booking_agent_sites (site, status)
values ('opentable', 'off')
on conflict (site) do nothing;

alter table public.wf_booking_agent_runs enable row level security;
alter table public.wf_booking_agent_events enable row level security;
alter table public.wf_booking_agent_sites enable row level security;

revoke all on public.wf_booking_agent_runs, public.wf_booking_agent_events, public.wf_booking_agent_sites from public, anon, authenticated;
grant select on public.wf_booking_agent_runs to authenticated;
grant select on public.wf_booking_agent_events to authenticated;
grant select, insert, update, delete on public.wf_booking_agent_runs, public.wf_booking_agent_events, public.wf_booking_agent_sites to service_role;

create policy wf_booking_agent_runs_owner_select on public.wf_booking_agent_runs
  for select to authenticated using (user_id = auth.uid());

create policy wf_booking_agent_events_owner_select on public.wf_booking_agent_events
  for select to authenticated using (
    exists (
      select 1 from public.wf_booking_agent_runs r
      where r.id = run_id and r.user_id = auth.uid()
    )
  );

comment on table public.wf_booking_agent_runs is
  'Supervised OpenTable booking attempts. One row per guest tap. No name, phone, email, card, or password. Service role writes; the owner may select.';
comment on table public.wf_booking_agent_events is
  'Redacted step log for a booking agent run. No PII columns. Service role writes; the owner may select events for their own runs.';
comment on table public.wf_booking_agent_sites is
  'Per-site kill switch. Seeded off. Service role only.';
