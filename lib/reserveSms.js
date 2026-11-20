// lib/reserveSms.js - guest texts and records for a Wayfind booking (2026-11-16).
//
// One row per (booking, kind) in wf_reserve_notifications, claimed BEFORE any provider call.
// Twilio is the only provider. Texting stays dark unless RESERVE_SMS_ENABLED=1 plus
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.
//
// Which kinds text the guest:
//   confirmation_sms       yes, one text, only after the database confirmed an instant booking,
//                          and only with this booking's "Text me this confirmation" tick.
//   request_received_sms   yes, when the guest ticked the request consent and the row is "requested".
//   request_accepted_sms   yes, later, only from that stored request consent, when the restaurant accepts.
//   request_declined_sms   yes, later, only from that stored request consent, when the restaurant declines.
//                          Never both answers. The restaurant cannot choose a different phone.
//   cancellation_sms       yes only when the restaurant cancels a request the guest already heard was
//                          accepted, because that request consent names this text. A guest cancel, and a
//                          cancel of an instant booking (its consent was one confirmation), are recorded
//                          and not texted.
//   opentable_handoff      no. OpenTable sends its own confirmation. A row is written only when a Wayfind
//                          booking id exists. The live redirect has no booking, so it writes nothing.
//   failure_sms            no. A row is written only against a saved booking. A failure before a row exists
//                          stays in the HTTP response, which is the guest's notice.
//
// Shared safety: unique (booking, kind), at most two attempts, ambiguous sends are reconciled before a
// resend, delivery callbacks are signature checked and only move forward, a recorded row never becomes a
// send, consent words are stored on the row, and nothing here is given to an AI model.
import { createHmac, timingSafeEqual } from "node:crypto";
import { formatReserveDate, formatReserveTime } from "./reserveFormat.js";

export const SMS_KIND = "confirmation_sms";
export const NOTIFICATION_KINDS = Object.freeze([
  "confirmation_sms",
  "request_received_sms",
  "request_accepted_sms",
  "request_declined_sms",
  "opentable_handoff",
  "cancellation_sms",
  "failure_sms",
]);
export const TEXT_ONLY_KINDS = new Set(["confirmation_sms", "request_received_sms", "request_accepted_sms", "request_declined_sms"]);
export const RECORD_ONLY_KINDS = new Set(["opentable_handoff", "failure_sms"]);

export const SMS_CONSENT_TEXT = "Text me this booking confirmation. One message about this booking. Msg and data rates may apply. Reply STOP to opt out.";
export const REQUEST_CONSENT_TEXT = "Text me about this request. One text when we receive it, one text when the restaurant accepts or declines, and one text if that confirmed table is later cancelled. Msg and data rates may apply. Reply STOP to opt out.";
export const OPENTABLE_RECORD_TEXT = "No text sent. OpenTable sends its own confirmation. Wayfind does not text the guest about this handoff.";
export const FAILURE_RECORD_TEXT = "No text sent. This row records a booking failure. The guest was not messaged.";
export const CANCELLATION_RECORD_TEXT = "No text sent. A cancellation text is sent only when the guest agreed to one and the restaurant cancels a confirmed request. This row records the cancellation without a text.";
export const FAILURE_CODES = new Set(["BOOKING_NOT_CONFIRMED", "SLOT_FULL", "STORAGE", "NOT_COMPLETED"]);
export const SMS_MAX_ATTEMPTS = 2;

const E164 = /^\+[1-9][0-9]{7,14}$/;
const SID = /^AC[0-9a-f]{32}$/;
const MSID = /^MG[0-9a-f]{32}$/;
const MESSAGE_SID = /^(SM|MM)[0-9a-f]{32}$/;
const DASH = /[-\u2010\u2011\u2012\u2013\u2014\u2212]/;

/** Forward-only status order. Terminal failures share the top rank with delivered so nothing overwrites them. Recorded is terminal too: a row we chose not to text never becomes a send. */
export const STATUS_RANK = { unknown: 0, queued: 1, accepted: 1, sending: 2, sent: 3, delivered: 4, undelivered: 4, failed: 4, recorded: 4 };
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

const cleanPiece = (value, max) => String(value || "").replace(DASH, " ").replace(/\s+/g, " ").trim().slice(0, max);

function clockLine(date, time, cityLabel) {
  const when = `${formatReserveDate(date)} at ${formatReserveTime(String(time || "").slice(0, 5))}`;
  if (!formatReserveDate(date) || !formatReserveTime(String(time || "").slice(0, 5))) return null;
  const label = cleanPiece(cityLabel, 20);
  return { when, local: label ? ` ${label} time` : " local time" };
}

function markerFor(kind, code) {
  const word = { confirmation_sms: "Confirmation", request_received_sms: "Request", request_accepted_sms: "Accepted", request_declined_sms: "Declined", cancellation_sms: "Cancelled" }[kind];
  return word && code ? `${word} ${code}.` : "";
}

/**
 * The text for one kind. Exact calendar date and local time, no relative word, no dash.
 * A dash in a restaurant name is turned into a space so the body we send cannot contain one.
 * Returns null when the date or time cannot be said exactly.
 */
export function messageText(kind, { restaurantName, date, time, partySize, code, cityLabel }) {
  const clock = clockLine(date, time, cityLabel);
  const marker = markerFor(kind, code);
  if (!clock || !marker) return null;
  const where = cleanPiece(restaurantName, 60) || "your restaurant";
  const party = partySize;
  let body = null;
  if (kind === "confirmation_sms") body = `Wayfind: Your table at ${where} is confirmed for ${clock.when}${clock.local} for ${party}. ${marker} Reply STOP to opt out.`;
  else if (kind === "request_received_sms") body = `Wayfind: We have your request at ${where} for ${clock.when}${clock.local} for ${party}. Not confirmed yet. ${marker} Reply STOP to opt out.`;
  else if (kind === "request_accepted_sms") body = `Wayfind: ${where} accepted your table for ${clock.when}${clock.local} for ${party}. ${marker} Reply STOP to opt out.`;
  else if (kind === "request_declined_sms") body = `Wayfind: ${where} declined your request for ${clock.when}${clock.local} for ${party}. ${marker} Reply STOP to opt out.`;
  else if (kind === "cancellation_sms") body = `Wayfind: Your table at ${where} for ${clock.when}${clock.local} for ${party} is cancelled. ${marker} Reply STOP to opt out.`;
  if (!body || DASH.test(body)) return null;
  return body;
}

/** Confirmation text. Kept as its own function so existing callers and the exact sentence stay put. */
export function confirmationText(details) {
  return messageText("confirmation_sms", details);
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
const livePartner = (partner) => Boolean(partner && partner.stage === "live");
const quiet = (extra) => ({ sent: false, recorded: false, ...extra });

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

/** Did this kind's message for this booking reach the provider after all? Looks for that kind's marker in the body. */
async function providerFind(cfg, { to, marker, sinceIso, fetchImpl }) {
  const day = String(sinceIso).slice(0, 10);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json?To=${encodeURIComponent(to)}&DateSent%3E=${day}&PageSize=50`;
  try {
    const res = await fetchImpl(url, { headers: { authorization: basic(cfg) }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { known: false };
    const json = await res.json();
    const hit = (json.messages || []).find((m) => typeof m.body === "string" && marker && m.body.includes(marker));
    return hit ? { known: true, sid: hit.sid, status: PROVIDER_STATUS[hit.status] || "queued" } : { known: true, sid: null };
  } catch { return { known: false }; }
}

async function safeMark(repository, id, patch, nowIso) {
  try { await repository.markNotification(id, patch, nowIso); } catch { /* the provider id is also recoverable by reconcile */ }
}

async function recordNotification({ repository, booking, kind, recipient, consentText, note, now }) {
  const nowIso = new Date(now()).toISOString();
  let row;
  try {
    row = await repository.claimNotification({ bookingId: booking.id, kind, recipient: recipient || null, consentAt: nowIso, consentText, status: "recorded", note: note || "recorded" });
  } catch { return quiet({ reason: "storage" }); }
  if (!row) return quiet({ reason: "storage" });
  if (!row.claimed) return { sent: false, recorded: true, reason: "already", status: row.status };
  return { sent: false, recorded: true, reason: "recorded" };
}

async function deliverText({ cfg, repository, booking, partner, kind, to, consentText, fetchImpl, now }) {
  const nowIso = new Date(now()).toISOString();
  let row;
  try {
    row = await repository.claimNotification({ bookingId: booking.id, kind, recipient: to, consentAt: nowIso, consentText, status: "queued" });
  } catch { return quiet({ reason: "storage" }); }
  if (!row) return quiet({ reason: "storage" });
  if (!row.claimed) {
    const stuck = row.status === "queued" && !row.provider_message_id && now() - Date.parse(row.created_at || nowIso) > 120000;
    if (row.status !== "unknown" && !stuck) return quiet({ reason: "already", status: row.status });
    const found = await providerFind(cfg, { to: row.recipient || to, marker: markerFor(kind, booking.confirmation_code), sinceIso: row.created_at || nowIso, fetchImpl });
    if (!found.known) return quiet({ reason: "still_unknown" });
    if (found.sid) { await safeMark(repository, row.id, { status: found.status, provider: "twilio", provider_message_id: found.sid, note: "reconciled" }, nowIso); return { sent: true, recorded: false, reason: "reconciled", sid: found.sid }; }
    if ((row.attempts | 0) >= SMS_MAX_ATTEMPTS) return quiet({ reason: "attempts" });
  }
  const body = messageText(kind, { restaurantName: partner.name, date: booking.reserve_date, time: booking.reserve_time, partySize: booking.party_size, code: booking.confirmation_code, cityLabel: zoneLabel(partner.timezone) });
  const attempt = (row.attempts | 0) + 1;
  if (!body) { await safeMark(repository, row.id, { status: "failed", attempts: attempt, note: "bad_booking" }, nowIso); return quiet({ reason: "bad_booking" }); }
  const out = await providerSend(cfg, { to: row.recipient || to, body, fetchImpl });
  if (out.outcome === "accepted") { await safeMark(repository, row.id, { status: out.status, provider: "twilio", provider_message_id: out.sid, attempts: attempt, note: "accepted" }, nowIso); return { sent: true, recorded: false, reason: "accepted", sid: out.sid, status: out.status }; }
  if (out.outcome === "rejected") { await safeMark(repository, row.id, { status: "failed", attempts: attempt, last_error: out.error, note: "rejected" }, nowIso); return quiet({ reason: "rejected" }); }
  await safeMark(repository, row.id, { status: "unknown", attempts: attempt, last_error: out.error, note: "ambiguous" }, nowIso);
  return quiet({ reason: "ambiguous" });
}

async function readKind(repository, bookingId, kind) {
  if (!repository || typeof repository.notificationFor !== "function") throw new Error("storage");
  return repository.notificationFor(bookingId, kind);
}

/**
 * The one entry point for every reserve notification kind.
 * Fire and forget from the route (after the response). Never throws and never changes the booking.
 * A phone on `consent` is used only for confirmation_sms and request_received_sms. Later kinds
 * read the number off the request row the guest consented to.
 */
export async function sendReserveNotification({ repository, kind, booking, partner, consent, actor, failureCode, linkVerified, env = {}, fetchImpl = fetch, now = Date.now }) {
  const cfg = smsConfig(env);
  if (!cfg) return quiet({ reason: "disabled" });
  if (!NOTIFICATION_KINDS.includes(kind)) return quiet({ reason: "unknown_kind" });

  if (kind === "opentable_handoff") {
    if (!booking || !booking.id) return quiet({ reason: "handoff_note", note: OPENTABLE_RECORD_TEXT });
    if (!livePartner(partner) && linkVerified !== true) return quiet({ reason: "not_live" });
    return recordNotification({ repository, booking, kind, recipient: null, consentText: OPENTABLE_RECORD_TEXT, now });
  }
  if (kind === "failure_sms") {
    if (!booking || !booking.id) return quiet({ reason: "no_booking", note: FAILURE_RECORD_TEXT });
    if (!FAILURE_CODES.has(failureCode)) return quiet({ reason: "bad_failure" });
    if (!livePartner(partner)) return quiet({ reason: "not_live" });
    return recordNotification({ repository, booking, kind, recipient: null, consentText: FAILURE_RECORD_TEXT, note: failureCode, now });
  }

  if (kind === "confirmation_sms") {
    if (!booking || booking.status !== "confirmed" || !booking.id || !booking.confirmation_code) return quiet({ reason: "not_confirmed" });
    if (!livePartner(partner)) return quiet({ reason: "not_live" });
    if (!consent || consent.sms !== true) return quiet({ reason: "no_consent" });
    const to = toE164(consent.phone);
    if (!to) return quiet({ reason: "no_phone" });
    try { if (await readKind(repository, booking.id, "request_received_sms")) return quiet({ reason: "request_booking" }); }
    catch { return quiet({ reason: "storage" }); }
    return deliverText({ cfg, repository, booking, partner, kind, to, consentText: SMS_CONSENT_TEXT, fetchImpl, now });
  }
  if (kind === "request_received_sms") {
    if (!booking || booking.status !== "requested" || !booking.id || !booking.confirmation_code) return quiet({ reason: "not_requested" });
    if (!livePartner(partner)) return quiet({ reason: "not_live" });
    if (!consent || consent.sms !== true) return quiet({ reason: "no_consent" });
    const to = toE164(consent.phone);
    if (!to) return quiet({ reason: "no_phone" });
    return deliverText({ cfg, repository, booking, partner, kind, to, consentText: REQUEST_CONSENT_TEXT, fetchImpl, now });
  }
  if (kind === "request_accepted_sms" || kind === "request_declined_sms") {
    const want = kind === "request_accepted_sms" ? "confirmed" : "declined";
    if (!booking || booking.status !== want || !booking.id || !booking.confirmation_code) return quiet({ reason: kind === "request_accepted_sms" ? "not_confirmed" : "not_declined" });
    if (!livePartner(partner)) return quiet({ reason: "not_live" });
    let prior, other;
    try {
      prior = await readKind(repository, booking.id, "request_received_sms");
      other = await readKind(repository, booking.id, kind === "request_accepted_sms" ? "request_declined_sms" : "request_accepted_sms");
    } catch { return quiet({ reason: "storage" }); }
    if (other) return quiet({ reason: "other_answer" });
    if (!prior || prior.consent_text !== REQUEST_CONSENT_TEXT) return quiet({ reason: "no_consent" });
    const to = toE164(prior.recipient);
    if (!to) return quiet({ reason: "no_phone" });
    return deliverText({ cfg, repository, booking, partner, kind, to, consentText: REQUEST_CONSENT_TEXT, fetchImpl, now });
  }
  if (kind === "cancellation_sms") {
    if (!booking || booking.status !== "cancelled" || !booking.id || !booking.confirmation_code) return quiet({ reason: "not_cancelled" });
    if (!livePartner(partner)) return quiet({ reason: "not_live" });
    let requestRow, acceptedRow;
    try {
      requestRow = await readKind(repository, booking.id, "request_received_sms");
      acceptedRow = await readKind(repository, booking.id, "request_accepted_sms");
    } catch { return quiet({ reason: "storage" }); }
    const to = requestRow ? toE164(requestRow.recipient) : null;
    const allowed = actor === "restaurant" && requestRow && requestRow.consent_text === REQUEST_CONSENT_TEXT && acceptedRow && to;
    if (!allowed) return recordNotification({ repository, booking, kind, recipient: to, consentText: CANCELLATION_RECORD_TEXT, now });
    return deliverText({ cfg, repository, booking, partner, kind, to, consentText: REQUEST_CONSENT_TEXT, fetchImpl, now });
  }
  return quiet({ reason: "unknown_kind" });
}

/** Confirmation text entry. Same gates as before: confirmed instant booking, this booking's tick, live partner. */
export async function sendBookingConfirmationSms(args) {
  return sendReserveNotification({ ...args, kind: SMS_KIND });
}

/** A delivery callback. Returns { ok, status? } and never moves a status backward. A recorded row is left untouched. */
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
  if (row.status === "recorded" || row.channel === "none" || RECORD_ONLY_KINDS.has(row.kind)) return { ok: true, status: row.status || "recorded", unchanged: true };
  if ((STATUS_RANK[next] ?? 0) <= (STATUS_RANK[row.status] ?? 0) && row.status !== "unknown") return { ok: true, status: row.status, unchanged: true };
  const err = params.ErrorCode ? shortError(`error ${params.ErrorCode}`) : null;
  try { await repository.markNotification(row.id, { status: next, ...(err ? { last_error: err } : {}), note: "callback" }, new Date().toISOString()); } catch { return { ok: false, code: "STORAGE" }; }
  return { ok: true, status: next };
}
