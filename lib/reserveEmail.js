// lib/reserveEmail.js - Resend emails for "Reserve a table". Mirrors
// lib/groupPlanEmail.js and uses its sender (WF_ALERT_FROM). No new sender.
// Plain words, no dashes as punctuation, all dynamic text HTML escaped.
// Nothing here says a table is booked before the restaurant has said yes.
import { reserveEmailReady, formatReserveDate, formatReserveTime } from "./reserve.js";

export { reserveEmailReady };
export const RESERVE_SITE = "https://www.gowayfind.com";

export function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const oneLine = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();

export function partnerEmailContent({ partner, request, token }) {
  const link = `${RESERVE_SITE}/reserve/respond/${token}`;
  const rows = [
    ["People", String(request.party_size)],
    ["Day", formatReserveDate(request.reserve_date)],
    ["Time", formatReserveTime(request.reserve_time)],
    ["Name", request.guest_name],
    ...(request.note ? [["Note", request.note]] : []),
  ];
  const text = [
    `A Wayfind guest would like a table at ${oneLine(partner.name)}.`,
    "", ...rows.map(([k, v]) => `${k}: ${v}`), "",
    "Answer this request:", link, "",
    "Please answer Yes or No with the link. Wayfind does not take payment. If nobody answers, the request runs out of time on its own and the guest is told you did not answer.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111"><h2 style="margin:0 0 12px">New table request</h2><p>A Wayfind guest would like a table at <strong>${escapeHtml(partner.name)}</strong>.</p><table style="border-collapse:collapse;margin:12px 0">${rows.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#555">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`).join("")}</table><p style="margin:20px 0"><a href="${escapeHtml(link)}" style="background:#FF8917;color:#111;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Answer this request</a></p><p style="color:#555;font-size:14px">Please answer Yes or No with the button. Wayfind does not take payment. If nobody answers, the request runs out of time on its own and the guest is told you did not answer.</p></div>`;
  return { subject: "New table request from Wayfind", text, html };
}

export function userEmailContent({ restaurantName, status, request }) {
  const name = oneLine(restaurantName);
  const when = `${formatReserveDate(request.reserve_date)} at ${formatReserveTime(request.reserve_time)}`;
  const confirmed = status === "confirmed";
  const subject = confirmed ? `You're booked at ${name}` : `${name} can't fit that time`;
  const lead = confirmed
    ? `${name} said yes. Your table for ${request.party_size} is set for ${when}.`
    : `${name} can't fit a table for ${request.party_size} on ${when}.`;
  const tail = confirmed ? "Please call the restaurant if your plans change." : "You can try another time or another restaurant on Wayfind.";
  return {
    subject,
    text: `${lead}\n\n${tail}\n\n${RESERVE_SITE}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111"><h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2><p>${escapeHtml(lead)}</p><p>${escapeHtml(tail)}</p><p><a href="${RESERVE_SITE}" style="color:#B45309">Back to Wayfind</a></p></div>`,
  };
}

async function sendResend({ env, fetchImpl, to, content, key }) {
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ from: env.WF_ALERT_FROM, to: [to], subject: content.subject, text: content.text, html: content.html }),
    });
    return response.ok ? { sent: true, reason: null } : { sent: false, reason: "provider_rejected" };
  } catch { return { sent: false, reason: "provider_unconfirmed" }; }
}

/** Email the restaurant its one Answer link. Never throws. */
export async function sendPartnerEmail({ partner, request, token, env = process.env, fetchImpl = fetch }) {
  if (!reserveEmailReady(env)) return { sent: false, reason: "email_not_ready" };
  if (!/^\S+@\S+\.\S+$/.test(String(partner?.contact_email || ""))) return { sent: false, reason: "partner_email_invalid" };
  return sendResend({ env, fetchImpl, to: partner.contact_email, content: partnerEmailContent({ partner, request, token }), key: `reserve-request/${request.id}` });
}

/** After the answer, email the guest at their verified account address. Never throws. */
export async function sendUserEmail({ request, restaurantName, status, config, env = process.env, fetchImpl = fetch }) {
  if (!reserveEmailReady(env)) return { sent: false, reason: "email_not_ready" };
  if (status !== "confirmed" && status !== "declined") return { sent: false, reason: "no_email_for_status" };
  if (!/^[0-9a-f-]{36}$/i.test(request?.user_id || "")) return { sent: false, reason: "invalid_user" };
  let user;
  try {
    const response = await fetchImpl(`${config.url}/auth/v1/admin/users/${request.user_id}`, { headers: { apikey: config.key, authorization: `Bearer ${config.key}` }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { sent: false, reason: response.status === 404 ? "account_unavailable" : "account_check_failed" };
    const body = await response.json();
    user = body?.user || body;
  } catch { return { sent: false, reason: "account_check_failed" }; }
  if (user?.id !== request.user_id || !user.email_confirmed_at || user.is_anonymous === true || !/^\S+@\S+\.\S+$/.test(user.email || "")) return { sent: false, reason: "verified_email_required" };
  return sendResend({ env, fetchImpl, to: user.email, content: userEmailContent({ restaurantName, status, request }), key: `reserve-answer/${request.id}/${status}` });
}
