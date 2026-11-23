// Compliant first-party Twilio SMS for Group Vote (reuses Wayfind's existing
// Twilio credentials and signature verifier from lib/reserveSms.js).
//
// Strict consent rule: Wayfind ONLY texts a phone number that its owner
// directly entered and opted into on Wayfind:
//   - organizer_created:     texts the organizer their ready-to-forward Group
//                            Vote link + organizer results link.
//   - organizer_closed:      texts the organizer when voting finishes.
//   - participant_finalized: texts the organizer and any voter who explicitly
//                            opted in on their own ballot when the plan locks.
// Zero unsolicited third-party texting, zero address-book harvesting.
import { toE164, phoneTail, validTwilioSignature, STATUS_RANK } from "./reserveSms.js";
import { ORGANIZER_SMS_CONSENT_TEXT, PARTICIPANT_SMS_CONSENT_TEXT } from "./groupPlanShareText.js";

export { toE164, phoneTail, ORGANIZER_SMS_CONSENT_TEXT, PARTICIPANT_SMS_CONSENT_TEXT };

const SID = /^AC[0-9a-f]{32}$/;
const MSID = /^MG[0-9a-f]{32}$/;
const E164 = /^\+[1-9][0-9]{7,14}$/;
const MESSAGE_SID = /^(SM|MM)[0-9a-f]{32}$/;
const PROVIDER_STATUS = {
  queued: "queued", accepted: "accepted", scheduled: "queued", sending: "sending",
  sent: "sent", delivered: "delivered", read: "delivered", undelivered: "undelivered",
  failed: "failed", canceled: "failed",
};

/** Configuration using Wayfind's existing Twilio env vars, or null when off. */
export function groupSmsConfig(env = process.env) {
  if (String(env.WF_GROUP_PLAN_SMS_ENABLED || "") === "0") return null;
  const enabled = String(env.WF_GROUP_PLAN_SMS_ENABLED || "") === "1" || String(env.RESERVE_SMS_ENABLED || "") === "1";
  if (!enabled) return null;
  const accountSid = String(env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || "").trim();
  const messagingServiceSid = String(env.TWILIO_MESSAGING_SERVICE_SID || "").trim();
  const from = String(env.TWILIO_FROM_NUMBER || "").trim();
  if (!SID.test(accountSid) || authToken.length < 16) return null;
  if (!MSID.test(messagingServiceSid) && !E164.test(from)) return null;
  const site = String(env.RESERVE_SMS_CALLBACK_BASE || env.NEXT_PUBLIC_SITE_URL || "https://www.gowayfind.com").replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+$/.test(site)) return null;
  return {
    accountSid,
    authToken,
    messagingServiceSid: MSID.test(messagingServiceSid) ? messagingServiceSid : null,
    from: E164.test(from) ? from : null,
    callbackUrl: `${site}/api/group-plans/sms-status`,
    site,
  };
}

export const groupSmsReady = (env = process.env) => groupSmsConfig(env) !== null;

const clean = (v, max = 60) => String(v || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function groupSmsText(kind, { placeName, groupUrl, organizerUrl, finalUrl, timeLabel, replyCount } = {}) {
  const spot = clean(placeName || "your group outing", 60);
  if (kind === "organizer_created" && groupUrl) {
    return `Wayfind Group Vote for ${spot} is live. Forward this link to your group text: ${groupUrl} Manage results: ${organizerUrl || groupUrl} Reply STOP to opt out.`;
  }
  if (kind === "organizer_closed" && organizerUrl) {
    const count = Number.isFinite(replyCount) ? ` (${replyCount} ${replyCount === 1 ? "reply" : "replies"})` : "";
    return `Wayfind Group Vote: Voting finished for ${spot}${count}. Pick the final plan: ${organizerUrl} Reply STOP to opt out.`;
  }
  if (kind === "participant_finalized" && finalUrl) {
    const when = timeLabel ? ` for ${clean(timeLabel, 40)}` : "";
    return `Wayfind: Your group locked in ${spot}${when}. Details: ${finalUrl} Reply STOP to opt out.`;
  }
  return null;
}

const basic = (c) => "Basic " + Buffer.from(`${c.accountSid}:${c.authToken}`).toString("base64");
const shortError = (s) => String(s || "").replace(/\+?\d{7,15}/g, "[number]").slice(0, 200);

async function providerSend(cfg, { to, body, fetchImpl }) {
  const form = new URLSearchParams({ To: to, Body: body, StatusCallback: cfg.callbackUrl });
  if (cfg.messagingServiceSid) form.set("MessagingServiceSid", cfg.messagingServiceSid);
  else form.set("From", cfg.from);
  let res;
  try {
    res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
      method: "POST",
      headers: { authorization: basic(cfg), "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) { return { outcome: "ambiguous", error: shortError(error && error.name) || "network" }; }
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (res.status >= 500 || res.status === 429) return { outcome: "ambiguous", error: `http ${res.status}` };
  if (!res.ok || !json || !MESSAGE_SID.test(String(json.sid || ""))) {
    return { outcome: "rejected", error: shortError(json && (json.code ? `${json.code} ${json.message || ""}` : json.message)) || `http ${res.status}` };
  }
  return { outcome: "accepted", sid: json.sid, status: PROVIDER_STATUS[json.status] || "queued" };
}

/** Claim durable row before Twilio call so duplicate clicks never double-text. */
export async function sendGroupPlanSms({ repository, planId, slotKey, kind, to, consentText, textParams, env = process.env, fetchImpl = fetch, now = Date.now }) {
  const cfg = groupSmsConfig(env);
  if (!cfg) return { sent: false, reason: "disabled" };
  const phone = toE164(to);
  if (!phone) return { sent: false, reason: "bad_phone" };
  const body = groupSmsText(kind, textParams);
  if (!body) return { sent: false, reason: "bad_body" };
  if (!repository || typeof repository.claimSms !== "function") return { sent: false, reason: "storage" };
  const nowIso = new Date(now()).toISOString();
  let row;
  try {
    row = await repository.claimSms({ planId, slotKey, kind, recipient: phone, consentAt: nowIso, consentText });
  } catch { return { sent: false, reason: "storage" }; }
  if (!row) return { sent: false, reason: "storage" };
  if (!row.claimed) return { sent: false, reason: "already", status: row.status };

  const out = await providerSend(cfg, { to: phone, body, fetchImpl });
  const attempt = (row.attempts | 0) + 1;
  try {
    if (out.outcome === "accepted") {
      await repository.markSms(row.id, { status: out.status, provider: "twilio", provider_message_id: out.sid, attempts: attempt, note: "accepted" }, nowIso);
      return { sent: true, reason: "accepted", sid: out.sid, status: out.status };
    }
    if (out.outcome === "rejected") {
      await repository.markSms(row.id, { status: "failed", attempts: attempt, last_error: out.error, note: "rejected" }, nowIso);
      return { sent: false, reason: "rejected" };
    }
    await repository.markSms(row.id, { status: "unknown", attempts: attempt, last_error: out.error, note: "ambiguous" }, nowIso);
    return { sent: false, reason: "ambiguous" };
  } catch {
    return { sent: out.outcome === "accepted", reason: out.outcome };
  }
}

export async function applyGroupSmsStatusCallback({ repository, params, env = process.env, signature, url }) {
  const cfg = groupSmsConfig(env);
  if (!cfg) return { ok: false, code: "DISABLED" };
  if (!validTwilioSignature(cfg.authToken, url || cfg.callbackUrl, params, signature)) return { ok: false, code: "BAD_SIGNATURE" };
  if (params.AccountSid !== cfg.accountSid) return { ok: false, code: "WRONG_ACCOUNT" };
  const sid = String(params.MessageSid || params.SmsSid || "");
  const next = PROVIDER_STATUS[String(params.MessageStatus || params.SmsStatus || "").toLowerCase()];
  if (!MESSAGE_SID.test(sid) || !next) return { ok: false, code: "BAD_PAYLOAD" };
  let row;
  try { row = await repository.smsByProviderId("twilio", sid); } catch { return { ok: false, code: "STORAGE" }; }
  if (!row) return { ok: true, code: "UNKNOWN_MESSAGE" };
  if ((STATUS_RANK[next] ?? 0) <= (STATUS_RANK[row.status] ?? 0) && row.status !== "unknown") return { ok: true, status: row.status, unchanged: true };
  const err = params.ErrorCode ? shortError(`error ${params.ErrorCode}`) : null;
  try { await repository.markSms(row.id, { status: next, ...(err ? { last_error: err } : {}), note: "callback" }, new Date().toISOString()); }
  catch { return { ok: false, code: "STORAGE" }; }
  return { ok: true, status: next };
}
