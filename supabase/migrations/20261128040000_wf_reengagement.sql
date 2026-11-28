-- Wayfind re-engagement, PR 1 (server half): the tables behind "email me this
-- plan" and the follow ups that go with it. Nothing here sends anything by
-- itself; the routes and, later, a cron read and write these tables with the
-- service role.
--
--   wf_reengage_contacts      one row per address that asked for an itinerary
--                             email. Holds the address, its sha256 (email_hash,
--                             the ONLY lookup key: the address must never ride in
--                             a request URL), the exact consent the FIRST request
--                             gave (words, version, page, time, never rewritten by
--                             a later request), a random unsubscribe token,
--                             confirmed_at and open counters. No name, no
--                             location, no IP.
--                             confirmed_at is set when the recipient clicks the
--                             email's own "Open my plan" link. Anyone can type
--                             anyone's address, so a contact with confirmed_at
--                             NULL is unconfirmed: the itinerary email they
--                             received is the only mail they get. THE PR 2 DRIP
--                             DISPATCHER MUST ONLY SEND FOLLOW UPS TO CONTACTS
--                             WITH status = 'subscribed' AND confirmed_at NOT NULL.
--                             Drip rows are still queued before confirmation so a
--                             later click releases them; the dispatcher gates.
--   wf_reengage_push_subs     web push subscriptions (PR 2). The endpoint and keys
--                             are stored encrypted (endpoint_enc, keys_enc); the
--                             unique key is a sha256 of the endpoint.
--   wf_reengage_queue         one row per planned or sent message. Two unique keys
--                             make enqueueing idempotent: (anon_id, trigger_type,
--                             channel, step, dedupe_key) for push and anonymous
--                             rows, and (contact_id, trigger_type, channel, step,
--                             dedupe_key) for email rows, because a visitor with no
--                             wf_anon_id gets a fresh server id every request and
--                             only the contact is stable. The contact key is a plain
--                             (not partial) unique index on purpose: PostgREST's
--                             on_conflict cannot name a partial index predicate, and
--                             NULL contact_ids never collide in a unique index, so
--                             the plain index constrains exactly the rows with a
--                             contact. trigger_type 'itinerary_email' rows (step 0,
--                             status 'sent') are the immediate emails and serve the
--                             per recipient cap of 3 a day. A partial index on
--                             pending rows keeps the sender cheap, and indexes on
--                             sent rows serve the frequency caps.
--   wf_reengage_suppressions  addresses that must never be mailed again (hard
--                             bounce, complaint, unsubscribe, manual). Keyed by a
--                             sha256 of the lowercased address, so it survives a
--                             contact row being deleted.
--   wf_reengage_signals       small behaviour events (PR 2) that trigger a message.
--                             NO PII: an anonymous id, a kind, a path. Purge rows
--                             older than 90 days.
--
-- SECURITY. RLS is ON for every table with NO policies, and anon/authenticated
-- hold no grants: only the service role (the routes and crons) can read or
-- write. The unsubscribe token is 32 random bytes (hex), unique, and is the
-- only thing an unsubscribe link carries.
--
-- Additive only. Reverse (children first):
--   drop table if exists public.wf_reengage_suppressions;
--   drop table if exists public.wf_reengage_queue;
--   drop table if exists public.wf_reengage_signals;
--   drop table if exists public.wf_reengage_push_subs;
--   drop table if exists public.wf_reengage_contacts;

begin;

create table if not exists public.wf_reengage_contacts (
  id                bigint generated always as identity primary key,
  anon_id           uuid,
  user_id           uuid,
  email             text not null unique
                    check (char_length(email) between 6 and 254 and email = lower(email) and email ~ '^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$'),
  email_hash        text not null unique check (email_hash ~ '^[a-f0-9]{64}$'),
  status            text not null default 'subscribed'
                    check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  consent_text      text not null check (char_length(consent_text) between 10 and 500),
  consent_version   text not null check (char_length(consent_version) between 1 and 40),
  consent_page      text check (consent_page is null or (char_length(consent_page) <= 200 and consent_page ~ '^/')),
  consented_at      timestamptz not null default now(),
  unsubscribe_token text not null unique check (unsubscribe_token ~ '^[a-f0-9]{64}$'),
  confirmed_at      timestamptz,
  sends_unopened    smallint not null default 0 check (sends_unopened >= 0),
  last_opened_at    timestamptz,
  unsubscribed_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists wf_reengage_contacts_anon_idx
  on public.wf_reengage_contacts (anon_id);

create table if not exists public.wf_reengage_push_subs (
  id             bigint generated always as identity primary key,
  anon_id        uuid not null,
  user_id        uuid,
  endpoint_hash  text not null unique check (endpoint_hash ~ '^[a-f0-9]{64}$'),
  endpoint_enc   text not null check (char_length(endpoint_enc) between 1 and 4000),
  keys_enc       text not null check (char_length(keys_enc) between 1 and 2000),
  platform       text check (platform is null or platform in ('desktop', 'android', 'ios_pwa', 'other')),
  tz             text check (tz is null or char_length(tz) <= 64),
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists wf_reengage_push_subs_anon_idx
  on public.wf_reengage_push_subs (anon_id);

create table if not exists public.wf_reengage_queue (
  id               bigint generated always as identity primary key,
  anon_id          uuid not null,
  contact_id       bigint references public.wf_reengage_contacts (id) on delete cascade,
  trigger_type     text not null
                   check (trigger_type in ('itinerary_abandoned', 'itinerary_email', 'affiliate_drop', 'hub_browse', 'winback')),
  channel          text not null check (channel in ('push', 'email')),
  step             smallint not null check (step between 0 and 20),
  dedupe_key       text not null default '' check (char_length(dedupe_key) <= 120),
  payload          jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 16000),
  scheduled_for    timestamptz not null,
  status           text not null default 'pending'
                   check (status in ('pending', 'sending', 'sent', 'cancelled', 'suppressed_converted', 'skipped_cap', 'skipped_suppressed', 'failed')),
  resend_email_id  text check (resend_email_id is null or char_length(resend_email_id) <= 120),
  cancelled_reason text check (cancelled_reason is null or char_length(cancelled_reason) <= 80),
  attempts         smallint not null default 0 check (attempts >= 0),
  sent_at          timestamptz,
  opened_at        timestamptz,
  created_at       timestamptz not null default now(),
  unique (anon_id, trigger_type, channel, step, dedupe_key)
);

-- One row per contact, trigger, channel, step and plan (see the header: plain,
-- not partial, so on_conflict can target it).
create unique index if not exists wf_reengage_queue_contact_key
  on public.wf_reengage_queue (contact_id, trigger_type, channel, step, dedupe_key);

create index if not exists wf_reengage_queue_due_idx
  on public.wf_reengage_queue (scheduled_for) where status = 'pending';
create index if not exists wf_reengage_queue_anon_pending_idx
  on public.wf_reengage_queue (anon_id) where status = 'pending';
create index if not exists wf_reengage_queue_sent_cap_idx
  on public.wf_reengage_queue (anon_id, channel, sent_at) where status = 'sent';
create index if not exists wf_reengage_queue_contact_sent_idx
  on public.wf_reengage_queue (contact_id, trigger_type, sent_at) where status = 'sent';
create index if not exists wf_reengage_queue_contact_idx
  on public.wf_reengage_queue (contact_id) where status = 'pending';

create table if not exists public.wf_reengage_suppressions (
  id                bigint generated always as identity primary key,
  contact_id        bigint references public.wf_reengage_contacts (id) on delete set null,
  email_hash        text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  anon_id           uuid,
  kind              text not null check (kind in ('hard_bounce', 'complaint', 'unsubscribe', 'manual')),
  source            text check (source is null or char_length(source) <= 60),
  provider_event_id text unique check (provider_event_id is null or char_length(provider_event_id) <= 120),
  created_at        timestamptz not null default now()
);

create index if not exists wf_reengage_suppressions_hash_idx
  on public.wf_reengage_suppressions (email_hash);

create table if not exists public.wf_reengage_signals (
  id          bigint generated always as identity primary key,
  anon_id     uuid not null,
  kind        text not null check (kind in ('itinerary_generated', 'out_click', 'hub_view', 'return_visit')),
  path        text check (path is null or char_length(path) <= 200),
  meta        jsonb not null default '{}'::jsonb check (octet_length(meta::text) <= 2000),
  created_at  timestamptz not null default now()
);

create index if not exists wf_reengage_signals_anon_idx
  on public.wf_reengage_signals (anon_id, created_at);

alter table public.wf_reengage_contacts enable row level security;
alter table public.wf_reengage_push_subs enable row level security;
alter table public.wf_reengage_queue enable row level security;
alter table public.wf_reengage_suppressions enable row level security;
alter table public.wf_reengage_signals enable row level security;

revoke all on table public.wf_reengage_contacts from public, anon, authenticated;
revoke all on table public.wf_reengage_push_subs from public, anon, authenticated;
revoke all on table public.wf_reengage_queue from public, anon, authenticated;
revoke all on table public.wf_reengage_suppressions from public, anon, authenticated;
revoke all on table public.wf_reengage_signals from public, anon, authenticated;

grant all on table public.wf_reengage_contacts to service_role;
grant all on table public.wf_reengage_push_subs to service_role;
grant all on table public.wf_reengage_queue to service_role;
grant all on table public.wf_reengage_suppressions to service_role;
grant all on table public.wf_reengage_signals to service_role;

commit;
