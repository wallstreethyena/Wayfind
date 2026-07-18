-- supabase/experiences.sql — Experiences v3: bookable Viator products, cached
-- server-side so the client rail is a fast DB read (never a per-request metered
-- Viator call). Populated ONLY by the cron (app/api/cron/experiences) via the
-- service-role key. Apply in the Supabase SQL editor (service-role cannot run
-- DDL over PostgREST). Idempotent — safe to re-apply.
--
-- Affiliate isolation: this table feeds the affiliate rail ONLY. Nothing here is
-- read by lib/score.js or lib/ranking.js; a product's presence/rank never
-- influences a Wayfind Score or placement.

create table if not exists public.wf_experiences (
  product_code text primary key,               -- Viator productCode (canonical key)
  provider     text not null default 'viator',
  dest_id      text not null,                  -- Viator destinationId the product was pulled under
  city         text not null,                  -- display market (Sarasota|St. Petersburg|Clearwater|Tampa|Orlando)
  categories   text[] not null default '{}',   -- our catalog keys this product matched (kayaking|water|…)
  title        text not null,
  product_url  text not null,                  -- Viator productUrl AS RETURNED (never hand-built; pid wrapped at render)
  image        text,
  rating       double precision,
  reviews      integer not null default 0,
  from_price   integer,                         -- USD, rounded
  duration_min integer,
  flags        text[] not null default '{}',    -- Viator product flags (LIKELY_TO_SELL_OUT, SPECIAL_OFFER, …)
  selling_out  boolean not null default false,  -- derived from flags: LIKELY_TO_SELL_OUT
  lat          double precision,
  lng          double precision,
  refreshed_at timestamptz not null default now()
);

-- idempotent adds so re-applying over an older shape is safe
alter table public.wf_experiences add column if not exists categories   text[] not null default '{}';
alter table public.wf_experiences add column if not exists selling_out  boolean not null default false;
alter table public.wf_experiences add column if not exists from_price   integer;
alter table public.wf_experiences add column if not exists refreshed_at timestamptz not null default now();

-- serve queries filter by city (+ category via array containment) and rank by rating
create index if not exists wf_experiences_city on public.wf_experiences (city);
create index if not exists wf_experiences_dest on public.wf_experiences (dest_id);
create index if not exists wf_experiences_cat  on public.wf_experiences using gin (categories);
create index if not exists wf_experiences_sellout on public.wf_experiences (city) where selling_out = true;

-- RLS: writes are SERVICE-ROLE ONLY (no write policy declared → only the
-- service role, which bypasses RLS, can write). anon/authenticated may READ.
alter table public.wf_experiences enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wf_experiences' and policyname = 'wf_experiences_anon_read'
  ) then
    create policy wf_experiences_anon_read on public.wf_experiences
      for select to anon, authenticated using (true);
  end if;
end $$;
