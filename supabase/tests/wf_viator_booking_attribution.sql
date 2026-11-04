-- supabase/tests/wf_viator_booking_attribution.sql
-- Verifies wf_viator_clicks, wf_viator_acquire_sync_lease, wf_viator_reconcile,
-- wf_viator_booking_events, wf_viator_bookings, wf_google_conversion_uploads,
-- wf_google_begin_upload, wf_google_finalize_upload,
-- wf_viator_verify_campaign_attribution, wf_viator_financial_summary,
-- wf_viator_redact_expired_clicks, and non-privileged role access controls.

do $$
declare
  v_lease_1 jsonb;
  v_lease_contended jsonb;
  v_lease_2 jsonb;
  v_res jsonb;
  v_stale_res jsonb;
  v_begin jsonb;
  v_fin jsonb;
  v_ver jsonb;
  v_b public.wf_viator_bookings%rowtype;
  v_u public.wf_google_conversion_uploads%rowtype;
  v_c public.wf_viator_clicks%rowtype;
  v_cnt integer;
  v_redacted integer;
begin
  -- 0. Verify sync lease acquisition and contention protection
  v_lease_1 := public.wf_viator_acquire_sync_lease(
    'worker-alpha',
    '2026-11-03T15:00:00Z'::timestamptz,
    180
  );
  if (v_lease_1->>'acquired')::boolean is not true or (v_lease_1->>'sync_epoch')::bigint <> 1 then
    raise exception 'expected worker-alpha to acquire sync_epoch 1, got %', v_lease_1;
  end if;

  -- Overlapping worker within TTL must be rejected cleanly
  v_lease_contended := public.wf_viator_acquire_sync_lease(
    'worker-beta',
    '2026-11-03T15:01:00Z'::timestamptz,
    180
  );
  if (v_lease_contended->>'acquired')::boolean is not false
     or (v_lease_contended->>'reason') <> 'lease_held_by_active_worker' then
    raise exception 'expected overlapping worker-beta to be blocked, got %', v_lease_contended;
  end if;

  -- Seed 3 clicks:
  -- 1) Eligible Google Ads click with unverified URL-observed utm_campaign=24380159401
  --    (verified_google_campaign_id is NULL until verified by Google Ads reporting)
  insert into public.wf_viator_clicks (
    click_token, client_click_id, visitor_context_hash, provider, offer_id, page_key, surface, content_id,
    placement_campaign, attributed_campaign,
    gclid, observed_utm_campaign, verified_google_campaign_id,
    campaign_metadata_provenance, campaign_verification_status, google_campaign_id,
    consent_ad_user_data, consent_ad_personalization,
    session_attribution, first_touch_attribution,
    clicked_at, expires_at, redact_after
  ) values (
    'wfv_11111111111111111111111111111111',
    'wf-click-paid-1',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'viator',
    '123164P1',
    'g-things-to-do-orlando-not-theme-parks',
    'guide_pick',
    'things-to-do-orlando-not-theme-parks:rock-springs-run-kayak',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-11111111111111111111111111111111',
    'EAIaIQobChMI_test_rock_springs_1',
    '24380159401',
    null,
    'url_utm_unverified',
    'unverified',
    '24380159401',
    'GRANTED',
    'GRANTED',
    '{"gclid":"EAIaIQobChMI_test_rock_springs_1"}'::jsonb,
    '{"gclid":"EAIaIQobChMI_test_rock_springs_1"}'::jsonb,
    '2026-11-03T14:00:00Z'::timestamptz,
    '2026-12-03T14:00:00Z'::timestamptz,
    '2027-02-01T14:00:00Z'::timestamptz
  );

  -- 2) Expired click (clicked 45 days before booking)
  insert into public.wf_viator_clicks (
    click_token, client_click_id, visitor_context_hash, provider, offer_id, page_key, surface, content_id,
    placement_campaign, attributed_campaign,
    gclid, observed_utm_campaign, verified_google_campaign_id,
    campaign_metadata_provenance, campaign_verification_status, google_campaign_id,
    consent_ad_user_data, consent_ad_personalization,
    session_attribution, first_touch_attribution,
    clicked_at, expires_at, redact_after
  ) values (
    'wfv_22222222222222222222222222222222',
    'wf-click-expired-2',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'viator',
    '123164P1',
    'g-things-to-do-orlando-not-theme-parks',
    'guide_pick',
    'things-to-do-orlando-not-theme-parks:rock-springs-run-kayak',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-22222222222222222222222222222222',
    'EAIaIQobChMI_expired_click_2',
    '24380159401',
    null,
    'url_utm_unverified',
    'unverified',
    '24380159401',
    'GRANTED',
    'GRANTED',
    '{"gclid":"EAIaIQobChMI_expired_click_2"}'::jsonb,
    '{"gclid":"EAIaIQobChMI_expired_click_2"}'::jsonb,
    '2026-09-01T14:00:00Z'::timestamptz,
    '2026-10-01T14:00:00Z'::timestamptz,
    '2026-11-01T14:00:00Z'::timestamptz
  );

  -- 3) Click with DENIED consent
  insert into public.wf_viator_clicks (
    click_token, client_click_id, visitor_context_hash, provider, offer_id, page_key, surface, content_id,
    placement_campaign, attributed_campaign,
    gclid, observed_utm_campaign, verified_google_campaign_id,
    campaign_metadata_provenance, campaign_verification_status, google_campaign_id,
    consent_ad_user_data, consent_ad_personalization,
    clicked_at, expires_at, redact_after
  ) values (
    'wfv_33333333333333333333333333333333',
    'wf-click-denied-3',
    'cccccccccccccccccccccccccccccccc',
    'viator',
    '123164P1',
    'g-things-to-do-orlando-not-theme-parks',
    'guide_pick',
    'things-to-do-orlando-not-theme-parks:rock-springs-run-kayak',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-33333333333333333333333333333333',
    'EAIaIQobChMI_denied_click_3',
    '24380159401',
    null,
    'url_utm_unverified',
    'unverified',
    '24380159401',
    'DENIED',
    'DENIED',
    '2026-11-03T14:05:00Z'::timestamptz,
    '2026-12-03T14:05:00Z'::timestamptz,
    '2027-02-01T14:05:00Z'::timestamptz
  );

  -- Reconcile batch 1 (under sync_epoch = 1):
  -- - BR-1001: CONFIRMATION matching wfv_1111... ($238.00 gross, $19.04 estimated, $19.04 confirmed)
  -- - BR-1002: CONFIRMATION placement-only tag (no token -> unmatched_no_token)
  -- - BR-1003: CONFIRMATION unknown token (wfv_9999... -> unmatched_unknown_token)
  -- - BR-1004: CONFIRMATION expired token (wfv_2222... -> unmatched_expired)
  -- - BR-1005: CONFIRMATION denied consent token (wfv_3333... -> matched, ineligible_missing_consent)
  -- - BR-1006: Unfamiliar raw eventType CHARGEBACK_HOLD (-> status='unrecognized', needs_investigation=true, no upload)
  v_res := public.wf_viator_reconcile(
    jsonb_build_array(
      jsonb_build_object(
        'event_key', 'BR-1001|CONFIRMATION|2026-11-03T15:00:00.000Z|238.00|19.04|19.04|na',
        'booking_ref', 'BR-1001',
        'raw_event_type', 'CONFIRMATION',
        'event_type', 'CONFIRMED',
        'status', 'confirmed',
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-11111111111111111111111111111111',
        'click_token', 'wfv_11111111111111111111111111111111',
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 238.00,
        'estimated_commission', 19.04,
        'confirmed_commission', 19.04,
        'paid_commission', null,
        'currency', 'USD',
        'original_booking_at', '2026-11-03T15:00:00Z',
        'transaction_at', '2026-11-03T15:00:00Z',
        'provider_modified_at', '2026-11-03T15:00:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1002|CONFIRMATION|2026-11-03T15:10:00.000Z|119.00|9.52|na|na',
        'booking_ref', 'BR-1002',
        'raw_event_type', 'CONFIRMATION',
        'event_type', 'CONFIRMED',
        'status', 'confirmed',
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'click_token', null,
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 119.00,
        'estimated_commission', 9.52,
        'confirmed_commission', null,
        'paid_commission', null,
        'currency', 'USD',
        'original_booking_at', '2026-11-03T15:10:00Z',
        'transaction_at', '2026-11-03T15:10:00Z',
        'provider_modified_at', '2026-11-03T15:10:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1003|CONFIRMATION|2026-11-03T15:15:00.000Z|119.00|9.52|na|na',
        'booking_ref', 'BR-1003',
        'raw_event_type', 'CONFIRMATION',
        'event_type', 'CONFIRMED',
        'status', 'confirmed',
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-99999999999999999999999999999999',
        'click_token', 'wfv_99999999999999999999999999999999',
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 119.00,
        'estimated_commission', 9.52,
        'confirmed_commission', null,
        'paid_commission', null,
        'currency', 'USD',
        'original_booking_at', '2026-11-03T15:15:00Z',
        'transaction_at', '2026-11-03T15:15:00Z',
        'provider_modified_at', '2026-11-03T15:15:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1004|CONFIRMATION|2026-11-03T15:20:00.000Z|119.00|9.52|na|na',
        'booking_ref', 'BR-1004',
        'raw_event_type', 'CONFIRMATION',
        'event_type', 'CONFIRMED',
        'status', 'confirmed',
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-22222222222222222222222222222222',
        'click_token', 'wfv_22222222222222222222222222222222',
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 119.00,
        'estimated_commission', 9.52,
        'confirmed_commission', null,
        'paid_commission', null,
        'currency', 'USD',
        'original_booking_at', '2026-11-03T15:20:00Z',
        'transaction_at', '2026-11-03T15:20:00Z',
        'provider_modified_at', '2026-11-03T15:20:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1005|CONFIRMATION|2026-11-03T15:25:00.000Z|119.00|9.52|9.52|na',
        'booking_ref', 'BR-1005',
        'raw_event_type', 'CONFIRMATION',
        'event_type', 'CONFIRMED',
        'status', 'confirmed',
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-33333333333333333333333333333333',
        'click_token', 'wfv_33333333333333333333333333333333',
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 119.00,
        'estimated_commission', 9.52,
        'confirmed_commission', 9.52,
        'paid_commission', null,
        'currency', 'USD',
        'original_booking_at', '2026-11-03T15:25:00Z',
        'transaction_at', '2026-11-03T15:25:00Z',
        'provider_modified_at', '2026-11-03T15:25:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1006|CHARGEBACK_HOLD|2026-11-03T15:28:00.000Z|119.00|na|na|na',
        'booking_ref', 'BR-1006',
        'raw_event_type', 'CHARGEBACK_HOLD',
        'event_type', 'UNRECOGNIZED',
        'status', 'unrecognized',
        'needs_investigation', true,
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-11111111111111111111111111111111',
        'click_token', 'wfv_11111111111111111111111111111111',
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 119.00,
        'estimated_commission', null,
        'confirmed_commission', null,
        'paid_commission', null,
        'currency', 'USD',
        'original_booking_at', '2026-11-03T15:28:00Z',
        'transaction_at', '2026-11-03T15:28:00Z',
        'provider_modified_at', '2026-11-03T15:28:00Z'
      )
    ),
    'cursor_page_1',
    '2026-11-03T15:28:00Z'::timestamptz,
    '2026-11-03T15:30:00Z'::timestamptz,
    1,
    'worker-alpha'
  );

  if (v_res->>'ok')::boolean is not true then
    raise exception 'batch 1 reconcile failed: %', v_res;
  end if;
  if (v_res->>'matched')::int <> 3 or (v_res->>'unmatched_no_token')::int <> 1
     or (v_res->>'unmatched_unknown_token')::int <> 1 or (v_res->>'unmatched_expired')::int <> 1
     or (v_res->>'unrecognized_events')::int <> 1 then
    raise exception 'unexpected batch 1 counts: %', v_res;
  end if;

  -- Verify BR-1001 matched state, trust boundary (observed_utm_campaign='24380159401', verified_google_campaign_id IS NULL), and financial separation
  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1001';
  if v_b.attribution_status <> 'matched'
     or v_b.observed_utm_campaign <> '24380159401'
     or v_b.verified_google_campaign_id is not null
     or v_b.campaign_metadata_provenance <> 'url_utm_unverified'
     or v_b.campaign_verification_status <> 'unverified'
     or v_b.gross_booking_value <> 238.00 or v_b.confirmed_commission <> 19.04
     or v_b.paid_commission is not null then
    raise exception 'BR-1001 state mismatch: %', row_to_json(v_b);
  end if;

  -- Verify BR-1006 unrecognized event was preserved for investigation and NOT queued for Google upload
  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1006';
  if v_b.status <> 'unrecognized' or v_b.needs_investigation is not true then
    raise exception 'BR-1006 expected status=unrecognized and needs_investigation=true, got %', row_to_json(v_b);
  end if;
  select count(*) into v_cnt from public.wf_google_conversion_uploads where booking_ref = 'BR-1006';
  if v_cnt <> 0 then
    raise exception 'BR-1006 unrecognized booking must not create a Google conversion upload row';
  end if;

  -- Verify BR-1005 is ineligible_missing_consent in upload ledger
  select * into v_u from public.wf_google_conversion_uploads where booking_ref = 'BR-1005';
  if v_u.upload_status <> 'ineligible_missing_consent' then
    raise exception 'BR-1005 expected ineligible_missing_consent, got %', v_u.upload_status;
  end if;

  -- Reconcile batch 2:
  -- 1) Replay identical BR-1001 CONFIRMATION event (idempotency: 0 new events inserted)
  -- 2) Amend BR-1001 to 3 guests ($357.00 gross, $28.56 confirmed commission)
  v_res := public.wf_viator_reconcile(
    jsonb_build_array(
      jsonb_build_object(
        'event_key', 'BR-1001|CONFIRMATION|2026-11-03T15:00:00.000Z|238.00|19.04|19.04|na',
        'booking_ref', 'BR-1001',
        'raw_event_type', 'CONFIRMATION',
        'event_type', 'CONFIRMED',
        'status', 'confirmed',
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-11111111111111111111111111111111',
        'click_token', 'wfv_11111111111111111111111111111111',
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 238.00,
        'estimated_commission', 19.04,
        'confirmed_commission', 19.04,
        'paid_commission', null,
        'currency', 'USD',
        'original_booking_at', '2026-11-03T15:00:00Z',
        'transaction_at', '2026-11-03T15:00:00Z',
        'provider_modified_at', '2026-11-03T15:00:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1001|AMENDMENT|2026-11-03T16:00:00.000Z|357.00|28.56|28.56|na',
        'booking_ref', 'BR-1001',
        'raw_event_type', 'AMENDMENT',
        'event_type', 'AMENDED',
        'status', 'amended',
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-11111111111111111111111111111111',
        'click_token', 'wfv_11111111111111111111111111111111',
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 357.00,
        'estimated_commission', 28.56,
        'confirmed_commission', 28.56,
        'paid_commission', null,
        'currency', 'USD',
        'original_booking_at', '2026-11-03T15:00:00Z',
        'transaction_at', '2026-11-03T15:00:00Z',
        'provider_modified_at', '2026-11-03T16:00:00Z'
      )
    ),
    'cursor_page_2',
    '2026-11-03T16:00:00Z'::timestamptz,
    '2026-11-03T16:05:00Z'::timestamptz,
    1,
    'worker-alpha'
  );

  if (v_res->>'events_inserted')::int <> 1 then
    raise exception 'expected only 1 new event inserted on replay + amendment, got %', v_res;
  end if;

  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1001';
  if v_b.status <> 'amended' or v_b.amendment_count <> 1 or v_b.confirmed_commission <> 28.56 then
    raise exception 'BR-1001 amendment state mismatch: %', row_to_json(v_b);
  end if;

  -- Ensure amendment before upload did NOT create a second initial_booking upload row
  select count(*) into v_cnt from public.wf_google_conversion_uploads where booking_ref = 'BR-1001';
  if v_cnt <> 1 then
    raise exception 'expected 1 upload row for BR-1001 after amendment, got %', v_cnt;
  end if;
  select * into v_u from public.wf_google_conversion_uploads where booking_ref = 'BR-1001';
  if v_u.conversion_value <> 28.56 then
    raise exception 'expected amended upload conversion_value 28.56, got %', v_u.conversion_value;
  end if;

  -- Test in-flight upload racing with a late CUSTOMER_CANCELLATION arriving 40 days
  -- after the click (past the 30-day click expiry window) and omitting campaign_value:
  -- 1) Begin upload for BR-1001 (`in_flight`)
  v_begin := public.wf_google_begin_upload(v_u.id, '2026-11-03T16:10:00Z'::timestamptz);
  if (v_begin->>'ok')::boolean is not true or (v_begin->>'upload_status') <> 'in_flight' then
    raise exception 'expected wf_google_begin_upload to transition BR-1001 to in_flight, got %', v_begin;
  end if;

  -- 2) While BR-1001 is `in_flight`, a CUSTOMER_CANCELLATION arrives on 2026-12-15
  --    (after click.expires_at = 2026-12-03, and with campaign_value = NULL).
  --    The booking MUST preserve attribution_status = 'matched' and queue a
  --    cancellation_restatement!
  v_res := public.wf_viator_reconcile(
    jsonb_build_array(
      jsonb_build_object(
        'event_key', 'BR-1001|CUSTOMER_CANCELLATION|2026-12-15T17:00:00.000Z|na|0.00|0.00|na',
        'booking_ref', 'BR-1001',
        'raw_event_type', 'CUSTOMER_CANCELLATION',
        'event_type', 'CANCELLED',
        'status', 'cancelled',
        'cancellation_actor', 'customer',
        'product_code', null,
        'campaign_value', null,
        'click_token', null,
        'placement_campaign', null,
        'gross_booking_value', null,
        'estimated_commission', 0.00,
        'confirmed_commission', 0.00,
        'paid_commission', null,
        'currency', 'USD',
        'currency_explicit', false,
        'original_booking_at', '2026-12-15T17:00:00Z',
        'transaction_at', '2026-12-15T17:00:00Z',
        'provider_modified_at', '2026-12-15T17:00:00Z',
        'cancellation_at', '2026-12-15T17:00:00Z'
      )
    ),
    'cursor_page_3',
    '2026-12-15T17:00:00Z'::timestamptz,
    '2026-12-15T17:05:00Z'::timestamptz,
    1,
    'worker-alpha'
  );

  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1001';
  if v_b.status <> 'cancelled'
     or v_b.cancellation_actor <> 'customer'
     or v_b.attribution_status <> 'matched'
     or v_b.gross_booking_value <> 357.00
     or v_b.confirmed_commission <> 0.00
     or v_b.estimated_commission <> 0.00 then
    raise exception 'BR-1001 post-expiry partial cancellation state mismatch: %', row_to_json(v_b);
  end if;

  -- 3) Now the delayed initial upload HTTP call finishes and calls wf_google_finalize_upload.
  --    It must NOT overwrite the cancelled booking state and must keep cancellation_restatement queued!
  v_fin := public.wf_google_finalize_upload(
    v_u.id,
    'submitted',
    false,
    'dm_req_1',
    200,
    28.56,
    'confirmed_commission',
    'none',
    false,
    '{"events":[{"transactionId":"BR-1001","adIdentifiers":{"gclid":"EAIaIQobChMI_test_rock_springs_1"}}]}'::jsonb,
    '{"requestId":"dm_req_1"}'::jsonb,
    null,
    '2026-12-15T17:06:00Z'::timestamptz
  );
  if (v_fin->>'ok')::boolean is not true or (v_fin->>'queued_correction') <> 'cancellation_restatement' then
    raise exception 'expected wf_google_finalize_upload to detect concurrent cancellation and queue cancellation_restatement, got %', v_fin;
  end if;

  select * into v_u
    from public.wf_google_conversion_uploads
    where booking_ref = 'BR-1001' and upload_kind = 'cancellation_restatement';
  if not found or v_u.upload_status <> 'awaiting_upload' or v_u.conversion_value <> 0.00 or v_u.retraction_required is not true then
    raise exception 'expected cancellation_restatement row awaiting_upload with 0.00 and retraction_required=true, got %', row_to_json(v_u);
  end if;

  -- Verify stale worker epoch protection: after lease expires, worker-gamma acquires epoch 2,
  -- and a delayed reconcile call from worker-alpha with p_expected_epoch = 1 is rejected!
  v_lease_2 := public.wf_viator_acquire_sync_lease(
    'worker-gamma',
    '2026-12-15T18:00:00Z'::timestamptz,
    180
  );
  if (v_lease_2->>'acquired')::boolean is not true or (v_lease_2->>'sync_epoch')::bigint <> 2 then
    raise exception 'expected worker-gamma to acquire sync_epoch 2, got %', v_lease_2;
  end if;

  v_stale_res := public.wf_viator_reconcile(
    '[]'::jsonb,
    'stale_cursor_page_0',
    '2026-11-01T00:00:00Z'::timestamptz,
    '2026-12-15T18:01:00Z'::timestamptz,
    1,
    'worker-alpha'
  );
  if (v_stale_res->>'ok')::boolean is not false or (v_stale_res->>'reason') <> 'stale_sync_epoch' then
    raise exception 'expected stale worker epoch 1 to be rejected, got %', v_stale_res;
  end if;

  -- Verify authoritative Google Ads campaign verification RPC
  v_ver := public.wf_viator_verify_campaign_attribution(
    'BR-1001',
    '24380159401',
    true,
    '2026-12-15T18:05:00Z'::timestamptz
  );
  if (v_ver->>'ok')::boolean is not true or (v_ver->>'campaign_verification_status') <> 'verified' then
    raise exception 'expected campaign verification to succeed, got %', v_ver;
  end if;

  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1001';
  if v_b.verified_google_campaign_id <> '24380159401' or v_b.campaign_verification_status <> 'verified' then
    raise exception 'expected BR-1001 verified_google_campaign_id=24380159401, got %', row_to_json(v_b);
  end if;

  -- Verify 90-day redaction function clears raw identifiers & JSONB snapshots across all 3 tables
  v_redacted := public.wf_viator_redact_expired_clicks('2027-02-02T00:00:00Z'::timestamptz);
  if v_redacted <> 3 then
    raise exception 'expected all 3 clicks redacted by 2027-02-02, got %', v_redacted;
  end if;

  select * into v_c from public.wf_viator_clicks where click_token = 'wfv_11111111111111111111111111111111';
  if v_c.gclid is not null or v_c.visitor_context_hash is not null or v_c.session_attribution is not null then
    raise exception 'expected wf_viator_clicks raw identifiers redacted, got %', row_to_json(v_c);
  end if;

  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1001';
  if v_b.gclid is not null or v_b.matched_client_click_id is not null or v_b.redacted_at is null
     or v_b.attribution_status <> 'matched' or v_b.verified_google_campaign_id <> '24380159401' then
    raise exception 'expected wf_viator_bookings raw identifiers redacted while preserving attribution & campaign, got %', row_to_json(v_b);
  end if;

  select * into v_u from public.wf_google_conversion_uploads where booking_ref = 'BR-1001' and upload_kind = 'initial_booking';
  if (v_u.request_payload #> '{events,0,adIdentifiers}') is not null or v_u.redacted_at is null then
    raise exception 'expected wf_google_conversion_uploads request_payload adIdentifiers redacted, got %', row_to_json(v_u);
  end if;
end;
$$;
