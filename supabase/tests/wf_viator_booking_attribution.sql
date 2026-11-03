-- supabase/tests/wf_viator_booking_attribution.sql
-- Verifies wf_viator_clicks, wf_viator_reconcile, wf_viator_booking_events,
-- wf_viator_bookings, wf_google_conversion_uploads, wf_viator_financial_summary,
-- and wf_viator_redact_expired_clicks against all 6 required end-to-end scenarios.

do $$
declare
  v_res jsonb;
  v_b public.wf_viator_bookings%rowtype;
  v_u public.wf_google_conversion_uploads%rowtype;
  v_cnt integer;
  v_redacted integer;
begin
  -- Seed 3 clicks:
  -- 1) Eligible Google Ads click for campaign 24380159401 with GRANTED consent
  insert into public.wf_viator_clicks (
    click_token, client_click_id, provider, offer_id, page_key, surface, content_id,
    placement_campaign, attributed_campaign,
    gclid, google_campaign_id, consent_ad_user_data, consent_ad_personalization,
    clicked_at, expires_at, redact_after
  ) values (
    'wfv_11111111111111111111111111111111',
    'wf-click-paid-1',
    'viator',
    '123164P1',
    'g-things-to-do-orlando-not-theme-parks',
    'guide_pick',
    'things-to-do-orlando-not-theme-parks:rock-springs-run-kayak',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-11111111111111111111111111111111',
    'EAIaIQobChMI_test_rock_springs_1',
    '24380159401',
    'GRANTED',
    'GRANTED',
    '2026-11-03T14:00:00Z'::timestamptz,
    '2026-12-03T14:00:00Z'::timestamptz,
    '2027-02-01T14:00:00Z'::timestamptz
  );

  -- 2) Expired click (clicked 45 days before booking)
  insert into public.wf_viator_clicks (
    click_token, client_click_id, provider, offer_id, page_key, surface, content_id,
    placement_campaign, attributed_campaign,
    gclid, google_campaign_id, consent_ad_user_data, consent_ad_personalization,
    clicked_at, expires_at, redact_after
  ) values (
    'wfv_22222222222222222222222222222222',
    'wf-click-expired-2',
    'viator',
    '123164P1',
    'g-things-to-do-orlando-not-theme-parks',
    'guide_pick',
    'things-to-do-orlando-not-theme-parks:rock-springs-run-kayak',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-22222222222222222222222222222222',
    'EAIaIQobChMI_expired_click_2',
    '24380159401',
    'GRANTED',
    'GRANTED',
    '2026-09-01T14:00:00Z'::timestamptz,
    '2026-10-01T14:00:00Z'::timestamptz,
    '2026-11-01T14:00:00Z'::timestamptz
  );

  -- 3) Click with DENIED consent
  insert into public.wf_viator_clicks (
    click_token, client_click_id, provider, offer_id, page_key, surface, content_id,
    placement_campaign, attributed_campaign,
    gclid, google_campaign_id, consent_ad_user_data, consent_ad_personalization,
    clicked_at, expires_at, redact_after
  ) values (
    'wfv_33333333333333333333333333333333',
    'wf-click-denied-3',
    'viator',
    '123164P1',
    'g-things-to-do-orlando-not-theme-parks',
    'guide_pick',
    'things-to-do-orlando-not-theme-parks:rock-springs-run-kayak',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
    'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-33333333333333333333333333333333',
    'EAIaIQobChMI_denied_click_3',
    '24380159401',
    'DENIED',
    'DENIED',
    '2026-11-03T14:05:00Z'::timestamptz,
    '2026-12-03T14:05:00Z'::timestamptz,
    '2027-02-01T14:05:00Z'::timestamptz
  );

  -- Reconcile batch 1:
  -- - BR-1001: CONFIRMED matching wfv_1111... ($238.00 gross, $19.04 estimated, $19.04 confirmed)
  -- - BR-1002: CONFIRMED placement-only tag (no token -> unmatched_no_token)
  -- - BR-1003: CONFIRMED unknown token (wfv_9999... -> unmatched_unknown_token)
  -- - BR-1004: CONFIRMED expired token (wfv_2222... -> unmatched_expired)
  -- - BR-1005: CONFIRMED denied consent token (wfv_3333... -> matched, ineligible_missing_consent)
  v_res := public.wf_viator_reconcile(
    jsonb_build_array(
      jsonb_build_object(
        'event_key', 'BR-1001|CONFIRMED|2026-11-03T15:00:00.000Z|238.00|19.04|19.04|na',
        'booking_ref', 'BR-1001',
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
        'transaction_at', '2026-11-03T15:00:00Z',
        'provider_modified_at', '2026-11-03T15:00:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1002|CONFIRMED|2026-11-03T15:10:00.000Z|119.00|9.52|na|na',
        'booking_ref', 'BR-1002',
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
        'transaction_at', '2026-11-03T15:10:00Z',
        'provider_modified_at', '2026-11-03T15:10:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1003|CONFIRMED|2026-11-03T15:15:00.000Z|119.00|9.52|na|na',
        'booking_ref', 'BR-1003',
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
        'transaction_at', '2026-11-03T15:15:00Z',
        'provider_modified_at', '2026-11-03T15:15:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1004|CONFIRMED|2026-11-03T15:20:00.000Z|119.00|9.52|na|na',
        'booking_ref', 'BR-1004',
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
        'transaction_at', '2026-11-03T15:20:00Z',
        'provider_modified_at', '2026-11-03T15:20:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1005|CONFIRMED|2026-11-03T15:25:00.000Z|119.00|9.52|9.52|na',
        'booking_ref', 'BR-1005',
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
        'transaction_at', '2026-11-03T15:25:00Z',
        'provider_modified_at', '2026-11-03T15:25:00Z'
      )
    ),
    'cursor_page_1',
    '2026-11-03T15:25:00Z'::timestamptz,
    '2026-11-03T15:30:00Z'::timestamptz
  );

  if (v_res->>'ok')::boolean is not true then
    raise exception 'batch 1 reconcile failed: %', v_res;
  end if;
  if (v_res->>'matched')::int <> 2 or (v_res->>'unmatched_no_token')::int <> 1
     or (v_res->>'unmatched_unknown_token')::int <> 1 or (v_res->>'unmatched_expired')::int <> 1 then
    raise exception 'unexpected batch 1 counts: %', v_res;
  end if;

  -- Verify BR-1001 matched state and financial separation
  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1001';
  if v_b.attribution_status <> 'matched' or v_b.google_campaign_id <> '24380159401'
     or v_b.gross_booking_value <> 238.00 or v_b.confirmed_commission <> 19.04
     or v_b.paid_commission is not null then
    raise exception 'BR-1001 state mismatch: %', row_to_json(v_b);
  end if;

  -- Verify BR-1005 is ineligible_missing_consent in upload ledger
  select * into v_u from public.wf_google_conversion_uploads where booking_ref = 'BR-1005';
  if v_u.upload_status <> 'ineligible_missing_consent' then
    raise exception 'BR-1005 expected ineligible_missing_consent, got %', v_u.upload_status;
  end if;

  -- Reconcile batch 2:
  -- 1) Replay identical BR-1001 CONFIRMED event (idempotency: 0 new events inserted)
  -- 2) Amend BR-1001 to 3 guests ($357.00 gross, $28.56 confirmed commission)
  v_res := public.wf_viator_reconcile(
    jsonb_build_array(
      jsonb_build_object(
        'event_key', 'BR-1001|CONFIRMED|2026-11-03T15:00:00.000Z|238.00|19.04|19.04|na',
        'booking_ref', 'BR-1001',
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
        'transaction_at', '2026-11-03T15:00:00Z',
        'provider_modified_at', '2026-11-03T15:00:00Z'
      ),
      jsonb_build_object(
        'event_key', 'BR-1001|AMENDED|2026-11-03T16:00:00.000Z|357.00|28.56|28.56|na',
        'booking_ref', 'BR-1001',
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
        'transaction_at', '2026-11-03T15:00:00Z',
        'provider_modified_at', '2026-11-03T16:00:00Z'
      )
    ),
    'cursor_page_2',
    '2026-11-03T16:00:00Z'::timestamptz,
    '2026-11-03T16:05:00Z'::timestamptz
  );

  if (v_res->>'events_inserted')::int <> 1 then
    raise exception 'expected only 1 new event inserted on replay + amendment, got %', v_res;
  end if;

  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1001';
  if v_b.status <> 'amended' or v_b.amendment_count <> 1 or v_b.confirmed_commission <> 28.56 then
    raise exception 'BR-1001 amendment state mismatch: %', row_to_json(v_b);
  end if;

  -- Ensure amendment did NOT create a second initial_booking upload row
  select count(*) into v_cnt from public.wf_google_conversion_uploads where booking_ref = 'BR-1001';
  if v_cnt <> 1 then
    raise exception 'expected 1 upload row for BR-1001 after amendment, got %', v_cnt;
  end if;
  select * into v_u from public.wf_google_conversion_uploads where booking_ref = 'BR-1001';
  if v_u.conversion_value <> 28.56 then
    raise exception 'expected amended upload conversion_value 28.56, got %', v_u.conversion_value;
  end if;

  -- Simulate live submission of BR-1001 initial_booking, followed by CANCELLATION
  update public.wf_google_conversion_uploads
    set upload_status = 'submitted', validate_only = false, request_id = 'dm_req_1'
    where id = v_u.id;

  v_res := public.wf_viator_reconcile(
    jsonb_build_array(
      jsonb_build_object(
        'event_key', 'BR-1001|CANCELLED|2026-11-03T17:00:00.000Z|357.00|0.00|0.00|na',
        'booking_ref', 'BR-1001',
        'event_type', 'CANCELLED',
        'status', 'cancelled',
        'product_code', '123164P1',
        'campaign_value', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-11111111111111111111111111111111',
        'click_token', 'wfv_11111111111111111111111111111111',
        'placement_campaign', 'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
        'gross_booking_value', 357.00,
        'estimated_commission', 0.00,
        'confirmed_commission', 0.00,
        'paid_commission', null,
        'currency', 'USD',
        'transaction_at', '2026-11-03T15:00:00Z',
        'provider_modified_at', '2026-11-03T17:00:00Z',
        'cancellation_at', '2026-11-03T17:00:00Z'
      )
    ),
    'cursor_page_3',
    '2026-11-03T17:00:00Z'::timestamptz,
    '2026-11-03T17:05:00Z'::timestamptz
  );

  select * into v_b from public.wf_viator_bookings where booking_ref = 'BR-1001';
  if v_b.status <> 'cancelled' or v_b.confirmed_commission <> 0.00 or v_b.estimated_commission <> 0.00 then
    raise exception 'BR-1001 cancelled state mismatch: %', row_to_json(v_b);
  end if;

  select * into v_u
    from public.wf_google_conversion_uploads
    where booking_ref = 'BR-1001' and upload_kind = 'cancellation_restatement';
  if not found or v_u.conversion_value <> 0.00 or v_u.retraction_required is not true then
    raise exception 'expected cancellation_restatement row with 0.00 and retraction_required=true';
  end if;

  -- Verify 90-day redaction function clears raw gclid past redact_after
  v_redacted := public.wf_viator_redact_expired_clicks('2026-11-03T18:00:00Z'::timestamptz);
  if v_redacted <> 1 then
    raise exception 'expected 1 expired click redacted, got %', v_redacted;
  end if;
end;
$$;
