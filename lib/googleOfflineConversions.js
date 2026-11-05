// lib/googleOfflineConversions.js — Google Data Manager API offline conversion
// adapter (`https://datamanager.googleapis.com/v1/events:ingest`) AND Google
// Ads API v26 `ConversionAdjustmentUploadService` (`RETRACTION` / `RESTATEMENT`)
// with durable upload ledger (`public.wf_google_conversion_uploads`), OAuth2
// refresh-token rotation, in-flight & abandoned-claim recovery, strict
// customer-value vs commission separation, and `validateOnly` rollout gating.
//
// HONESTY, CONTRACT & FINANCIAL INVARIANTS
// ----------------------------------------
// 1. Google Ads API Version:
//    Targets `v26` (`https://googleads.googleapis.com/v26`). Versions `v1`–`v22`
//    are retired/sunsetted and rejected by `assertSupportedGoogleAdsApiVersion`.
// 2. Account, Tag & Conversion Action Separation:
//    - Wayfind Google Ads Account & Conversion Owner: `553-622-6713` (`5536226713`,
//      account `"Wayfind"`, verified advertiser `"WAYFIND LLC"`).
//    - Wayfind Google Ads Tag ID: `AW-18342267447`.
//    - Primary Website Outbound Click Action: `AW-18342267447/19gpCKCx8NccELeUo6pE`.
//    - Primary Website Sign-Up Action: `AW-18342267447/dXV1CJ2x8NccELeUo6pE`.
//    - Disallowed Account / Tag: `505-826-0233` (`5058260233`) and `AW-18092784888`.
//    - Offline Viator Booking Action (`GOOGLE_ADS_VIATOR_CONVERSION_ACTION_ID`):
//      Must be a dedicated Secondary (observation-only) conversion action in
//      account `553-622-6713`, never reusing the primary website click/sign-up
//      labels.
// 3. Commission vs. Customer Spend Separation:
//    Customer `gross_booking_value` is NEVER used as Wayfind commission. When
//    both `confirmed_commission` and `estimated_commission` are `null` on an
//    active booking, commission remains `null` (`basis = "commission_unknown"`)
//    and the upload is held in `ineligible_missing_commission` until commission
//    is known.
// 4. Google Ads API v26 `ConversionAdjustment` Contract:
//    - Keyed by `orderId = booking_ref` (`transaction_id`).
//    - NEVER sets `gclidDateTimePair` when `orderId` is set (preventing
//      `ConversionAdjustmentUploadError.GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET`).
//    - Validates `adjustmentDateTime` is strictly after `original_booking_at` /
//      `transaction_at` (preventing `ADJUSTMENT_PRECEDES_CONVERSION`).
//    - Omits `restatementValue` on `RETRACTION`; requires `restatementValue`
//      on `RESTATEMENT`.
// 5. Durable OAuth2 Refresh & Queue Recovery:
//    - Mints fresh access tokens via `GOOGLE_ADS_OAUTH_REFRESH_TOKEN` (`oauth2.googleapis.com/token`)
//      and automatically re-mints + retries once on HTTP 401.
//    - Recovers from expired credentials, `timed_out_indeterminate` requests,
//      abandoned `in_flight` claims (`> staleInFlightSeconds`), and `rejected`
//      submissions, and promotes `validated_only` rollout rows into the live
//      upload queue when `uploadMode === "live"`.

export const GOOGLE_DATA_MANAGER_INGEST_URL =
  "https://datamanager.googleapis.com/v1/events:ingest";

export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_ADS_API_VERSION = "v26";
export const GOOGLE_ADS_MIN_SUPPORTED_MAJOR_VERSION = 23;
export const GOOGLE_ADS_API_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

export const WAYFIND_GOOGLE_ADS_ACCOUNT_ID = "5536226713";
export const WAYFIND_GOOGLE_ADS_ACCOUNT_HYPHENATED = "553-622-6713";
export const WAYFIND_GOOGLE_ADS_TAG_ID = "AW-18342267447";
export const WAYFIND_PRIMARY_OUTBOUND_CLICK_LABEL = "19gpCKCx8NccELeUo6pE";
export const WAYFIND_PRIMARY_SIGNUP_LABEL = "dXV1CJ2x8NccELeUo6pE";
export const ROCK_SPRINGS_CAMPAIGN_ID = "24380159401";

export const DISALLOWED_GOOGLE_ADS_ACCOUNT_IDS = Object.freeze(["5058260233"]);
export const DISALLOWED_GOOGLE_ADS_TAG_IDS = Object.freeze(["AW-18092784888"]);
export const DISALLOWED_PRIMARY_WEBSITE_LABELS = Object.freeze([
  WAYFIND_PRIMARY_OUTBOUND_CLICK_LABEL,
  WAYFIND_PRIMARY_SIGNUP_LABEL,
  "jt9fCM7R35wcEPj3rLND",
]);

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
  INELIGIBLE_MISSING_COMMISSION: "ineligible_missing_commission",
  INELIGIBLE_MISSING_CURRENCY: "ineligible_missing_currency",
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

const CURRENCY_RX = /^[A-Z]{3}$/;
const GOOGLE_ADS_DATETIME_RX =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

function cleanAccountDigits(v) {
  return String(v || "").replace(/[^0-9]/g, "");
}

/**
 * Validate that a Google Ads API version string or endpoint URL uses a currently
 * supported major version (`>= v23`, default `v26`) and rejects retired versions
 * (`v1`–`v22`, including `v18`).
 */
export function assertSupportedGoogleAdsApiVersion(
  versionOrUrl = GOOGLE_ADS_API_BASE_URL,
) {
  const s = String(versionOrUrl || "").trim();
  const m = /(?:^|\/)v(\d+)(?:_\d+|\.\d+)?(?=\/|$|:)/i.exec(s);
  if (!m) {
    return {
      ok: false,
      version: null,
      major: null,
      reason: "missing_or_malformed_google_ads_api_version",
    };
  }
  const major = Number(m[1]);
  if (!Number.isFinite(major) || major < GOOGLE_ADS_MIN_SUPPORTED_MAJOR_VERSION) {
    return {
      ok: false,
      version: `v${m[1]}`,
      major,
      reason: `retired_google_ads_api_version:v${m[1]}_min_v${GOOGLE_ADS_MIN_SUPPORTED_MAJOR_VERSION}`,
    };
  }
  return {
    ok: true,
    version: `v${m[1]}`,
    major,
    reason: null,
  };
}

/**
 * Validate that the offline booking conversion upload targets Wayfind's
 * canonical Google Ads account (`553-622-6713`) and a dedicated Secondary
 * booking conversion action — never wrong account `505-826-0233`, wrong tag
 * `AW-18092784888`, or the Primary website `Outbound click` / `Sign-up` labels.
 */
export function validateBookingConversionDestination({
  operatingAccountId = WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
  conversionActionId,
} = {}) {
  const accountDigits =
    cleanAccountDigits(operatingAccountId) || WAYFIND_GOOGLE_ADS_ACCOUNT_ID;
  if (DISALLOWED_GOOGLE_ADS_ACCOUNT_IDS.includes(accountDigits)) {
    return {
      ok: false,
      status: UPLOAD_STATES.REJECTED,
      reason: `disallowed_google_ads_account:${accountDigits}`,
    };
  }
  if (accountDigits !== WAYFIND_GOOGLE_ADS_ACCOUNT_ID) {
    return {
      ok: false,
      status: UPLOAD_STATES.REJECTED,
      reason: `unexpected_google_ads_account:${accountDigits}`,
    };
  }

  const rawAction = String(conversionActionId || "").trim();
  if (!rawAction) {
    return {
      ok: false,
      status: UPLOAD_STATES.AWAITING_UPLOAD,
      reason: "missing_conversion_action_id",
    };
  }

  for (const badTag of DISALLOWED_GOOGLE_ADS_TAG_IDS) {
    if (rawAction.toUpperCase().includes(badTag.toUpperCase())) {
      return {
        ok: false,
        status: UPLOAD_STATES.REJECTED,
        reason: `disallowed_google_ads_tag:${badTag}`,
      };
    }
  }

  for (const primaryLabel of DISALLOWED_PRIMARY_WEBSITE_LABELS) {
    if (
      rawAction === primaryLabel ||
      rawAction.endsWith(`/${primaryLabel}`)
    ) {
      return {
        ok: false,
        status: UPLOAD_STATES.REJECTED,
        reason: `disallowed_primary_website_conversion_action:${primaryLabel}`,
      };
    }
  }

  const actionDigits = cleanAccountDigits(
    rawAction.includes("/conversionActions/")
      ? rawAction.split("/conversionActions/").pop()
      : rawAction,
  );
  if (!actionDigits || actionDigits.length < 6) {
    return {
      ok: false,
      status: UPLOAD_STATES.REJECTED,
      reason: "invalid_conversion_action_id_format",
    };
  }

  return {
    ok: true,
    accountDigits,
    actionDigits,
    conversionActionResourceName: `customers/${accountDigits}/conversionActions/${actionDigits}`,
  };
}

/**
 * Format an ISO timestamp as Google Ads API `YYYY-MM-DD HH:MM:SS+00:00`.
 * Returns `null` if the input is missing or unparseable (never silently
 * substituting `new Date()`).
 */
export function formatGoogleAdsDateTime(isoOrDate) {
  if (isoOrDate === null || isoOrDate === undefined || isoOrDate === "") {
    return null;
  }
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (!Number.isFinite(d.getTime())) {
    return null;
  }
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "+00:00");
}

/**
 * Compute the conversion value and basis for a reconciled Viator booking.
 *
 * STRICT FINANCIAL INVARIANT:
 * - Prefers `confirmed_commission`, then `estimated_commission`.
 * - NEVER substitutes `gross_booking_value` (customer spend) for Wayfind
 *   commission.
 * - When both `confirmed_commission` and `estimated_commission` are `null` on
 *   an active (`confirmed` / `amended`) booking, returns `eligible: false`,
 *   `value: null`, `basis: "commission_unknown"`.
 */
export function selectConversionValue(booking) {
  if (!booking || typeof booking !== "object") {
    return { eligible: false, value: null, basis: "none" };
  }
  if (booking.status === "cancelled" || booking.status === "rejected") {
    return { eligible: true, value: 0, basis: "cancelled_restatement_zero" };
  }
  if (
    booking.confirmed_commission !== null &&
    booking.confirmed_commission !== undefined &&
    booking.confirmed_commission !== "" &&
    Number.isFinite(Number(booking.confirmed_commission)) &&
    Number(booking.confirmed_commission) >= 0
  ) {
    return {
      eligible: true,
      value: Math.round(Number(booking.confirmed_commission) * 100) / 100,
      basis: "confirmed_commission",
    };
  }
  if (
    booking.estimated_commission !== null &&
    booking.estimated_commission !== undefined &&
    booking.estimated_commission !== "" &&
    Number.isFinite(Number(booking.estimated_commission)) &&
    Number(booking.estimated_commission) >= 0
  ) {
    return {
      eligible: true,
      value: Math.round(Number(booking.estimated_commission) * 100) / 100,
      basis: "estimated_commission",
    };
  }
  return {
    eligible: false,
    value: null,
    basis: "commission_unknown",
  };
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
    return {
      eligible: false,
      status: UPLOAD_STATES.REJECTED,
      reason: "missing_booking_ref",
    };
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

  const consentAdUserData = String(
    booking.consent_ad_user_data || "UNKNOWN",
  ).toUpperCase();
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

  const dest = validateBookingConversionDestination({
    operatingAccountId,
    conversionActionId,
  });
  if (!dest.ok) {
    return {
      eligible: false,
      status: dest.status,
      reason: dest.reason,
    };
  }

  const currency =
    typeof booking.currency === "string" &&
    CURRENCY_RX.test(booking.currency.trim().toUpperCase())
      ? booking.currency.trim().toUpperCase()
      : null;

  if (!currency) {
    return {
      eligible: false,
      status: UPLOAD_STATES.INELIGIBLE_MISSING_CURRENCY,
      reason: "missing_currency",
    };
  }

  const selected =
    uploadKind === "cancellation_restatement"
      ? { eligible: true, value: 0, basis: "cancelled_restatement_zero" }
      : selectConversionValue(booking);

  if (!selected.eligible || selected.value === null) {
    return {
      eligible: false,
      status: UPLOAD_STATES.INELIGIBLE_MISSING_COMMISSION,
      reason: "missing_commission_value",
      conversionValue: null,
      valueBasis: selected.basis,
    };
  }

  const eventTimestamp =
    booking.original_booking_at ||
    booking.transaction_at ||
    booking.provider_modified_at ||
    null;

  if (!eventTimestamp || !Number.isFinite(Date.parse(eventTimestamp))) {
    return {
      eligible: false,
      status: UPLOAD_STATES.REJECTED,
      reason: "missing_conversion_timestamp",
    };
  }

  const adIdentifiers = {};
  if (gclid) adIdentifiers.gclid = gclid;
  if (gbraid) adIdentifiers.gbraid = gbraid;
  if (wbraid) adIdentifiers.wbraid = wbraid;

  const body = {
    destinations: [
      {
        operatingAccount: {
          accountType: "GOOGLE_ADS",
          accountId: dest.accountDigits,
        },
        productDestinationId: dest.actionDigits,
      },
    ],
    events: [
      {
        transactionId: String(booking.booking_ref),
        eventTimestamp: new Date(Date.parse(eventTimestamp)).toISOString(),
        adIdentifiers,
        consent: {
          adUserData: "GRANTED",
          adPersonalization:
            consentAdPersonalization === "GRANTED" ? "GRANTED" : "DENIED",
        },
        conversionValue: selected.value,
        currency,
      },
    ],
    validateOnly: Boolean(validateOnly),
  };

  return {
    eligible: true,
    status: validateOnly ? UPLOAD_STATES.VALIDATED_ONLY : UPLOAD_STATES.SUBMITTED,
    conversionValue: selected.value,
    valueBasis: selected.basis,
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
 * Validate a Google Ads API v26 `UploadConversionAdjustmentsRequest` payload
 * and endpoint against Google's current contract:
 *   1. Endpoint version must be `>= v23` (`v26` current; `v1`–`v22` retired).
 *   2. `partialFailure` must be `true`.
 *   3. Each `ConversionAdjustment` must set `orderId` OR `gclidDateTimePair`,
 *      NEVER both (`GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET`).
 *   4. `adjustmentDateTime` must match `YYYY-MM-DD HH:MM:SS+|-HH:MM`.
 *   5. `RETRACTION` must NOT supply `restatementValue`; `RESTATEMENT` MUST
 *      supply `restatementValue` with a finite non-negative `adjustedValue`
 *      and 3-letter `currencyCode`.
 */
export function validateGoogleAdsConversionAdjustmentPayload(
  body,
  { endpoint = GOOGLE_ADS_API_BASE_URL, conversionTimestamp = null } = {},
) {
  const versionCheck = assertSupportedGoogleAdsApiVersion(endpoint);
  if (!versionCheck.ok) {
    return { ok: false, reason: versionCheck.reason };
  }
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "adjustment_body_not_object" };
  }
  if (body.partialFailure !== true) {
    return { ok: false, reason: "partial_failure_must_be_true" };
  }
  if (
    !Array.isArray(body.conversionAdjustments) ||
    body.conversionAdjustments.length === 0 ||
    body.conversionAdjustments.length > 2000
  ) {
    return { ok: false, reason: "invalid_conversion_adjustments_array" };
  }

  for (const adj of body.conversionAdjustments) {
    if (!adj || typeof adj !== "object") {
      return { ok: false, reason: "adjustment_item_not_object" };
    }
    if (
      !/^customers\/[0-9]{8,16}\/conversionActions\/[0-9]{6,20}$/.test(
        String(adj.conversionAction || ""),
      )
    ) {
      return { ok: false, reason: "invalid_conversion_action_resource_name" };
    }
    const hasOrderId =
      typeof adj.orderId === "string" && adj.orderId.trim().length > 0;
    const hasGclidPair =
      adj.gclidDateTimePair !== undefined && adj.gclidDateTimePair !== null;

    if (hasOrderId && hasGclidPair) {
      return {
        ok: false,
        reason: "GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET",
      };
    }
    if (!hasOrderId && !hasGclidPair) {
      return {
        ok: false,
        reason: "missing_order_id_or_gclid_date_time_pair",
      };
    }
    if (!GOOGLE_ADS_DATETIME_RX.test(String(adj.adjustmentDateTime || ""))) {
      return {
        ok: false,
        reason: "invalid_adjustment_date_time_format",
      };
    }
    if (conversionTimestamp) {
      const convMs = Date.parse(String(conversionTimestamp).replace(" ", "T"));
      const adjMs = Date.parse(String(adj.adjustmentDateTime).replace(" ", "T"));
      if (Number.isFinite(convMs) && Number.isFinite(adjMs) && adjMs <= convMs) {
        return {
          ok: false,
          reason: "ADJUSTMENT_PRECEDES_CONVERSION",
        };
      }
    }
    if (adj.adjustmentType === "RETRACTION") {
      if (adj.restatementValue !== undefined && adj.restatementValue !== null) {
        return {
          ok: false,
          reason: "restatement_value_not_permitted_on_retraction",
        };
      }
    } else if (adj.adjustmentType === "RESTATEMENT") {
      if (
        !adj.restatementValue ||
        typeof adj.restatementValue !== "object" ||
        !Number.isFinite(Number(adj.restatementValue.adjustedValue)) ||
        Number(adj.restatementValue.adjustedValue) < 0 ||
        !CURRENCY_RX.test(String(adj.restatementValue.currencyCode || ""))
      ) {
        return {
          ok: false,
          reason: "invalid_or_missing_restatement_value",
        };
      }
    } else {
      return {
        ok: false,
        reason: `unsupported_adjustment_type:${adj.adjustmentType}`,
      };
    }
  }

  return { ok: true, version: versionCheck.version };
}

/**
 * Build a Google Ads API v26 `ConversionAdjustmentUploadService` payload for
 * true conversion count + value `RETRACTION` (on cancellation) or commission
 * value `RESTATEMENT` (on amendment), keyed exclusively by `orderId = booking_ref`.
 */
export function buildGoogleAdsConversionAdjustmentPayload({
  booking,
  uploadKind = "cancellation_restatement",
  operatingAccountId = WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
  conversionActionId,
  adjustmentTimestamp = null,
  apiBaseUrl = GOOGLE_ADS_API_BASE_URL,
  validateOnly = true,
} = {}) {
  const versionCheck = assertSupportedGoogleAdsApiVersion(apiBaseUrl);
  if (!versionCheck.ok) {
    return {
      eligible: false,
      status: UPLOAD_STATES.REJECTED,
      reason: versionCheck.reason,
    };
  }

  if (!booking || !booking.booking_ref) {
    return {
      eligible: false,
      status: UPLOAD_STATES.REJECTED,
      reason: "missing_booking_ref",
    };
  }

  const dest = validateBookingConversionDestination({
    operatingAccountId,
    conversionActionId,
  });
  if (!dest.ok) {
    return {
      eligible: false,
      status: dest.status,
      reason: dest.reason,
    };
  }

  const isRetraction = uploadKind === "cancellation_restatement";
  const adjustmentType = isRetraction ? "RETRACTION" : "RESTATEMENT";
  const selected = isRetraction
    ? { eligible: true, value: 0, basis: "cancelled_retraction" }
    : selectConversionValue(booking);

  if (!selected.eligible || selected.value === null) {
    return {
      eligible: false,
      status: UPLOAD_STATES.INELIGIBLE_MISSING_COMMISSION,
      reason: "missing_commission_value",
      valueBasis: selected.basis,
    };
  }

  const rawAdjTime = isRetraction
    ? booking.cancellation_at ||
      booking.provider_modified_at ||
      adjustmentTimestamp
    : booking.provider_modified_at || adjustmentTimestamp;

  const formattedAdjDateTime = formatGoogleAdsDateTime(rawAdjTime);
  if (!formattedAdjDateTime) {
    return {
      eligible: false,
      status: UPLOAD_STATES.REJECTED,
      reason: "missing_adjustment_timestamp",
    };
  }

  const conversionTimeIso =
    booking.original_booking_at || booking.transaction_at || null;
  if (conversionTimeIso) {
    const convMs = Date.parse(conversionTimeIso);
    const adjMs = Date.parse(String(rawAdjTime));
    if (Number.isFinite(convMs) && Number.isFinite(adjMs) && adjMs <= convMs) {
      return {
        eligible: false,
        status: UPLOAD_STATES.REJECTED,
        reason: "ADJUSTMENT_PRECEDES_CONVERSION",
      };
    }
  }

  // Per Google Ads API v26 ConversionAdjustment contract:
  // Because initial conversions are uploaded with `transactionId = booking_ref`
  // (`order_id`), adjustments MUST identify the conversion via `orderId` and
  // MUST NOT also set `gclidDateTimePair` (`GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET`).
  const adjustment = {
    conversionAction: dest.conversionActionResourceName,
    adjustmentType,
    orderId: String(booking.booking_ref),
    adjustmentDateTime: formattedAdjDateTime,
  };

  if (!isRetraction) {
    const currency =
      typeof booking.currency === "string" &&
      CURRENCY_RX.test(booking.currency.trim().toUpperCase())
        ? booking.currency.trim().toUpperCase()
        : null;
    if (!currency) {
      return {
        eligible: false,
        status: UPLOAD_STATES.INELIGIBLE_MISSING_CURRENCY,
        reason: "missing_currency",
      };
    }
    adjustment.restatementValue = {
      adjustedValue: selected.value,
      currencyCode: currency,
    };
  }

  const cleanBase = String(apiBaseUrl).replace(/\/+$/, "");
  const endpoint = `${cleanBase}/customers/${dest.accountDigits}:uploadConversionAdjustments`;
  const body = {
    conversionAdjustments: [adjustment],
    partialFailure: true,
    validateOnly: Boolean(validateOnly),
  };

  const contractCheck = validateGoogleAdsConversionAdjustmentPayload(body, {
    endpoint,
    conversionTimestamp: conversionTimeIso,
  });
  if (!contractCheck.ok) {
    return {
      eligible: false,
      status: UPLOAD_STATES.REJECTED,
      reason: contractCheck.reason,
    };
  }

  return {
    eligible: true,
    status: validateOnly ? UPLOAD_STATES.VALIDATED_ONLY : UPLOAD_STATES.SUBMITTED,
    conversionValue: selected.value,
    valueBasis: selected.basis,
    adjustmentType,
    adjustmentState: isRetraction
      ? ADJUSTMENT_STATES.RETRACTED_COUNT_AND_VALUE
      : ADJUSTMENT_STATES.RESTATED_VALUE,
    retractionRequired: false,
    apiVersion: contractCheck.version,
    endpoint,
    body,
  };
}

// In-process OAuth2 access-token cache keyed by clientId + refreshToken tail.
let cachedOAuthToken = {
  cacheKey: null,
  accessToken: null,
  expiresAtMs: 0,
};

export function resetGoogleOAuthTokenCache() {
  cachedOAuthToken = { cacheKey: null, accessToken: null, expiresAtMs: 0 };
}

/**
 * Resolve a durable Google OAuth2 access token for scheduled cron execution.
 * When `refreshToken`, `clientId`, and `clientSecret` are provided, exchanges
 * the refresh token at `https://oauth2.googleapis.com/token` (`grant_type=refresh_token`)
 * and caches the minted access token until 60s before expiry. Supports
 * `forceRefresh: true` to recover immediately when a cached or static token
 * receives HTTP 401 (`UNAUTHENTICATED`).
 */
export async function resolveGoogleOAuthAccessToken(
  {
    clientId = null,
    clientSecret = null,
    refreshToken = null,
    accessToken = null,
    forceRefresh = false,
    now = new Date(),
  } = {},
  { fetch: f = globalThis.fetch, tokenEndpoint = GOOGLE_OAUTH_TOKEN_URL } = {},
) {
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  const hasRefreshCreds = Boolean(
    clientId &&
      typeof clientId === "string" &&
      clientSecret &&
      typeof clientSecret === "string" &&
      refreshToken &&
      typeof refreshToken === "string",
  );

  if (hasRefreshCreds) {
    const cacheKey = `${clientId.trim()}|${refreshToken.trim().slice(-12)}`;
    if (
      !forceRefresh &&
      cachedOAuthToken.cacheKey === cacheKey &&
      cachedOAuthToken.accessToken &&
      cachedOAuthToken.expiresAtMs - 60_000 > nowMs
    ) {
      return {
        ok: true,
        accessToken: cachedOAuthToken.accessToken,
        source: "oauth_refresh_cache",
      };
    }

    const params = new URLSearchParams({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      refresh_token: refreshToken.trim(),
      grant_type: "refresh_token",
    });

    let res;
    try {
      res = await f(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      return {
        ok: false,
        accessToken: null,
        source: "oauth_refresh_token",
        reason: `oauth_refresh_network_error:${e?.message || "fetch"}`,
      };
    }

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok || !body || typeof body.access_token !== "string" || !body.access_token.trim()) {
      const errCode =
        body?.error_description || body?.error || `http_${res.status}`;
      cachedOAuthToken = { cacheKey: null, accessToken: null, expiresAtMs: 0 };
      return {
        ok: false,
        accessToken: null,
        source: "oauth_refresh_token",
        http_status: res.status,
        reason: `oauth_refresh_failed:${String(errCode).slice(0, 160)}`,
      };
    }

    const expiresInSec = Number(body.expires_in);
    const ttlMs =
      Number.isFinite(expiresInSec) && expiresInSec > 60
        ? expiresInSec * 1000
        : 3600 * 1000;
    cachedOAuthToken = {
      cacheKey,
      accessToken: body.access_token.trim(),
      expiresAtMs: nowMs + ttlMs,
    };
    return {
      ok: true,
      accessToken: cachedOAuthToken.accessToken,
      source: "oauth_refresh_token",
    };
  }

  if (accessToken && typeof accessToken === "string" && accessToken.trim()) {
    return {
      ok: true,
      accessToken: accessToken.trim(),
      source: "static_access_token",
    };
  }

  return {
    ok: false,
    accessToken: null,
    source: "none",
    reason: "missing_google_oauth_credentials",
  };
}

/**
 * Submit a conversion adjustment (`RETRACTION` or `RESTATEMENT`) via the
 * Google Ads API v26 `ConversionAdjustmentUploadService`.
 */
export async function submitGoogleAdsConversionAdjustment(
  {
    uploadRow,
    bookingRow,
    accessToken,
    developerToken,
    loginCustomerId,
    operatingAccountId = WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
    conversionActionId,
    apiBaseUrl = GOOGLE_ADS_API_BASE_URL,
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
    apiBaseUrl: endpoint || apiBaseUrl,
    validateOnly,
  });

  if (!built.eligible) {
    return {
      ok: false,
      upload_status: built.status,
      reason: built.reason,
      conversion_value: built.conversionValue ?? null,
      value_basis: built.valueBasis || "none",
      adjustment_state:
        uploadKind === "cancellation_restatement"
          ? ADJUSTMENT_STATES.PENDING_RETRACTION
          : ADJUSTMENT_STATES.PENDING_RESTATEMENT,
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
      payload: built.body,
      attempted_at: nowIso,
    };
  }

  let resBody = null;
  try {
    resBody = await res.json();
  } catch {
    resBody = null;
  }

  const partialFailureError =
    resBody?.partialFailureError || resBody?.error || null;
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
      payload: built.body,
      attempted_at: nowIso,
    };
  }

  const requestId = resBody?.requestId || `gads_adj_${Date.now()}`;
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
 * (or Google Ads API v26 ConversionAdjustmentUploadService when retracting or
 * restating with a `developerToken`).
 */
export async function submitGoogleConversionUpload(
  {
    uploadRow,
    bookingRow,
    accessToken,
    developerToken = null,
    loginCustomerId = null,
    operatingAccountId = WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
    conversionActionId,
    validateOnly = true,
    now = new Date(),
  } = {},
  {
    fetch: f = globalThis.fetch,
    endpoint = GOOGLE_DATA_MANAGER_INGEST_URL,
    adjustmentEndpoint,
  } = {},
) {
  const uploadKind = uploadRow?.upload_kind || "initial_booking";

  if (
    (uploadKind === "cancellation_restatement" ||
      uploadKind === "amendment_restatement") &&
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
      conversion_value: built.conversionValue ?? null,
      value_basis: built.valueBasis || "none",
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
      payload: built.body,
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
    (Array.isArray(resBody?.errors) && resBody.errors.length > 0
      ? resBody.errors
      : null);

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
      payload: built.body,
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
 * Process queued rows in `public.wf_google_conversion_uploads` using:
 *   1. Durable OAuth2 token refresh (`resolveGoogleOAuthAccessToken`) with
 *      automatic 401 token re-minting & retry.
 *   2. Queue selection covering `awaiting_upload`, `validated_only` (when
 *      `uploadMode === "live"`, proving rollout-validated rows advance to live
 *      upload), `rejected`, `timed_out_indeterminate`, and stale `in_flight`
 *      claims (`> staleInFlightSeconds`).
 *   3. Two-phase `wf_google_begin_upload` -> network call -> `wf_google_finalize_upload`
 *      state machine.
 */
export async function processGoogleConversionUploadQueue(
  {
    sb,
    uploadMode = "off",
    accessToken = null,
    clientId = null,
    clientSecret = null,
    refreshToken = null,
    developerToken = null,
    loginCustomerId = null,
    operatingAccountId = WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
    conversionActionId = null,
    staleInFlightSeconds = 300,
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
    return {
      ok: false,
      mode,
      reason: "missing_supabase_admin",
      attempted: 0,
      succeeded: 0,
      failed: 1,
    };
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

  // In `live` mode, include `validated_only` rows so records validated during
  // rollout (`validate_only` mode) automatically reach the live upload queue,
  // plus `rejected`, `timed_out_indeterminate`, and `in_flight` (filtered by
  // `wf_google_begin_upload` to reclaim only stale abandoned claims).
  const candidateStatuses = validateOnly
    ? [
        UPLOAD_STATES.AWAITING_UPLOAD,
        UPLOAD_STATES.REJECTED,
        UPLOAD_STATES.TIMED_OUT_INDETERMINATE,
        UPLOAD_STATES.IN_FLIGHT,
      ]
    : [
        UPLOAD_STATES.AWAITING_UPLOAD,
        UPLOAD_STATES.VALIDATED_ONLY,
        UPLOAD_STATES.REJECTED,
        UPLOAD_STATES.TIMED_OUT_INDETERMINATE,
        UPLOAD_STATES.IN_FLIGHT,
      ];

  let queueRows = [];
  try {
    const statusFilter = `upload_status=in.(${candidateStatuses.join(",")})`;
    const qRes = await f(
      `${sb.url}/rest/v1/wf_google_conversion_uploads?${statusFilter}&order=created_at.asc&limit=${Math.min(100, Math.max(1, Number(limit) || 25))}`,
      { method: "GET", headers, cache: "no-store" },
    );
    if (!qRes.ok) {
      return {
        ok: false,
        mode,
        reason: `upload_queue_read_http_${qRes.status}`,
        attempted: 0,
        succeeded: 0,
        failed: 1,
      };
    }
    queueRows = await qRes.json();
  } catch (e) {
    return {
      ok: false,
      mode,
      reason: `upload_queue_read_error:${e?.message || "err"}`,
      attempted: 0,
      succeeded: 0,
      failed: 1,
    };
  }

  const candidateList = Array.isArray(queueRows) ? queueRows : [];
  if (candidateList.length === 0) {
    return {
      ok: true,
      mode,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped_before_upload: 0,
    };
  }

  // Resolve OAuth2 access token before claiming rows (using refresh token when
  // configured so scheduled runs never fail due to a 1-hour expired access token).
  let tokenState = await resolveGoogleOAuthAccessToken(
    {
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
      forceRefresh: false,
      now: nowDate,
    },
    { fetch: f, tokenEndpoint: deps.tokenEndpoint },
  );

  if (!tokenState.ok) {
    return {
      ok: false,
      mode,
      reason: tokenState.reason || "oauth_token_resolution_failed",
      attempted: candidateList.length,
      succeeded: 0,
      failed: candidateList.length,
      skipped_before_upload: 0,
    };
  }

  let currentAccessToken = tokenState.accessToken;
  const canRefreshOn401 = Boolean(clientId && clientSecret && refreshToken);

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let skippedBeforeUpload = 0;
  let reclaimedAbandoned = 0;

  for (const row of candidateList) {
    // Phase 1: Atomically claim row (`in_flight`), reclaiming abandoned claims
    // older than `staleInFlightSeconds` and skipping active `in_flight` rows.
    let beginRes;
    try {
      const r = await f(`${sb.url}/rest/v1/rpc/wf_google_begin_upload`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_upload_id: row.id,
          p_now: nowIso,
          p_stale_in_flight_seconds: staleInFlightSeconds,
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

    if (beginRes.reclaimed_abandoned) {
      reclaimedAbandoned += 1;
    }

    const bookingRow = beginRes.booking || row;
    attempted += 1;

    let submission = await submitGoogleConversionUpload(
      {
        uploadRow: row,
        bookingRow,
        accessToken: currentAccessToken,
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

    // If the access token expired mid-run (HTTP 401) and OAuth2 refresh
    // credentials are available, force a token refresh and retry once.
    if (!submission.ok && submission.http_status === 401 && canRefreshOn401) {
      const refreshed = await resolveGoogleOAuthAccessToken(
        {
          clientId,
          clientSecret,
          refreshToken,
          accessToken: null,
          forceRefresh: true,
          now: nowDate,
        },
        { fetch: f, tokenEndpoint: deps.tokenEndpoint },
      );
      if (refreshed.ok && refreshed.accessToken) {
        currentAccessToken = refreshed.accessToken;
        submission = await submitGoogleConversionUpload(
          {
            uploadRow: row,
            bookingRow,
            accessToken: currentAccessToken,
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
      }
    }

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
          p_conversion_value: submission.conversion_value ?? null,
          p_value_basis: submission.value_basis || "commission_unknown",
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
    oauth_source: tokenState.source,
    attempted,
    succeeded,
    failed,
    skipped_before_upload: skippedBeforeUpload,
    reclaimed_abandoned: reclaimedAbandoned,
  };
}
