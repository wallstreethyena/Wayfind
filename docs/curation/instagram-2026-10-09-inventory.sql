-- Owner-approved 2026-10-09 (chat: "Yes, add all 4"): add the four venues from
-- the 2026-10-09 Instagram intake that were not yet in wf_inventory, so their
-- creator reels have a place card to open. Insert-only; never overwrites.
--
-- Evidence per row: name, address, open status, rating and review count read
-- from each venue's own Google Maps listing in the browser (free, no Places
-- API call); coordinates from the US Census geocoder exact address match.
-- category/primary_type/google_types are Wayfind's classification from the
-- Maps category label and what the reel shows.

insert into wf_inventory
  (place_id, name, lat, lng, category, tags, google_types, primary_type, metro,
   signals, status, source, needs_review, locked, excluded, cuisines,
   secondary_categories, last_verified_at, seen_at)
values
  ('ChIJzzp4zxPDwogRuP2urL4IRTc', 'Roosters Cigars and Coffee', 27.967489, -82.48274,
   'food', array['breakfast'], array['cafe','coffee_shop','tobacco_shop'], 'cafe', 'tampa',
   '{"rating":4.9,"reviews":122}'::jsonb, 'OPERATIONAL', 'creator_curation', false, false, false, null,
   array[]::text[], now(), now()),
  ('ChIJGSNNSQDDwogRlqbKZkvMt8o', 'Giancarlo''s', 27.946749, -82.475631,
   'food', array[]::text[], array['italian_restaurant','restaurant','bar'], 'italian_restaurant', 'tampa',
   '{"rating":4.4,"reviews":257}'::jsonb, 'OPERATIONAL', 'creator_curation', false, false, false, array['italian'],
   array['nightlife'], now(), now()),
  ('ChIJZx685RbDwogRMUoUeorzjiw', 'V Modern Italian', 27.945936, -82.47687,
   'food', array[]::text[], array['italian_restaurant','restaurant'], 'italian_restaurant', 'tampa',
   '{"rating":5.0,"reviews":65}'::jsonb, 'OPERATIONAL', 'creator_curation', false, false, false, array['italian'],
   array[]::text[], now(), now()),
  ('ChIJrZohIJMK6IkRjDYtfS6WREg', 'Wells Hollow Creamery', 41.275028, -73.113509,
   'attractions', array['dessert'], array['ice_cream_shop','farm','tourist_attraction'], 'ice_cream_shop', 'shelton-ct',
   '{"rating":4.6,"reviews":720}'::jsonb, 'OPERATIONAL', 'creator_curation', false, false, false, null,
   array['food'], now(), now())
on conflict (place_id) do nothing;

-- REVERSE (removes exactly these four rows, only if still untouched by this source):
-- delete from wf_inventory
--  where source = 'creator_curation'
--    and place_id in ('ChIJzzp4zxPDwogRuP2urL4IRTc','ChIJGSNNSQDDwogRlqbKZkvMt8o',
--                     'ChIJZx685RbDwogRMUoUeorzjiw','ChIJrZohIJMK6IkRjDYtfS6WREg');
