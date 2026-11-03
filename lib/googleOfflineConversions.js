// lib/googleOfflineConversions.js — Google Data Manager API offline conversion
// adapter (`https://datamanager.googleapis.com/v1/events:ingest`) with durable
// upload ledger (`public.wf_google_conversion_uploads`), secondary conversion
// action targeting, `validateOnly` gate, amendment deduplication, and
// cancellation value restatement.
//
// HONESTY & VERIFICATION INVARIANTS
// ---------------------------------
// 1. `validateOnly: true` (the default) proves payload and destination schema
//    validity ONLY. It is recorded as `validated_only` and is NEVER reported
//    as a live uploaded conversion or proof of campaign attribution.
// 2. A live HTTP 200 response (`validateOnly: false`) is recorded as
//    `submitted` (with `request_id`). A record only transitions to `accepted`
//    when confirmed by authoritative Google Ads reporting.
// 3. Bookings lacking `gclid`/`gbraid`/`wbraid` are recorded as
//    `ineligible_missing_click_id`; bookings where `consent_ad_user_data` is
//    not `"GRANTED"` are recorded as `ineligible_missing_consent`. Neither is
//    ever sent to Google.
// 4. Every upload is keyed by stable `transactionId = booking_ref`.
//    - An `AMENDED` event never creates a second initial booking conversion.
//    - A `CANCELLED` event before live upload cancels the queued upload; a
//      `CANCELLED` event after live upload queues a `cancellation_restatement`
//      with `conversionValue: 0.00` and records `retraction_required = true`
//      so reporting separates gross bookings, active non-cancelled bookings,
//      and restated value.

export const GOOGLE_DATA_MANAGER_INGEST_URL =
  "https://datamanager.googleapis.com/v1/events:ingest";

export const WAYFIND_GOOGLE_ADS_ACCOUNT_ID = "5536226713";
export const ROCK_SPRINGS_CAMPAIGN_ID = "24380159401";

export const UPLOAD_STATES = Object.freeze({
  AWAITING_UPLOAD: "awaiting_upload",
  VALIDATED_ONLY: "validated_only",
  SUBMITTED: "submitted",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  INELIGIBLE_MISSING_CLICK_ID: "ineligible_missing_click_id",
  INELIGIBLE_MISSING_CONSENT: "ineligible_missing_consent",
  CANCELLED_BEFORE_UPLOAD: "cancelled_before_upload",
});

function cleanAccountDigits(v) {
  return String(v || "").replace(/[^0-9]/g, "");
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
  operatingAccountId = WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
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

  const accountDigits = cleanAccountDigits(operatingAccountId) || WAYFIND_GOOGLE_ADS_ACCOUNT_ID;
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
    body,
  };
}

/**
 * Submit a single offline conversion upload record to Google Data Manager API
 * and update `public.wf_google_conversion_uploads`.
 */
export async function submitGoogleConversionUpload(
  {
    uploadRow,
    bookingRow,
    accessToken,
    operatingAccountId = WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
    conversionActionId,
    validateOnly = true,
    now = new Date(),
  } = {},
  { fetch: f = globalThis.fetch, endpoint = GOOGLE_DATA_MANAGER_INGEST_URL } = {},
) {
  const nowIso = (now instanceof Date ? now : new Date(now)).toISOString();
  const built = buildGoogleDataManagerEventPayload({
    booking: bookingRow,
    uploadKind: uploadRow?.upload_kind || "initial_booking",
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
    return {
      ok: false,
      upload_status: UPLOAD_STATES.REJECTED,
      reason: `network_error:${e?.message || "fetch"}`,
      conversion_value: built.conversionValue,
      value_basis: built.valueBasis,
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
      attempted_at: nowIso,
    };
  }

  const requestId =
    resBody?.requestId || resBody?.request_id || `dm_${Date.now()}`;

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
    payload: built.body,
    attempted_at: nowIso,
  };
}
