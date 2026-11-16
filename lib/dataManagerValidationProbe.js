// lib/dataManagerValidationProbe.js
//
// Proves, from the deployed runtime, that Wayfind can reach Google's Data
// Manager API for the Viator booking conversion action, WITHOUT sending a
// real conversion:
//
//   1. the OAuth refresh token is exchanged for a fresh access token (the
//      same path the uploader uses), and the grant includes the datamanager
//      scope;
//   2. ONE clearly labeled fixture event is sent to events:ingest with
//      validateOnly: true, to the configured account + conversion action;
//   3. the response is read (HTTP status, google.rpc error status, field
//      violations, ErrorInfo reasons) and returned as a redacted receipt.
//
// Hard rules:
//   - validateOnly is a constant here. The body is checked after it is built
//     and the request is refused unless body.validateOnly === true. There is
//     no parameter that can turn this into a live upload.
//   - The fixture never touches wf_viator_bookings, the upload ledger,
//     revenue or analytics tables. It is a request only.
//   - No token, secret or click identifier is ever placed in the receipt.
//   - Missing credentials make NO network call ("not_configured").
//
// A validateOnly request checks the request, not matching or ingestion. A
// PASS here is authentication + request validation, never booking
// attribution.

import {
  GOOGLE_DATA_MANAGER_INGEST_URL,
  buildGoogleDataManagerEventPayload,
  resolveGoogleOAuthAccessToken,
} from "./googleOfflineConversions.js";

export const DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";
export const VALIDATION_FIXTURE_LABEL = "WAYFIND-DM-VALIDATION-FIXTURE";
// Not a real Google click ID. Labeled so nobody can mistake it for one.
const FIXTURE_GCLID = "WAYFIND_VALIDATION_FIXTURE_NOT_A_REAL_CLICK";

function clip(v, n = 160) {
  return String(v == null ? "" : v).slice(0, n);
}

// Strip anything token-like or the fixture click value out of Google's text.
function redact(text) {
  return clip(text, 200)
    .split(FIXTURE_GCLID).join("<fixture_gclid>")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "<token>")
    .replace(/1\/\/[A-Za-z0-9._-]{10,}/g, "<token>");
}

/** Summarize a Google API error body without echoing identifiers. */
export function summarizeGoogleError(body) {
  const err = body && typeof body === "object" ? body.error : null;
  if (!err || typeof err !== "object") return null;
  const violations = [];
  const reasons = [];
  for (const d of Array.isArray(err.details) ? err.details : []) {
    if (!d || typeof d !== "object") continue;
    if (Array.isArray(d.fieldViolations)) {
      for (const fv of d.fieldViolations.slice(0, 10)) {
        violations.push({
          field: clip(fv?.field, 120),
          reason: clip(fv?.reason, 80) || null,
          description: redact(fv?.description),
        });
      }
    }
    if (typeof d.reason === "string") reasons.push(clip(d.reason, 80));
  }
  return {
    code: Number.isFinite(Number(err.code)) ? Number(err.code) : null,
    status: clip(err.status, 60) || null,
    message: redact(err.message),
    reasons,
    field_violations: violations,
  };
}

// Field violations that only concern the fixture's identifiers or value are
// expected (the click ID is fake). Anything about destinations, the account
// or the conversion action is not.
const FIXTURE_ONLY_FIELD_RX = /^events(\[\d+\])?\.(ad_?identifiers|adIdentifiers|transaction_?id|transactionId|conversion_?value|conversionValue)/i;
const DESTINATION_RX = /destination|operating_?account|operatingAccount|product_?destination|productDestination|login_?account/i;

/**
 * Classify the outcome. `reached_destination` means Google authenticated the
 * caller and parsed the request for this account/action: a 2xx, or a 400
 * whose only complaints are about the fixture event's own fields.
 */
export function classifyValidation(httpStatus, err) {
  if (httpStatus >= 200 && httpStatus < 300) return { outcome: "validated_ok", reached_destination: true };
  if (httpStatus === 401) return { outcome: "auth_rejected", reached_destination: false };
  if (httpStatus === 403) return { outcome: "permission_denied", reached_destination: false };
  if (httpStatus === 404) return { outcome: "destination_not_found", reached_destination: false };
  if (httpStatus === 400 && err) {
    const fields = err.field_violations.map((v) => v.field);
    const destinationProblem =
      fields.some((f) => DESTINATION_RX.test(f)) || err.reasons.some((r) => DESTINATION_RX.test(r));
    if (!destinationProblem && fields.length > 0 && fields.every((f) => FIXTURE_ONLY_FIELD_RX.test(f))) {
      return { outcome: "fixture_rejected_destination_ok", reached_destination: true };
    }
    return { outcome: destinationProblem ? "destination_invalid" : "request_invalid", reached_destination: false };
  }
  return { outcome: `http_${httpStatus}`, reached_destination: false };
}

/**
 * Run the probe. Never throws; always returns a redacted receipt.
 */
export async function runDataManagerValidationProbe(
  { clientId, clientSecret, refreshToken, operatingAccountId, conversionActionId, now = new Date() } = {},
  { fetch: f = globalThis.fetch, endpoint = GOOGLE_DATA_MANAGER_INGEST_URL, tokenEndpoint } = {},
) {
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  const receipt = {
    kind: "data_manager_validate_only_probe",
    label: VALIDATION_FIXTURE_LABEL,
    at,
    destination: {
      operating_account_id: operatingAccountId ? clip(operatingAccountId, 20) : null,
      conversion_action_id: conversionActionId ? clip(conversionActionId, 20) : null,
    },
    validate_only: true,
  };

  const missing = [];
  if (!clientId) missing.push("GOOGLE_ADS_OAUTH_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_ADS_OAUTH_CLIENT_SECRET");
  if (!refreshToken) missing.push("GOOGLE_ADS_OAUTH_REFRESH_TOKEN");
  if (!operatingAccountId) missing.push("GOOGLE_ADS_OPERATING_ACCOUNT_ID");
  if (!conversionActionId) missing.push("GOOGLE_ADS_VIATOR_CONVERSION_ACTION_ID");
  if (missing.length) return { ...receipt, outcome: "not_configured", missing };

  // Always a fresh exchange: the point is to prove refresh works right now.
  const tok = await resolveGoogleOAuthAccessToken(
    { clientId, clientSecret, refreshToken, forceRefresh: true, now },
    { fetch: f, ...(tokenEndpoint ? { tokenEndpoint } : {}) },
  );
  if (!tok.ok || !tok.accessToken) {
    return {
      ...receipt,
      outcome: "token_refresh_failed",
      token_refresh: { ok: false, http_status: tok.http_status ?? null, reason: redact(tok.reason) },
    };
  }
  const scopes = String(tok.scope || "").split(/\s+/).filter(Boolean);
  const token_refresh = {
    ok: true,
    source: tok.source,
    scope_reported: scopes.length > 0,
    has_datamanager_scope: scopes.includes(DATA_MANAGER_SCOPE),
  };
  if (scopes.length > 0 && !token_refresh.has_datamanager_scope) {
    return { ...receipt, outcome: "missing_datamanager_scope", token_refresh };
  }

  const eventAt = new Date(new Date(at).getTime() - 60 * 60 * 1000).toISOString();
  const built = buildGoogleDataManagerEventPayload({
    booking: {
      booking_ref: `${VALIDATION_FIXTURE_LABEL}-${at.slice(0, 10)}`,
      gclid: FIXTURE_GCLID,
      upload_consent_basis: "not_required_region",
      consent_ad_user_data: "UNKNOWN",
      consent_ad_personalization: "UNKNOWN",
      confirmed_commission: 0,
      currency: "USD",
      original_booking_at: eventAt,
      status: "confirmed",
    },
    operatingAccountId,
    conversionActionId,
    validateOnly: true,
    now,
  });
  if (!built.eligible || !built.body) {
    return { ...receipt, outcome: "fixture_build_refused", token_refresh, reason: clip(built.reason, 120) };
  }
  // The one guard that matters: never send unless this is validation only.
  if (built.body.validateOnly !== true) {
    return { ...receipt, outcome: "refused_not_validate_only", token_refresh };
  }

  let res;
  try {
    res = await f(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { ...receipt, outcome: "network_error", token_refresh, reason: redact(e?.message) };
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const err = summarizeGoogleError(body);
  const cls = classifyValidation(res.status, err);
  return {
    ...receipt,
    ...cls,
    token_refresh,
    http_status: res.status,
    response_keys: body && typeof body === "object" ? Object.keys(body).slice(0, 10) : [],
    request_id_present: Boolean(body && typeof body.requestId === "string"),
    error: err,
  };
}

/** Short one-line form for a job pulse note. */
export function probePulseNote(r) {
  if (!r) return "dm=none";
  const v = r.error && r.error.field_violations ? r.error.field_violations.length : 0;
  return `dm=${r.outcome}${r.http_status ? `/${r.http_status}` : ""}${r.token_refresh?.has_datamanager_scope ? "/scope" : ""}${v ? `/fv${v}` : ""}`;
}
