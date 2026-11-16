// lib/reserveSms.js - the guest's booking confirmation text (2026-11-16).
//
// One text, one booking, one provider message id:
//   - Sent only for a booking the DATABASE confirmed (status "confirmed"), never for a request, a handoff, a
//     cancellation or a failure, and only when the guest ticked "Text me this confirmation" for this booking.
//   - The durable row in wf_reserve_notifications is created BEFORE the provider is called. Its unique
//     (booking_id, kind) key means a retry, a double tap or a second server can never text twice.
//   - An ambiguous provider answer (timeout, network error, 5xx) is stored as "unknown" and is never blindly
//     resent: the next attempt first asks the provider whether the message exists (reconcileUnknown).
//   - A text failure never touches the booking. The booking is already saved and confirmed.
//   - Delivery callbacks are signature checked and move status forward only (queued < sent < delivered).
//   - Nothing here is sent to any AI model. The phone comes from the booking or the guest's Booking Profile on the
//     server.
// Dark until configured: RESERVE_SMS_ENABLED=1 plus TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either
// TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER. Locked by scripts/test-reserve-sms.mjs (runs with the flag ON).
import { createHmac, timingSafeEqual } from "node:crypto";
import { formatReserveDate, formatReserveTime } from "./reserveFormat.js";

export const SMS_KIND = "confirmation_sms";
export const SMS_CONSENT_TEXT = "Text me this booking confirmation. One message about this booking. Msg and data rates may apply. Reply STOP to opt out.";
export const SMS_MAX_ATTEMPTS = 2;
const E164 = /^\+[1-9][0-9]{7,14}$/;
const SID = /^AC[0-9a-f]{32}$/;
const MSID = /^MG[0-9a-f]{32}$/;
const MESSAGE_SID = /^(SM|MM)[0-9a-f]{32}$/;

/** Forward-only status order. Terminal failures share the top rank with delivered so nothing overwrites them. */
export const STATUS_RANK = { unknown: 0, queued: 1, accepted: 1, sending: 2, sent: 3, delivered: 4, undelivered: 4, failed: 4 };
const PROVIDER_STATUS = { queued: "queued", accepted: "accepted", scheduled: "queued", sending: "sending", sent: "sent", delivered: "delivered", read: "delivered", undelivered: "undelivered", failed: "failed", canceled: "failed" };

/** Configuration, or null when texts are off. Never returns or logs a secret value beyond what the caller passed in. */
export function smsConfig(env = {}) {
  if (String(env.RESERVE_SMS_ENABLED || "") !== "1") return null;
  const accountSid = String(env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || "").trim();
  const messagingServiceSid = String(env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  const from = String(env.TWILIO_FROM_NUMBER || "").trim();
  if (!SID.test(accountSid) || authToken.length < 16) return null;
  if (!MSID.test(messagingServiceSid) && !E164.test(from)) return null;
  const site = String(env.RESERVE_SMS_CALLBACK_BASE || "https://www.gowayfind.com").replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+$/.test(site)) return null;
  return { accountSid, authToken, messagingServiceSid: MSID.test(messagingServiceSid) ? messagingServiceSid : null, from: E164.test(from) ? from : null, callbackUrl: `${site}/api/reserve/sms-status` };
}

/** True when the confirm card may offer the text option. */
export const smsReady = (env = {}) => smsConfig(env) !== null;

/** US 10 digit, 11 digit with a leading 1, or +E.164 in. E.164 out, or null. */
export function toE164(phone) {
  const raw = String(phone || "").trim();
  if (E164.test(raw)) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/** "(•••) •••-0198" style tail for the confirm card: the guest sees where the text goes, nobody else sees more. */
export const phoneTail = (phone) => { const e = toE164(phone); return e ? e.slice(-2) : null; };

/**
 * The text itself: restaurant, exact calendar date, local time, party, code. Never a relative word alone.
 * "Wayfind: Your table at Ulele is confirmed for Friday, November 20 at 7:00 PM Eastern time for 2. Confirmation WF7K2Q. Reply STOP to opt out."
 */
export function confirmationText({ restaurantName, date, time, partySize, code, cityLabel }) {
  const where = String(restaurantName || "your restaurant").replace(/\s+/g, " ").trim().slice(0, 60);
  const when = `${formatReserveDate(date)} at ${formatReserveTime(String(time).slice(0, 5))}`;
  const local = cityLabel ? ` ${String(cityLabel).slice(0, 20)} time` : " local time";
  return `Wayfind: Your table at ${where} is confirmed for ${when}${local} for ${partySize}. Confirmation ${code}. Reply STOP to opt out.`;
}

const ZONES = { "America/New_York": "Eastern", "America/Chicago": "Central", "America/Denver": "Mountain", "America/Phoenix": "Arizona", "America/Los_Angeles": "Pacific" };
export const zoneLabel = (tz) => ZONES[tz] || null;

/** Twilio request signature: base64 HMAC-SHA1 of the full URL plus each POST param name+value, sorted by name. */
export function twilioSignature(authToken, url, params) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}
export function validTwilioSignature(authToken, url, params, header) {
  if (!authToken || typeof header !== "string" || !header) return false;
  const want = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(header);
  return want.length === got.length && timingSafeEqual(want, got);
}

const basic = (c) => "Basic " + Buffer.from(`${c.accountSid}:${c.authToken}`).toString("base64");
const shortError = (s) => String(s || "").replace(/\+?\d{7,15}/g, "[number]").slice(0, 200);

/** POST one message. Returns { outcome: "accepted"|"rejected"|"ambiguous", sid?, status?, error? }. Never throws. */
async function providerSend(cfg, { to, body, fetchImpl }) {
  const form = new URLSearchParams({ To: to, Body: body, StatusCallback: cfg.callbackUrl });
  if (cfg.messagingServiceSid) form.set("MessagingServiceSid", cfg.messagingServiceSid); else form.set("From", cfg.from);
  let res;
  try {
    res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
      method: "POST", headers: { authorization: basic(cfg), "content-type": "application/x-www-form-urlencoded" }, body: form.toString(), signal: AbortSignal.timeout(10000),
    });
  } catch (error) { return { outcome: "ambiguous", error: shortError(error && error.name) || "network" }; }
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status >= 500 || res.status === 429) return { outcome: "ambiguous", error: `http ${res.status}` };
  if (!res.ok || !json || !MESSAGE_SID.test(String(json.sid || ""))) return { outcome: "rejected", error: shortError(json && (json.code ? `${json.code} ${json.message || ""}` : json.message)) || `http ${res.status}` };
  return { outcome: "accepted", sid: json.sid, status: PROVIDER_STATUS[json.status] || "queued" };
}

/** Did a message for this booking reach the provider after all? Looks for the confirmation code in the body. */
async function providerFind(cfg, { to, code, sinceIso, fetchImpl }) {
  const day = String(sinceIso).slice(0, 10);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json?To=${encodeURIComponent(to)}&DateSent%3E=${day}&PageSize=50`;
  try {
    const res = await fetchImpl(url, { headers: { authorization: basic(cfg) }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { known: false };
    const json = await res.json();
    const hit = (json.messages || []).find((m) => typeof m.body === "string" && m.body.includes(`Confirmation ${code}.`));
    return hit ? { known: true, sid: hit.sid, status: PROVIDER_STATUS[hit.status] || "queued" } : { known: true, sid: null };
  } catch { return { known: false }; }
}

/**
 * The one entry point after a booking is saved. Fire and forget from the route (after the response).
 * Returns a small result for tests and logs; it never throws and never changes the booking.
 */
export async function sendBookingConfirmationSms({ repository, booking, partner, consent, env = {}, fetchImpl = fetch, now = Date.now }) {
  const cfg = smsConfig(env);
  if (!cfg) return { sent: false, reason: "disabled" };
  if (!booking || booking.status !== "confirmed" || !booking.id || !booking.confirmation_code) return { sent: false, reason: "not_confirmed" };
  if (!partner || partner.stage !== "live") return { sent: false, reason: "not_live" };
  if (!consent || consent.sms !== true) return { sent: false, reason: "no_consent" };
  const to = toE164(consent.phone);
  if (!to) return { sent: false, reason: "no_phone" };
  const nowIso = new Date(now()).toISOString();

  let row;
  try {
    row = await repository.claimNotification({ bookingId: booking.id, kind: SMS_KIND, recipient: to, consentAt: nowIso, consentText: SMS_CONSENT_TEXT });
  } catch { return { sent: false, reason: "storage" }; }
  if (!row) return { sent: false, reason: "storage" };
  if (!row.claimed) {
    // Someone already owns this text. Only an ambiguous earlier attempt (or one that died between claim and send)
    // is worth a look, and only a look first.
    const stuck = row.status === "queued" && !row.provider_message_id && now() - Date.parse(row.created_at || nowIso) > 120000;
    if (row.status !== "unknown" && !stuck) return { sent: false, reason: "already", status: row.status };
    const found = await providerFind(cfg, { to: row.recipient, code: booking.confirmation_code, sinceIso: row.created_at || nowIso, fetchImpl });
    if (!found.known) return { sent: false, reason: "still_unknown" };
    if (found.sid) { await safeMark(repository, row.id, { status: found.status, provider: "twilio", provider_message_id: found.sid, note: "reconciled" }, nowIso); return { sent: true, reason: "reconciled", sid: found.sid }; }
    if ((row.attempts | 0) >= SMS_MAX_ATTEMPTS) return { sent: false, reason: "attempts" };
  }
  const body = confirmationText({ restaurantName: partner.name, date: booking.reserve_date, time: booking.reserve_time, partySize: booking.party_size, code: booking.confirmation_code, cityLabel: zoneLabel(partner.timezone) });
  const attempt = (row.attempts | 0) + 1;
  const out = await providerSend(cfg, { to: row.recipient || to, body, fetchImpl });
  if (out.outcome === "accepted") { await safeMark(repository, row.id, { status: out.status, provider: "twilio", provider_message_id: out.sid, attempts: attempt, note: "accepted" }, nowIso); return { sent: true, reason: "accepted", sid: out.sid, status: out.status }; }
  if (out.outcome === "rejected") { await safeMark(repository, row.id, { status: "failed", attempts: attempt, last_error: out.error, note: "rejected" }, nowIso); return { sent: false, reason: "rejected" }; }
  await safeMark(repository, row.id, { status: "unknown", attempts: attempt, last_error: out.error, note: "ambiguous" }, nowIso);
  return { sent: false, reason: "ambiguous" };
}

async function safeMark(repository, id, patch, nowIso) {
  try { await repository.markNotification(id, patch, nowIso); } catch { /* the provider id is also recoverable by reconcile */ }
}

/** A delivery callback. Returns { ok, status? } and never moves a status backward. */
export async function applySmsStatusCallback({ repository, params, env = {}, signature, url }) {
  const cfg = smsConfig(env);
  if (!cfg) return { ok: false, code: "DISABLED" };
  if (!validTwilioSignature(cfg.authToken, url, params, signature)) return { ok: false, code: "BAD_SIGNATURE" };
  if (params.AccountSid !== cfg.accountSid) return { ok: false, code: "WRONG_ACCOUNT" };
  const sid = String(params.MessageSid || params.SmsSid || "");
  const next = PROVIDER_STATUS[String(params.MessageStatus || params.SmsStatus || "").toLowerCase()];
  if (!MESSAGE_SID.test(sid) || !next) return { ok: false, code: "BAD_PAYLOAD" };
  let row;
  try { row = await repository.notificationByProviderId("twilio", sid); } catch { return { ok: false, code: "STORAGE" }; }
  if (!row) return { ok: true, code: "UNKNOWN_MESSAGE" }; // not ours: acknowledge so the provider stops retrying
  if ((STATUS_RANK[next] ?? 0) <= (STATUS_RANK[row.status] ?? 0) && row.status !== "unknown") return { ok: true, status: row.status, unchanged: true };
  const err = params.ErrorCode ? shortError(`error ${params.ErrorCode}`) : null;
  try { await repository.markNotification(row.id, { status: next, ...(err ? { last_error: err } : {}), note: "callback" }, new Date().toISOString()); } catch { return { ok: false, code: "STORAGE" }; }
  return { ok: true, status: next };
}
