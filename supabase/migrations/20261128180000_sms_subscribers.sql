-- Wayfind text list (owner, 2026-11-28: "Build the opt-in"; names and numbers
-- saved for later texts). Only people who tick the opt-in box themselves on a
-- Group Vote ballot are stored. Service role only: RLS on with no policies, so
-- no browser client can read or write these rows.
create table if not exists public.wf_sms_subscribers (
  phone text primary key check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  first_name text check (first_name is null or char_length(first_name) <= 40),
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  consent_text text not null,
  consent_version text not null,
  consent_at timestamptz not null,
  source text not null,
  source_ref text,
  ip text,
  user_agent text,
  unsubscribed_at timestamptz,
  unsubscribe_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Append-only proof of every opt-in and opt-out, exactly as shown.
create table if not exists public.wf_sms_consent_log (
  id bigint generated always as identity primary key,
  phone text not null,
  action text not null check (action in ('opt_in', 'opt_out', 'help')),
  first_name text,
  consent_text text,
  consent_version text,
  consent_at timestamptz not null default now(),
  source text not null,
  source_ref text,
  ip text,
  user_agent text
);
create index if not exists wf_sms_consent_log_phone on public.wf_sms_consent_log (phone, consent_at desc);
alter table public.wf_sms_subscribers enable row level security;
alter table public.wf_sms_consent_log enable row level security;
revoke all on public.wf_sms_subscribers from anon, authenticated;
revoke all on public.wf_sms_consent_log from anon, authenticated;
