// lib/reservePhone/notify.js - the text hook for a phone request.
// PR #2568's request_received / request_accepted / request_declined kinds are not on main (the notifications
// table only allows confirmation_sms). This maps a phone phase to those kind names and does not send.
// Texting stays behind RESERVE_SMS_ENABLED. Even when that flag is on, this prototype does not call the
// SMS provider: the notification constraint cannot store these kinds until a later reviewed change.
export function phoneTextKind(phase) {
  if (phase === "placed") return "request_received";
  if (phase === "confirmed") return "request_accepted";
  if (phase === "declined") return "request_declined";
  return null;
}

export function planPhoneText({ env = {}, phase } = {}) {
  const kind = phoneTextKind(phase);
  if (String(env.RESERVE_SMS_ENABLED || "") !== "1") return { sent: false, reason: "sms_disabled", kind };
  if (!kind) return { sent: false, reason: "no_text", kind: null };
  return { sent: false, reason: "text_not_sent", kind };
}
