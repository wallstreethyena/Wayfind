// lib/reserveEmail.js - Resend emails for "Reserve a table". Mirrors
// lib/groupPlanEmail.js and uses its sender (WF_ALERT_FROM). No new sender.
// Plain words, no dashes as punctuation, all dynamic text HTML escaped.
// Emails go only for LIVE partners, in production, when email is ready (reserveEmailAllowed).
// A booking never depends on an email: every function here returns a result and never throws.
import { reserveEmailAllowed, formatReserveDate, formatReserveTime } from "./reserve.js";

export const RESERVE_SITE = "https://www.gowayfind.com";

export function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const oneLine = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();
const when = (b) => `${formatReserveDate(b.reserve_date)} at ${formatReserveTime(b.reserve_time)}`;
const placeLink = (placeId) => `${RESERVE_SITE}/places/${encodeURIComponent(placeId)}`;

function wrap(subject, paragraphs, link) {
  const text = [...paragraphs, link ? `${link.label}: ${link.href}` : "", RESERVE_SITE].filter(Boolean).join("\n\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111"><h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}${link ? `<p style="margin:20px 0"><a href="${escapeHtml(link.href)}" style="background:#FF8917;color:#111;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">${escapeHtml(link.label)}</a></p>` : ""}<p><a href="${RESERVE_SITE}" style="color:#B45309">Back to Wayfind</a></p></div>`;
  return { subject, text, html };
}

/** To the guest, right after the booking is saved. */
export function guestConfirmationContent({ partner, booking }) {
  const name = oneLine(partner.name);
  return wrap(`You're booked at ${name}`, [
    `Your table for ${booking.party_size} is set for ${when(booking)}.`,
    `Confirmation code: ${booking.confirmation_code}`,
    partner.phone ? `Running late? Call ${oneLine(partner.phone)}.` : "Running late? Call the restaurant.",
    "To cancel, open the restaurant on Wayfind and tap Reserve a table.",
  ], { label: "Open on Wayfind", href: placeLink(partner.place_id) });
}

/** To the restaurant: a new booking. The guest phone is included only with consent. */
export function partnerNoticeContent({ partner, booking }) {
  const rows = [
    `Day: ${formatReserveDate(booking.reserve_date)}`,
    `Time: ${formatReserveTime(booking.reserve_time)}`,
    `People: ${booking.party_size}`,
    `Name: ${oneLine(booking.guest_name)}`,
    `Code: ${booking.confirmation_code}`,
    ...(booking.note ? [`Note: ${oneLine(booking.note)}`] : []),
    ...(booking.guest_phone && booking.phone_consent_at ? [`Guest phone (shared with consent): ${oneLine(booking.guest_phone)}`] : []),
  ];
  return wrap("New table booked on Wayfind", [
    `A guest booked a table at ${oneLine(partner.name)}. It is already confirmed.`,
    rows.join("\n"),
    "You can cancel it or offer another time from your Wayfind dashboard link.",
  ], null);
}

/** To the guest about 3 hours before. */
export function guestReminderContent({ partner, booking }) {
  const name = oneLine(partner.name);
  return wrap(`Your table at ${name} is today`, [
    `A reminder: your table for ${booking.party_size} is set for ${when(booking)}.`,
    `Confirmation code: ${booking.confirmation_code}`,
    partner.phone ? `Running late or need to change something? Call ${oneLine(partner.phone)}.` : "Running late? Call the restaurant.",
    "To cancel, open the restaurant on Wayfind and tap Reserve a table.",
  ], { label: "Open on Wayfind", href: placeLink(partner.place_id) });
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

/** The signed in guest's verified address, from the account service. Null when there is none. */
async function verifiedGuestEmail({ userId, config, fetchImpl }) {
  if (!/^[0-9a-f-]{36}$/i.test(userId || "")) return { email: null, reason: "invalid_user" };
  try {
    const response = await fetchImpl(`${config.url}/auth/v1/admin/users/${userId}`, { headers: { apikey: config.key, authorization: `Bearer ${config.key}` }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { email: null, reason: response.status === 404 ? "account_unavailable" : "account_check_failed" };
    const body = await response.json();
    const user = body?.user || body;
    if (user?.id !== userId || !user.email_confirmed_at || user.is_anonymous === true || !/^\S+@\S+\.\S+$/.test(user.email || "")) return { email: null, reason: "verified_email_required" };
    return { email: user.email, reason: null };
  } catch { return { email: null, reason: "account_check_failed" }; }
}

/** Email the restaurant about a new booking. Never throws. */
export async function sendPartnerNotice({ partner, booking, env = process.env, fetchImpl = fetch }) {
  if (!reserveEmailAllowed(partner, env)) return { sent: false, reason: "email_not_allowed" };
  if (!/^\S+@\S+\.\S+$/.test(String(partner?.contact_email || ""))) return { sent: false, reason: "partner_email_invalid" };
  return sendResend({ env, fetchImpl, to: partner.contact_email, content: partnerNoticeContent({ partner, booking }), key: `reserve-notice/${booking.id}` });
}

/** Email the guest at their verified account address: kind is "confirmation" or "reminder". Never throws. */
export async function sendGuestEmail({ partner, booking, kind = "confirmation", config, env = process.env, fetchImpl = fetch }) {
  if (!reserveEmailAllowed(partner, env)) return { sent: false, reason: "email_not_allowed" };
  if (kind !== "confirmation" && kind !== "reminder") return { sent: false, reason: "unknown_kind" };
  const who = await verifiedGuestEmail({ userId: booking?.user_id, config, fetchImpl });
  if (!who.email) return { sent: false, reason: who.reason };
  const content = kind === "reminder" ? guestReminderContent({ partner, booking }) : guestConfirmationContent({ partner, booking });
  return sendResend({ env, fetchImpl, to: who.email, content, key: `reserve-${kind}/${booking.id}` });
}
