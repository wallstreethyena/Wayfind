-- Seasonal live-area places, 2026-10-19.
-- Do not apply this from a cloud agent. It is for the founder to run.
-- It does not set photo_ref. A card in lib/seasonalLiveAreaPending20261019.js
-- stays off the posters until that place has its own stored photo and a later
-- change spreads the pending rows into the serving registry.
--
-- Places already in wf_inventory with photo_ref null, left untouched here:
--   Benchmark International Arena          ChIJSV2_Mo3EwogRc8CZwwOroSs
--   Seminole Heights United Methodist Church ChIJY8ox6qHGwogRuVDBPjx0laE
--   Gallagher's Pumpkin and Christmas Tree's patch ChIJO4wiQV3hwogRNncNJo43D5U
--     (St. Petersburg, 7401 4th St N. No new confirmed event card this pass.)
--
-- Not inserted, because no exact place_id exists in wf_inventory or wf_place_ids:
--   Lecanto Community Park
--   Crystal River Heritage Village
--     (Heritage Village ChIJC8LjwjH6wogRKE2kKOD0BkI is Largo. Do not use it.)
--
-- The Commons backfill does not take a place_id:
--   node scripts/backfill-place-photos.mjs --dry-run
-- Do not run it against production as part of applying this file.

begin;

insert into public.wf_place_ids
  (place_id, name, lat, lng, category, seen_at)
values
  ('ChIJ9_6n_N7wwogR0_89wCluWV0', 'Coachman Park', 27.96560, -82.80233, 'Activities', now()),
  ('ChIJiZrtZSvxwogRE9eu4Xpy9Yc', 'Clearwater Marine Aquarium', 27.97693, -82.81770, 'Activities', now())
on conflict (place_id) do update set
  name = excluded.name,
  lat = excluded.lat,
  lng = excluded.lng,
  category = excluded.category,
  seen_at = excluded.seen_at;

insert into public.wf_inventory (
  place_id, name, lat, lng, category, tags, google_types, primary_type,
  metro, signals, editorial, status, anchor, source, needs_review,
  last_verified_at, locked, seen_at, refreshed_at, secondary_categories
) values
  (
    'ChIJ9_6n_N7wwogR0_89wCluWV0',
    'Coachman Park',
    27.96560,
    -82.80233,
    'attractions',
    array[]::text[],
    array['park','point_of_interest','establishment']::text[],
    'park',
    'st-pete',
    '{}'::jsonb,
    'Coachman Park in downtown Clearwater. Not the splash pad.',
    'OPERATIONAL',
    false,
    'seasonal_event_identity_2026_10_19',
    false,
    now(),
    true,
    now(),
    now(),
    array[]::text[]
  ),
  (
    'ChIJiZrtZSvxwogRE9eu4Xpy9Yc',
    'Clearwater Marine Aquarium',
    27.97693,
    -82.81770,
    'attractions',
    array[]::text[],
    array['aquarium','tourist_attraction','point_of_interest','establishment']::text[],
    'aquarium',
    'st-pete',
    '{}'::jsonb,
    'Clearwater Marine Aquarium.',
    'OPERATIONAL',
    false,
    'seasonal_event_identity_2026_10_19',
    false,
    now(),
    true,
    now(),
    now(),
    array[]::text[]
  )
on conflict (place_id) do update set
  name = excluded.name,
  lat = excluded.lat,
  lng = excluded.lng,
  category = excluded.category,
  google_types = excluded.google_types,
  primary_type = excluded.primary_type,
  metro = excluded.metro,
  status = excluded.status,
  source = excluded.source,
  needs_review = false,
  last_verified_at = excluded.last_verified_at,
  locked = true,
  seen_at = excluded.seen_at,
  refreshed_at = excluded.refreshed_at
where wf_inventory.locked = false;

-- Scarecrow Fest. Organizer moved it to Saturday, October 31, 2026,
-- 10:00 AM to 5:00 PM ET (discovercrystalriverfl.com, read 2026-10-19).
-- place_id stays null. Heritage Village in Largo is the wrong city.
update public.wf_events
set start_date = '2026-10-31',
    end_date = '2026-10-31',
    start_time = '10:00:00',
    end_time = '17:00:00',
    event_status = 'scheduled',
    schedule_note = 'Saturday, October 31, 2026, 10:00 AM to 5:00 PM ET. Moved from October 10 because of weather.',
    last_verified_at = '2026-10-19T00:00:00Z'
where event_id = 'crystal-river-scarecrow-fest-2026'
  and place_id is null;

commit;
