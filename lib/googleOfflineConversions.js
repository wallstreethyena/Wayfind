// lib/googleOfflineConversions.js — Google Data Manager API offline conversion
// adapter (`https://datamanager.googleapis.com/v1/events:ingest`) AND Google
// Ads API `ConversionAdjustmentUploadService` (`RETRACTION` / `RESTATEMENT`)
// with durable upload ledger (`public.wf_google_conversion_uploads`),
// in-flight race protection, secondary conversion action targeting, and
// `validateOnly` rollout gating.
//
// HONESTY & VERIFICATION INVARIANTS
// ---------------------------------
// 1. `validateOnly: true` (the default when enabled) proves payload and
//    destination schema validity ONLY. It is recorded as `validated_only` and
//    is NEVER reported as a live uploaded conversion or proof of campaign
//    attribution.
// 2. A live HTTP 200 response (`validateOnly: false`) is recorded as
//    `submitted` (with `request_id`). A record only transitions to `accepted`
//    when confirmed by authoritative Google Ads reporting.
// 3. Bookings lacking `gclid`/`gbraid`/`wbraid` are recorded as
//    `ineligible_missing_click_id`; bookings where `consent_ad_user_data` is
//    not `"GRANTED"` are recorded as `ineligible_missing_consent`. Neither is
//    ever sent to Google.
// 4. Every upload is keyed by stable `transactionId = booking_ref` (`orderId`
//    in Google Ads API adjustments).
//    - An `AMENDED` event never creates a second initial booking conversion;
//      if the initial conversion was already submitted/in-flight, it queues an
//      `amendment_restatement` (`RESTATEMENT`).
//    - A `CANCELLED` event before live upload cancels the queued upload
//      (`cancelled_before_upload`).
//    - A `CANCELLED` event after an initial upload was submitted (or while it
//      was `in_flight` / `timed_out_indeterminate`) queues a
//      `cancellation_restatement`:
//      * When Google Ads API `ConversionAdjustmentUploadService` credentials
//        are configured, it sends `adjustmentType: "RETRACTION"` (`orderId =
//        booking_ref`), retracting BOTH conversion count and value
//        (`adjustment_state = "retracted_count_and_value"`).
//      * When only Google Data Manager API (`events:ingest`) is configured, it
//        restates `conversionValue: 0.00` and explicitly records
//        `adjustment_state = "value_restated_zero_count_unretracted"` and
//        `retraction_required = true` because Data Manager API restates value
//        without retracting conversion count.

export const GOOGLE_DATA_MANAGER_INGEST_URL =
  "https://datamanager.googleapis.com/v1/events:ingest";

export const GOOGLE_ADS_API_BASE_URL = "https://googleads.googleapis.com/v26";

export const UPLOAD_STATES = Object.freeze({
  AWAITING_UPLOAD: "awaiting_upload",
  IN_FLIGHT: "in_flight",
  TIMED_OUT_INDETERMINATE: "timed_out_indeterminate",
  VALIDATED_ONLY: "validated_only",
  SUBMITTED: "submitted",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  INELIGIBLE_MISSING_CLICK_ID: "ineligible_missing_click_id",
  INELIGIBLE_MISSING_CONSENT: "ineligible_missing_consent",
  CANCELLED_BEFORE_UPLOAD: "cancelled_before_upload",
});

export const ADJUSTMENT_STATES = Object.freeze({
  NONE: "none",
  PENDING_RETRACTION: "pending_retraction",
  PENDING_RESTATEMENT: "pending_restatement",
  VALUE_RESTATED_ZERO_COUNT_UNRETRACTED: "value_restated_zero_count_unretracted",
  RETRACTED_COUNT_AND_VALUE: "retracted_count_and_value",
  RESTATED_VALUE: "restated_value",
});

function cleanAccountDigits(v) {
  return String(v || "").replace(/[^0-9]/g, "");
}

/**
 * Format an ISO timestamp as Google Ads API `YYYY-MM-DD HH:MM:SS+00:00`.
 */
export function formatGoogleAdsDateTime(isoOrDate = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (!Number.isFinite(d.getTime())) {
    return new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
  }
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
}

/**
 * Compute the conversion value and basis for a reconciled Viator booking.
 * Prefers confirmed_commission, then estimated_commission, then gross_booking_value.
 * On cancellation, restates value to 0.00.
 */
export function selectConversionValue(booking) {
  if (!booking || typeof booking !== "object") {
    return { value: 0, basis: "none" };
  }
  if (booking.status === "cancelled" || booking.status === "rejected") {
    return { value: 0, basis: "cancelled_restatement_zero" };
  }
  if (
    booking.confirmed_commission !== null &&
    booking.confirmed_commission !== undefined &&
    Number.isFinite(Number(booking.confirmed_commission))
  ) {
    return {
      value: Math.round(Number(booking.confirmed_commission) * 100) / 100,
      basis: "confirmed_commission",
    };
  }
  if (
    booking.estimated_commission !== null &&
    booking.estimated_commission !== undefined &&
    Number.isFinite(Number(booking.estimated_commission))
  ) {
    return {
      value: Math.round(Number(booking.estimated_commission) * 100) / 100,
      basis: "estimated_commission",
    };
  }
  if (
    booking.gross_booking_value !== null &&
    booking.gross_booking_value !== undefined &&
    Number.isFinite(Number(booking.gross_booking_value))
  ) {
    return {
      value: Math.round(Number(booking.gross_booking_value) * 100) / 100,
      basis: "gross_booking_value",
    };
  }
  return { value: 0, basis: "zero_unreported" };
}

/**
 * Evaluate whether a reconciled booking is eligible for Google Ads offline
 * conversion upload, and build the exact Google Data Manager API payload.
 */
export function buildGoogleDataManagerEventPayload({
  booking,
  uploadKind = "initial_booking",
  operatingAccountId = null,
  conversionActionId,
  validateOnly = true,
} = {}) {
  if (!booking || !booking.booking_ref) {
    return { eligible: false, status: UPLOAD_STATES.REJECTED, reason: "missing_booking_ref" };
  }

  const gclid = booking.gclid || null;
  const gbraid = booking.gbraid || null;
  const wbraid = booking.wbraid || null;

  if (!gclid && !gbraid && !wbraid) {
    return {
      eligible: false,
      status: UPLOAD_STATES.INELIGIBLE_MISSING_CLICK_ID,
      reason: "missing_click_id",
    };
  }

  const consentAdUserData = String(booking.consent_ad_user_data || "UNKNOWN").toUpperCase();
  const consentAdPersonalization = String(
    booking.consent_ad_personalization || "UNKNOWN",
  ).toUpperCase();

  if (consentAdUserData !== "GRANTED") {
    return {
      eligible: false,
      status: UPLOAD_STATES.INELIGIBLE_MISSING_CONSENT,
      reason: `consent_ad_user_data_${consentAdUserData.toLowerCase()}`,
    };
  }

  const accountDigits = cleanAccountDigits(operatingAccountId);
  if (!accountDigits) {
    return { eligible: false, status: UPLOAD_STATES.AWAITING_UPLOAD, reason: "missing_operating_account_id" };
  }
  const actionIdStr = String(conversionActionId || "").trim();
  if (!actionIdStr) {
    return {
      eligible: false,
      status: UPLOAD_STATES.AWAITING_UPLOAD,
      reason: "missing_conversion_action_id",
    };
  }

  const { value, basis } =
    uploadKind === "cancellation_restatement"
      ? { value: 0, basis: "cancelled_restatement_zero" }
      : selectConversionValue(booking);

  const adIdentifiers = {};
  if (gclid) adIdentifiers.gclid = gclid;
  if (gbraid) adIdentifiers.gbraid = gbraid;
  if (wbraid) adIdentifiers.wbraid = wbraid;

  const eventTimestamp =
    booking.original_booking_at ||
    booking.transaction_at ||
    booking.provider_modified_at ||
    new Date().toISOString();

  const body = {
    destinations: [
      {
        operatingAccount: {
          accountType: "GOOGLE_ADS",
          accountId: accountDigits,
        },
        productDestinationId: actionIdStr,
      },
    ],
    events: [
      {
        transactionId: String(booking.booking_ref),
        eventTimestamp,
        adIdentifiers,
        consent: {
          adUserData: "GRANTED",
          adPersonalization:
            consentAdPersonalization === "GRANTED" ? "GRANTED" : "DENIED",
        },
        conversionValue: value,
        currency: String(booking.currency || "USD").toUpperCase(),
      },
    ],
    validateOnly: Boolean(validateOnly),
  };

  return {
    eligible: true,
    status: validateOnly ? UPLOAD_STATES.VALIDATED_ONLY : UPLOAD_STATES.SUBMITTED,
    conversionValue: value,
    valueBasis: basis,
    adjustmentState:
      uploadKind === "cancellation_restatement"
        ? ADJUSTMENT_STATES.VALUE_RESTATED_ZERO_COUNT_UNRETRACTED
        : uploadKind === "amendment_restatement"
          ? ADJUSTMENT_STATES.RESTATED_VALUE
          : ADJUSTMENT_STATES.NONE,
    retractionRequired: uploadKind === "cancellation_restatement",
    body,
  };
}

/**
 * Build a Google Ads API `ConversionAdjustmentUploadService` payload for
 * true conversion count + value `RETRACTION` (on cancellation) or value
 * `RESTATEMENT` (on amendment), keyed by `orderId = booking_ref`.
 */
export function buildGoogleAdsConversionAdjustmentPayload({
  booking,
  uploadKind = "cancellation_restatement",
  operatingAccountId = null,
  conversionActionId,
  adjustmentTimestamp = new Date().toISOString(),
  validateOnly = true,
} = {}) {
  if (!booking || !booking.booking_ref) {
    return { eligible: false, status: UPLOAD_STATES.REJECTED, reason: "missing_booking_ref" };
  }

  const accountDigits = cleanAccountDigits(operatingAccountId);
  if (!accountDigits) {
    return { eligible: false, status: UPLOAD_STATES.AWAITING_UPLOAD, reason: "missing_operating_account_id" };
  }
  const actionDigits = cleanAccountDigits(conversionActionId);
  if (!actionDigits) {
    return {
      eligible: false,
      status: UPLOAD_STATES.AWAITING_UPLOAD,
      reason: "missing_conversion_action_id",
    };
  }

  const isRetraction = uploadKind === "cancellation_restatement";
  const adjustmentType = isRetraction ? "RETRACTION" : "RESTATEMENT";
  const { value, basis } = isRetraction
    ? { value: 0, basis: "cancelled_retraction" }
    : selectConversionValue(booking);

  const adjustment = {
    conversionAction: `customers/${accountDigits}/conversionActions/${actionDigits}`,
    adjustmentType,
    orderId: String(booking.booking_ref),
    adjustmentDateTime: formatGoogleAdsDateTime(
      booking.cancellation_at || booking.provider_modified_at || adjustmentTimestamp,
    ),
  };

  if (booking.gclid && (booking.original_booking_at || booking.transaction_at)) {
    adjustment.gclidDateTimePair = {
      gclid: String(booking.gclid),
      conversionDateTime: formatGoogleAdsDateTime(
        booking.original_booking_at || booking.transaction_at,
      ),
    };
  }

  if (!isRetraction) {
    adjustment.restatementValue = {
      adjustedValue: value,
      currencyCode: String(booking.currency || "USD").toUpperCase(),
    };
  }

  return {
    eligible: true,
    status: validateOnly ? UPLOAD_STATES.VALIDATED_ONLY : UPLOAD_STATES.SUBMITTED,
    conversionValue: value,
    valueBasis: basis,
    adjustmentType,
    adjustmentState: isRetraction
      ? ADJUSTMENT_STATES.RETRACTED_COUNT_AND_VALUE
      : ADJUSTMENT_STATES.RESTATED_VALUE,
    retractionRequired: false,
    endpoint: `${GOOGLE_ADS_API_BASE_URL}/customers/${accountDigits}:uploadConversionAdjustments`,
    body: {
      conversionAdjustments: [adjustment],
      partialFailure: true,
      validateOnly: Boolean(validateOnly),
    },
  };
}

/**
 * Submit a conversion adjustment (`RETRACTION` or `RESTATEMENT`) via the
 * Google Ads API `ConversionAdjustmentUploadService`.
 */
export async function submitGoogleAdsConversionAdjustment(
  {
    uploadRow,
    bookingRow,
    accessToken,
    developerToken,
    loginCustomerId,
    operatingAccountId = null,
    conversionActionId,
    validateOnly = true,
    now = new Date(),
  } = {},
  { fetch: f = globalThis.fetch, endpoint } = {},
) {
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const uploadKind = uploadRow?.upload_kind || "cancellation_restatement";
  const built = buildGoogleAdsConversionAdjustmentPayload({
    booking: bookingRow,
    uploadKind,
    operatingAccountId,
    conversionActionId,
    adjustmentTimestamp: nowIso,
    validateOnly,
  });

  if (!built.eligible) {
    return {
      ok: false,
      upload_status: built.status,
      reason: built.reason,
      conversion_value: 0,
      value_basis: "none",
      adjustment_state: ADJUSTMENT_STATES.PENDING_RETRACTION,
      retraction_required: uploadKind === "cancellation_restatement",
      attempted_at: nowIso,
    };
  }

  if (!accessToken || !developerToken) {
    return {
      ok: false,
      upload_status: UPLOAD_STATES.AWAITING_UPLOAD,
      reason: !accessToken
        ? "missing_google_oauth_access_token"
        : "missing_google_ads_developer_token",
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
      adjustment_state:
        uploadKind === "cancellation_restatement"
          ? ADJUSTMENT_STATES.PENDING_RETRACTION
          : ADJUSTMENT_STATES.PENDING_RESTATEMENT,
      retraction_required: uploadKind === "cancellation_restatement",
      payload: built.body,
      attempted_at: nowIso,
    };
  }

  const reqHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) {
    reqHeaders["login-customer-id"] = cleanAccountDigits(loginCustomerId);
  }

  let res;
  try {
    res = await f(endpoint || built.endpoint, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(built.body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const isTimeout =
      e?.name === "TimeoutError" ||
      e?.name === "AbortError" ||
      /timed?\s*out|abort/i.test(String(e?.message || ""));
    return {
      ok: false,
      upload_status: isTimeout
        ? UPLOAD_STATES.TIMED_OUT_INDETERMINATE
        : UPLOAD_STATES.REJECTED,
      reason: `network_error:${e?.message || "fetch"}`,
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
      adjustment_state:
        uploadKind === "cancellation_restatement"
          ? ADJUSTMENT_STATES.PENDING_RETRACTION
          : ADJUSTMENT_STATES.PENDING_RESTATEMENT,
      retraction_required: uploadKind === "cancellation_restatement",
      attempted_at: nowIso,
    };
  }

  let resBody = null;
  try {
    resBody = await res.json();
  } catch {
    resBody = null;
  }

  const partialFailureError = resBody?.partialFailureError || resBody?.error || null;
  if (!res.ok || partialFailureError) {
    const errMsg =
      typeof partialFailureError?.message === "string"
        ? partialFailureError.message
        : `http_${res.status}`;
    return {
      ok: false,
      upload_status: UPLOAD_STATES.REJECTED,
      reason: errMsg,
      http_status: res.status,
      response_summary: resBody,
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
      adjustment_state:
        uploadKind === "cancellation_restatement"
          ? ADJUSTMENT_STATES.PENDING_RETRACTION
          : ADJUSTMENT_STATES.PENDING_RESTATEMENT,
      retraction_required: uploadKind === "cancellation_restatement",
      attempted_at: nowIso,
    };
  }

  const requestId = resBody?.requestId || res.headers.get("request-id");
  if (!resBody || typeof resBody !== "object" || !requestId) {
    return {
      ok: false,
      upload_status: UPLOAD_STATES.TIMED_OUT_INDETERMINATE,
      reason: "missing_provider_receipt",
      http_status: res.status,
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
      adjustment_state: uploadKind === "cancellation_restatement"
        ? ADJUSTMENT_STATES.PENDING_RETRACTION : ADJUSTMENT_STATES.PENDING_RESTATEMENT,
      retraction_required: uploadKind === "cancellation_restatement",
      attempted_at: nowIso,
    };
  }
  return {
    ok: true,
    upload_status: validateOnly
      ? UPLOAD_STATES.VALIDATED_ONLY
      : UPLOAD_STATES.SUBMITTED,
    validate_only: Boolean(validateOnly),
    request_id: requestId,
    http_status: res.status,
    response_summary: resBody || { requestId },
    conversion_value: built.conversionValue,
    value_basis: built.valueBasis,
    adjustment_state: validateOnly
      ? uploadKind === "cancellation_restatement"
        ? ADJUSTMENT_STATES.PENDING_RETRACTION
        : ADJUSTMENT_STATES.PENDING_RESTATEMENT
      : built.adjustmentState,
    retraction_required: validateOnly
      ? uploadKind === "cancellation_restatement"
      : built.retractionRequired,
    payload: built.body,
    attempted_at: nowIso,
  };
}

/**
 * Submit a single offline conversion upload record to Google Data Manager API
 * (or Google Ads API ConversionAdjustmentUploadService when retracting/restating
 * with a `developerToken`).
 */
export async function submitGoogleConversionUpload(
  {
    uploadRow,
    bookingRow,
    accessToken,
    developerToken = null,
    loginCustomerId = null,
    operatingAccountId = null,
    conversionActionId,
    validateOnly = true,
    now = new Date(),
  } = {},
  { fetch: f = globalThis.fetch, endpoint = GOOGLE_DATA_MANAGER_INGEST_URL, adjustmentEndpoint } = {},
) {
  const uploadKind = uploadRow?.upload_kind || "initial_booking";

  // When a cancellation retraction or amendment restatement is processed and a
  // Google Ads API developerToken is configured, use ConversionAdjustmentUploadService
  // so cancellations retract BOTH conversion count and value.
  if (
    (uploadKind === "cancellation_restatement" || uploadKind === "amendment_restatement") &&
    developerToken
  ) {
    return submitGoogleAdsConversionAdjustment(
      {
        uploadRow,
        bookingRow,
        accessToken,
        developerToken,
        loginCustomerId,
        operatingAccountId,
        conversionActionId,
        validateOnly,
        now,
      },
      { fetch: f, endpoint: adjustmentEndpoint },
    );
  }

  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const built = buildGoogleDataManagerEventPayload({
    booking: bookingRow,
    uploadKind,
    operatingAccountId,
    conversionActionId,
    validateOnly,
  });

  if (!built.eligible) {
    return {
      ok: false,
      upload_status: built.status,
      reason: built.reason,
      conversion_value: 0,
      value_basis: "none",
      adjustment_state:
        uploadKind === "cancellation_restatement"
          ? ADJUSTMENT_STATES.PENDING_RETRACTION
          : ADJUSTMENT_STATES.NONE,
      retraction_required: uploadKind === "cancellation_restatement",
      attempted_at: nowIso,
    };
  }

  if (!accessToken || typeof accessToken !== "string") {
    return {
      ok: false,
      upload_status: UPLOAD_STATES.AWAITING_UPLOAD,
      reason: "missing_google_oauth_access_token",
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
      adjustment_state:
        uploadKind === "cancellation_restatement"
          ? ADJUSTMENT_STATES.PENDING_RETRACTION
          : uploadKind === "amendment_restatement"
            ? ADJUSTMENT_STATES.PENDING_RESTATEMENT
            : ADJUSTMENT_STATES.NONE,
      retraction_required: uploadKind === "cancellation_restatement",
      payload: built.body,
      attempted_at: nowIso,
    };
  }

  let res;
  try {
    res = await f(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(built.body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const isTimeout =
      e?.name === "TimeoutError" ||
      e?.name === "AbortError" ||
      /timed?\s*out|abort/i.test(String(e?.message || ""));
    return {
      ok: false,
      upload_status: isTimeout
        ? UPLOAD_STATES.TIMED_OUT_INDETERMINATE
        : UPLOAD_STATES.REJECTED,
      reason: `network_error:${e?.message || "fetch"}`,
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
      adjustment_state:
        uploadKind === "cancellation_restatement"
          ? ADJUSTMENT_STATES.PENDING_RETRACTION
          : ADJUSTMENT_STATES.NONE,
      retraction_required: uploadKind === "cancellation_restatement",
      attempted_at: nowIso,
    };
  }

  let resBody = null;
  try {
    resBody = await res.json();
  } catch {
    resBody = null;
  }

  const partialErrors =
    resBody?.partialFailureErrors ||
    resBody?.error ||
    (Array.isArray(resBody?.errors) && resBody.errors.length > 0 ? resBody.errors : null);

  if (!res.ok || partialErrors) {
    const errMsg =
      typeof resBody?.error?.message === "string"
        ? resBody.error.message
        : partialErrors
          ? JSON.stringify(partialErrors).slice(0, 300)
          : `http_${res.status}`;
    return {
      ok: false,
      upload_status: UPLOAD_STATES.REJECTED,
      reason: errMsg,
      http_status: res.status,
      response_summary: resBody,
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
      adjustment_state:
        uploadKind === "cancellation_restatement"
          ? ADJUSTMENT_STATES.PENDING_RETRACTION
          : ADJUSTMENT_STATES.NONE,
      retraction_required: uploadKind === "cancellation_restatement",
      attempted_at: nowIso,
    };
  }

  const requestId = resBody?.requestId || resBody?.request_id || res.headers.get("request-id");
  if (!resBody || typeof resBody !== "object" || !requestId) {
    return {
      ok: false,
      upload_status: UPLOAD_STATES.TIMED_OUT_INDETERMINATE,
      reason: "missing_provider_receipt",
      http_status: res.status,
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
      adjustment_state: uploadKind === "cancellation_restatement"
        ? ADJUSTMENT_STATES.PENDING_RETRACTION : ADJUSTMENT_STATES.NONE,
      retraction_required: uploadKind === "cancellation_restatement",
      attempted_at: nowIso,
    };
  }

  return {
    ok: true,
    upload_status: validateOnly
      ? UPLOAD_STATES.VALIDATED_ONLY
      : UPLOAD_STATES.SUBMITTED,
    validate_only: Boolean(validateOnly),
    request_id: requestId,
    http_status: res.status,
    response_summary: resBody || { requestId },
    conversion_value: built.conversionValue,
    value_basis: built.valueBasis,
    adjustment_state: validateOnly
      ? uploadKind === "cancellation_restatement"
        ? ADJUSTMENT_STATES.PENDING_RETRACTION
        : ADJUSTMENT_STATES.NONE
      : built.adjustmentState,
    retraction_required: validateOnly
      ? uploadKind === "cancellation_restatement"
      : built.retractionRequired,
    payload: built.body,
    attempted_at: nowIso,
  };
}

/**
 * Process queued rows in `public.wf_google_conversion_uploads` using the two-phase
 * `wf_google_begin_upload` -> network call -> `wf_google_finalize_upload`
 * state machine so an in-flight or timed-out initial upload racing with a
 * concurrent `CANCELLATION` or `AMENDMENT` never leaves a cancelled booking's
 * value active in Google Ads.
 */
export async function processGoogleConversionUploadQueue(
  {
    sb,
    uploadMode = "off",
    accessToken = null,
    developerToken = null,
    loginCustomerId = null,
    operatingAccountId = null,
    conversionActionId = null,
    limit = 25,
    now = new Date(),
  } = {},
  deps = {},
) {
  const mode = String(uploadMode || "off").trim().toLowerCase();
  if (mode === "off" || mode === "disabled" || mode === "0") {
    return {
      ok: true,
      mode: "off",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped_before_upload: 0,
    };
  }
  if (!sb) {
    return { ok: false, mode, reason: "missing_supabase_admin", attempted: 0, succeeded: 0, failed: 1 };
  }

  const f = deps.fetch || globalThis.fetch;
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = nowDate.toISOString();
  const validateOnly = mode !== "live";

  const headers = {
    apikey: sb.key,
    Authorization: `Bearer ${sb.key}`,
    "Content-Type": "application/json",
  };

  let queueRows = [];
  try {
    const qRes = await f(
      `${sb.url}/rest/v1/wf_google_conversion_uploads?upload_status=${mode === "live" ? "in.(awaiting_upload,validated_only)" : "eq.awaiting_upload"}&order=created_at.asc&limit=${Math.min(100, Math.max(1, Number(limit) || 25))}`,
      { method: "GET", headers, cache: "no-store" },
    );
    if (!qRes.ok) {
      return { ok: false, mode, reason: `upload_queue_read_http_${qRes.status}`, attempted: 0, succeeded: 0, failed: 1 };
    }
    queueRows = await qRes.json();
  } catch (e) {
    return { ok: false, mode, reason: `upload_queue_read_error:${e?.message || "err"}`, attempted: 0, succeeded: 0, failed: 1 };
  }

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let skippedBeforeUpload = 0;

  for (const row of Array.isArray(queueRows) ? queueRows : []) {
    // Phase 1: Atomically claim row (`in_flight`) and verify booking was not
    // already cancelled before upload.
    let beginRes;
    try {
      const r = await f(`${sb.url}/rest/v1/rpc/wf_google_begin_upload`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_upload_id: row.id,
          p_now: nowIso,
        }),
        cache: "no-store",
      });
      if (!r.ok) {
        failed += 1;
        continue;
      }
      beginRes = await r.json();
    } catch {
      failed += 1;
      continue;
    }

    if (!beginRes || beginRes.ok !== true) {
      if (beginRes?.upload_status === UPLOAD_STATES.CANCELLED_BEFORE_UPLOAD) {
        skippedBeforeUpload += 1;
      }
      continue;
    }

    const bookingRow = beginRes.booking || row;
    attempted += 1;

    const submission = await submitGoogleConversionUpload(
      {
        uploadRow: row,
        bookingRow,
        accessToken,
        developerToken,
        loginCustomerId,
        operatingAccountId,
        conversionActionId: conversionActionId || row.conversion_action_id,
        validateOnly,
        now: nowDate,
      },
      {
        fetch: f,
        endpoint: deps.endpoint,
        adjustmentEndpoint: deps.adjustmentEndpoint,
      },
    );

    // Phase 2: Atomically finalize the upload outcome and re-check whether a
    // concurrent cancellation or amendment landed while the request was in flight.
    try {
      const finRes = await f(`${sb.url}/rest/v1/rpc/wf_google_finalize_upload`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_upload_id: row.id,
          p_outcome_status: submission.upload_status,
          p_validate_only: Boolean(validateOnly),
          p_request_id: submission.request_id || null,
          p_http_status: submission.http_status || null,
          p_conversion_value: submission.conversion_value ?? 0,
          p_value_basis: submission.value_basis || "none",
          p_adjustment_state: submission.adjustment_state || ADJUSTMENT_STATES.NONE,
          p_retraction_required: Boolean(submission.retraction_required),
          p_payload: submission.payload || null,
          p_response_summary: submission.response_summary || null,
          p_error: submission.reason || null,
          p_now: nowIso,
        }),
        cache: "no-store",
      });
      if (finRes.ok && submission.ok) {
        succeeded += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return {
    ok: failed === 0,
    mode,
    attempted,
    succeeded,
    failed,
    skipped_before_upload: skippedBeforeUpload,
  };
}
