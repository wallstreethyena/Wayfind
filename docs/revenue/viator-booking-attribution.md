# Viator Booking Attribution, Financial Reconciliation & Google Ads Offline Conversion Pipeline

## 1. Reconciled Baseline, Production Deployments & Live Measurement Evidence

| Item | Verified Value & Provenance |
|---|---|
| Historical Audit Reference | `9d6caeea427efa003be82cfcf7462dfc4a14d172` |
| Initial PR Implementation Base (`origin/main`) | `439d11573889a6163bf165ebbf35b46cc2de4cc4` |
| Canonical Production Domain (`https://www.gowayfind.com`) | Served by Vercel project `wayfind` (`prj_Mwt0CfPmiqW7gBedVlvznVpgW8sp`). `https://gowayfind.com/` returns `308 Permanent Redirect` to `https://www.gowayfind.com/` (`x-vercel-id: cle1::...`). |
| Live Production Deployment on `wayfind` (at `2026-11-04T00:50:40Z`) | Vercel deployment `dpl_88tzMaZ1xwd4ibRWRsHvxqbyqEdP` (`https://wayfind-7d4ed1lxm-wayfind2.vercel.app`, GitHub deployment `7534760673`, state `success`), serving Git SHA `7a625d43b6b3220d5bc56b628f327fa9e63b77d4`. |
| Earlier `wayfind` Production Revisions Reconciled | `671f6fb11bcb5fd331ffa6823098d06e99776da2` was the prior `success` production deployment (`2026-11-03T18:55:24Z`, GitHub deployment `7532578257`); `93bda809ec3bea72ca4c7d7067c796d32ecc4d75` (`2026-11-03T19:08:50Z`, GitHub deployment `7532668104`) and `af3e3994...` were failed `Production – wayfind` builds that did not replace `671f6fb1...` until `7a625d43...` succeeded. |
| Secondary Project `wayfind-lab` | Separate Vercel project (`https://wayfind-lcwr1ixr1-wayfind2.vercel.app`, deployment `7535560670` on `09662b04...`, earlier `439d1157...`). Does **not** serve `gowayfind.com`. |
| Google Ads Account & Conversion Owner | `553-622-6713` (`5536226713`, account name `Wayfind`, verified advertiser `WAYFIND LLC`, Tag ID `AW-18342267447`, Conversion Owner: `553-622-6713`). Non-Wayfind account `505-826-0233` and tag `AW-18092784888` (`jt9fCM7R35wcEPj3rLND`) are explicitly rejected by `validateBookingConversionDestination`. |
| Target Search Campaign (`24380159401`) | `WF \| Rock Springs Clear Kayak \| Search` (`campaignId=24380159401`, `ocid=8425026675`). Inspected in Google Ads UI at `2026-10-20T02:36:59Z–02:40:38Z` across reporting window `Oct 1, 2026 – Oct 20, 2026`: created via Bulk Upload directly in `Paused` status with `$50.00` Campaign Total Budget (`Oct 20 – Oct 30, 2026`), `Maximize clicks` (`$0.25` max CPC limit), `Google Search Network only`, `0` impressions, and `$0.00` spend within the inspected `Oct 1 – Oct 20, 2026` window. |
| Live Outbound Click Conversion Action | `AW-18342267447/19gpCKCx8NccELeUo6pE` (`Outbound click`, Category: `Outbound click`, Source: `Website`, Status: `Primary`). |
| Live Sign-Up Conversion Action | `AW-18342267447/dXV1CJ2x8NccELeUo6pE` (`Sign-up`, Category: `Sign-up`, Source: `Website`, Status: `Primary`). |
| Viator Confirmed Booking Action (Target) | Dedicated **Secondary (Observation)** Offline Conversion Action (`GOOGLE_ADS_VIATOR_CONVERSION_ACTION_ID`) in account `553-622-6713`, excluded from effective bidding goals until live round-trip booking attribution, commission values, and cancellation adjustments are validated. Primary website labels (`19gpCKCx8NccELeUo6pE`, `dXV1CJ2x8NccELeUo6pE`) are blocked from receiving offline booking uploads. |

### Event Destinations & Deduplication vs. Google Ads Counting
- **`commerce_cta_clicked` Destinations:**
  - [`lib/analytics.js`](../../lib/analytics.js) classifies `commerce_cta_clicked` in tier `"analytics"`. In the code path (`forwardToGoogle`), tier `"analytics"` skips Google Ads (`report.ads = false`) and only calls `gtag("event", ...)` when `ga4Id()` (`NEXT_PUBLIC_GA4_MEASUREMENT_ID`) is set.
  - Because `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is currently unset in the live production environment (`ga4Id() === null`), `forwardToGoogle("commerce_cta_clicked", ...)` returns `{ tier: "analytics", ga4: false, ads: false }` and emits to **neither** GA4 nor Google Ads.
  - `emitCommerce("commerce_cta_clicked", ...)` in [`lib/commerce.js`](../../lib/commerce.js) sends `commerce_cta_clicked` to **PostHog** and **Supabase `public.events`**.
  - Production receipt `f77d140e-c592-4083-b9de-129fb4074d60` in `public.events` (`2026-10-16T07:57:40.253Z`, `click_id: "07d92e95-6fd4-41c8-8c80-397a0e29ebbb"`, `offer_id: "123164P1"`, `surface: "guide"`) proves only that first-party `commerce_cta_clicked` event — it does **not** establish a Google Ads click, a Google Ads conversion receipt, or a Viator booking association.
- **Browser Event Deduplication vs. Google Ads Conversion Counting:**
  - **Browser Event Deduplication (Wayfind client):** On a single user click on [`GuidePickOffer`](../../app/guides/%5Bslug%5D/GuidePickOffer.js), [`CommerceClickBeacon`](../../app/components/CommerceClickBeacon.js) (capture phase) mints `clickId`, stamps `data-wf-click-id` and `data-wf-click-ts`, drops double-taps within `DOUBLE_ACTIVATION_MS = 1000`, and calls `forwardToGoogle(PARTNER_CLICK_EVENT, ..., { dedupeKey: "partner_click|" + clickId })` once. [`GuidePickOffer`](../../app/guides/%5Bslug%5D/GuidePickOffer.js) (bubble phase) consumes and removes `data-wf-click-id` for that activation and emits `commerce_cta_clicked` once. On a later independent click (`> 1000ms`) on the same `target="_blank"` anchor, [`planPartnerClick`](../../lib/partnerClick.js) and [`onPickOfferClick`](../../app/guides/%5Bslug%5D/GuidePickOffer.js) mint a **new** `clickId` rather than reusing the prior click's `click_id` from `anchor.href`.
  - **Google Ads Conversion Counting (`One` vs `Every`):** Google Ads conversion action counting (`One` = at most one attributed conversion per ad click across the conversion window; `Every` = every conversion after an ad click) operates inside Google Ads after conversion receipt and is completely separate from browser event deduplication.

---

## 2. Viator Account & `/partner/bookings/modified-since` Response Contract

- **Runtime Credential & Live Probe Verification:**
  - `VIATOR_API_KEY` is configured as an encrypted `Sensitive` environment variable on Vercel project `wayfind` (`Production, Preview`).
  - `/api/cron/viator-bookings?dry_run=1` executes an authenticated, read-only, secret-safe contract probe against `https://api.viator.com/partner/bookings/modified-since` (`Accept: application/json;version=2.0`) and returns `http_status`, `raw_booking_count`, `sample_top_level_keys`, `redacted_sample`, and `normalized_preview`.
- **Official Viator `/partner/bookings/modified-since` Field Mapping:**
  - **Transaction vs. Booking vs. Partner Identity:** `booking_ref` is extracted from `bookingRef` / `bookingReference` (e.g., `"BR-204104077"`), `transaction_ref` is extracted separately from `transactionRef` (e.g., `"1234"`), and `partner_booking_ref` is extracted separately from `partnerBookingRef` (e.g., `"BK2041040771234567"`). `partnerBookingRef` is **never** treated as `campaignValue`, and `transactionRef` is **never** treated as `booking_ref`.
  - **Provider Timestamps vs. `acknowledgeBy`:** `provider_modified_at` is extracted from `lastUpdated` / `lastModified`. `acknowledgeBy` is a future acknowledgment deadline (`acknowledge_by`) and is **never** used as `provider_modified_at`, `transaction_at`, or `original_booking_at`. When provider timestamps are absent, `original_booking_at`, `transaction_at`, and `provider_modified_at` remain visibly `NULL` (never defaulted to `now()`), and a click-token match without a booking timestamp is flagged with `attribution_status = 'unmatched_missing_booking_timestamp'` and `needs_investigation = true`.
  - **Booked Item & Cancellation Details:** [`normalizeViatorBookingEvent`](../../lib/viatorBookings.js) extracts `bookedItem.{productCode,productOptionCode,travelDate,travelTime}` and `cancellation.{cancellationReasonCode,refundDetails.{itemPrice,refundAmount,refundPercentage,currencyCode}}`. Missing currencies remain visibly `NULL` (`ineligible_missing_currency`) rather than defaulting to `"USD"`.
  - **Provider `eventType` Values vs. Internal Normalized Statuses:** [`normalizeBookingStatus`](../../lib/viatorBookings.js) maps Viator's documented raw `eventType` values (`CONFIRMATION`, `REJECTION`, `AMENDMENT`, `CANCELLATION`, `CUSTOMER_CANCELLATION`) to internal normalized statuses (`confirmed`, `rejected`, `amended`, `cancelled`, `pending`, `unrecognized`) and records `cancellation_actor` (`customer` vs `provider_or_operator`). Unfamiliar provider event types are stored with `status = 'unrecognized'` and `needs_investigation = true`.

---

## 3. Campaign Trust Boundary, Visitor Context Isolation & Financial Separation

- **Unverified URL `utm_campaign` vs. Verified Google Ads Campaign Identity:**
  - [`resolveGoogleCampaignObservation`](../../lib/adClickCookie.js) and [`public.wf_viator_clicks`](../../supabase/migrations/20261103220000_wf_viator_booking_attribution.sql) store URL-captured `utm_campaign` in `observed_utm_campaign` with `campaign_metadata_provenance = 'url_utm_unverified'` and `campaign_verification_status = 'unverified'`.
  - `verified_google_campaign_id` is `NULL` on click capture and is populated **only** via `public.wf_viator_verify_campaign_attribution` when confirmed by authoritative Google Ads reporting (`campaign_metadata_provenance = 'google_ads_api_verified'`, `campaign_verification_status = 'verified' | 'mismatch'`).
- **Customer Booking Value vs. Wayfind Commission:**
  - Customer `gross_booking_value` is stored strictly separately from Wayfind `estimated_commission`, `confirmed_commission`, and `paid_commission`.
  - Missing commission (`confirmed_commission IS NULL` and `estimated_commission IS NULL`) remains visibly `NULL` (`value_basis = 'commission_unknown'`, `upload_status = 'ineligible_missing_commission'`). Customer `gross_booking_value` is **never** substituted for commission.
  - When an `AMENDMENT` changes `gross_booking_value` without supplying updated commission, `wf_viator_reconcile` invalidates the stale prior commission to `NULL` (`upload_status = 'ineligible_missing_commission'`) rather than pairing the new booking price with stale commission.

---

## 4. Booking Lifecycle, Event Ordering, Sync Lease & Concurrent Ingestion

- **Deterministic Event Ordering & Out-of-Order Protection:**
  - Within each batch, `public.wf_viator_reconcile` orders events chronologically by `provider_modified_at ASC NULLS LAST, transaction_at ASC NULLS LAST`.
  - Across batches, out-of-order older events (`provider_modified_at < existing.provider_modified_at`) backfill missing attribution/product fields without regressing a newer `cancelled` or `amended` status.
- **Sync Lease & Monotonic Epoch Protection:**
  - [`syncViatorBookings`](../../lib/viatorBookings.js) acquires an exclusive, epoch-numbered lease via `public.wf_viator_acquire_sync_lease` (`sync_epoch`, `lease_owner`, `lease_expires_at`) before polling Viator.
  - `public.wf_viator_reconcile` verifies `p_expected_epoch = sync_state.sync_epoch` under `pg_advisory_xact_lock(24380159401)` so a delayed stale worker can never overwrite newer booking state or regress `next_cursor` / `modified_since_watermark`.

---

## 5. Google Ads API `v26` Adjustments, Durable OAuth2 Refresh & Queue Recovery

- **Google Ads API `v26` `ConversionAdjustmentUploadService` (`RETRACTION` / `RESTATEMENT`):**
  - Retired Google Ads API versions (`v1`–`v22`, including `v18`) are blocked by `assertSupportedGoogleAdsApiVersion` (`GOOGLE_ADS_MIN_SUPPORTED_MAJOR_VERSION = 23`, active `GOOGLE_ADS_API_VERSION = "v26"`).
  - [`buildGoogleAdsConversionAdjustmentPayload`](../../lib/googleOfflineConversions.js) and [`validateGoogleAdsConversionAdjustmentPayload`](../../lib/googleOfflineConversions.js) enforce Google Ads API `v26` rules:
    1. Keyed exclusively by `orderId = booking_ref` (never setting both `orderId` and `gclidDateTimePair`, preventing `ConversionAdjustmentUploadError.GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET`).
    2. Verifies `adjustmentDateTime > conversionDateTime` (preventing `ADJUSTMENT_PRECEDES_CONVERSION`).
    3. Omits `restatementValue` on `RETRACTION` and requires `restatementValue` on `RESTATEMENT`.
- **Durable OAuth2 Token Refresh & Upload Claim Recovery:**
  - [`resolveGoogleOAuthAccessToken`](../../lib/googleOfflineConversions.js) exchanges `GOOGLE_ADS_OAUTH_REFRESH_TOKEN` (`client_id` + `client_secret` + `refresh_token`) at `https://oauth2.googleapis.com/token`, caches the access token until 60s before expiry, and automatically forces a token refresh + retry once on HTTP `401`.
  - `public.wf_google_begin_upload` and [`processGoogleConversionUploadQueue`](../../lib/googleOfflineConversions.js) safely reclaim:
    - `validated_only` rows when `WF_VIATOR_GOOGLE_UPLOAD_MODE` transitions from `"validate_only"` to `"live"` (so records validated during rollout reach the live upload queue).
    - `timed_out_indeterminate` rows after network timeouts.
    - Abandoned `in_flight` claims older than `300` seconds (`p_stale_in_flight_seconds`).
    - `rejected` rows once transient or credential/config issues are resolved.

---

## 6. Operational Wiring, 90-Day Redaction & Staged Rollout Plan

- **Scheduled Cron (`/api/cron/viator-bookings`):**
  - Scheduled in [`vercel.json`](../../vercel.json) at `"15 */4 * * *"`.
  - Executes all 4 phases on each run: (1) lease-protected Viator booking sync, (2) 90-day identifier and JSONB snapshot redaction (`public.wf_viator_redact_expired_clicks` across `wf_viator_clicks`, `wf_viator_bookings`, and `wf_google_conversion_uploads`), (3) staged Google conversion & adjustment queue (`WF_VIATOR_GOOGLE_UPLOAD_MODE`, default `"off"`), and (4) `recordPulse("viator-bookings", { attempted, succeeded, failed, note })`.
- **5-Stage Controlled Rollout:**
  - **Stage 1 (`WF_VIATOR_TOKEN_CAPTURE="1"`, `WF_VIATOR_GOOGLE_UPLOAD_MODE="off"` — Default):** Outbound Viator click tokens (`wfv_<32hex>`) are minted and stored in `public.wf_viator_clicks`. Live Google conversion uploads remain off.
  - **Stage 2 (`/api/cron/viator-bookings?dry_run=1` -> Scheduled Polling):** Verify live `/partner/bookings/modified-since` contract probe and cursor progression in `public.wf_viator_sync_state`.
  - **Stage 3 (`WF_VIATOR_GOOGLE_UPLOAD_MODE="validate_only"`):** Run queue processor with `validateOnly: true` against secondary conversion action `GOOGLE_ADS_VIATOR_CONVERSION_ACTION_ID`; verify `validated_only` receipts with zero errors.
  - **Stage 4 (`WF_VIATOR_GOOGLE_UPLOAD_MODE="live"` on Secondary Action):** Enable live uploads and `RETRACTION`/`RESTATEMENT` adjustments to the **Secondary (Observation)** conversion action while campaign `24380159401` remains `Paused` (or during controlled observation), promoting `validated_only` rows to `submitted` and verifying `accepted` status and `wf_viator_verify_campaign_attribution` reconciliation.
  - **Stage 5 (Go / No-Go Criteria):** Keep the offline booking action Secondary until round-trip token preservation, commission accuracy, and cancellation retractions are proven in production.
  - **Rollback:** Setting `WF_VIATOR_GOOGLE_UPLOAD_MODE="off"` immediately halts all Google uploads; setting `WF_VIATOR_TOKEN_CAPTURE="0"` reverts outbound Viator links to placement-only campaign tags (`wf-<page>-<placement>-<offer>`).

