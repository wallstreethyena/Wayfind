-- Owner-supplied Disney snack intake, 2026-11-17.
-- Four permanent venues were absent; Cookie Bar and Animal Kingdom already exist.
-- Identity: exact Google Maps listings reopened by query_place_id with query=0,0.
-- No ratings, photos, hours, prices, independent coordinates, or event dates seeded.
-- Google coordinates keep the existing refreshed_at retention/refresh clock.
-- Receipt: docs/curation/disney-snack-reels-2026-11-17.md.
-- Insert-only and replay-safe; never overwrites or unexcludes an existing record.
DO $intake$
DECLARE
  checked_at timestamptz := now();
BEGIN
  INSERT INTO public.wf_inventory (
    place_id, name, lat, lng, category, tags, google_types, primary_type,
    metro, locality, source, needs_review, status, excluded,
    editorial, signals, last_verified_at, refreshed_at, seen_at
  )
  SELECT
    v.place_id, v.name, v.lat, v.lng, 'food', ARRAY['inside_theme_park'],
    ARRAY[v.primary_type, 'food', 'point_of_interest', 'establishment'], v.primary_type,
    'orlando', 'Lake Buena Vista', 'owner_verified_google_maps', false, 'OPERATIONAL', false,
    v.editorial,
    jsonb_build_object(
      'coordinate_source', 'google_maps',
      'google_checked_at', checked_at,
      'identity_method', 'google_maps_place_id_reopened_with_unrelated_fallback',
      'parent_venue', v.parent_venue,
      'admission_required', true,
      'website', v.website
    ),
    checked_at, checked_at, checked_at
  FROM (VALUES
    ('ChIJf_IRFQF_3YgRUPFD9siNgNQ', 'Epic Eats', 28.3565864::double precision, -81.5589124::double precision,
      'dessert_restaurant', 'Disney''s Hollywood Studios',
      'Dessert stop in Echo Lake inside Disney''s Hollywood Studios. Park admission is required; Jollywood Nights offerings require a separate event ticket.',
      'https://disneyworld.disney.go.com/dining/hollywood-studios/epic-eats/'),
    ('ChIJ-xEZigN_3YgR2hvSuNZAtMo', 'Terra Treats', 28.3580125::double precision, -81.5915609::double precision,
      'restaurant', 'Disney''s Animal Kingdom Theme Park',
      'Snack counter on Discovery Island inside Disney''s Animal Kingdom. Park admission is required. Check the current menu for seasonal sweets.',
      'https://disneyworld.disney.go.com/dining/animal-kingdom/terra-treats/'),
    ('ChIJhUcstKV_3YgRbdpKlF8OIa8', 'San Angel Inn Restaurante', 28.3717712::double precision, -81.5468074::double precision,
      'mexican_restaurant', 'EPCOT',
      'Mexican restaurant inside EPCOT''s Mexico Pavilion. Park admission is required; check the current menu and dining arrangements before visiting.',
      'https://disneyworld.disney.go.com/dining/epcot/san-angel-inn-restaurante/'),
    ('ChIJBVIDXZ-A54gRbNhylAVgWYo', 'Main Street Confectionery', 28.4171015::double precision, -81.581072::double precision,
      'candy_store', 'Magic Kingdom Park',
      'Sweet shop on Main Street, U.S.A. inside Magic Kingdom. Park admission is required. Seasonal popcorn selections can change.',
      'https://disneyworld.disney.go.com/shops/magic-kingdom/main-street-confectionery/')
  ) AS v(place_id, name, lat, lng, primary_type, parent_venue, editorial, website)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wf_inventory existing
    WHERE lower(existing.name) = lower(v.name)
      AND existing.place_id <> v.place_id
      AND abs(existing.lat - v.lat) < 0.003
      AND abs(existing.lng - v.lng) < 0.003
  )
  ON CONFLICT (place_id) DO NOTHING;

  -- Refuse an identity collision instead of silently publishing mismatched media.
  IF (
    SELECT count(*) FROM public.wf_inventory i
    JOIN (VALUES
      ('ChIJf_IRFQF_3YgRUPFD9siNgNQ', 'Epic Eats', 28.3565864, -81.5589124),
      ('ChIJ-xEZigN_3YgR2hvSuNZAtMo', 'Terra Treats', 28.3580125, -81.5915609),
      ('ChIJhUcstKV_3YgRbdpKlF8OIa8', 'San Angel Inn Restaurante', 28.3717712, -81.5468074),
      ('ChIJBVIDXZ-A54gRbNhylAVgWYo', 'Main Street Confectionery', 28.4171015, -81.581072)
    ) AS expected(place_id, name, lat, lng) ON expected.place_id = i.place_id
    WHERE i.name = expected.name
      AND i.status = 'OPERATIONAL' AND i.excluded IS NOT TRUE
      AND abs(i.lat - expected.lat) < 0.001 AND abs(i.lng - expected.lng) < 0.001
  ) <> 4 THEN
    RAISE EXCEPTION 'Disney snack intake identity collision or excluded venue; no changes committed';
  END IF;
END
$intake$;
