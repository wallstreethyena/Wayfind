-- Exact Pinto's Farm identity for the 2026 Wayfind guide and existing fall event.
-- Google place identity, coordinates, rating and review count were checked
-- 2026-09-22. Safe to re-run.
begin;

insert into public.wf_place_ids
  (place_id, name, lat, lng, category, signals, seen_at)
values
  ('ChIJUczTK5XC2YgRRt4Jp6N3B70', 'Pinto''s Farm', 25.559785, -80.41664, 'Activities',
   jsonb_build_object('rating', 4.4, 'reviews', 2068), now())
on conflict (place_id) do update set
  name = excluded.name,
  lat = excluded.lat,
  lng = excluded.lng,
  category = excluded.category,
  signals = excluded.signals,
  seen_at = excluded.seen_at;

update public.wf_events
set place_id = 'ChIJUczTK5XC2YgRRt4Jp6N3B70',
    updated_at = now()
where event_id = 'pintos-fall-at-the-farm-2026'
  and place_id is distinct from 'ChIJUczTK5XC2YgRRt4Jp6N3B70';

commit;
