-- Exact identity repair for the three Fall 2026 venues that reached wf_events
-- without a Google Place ID. The IDs, coordinates, rating and review evidence
-- were resolved through Wayfind's own place-detail flow on 2026-09-03.
--
-- This makes the places permanent index members and lets the existing
-- wf_place_ids trigger enqueue them for normal wf_inventory promotion. The
-- event update closes the stale-seed gap immediately. Safe to re-run.

begin;

insert into public.wf_place_ids
  (place_id, name, lat, lng, category, signals, seen_at)
values
  ('ChIJkyg5UW6654gRECAKyCherD8', 'Amber Brooke Farms', 28.8754542, -81.6394191, 'Activities',
    jsonb_build_object('rating', 4.7, 'reviews', 737), now()),
  ('ChIJ68SLYriZ54gRaJgw169KqYA', 'Great Scott Farms', 28.72853, -81.6682, 'Activities',
    jsonb_build_object('rating', 4.4, 'reviews', 213), now()),
  ('ChIJ-aI9NvSI54gRrVByB84z-AY', 'Southern Hill Farms', 28.4541904, -81.6783927, 'Activities',
    jsonb_build_object('rating', 4.7, 'reviews', 3201), now())
on conflict (place_id) do update set
  name = excluded.name,
  lat = excluded.lat,
  lng = excluded.lng,
  category = excluded.category,
  signals = excluded.signals,
  seen_at = excluded.seen_at;

update public.wf_events as event
set place_id = identity.place_id,
    updated_at = now()
from (values
  ('amber-brooke-fall-festival-2026', 'ChIJkyg5UW6654gRECAKyCherD8'),
  ('great-scott-fall-fest-2026', 'ChIJ68SLYriZ54gRaJgw169KqYA'),
  ('southern-hill-farms-fall-festival-2026', 'ChIJ-aI9NvSI54gRrVByB84z-AY'),
  ('clermont-harvest-festival-2026', 'ChIJQZ8lbY-O54gRJSKIfjA-Wr4')
) as identity(event_id, place_id)
where event.event_id = identity.event_id
  and event.place_id is distinct from identity.place_id;

-- The other six fall discoveries absent from wf_inventory are already indexed
-- and pending in wf_promotion_queue. Raise Showcase of Citrus from its old
-- priority-0 backfill slot; never overwrite attempts or ledger history.
update public.wf_promotion_queue
set priority = greatest(priority, 999999),
    reason = case when reason = 'backfill' then 'fall-owner-curation-2026-09-03' else reason end,
    next_attempt_at = least(next_attempt_at, now())
where place_id in (
  'ChIJ15lqd26D54gR0zik2zNTX4o',
  'ChIJhbni_xFn54gR0p89LazzSD8',
  'ChIJjapVvA9w54gRY4Tpi19HXhI',
  'ChIJmzKZ8InEwogR0PM7xTqUB6M',
  'ChIJQVp535WxwogR42W828PdPRw',
  'ChIJW5C20gaI54gRZuH_-8hPQy8'
);

commit;
