-- Wayfind Offers & Perks: data model
-- Run once in the Supabase SQL editor. Safe to re-run (every statement is guarded).
-- Admin for v1 is the Supabase Table Editor: you insert verified offers by hand.

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  place_id text,                         -- internal place id, if you ever keep one
  google_place_id text,                  -- Google place_id: the primary match key
  business_name text not null,
  normalized_business_name text,         -- lowercased, punctuation stripped, for name matching
  address text,
  city text,
  state text,
  latitude double precision,
  longitude double precision,
  offer_title text not null,
  offer_description text,
  offer_type text,                       -- happy_hour, kids_eat_free, percent_off, bogo, perk, partner...
  coupon_code text,
  affiliate_url text,
  direct_url text,
  source text default 'manual',          -- manual, admin, affiliate, merchant, partner
  source_offer_id text,
  redemption_method text,                -- in_store, code, online, show_phone, book...
  terms text,
  expiration_date date,
  last_verified_at timestamptz,
  confidence_score numeric default 1,    -- 0..1; manual offers you verified default to 1
  status text not null default 'active', -- active, possible, expired, rejected, partner, manual
  commission_available boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists offers_google_place_id_idx on public.offers (google_place_id);
create index if not exists offers_status_idx        on public.offers (status);
create index if not exists offers_norm_name_idx     on public.offers (normalized_business_name);
create index if not exists offers_expiration_idx    on public.offers (expiration_date);

-- keep updated_at current
create or replace function public.touch_offers_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists offers_touch_updated on public.offers;
create trigger offers_touch_updated before update on public.offers
for each row execute function public.touch_offers_updated_at();

-- Row Level Security: the public app may READ only live, public, unexpired offers.
-- You insert/edit through the Table Editor (service role), which bypasses RLS,
-- so no public write policy is granted on purpose.
alter table public.offers enable row level security;

drop policy if exists "public read live offers" on public.offers;
create policy "public read live offers" on public.offers
for select to anon, authenticated
using (
  status in ('active','partner','manual')
  and (expiration_date is null or expiration_date >= current_date)
);

-- ---------------------------------------------------------------------------
-- Your first real offer, two ways to match it to a place:
--
-- A) Best: paste the Google place_id (most reliable, no ambiguity).
-- insert into public.offers (google_place_id, business_name, normalized_business_name,
--   city, state, offer_title, offer_description, offer_type, redemption_method,
--   terms, expiration_date, last_verified_at, source, status)
-- values ('ChIJ...', 'Owen''s Fish Camp', 'owens fish camp',
--   'Sarasota', 'FL', 'Happy hour 4 to 6pm', 'Half price oysters and house wine at the bar.',
--   'happy_hour', 'in_store', 'Bar seating only. Cannot combine with other offers.',
--   '2026-12-31', now(), 'manual', 'active');
--
-- B) Easy: skip the place_id, the app will match on name + city.
-- insert into public.offers (business_name, normalized_business_name, city, state,
--   offer_title, offer_description, offer_type, redemption_method, last_verified_at, source, status)
-- values ('Owen''s Fish Camp', 'owens fish camp', 'Sarasota', 'FL',
--   'Happy hour 4 to 6pm', 'Half price oysters and house wine.', 'happy_hour',
--   'in_store', now(), 'manual', 'active');
-- ---------------------------------------------------------------------------
