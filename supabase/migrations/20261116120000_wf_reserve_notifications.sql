-- wf_reserve_notifications: one durable row per (booking, kind) for guest texts about a booking (2026-11-16).
-- The row is the notification intent AND the guest's text consent record: it is created only when the guest ticked
-- "Text me this confirmation" on a booking that the database confirmed. The unique (booking_id, kind) pair is the
-- idempotency key: a retried request, a double tap or a second server instance can never create a second text.
-- Provider message ids are unique, so a delivery callback maps to exactly one booking.
-- Service role only: RLS on, no policies. Additive; rollback = drop table wf_reserve_notifications.

create table if not exists public.wf_reserve_notifications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.wf_reserve_bookings(id) on delete cascade,
  kind text not null check (kind in ('confirmation_sms')),
  channel text not null default 'sms' check (channel = 'sms'),
  recipient text not null check (recipient ~ '^\+[1-9][0-9]{7,14}$'),
  consent_at timestamptz not null,
  consent_text text not null check (char_length(consent_text) between 10 and 300),
  status text not null default 'queued' check (status in ('queued', 'accepted', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'unknown')),
  provider text check (provider in ('twilio')),
  provider_message_id text,
  attempts integer not null default 0 check (attempts between 0 and 2),
  last_error text check (last_error is null or char_length(last_error) <= 200),
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wf_reserve_notifications_one_per_kind unique (booking_id, kind),
  constraint wf_reserve_notifications_provider_id unique (provider, provider_message_id)
);

alter table public.wf_reserve_notifications enable row level security;
revoke all on table public.wf_reserve_notifications from anon, authenticated;

comment on table public.wf_reserve_notifications is
  'Guest booking texts. One row per (booking, kind), created only after the database confirmed the booking and the guest opted in. Service role only.';
