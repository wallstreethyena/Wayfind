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
// Pure builder + injectable fetch so a test can call it with a mock.
import { DEFAULT_META_PIXEL_ID } from "./metaPixel.js";

export const CAPI_EVENT_NAME = "OutboundTicketClick";
export const CAPI_VERSION = "v21.0";
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

// ── PartnerHandoff (2026-11-12) ─────────────────────────────────────────────
// THE ONE META CONVERSION. Sent from the SERVER, only after one of our partner
// redirect routes (/api/{commerce,viator,ticketmaster,stubhub,hotels}/go) has
// actually resolved a partner destination for a human and emitted
// provider_redirect_started. That is the "verified outbound partner click":
// a tap that 404s, is refused, is a crawler, a prefetch or our own verifier
// never gets here. No browser-side duplicate: the client tap can die with the
// same-tab navigation, the server redirect cannot.
//
// WHAT META RECEIVES (and nothing else):
//   event_name  PartnerHandoff     event_id  wf_ph_<click_id>  (idempotent per click)
//   user_data   client_ip_address, client_user_agent, and Meta's OWN first-party
//               cookies _fbp / _fbc when present. No email, phone, name, user
//               id, external_id or hash of anything.
//   custom_data content_type, content_ids [our place/offer id], provider, surface.
//               No value, no currency: this is intent, not revenue.
//   event_source_url  https://www.gowayfind.com + the landing PATH (no query string).
// Sent only when Meta can already recognise the browser (_fbp or _fbc present);
// a visitor Meta has never seen is not introduced to Meta by this event.
// DORMANT without META_CAPI_ACCESS_TOKEN. META_CAPI_PARTNER_HANDOFF=off disables
// it on its own. META_CAPI_TEST_EVENT_CODE routes every event to Events Manager
// > Test Events while verifying.
export const PARTNER_HANDOFF_EVENT = "PartnerHandoff";
const SAFE_TOKEN_RX = /^[A-Za-z0-9_.:-]{1,80}$/;
const FBP_RX = /^fb\.\d\.\d+\.\d+$/;
const FBC_RX = /^fb\.\d\.\d+\.[\w-]+$/;
const PATH_RX = /^\/[A-Za-z0-9_\/.-]{0,180}$/;
const safeToken = (v) => (typeof v === "string" && SAFE_TOKEN_RX.test(v.trim()) && v.indexOf("@") < 0 ? v.trim() : "");
const hget = (h, k) => {
  try { return (h && typeof h.get === "function" ? h.get(k) : h && h[k]) || ""; } catch (e) { return ""; }
};
export function cookieValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

/**
 * Pure. Decide whether a provider_redirect_started becomes a Meta PartnerHandoff
 * and build the Graph payload. Returns { skip: reason } or { pixelId, payload }.
 * `properties` is the already-whitelisted commercePayload of the redirect event.
 */
export function buildPartnerHandoff({ event, properties, headers, env = {}, now = Date.now(), pixelId } = {}) {
  if (event !== "provider_redirect_started") return { skip: "not_handoff" };
  if (String(env.META_CAPI_PARTNER_HANDOFF || "").trim().toLowerCase() === "off") return { skip: "disabled" };
  const p = properties && typeof properties === "object" ? properties : {};
  if (p.traffic_class !== "human") return { skip: "not_human" };
  if (p.is_test === true || p.is_test === "true" || p.wf_test) return { skip: "test_traffic" };
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
  const contentId = safeToken(p.content_id) || safeToken(p.offer_id);
  if (contentId) custom.content_ids = [contentId];
  const surface = safeToken(p.surface);
  if (surface) custom.surface = surface;
  const lp = typeof p.landing_path === "string" && PATH_RX.test(p.landing_path) ? p.landing_path : "/";
  const out = {
    data: [{
      event_name: PARTNER_HANDOFF_EVENT,
      event_time: Math.floor(now / 1000),
      event_id: "wf_ph_" + clickId,
      action_source: "website",
      event_source_url: "https://www.gowayfind.com" + lp,
      user_data: userData,
      custom_data: custom,
    }],
  };
  const code = String(env.META_CAPI_TEST_EVENT_CODE || "").trim();
  if (CODE_RX.test(code)) out.test_event_code = code;
  return { pixelId: pixelId || DEFAULT_META_PIXEL_ID, payload: out };
}

/**
 * Server hook, called for every server-side analytics event. Never throws and
 * never delays anything: returns a promise the caller can hand to waitUntil.
 */
export function relayPartnerHandoff({ event, properties, headers, env = process.env, fetchImpl } = {}) {
  try {
    if (event !== "provider_redirect_started") return Promise.resolve({ sent: false, reason: "not_handoff" });
    const token = String(env.META_CAPI_ACCESS_TOKEN || "").trim();
    if (!token) return Promise.resolve({ sent: false, reason: "capi_not_configured" });
    const built = buildPartnerHandoff({ event, properties, headers, env });
    if (!built || built.skip) return Promise.resolve({ sent: false, reason: built ? built.skip : "invalid" });
    return sendCapi({ built, token, fetchImpl }).catch(() => ({ sent: false, reason: "network" }));
  } catch (e) {
    return Promise.resolve({ sent: false, reason: "threw" });
  }
}

/** POST to the Graph API. fetchImpl injectable. Never throws. */
export async function sendCapi({ built, token, fetchImpl }) {
  if (!built) return { sent: false, reason: "invalid_body" };
  if (!token) return { sent: false, reason: "capi_not_configured" };
  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) return { sent: false, reason: "no_fetch" };
  try {
    const res = await f(`https://graph.facebook.com/${CAPI_VERSION}/${built.pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...built.payload, access_token: token }),
    });
    return { sent: !!(res && res.ok), reason: res && res.ok ? null : "graph_" + (res && res.status) };
  } catch (e) { return { sent: false, reason: "network" }; }
}
