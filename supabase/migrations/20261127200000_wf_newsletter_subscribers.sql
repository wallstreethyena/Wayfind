-- Wayfind weekly things-to-do email: the subscriber list (owner order
-- 2026-11-27, "Yes, all four": an email signup on the site plus a weekly
-- email of things to do).
--
--   wf_newsletter_subscribers  one row per address. Holds only what the email
--                              needs: the address, the region the reader picked
--                              (a lib/regionalWeekend.js key), the consent they
--                              gave (exact words, where, when) and a random
--                              unsubscribe token. No name, no location, no IP.
--
-- SECURITY. RLS is ON with NO policies, and anon/authenticated hold no grants:
-- only the service role (the subscribe/unsubscribe routes and the weekly cron)
-- can read or write. The unsubscribe token is 32 random bytes (hex), unique,
-- and is the only thing an unsubscribe link carries.
--
-- SENDING. last_sent_week (ISO week, e.g. 2026-W48) makes the weekly send
-- idempotent: the cron only mails rows whose last_sent_week differs from the
-- current week, then stamps it. Nothing sends unless WEEKLY_EMAIL_ENABLED is
-- the literal "1" in Vercel (off at launch, on only with the owner's OK).
--
-- Additive only. Reverse:
--   drop table if exists public.wf_newsletter_subscribers;

begin;

create table if not exists public.wf_newsletter_subscribers (
  id                bigint generated always as identity primary key,
  email             text not null unique
                    check (char_length(email) between 6 and 254 and email = lower(email) and email ~ '^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$'),
  region            text not null
                    check (region in ('tampa', 'sarasota', 'orlando', 'miami', 'jacksonville', 'fort-myers')),
  status            text not null default 'subscribed'
                    check (status in ('subscribed', 'unsubscribed')),
  consent_text      text not null check (char_length(consent_text) between 10 and 500),
  consent_version   text not null check (char_length(consent_version) between 1 and 40),
  consent_source    text not null default 'site' check (char_length(consent_source) between 1 and 40 and consent_source ~ '^[a-z0-9_-]+$'),
  consent_page      text check (consent_page is null or (char_length(consent_page) <= 200 and consent_page ~ '^/')),
  consented_at      timestamptz not null default now(),
  unsubscribe_token text not null unique check (unsubscribe_token ~ '^[a-f0-9]{64}$'),
  unsubscribed_at   timestamptz,
  last_sent_week    text check (last_sent_week is null or last_sent_week ~ '^[0-9]{4}-W[0-9]{2}$'),
  last_sent_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists wf_newsletter_subscribers_send_idx
  on public.wf_newsletter_subscribers (status, region, last_sent_week);

alter table public.wf_newsletter_subscribers enable row level security;
revoke all on table public.wf_newsletter_subscribers from anon, authenticated;
grant all on table public.wf_newsletter_subscribers to service_role;

commit;
