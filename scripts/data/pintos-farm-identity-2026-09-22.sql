-- Exact Pinto's Farm identity for the 2026 Wayfind guide and existing fall event.
-- 2026-09-22 correction: the original coordinate (25.559785, -80.41664) pointed
-- at a different property about a mile away. Apple Maps' Pinto's Farm place and
-- the 14890 SW 216th St address both resolve to 25.564627, -80.432786, and
-- satellite imagery there shows the farm, its pond and the Brewhouse. Applied to
-- wf_place_ids, wf_inventory and wf_events in production the same day.
-- Google place identity, coordinates, rating and review count were checked
-- 2026-09-22. The owned inventory row is complete enough to render the normal
-- place card without spending a Google promotion lookup. Safe to re-run.
begin;

insert into public.wf_place_ids
  (place_id, name, lat, lng, category, signals, seen_at)
values
  ('ChIJUczTK5XC2YgRRt4Jp6N3B70', 'Pinto''s Farm', 25.564627, -80.432786, 'Activities',
   jsonb_build_object('rating', 4.4, 'reviews', 2068), now())
on conflict (place_id) do update set
  name = excluded.name,
  lat = excluded.lat,
  lng = excluded.lng,
  category = excluded.category,
  signals = excluded.signals,
  seen_at = excluded.seen_at;

insert into public.wf_inventory (
  place_id, name, lat, lng, category, tags, google_types, primary_type,
  metro, signals, editorial, status, anchor, source, needs_review,
  last_verified_at, locked, seen_at, refreshed_at, secondary_categories
) values (
  'ChIJUczTK5XC2YgRRt4Jp6N3B70',
  'Pinto''s Farm',
  25.564627,
  -80.432786,
  'attractions',
  array[]::text[],
  array['farm','event_venue','tourist_attraction','point_of_interest','establishment']::text[],
  'farm',
  'miami-dade',
  jsonb_build_object('rating', 4.4, 'reviews', 2068),
  'Family farm in Miami''s Redland area with animals, pony rides, tractor and boat rides, seasonal farm events, and a Brewhouse.',
  'OPERATIONAL',
  false,
  'owner_request_google_maps_verified',
  false,
  now(),
  false,
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
  signals = excluded.signals,
  editorial = excluded.editorial,
  status = excluded.status,
  source = excluded.source,
  needs_review = false,
  last_verified_at = excluded.last_verified_at,
  seen_at = excluded.seen_at,
  refreshed_at = excluded.refreshed_at;

update public.wf_events
set place_id = 'ChIJUczTK5XC2YgRRt4Jp6N3B70',
    updated_at = now()
where event_id = 'pintos-fall-at-the-farm-2026'
  and place_id is distinct from 'ChIJUczTK5XC2YgRRt4Jp6N3B70';

update public.wf_events
set lat = 25.564627,
    lng = -80.432786,
    updated_at = now()
where event_id = 'pintos-fall-at-the-farm-2026'
  and (lat, lng) is distinct from (25.564627::double precision, -80.432786::double precision);

-- wf_place_ids normally enqueues promotion. Because this row was manually
-- verified and inserted into owned inventory above, close the ledger entry
-- instead of spending a Google lookup on data Wayfind already has.
update public.wf_promotion_queue
set status = 'done',
    promoted_at = coalesce(promoted_at, now()),
    last_error = null,
    reject_reason = null,
    claimed_at = null
where place_id = 'ChIJUczTK5XC2YgRRt4Jp6N3B70'
  and status <> 'done';

commit;
