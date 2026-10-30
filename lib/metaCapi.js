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
