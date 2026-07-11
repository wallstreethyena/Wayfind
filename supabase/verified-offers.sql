-- Booking-CTA integrity, Phase 1 (BOOKING_INTEGRITY_DIAGNOSIS.md). Run this
-- in the Supabase SQL editor once, same as supabase/schema.sql's other
-- tables. Populated ONLY by server-side code holding SUPABASE_SERVICE_ROLE_KEY
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
create policy "read live verified offers" on public.verified_offers for select using (status = 'live');
-- No insert/update/delete policy for anon/authenticated -- writes are
-- service-role only (bypasses RLS entirely), matching this repo's existing
-- pattern for the events table (see supabase/schema.sql).
