-- 20261103220000_wf_viator_booking_attribution.sql
-- End-to-end Viator per-click opaque attribution mapping, immutable booking
-- event history, current booking state reconciliation, strict 4-way financial
-- separation (never substituting gross_booking_value for commission), missing
-- timestamp/currency visibility, campaign trust-boundary separation, sync
-- lease protection, and Google Ads v26 offline conversion upload & adjustment
-- ledger with recovery from timeouts, abandoned claims, and rollout validation.

create table if not exists public.wf_viator_clicks (
  click_token text primary key
    check (click_token ~ '^wfv_[0-9a-f]{32}$'),
  client_click_id text
    check (client_click_id is null or client_click_id ~ '^[A-Za-z0-9_-]{4,80}$'),
  visitor_context_hash text
    check (visitor_context_hash is null or visitor_context_hash ~ '^[0-9a-f]{32}$'),
  provider text not null default 'viator'
    check (provider = 'viator'),
  offer_id text not null
    check (offer_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  page_key text,
  surface text not null
    check (surface ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  content_id text,
  placement_campaign text not null
    check (placement_campaign ~ '^[a-z0-9-]{1,100}$'),
  attributed_campaign text not null
    check (attributed_campaign ~ '^[a-z0-9-]{1,100}$'),
  destination_host text not null default 'www.viator.com'
    check (destination_host in ('viator.com', 'www.viator.com')),
  gclid text,
  gbraid text,
  wbraid text,
  -- Trust boundary: URL-captured utm_campaign is unverified request metadata.
  -- Verified Google Ads campaign identity is stored separately and populated
  -- ONLY from authoritative Google Ads reporting.
  observed_utm_campaign text
    check (observed_utm_campaign is null or observed_utm_campaign ~ '^[0-9]{8,16}$'),
  verified_google_campaign_id text
    check (verified_google_campaign_id is null or verified_google_campaign_id ~ '^[0-9]{8,16}$'),
  campaign_metadata_provenance text not null default 'none'
    check (campaign_metadata_provenance in ('none', 'url_utm_unverified', 'google_ads_api_verified')),
  campaign_verification_status text not null default 'not_applicable'
    check (campaign_verification_status in ('not_applicable', 'unverified', 'verified', 'mismatch')),
  google_campaign_id text
    check (google_campaign_id is null or google_campaign_id ~ '^[0-9]{8,16}$'),
  consent_ad_user_data text not null default 'UNKNOWN'
    check (consent_ad_user_data in ('GRANTED', 'DENIED', 'UNKNOWN')),
  consent_ad_personalization text not null default 'UNKNOWN'
    check (consent_ad_personalization in ('GRANTED', 'DENIED', 'UNKNOWN')),
  session_attribution jsonb,
  first_touch_attribution jsonb,
  clicked_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  redact_after timestamptz not null default (now() + interval '90 days'),
  redacted_at timestamptz
);

create unique index if not exists wf_viator_clicks_retry_uidx
  on public.wf_viator_clicks (provider, offer_id, client_click_id)
  where client_click_id is not null;

create index if not exists wf_viator_clicks_clicked_idx
  on public.wf_viator_clicks (clicked_at desc);

create index if not exists wf_viator_clicks_campaign_idx
  on public.wf_viator_clicks (google_campaign_id, clicked_at desc)
  where google_campaign_id is not null;

create index if not exists wf_viator_clicks_verified_campaign_idx
  on public.wf_viator_clicks (verified_google_campaign_id, clicked_at desc)
  where verified_google_campaign_id is not null;

create table if not exists public.wf_viator_sync_state (
  id integer primary key default 1
    check (id = 1),
  next_cursor text,
  modified_since_watermark timestamptz not null default (now() - interval '24 hours'),
  sync_epoch bigint not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  last_synced_at timestamptz,
  last_attempt_at timestamptz,
  last_error text
);

insert into public.wf_viator_sync_state (id)
values (1)
on conflict (id) do nothing;

-- Immutable event log for `/partner/bookings/modified-since`.
-- Provider timestamps (`original_booking_at`, `transaction_at`, `provider_modified_at`)
-- and `currency` are nullable so missing provider fields remain visibly NULL
-- rather than silently becoming `now()` or `'USD'`.
create table if not exists public.wf_viator_booking_events (
  event_key text primary key,
  booking_ref text not null
    check (char_length(booking_ref) between 1 and 120),
  transaction_ref text
    check (transaction_ref is null or char_length(transaction_ref) between 1 and 120),
  partner_booking_ref text
    check (partner_booking_ref is null or char_length(partner_booking_ref) between 1 and 120),
  raw_event_type text not null default 'CONFIRMED',
  event_type text not null
    check (event_type in ('CONFIRMED', 'AMENDED', 'CANCELLED', 'REJECTED', 'PENDING', 'UNRECOGNIZED', 'UNKNOWN')),
  status text not null
    check (status in ('confirmed', 'amended', 'cancelled', 'rejected', 'pending', 'unrecognized', 'unknown')),
  cancellation_actor text
    check (cancellation_actor is null or cancellation_actor in ('customer', 'provider_or_operator')),
  needs_investigation boolean not null default false,
  product_code text,
  campaign_value text,
  click_token text
    check (click_token is null or click_token ~ '^wfv_[0-9a-f]{32}$'),
  placement_campaign text,
  gross_booking_value numeric(12, 2)
    check (gross_booking_value is null or gross_booking_value >= 0),
  estimated_commission numeric(12, 2)
    check (estimated_commission is null or estimated_commission >= 0),
  confirmed_commission numeric(12, 2)
    check (confirmed_commission is null or confirmed_commission >= 0),
  paid_commission numeric(12, 2)
    check (paid_commission is null or paid_commission >= 0),
  currency text
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  original_booking_at timestamptz,
  transaction_at timestamptz,
  provider_modified_at timestamptz,
  acknowledge_by timestamptz,
  cancellation_at timestamptz,
  raw_summary jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

create index if not exists wf_viator_booking_events_ref_idx
  on public.wf_viator_booking_events (booking_ref, provider_modified_at desc nulls last);

create table if not exists public.wf_viator_bookings (
  booking_ref text primary key
    check (char_length(booking_ref) between 1 and 120),
  last_transaction_ref text
    check (last_transaction_ref is null or char_length(last_transaction_ref) between 1 and 120),
  partner_booking_ref text
    check (partner_booking_ref is null or char_length(partner_booking_ref) between 1 and 120),
  status text not null
    check (status in ('confirmed', 'amended', 'cancelled', 'rejected', 'pending', 'unrecognized', 'unknown')),
  last_event_type text not null
    check (last_event_type in ('CONFIRMED', 'AMENDED', 'CANCELLED', 'REJECTED', 'PENDING', 'UNRECOGNIZED', 'UNKNOWN')),
  last_raw_event_type text not null default 'CONFIRMED',
  cancellation_actor text
    check (cancellation_actor is null or cancellation_actor in ('customer', 'provider_or_operator')),
  needs_investigation boolean not null default false,
  product_code text,
  campaign_value text,
  click_token text
    check (click_token is null or click_token ~ '^wfv_[0-9a-f]{32}$'),
  placement_campaign text,
  attribution_status text not null
    check (attribution_status in (
      'matched',
      'unmatched_no_token',
      'unmatched_unknown_token',
      'unmatched_expired',
      'unmatched_missing_booking_timestamp'
    )),
  matched_click_token text references public.wf_viator_clicks (click_token) on delete set null,
  matched_client_click_id text,
  matched_offer_id text,
  matched_page_key text,
  matched_surface text,
  matched_content_id text,
  gclid text,
  gbraid text,
  wbraid text,
  observed_utm_campaign text
    check (observed_utm_campaign is null or observed_utm_campaign ~ '^[0-9]{8,16}$'),
  verified_google_campaign_id text
    check (verified_google_campaign_id is null or verified_google_campaign_id ~ '^[0-9]{8,16}$'),
  campaign_metadata_provenance text not null default 'none'
    check (campaign_metadata_provenance in ('none', 'url_utm_unverified', 'google_ads_api_verified')),
  campaign_verification_status text not null default 'not_applicable'
    check (campaign_verification_status in ('not_applicable', 'unverified', 'verified', 'mismatch')),
  google_campaign_id text
    check (google_campaign_id is null or google_campaign_id ~ '^[0-9]{8,16}$'),
  consent_ad_user_data text
    check (consent_ad_user_data is null or consent_ad_user_data in ('GRANTED', 'DENIED', 'UNKNOWN')),
  consent_ad_personalization text
    check (consent_ad_personalization is null or consent_ad_personalization in ('GRANTED', 'DENIED', 'UNKNOWN')),
  gross_booking_value numeric(12, 2)
    check (gross_booking_value is null or gross_booking_value >= 0),
  estimated_commission numeric(12, 2)
    check (estimated_commission is null or estimated_commission >= 0),
  confirmed_commission numeric(12, 2)
    check (confirmed_commission is null or confirmed_commission >= 0),
  paid_commission numeric(12, 2)
    check (paid_commission is null or paid_commission >= 0),
  currency text
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  amendment_count integer not null default 0
    check (amendment_count >= 0),
  original_booking_at timestamptz,
  transaction_at timestamptz,
  provider_modified_at timestamptz,
  acknowledge_by timestamptz,
  cancellation_at timestamptz,
  reconciled_at timestamptz not null default now(),
  redacted_at timestamptz
);

create index if not exists wf_viator_bookings_status_idx
  on public.wf_viator_bookings (attribution_status, status, transaction_at desc nulls last);

create index if not exists wf_viator_bookings_campaign_idx
  on public.wf_viator_bookings (google_campaign_id, status)
  where google_campaign_id is not null;

-- Durable Google Ads offline conversion & adjustment ledger.
-- Invariant: `value_basis` NEVER allows `'gross_booking_value'` so customer
-- spend can never be uploaded as Wayfind commission. When commission is
-- missing on an active booking, `conversion_value` is NULL, `value_basis` is
-- `'commission_unknown'`, and `upload_status` is `'ineligible_missing_commission'`.
create table if not exists public.wf_google_conversion_uploads (
  id bigserial primary key,
  booking_ref text not null references public.wf_viator_bookings (booking_ref) on delete cascade,
  transaction_id text not null,
  upload_kind text not null
    check (upload_kind in ('initial_booking', 'amendment_restatement', 'cancellation_restatement')),
  upload_status text not null
    check (upload_status in (
      'awaiting_upload',
      'in_flight',
      'timed_out_indeterminate',
      'validated_only',
      'submitted',
      'accepted',
      'rejected',
      'ineligible_missing_click_id',
      'ineligible_missing_consent',
      'ineligible_missing_commission',
      'ineligible_missing_currency',
      'cancelled_before_upload'
    )),
  adjustment_state text not null default 'none'
    check (adjustment_state in (
      'none',
      'pending_retraction',
      'pending_restatement',
      'value_restated_zero_count_unretracted',
      'retracted_count_and_value',
      'restated_value'
    )),
  validate_only boolean not null default true,
  conversion_action_id text,
  observed_utm_campaign text,
  verified_google_campaign_id text,
  campaign_verification_status text not null default 'not_applicable'
    check (campaign_verification_status in ('not_applicable', 'unverified', 'verified', 'mismatch')),
  google_campaign_id text,
  conversion_value numeric(12, 2)
    check (conversion_value is null or conversion_value >= 0),
  value_basis text not null default 'commission_unknown'
    check (value_basis in (
      'confirmed_commission',
      'estimated_commission',
      'commission_unknown',
      'cancelled_restatement_zero',
      'cancelled_retraction',
      'zero_unreported',
      'none'
    )),
  currency text
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  retraction_required boolean not null default false,
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  request_id text,
  http_status integer,
  last_error text,
  request_payload jsonb,
  response_summary jsonb,
  in_flight_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  redacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_ref, upload_kind)
);

-- Private attribution & financial tables: service_role only.
alter table public.wf_viator_clicks enable row level security;
alter table public.wf_viator_sync_state enable row level security;
alter table public.wf_viator_booking_events enable row level security;
alter table public.wf_viator_bookings enable row level security;
alter table public.wf_google_conversion_uploads enable row level security;

revoke all on public.wf_viator_clicks from public, anon, authenticated;
revoke all on public.wf_viator_sync_state from public, anon, authenticated;
revoke all on public.wf_viator_booking_events from public, anon, authenticated;
revoke all on public.wf_viator_bookings from public, anon, authenticated;
revoke all on public.wf_google_conversion_uploads from public, anon, authenticated;

grant all on public.wf_viator_clicks to service_role;
grant all on public.wf_viator_sync_state to service_role;
grant all on public.wf_viator_booking_events to service_role;
grant all on public.wf_viator_bookings to service_role;
grant all on public.wf_google_conversion_uploads to service_role;
grant usage, select on sequence public.wf_google_conversion_uploads_id_seq to service_role;

-- Acquire an exclusive, epoch-numbered lease on wf_viator_sync_state so
-- overlapping pollers cannot race and delayed workers cannot regress the cursor.
create or replace function public.wf_viator_acquire_sync_lease(
  p_worker_id text,
  p_now timestamptz default now(),
  p_ttl_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.wf_viator_sync_state%rowtype;
  v_ttl interval;
begin
  perform pg_advisory_xact_lock(24380159401);

  if p_worker_id is null or trim(p_worker_id) = '' then
    return jsonb_build_object('acquired', false, 'reason', 'missing_worker_id');
  end if;

  select * into v_state
    from public.wf_viator_sync_state
    where id = 1
    for update;

  if v_state.lease_expires_at is not null
     and v_state.lease_expires_at > p_now
     and v_state.lease_owner is not null
     and v_state.lease_owner <> p_worker_id then
    return jsonb_build_object(
      'acquired', false,
      'reason', 'lease_held_by_active_worker',
      'lease_owner', v_state.lease_owner,
      'lease_expires_at', v_state.lease_expires_at,
      'sync_epoch', v_state.sync_epoch
    );
  end if;

  v_ttl := make_interval(secs => greatest(10, coalesce(p_ttl_seconds, 180)));

  update public.wf_viator_sync_state set
    sync_epoch = sync_epoch + 1,
    lease_owner = p_worker_id,
    lease_expires_at = p_now + v_ttl,
    last_attempt_at = p_now
  where id = 1
  returning * into v_state;

  return jsonb_build_object(
    'acquired', true,
    'sync_epoch', v_state.sync_epoch,
    'lease_owner', v_state.lease_owner,
    'lease_expires_at', v_state.lease_expires_at,
    'next_cursor', v_state.next_cursor,
    'modified_since_watermark', v_state.modified_since_watermark
  );
end;
$$;

revoke all on function public.wf_viator_acquire_sync_lease(text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.wf_viator_acquire_sync_lease(text, timestamptz, integer)
  to service_role;

-- Reconcile a page of normalized Viator booking events and advance the sync
-- cursor atomically inside the same transaction.
create or replace function public.wf_viator_reconcile(
  p_events jsonb default '[]'::jsonb,
  p_next_cursor text default null,
  p_watermark timestamptz default null,
  p_synced_at timestamptz default now(),
  p_expected_epoch bigint default null,
  p_worker_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sync_state public.wf_viator_sync_state%rowtype;
  v_item jsonb;
  v_event_key text;
  v_booking_ref text;
  v_transaction_ref text;
  v_partner_booking_ref text;
  v_raw_event_type text;
  v_event_type text;
  v_status text;
  v_cancel_actor text;
  v_needs_inv boolean;
  v_product_code text;
  v_campaign_value text;
  v_click_token text;
  v_placement_campaign text;
  v_gross numeric(12, 2);
  v_estimated numeric(12, 2);
  v_confirmed numeric(12, 2);
  v_paid numeric(12, 2);
  v_currency text;
  v_orig_at timestamptz;
  v_tx_at timestamptz;
  v_mod_at timestamptz;
  v_ack_by timestamptz;
  v_cancel_at timestamptz;
  v_effective_orig_at timestamptz;
  v_eligibility_ts timestamptz;
  v_effective_token text;
  v_click public.wf_viator_clicks%rowtype;
  v_has_click boolean;
  v_attr_status text;
  v_existing public.wf_viator_bookings%rowtype;
  v_has_existing boolean;
  v_is_newer_or_equal boolean;
  v_gross_changed_without_commission boolean;
  v_current public.wf_viator_bookings%rowtype;
  v_initial_upload public.wf_google_conversion_uploads%rowtype;
  v_has_initial_upload boolean;
  v_conv_val numeric(12, 2);
  v_val_basis text;
  v_elig_status text;
  v_row_count integer;
  v_events_inserted integer := 0;
  v_matched integer := 0;
  v_unmatched_no_token integer := 0;
  v_unmatched_unknown integer := 0;
  v_unmatched_expired integer := 0;
  v_unmatched_missing_ts integer := 0;
  v_unrecognized_events integer := 0;
begin
  -- Serialize concurrent Viator reconciliation runs.
  perform pg_advisory_xact_lock(24380159401);

  select * into v_sync_state
    from public.wf_viator_sync_state
    where id = 1
    for update;

  if p_expected_epoch is not null and v_sync_state.sync_epoch <> p_expected_epoch then
    return jsonb_build_object(
      'ok', false,
      'reason', 'stale_sync_epoch',
      'expected_epoch', p_expected_epoch,
      'current_epoch', v_sync_state.sync_epoch
    );
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'events_not_array');
  end if;

  -- Deterministically order events within the batch by provider_modified_at ASC NULLS LAST
  -- and lifecycle stage (CONFIRMED -> PENDING -> AMENDED -> CANCELLED -> REJECTED) so
  -- reverse-ordered pages reconcile in chronological order.
  for v_item in
    select e.value
    from jsonb_array_elements(p_events) with ordinality as e(value, ord)
    order by
      nullif(trim(coalesce(e.value->>'provider_modified_at', '')), '')::timestamptz asc nulls last,
      case coalesce(e.value->>'event_type', 'UNKNOWN')
        when 'CONFIRMED' then 1
        when 'PENDING' then 2
        when 'AMENDED' then 3
        when 'CANCELLED' then 4
        when 'REJECTED' then 5
        else 6
      end asc,
      e.ord asc
  loop
    v_event_key := nullif(trim(coalesce(v_item->>'event_key', '')), '');
    v_booking_ref := nullif(trim(coalesce(v_item->>'booking_ref', '')), '');
    if v_event_key is null or v_booking_ref is null then
      continue;
    end if;

    v_transaction_ref := nullif(trim(coalesce(v_item->>'transaction_ref', '')), '');
    v_partner_booking_ref := nullif(trim(coalesce(v_item->>'partner_booking_ref', '')), '');
    v_raw_event_type := coalesce(nullif(trim(v_item->>'raw_event_type'), ''), nullif(trim(v_item->>'event_type'), ''), 'UNKNOWN');
    v_event_type := coalesce(nullif(trim(v_item->>'event_type'), ''), 'UNKNOWN');
    v_status := coalesce(nullif(trim(v_item->>'status'), ''), 'unknown');
    v_cancel_actor := nullif(trim(coalesce(v_item->>'cancellation_actor', '')), '');
    v_product_code := nullif(trim(coalesce(v_item->>'product_code', '')), '');
    v_campaign_value := nullif(trim(coalesce(v_item->>'campaign_value', '')), '');
    v_click_token := nullif(trim(coalesce(v_item->>'click_token', '')), '');
    v_placement_campaign := nullif(trim(coalesce(v_item->>'placement_campaign', '')), '');
    v_gross := (nullif(trim(coalesce(v_item->>'gross_booking_value', '')), ''))::numeric(12, 2);
    v_estimated := (nullif(trim(coalesce(v_item->>'estimated_commission', '')), ''))::numeric(12, 2);
    v_confirmed := (nullif(trim(coalesce(v_item->>'confirmed_commission', '')), ''))::numeric(12, 2);
    v_paid := (nullif(trim(coalesce(v_item->>'paid_commission', '')), ''))::numeric(12, 2);
    v_currency := upper(nullif(trim(coalesce(v_item->>'currency', '')), ''));
    if v_currency is not null and v_currency !~ '^[A-Z]{3}$' then
      v_currency := null;
    end if;

    -- Missing provider timestamps MUST remain NULL (never substituted with p_synced_at).
    v_orig_at := (nullif(trim(coalesce(v_item->>'original_booking_at', '')), ''))::timestamptz;
    v_tx_at := (nullif(trim(coalesce(v_item->>'transaction_at', '')), ''))::timestamptz;
    v_mod_at := (nullif(trim(coalesce(v_item->>'provider_modified_at', '')), ''))::timestamptz;
    v_ack_by := (nullif(trim(coalesce(v_item->>'acknowledge_by', '')), ''))::timestamptz;
    v_cancel_at := (nullif(trim(coalesce(v_item->>'cancellation_at', '')), ''))::timestamptz;

    v_needs_inv := coalesce(
      (v_item->>'needs_investigation')::boolean,
      false
    ) or (v_status in ('unrecognized', 'unknown'))
      or (v_mod_at is null and v_tx_at is null and v_orig_at is null);

    if v_status in ('unrecognized', 'unknown') then
      v_unrecognized_events := v_unrecognized_events + 1;
    end if;

    -- 1. Append immutable booking event history (idempotent on event_key).
    insert into public.wf_viator_booking_events (
      event_key, booking_ref, transaction_ref, partner_booking_ref,
      raw_event_type, event_type, status,
      cancellation_actor, needs_investigation, product_code,
      campaign_value, click_token, placement_campaign,
      gross_booking_value, estimated_commission, confirmed_commission, paid_commission,
      currency, original_booking_at, transaction_at, provider_modified_at,
      acknowledge_by, cancellation_at, raw_summary, ingested_at
    ) values (
      v_event_key, v_booking_ref, v_transaction_ref, v_partner_booking_ref,
      v_raw_event_type, v_event_type, v_status,
      v_cancel_actor, v_needs_inv, v_product_code,
      v_campaign_value, v_click_token, v_placement_campaign,
      v_gross, v_estimated, v_confirmed, v_paid,
      v_currency, v_orig_at, v_tx_at, v_mod_at,
      v_ack_by, v_cancel_at,
      coalesce(v_item->'raw_summary', '{}'::jsonb), p_synced_at
    )
    on conflict (event_key) do nothing;

    get diagnostics v_row_count = row_count;
    v_events_inserted := v_events_inserted + v_row_count;

    -- 2. Look up any previously reconciled booking state first so later
    --    amendments/cancellations (even after 30d click expiry or 90d redaction,
    --    or partial events omitting campaignValue/currency/original_booking_at)
    --    preserve their established attribution and original_booking_at.
    select * into v_existing
      from public.wf_viator_bookings
      where booking_ref = v_booking_ref
      for update;
    v_has_existing := found;

    if v_has_existing then
      if v_existing.original_booking_at is not null and v_orig_at is not null then
        v_effective_orig_at := least(v_existing.original_booking_at, v_orig_at);
      else
        v_effective_orig_at := coalesce(v_existing.original_booking_at, v_orig_at);
      end if;
      v_effective_token := coalesce(v_click_token, v_existing.matched_click_token, v_existing.click_token);
    else
      v_effective_orig_at := v_orig_at;
      v_effective_token := v_click_token;
    end if;

    -- Eligibility timestamp for initial click window comparison: uses
    -- original_booking_at if known, or on a CONFIRMED/PENDING event falls back
    -- to transaction_at/provider_modified_at. Never uses p_synced_at (now()).
    v_eligibility_ts := coalesce(
      v_effective_orig_at,
      case when v_status in ('confirmed', 'pending') then coalesce(v_tx_at, v_mod_at) else null end
    );

    -- 3. Resolve click token against public.wf_viator_clicks.
    --    If the booking was ALREADY matched on an earlier event, preserve that
    --    matched attribution even if this later amendment/cancellation arrives
    --    after click.expires_at or omits campaignValue.
    v_has_click := false;
    v_click := null;
    if v_has_existing and v_existing.attribution_status = 'matched' then
      v_attr_status := 'matched';
      v_matched := v_matched + 1;
      if v_effective_token is not null then
        select * into v_click
          from public.wf_viator_clicks
          where click_token = v_effective_token;
        v_has_click := found;
      end if;
    elsif v_effective_token is null then
      v_attr_status := 'unmatched_no_token';
      v_unmatched_no_token := v_unmatched_no_token + 1;
    else
      select * into v_click
        from public.wf_viator_clicks
        where click_token = v_effective_token;
      v_has_click := found;

      if not v_has_click then
        v_attr_status := 'unmatched_unknown_token';
        v_unmatched_unknown := v_unmatched_unknown + 1;
      elsif v_eligibility_ts is null then
        -- Missing booking timestamp must remain visibly unverified rather than
        -- silently substituting current sync time to manufacture a match.
        v_attr_status := 'unmatched_missing_booking_timestamp';
        v_unmatched_missing_ts := v_unmatched_missing_ts + 1;
        v_needs_inv := true;
      elsif v_eligibility_ts > v_click.expires_at or v_eligibility_ts < (v_click.clicked_at - interval '5 minutes') then
        v_attr_status := 'unmatched_expired';
        v_unmatched_expired := v_unmatched_expired + 1;
      else
        v_attr_status := 'matched';
        v_matched := v_matched + 1;
      end if;
    end if;

    -- 4. Upsert current booking state in public.wf_viator_bookings.
    if not v_has_existing then
      insert into public.wf_viator_bookings (
        booking_ref, last_transaction_ref, partner_booking_ref,
        status, last_event_type, last_raw_event_type,
        cancellation_actor, needs_investigation, product_code,
        campaign_value, click_token, placement_campaign,
        attribution_status, matched_click_token, matched_client_click_id,
        matched_offer_id, matched_page_key, matched_surface, matched_content_id,
        gclid, gbraid, wbraid,
        observed_utm_campaign, verified_google_campaign_id,
        campaign_metadata_provenance, campaign_verification_status,
        google_campaign_id,
        consent_ad_user_data, consent_ad_personalization,
        gross_booking_value, estimated_commission, confirmed_commission, paid_commission,
        currency, amendment_count, original_booking_at, transaction_at,
        provider_modified_at, acknowledge_by, cancellation_at, reconciled_at
      ) values (
        v_booking_ref, v_transaction_ref, v_partner_booking_ref,
        v_status, v_event_type, v_raw_event_type,
        v_cancel_actor, v_needs_inv, v_product_code,
        v_campaign_value, v_effective_token,
        coalesce(case when v_has_click then v_click.placement_campaign else null end, v_placement_campaign),
        v_attr_status,
        case when v_attr_status = 'matched' and v_has_click then v_click.click_token else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.client_click_id else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.offer_id else v_product_code end,
        case when v_attr_status = 'matched' and v_has_click then v_click.page_key else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.surface else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.content_id else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.gclid else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.gbraid else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.wbraid else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.observed_utm_campaign else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.verified_google_campaign_id else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.campaign_metadata_provenance else 'none' end,
        case when v_attr_status = 'matched' and v_has_click then v_click.campaign_verification_status else 'not_applicable' end,
        case when v_attr_status = 'matched' and v_has_click then v_click.google_campaign_id else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.consent_ad_user_data else null end,
        case when v_attr_status = 'matched' and v_has_click then v_click.consent_ad_personalization else null end,
        v_gross, v_estimated, v_confirmed, v_paid,
        v_currency,
        case when v_event_type = 'AMENDED' then 1 else 0 end,
        v_effective_orig_at, v_tx_at, v_mod_at, v_ack_by, v_cancel_at, p_synced_at
      )
      returning * into v_current;
    else
      -- Determine whether this incoming event is newer than or equal to the
      -- existing booking's provider_modified_at, handling NULL timestamps safely:
      -- * An incoming event with NULL provider_modified_at never overwrites an
      --   existing booking that has a non-null provider_modified_at.
      -- * Terminal statuses ('cancelled', 'rejected') are never resurrected by
      --   an older or same-timestamp non-terminal event.
      v_is_newer_or_equal := case
        when v_status in ('unrecognized', 'unknown') and v_existing.status not in ('unrecognized', 'unknown')
          then false
        when v_existing.provider_modified_at is null and v_mod_at is not null
          then true
        when v_existing.provider_modified_at is not null and v_mod_at is null
          then false
        when v_existing.provider_modified_at is null and v_mod_at is null
          then v_existing.status not in ('cancelled', 'rejected')
        when v_mod_at > v_existing.provider_modified_at
          then true
        when v_mod_at = v_existing.provider_modified_at
          then (
            case v_status
              when 'cancelled' then 5
              when 'rejected' then 5
              when 'amended' then 4
              when 'confirmed' then 3
              when 'pending' then 2
              else 1
            end
          ) >= (
            case v_existing.status
              when 'cancelled' then 5
              when 'rejected' then 5
              when 'amended' then 4
              when 'confirmed' then 3
              when 'pending' then 2
              else 1
            end
          )
        else false
      end;

      -- If a newer AMENDMENT changes gross_booking_value without supplying updated
      -- commission figures, the previous commission is stale and must become NULL
      -- (unknown) rather than misreporting the pre-amendment commission.
      v_gross_changed_without_commission := (
        v_is_newer_or_equal
        and v_status = 'amended'
        and v_gross is not null
        and v_existing.gross_booking_value is not null
        and v_gross <> v_existing.gross_booking_value
        and v_estimated is null
        and v_confirmed is null
      );

      if v_gross_changed_without_commission then
        v_needs_inv := true;
      end if;

      update public.wf_viator_bookings set
        last_transaction_ref = case
          when v_is_newer_or_equal and v_transaction_ref is not null then v_transaction_ref
          else coalesce(public.wf_viator_bookings.last_transaction_ref, v_transaction_ref)
        end,
        partner_booking_ref = coalesce(v_partner_booking_ref, public.wf_viator_bookings.partner_booking_ref),
        status = case
          when v_is_newer_or_equal then v_status
          else public.wf_viator_bookings.status
        end,
        last_event_type = case
          when v_is_newer_or_equal then v_event_type
          else public.wf_viator_bookings.last_event_type
        end,
        last_raw_event_type = case
          when v_is_newer_or_equal then v_raw_event_type
          else public.wf_viator_bookings.last_raw_event_type
        end,
        cancellation_actor = coalesce(v_cancel_actor, public.wf_viator_bookings.cancellation_actor),
        needs_investigation = public.wf_viator_bookings.needs_investigation or v_needs_inv,
        product_code = coalesce(v_product_code, public.wf_viator_bookings.product_code),
        campaign_value = coalesce(v_campaign_value, public.wf_viator_bookings.campaign_value),
        click_token = coalesce(v_effective_token, public.wf_viator_bookings.click_token),
        placement_campaign = coalesce(
          public.wf_viator_bookings.placement_campaign,
          case when v_has_click then v_click.placement_campaign else null end,
          v_placement_campaign
        ),
        attribution_status = case
          when public.wf_viator_bookings.attribution_status = 'matched' then 'matched'
          else v_attr_status
        end,
        matched_click_token = coalesce(
          public.wf_viator_bookings.matched_click_token,
          case when v_attr_status = 'matched' and v_has_click then v_click.click_token else null end
        ),
        matched_client_click_id = case
          when public.wf_viator_bookings.redacted_at is not null then null
          else coalesce(
            public.wf_viator_bookings.matched_client_click_id,
            case when v_attr_status = 'matched' and v_has_click then v_click.client_click_id else null end
          )
        end,
        matched_offer_id = coalesce(
          public.wf_viator_bookings.matched_offer_id,
          case when v_attr_status = 'matched' and v_has_click then v_click.offer_id else v_product_code end
        ),
        matched_page_key = coalesce(
          public.wf_viator_bookings.matched_page_key,
          case when v_attr_status = 'matched' and v_has_click then v_click.page_key else null end
        ),
        matched_surface = coalesce(
          public.wf_viator_bookings.matched_surface,
          case when v_attr_status = 'matched' and v_has_click then v_click.surface else null end
        ),
        matched_content_id = coalesce(
          public.wf_viator_bookings.matched_content_id,
          case when v_attr_status = 'matched' and v_has_click then v_click.content_id else null end
        ),
        gclid = case
          when public.wf_viator_bookings.redacted_at is not null then null
          else coalesce(
            public.wf_viator_bookings.gclid,
            case when v_attr_status = 'matched' and v_has_click then v_click.gclid else null end
          )
        end,
        gbraid = case
          when public.wf_viator_bookings.redacted_at is not null then null
          else coalesce(
            public.wf_viator_bookings.gbraid,
            case when v_attr_status = 'matched' and v_has_click then v_click.gbraid else null end
          )
        end,
        wbraid = case
          when public.wf_viator_bookings.redacted_at is not null then null
          else coalesce(
            public.wf_viator_bookings.wbraid,
            case when v_attr_status = 'matched' and v_has_click then v_click.wbraid else null end
          )
        end,
        observed_utm_campaign = coalesce(
          public.wf_viator_bookings.observed_utm_campaign,
          case when v_attr_status = 'matched' and v_has_click then v_click.observed_utm_campaign else null end
        ),
        verified_google_campaign_id = coalesce(
          public.wf_viator_bookings.verified_google_campaign_id,
          case when v_attr_status = 'matched' and v_has_click then v_click.verified_google_campaign_id else null end
        ),
        campaign_metadata_provenance = case
          when public.wf_viator_bookings.campaign_metadata_provenance <> 'none'
            then public.wf_viator_bookings.campaign_metadata_provenance
          when v_attr_status = 'matched' and v_has_click
            then v_click.campaign_metadata_provenance
          else 'none'
        end,
        campaign_verification_status = case
          when public.wf_viator_bookings.campaign_verification_status <> 'not_applicable'
            then public.wf_viator_bookings.campaign_verification_status
          when v_attr_status = 'matched' and v_has_click
            then v_click.campaign_verification_status
          else 'not_applicable'
        end,
        google_campaign_id = coalesce(
          public.wf_viator_bookings.google_campaign_id,
          case when v_attr_status = 'matched' and v_has_click then v_click.google_campaign_id else null end
        ),
        consent_ad_user_data = coalesce(
          public.wf_viator_bookings.consent_ad_user_data,
          case when v_attr_status = 'matched' and v_has_click then v_click.consent_ad_user_data else null end
        ),
        consent_ad_personalization = coalesce(
          public.wf_viator_bookings.consent_ad_personalization,
          case when v_attr_status = 'matched' and v_has_click then v_click.consent_ad_personalization else null end
        ),
        gross_booking_value = case
          when v_is_newer_or_equal and v_gross is not null then v_gross
          else coalesce(public.wf_viator_bookings.gross_booking_value, v_gross)
        end,
        estimated_commission = case
          when (v_is_newer_or_equal and v_status in ('cancelled', 'rejected'))
               or (not v_is_newer_or_equal and public.wf_viator_bookings.status in ('cancelled', 'rejected'))
            then 0.00
          when v_gross_changed_without_commission
            then null
          when v_is_newer_or_equal and v_estimated is not null
            then v_estimated
          else coalesce(public.wf_viator_bookings.estimated_commission, v_estimated)
        end,
        confirmed_commission = case
          when (v_is_newer_or_equal and v_status in ('cancelled', 'rejected'))
               or (not v_is_newer_or_equal and public.wf_viator_bookings.status in ('cancelled', 'rejected'))
            then 0.00
          when v_gross_changed_without_commission
            then null
          when v_is_newer_or_equal and v_confirmed is not null
            then v_confirmed
          else coalesce(public.wf_viator_bookings.confirmed_commission, v_confirmed)
        end,
        paid_commission = case
          when v_is_newer_or_equal and v_paid is not null
            then v_paid
          else coalesce(public.wf_viator_bookings.paid_commission, v_paid)
        end,
        currency = case
          when v_is_newer_or_equal and v_currency is not null then v_currency
          else coalesce(public.wf_viator_bookings.currency, v_currency)
        end,
        amendment_count = public.wf_viator_bookings.amendment_count +
          (case when v_event_type = 'AMENDED' and v_row_count > 0 then 1 else 0 end),
        original_booking_at = v_effective_orig_at,
        transaction_at = case
          when public.wf_viator_bookings.transaction_at is not null and v_tx_at is not null
            then least(public.wf_viator_bookings.transaction_at, v_tx_at)
          else coalesce(public.wf_viator_bookings.transaction_at, v_tx_at)
        end,
        provider_modified_at = case
          when public.wf_viator_bookings.provider_modified_at is not null and v_mod_at is not null
            then greatest(public.wf_viator_bookings.provider_modified_at, v_mod_at)
          else coalesce(public.wf_viator_bookings.provider_modified_at, v_mod_at)
        end,
        acknowledge_by = coalesce(v_ack_by, public.wf_viator_bookings.acknowledge_by),
        cancellation_at = coalesce(v_cancel_at, public.wf_viator_bookings.cancellation_at),
        reconciled_at = p_synced_at
      where booking_ref = v_booking_ref
      returning * into v_current;
    end if;

    -- 5. Maintain Google Ads offline conversion upload ledger for matched bookings.
    --    STRICT FINANCIAL INVARIANT: Never substitute gross_booking_value for
    --    missing commission! If commission is NULL on an active booking, keep
    --    conversion_value = NULL, value_basis = 'commission_unknown', and hold
    --    in 'ineligible_missing_commission'.
    if v_current.attribution_status = 'matched' and v_current.status not in ('unrecognized', 'unknown', 'pending') then
      if v_current.status in ('cancelled', 'rejected') then
        v_conv_val := 0.00;
        v_val_basis := 'cancelled_restatement_zero';
      elsif v_current.confirmed_commission is not null then
        v_conv_val := v_current.confirmed_commission;
        v_val_basis := 'confirmed_commission';
      elsif v_current.estimated_commission is not null then
        v_conv_val := v_current.estimated_commission;
        v_val_basis := 'estimated_commission';
      else
        v_conv_val := null;
        v_val_basis := 'commission_unknown';
      end if;

      if v_current.gclid is null and v_current.gbraid is null and v_current.wbraid is null
         and (not v_has_click or (v_click.gclid is null and v_click.gbraid is null and v_click.wbraid is null))
         and v_current.redacted_at is null then
        v_elig_status := 'ineligible_missing_click_id';
      elsif coalesce(v_current.consent_ad_user_data, 'UNKNOWN') <> 'GRANTED' then
        v_elig_status := 'ineligible_missing_consent';
      elsif v_current.status in ('confirmed', 'amended') and v_conv_val is null then
        v_elig_status := 'ineligible_missing_commission';
      elsif v_current.status in ('confirmed', 'amended') and v_current.currency is null then
        v_elig_status := 'ineligible_missing_currency';
      else
        v_elig_status := 'awaiting_upload';
      end if;

      select * into v_initial_upload
        from public.wf_google_conversion_uploads
        where booking_ref = v_booking_ref and upload_kind = 'initial_booking'
        for update;
      v_has_initial_upload := found;

      if v_current.status in ('confirmed', 'amended') then
        if not v_has_initial_upload then
          insert into public.wf_google_conversion_uploads (
            booking_ref, transaction_id, upload_kind, upload_status,
            adjustment_state, validate_only,
            observed_utm_campaign, verified_google_campaign_id,
            campaign_verification_status, google_campaign_id,
            conversion_value, value_basis, currency, created_at, updated_at
          ) values (
            v_booking_ref, v_booking_ref, 'initial_booking', v_elig_status,
            'none', true,
            v_current.observed_utm_campaign, v_current.verified_google_campaign_id,
            v_current.campaign_verification_status, v_current.google_campaign_id,
            v_conv_val, v_val_basis, v_current.currency, p_synced_at, p_synced_at
          );
        elsif v_initial_upload.upload_status in (
          'awaiting_upload',
          'validated_only',
          'ineligible_missing_commission',
          'ineligible_missing_currency',
          'ineligible_missing_click_id',
          'ineligible_missing_consent'
        ) then
          -- Update before live upload updates the single initial_booking record in place
          -- (never creating a duplicate conversion, and promoting a previously
          -- commission-missing record to awaiting_upload once commission arrives).
          update public.wf_google_conversion_uploads set
            upload_status = case
              when v_initial_upload.upload_status = 'validated_only'
                   and v_elig_status = 'awaiting_upload'
                   and v_initial_upload.conversion_value is not distinct from v_conv_val
                   and v_initial_upload.currency is not distinct from v_current.currency
                then 'validated_only'
              else v_elig_status
            end,
            conversion_value = v_conv_val,
            value_basis = v_val_basis,
            currency = v_current.currency,
            observed_utm_campaign = coalesce(v_current.observed_utm_campaign, observed_utm_campaign),
            verified_google_campaign_id = coalesce(v_current.verified_google_campaign_id, verified_google_campaign_id),
            campaign_verification_status = v_current.campaign_verification_status,
            google_campaign_id = coalesce(v_current.google_campaign_id, google_campaign_id),
            updated_at = p_synced_at
          where id = v_initial_upload.id;
        elsif v_initial_upload.upload_status in ('in_flight', 'timed_out_indeterminate', 'submitted', 'accepted')
              and (v_event_type = 'AMENDED' or v_current.status = 'amended') then
          insert into public.wf_google_conversion_uploads (
            booking_ref, transaction_id, upload_kind, upload_status,
            adjustment_state, validate_only,
            observed_utm_campaign, verified_google_campaign_id,
            campaign_verification_status, google_campaign_id,
            conversion_value, value_basis, currency, created_at, updated_at
          ) values (
            v_booking_ref, v_booking_ref, 'amendment_restatement', v_elig_status,
            'pending_restatement', true,
            v_current.observed_utm_campaign, v_current.verified_google_campaign_id,
            v_current.campaign_verification_status, v_current.google_campaign_id,
            v_conv_val, v_val_basis, v_current.currency, p_synced_at, p_synced_at
          )
          on conflict (booking_ref, upload_kind) do update set
            conversion_value = excluded.conversion_value,
            value_basis = excluded.value_basis,
            currency = excluded.currency,
            upload_status = excluded.upload_status,
            adjustment_state = 'pending_restatement',
            updated_at = excluded.updated_at;
        end if;
      elsif v_current.status in ('cancelled', 'rejected') then
        if not v_has_initial_upload then
          insert into public.wf_google_conversion_uploads (
            booking_ref, transaction_id, upload_kind, upload_status,
            adjustment_state, validate_only,
            observed_utm_campaign, verified_google_campaign_id,
            campaign_verification_status, google_campaign_id,
            conversion_value, value_basis, currency, retraction_required,
            created_at, updated_at
          ) values (
            v_booking_ref, v_booking_ref, 'initial_booking', 'cancelled_before_upload',
            'none', true,
            v_current.observed_utm_campaign, v_current.verified_google_campaign_id,
            v_current.campaign_verification_status, v_current.google_campaign_id,
            0.00, 'cancelled_restatement_zero', v_current.currency, false,
            p_synced_at, p_synced_at
          );
        elsif v_initial_upload.upload_status in (
          'awaiting_upload',
          'validated_only',
          'ineligible_missing_click_id',
          'ineligible_missing_consent',
          'ineligible_missing_commission',
          'ineligible_missing_currency',
          'rejected'
        ) then
          update public.wf_google_conversion_uploads set
            upload_status = 'cancelled_before_upload',
            conversion_value = 0.00,
            value_basis = 'cancelled_restatement_zero',
            adjustment_state = 'none',
            retraction_required = false,
            updated_at = p_synced_at
          where id = v_initial_upload.id;
        elsif v_initial_upload.upload_status in ('in_flight', 'timed_out_indeterminate', 'submitted', 'accepted') then
          update public.wf_google_conversion_uploads set
            adjustment_state = 'pending_retraction',
            retraction_required = true,
            updated_at = p_synced_at
          where id = v_initial_upload.id;

          insert into public.wf_google_conversion_uploads (
            booking_ref, transaction_id, upload_kind, upload_status,
            adjustment_state, validate_only,
            observed_utm_campaign, verified_google_campaign_id,
            campaign_verification_status, google_campaign_id,
            conversion_value, value_basis, currency, retraction_required,
            created_at, updated_at
          ) values (
            v_booking_ref, v_booking_ref, 'cancellation_restatement', v_elig_status,
            'pending_retraction', true,
            v_current.observed_utm_campaign, v_current.verified_google_campaign_id,
            v_current.campaign_verification_status, v_current.google_campaign_id,
            0.00, 'cancelled_restatement_zero', v_current.currency, true,
            p_synced_at, p_synced_at
          )
          on conflict (booking_ref, upload_kind) do update set
            upload_status = excluded.upload_status,
            conversion_value = 0.00,
            value_basis = 'cancelled_restatement_zero',
            adjustment_state = 'pending_retraction',
            retraction_required = true,
            updated_at = excluded.updated_at;
        end if;
      end if;
    end if;
  end loop;

  -- 6. Advance cursor and monotonic watermark only after all events in this
  --    batch are reconciled.
  update public.wf_viator_sync_state set
    next_cursor = coalesce(p_next_cursor, next_cursor),
    modified_since_watermark = greatest(
      modified_since_watermark,
      coalesce(p_watermark, modified_since_watermark)
    ),
    last_synced_at = p_synced_at,
    last_attempt_at = p_synced_at,
    last_error = null
  where id = 1;

  return jsonb_build_object(
    'ok', true,
    'sync_epoch', v_sync_state.sync_epoch,
    'events_inserted', v_events_inserted,
    'matched', v_matched,
    'unmatched_no_token', v_unmatched_no_token,
    'unmatched_unknown_token', v_unmatched_unknown,
    'unmatched_expired', v_unmatched_expired,
    'unmatched_missing_booking_timestamp', v_unmatched_missing_ts,
    'unrecognized_events', v_unrecognized_events
  );
end;
$$;

revoke all on function public.wf_viator_reconcile(jsonb, text, timestamptz, timestamptz, bigint, text)
  from public, anon, authenticated;
grant execute on function public.wf_viator_reconcile(jsonb, text, timestamptz, timestamptz, bigint, text)
  to service_role;

-- Phase 1 of Google conversion upload: claim row as `in_flight`, recover from
-- abandoned `in_flight` claims (> p_stale_in_flight_seconds), timeouts,
-- rejected submissions, and rollout `validated_only` rows, and abort if the
-- booking was cancelled before upload started.
create or replace function public.wf_google_begin_upload(
  p_upload_id bigint,
  p_now timestamptz default now(),
  p_stale_in_flight_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.wf_google_conversion_uploads%rowtype;
  v_b public.wf_viator_bookings%rowtype;
  v_stale_cutoff timestamptz;
  v_reclaimed_abandoned boolean := false;
begin
  select * into v_u
    from public.wf_google_conversion_uploads
    where id = p_upload_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'upload_not_found');
  end if;

  select * into v_b
    from public.wf_viator_bookings
    where booking_ref = v_u.booking_ref
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  if v_u.upload_kind = 'initial_booking' and v_b.status in ('cancelled', 'rejected') then
    update public.wf_google_conversion_uploads set
      upload_status = 'cancelled_before_upload',
      conversion_value = 0.00,
      value_basis = 'cancelled_restatement_zero',
      adjustment_state = 'none',
      retraction_required = false,
      updated_at = p_now
    where id = v_u.id;

    return jsonb_build_object(
      'ok', false,
      'upload_status', 'cancelled_before_upload',
      'reason', 'booking_cancelled_before_upload'
    );
  end if;

  if v_u.upload_kind in ('initial_booking', 'amendment_restatement')
     and (v_u.conversion_value is null or v_u.value_basis = 'commission_unknown') then
    update public.wf_google_conversion_uploads set
      upload_status = 'ineligible_missing_commission',
      updated_at = p_now
    where id = v_u.id;

    return jsonb_build_object(
      'ok', false,
      'upload_status', 'ineligible_missing_commission',
      'reason', 'missing_commission_value'
    );
  end if;

  v_stale_cutoff := p_now - make_interval(secs => greatest(30, coalesce(p_stale_in_flight_seconds, 300)));

  if v_u.upload_status = 'in_flight' then
    if v_u.in_flight_at is null or v_u.in_flight_at <= v_stale_cutoff then
      v_reclaimed_abandoned := true;
    else
      return jsonb_build_object(
        'ok', false,
        'upload_status', v_u.upload_status,
        'reason', 'upload_in_flight_active'
      );
    end if;
  elsif v_u.upload_status not in (
    'awaiting_upload',
    'validated_only',
    'rejected',
    'timed_out_indeterminate'
  ) then
    return jsonb_build_object(
      'ok', false,
      'upload_status', v_u.upload_status,
      'reason', 'upload_not_claimable'
    );
  end if;

  update public.wf_google_conversion_uploads set
    upload_status = 'in_flight',
    in_flight_at = p_now,
    attempt_count = attempt_count + 1,
    updated_at = p_now
  where id = v_u.id
  returning * into v_u;

  return jsonb_build_object(
    'ok', true,
    'upload_id', v_u.id,
    'upload_kind', v_u.upload_kind,
    'upload_status', 'in_flight',
    'attempt_count', v_u.attempt_count,
    'reclaimed_abandoned', v_reclaimed_abandoned,
    'booking', row_to_json(v_b)::jsonb
  );
end;
$$;

revoke all on function public.wf_google_begin_upload(bigint, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.wf_google_begin_upload(bigint, timestamptz, integer)
  to service_role;

-- Phase 2 of Google conversion upload: finalize outcome and re-check whether a
-- concurrent CANCELLATION or AMENDMENT arrived while the upload was in flight.
create or replace function public.wf_google_finalize_upload(
  p_upload_id bigint,
  p_outcome_status text,
  p_validate_only boolean default true,
  p_request_id text default null,
  p_http_status integer default null,
  p_conversion_value numeric(12, 2) default null,
  p_value_basis text default 'commission_unknown',
  p_adjustment_state text default 'none',
  p_retraction_required boolean default false,
  p_payload jsonb default null,
  p_response_summary jsonb default null,
  p_error text default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.wf_google_conversion_uploads%rowtype;
  v_b public.wf_viator_bookings%rowtype;
  v_queued_correction text := null;
  v_amended_val numeric(12, 2);
  v_amended_basis text;
  v_amended_status text;
begin
  select * into v_u
    from public.wf_google_conversion_uploads
    where id = p_upload_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'upload_not_found');
  end if;

  select * into v_b
    from public.wf_viator_bookings
    where booking_ref = v_u.booking_ref
    for update;

  update public.wf_google_conversion_uploads set
    upload_status = p_outcome_status,
    validate_only = coalesce(p_validate_only, true),
    request_id = coalesce(p_request_id, request_id),
    http_status = coalesce(p_http_status, http_status),
    conversion_value = case
      when p_conversion_value is not null then p_conversion_value
      else conversion_value
    end,
    value_basis = coalesce(p_value_basis, value_basis),
    adjustment_state = coalesce(p_adjustment_state, adjustment_state),
    retraction_required = coalesce(p_retraction_required, retraction_required),
    request_payload = coalesce(p_payload, request_payload),
    response_summary = coalesce(p_response_summary, response_summary),
    last_error = p_error,
    submitted_at = case
      when p_outcome_status in ('submitted', 'accepted') and coalesce(p_validate_only, true) is false
        then coalesce(submitted_at, p_now)
      else submitted_at
    end,
    updated_at = p_now
  where id = v_u.id
  returning * into v_u;

  -- If a cancellation retraction or restatement just succeeded, mirror its
  -- adjustment_state onto the parent initial_booking row so audit queries see
  -- that the initial upload has been retracted or zero-restated.
  if v_u.upload_kind = 'cancellation_restatement'
     and p_outcome_status in ('submitted', 'accepted')
     and coalesce(p_validate_only, true) is false then
    update public.wf_google_conversion_uploads set
      adjustment_state = p_adjustment_state,
      retraction_required = p_retraction_required,
      updated_at = p_now
    where booking_ref = v_u.booking_ref
      and upload_kind = 'initial_booking';
  end if;

  -- Race guard: if `initial_booking` was in flight (or timed out indeterminately)
  -- and the booking was cancelled or amended while the HTTP call was running,
  -- immediately ensure the post-submission correction row is queued (`awaiting_upload`).
  if v_u.upload_kind = 'initial_booking'
     and (
       (p_outcome_status in ('submitted', 'accepted') and coalesce(p_validate_only, true) is false)
       or p_outcome_status = 'timed_out_indeterminate'
     ) then
    if v_b.status in ('cancelled', 'rejected') then
      update public.wf_google_conversion_uploads set
        adjustment_state = 'pending_retraction',
        retraction_required = true,
        updated_at = p_now
      where id = v_u.id;

      insert into public.wf_google_conversion_uploads (
        booking_ref, transaction_id, upload_kind, upload_status,
        adjustment_state, validate_only,
        observed_utm_campaign, verified_google_campaign_id,
        campaign_verification_status, google_campaign_id,
        conversion_value, value_basis, currency, retraction_required,
        created_at, updated_at
      ) values (
        v_b.booking_ref, v_b.booking_ref, 'cancellation_restatement', 'awaiting_upload',
        'pending_retraction', false,
        v_b.observed_utm_campaign, v_b.verified_google_campaign_id,
        v_b.campaign_verification_status, v_b.google_campaign_id,
        0.00, 'cancelled_restatement_zero', v_b.currency, true,
        p_now, p_now
      )
      on conflict (booking_ref, upload_kind) do update set
        upload_status = case
          when public.wf_google_conversion_uploads.upload_status in ('submitted', 'accepted')
            then public.wf_google_conversion_uploads.upload_status
          else 'awaiting_upload'
        end,
        conversion_value = 0.00,
        value_basis = 'cancelled_restatement_zero',
        adjustment_state = 'pending_retraction',
        retraction_required = true,
        updated_at = p_now;

      v_queued_correction := 'cancellation_restatement';
    elsif v_b.status = 'amended' then
      -- Never fall back to gross_booking_value for commission restatements.
      v_amended_val := coalesce(v_b.confirmed_commission, v_b.estimated_commission);
      v_amended_basis := case
        when v_b.confirmed_commission is not null then 'confirmed_commission'
        when v_b.estimated_commission is not null then 'estimated_commission'
        else 'commission_unknown'
      end;
      v_amended_status := case
        when v_amended_val is null then 'ineligible_missing_commission'
        when v_b.currency is null then 'ineligible_missing_currency'
        else 'awaiting_upload'
      end;

      if v_amended_val is distinct from v_u.conversion_value then
        insert into public.wf_google_conversion_uploads (
          booking_ref, transaction_id, upload_kind, upload_status,
          adjustment_state, validate_only,
          observed_utm_campaign, verified_google_campaign_id,
          campaign_verification_status, google_campaign_id,
          conversion_value, value_basis, currency, retraction_required,
          created_at, updated_at
        ) values (
          v_b.booking_ref, v_b.booking_ref, 'amendment_restatement', v_amended_status,
          'pending_restatement', false,
          v_b.observed_utm_campaign, v_b.verified_google_campaign_id,
          v_b.campaign_verification_status, v_b.google_campaign_id,
          v_amended_val, v_amended_basis, v_b.currency, false,
          p_now, p_now
        )
        on conflict (booking_ref, upload_kind) do update set
          upload_status = excluded.upload_status,
          conversion_value = excluded.conversion_value,
          value_basis = excluded.value_basis,
          currency = excluded.currency,
          adjustment_state = 'pending_restatement',
          updated_at = p_now;

        v_queued_correction := 'amendment_restatement';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'upload_id', v_u.id,
    'upload_status', v_u.upload_status,
    'attempt_count', v_u.attempt_count,
    'adjustment_state', v_u.adjustment_state,
    'retraction_required', v_u.retraction_required,
    'queued_correction', v_queued_correction
  );
end;
$$;

revoke all on function public.wf_google_finalize_upload(bigint, text, boolean, text, integer, numeric, text, text, boolean, jsonb, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.wf_google_finalize_upload(bigint, text, boolean, text, integer, numeric, text, text, boolean, jsonb, jsonb, text, timestamptz)
  to service_role;

-- Authoritative Google Ads campaign verification RPC: records verified campaign
-- attribution from Google Ads reporting separately from URL-captured utm_campaign.
create or replace function public.wf_viator_verify_campaign_attribution(
  p_booking_ref text,
  p_verified_campaign_id text,
  p_mark_upload_accepted boolean default true,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.wf_viator_bookings%rowtype;
  v_ver_status text;
begin
  if p_verified_campaign_id is null or p_verified_campaign_id !~ '^[0-9]{8,16}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_verified_campaign_id');
  end if;

  select * into v_b
    from public.wf_viator_bookings
    where booking_ref = p_booking_ref
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  v_ver_status := case
    when v_b.observed_utm_campaign is null or v_b.observed_utm_campaign = p_verified_campaign_id
      then 'verified'
    else 'mismatch'
  end;

  update public.wf_viator_bookings set
    verified_google_campaign_id = p_verified_campaign_id,
    campaign_metadata_provenance = 'google_ads_api_verified',
    campaign_verification_status = v_ver_status,
    google_campaign_id = p_verified_campaign_id,
    reconciled_at = p_now
  where booking_ref = p_booking_ref;

  if v_b.matched_click_token is not null then
    update public.wf_viator_clicks set
      verified_google_campaign_id = p_verified_campaign_id,
      campaign_metadata_provenance = 'google_ads_api_verified',
      campaign_verification_status = case
        when observed_utm_campaign is null or observed_utm_campaign = p_verified_campaign_id
          then 'verified'
        else 'mismatch'
      end,
      google_campaign_id = p_verified_campaign_id
    where click_token = v_b.matched_click_token;
  end if;

  update public.wf_google_conversion_uploads set
    verified_google_campaign_id = p_verified_campaign_id,
    campaign_verification_status = v_ver_status,
    google_campaign_id = p_verified_campaign_id,
    upload_status = case
      when p_mark_upload_accepted and upload_status = 'submitted' and validate_only is false
        then 'accepted'
      else upload_status
    end,
    accepted_at = case
      when p_mark_upload_accepted and upload_status = 'submitted' and validate_only is false
        then coalesce(accepted_at, p_now)
      else accepted_at
    end,
    updated_at = p_now
  where booking_ref = p_booking_ref;

  return jsonb_build_object(
    'ok', true,
    'booking_ref', p_booking_ref,
    'observed_utm_campaign', v_b.observed_utm_campaign,
    'verified_google_campaign_id', p_verified_campaign_id,
    'campaign_verification_status', v_ver_status
  );
end;
$$;

revoke all on function public.wf_viator_verify_campaign_attribution(text, text, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.wf_viator_verify_campaign_attribution(text, text, boolean, timestamptz)
  to service_role;

-- Redact raw click identifiers and JSONB snapshots past the 90-day retention
-- window across wf_viator_clicks, wf_viator_bookings, and
-- wf_google_conversion_uploads while keeping placement, campaign verification,
-- and financial audit history intact.
create or replace function public.wf_viator_redact_expired_clicks(
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redacted integer := 0;
begin
  update public.wf_viator_clicks set
    gclid = null,
    gbraid = null,
    wbraid = null,
    visitor_context_hash = null,
    session_attribution = null,
    first_touch_attribution = null,
    redacted_at = p_now
  where redact_after <= p_now
    and redacted_at is null;

  get diagnostics v_redacted = row_count;

  update public.wf_viator_bookings b set
    gclid = null,
    gbraid = null,
    wbraid = null,
    matched_client_click_id = null,
    redacted_at = p_now
  from public.wf_viator_clicks c
  where b.matched_click_token = c.click_token
    and c.redacted_at is not null
    and (
      b.gclid is not null
      or b.gbraid is not null
      or b.wbraid is not null
      or b.matched_client_click_id is not null
      or b.redacted_at is null
    );

  update public.wf_google_conversion_uploads u set
    request_payload = case
      when u.request_payload is null then null
      else (u.request_payload #- '{events,0,adIdentifiers}' #- '{conversionAdjustments,0,gclidDateTimePair}')
    end,
    response_summary = case
      when u.response_summary is null then null
      else (u.response_summary - 'gclid' - 'gbraid' - 'wbraid' - 'adIdentifiers')
    end,
    redacted_at = p_now
  from public.wf_viator_bookings b
  join public.wf_viator_clicks c on c.click_token = b.matched_click_token
  where u.booking_ref = b.booking_ref
    and c.redacted_at is not null
    and u.redacted_at is null;

  return v_redacted;
end;
$$;

revoke all on function public.wf_viator_redact_expired_clicks(timestamptz)
  from public, anon, authenticated;
grant execute on function public.wf_viator_redact_expired_clicks(timestamptz)
  to service_role;

-- Honest financial reporting view: strictly separates gross customer booking
-- value from Wayfind commission (keeping unknown commission visibly NULL
-- instead of 0.00 or gross_booking_value), counts active bookings with missing
-- commission, and separates unverified URL utm_campaign from verified Google
-- Ads campaign ID.
create or replace view public.wf_viator_financial_summary as
select
  attribution_status,
  observed_utm_campaign,
  verified_google_campaign_id,
  campaign_metadata_provenance,
  campaign_verification_status,
  google_campaign_id,
  matched_page_key,
  matched_surface,
  coalesce(matched_offer_id, product_code) as offer_id,
  currency,
  count(*) filter (where status not in ('unrecognized', 'unknown')) as gross_bookings_count,
  count(*) filter (where status in ('confirmed', 'amended')) as active_bookings_count,
  count(*) filter (where status in ('cancelled', 'rejected')) as cancelled_bookings_count,
  count(*) filter (
    where status in ('confirmed', 'amended')
      and estimated_commission is null
      and confirmed_commission is null
  ) as active_bookings_missing_commission_count,
  count(*) filter (where needs_investigation is true or status in ('unrecognized', 'unknown')) as investigation_required_count,
  (sum(gross_booking_value) filter (where status in ('confirmed', 'amended')))::numeric(12, 2) as active_gross_booking_value,
  (sum(estimated_commission) filter (where status in ('confirmed', 'amended')))::numeric(12, 2) as active_estimated_commission,
  (sum(confirmed_commission) filter (where status in ('confirmed', 'amended')))::numeric(12, 2) as active_confirmed_commission,
  (sum(paid_commission))::numeric(12, 2) as total_paid_commission
from public.wf_viator_bookings
group by
  attribution_status,
  observed_utm_campaign,
  verified_google_campaign_id,
  campaign_metadata_provenance,
  campaign_verification_status,
  google_campaign_id,
  matched_page_key,
  matched_surface,
  coalesce(matched_offer_id, product_code),
  currency;

revoke all on public.wf_viator_financial_summary from public, anon, authenticated;
grant select on public.wf_viator_financial_summary to service_role;
