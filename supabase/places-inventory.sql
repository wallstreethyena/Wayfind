-- v6.04 — the OWNED candidate set (PR-B slice 1).
--
-- WHY THIS EXISTS: today every category list is built from a LIVE third-party
-- text search on a hardcoded string ("top tourist attractions", "best hotels"),
-- so Foursquare/Google text-relevance decides which places are even ELIGIBLE.
-- That is why Marie Selby (a paid botanical garden) and Mote (Google-typed a
-- "research_institute", not an aquarium) are never candidates, why raising the
-- radius does nothing (the cap is limit=30, not distance), and why "Stay" shows
-- three hotels. This table inverts that: Wayfind owns the inventory, seeds it by
-- GEOGRAPHY + TYPE (not by search relevance), and the lists READ from here. The
-- third parties become a data source, not the gatekeeper of eligibility.
--
-- Distinct from the two existing tables, on purpose:
--   • wf_places_cache — a short-TTL KV response cache (k/v/exp).
--   • wf_place_ids    — a SEARCH LOG (rows appear only after a user search hits
--                       that place); it is shaped by traffic, not coverage.
--   • wf_inventory    — THIS: a deliberate, geography-complete inventory.
--
-- Reconciliation key is the Google Place ID (indefinite per Google ToS). A place
-- discovered via Foursquare in the seeder (slice 2) is resolved to its Google
-- Place ID before it lands here, so there is exactly one row per real place.

create table if not exists public.wf_inventory (
  place_id     text primary key,               -- Google Place ID (canonical key)
  name         text not null,
  lat          double precision,
  lng          double precision,
  category     text not null,                  -- food|nightlife|attractions|beach|hotels|shopping
  tags         text[] not null default '{}',   -- sub-filter ids ONLY (see lib/placeTaxonomy.js)
  google_types text[] not null default '{}',   -- raw Google types (re-map source of truth)
  primary_type text,                           -- Google primaryType (strongest single signal)
  metro        text not null,                  -- seed region, e.g. 'manatee-sarasota'
  signals      jsonb,                          -- { rating, reviews, wfScore, price, priceNum }
  editorial    text,                           -- Google editorialSummary (grounds descriptions)
  photo_ref    text,                           -- Google photo resource name (render w/o live search)
  status       text,                           -- businessStatus (OPERATIONAL/CLOSED_*)
  anchor       boolean not null default false, -- marquee coverage guarantee (Selby/Mote/Ringling)
  source       text,                           -- discovery path: google_type | fsq | anchor
  -- v6.07 review queue: a category the seeder recovered from the NAME (not a real
  -- Google type) is NOT trusted — it lands with last_verified_at=null and
  -- needs_review=true. The name net flags; it never silently decides. Anchors and
  -- type/primaryType-decided rows get a real last_verified_at.
  needs_review boolean not null default false,
  last_verified_at timestamptz,               -- null = never verified (name-recovered or unresolved)
  -- v6.07: a hand-corrected row the seeder must NEVER overwrite. Set locked=true
  -- after you fix a row (a wrong category, a closed listing, an edited field) and
  -- a re-run of the seeder skips it entirely — the by-hand equivalent of the reason
  -- the cron was rejected ("Google still lists it open; don't reinstate my fix").
  locked       boolean not null default false,
  seen_at      timestamptz not null default now(),
  refreshed_at timestamptz not null default now()
);
-- Idempotent adds so re-applying over an already-created table is safe.
alter table public.wf_inventory add column if not exists needs_review boolean not null default false;
alter table public.wf_inventory add column if not exists last_verified_at timestamptz;
alter table public.wf_inventory add column if not exists locked boolean not null default false;

-- The read path (slice 3) scopes by (metro, category) then ranks; the geo index
-- backs the post-fetch distance gate that the live-search path never enforced.
create index if not exists wf_inventory_cat_metro on public.wf_inventory (metro, category);
create index if not exists wf_inventory_geo        on public.wf_inventory (lat, lng);
create index if not exists wf_inventory_anchor      on public.wf_inventory (anchor) where anchor;
create index if not exists wf_inventory_review      on public.wf_inventory (needs_review) where needs_review;

-- RLS: same posture as wf_place_ids. Writes are SERVICE-ROLE ONLY (the service
-- role bypasses RLS, so no write policy is declared — that is what keeps writes
-- server-only). Anon may READ the inventory so a cold client can render lists.
alter table public.wf_inventory enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='wf_inventory' and policyname='wf_inventory_anon_read') then
    create policy wf_inventory_anon_read on public.wf_inventory for select to anon, authenticated using (true);
  end if;
end $$;
