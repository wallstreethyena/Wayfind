-- One-time, idempotent recovery for the missing Orlando guide place card.
-- Reuses the existing paid-for detail cache. Makes no provider requests.
-- Preserve the cache observation time: this is not a new data refresh.
-- No existing inventory row is changed. An expired or invalid cache writes nothing.
WITH cached AS (
  SELECT v, wrote_at
  FROM public.wf_places_cache
  WHERE k = 'pd1|ChIJyYEUav8P54gRatuv_zQzm20'
    AND v->>'id' = 'ChIJyYEUav8P54gRatuv_zQzm20'
    AND v->>'name' = 'Blue Spring State Park'
    AND v->>'businessStatus' = 'OPERATIONAL'
    AND wrote_at <= now()
    AND wrote_at > now() - interval '30 days'
    AND exp > now()
    AND exp <= wrote_at + interval '30 days'
    AND jsonb_typeof(v->'rating') = 'number'
    AND jsonb_typeof(v->'reviews') = 'number'
    AND (v->>'rating')::numeric BETWEEN 1 AND 5
    AND (v->>'reviews')::numeric >= 15
    AND abs((v->>'lat')::double precision - 28.9467012) < 0.001
    AND abs((v->>'lng')::double precision + 81.338922) < 0.001
    AND v->'types' @> '["state_park"]'::jsonb
    AND length(v->>'photoRef') > 10
    AND public.wf_bucket_metro((v->>'lat')::double precision, (v->>'lng')::double precision) = 'florida'
), inserted AS (
  INSERT INTO public.wf_inventory (
    place_id, name, lat, lng, category, tags, google_types, primary_type,
    metro, signals, photo_ref, status, anchor, source, needs_review,
    last_verified_at, refreshed_at
  )
  SELECT
    v->>'id', v->>'name', (v->>'lat')::double precision, (v->>'lng')::double precision,
    'attractions', ARRAY['outdoors'],
    ARRAY(SELECT jsonb_array_elements_text(v->'types')), 'state_park',
    public.wf_bucket_metro((v->>'lat')::double precision, (v->>'lng')::double precision),
    jsonb_build_object('rating', v->'rating', 'reviews', v->'reviews'),
    v->>'photoRef', v->>'businessStatus', false, 'google_cache_recovery', false,
    wrote_at, wrote_at
  FROM cached
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wf_inventory i
    WHERE lower(i.name) = 'blue spring state park'
       OR (abs(i.lat - 28.9467012) < 0.001 AND abs(i.lng + 81.338922) < 0.001)
  )
  ON CONFLICT (place_id) DO NOTHING
  RETURNING place_id, name, category, metro, last_verified_at, refreshed_at
)
SELECT * FROM inserted;
