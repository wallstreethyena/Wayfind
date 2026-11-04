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
| Google Ads Account & Conversion Owner | `553-622-6713` (`Wayfind` / `WAYFIND LLC`, Tag ID `AW-18342267447`, Conversion Owner: `553-622-6713`). |
| Target Search Campaign (`24380159401`) | `WF \| Rock Springs Clear Kayak \| Search` (`campaignId=24380159401`, `ocid=8425026675`). Inspected in Google Ads UI at `2026-10-20T02:36:59Z–02:40:38Z` across reporting window `Oct 1, 2026 – Oct 20, 2026`: created via Bulk Upload directly in `Paused` status with `$50.00` Campaign Total Budget (`Oct 20 – Oct 30, 2026`), `Maximize clicks` (`$0.25` max CPC limit), `Google Search Network only`, `0` impressions, and `$0.00` spend within the inspected `Oct 1 – Oct 20, 2026` window. |
| Live Outbound Click Conversion Action | `AW-18342267447/19gpCKCx8NccELeUo6pE` (`Outbound click`, Category: `Outbound click`, Source: `Website`, Status: `Primary`). |
| Live Sign-Up Conversion Action | `AW-18342267447/dXV1CJ2x8NccELeUo6pE` (`Sign-up`, Category: `Sign-up`, Source: `Website`, Status: `Primary`). |
| Viator Confirmed Booking Action (Target) | Dedicated **Secondary (Observation)** Offline Conversion Action (`GOOGLE_ADS_VIATOR_CONVERSION_ACTION_ID`) in account `553-622-6713`, excluded from effective bidding goals until live round-trip booking attribution, commission values, and cancellation adjustments are validated. |

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

## 2. Viator Account & Response Contract Verification

- **Runtime Credential Verification:**
  - `VIATOR_API_KEY` is configured as an encrypted `Sensitive` environment variable on Vercel project `wayfind` (`Production, Preview`).
  - Live runtime usability is proven by production `public.wf_job_pulse` row `id: 64942` (`job: "experiences"`, `ran_at: 2026-11-03T07:00:11.279063+00:00`, `attempted: 567, succeeded: 567, failed: 0`), which authenticated with `process.env.VIATOR_API_KEY` (`Accept: application/json;version=2.0`) against `https://api.viator.com/partner/products/search` and refreshed `public.wf_experiences` row `123164P1` (`product_url: "https://www.viator.com/tours/Orlando/Clear-Kayak-Tours-in-Rock-Springs/d663-123164P1?mcid=42383&pid=P00320881&medium=api&api_version=2.0"`).
  - `/api/cron/viator-bookings?dry_run=1` provides an authenticated, read-only, secret-safe contract probe against `https://api.viator.com/partner/bookings/modified-since`.
- **Campaign Construction on Ordinary (`medium=link`) and API (`medium=api`) Links:**
  - Outbound Viator redirects in [`app/api/commerce/go/route.js`](../../app/api/commerce/go/route.js) and [`app/api/viator/go/route.js`](../../app/api/viator/go/route.js) preserve `pid=P00320881`, `mcid=42383`, and `medium=link` (or `medium=api&api_version=2.0` on Partner API `productUrl` values).
  - [`lib/viatorAttribution.js`](../../lib/viatorAttribution.js) mints `wfv_<32 lowercase hex>` and formats the `campaign` parameter as `<placement>-wfv-<32hex>`.
  - Wayfind's `<= 100` character `[a-z0-9-]` check in [`assertViatorRedirectShape`](../../lib/viatorSmokeAssert.js) is an internal repository invariant; [`extractViatorClickToken`](../../lib/viatorAttribution.js) parses the returned `campaignValue` back into `wfv_<32hex>`.
- **Provider `eventType` Values vs. Internal Normalized Statuses:**
  - [`normalizeBookingStatus`](../../lib/viatorBookings.js) explicitly distinguishes Viator's documented raw `eventType` values (`CONFIRMATION`, `REJECTION`, `AMENDMENT`, `CANCELLATION`, `CUSTOMER_CANCELLATION`) from internal normalized statuses (`confirmed`, `rejected`, `amended`, `cancelled`, `pending`, `unrecognized`) and records `cancellation_actor` (`customer` vs `provider_or_operator`).
  - Unfamiliar provider event types are stored with `status = 'unrecognized'` and `needs_investigation = true` (never silently treated as confirmed bookings or uploaded to Google Ads).

---

## 3. Campaign Trust Boundary & Visitor Context Isolation

- **Unverified URL `utm_campaign` vs. Verified Google Ads Campaign Identity:**
  - [`resolveGoogleCampaignObservation`](../../lib/adClickCookie.js) and [`public.wf_viator_clicks`](../../supabase/migrations/20261103220000_wf_viator_booking_attribution.sql) store URL-captured `utm_campaign` in `observed_utm_campaign` with `campaign_metadata_provenance = 'url_utm_unverified'` and `campaign_verification_status = 'unverified'`.
  - `verified_google_campaign_id` is `NULL` on click capture and is populated **only** via `public.wf_viator_verify_campaign_attribution` when confirmed by authoritative Google Ads reporting (`campaign_metadata_provenance = 'google_ads_api_verified'`, `campaign_verification_status = 'verified' | 'mismatch'`).
- **Visitor Context Isolation (`visitor_context_hash`):**
  - [`attributedViatorDestination`](../../lib/viatorAttribution.js) computes `visitor_context_hash` (`sha256` prefix over first-party `distinctId`, `wf_ad_ctx.vid`, and click identifiers).
  - A retry of the same click by the **same** visitor within `15 minutes` (`CLICK_RETRY_WINDOW_MS`) reuses the existing `click_token`.
  - A forged or reused `client_click_id` from a different visitor (`visitor_context_hash` mismatch) or outside the 15-minute retry window is stripped (`effectiveClientClickId = null`) and mints an isolated `click_token`, never reading or overwriting another visitor's attribution.

---

## 4. Booking Lifecycle, Sync Lease & Concurrent Ingestion

- **Original Booking Window vs. Post-Expiry Amendments/Cancellations:**
  - Initial attribution eligibility is evaluated by comparing `original_booking_at` (`bookingDate` / `createdAt` / earliest known booking timestamp) against `click.clicked_at .. click.expires_at`.
  - Once a booking is `matched` in `public.wf_viator_bookings`, later `AMENDMENT`, `CANCELLATION`, or `CUSTOMER_CANCELLATION` events preserve `attribution_status = 'matched'` even if they arrive after `click.expires_at`, after 90-day redaction, or omit `campaignValue` / `totalPrice`.
  - Out-of-order older events (`provider_modified_at < existing.provider_modified_at`) backfill missing attribution/product fields without regressing a newer `cancelled` or `amended` status.
- **Sync Lease & Monotonic Epoch Protection:**
  - [`syncViatorBookings`](../../lib/viatorBookings.js) acquires an exclusive, epoch-numbered lease via `public.wf_viator_acquire_sync_lease` (`sync_epoch`, `lease_owner`, `lease_expires_at`) before polling Viator.
  - Overlapping pollers exit cleanly with `skipped_locked: true`.
  - `public.wf_viator_reconcile` verifies `p_expected_epoch = sync_state.sync_epoch` under `pg_advisory_xact_lock(24380159401)` so a delayed stale worker can never overwrite newer booking state or regress `next_cursor` / `modified_since_watermark`.

---

## 5. Google Ads Offline Uploads, In-Flight Races & Retraction Semantics

- **Google Ads API `ConversionAdjustmentUploadService` (`RETRACTION` / `RESTATEMENT`) vs. Data Manager API:**
  - Google Data Manager API (`events:ingest`) does not retract conversion count when `conversionValue: 0.00` is submitted.
  - [`lib/googleOfflineConversions.js`](../../lib/googleOfflineConversions.js) implements both:
    1. **Google Ads API `ConversionAdjustmentUploadService`** (`buildGoogleAdsConversionAdjustmentPayload` / `submitGoogleAdsConversionAdjustment`): sends `adjustmentType: "RETRACTION"` (`orderId = booking_ref`) on cancellation (`adjustment_state = 'retracted_count_and_value'`, `retraction_required = false`) and `adjustmentType: "RESTATEMENT"` on post-upload amendment (`adjustment_state = 'restated_value'`).
    2. **Google Data Manager API (`events:ingest`)**: used for initial uploads and as a zero-value restatement fallback when `GOOGLE_ADS_DEVELOPER_TOKEN` is not set (`adjustment_state = 'value_restated_zero_count_unretracted'`, `retraction_required = true`).
- **Two-Phase Upload & In-Flight Cancellation Race Protection:**
  - [`processGoogleConversionUploadQueue`](../../lib/googleOfflineConversions.js) claims each row via `public.wf_google_begin_upload` (`upload_status = 'in_flight'`), which aborts with `cancelled_before_upload` if the booking was already cancelled.
  - Network timeouts transition the row to `timed_out_indeterminate`.
  - `public.wf_google_finalize_upload` re-checks `public.wf_viator_bookings.status` when the HTTP call finishes: if a `CANCELLATION` or `AMENDMENT` arrived while `initial_booking` was `in_flight` (or `timed_out_indeterminate`), it preserves the cancelled/amended booking state and immediately queues `cancellation_restatement` or `amendment_restatement` as `awaiting_upload`.

---

## 6. Operational Wiring, 90-Day Redaction & Staged Rollout Plan

- **Scheduled Cron (`/api/cron/viator-bookings`):**
  - Scheduled in [`vercel.json`](../../vercel.json) at `"15 */4 * * *"`.
  - Executes all 4 phases on each run: (1) lease-protected Viator booking sync, (2) 90-day identifier and JSONB snapshot redaction (`public.wf_viator_redact_expired_clicks` across `wf_viator_clicks`, `wf_viator_bookings`, and `wf_google_conversion_uploads`), (3) staged Google conversion & adjustment queue (`WF_VIATOR_GOOGLE_UPLOAD_MODE`), and (4) `recordPulse("viator-bookings", { attempted, succeeded, failed, note })`.
- **5-Stage Controlled Rollout:**
  - **Stage 1 (`WF_VIATOR_TOKEN_CAPTURE="1"`, `WF_VIATOR_GOOGLE_UPLOAD_MODE="off"` — Default):** Outbound Viator click tokens (`wfv_<32hex>`) are minted and stored in `public.wf_viator_clicks`. Live Google conversion uploads remain off.
  - **Stage 2 (`/api/cron/viator-bookings?dry_run=1` -> Scheduled Polling):** Verify live `/partner/bookings/modified-since` contract probe and cursor progression in `public.wf_viator_sync_state`.
  - **Stage 3 (`WF_VIATOR_GOOGLE_UPLOAD_MODE="validate_only"`):** Run queue processor with `validateOnly: true` against secondary conversion action `GOOGLE_ADS_VIATOR_CONVERSION_ACTION_ID`; verify `validated_only` receipts with zero errors.
  - **Stage 4 (`WF_VIATOR_GOOGLE_UPLOAD_MODE="live"` on Secondary Action):** Enable live uploads and `RETRACTION`/`RESTATEMENT` adjustments to the **Secondary (Observation)** conversion action while campaign `24380159401` remains `Paused` (or during controlled observation), verifying `accepted` status and `wf_viator_verify_campaign_attribution` reconciliation.
  - **Stage 5 (Go / No-Go Criteria):** Keep the offline booking action Secondary until round-trip token preservation, commission accuracy, and cancellation retractions are proven in production.
  - **Rollback:** Setting `WF_VIATOR_GOOGLE_UPLOAD_MODE="off"` immediately halts all Google uploads; setting `WF_VIATOR_TOKEN_CAPTURE="0"` reverts outbound Viator links to placement-only campaign tags (`wf-<page>-<placement>-<offer>`).
