// lib/metaCapi.js — server half of the Meta "OutboundTicketClick" CUSTOM event
// (2026-10-29). NO Meta Conversions API sender existed in this repo before this
// file (grep graph.facebook.com => only lib/instagramGraph.js, which publishes
// to Instagram). The dataset "Wayfind Website" has "Conversions API enabled" in
// Events Manager, but nothing here called it.
//
// DEDUPE: the browser pixel call is
//   fbq('trackCustom','OutboundTicketClick',{...},{eventID})
// and this sender posts the SAME event_name with event_id === that eventID, so
// Meta keeps one. DORMANT BY DEFAULT: no META_CAPI_ACCESS_TOKEN => nothing is
// sent, and the browser only relays when NEXT_PUBLIC_META_CAPI_RELAY === "1".
// AUDIT 2026-11-15: this OutboundTicketClick path is NOT behind the consent gate
// in lib/metaConsent.js (that gate guards PartnerHandoff). It stays dormant only
// because NEXT_PUBLIC_META_CAPI_RELAY is not "1" in production. Do not enable it
// without first routing it through decideConsent(). See docs/META_PIXEL.md.
// Pure builder + injectable fetch so a test can call it with a mock.
import { DEFAULT_META_PIXEL_ID } from "./metaPixel.js";
import { cookieValue as _cookieValue, decideConsent, decideQaLane, isTestSession, serverEmitRefusal, LDU_FIELDS } from "./metaConsent.js";

export const CAPI_EVENT_NAME = "OutboundTicketClick";
// Graph API version: ONE constant, overridable with env META_GRAPH_VERSION
// (validated /^v\d{2}\.\d$/; anything else falls back to the default).
export const CAPI_VERSION = "v21.0";
const GRAPH_VERSION_RX = /^v\d{2}\.\d$/;
export function graphVersion(env = process.env) {
  const v = String((env && env.META_GRAPH_VERSION) || "").trim();
  return GRAPH_VERSION_RX.test(v) ? v : CAPI_VERSION;
}
const ID_RX = /^[A-Za-z0-9_-]{6,80}$/;
const CODE_RX = /^[A-Za-z0-9_-]{3,40}$/;
const short = (v, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/**
 * Validate the relay body and build the Graph payload. Returns null when the
 * body is not exactly an OutboundTicketClick with a usable event_id.
 * user_data carries only what Meta needs to match a web event: client IP, user
 * agent and the pixel's own _fbp/_fbc cookies. Nothing else, no email, no hash.
 */
export function buildCapiPayload({ body, ip, userAgent, fbp, fbc, sourceUrl, now = Date.now(), pixelId, env = {} }) {
  const b = body && typeof body === "object" ? body : {};
  if (b.event_name !== CAPI_EVENT_NAME) return null;
  if (typeof b.event_id !== "string" || !ID_RX.test(b.event_id)) return null;
  const custom = { content_type: "event" };
  const id = Array.isArray(b.content_ids) && typeof b.content_ids[0] === "string" ? short(b.content_ids[0]) : "";
  if (id) custom.content_ids = [id];
  if (short(b.seller)) custom.seller = short(b.seller);
  if (short(b.surface)) custom.surface = short(b.surface);
  const userData = {};
  if (ip) userData.client_ip_address = short(ip, 64);
  if (userAgent) userData.client_user_agent = short(userAgent, 400);
  if (fbp && /^fb\.\d\.\d+\.\d+$/.test(fbp)) userData.fbp = fbp;
  if (fbc && /^fb\.\d\.\d+\.[\w-]+$/.test(fbc)) userData.fbc = fbc;
  const out = {
    data: [{
      event_name: CAPI_EVENT_NAME,
      event_time: Math.floor(now / 1000),
      event_id: b.event_id,
      action_source: "website",
      event_source_url: sourceUrl || undefined,
      user_data: userData,
      custom_data: custom,
    }],
  };
  const code = typeof b.test_event_code === "string" && CODE_RX.test(b.test_event_code) ? b.test_event_code : null;
  if (code) out.test_event_code = code;
  return { pixelId: pixelId || DEFAULT_META_PIXEL_ID, payload: out, env };
}

// ── PartnerHandoff (2026-11-12, consent-gated 2026-11-15) ───────────────────
// THE ONE META CONVERSION. Sent from the SERVER, only after one of our partner
// redirect routes (/api/{commerce,viator,ticketmaster,stubhub,hotels}/go) has
// resolved a partner destination for a human and emitted provider_redirect_started.
// WHAT IT PROVES: Wayfind resolved a valid partner destination and issued a
// redirect. It does NOT prove the partner page loaded, a booking, or commission.
//
// IDENTIFYING DATA. client_ip_address, client_user_agent, _fbp and _fbc are
// identifying tracking data (_fbc can contain the Facebook click id), and
// event_id contains Wayfind's internal click id. Therefore, three gates:
//   1. the shared suppression predicate (lib/metaConsent.js serverEmitRefusal,
//      strict: guards, previews, dev, synthetic/verifier traffic never send),
//   2. the consent policy (default BLOCKED, see lib/metaConsent.js),
//   3. META_CAPI_ACCESS_TOKEN present. META_CAPI_PARTNER_HANDOFF=off kills it.
//
// WHAT META RECEIVES (nothing else)
//   event_name PartnerHandoff, event_id wf_ph_<click_id>, event_time, action_source
//   website, event_source_url (host + landing PATH, no query),
//   user_data { client_ip_address, client_user_agent, fbp?, fbc? },
//   custom_data { content_type: product, provider, content_ids?, surface? },
//   LIVE lane under us_no_gpc: + data_processing_options ["LDU"], country 0, state 0.
//   QA lane: + top-level test_event_code (from server env only).
export const PARTNER_HANDOFF_EVENT = "PartnerHandoff";
export const cookieValue = _cookieValue;
const FBP_RX = /^fb\.\d\.\d+\.\d+$/;
const FBC_RX = /^fb\.\d\.\d+\.[\w-]+$/;
const PATH_RX = /^\/[A-Za-z0-9_\/.-]{0,180}$/;
const TOKEN_RX = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const hget = (h, k) => {
  try { return (h && typeof h.get === "function" ? h.get(k) : h && h[k]) || ""; } catch (e) { return ""; }
};

// Sensitive-value guard. A value is a "safe token" only when it matches a strict
// charset (so no @ ? = % space or slash can appear) AND is not shaped like a
// phone number or numeric account id:
//   provider / surface: no run of 7+ digits at all (they are words);
//   content ids:        no run of 10+ digits (a phone), and not purely numeric
//                       once separators are stripped when 7+ long.
// Normal ids pass: Viator codes (12345P1), slugs (ice-gaylord), compound slugs
// (gulf-coast-world-series-week-2026:rays-home), Google place ids (ChIJ...),
// Ticketmaster ids (Z7r9jZ1A7...). Known false positives: a purely numeric
// event id of 7+ digits (e.g. a StubHub numeric id) is dropped from content_ids;
// the event still sends, just without that id.
const hasDigitRun = (v, n) => new RegExp("\\d{" + n + ",}").test(v);
export function safeToken(v, kind = "word") {
  if (typeof v !== "string") return "";
  const t = v.trim();
  if (!TOKEN_RX.test(t)) return "";
  if (kind === "word") return hasDigitRun(t, 7) ? "" : t;
  if (hasDigitRun(t, 10)) return "";
  const stripped = t.replace(/[-_.:]/g, "");
  if (stripped.length >= 7 && /^\d+$/.test(stripped)) return "";
  return t;
}
export function safeLandingPath(v) {
  if (typeof v !== "string" || !PATH_RX.test(v) || v.indexOf("@") >= 0 || hasDigitRun(v, 7)) return "/";
  return v;
}

/**
 * Pure. Decide whether a provider_redirect_started becomes a Meta PartnerHandoff
 * and build the Graph payload. Returns { skip: reason } or
 * { pixelId, payload, lane, basis, provider, surface }.
 * `properties` is the already-whitelisted commercePayload of the redirect event.
 * `env` is injectable; the shared suppression predicate is applied by
 * relayPartnerHandoff (the live entry point), not here, so this stays pure.
 */
export function buildPartnerHandoff({ event, properties, headers, env = {}, now = Date.now(), pixelId } = {}) {
  if (event !== "provider_redirect_started") return { skip: "not_handoff" };
  if (String(env.META_CAPI_PARTNER_HANDOFF || "").trim().toLowerCase() === "off") return { skip: "disabled" };
  const p = properties && typeof properties === "object" ? properties : {};
  if (p.traffic_class !== "human") return { skip: "not_human" };
  let lane = "live";
  let basis;
  let testCode = null;
  let ldu = false;
  if (isTestSession(p)) {
    const qa = decideQaLane({ properties: p, headers, env });
    if (!qa.allow) return { skip: "test_traffic", basis: qa.basis };
    lane = "qa"; basis = qa.basis; testCode = qa.testEventCode;
    ldu = String(env.META_CAPI_CONSENT_POLICY || "").trim().toLowerCase() === "us_no_gpc";
  } else {
    const c = decideConsent({ headers, env });
    if (!c.allow) return { skip: c.basis, basis: c.basis };
    basis = c.basis; ldu = c.ldu;
  }
  const clickId = safeToken(p.click_id);
  const provider = safeToken(p.provider);
  if (!clickId || !provider) return { skip: "missing_ids" };
  const ck = hget(headers, "cookie");
  const fbp = cookieValue(ck, "_fbp");
  const fbc = cookieValue(ck, "_fbc");
  const userData = {};
  if (FBP_RX.test(fbp)) userData.fbp = fbp;
  if (FBC_RX.test(fbc)) userData.fbc = fbc;
  if (!userData.fbp && !userData.fbc) return { skip: "no_meta_browser_id" };
  const ip = String(hget(headers, "x-forwarded-for") || "").split(",")[0].trim() || String(hget(headers, "x-real-ip") || "").trim();
  const ua = String(hget(headers, "user-agent") || "");
  if (!ip || !ua) return { skip: "no_ip_or_ua" };
  userData.client_ip_address = ip.slice(0, 64);
  userData.client_user_agent = ua.slice(0, 400);
  const custom = { content_type: "product", provider };
  const contentId = safeToken(p.content_id, "id") || safeToken(p.offer_id, "id");
  if (contentId) custom.content_ids = [contentId];
  const surface = safeToken(p.surface);
  if (surface) custom.surface = surface;
  const event0 = {
    event_name: PARTNER_HANDOFF_EVENT,
    event_time: Math.floor(now / 1000),
    event_id: "wf_ph_" + clickId,
    action_source: "website",
    event_source_url: "https://www.gowayfind.com" + safeLandingPath(p.landing_path),
    user_data: userData,
    custom_data: custom,
  };
  if (ldu) {
    event0.data_processing_options = LDU_FIELDS.data_processing_options.slice();
    event0.data_processing_options_country = LDU_FIELDS.data_processing_options_country;
    event0.data_processing_options_state = LDU_FIELDS.data_processing_options_state;
  }
  const out = { data: [event0] };
  if (lane === "qa") out.test_event_code = testCode; // QA lane ONLY; never on a live event
  return { pixelId: pixelId || DEFAULT_META_PIXEL_ID, payload: out, lane, basis, provider, surface: surface || null };
}

const SAFE_TRACE_RX = /^[A-Za-z0-9_+\/=-]{1,48}$/;
export const SEND_TIMEOUT_MS = 2500;

/** One console line per attempt. Fixed safe fields only: never IP, UA, fbp, fbc, click or event id, token. */
function logAttempt(r) {
  try {
    console.log("[meta-capi] outcome=" + r.outcome + " reason=" + (r.reason || "-") + " lane=" + (r.lane || "live") +
      " provider=" + (r.provider || "-") + " surface=" + (r.surface || "-") + " http=" + (r.http_status == null ? "-" : r.http_status) +
      " received=" + (r.events_received == null ? "-" : r.events_received) + " fbtrace=" + (r.fbtrace_id || "-") + " attempt=" + (r.attempt || 1));
  } catch (e) {}
}

const withTimeout = (f, url, init, ms) => {
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  let timer;
  const killer = new Promise((_, rej) => { timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} rej(Object.assign(new Error("timeout"), { wfTimeout: true })); }, ms); });
  return Promise.race([f(url, ctrl ? { ...init, signal: ctrl.signal } : init), killer]).finally(() => clearTimeout(timer));
};

/** One Graph attempt. Resolves a classification, never throws, never carries the token. */
async function attemptOnce({ f, url, body, ms }) {
  let res;
  try { res = await withTimeout(f, url, { method: "POST", headers: { "content-type": "application/json" }, body }, ms); }
  catch (e) { return { ok: false, cls: e && e.wfTimeout ? "timeout" : "network", retryable: true, http_status: null }; }
  const status = res && typeof res.status === "number" ? res.status : null;
  let text = "";
  try { text = res && typeof res.text === "function" ? await res.text() : (res && typeof res.json === "function" ? JSON.stringify(await res.json()) : ""); } catch (e) { text = ""; }
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
  const j0 = j && typeof j === "object" ? j : null;
  const trace = j0 && j0.fbtrace_id && SAFE_TRACE_RX.test(String(j0.fbtrace_id)) ? String(j0.fbtrace_id) : (j0 && j0.error && SAFE_TRACE_RX.test(String(j0.error.fbtrace_id || "")) ? String(j0.error.fbtrace_id) : null);
  const base = { http_status: status, fbtrace_id: trace, messages: j0 && Array.isArray(j0.messages) ? j0.messages.length : 0 };
  const code = j0 && j0.error && typeof j0.error === "object" ? Number(j0.error.code) : null;
  if (code != null && Number.isFinite(code)) {
    const auth = code === 190 || status === 401 || status === 403;
    return { ok: false, cls: "graph_error_" + code, retryable: !auth && status != null && status >= 500, ...base };
  }
  if (status != null && (status < 200 || status >= 300)) {
    return { ok: false, cls: "http_" + status, retryable: status >= 500, ...base };
  }
  if (!j0) return { ok: false, cls: "bad_json", retryable: false, ...base };
  const n = Number(j0.events_received);
  if (!(Number.isFinite(n) && n >= 1)) return { ok: false, cls: "zero_received", retryable: false, events_received: Number.isFinite(n) ? n : 0, ...base };
  return { ok: true, cls: "accepted", retryable: false, events_received: n, ...base };
}

/**
 * POST to the Graph API. fetchImpl injectable. Never throws. The token travels
 * only in the POST body. Meta-consent lane results (built.lane set) require
 * JSON events_received >= 1 and get ONE retry (identical payload: same event_id
 * and event_time) for timeout / network / 5xx; auth errors never retry. A legacy
 * OutboundTicketClick `built` (no lane) keeps its old simple ok-means-sent rule.
 * Result: { sent, reason, outcome, lane, provider, surface, http_status,
 * events_received, fbtrace_id, messages, attempts } (no token, ids or PII).
 */
export async function sendCapi({ built, token, fetchImpl, env = process.env, timeoutMs = SEND_TIMEOUT_MS } = {}) {
  if (!built) return { sent: false, reason: "invalid_body" };
  if (!token) return { sent: false, reason: "capi_not_configured" };
  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) return { sent: false, reason: "no_fetch" };
  const url = `https://graph.facebook.com/${graphVersion(env)}/${built.pixelId}/events`;
  const body = JSON.stringify({ ...built.payload, access_token: token }); // serialized ONCE: a retry is byte-identical
  const meta = { lane: built.lane || "live", provider: built.provider || null, surface: built.surface || null };
  if (!built.lane) {
    try {
      const res = await withTimeout(f, url, { method: "POST", headers: { "content-type": "application/json" }, body }, timeoutMs);
      return { sent: !!(res && res.ok), reason: res && res.ok ? null : "graph_" + (res && res.status) };
    } catch (e) { return { sent: false, reason: e && e.wfTimeout ? "timeout" : "network" }; }
  }
  let attempts = 0;
  let last = null;
  while (attempts < 2) {
    attempts += 1;
    last = await attemptOnce({ f, url, body, ms: timeoutMs });
    logAttempt({ outcome: last.ok ? "accepted" : "failed", reason: last.ok ? null : last.cls, ...meta, http_status: last.http_status, events_received: last.events_received, fbtrace_id: last.fbtrace_id, attempt: attempts });
    if (last.ok || !last.retryable) break;
  }
  return {
    sent: last.ok, reason: last.ok ? null : last.cls, outcome: last.ok ? "accepted" : "failed", ...meta,
    http_status: last.http_status == null ? null : last.http_status, events_received: last.events_received == null ? null : last.events_received,
    fbtrace_id: last.fbtrace_id || null, messages: last.messages || 0, attempts,
  };
}

const CONSENT_SKIPS = new Set(["policy_blocked", "gpc_opt_out", "consent_denied", "unknown_region", "non_us"]);

/**
 * Server hook, called for every provider_redirect_started. Never throws and
 * never delays anything: returns a promise the caller can hand to waitUntil.
 * `onResult(safeFields)` (optional) receives one PII-free summary per attempt or
 * consent skip, used by serverEvents to record `meta_capi_result`.
 */
export function relayPartnerHandoff({ event, properties, headers, env = process.env, fetchImpl, onResult, argv } = {}) {
  const done = (r) => { try { if (onResult && r && r.outcome) onResult(r); } catch (e) {} return r; };
  try {
    if (event !== "provider_redirect_started") return Promise.resolve({ sent: false, reason: "not_handoff" });
    const token = String((env && env.META_CAPI_ACCESS_TOKEN) || "").trim();
    if (!token) return Promise.resolve({ sent: false, reason: "capi_not_configured" });
    const refusal = serverEmitRefusal({ headers, env, strict: true, argv });
    if (refusal) return Promise.resolve({ sent: false, reason: "suppressed", detail: refusal });
    const built = buildPartnerHandoff({ event, properties, headers, env });
    if (!built || built.skip) {
      const reason = built ? built.skip : "invalid";
      const res = { sent: false, reason };
      if (CONSENT_SKIPS.has(reason)) return Promise.resolve(done({ ...res, outcome: "skipped", lane: "live", consent_basis: reason }));
      return Promise.resolve(res);
    }
    return sendCapi({ built, token, fetchImpl, env })
      .then((r) => done({ ...r, consent_basis: built.basis, ldu: !!(built.payload.data[0].data_processing_options) }))
      .catch(() => ({ sent: false, reason: "network" }));
  } catch (e) {
    return Promise.resolve({ sent: false, reason: "threw" });
  }
}
