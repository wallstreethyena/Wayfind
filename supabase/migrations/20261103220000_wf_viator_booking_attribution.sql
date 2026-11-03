-- 20261103220000_wf_viator_booking_attribution.sql
-- End-to-end Viator per-click opaque attribution mapping, immutable booking
-- event history, current booking state reconciliation, strict 4-way financial
-- separation, and Google Ads Data Manager offline conversion upload ledger.

create table if not exists public.wf_viator_clicks (
  click_token text primary key
    check (click_token ~ '^wfv_[0-9a-f]{32}$'),
  client_click_id text
    check (client_click_id is null or client_click_id ~ '^[A-Za-z0-9_-]{4,80}$'),
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

create table if not exists public.wf_viator_sync_state (
  id integer primary key default 1
    check (id = 1),
  next_cursor text,
  modified_since_watermark timestamptz not null default (now() - interval '24 hours'),
  last_synced_at timestamptz,
  last_attempt_at timestamptz,
  last_error text
);

insert into public.wf_viator_sync_state (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.wf_viator_booking_events (
  event_key text primary key,
  booking_ref text not null
    check (char_length(booking_ref) between 1 and 120),
  event_type text not null
    check (event_type in ('CONFIRMED', 'AMENDED', 'CANCELLED', 'REJECTED', 'PENDING', 'UNKNOWN')),
  status text not null
    check (status in ('confirmed', 'amended', 'cancelled', 'rejected', 'pending', 'unknown')),
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
  currency text not null default 'USD'
    check (currency ~ '^[A-Z]{3}$'),
  transaction_at timestamptz not null,
  provider_modified_at timestamptz not null,
  cancellation_at timestamptz,
  raw_summary jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now()
);

create index if not exists wf_viator_booking_events_ref_idx
  on public.wf_viator_booking_events (booking_ref, provider_modified_at desc);

create table if not exists public.wf_viator_bookings (
  booking_ref text primary key
    check (char_length(booking_ref) between 1 and 120),
  status text not null
    check (status in ('confirmed', 'amended', 'cancelled', 'rejected', 'pending', 'unknown')),
  last_event_type text not null
    check (last_event_type in ('CONFIRMED', 'AMENDED', 'CANCELLED', 'REJECTED', 'PENDING', 'UNKNOWN')),
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
      'unmatched_expired'
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
  currency text not null default 'USD'
    check (currency ~ '^[A-Z]{3}$'),
  amendment_count integer not null default 0
    check (amendment_count >= 0),
  transaction_at timestamptz not null,
  provider_modified_at timestamptz not null,
  cancellation_at timestamptz,
  reconciled_at timestamptz not null default now()
);

create index if not exists wf_viator_bookings_status_idx
  on public.wf_viator_bookings (attribution_status, status, transaction_at desc);

create index if not exists wf_viator_bookings_campaign_idx
  on public.wf_viator_bookings (google_campaign_id, status)
  where google_campaign_id is not null;

create table if not exists public.wf_google_conversion_uploads (
  id bigserial primary key,
  booking_ref text not null references public.wf_viator_bookings (booking_ref) on delete cascade,
  transaction_id text not null,
  upload_kind text not null
    check (upload_kind in ('initial_booking', 'amendment_restatement', 'cancellation_restatement')),
  upload_status text not null
    check (upload_status in (
      'awaiting_upload',
      'validated_only',
      'submitted',
      'accepted',
      'rejected',
      'ineligible_missing_click_id',
      'ineligible_missing_consent',
      'cancelled_before_upload'
    )),
  validate_only boolean not null default true,
  google_campaign_id text,
  conversion_value numeric(12, 2) not null default 0
    check (conversion_value >= 0),
  value_basis text not null default 'none'
    check (value_basis in (
      'confirmed_commission',
      'estimated_commission',
      'gross_booking_value',
      'cancelled_restatement_zero',
      'zero_unreported',
      'none'
    )),
  currency text not null default 'USD'
    check (currency ~ '^[A-Z]{3}$'),
  retraction_required boolean not null default false,
  request_id text,
  last_error text,
  response_summary jsonb,
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

-- Reconcile a page of normalized Viator booking events and advance the sync
-- cursor atomically inside the same transaction.
create or replace function public.wf_viator_reconcile(
  p_events jsonb default '[]'::jsonb,
  p_next_cursor text default null,
  p_watermark timestamptz default null,
  p_synced_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_event_key text;
  v_booking_ref text;
  v_event_type text;
  v_status text;
  v_product_code text;
  v_campaign_value text;
  v_click_token text;
  v_placement_campaign text;
  v_gross numeric(12, 2);
  v_estimated numeric(12, 2);
  v_confirmed numeric(12, 2);
  v_paid numeric(12, 2);
  v_currency text;
  v_tx_at timestamptz;
  v_mod_at timestamptz;
  v_cancel_at timestamptz;
  v_click public.wf_viator_clicks%rowtype;
  v_attr_status text;
  v_existing public.wf_viator_bookings%rowtype;
  v_initial_upload public.wf_google_conversion_uploads%rowtype;
  v_conv_val numeric(12, 2);
  v_val_basis text;
  v_elig_status text;
  v_row_count integer;
  v_events_inserted integer := 0;
  v_matched integer := 0;
  v_unmatched_no_token integer := 0;
  v_unmatched_unknown integer := 0;
  v_unmatched_expired integer := 0;
begin
  -- Serialize concurrent Viator reconciliation runs.
  perform pg_advisory_xact_lock(24380159401);

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'events_not_array');
  end if;

  for v_item in select value from jsonb_array_elements(p_events) loop
    v_event_key := nullif(trim(coalesce(v_item->>'event_key', '')), '');
    v_booking_ref := nullif(trim(coalesce(v_item->>'booking_ref', '')), '');
    if v_event_key is null or v_booking_ref is null then
      continue;
    end if;

    v_event_type := coalesce(nullif(trim(v_item->>'event_type'), ''), 'UNKNOWN');
    v_status := coalesce(nullif(trim(v_item->>'status'), ''), 'unknown');
    v_product_code := nullif(trim(coalesce(v_item->>'product_code', '')), '');
    v_campaign_value := nullif(trim(coalesce(v_item->>'campaign_value', '')), '');
    v_click_token := nullif(trim(coalesce(v_item->>'click_token', '')), '');
    v_placement_campaign := nullif(trim(coalesce(v_item->>'placement_campaign', '')), '');
    v_gross := (v_item->>'gross_booking_value')::numeric(12, 2);
    v_estimated := (v_item->>'estimated_commission')::numeric(12, 2);
    v_confirmed := (v_item->>'confirmed_commission')::numeric(12, 2);
    v_paid := (v_item->>'paid_commission')::numeric(12, 2);
    v_currency := upper(coalesce(nullif(trim(v_item->>'currency'), ''), 'USD'));
    v_tx_at := coalesce((v_item->>'transaction_at')::timestamptz, p_synced_at);
    v_mod_at := coalesce((v_item->>'provider_modified_at')::timestamptz, v_tx_at);
    v_cancel_at := (v_item->>'cancellation_at')::timestamptz;

    -- 1. Append immutable booking event history (idempotent on event_key).
    insert into public.wf_viator_booking_events (
      event_key, booking_ref, event_type, status, product_code,
      campaign_value, click_token, placement_campaign,
      gross_booking_value, estimated_commission, confirmed_commission, paid_commission,
      currency, transaction_at, provider_modified_at, cancellation_at,
      raw_summary, ingested_at
    ) values (
      v_event_key, v_booking_ref, v_event_type, v_status, v_product_code,
      v_campaign_value, v_click_token, v_placement_campaign,
      v_gross, v_estimated, v_confirmed, v_paid,
      v_currency, v_tx_at, v_mod_at, v_cancel_at,
      coalesce(v_item->'raw_summary', '{}'::jsonb), p_synced_at
    )
    on conflict (event_key) do nothing;

    get diagnostics v_row_count = row_count;
    v_events_inserted := v_events_inserted + v_row_count;

    -- 2. Resolve exact click token against public.wf_viator_clicks.
    v_click := null;
    if v_click_token is null then
      v_attr_status := 'unmatched_no_token';
      v_unmatched_no_token := v_unmatched_no_token + 1;
    else
      select * into v_click
        from public.wf_viator_clicks
        where click_token = v_click_token;

      if not found then
        v_attr_status := 'unmatched_unknown_token';
        v_unmatched_unknown := v_unmatched_unknown + 1;
      elsif v_tx_at > v_click.expires_at then
        v_attr_status := 'unmatched_expired';
        v_unmatched_expired := v_unmatched_expired + 1;
      else
        v_attr_status := 'matched';
        v_matched := v_matched + 1;
      end if;
    end if;

    -- 3. Upsert current booking state in public.wf_viator_bookings.
    select * into v_existing
      from public.wf_viator_bookings
      where booking_ref = v_booking_ref;

    if not found then
      insert into public.wf_viator_bookings (
        booking_ref, status, last_event_type, product_code,
        campaign_value, click_token, placement_campaign,
        attribution_status, matched_click_token, matched_client_click_id,
        matched_offer_id, matched_page_key, matched_surface, matched_content_id,
        gclid, gbraid, wbraid, google_campaign_id,
        consent_ad_user_data, consent_ad_personalization,
        gross_booking_value, estimated_commission, confirmed_commission, paid_commission,
        currency, amendment_count, transaction_at, provider_modified_at,
        cancellation_at, reconciled_at
      ) values (
        v_booking_ref, v_status, v_event_type, v_product_code,
        v_campaign_value, v_click_token, coalesce(v_click.placement_campaign, v_placement_campaign),
        v_attr_status,
        case when v_attr_status = 'matched' then v_click.click_token else null end,
        case when v_attr_status = 'matched' then v_click.client_click_id else null end,
        case when v_attr_status = 'matched' then v_click.offer_id else v_product_code end,
        case when v_attr_status = 'matched' then v_click.page_key else null end,
        case when v_attr_status = 'matched' then v_click.surface else null end,
        case when v_attr_status = 'matched' then v_click.content_id else null end,
        case when v_attr_status = 'matched' then v_click.gclid else null end,
        case when v_attr_status = 'matched' then v_click.gbraid else null end,
        case when v_attr_status = 'matched' then v_click.wbraid else null end,
        case when v_attr_status = 'matched' then v_click.google_campaign_id else null end,
        case when v_attr_status = 'matched' then v_click.consent_ad_user_data else null end,
        case when v_attr_status = 'matched' then v_click.consent_ad_personalization else null end,
        v_gross, v_estimated, v_confirmed, v_paid,
        v_currency,
        case when v_event_type = 'AMENDED' then 1 else 0 end,
        v_tx_at, v_mod_at, v_cancel_at, p_synced_at
      );
    elsif v_mod_at >= v_existing.provider_modified_at then
      update public.wf_viator_bookings set
        status = v_status,
        last_event_type = v_event_type,
        product_code = coalesce(v_product_code, public.wf_viator_bookings.product_code),
        campaign_value = coalesce(v_campaign_value, public.wf_viator_bookings.campaign_value),
        click_token = coalesce(v_click_token, public.wf_viator_bookings.click_token),
        gross_booking_value = case
          when v_gross is not null then v_gross
          else public.wf_viator_bookings.gross_booking_value
        end,
        estimated_commission = case
          when v_status in ('cancelled', 'rejected') then 0.00
          when v_estimated is not null then v_estimated
          else public.wf_viator_bookings.estimated_commission
        end,
        confirmed_commission = case
          when v_status in ('cancelled', 'rejected') then 0.00
          when v_confirmed is not null then v_confirmed
          else public.wf_viator_bookings.confirmed_commission
        end,
        paid_commission = coalesce(v_paid, public.wf_viator_bookings.paid_commission),
        currency = v_currency,
        amendment_count = public.wf_viator_bookings.amendment_count +
          (case when v_event_type = 'AMENDED' and v_row_count > 0 then 1 else 0 end),
        provider_modified_at = v_mod_at,
        cancellation_at = coalesce(v_cancel_at, public.wf_viator_bookings.cancellation_at),
        reconciled_at = p_synced_at
      where booking_ref = v_booking_ref;
    end if;

    -- 4. Maintain Google Ads offline conversion upload ledger for matched bookings.
    if v_attr_status = 'matched' then
      if v_confirmed is not null then
        v_conv_val := v_confirmed;
        v_val_basis := 'confirmed_commission';
      elsif v_estimated is not null then
        v_conv_val := v_estimated;
        v_val_basis := 'estimated_commission';
      elsif v_gross is not null then
        v_conv_val := v_gross;
        v_val_basis := 'gross_booking_value';
      else
        v_conv_val := 0.00;
        v_val_basis := 'zero_unreported';
      end if;

      if v_click.gclid is null and v_click.gbraid is null and v_click.wbraid is null then
        v_elig_status := 'ineligible_missing_click_id';
      elsif v_click.consent_ad_user_data <> 'GRANTED' then
        v_elig_status := 'ineligible_missing_consent';
      else
        v_elig_status := 'awaiting_upload';
      end if;

      select * into v_initial_upload
        from public.wf_google_conversion_uploads
        where booking_ref = v_booking_ref and upload_kind = 'initial_booking';

      if v_status in ('confirmed', 'amended') then
        if not found then
          insert into public.wf_google_conversion_uploads (
            booking_ref, transaction_id, upload_kind, upload_status,
            validate_only, google_campaign_id, conversion_value, value_basis,
            currency, created_at, updated_at
          ) values (
            v_booking_ref, v_booking_ref, 'initial_booking', v_elig_status,
            true, v_click.google_campaign_id, v_conv_val, v_val_basis,
            v_currency, p_synced_at, p_synced_at
          );
        elsif v_initial_upload.upload_status in ('awaiting_upload', 'validated_only') then
          -- Amendment before live upload updates the single initial_booking record in place
          -- (never creating a duplicate conversion).
          update public.wf_google_conversion_uploads set
            conversion_value = v_conv_val,
            value_basis = v_val_basis,
            currency = v_currency,
            updated_at = p_synced_at
          where id = v_initial_upload.id;
        elsif v_initial_upload.upload_status in ('submitted', 'accepted') and v_event_type = 'AMENDED' then
          insert into public.wf_google_conversion_uploads (
            booking_ref, transaction_id, upload_kind, upload_status,
            validate_only, google_campaign_id, conversion_value, value_basis,
            currency, created_at, updated_at
          ) values (
            v_booking_ref, v_booking_ref, 'amendment_restatement', v_elig_status,
            true, v_click.google_campaign_id, v_conv_val, v_val_basis,
            v_currency, p_synced_at, p_synced_at
          )
          on conflict (booking_ref, upload_kind) do update set
            conversion_value = excluded.conversion_value,
            value_basis = excluded.value_basis,
            upload_status = excluded.upload_status,
            updated_at = excluded.updated_at;
        end if;
      elsif v_status in ('cancelled', 'rejected') then
        if not found then
          insert into public.wf_google_conversion_uploads (
            booking_ref, transaction_id, upload_kind, upload_status,
            validate_only, google_campaign_id, conversion_value, value_basis,
            currency, retraction_required, created_at, updated_at
          ) values (
            v_booking_ref, v_booking_ref, 'initial_booking', 'cancelled_before_upload',
            true, v_click.google_campaign_id, 0.00, 'cancelled_restatement_zero',
            v_currency, false, p_synced_at, p_synced_at
          );
        elsif v_initial_upload.upload_status in ('awaiting_upload', 'validated_only', 'ineligible_missing_click_id', 'ineligible_missing_consent') then
          update public.wf_google_conversion_uploads set
            upload_status = 'cancelled_before_upload',
            conversion_value = 0.00,
            value_basis = 'cancelled_restatement_zero',
            updated_at = p_synced_at
          where id = v_initial_upload.id;
        elsif v_initial_upload.upload_status in ('submitted', 'accepted') then
          insert into public.wf_google_conversion_uploads (
            booking_ref, transaction_id, upload_kind, upload_status,
            validate_only, google_campaign_id, conversion_value, value_basis,
            currency, retraction_required, created_at, updated_at
          ) values (
            v_booking_ref, v_booking_ref, 'cancellation_restatement', v_elig_status,
            true, v_click.google_campaign_id, 0.00, 'cancelled_restatement_zero',
            v_currency, true, p_synced_at, p_synced_at
          )
          on conflict (booking_ref, upload_kind) do update set
            conversion_value = 0.00,
            value_basis = 'cancelled_restatement_zero',
            retraction_required = true,
            updated_at = excluded.updated_at;
        end if;
      end if;
    end if;
  end loop;

  -- 5. Advance cursor and watermark only after all events in this batch are reconciled.
  update public.wf_viator_sync_state set
    next_cursor = coalesce(p_next_cursor, next_cursor),
    modified_since_watermark = coalesce(p_watermark, modified_since_watermark),
    last_synced_at = p_synced_at,
    last_attempt_at = p_synced_at,
    last_error = null
  where id = 1;

  return jsonb_build_object(
    'ok', true,
    'events_inserted', v_events_inserted,
    'matched', v_matched,
    'unmatched_no_token', v_unmatched_no_token,
    'unmatched_unknown_token', v_unmatched_unknown,
    'unmatched_expired', v_unmatched_expired
  );
end;
$$;

revoke all on function public.wf_viator_reconcile(jsonb, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.wf_viator_reconcile(jsonb, text, timestamptz, timestamptz)
  to service_role;

-- Redact raw click identifiers past the 90-day retention window while keeping
-- placement and campaign aggregates intact.
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
    session_attribution = null,
    first_touch_attribution = null,
    redacted_at = p_now
  where redact_after <= p_now
    and redacted_at is null;

  get diagnostics v_redacted = row_count;

  update public.wf_viator_bookings b set
    gclid = null,
    gbraid = null,
    wbraid = null
  from public.wf_viator_clicks c
  where b.matched_click_token = c.click_token
    and c.redacted_at is not null
    and (b.gclid is not null or b.gbraid is not null or b.wbraid is not null);

  return v_redacted;
end;
$$;

revoke all on function public.wf_viator_redact_expired_clicks(timestamptz)
  from public, anon, authenticated;
grant execute on function public.wf_viator_redact_expired_clicks(timestamptz)
  to service_role;

-- Honest financial reporting view: strictly separates gross bookings, active
-- non-cancelled bookings, cancelled bookings, customer spend
-- (gross_booking_value), estimated_commission, confirmed_commission, and
-- paid_commission.
create or replace view public.wf_viator_financial_summary as
select
  attribution_status,
  google_campaign_id,
  matched_page_key,
  matched_surface,
  coalesce(matched_offer_id, product_code) as offer_id,
  currency,
  count(*) as gross_bookings_count,
  count(*) filter (where status in ('confirmed', 'amended')) as active_bookings_count,
  count(*) filter (where status in ('cancelled', 'rejected')) as cancelled_bookings_count,
  coalesce(sum(gross_booking_value) filter (where status in ('confirmed', 'amended')), 0.00)::numeric(12, 2) as active_gross_booking_value,
  coalesce(sum(estimated_commission) filter (where status in ('confirmed', 'amended')), 0.00)::numeric(12, 2) as active_estimated_commission,
  coalesce(sum(confirmed_commission) filter (where status in ('confirmed', 'amended')), 0.00)::numeric(12, 2) as active_confirmed_commission,
  coalesce(sum(paid_commission), 0.00)::numeric(12, 2) as total_paid_commission
from public.wf_viator_bookings
group by
  attribution_status,
  google_campaign_id,
  matched_page_key,
  matched_surface,
  coalesce(matched_offer_id, product_code),
  currency;

revoke all on public.wf_viator_financial_summary from public, anon, authenticated;
grant select on public.wf_viator_financial_summary to service_role;
