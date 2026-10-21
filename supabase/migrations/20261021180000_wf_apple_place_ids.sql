-- 20261021180000_wf_apple_place_ids.sql — FREE APPLE PINS (owner, 2026-10-21:
-- "I want the pins, and I don't want to buy that").
--
-- WHAT IS STORED, AND WHY IT MAY BE. Only Apple Place IDs plus Wayfind's own
-- match evidence. Apple: "Place IDs are exempt from the storage restrictions in
-- Section 2.5 of Attachment 6 to the Apple Developer Program License Agreement"
-- and "You can also use a Place ID as a primary key or as part of a composite
-- key in a database" (developer.apple.com/documentation/mapkit/
-- identifying-unique-locations-with-place-ids). Apple's names, addresses and
-- coordinates are Map Data (Attachment 6 §2.5: no caching beyond temporary use)
-- and have NO column here. The browser resolves a Place ID to Apple's current
-- coordinate with MapKit JS PlaceLookup at render time, in memory only.
--
-- 1. public.wf_apple_place_ids: one row per Wayfind place the matcher
--    (scripts/apple-place-match.mjs) checked. status 'matched' carries the Place
--    ID; 'refused' records why no safe match exists (ambiguous, name-mismatch,
--    ...) so the matcher does not spend Apple calls on it again until recheck.
-- 2. wf_source_registry row 'apple_maps': the ONE daily ceiling every metered
--    Apple call reserves through wf_reserve_free_provider_call (browser
--    PlaceLookup/Search via /api/maps/apple-budget, and the matcher). Apple's
--    free allowance is 25,000 service calls per day per team shared by Maps
--    Server API and MapKit JS (developer.apple.com/documentation/
--    applemapsserverapi); 15,000 leaves headroom for un-metered Apple surfaces
--    (event routes, parking search, pre-existing per-map caps).
--
-- Additive and idempotent. No change to wf_inventory, lat/lng or refreshed_at.
-- Rollback: delete from public.wf_source_registry where provider='apple_maps'
-- (after deleting its wf_provider_usage_daily / wf_provider_call_budget_daily
-- rows); drop table public.wf_apple_place_ids.

create table if not exists public.wf_apple_place_ids (
  place_id text primary key references public.wf_inventory(place_id) on delete cascade,
  status text not null check (status in ('matched', 'refused')),
  apple_place_id text check (apple_place_id is null or apple_place_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  reason text,
  name_score numeric check (name_score is null or (name_score >= 0 and name_score <= 1)),
  category_checked boolean not null default false,
  method text not null,
  matched_name text not null,
  checked_at timestamptz not null default now(),
  constraint wf_apple_place_ids_matched_has_id check ((status = 'matched') = (apple_place_id is not null))
);

comment on table public.wf_apple_place_ids is
  'Apple Place ID per Wayfind place (storable: exempt from DPLA Att.6 §2.5). Never Apple names/addresses/coordinates. matched_name is the WAYFIND name that was matched, so a renamed place is rechecked.';

create index if not exists wf_apple_place_ids_status_idx on public.wf_apple_place_ids (status, checked_at);

alter table public.wf_apple_place_ids enable row level security;
revoke all on public.wf_apple_place_ids from anon, authenticated;

insert into public.wf_source_registry (
  provider, source_class, capabilities, status, metered,
  hard_call_ceiling_daily, cost_after_free_micros, auth_type,
  cache_policy, retention_policy, internal_use, display_allowed,
  derived_facts_allowed, raw_redistribution_allowed, commercial_api_allowed,
  adapter_module, fallback_rank, documentation_url, last_verified_at
) values (
  'apple_maps', 'official_api', array['map_place_lookup','map_search','server_search'],
  'healthy', true, 15000, 0, 'jwt',
  'Place IDs only (exempt from DPLA Attachment 6 §2.5); Apple coordinates/names held in browser memory for the mounted Apple map only',
  'Place IDs indefinitely; Map Data never stored', true, true,
  false, false, true, 'lib/applePlaceIds.js', 20,
  'https://developer.apple.com/documentation/applemapsserverapi', date '2026-10-21'
)
on conflict (provider) do update set
  source_class=excluded.source_class, capabilities=excluded.capabilities,
  hard_call_ceiling_daily=excluded.hard_call_ceiling_daily,
  cost_after_free_micros=excluded.cost_after_free_micros,
  auth_type=excluded.auth_type, cache_policy=excluded.cache_policy,
  retention_policy=excluded.retention_policy, adapter_module=excluded.adapter_module,
  documentation_url=excluded.documentation_url, last_verified_at=excluded.last_verified_at,
  updated_at=now();
