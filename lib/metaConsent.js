// lib/metaConsent.js — the gate in front of every live Meta Conversions API send.
//
// WHY THIS EXISTS (2026-11-15). PartnerHandoff carries a visitor's IP address,
// user agent, _fbp and _fbc (which can embed the Facebook click id). That is
// identifying tracking data, and Wayfind has NO approved consent policy for
// sending it to Meta. So the sender is BLOCKED BY DEFAULT: a Meta access token
// alone never makes a real visitor's event leave the building. An operator must
// also set META_CAPI_CONSENT_POLICY to a policy this file knows.
//
// POLICIES (env META_CAPI_CONSENT_POLICY)
//   blocked    DEFAULT. Unset, empty or ANY unrecognized value is blocked.
//   us_no_gpc  Send only for a visitor whose edge country is exactly US, whose
//              request has no Sec-GPC: 1, and who has no stored denial signal
//              (wf_ad_ctx cookie with ad_user_data or ad_personalization
//              DENIED). Every event then carries Meta Limited Data Use
//              (LDU, country 0, state 0 = let Meta geolocate).
// uploadConsentBasis() in lib/adConsentRegion.js is NOT reused as an
// authorization: it answers a Google Ads question (EEA/UK/CH) and treats
// "any non-EEA country" as allowed. This gate is deliberately narrower: US only.
//
// QA LANE (independent of policy). A maintainer can verify delivery in Events
// Manager > Test Events with a REAL browser, but only when ALL hold:
//   1. the session is marked test (is_test true/"true" or a non-empty wf_test),
//   2. env META_CAPI_TEST_EVENT_CODE matches /^TEST\w{1,40}$/,
//   3. cookie wf_meta_qa equals env META_CAPI_QA_SECRET (>= 24 chars,
//      constant-time compare).
// A QA event always carries test_event_code; a real-visitor event NEVER does.
// Meta does NOT drop test-coded events: they also flow into Events Manager and
// are used for targeting and measurement (developers.facebook.com, Conversions
// API "Using the API", checked 2026-11-15). So the QA lane is only for a
// maintainer's own browser, never a visitor. The test code comes ONLY from
// server env, never from the client (the browser marker wf_meta_test used by the
// OutboundTicketClick relay is NOT trusted here).
import { timingSafeEqual } from "node:crypto";
import { gpcFromHeaders, countryFromHeaders } from "./adConsentRegion.js";
import { readAdClickContextFromCookieHeader } from "./adClickCookie.js";
import { isSyntheticMonitor } from "./crawler.js";
import { classifySyntheticTraffic, classifyExecutionIdentity, evaluateProductionWrite } from "./productionWriteFirewall.js";

export const CONSENT_POLICY_ENV = "META_CAPI_CONSENT_POLICY";
export const CONSENT_POLICIES = Object.freeze(["blocked", "us_no_gpc"]);
export const QA_COOKIE = "wf_meta_qa";
export const QA_SECRET_MIN = 24;
export const QA_CODE_RX = /^TEST\w{1,40}$/;

/** Meta Limited Data Use, Meta geolocation (country 0, state 0). */
export const LDU_FIELDS = Object.freeze({
  data_processing_options: Object.freeze(["LDU"]),
  data_processing_options_country: 0,
  data_processing_options_state: 0,
});

const SUPPRESS = "WF_SUPPRESS_ANALYTICS";

const hget = (h, k) => {
  try { const v = h && typeof h.get === "function" ? h.get(k) : h && h[k]; return v == null ? "" : String(v).trim(); } catch (e) { return ""; }
};

export function cookieValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

/** The active policy. Anything not exactly a known non-default policy is "blocked". */
export function consentPolicy(env = process.env) {
  const v = String((env && env[CONSENT_POLICY_ENV]) || "").trim().toLowerCase();
  return v === "us_no_gpc" ? "us_no_gpc" : "blocked";
}

/** True when the already-whitelisted properties mark this session as test traffic. */
export function isTestSession(p) {
  const o = p && typeof p === "object" ? p : {};
  return o.is_test === true || o.is_test === "true" || (typeof o.wf_test === "string" ? o.wf_test.trim() !== "" : !!o.wf_test);
}

/** Pure. Real-visitor consent decision. Returns { allow, basis, policy, ldu }. */
export function decideConsent({ headers, env = process.env } = {}) {
  const policy = consentPolicy(env);
  if (policy !== "us_no_gpc") return { allow: false, basis: "policy_blocked", policy, ldu: false };
  if (gpcFromHeaders(headers)) return { allow: false, basis: "gpc_opt_out", policy, ldu: false };
  let denied = false;
  try {
    const ctx = readAdClickContextFromCookieHeader(hget(headers, "cookie"));
    denied = !!ctx && (ctx.consent_ad_user_data === "DENIED" || ctx.consent_ad_personalization === "DENIED");
  } catch (e) { denied = false; }
  if (denied) return { allow: false, basis: "consent_denied", policy, ldu: false };
  const country = countryFromHeaders(headers);
  if (!country) return { allow: false, basis: "unknown_region", policy, ldu: false };
  if (country !== "US") return { allow: false, basis: "non_us", policy, ldu: false };
  return { allow: true, basis: "eligible_us_no_gpc", policy, ldu: true };
}

/** Constant-time string equality on equal-length buffers; false on any length mismatch. */
export function safeEqual(a, b) {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  if (x.length !== y.length || x.length === 0) return false;
  try { return timingSafeEqual(x, y); } catch (e) { return false; }
}

/** Pure. QA lane eligibility. Returns { allow, basis, testEventCode }. */
export function decideQaLane({ properties, headers, env = process.env } = {}) {
  if (!isTestSession(properties)) return { allow: false, basis: "not_test", testEventCode: null };
  const code = String((env && env.META_CAPI_TEST_EVENT_CODE) || "").trim();
  if (!QA_CODE_RX.test(code)) return { allow: false, basis: "qa_no_test_code", testEventCode: null };
  const secret = String((env && env.META_CAPI_QA_SECRET) || "").trim();
  if (secret.length < QA_SECRET_MIN) return { allow: false, basis: "qa_secret_unset", testEventCode: null };
  const got = cookieValue(hget(headers, "cookie"), QA_COOKIE);
  if (!safeEqual(got, secret)) return { allow: false, basis: "qa_cookie_mismatch", testEventCode: null };
  return { allow: true, basis: "qa_test_lane", testEventCode: code };
}

/**
 * ONE shared "this server process/request must not emit analytics" predicate.
 * lib/serverEvents.js captureServer (PostHog) and the Meta PartnerHandoff relay
 * both call it, so the Meta path can never be more permissive than PostHog.
 * Returns a reason string, or null when emitting is allowed.
 *   base checks (PostHog parity): WF_SUPPRESS_ANALYTICS, synthetic monitor UA,
 *     x-wf-synthetic header, production write firewall when fetch is wrapped.
 *   strict (Meta): additionally classifySyntheticTraffic (QA header, QA/verifier
 *     UA, synthetic cookies, wf_attr test cookie) and a positive production
 *     execution identity (refuses preview, dev, build, guard and test processes).
 */
export function serverEmitRefusal({ headers, env = process.env, strict = false, argv } = {}) {
  if (String((env && env[SUPPRESS]) || "").trim() === "1") return "analytics_suppressed";
  if (isSyntheticMonitor(hget(headers, "user-agent"))) return "synthetic_monitor";
  if (headers && hget(headers, "x-wf-synthetic")) {
    const sh = hget(headers, "x-wf-synthetic").toLowerCase();
    if (sh !== "0" && sh !== "false") return "synthetic_header";
  }
  if (strict) {
    const synth = classifySyntheticTraffic(headers && typeof headers.get === "function" ? headers : { get: (k) => (headers ? headers[String(k).toLowerCase()] ?? null : null) });
    if (synth.synthetic) return "synthetic_request:" + synth.reason;
    const id = classifyExecutionIdentity({ env, argv: Array.isArray(argv) ? argv : [] });
    if (!id.allowLiveWrites) return "execution_identity:" + id.reason;
  }
  if (globalThis.fetch && globalThis.fetch.__wfFirewallWrapped === true) {
    const fw = evaluateProductionWrite({ surface: "posthog_capture", table: "posthog", method: "POST", targetUrl: "https://us.i.posthog.com/capture/", headers, env, ...(Array.isArray(argv) ? { argv } : strict ? { argv: [] } : {}) });
    if (!fw.allowed) return "write_firewall:" + fw.reason;
  }
  return null;
}
