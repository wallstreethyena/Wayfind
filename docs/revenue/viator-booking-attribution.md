# Viator Booking Attribution, Financial Reconciliation & Google Ads Offline Conversion Pipeline

## 1. Baseline & Live Measurement Configuration

| Item | Verified Value |
|---|---|
| Historical Audit Reference | `9d6caeea427efa003be82cfcf7462dfc4a14d172` |
| Implementation Base (`origin/main`) | `439d11573889a6163bf165ebbf35b46cc2de4cc4` |
| Deployed Revision (`wayfind-lab`) | `439d11573889a6163bf165ebbf35b46cc2de4cc4` |
| Deployed Revision (`wayfind` / `gowayfind.com`) | `93bda809ec3bea72ca4c7d7067c796d32ecc4d75` / `671f6fb11bcb5fd331ffa6823098d06e99776da2` |
| Google Ads Account | `553-622-6713` (`Wayfind` / `WAYFIND LLC`, Tag ID `AW-18342267447`, Conversion Owner: `553-622-6713`) |
| Target Paused Search Campaign | `24380159401` (`WF \| Rock Springs Clear Kayak \| Search`, Status: `Paused`, Budget: `$50.00` Campaign Total Budget `Oct 20–Oct 30, 2026`, Bidding: `Maximize clicks` with `$0.25` CPC limit, Network: `Google Search only`) |
| Live Outbound Click Conversion Action | `AW-18342267447/19gpCKCx8NccELeUo6pE` (`Outbound click`, Category: `Outbound click`, Source: `Website`, Status: `Primary`, Count: `One` / deduped per `click_id` in [`lib/analytics.js`](../../lib/analytics.js)) |
| Live Sign-Up Conversion Action | `AW-18342267447/dXV1CJ2x8NccELeUo6pE` (`Sign-up`, Category: `Sign-up`, Source: `Website`, Status: `Primary`) |
| Viator Confirmed Booking Action (Target) | Dedicated **Secondary (Observation)** Offline Conversion Action (`GOOGLE_ADS_VIATOR_CONVERSION_ACTION_ID`) in account `553-622-6713`, excluded from effective bidding goals until booking volume, commission values, and cancellation rates are validated |

### Client-Side Click Conversion Deduplication
- Guide pages mount [`CommerceClickBeacon`](../../app/components/CommerceClickBeacon.js) in [`app/guides/layout.js`](../../app/guides/layout.js) and render offer buttons through [`GuidePickOffer`](../../app/guides/%5Bslug%5D/GuidePickOffer.js) (`data-commerce-owner="GuidePickOffer"`) and [`GuideConversion`](../../app/guides/%5Bslug%5D/GuideConversion.js).
- On a click on an owned anchor (`data-commerce-owner="GuidePickOffer"`):
  1. [`CommerceClickBeacon`](../../app/components/CommerceClickBeacon.js) (capture phase) mints `clickId`, stamps `data-wf-click-id` on the anchor, syncs the first-party `wf_ad_ctx` cookie, and calls `forwardToGoogle(PARTNER_CLICK_EVENT, ...)` (`partner_click`), which fires `gtag('event', 'conversion', { send_to: 'AW-18342267447/19gpCKCx8NccELeUo6pE' })` **once**. Because `owned === true`, `CommerceClickBeacon` does **not** emit a duplicate `commerce_cta_clicked`.
  2. [`GuidePickOffer`](../../app/guides/%5Bslug%5D/GuidePickOffer.js) (bubble phase) reads `data-wf-click-id`, rewrites `anchor.href` to `/api/commerce/go?...&click_id=<clickId>`, and calls `emitCommerce("commerce_cta_clicked", { ..., click_id: clickId })`.
  3. [`lib/analytics.js`](../../lib/analytics.js) classifies `commerce_cta_clicked` in tier `"analytics"` (GA4 only, never an Ads conversion), preventing double-counting.

---

## 2. Outbound Viator Click Token & Private Attribution Mapping

### Partner URL Contract
- Outbound Viator redirects in [`app/api/commerce/go/route.js`](../../app/api/commerce/go/route.js) and [`app/api/viator/go/route.js`](../../app/api/viator/go/route.js) preserve `pid=P00320881`, `mcid=42383`, and `medium=link` (or `medium=api` on Partner API `productUrl` values).
- [`lib/viatorAttribution.js`](../../lib/viatorAttribution.js) mints a cryptographically random token `wfv_<32 lowercase hex>` and appends `-wfv-<32 lowercase hex>` to the placement campaign tag:
  ```text
  wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-0123456789abcdef0123456789abcdef
  ```
- The combined `campaign` parameter is guaranteed `<= 100` characters and strictly `[a-z0-9-]`.
- Raw advertising click identifiers (`gclid`, `gbraid`, `wbraid`), `client_click_id`, user IDs, and personal information are **never** placed in the Viator `campaign` parameter.
- If a user retries the same outbound click (same `(provider, offer_id, client_click_id)`), [`attributedViatorDestination`](../../lib/viatorAttribution.js) reuses the existing `click_token`.
- If durable storage is unconfigured or unreachable, the redirect fails soft to the classic placement-only tag (`wf-<page>-<placement>-<offer>`) so customer handoffs never break.

### First-Touch vs. Session Attribution Separation
- [`lib/attribution.js`](../../lib/attribution.js) (`captureAttribution`) replaces stored attribution atomically when a new URL carries attribution parameters, rather than shallow-merging a fresh click ID (`gclid`) onto stale `utm_*` campaign parameters from an earlier visit.
- [`lib/campaignAttribution.js`](../../lib/campaignAttribution.js) maintains `wf_ft_v1` (90-day immutable first touch without raw click-ID values) separately from `wf_sess_attr_v1` (current tab session attribution, including `gclid`, `gbraid`, `wbraid`).
- [`deriveTrustedGoogleCampaignId`](../../lib/viatorAttribution.js) records `google_campaign_id = "24380159401"` **only** when backed by trusted captured campaign metadata (`utm_campaign` / explicit `google_campaign_id` on a Google click) or authoritative Ads reporting — never inferred from a landing page URL, tour SKU (`123164P1`), or bare `gclid` string alone.

### Access Control, Retention, Expiration & Redaction
- All 5 attribution and reconciliation tables (`wf_viator_clicks`, `wf_viator_sync_state`, `wf_viator_booking_events`, `wf_viator_bookings`, `wf_google_conversion_uploads`) have Row-Level Security enabled with all privileges revoked from `public`, `anon`, and `authenticated` (`service_role` only).
- **Attribution Window:** `expires_at = clicked_at + interval '30 days'` (matching Viator's 30-day affiliate cookie window). Bookings occurring after `expires_at` are classified as `unmatched_expired`.
- **90-Day Redaction:** `redact_after = clicked_at + interval '90 days'`. Calling `public.wf_viator_redact_expired_clicks()` clears `gclid`, `gbraid`, `wbraid`, `session_attribution`, and `first_touch_attribution` while preserving non-personal placement and `google_campaign_id` aggregates.

---

## 3. Booking Ingestion, Reconciliation & 4-Way Financial Separation

- [`lib/viatorBookings.js`](../../lib/viatorBookings.js) polls Viator's `/partner/bookings/modified-since` endpoint with `Accept: application/json;version=2.0` and `exp-api-key`.
- Each page is reconciled via `public.wf_viator_reconcile` (protected by `pg_advisory_xact_lock`) **before** `wf_viator_sync_state.next_cursor` is advanced.
- Every booking event is stored in `public.wf_viator_booking_events` (`CONFIRMED`, `AMENDED`, `CANCELLED`, `REJECTED`, `PENDING`) and folded into `public.wf_viator_bookings`.
- Four financial amounts are stored in separate columns and **never** conflated or fabricated from guessed percentages:
  1. `gross_booking_value` — customer retail spend
  2. `estimated_commission` — partner commission estimate at booking time
  3. `confirmed_commission` — confirmed/earned partner commission
  4. `paid_commission` — settled partner payout when reported

---

## 4. Google Ads Offline Conversion Upload & Cancellation Semantics

- [`lib/googleOfflineConversions.js`](../../lib/googleOfflineConversions.js) builds payloads for Google Data Manager API (`https://datamanager.googleapis.com/v1/events:ingest`) keyed by `transactionId = booking_ref`.
- **Default Validation Gate:** Uploads default to `validateOnly: true` (`upload_status = 'validated_only'`). Neither `validateOnly: true` nor an HTTP 200 live submission (`upload_status = 'submitted'`) is reported as an `accepted` campaign-attributed conversion until verified in Google Ads reporting.
- **Amendments (`AMENDED`):** Keyed by the same `booking_ref` (`transaction_id`), updating the single `initial_booking` upload record in place prior to live submission (or queueing an `amendment_restatement` after live submission) — never creating a second initial booking conversion.
- **Cancellations (`CANCELLED`):**
  - If cancelled before live submission (`awaiting_upload` / `validated_only`), the upload transitions to `cancelled_before_upload` (`conversion_value = 0.00`) and is never sent to Google.
  - If cancelled after live submission (`submitted` / `accepted`), a `cancellation_restatement` record is queued with `conversion_value = 0.00` and `retraction_required = true`. Because Google Data Manager API `events:ingest` does not expose a standalone retraction endpoint, `public.wf_viator_financial_summary` strictly separates `gross_bookings_count`, `active_bookings_count`, `cancelled_bookings_count`, and active vs. cancelled commission totals.
