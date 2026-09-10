-- wf_verified_offers — Booking-CTA integrity, Phase 1 (BOOKING_INTEGRITY_
-- DIAGNOSIS.md). Committed to the repo as supabase/verified-offers.sql
-- since Phase 1, but NEVER applied to production: to_regclass(
-- 'public.verified_offers') returns null (verified read-only, 2026-09-09).
--
-- THE CONSEQUENCE OF THAT GAP. lib/verifiedOfferStore.js is the only writer
-- and reader of this table, and by design (same as every optional
-- dependency in this repo) every one of its functions degrades to a
-- no-op/empty result when the table -- or the service key -- is
-- unreachable: getFanoutCount() returns 1 (neutral), getStaleLiveOffers()
-- returns [], persistOffer()/suppressOffer() return false, and nothing
-- throws. That degrade-to-no-op contract is correct for its two
-- user-facing callers (/api/viator/go, /api/viator/tours must never crash
-- a request over a missing fan-out signal) -- but it means
-- app/api/cron/verify-offers, which exists specifically to re-verify
-- LIVE offers before they go stale, has been returning
-- { ok: true, checked: 0, ... } every run since Phase 4 shipped: a
-- healthy-looking zero-work response with no distinction from "nothing to
-- re-verify right now." This migration is the fix for THAT gap -- the
-- table this repo has assumed existed since Phase 1.
--
-- Populated ONLY by server-side code holding SUPABASE_SERVICE_ROLE_KEY
-- (the /api/viator/tours + /api/viator/go resolvers, and the Phase 4
-- re-verification cron) -- there is no client write path, by design, since
-- "live" status is a proof the server established, not something a client
-- should ever be able to assert.
create table if not exists public.verified_offers (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  -- Phase 4: the cron re-verifies a row by re-running the same query, so a
  -- row must be able to rebuild that query on its own -- it must never
  -- depend on some other table still having the place around.
  place_name text,
  region text,
  kind text,
  product_provider text not null default 'viator',
  product_code text,
  product_url text not null,
  commissionable boolean not null default false,
  bookable_now boolean not null default false,
  confidence numeric not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'suppressed', -- 'live' | 'suppressed', mirrors lib/verifiedOffers.js STATUS
  verified_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (place_id, product_provider, product_code)
);
create index if not exists verified_offers_place_idx on public.verified_offers (place_id);
create index if not exists verified_offers_status_idx on public.verified_offers (status);
-- Fan-out lookups (lib/bookingResolver.js specificity signal): how many
-- distinct places has this product already matched?
create index if not exists verified_offers_product_idx on public.verified_offers (product_provider, product_code);

alter table public.verified_offers enable row level security;
-- Public read of LIVE offers only -- the app never needs to see suppressed/
-- proposed rows, and a suppressed row leaking client-side would defeat the
-- point (it would reveal a rejected match, which is still an unproven one).
-- drop+create for idempotency, this repo's own convention (see e.g.
-- 20260909_wf_place_photo_vault.sql) rather than `create policy if not
-- exists`, which Postgres does not support.
drop policy if exists "read live verified offers" on public.verified_offers;
create policy "read live verified offers" on public.verified_offers for select using (status = 'live');
-- No insert/update/delete policy for anon/authenticated -- writes are
-- service-role only (bypasses RLS entirely), matching this repo's existing
-- pattern for the events table (see supabase/schema.sql).
revoke all on public.verified_offers from anon, authenticated;
grant select on public.verified_offers to anon, authenticated;
grant select, insert, update, delete on public.verified_offers to service_role;

comment on table public.verified_offers is
  'Booking-CTA integrity Phase 1/4 (2026-09-09 applied -- see this file''s header for the silent-gap incident it closes). One row per (place_id, product_provider, product_code) VerifiedOffer lib/bookingResolver.js has scored. Written only by lib/verifiedOfferStore.js under SUPABASE_SERVICE_ROLE_KEY: /api/viator/tours and /api/viator/go persist a freshly-scored offer, app/api/cron/verify-offers (Phase 4) re-verifies LIVE rows past expires_at and suppresses any that no longer clear the hard invariant. status=''live'' is the only thing a client may ever read (RLS), and is a proof the server established -- never a client assertion.';
