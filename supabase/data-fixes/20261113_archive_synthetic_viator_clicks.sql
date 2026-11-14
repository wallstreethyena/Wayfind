-- supabase/data-fixes/20261113_archive_synthetic_viator_clicks.sql
-- Reversible, transactional archive-then-delete for synthetic `1234P5` fixture rows
-- in `public.wf_viator_clicks` (Mission 4).
--
-- SAFETY INVARIANTS ENFORCED INSIDE ONE SERIALIZABLE TRANSACTION:
--   1. Writer is already stopped in code (`lib/productionWriteFirewall.js` + `lib/viatorAttribution.js`).
--   2. Exact predicate: `offer_id = '1234P5'` (the hardcoded guard fixture `d827-1234P5`,
--      which has zero overlap with any real Viator tour SKU).
--   3. Fails closed (`RAISE EXCEPTION`) if ANY matching `click_token` is referenced in
--      `public.wf_viator_bookings` or `public.wf_viator_booking_events`, OR if ANY
--      matching row carries a real customer `gclid` / `gbraid` / `wbraid` that isn't
--      a synthetic test string.
--   4. Copies exact full rows + archive metadata into `public.wf_viator_clicks_synthetic_archive`
--      (RLS enabled, service_role only), verifies `archived_count = candidate_count` AND
--      identical sorted `click_token` SHA-256 digest BEFORE deleting from `public.wf_viator_clicks`.
--
-- ROLLBACK:
--   INSERT INTO public.wf_viator_clicks SELECT <columns> FROM public.wf_viator_clicks_synthetic_archive
--   WHERE archive_batch = '20261113_1234P5_fixture_cleanup' ON CONFLICT (click_token) DO NOTHING;

BEGIN;

CREATE TABLE IF NOT EXISTS public.wf_viator_clicks_synthetic_archive (
  LIKE public.wf_viator_clicks INCLUDING DEFAULTS,
  archive_batch text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (click_token)
);

ALTER TABLE public.wf_viator_clicks_synthetic_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wf_viator_clicks_synthetic_archive FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wf_viator_clicks_synthetic_archive TO service_role;

DO $$
DECLARE
  v_batch constant text := '20261113_1234P5_fixture_cleanup';
  v_candidates integer;
  v_booking_refs integer := 0;
  v_event_refs integer := 0;
  v_ad_click_overlap integer := 0;
  v_src_hash text;
  v_arc_hash text;
  v_deleted integer;
BEGIN
  SELECT count(*)::int,
         encode(digest(coalesce(string_agg(click_token, E'\n' ORDER BY click_token), ''), 'sha256'), 'hex')
    INTO v_candidates, v_src_hash
    FROM public.wf_viator_clicks
   WHERE offer_id = '1234P5';

  IF v_candidates = 0 THEN
    RAISE NOTICE 'No synthetic 1234P5 rows present in wf_viator_clicks; nothing to archive.';
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_booking_refs
    FROM public.wf_viator_bookings b
    JOIN public.wf_viator_clicks c ON c.click_token = b.click_token
   WHERE c.offer_id = '1234P5';

  IF v_booking_refs > 0 THEN
    RAISE EXCEPTION 'ABORT: % synthetic click_tokens have wf_viator_bookings references', v_booking_refs;
  END IF;

  SELECT count(*)::int INTO v_event_refs
    FROM public.wf_viator_booking_events e
    JOIN public.wf_viator_clicks c ON c.click_token = e.click_token
   WHERE c.offer_id = '1234P5';

  IF v_event_refs > 0 THEN
    RAISE EXCEPTION 'ABORT: % synthetic click_tokens have wf_viator_booking_events references', v_event_refs;
  END IF;

  SELECT count(*)::int INTO v_ad_click_overlap
    FROM public.wf_viator_clicks
   WHERE offer_id = '1234P5'
     AND (gclid IS NOT NULL OR gbraid IS NOT NULL OR wbraid IS NOT NULL OR verified_google_campaign_id IS NOT NULL);

  IF v_ad_click_overlap > 0 THEN
    RAISE EXCEPTION 'ABORT: % candidate 1234P5 rows carry ad click IDs; manual inspection required', v_ad_click_overlap;
  END IF;

  INSERT INTO public.wf_viator_clicks_synthetic_archive
  SELECT c.*, v_batch AS archive_batch, now() AS archived_at
    FROM public.wf_viator_clicks c
   WHERE c.offer_id = '1234P5'
  ON CONFLICT (click_token) DO NOTHING;

  SELECT encode(digest(coalesce(string_agg(click_token, E'\n' ORDER BY click_token), ''), 'sha256'), 'hex')
    INTO v_arc_hash
    FROM public.wf_viator_clicks_synthetic_archive
   WHERE archive_batch = v_batch
     AND click_token IN (SELECT click_token FROM public.wf_viator_clicks WHERE offer_id = '1234P5');

  IF v_src_hash IS DISTINCT FROM v_arc_hash THEN
    RAISE EXCEPTION 'ABORT: archive SHA-256 mismatch (src=%, archive=%)', v_src_hash, v_arc_hash;
  END IF;

  DELETE FROM public.wf_viator_clicks
   WHERE offer_id = '1234P5';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_candidates THEN
    RAISE EXCEPTION 'ABORT: deleted count (%) != candidate count (%)', v_deleted, v_candidates;
  END IF;

  RAISE NOTICE 'Archived and removed % synthetic 1234P5 rows (sha256=%).', v_deleted, v_src_hash;
END $$;

COMMIT;
