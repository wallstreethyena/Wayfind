-- Revert the five intake rows only while they still hold their original observation.
-- A later verification or enrichment makes the row ineligible for this rollback.
delete from public.wf_inventory
where place_id in (
  'wfadd_srq_sarasota_bradenton_airport', 'wfadd_tpa_tampa_international_airport',
  'wfadd_siesta_key_area', 'wfadd_misohappy_key_west', 'wfadd_sushi_song_key_west'
)
and source = 'owner_verified_official_source'
and signals->>'intake_batch' = 'owned_search_20261128'
and refreshed_at = '2026-11-28T00:00:00Z'::timestamptz
and last_verified_at = '2026-11-28T00:00:00Z'::timestamptz
and not (signals ? 'rating' or signals ? 'reviews')
and not coalesce(locked, false);
