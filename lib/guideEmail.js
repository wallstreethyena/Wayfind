// SERVER-ONLY. The email a reader asked for on a guide page.
//
// WHY (audit 2026-10-20): GuideEmailCapture tells the reader "Sent. Check your
// inbox — your guide is on the way." but /api/signup only stored the row, so no
// email ever went out. A promise the product does not keep is the fastest way
// to lose a reader who was ready to come back. This sends that one email.
//
// Content comes ONLY from server-held guide data (GUIDES[slug]); nothing the
// visitor typed except the address is ever placed in the message. One email per
// (address, guide): the route only calls this for a NEW signup row, and Resend's
// Idempotency-Key covers a double-submit in the same day.
import { createHash } from "node:crypto";
import { GUIDES } from "./guides.js";
import { SITE_URL } from "./site.js";
import { FEEDBACK_TEAM_EMAIL } from "./feedbackNotification.js";

export const GUIDE_EMAIL_FROM = "Wayfind <guides@gowayfind.com>";
const MAX_PICKS = 10;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Pure: builds the message for a real guide, or null for an unknown slug.
export function guideEmailMessage(slug) {
  const g = slug && Object.prototype.hasOwnProperty.call(GUIDES, slug) ? GUIDES[slug] : null;
  if (!g || !g.title) return null;
  const base = String(SITE_URL || "https://www.gowayfind.com").replace(/\/+$/, "");
  const utm = "utm_source=email&utm_medium=guide_email&utm_campaign=" + encodeURIComponent(slug);
  const guideUrl = `${base}/guides/${encodeURIComponent(slug)}?${utm}`;
  const homeUrl = `${base}/?${utm}`;
  const picks = (Array.isArray(g.picks) ? g.picks : []).filter((p) => p && p.name).slice(0, MAX_PICKS);
  const pickUrl = (p) => (p.placeId ? `${base}/places/${encodeURIComponent(p.placeId)}?${utm}` : guideUrl);
  const firstSentence = (t) => { const s = String(t || "").replace(/\s+/g, " ").trim(); const m = s.match(/^.{0,220}?[.!?](\s|$)/); return (m ? m[0] : s.slice(0, 220)).trim(); };

  const text = [
    `Here is the guide you asked for: ${g.title}`,
    g.intro ? firstSentence(g.intro) : "",
    "",
    ...picks.map((p, i) => `${i + 1}. ${p.name}${p.blurb ? " — " + firstSentence(p.blurb) : ""}\n   ${pickUrl(p)}`),
    "",
    `Open the full guide (hours, maps, and what's nearby): ${guideUrl}`,
    `See what's good near you right now: ${homeUrl}`,
    "",
    "You got this one email because you asked for this guide on gowayfind.com. Reply with \"unsubscribe\" and we'll take you off the list.",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
<div style="font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#F97316">Your Wayfind guide</div>
<h1 style="font-size:22px;line-height:1.25;margin:8px 0 10px">${esc(g.title)}</h1>
${g.intro ? `<p style="font-size:15px;line-height:1.55;color:#333;margin:0 0 18px">${esc(firstSentence(g.intro))}</p>` : ""}
${picks.map((p, i) => `<div style="background:#fff;border-radius:12px;padding:14px 16px;margin:0 0 10px;border:1px solid #e6e8ec">
<a href="${esc(pickUrl(p))}" style="font-size:16px;font-weight:800;color:#111;text-decoration:none">${i + 1}. ${esc(p.name)}</a>
${p.blurb ? `<div style="font-size:14px;line-height:1.5;color:#444;margin-top:4px">${esc(firstSentence(p.blurb))}</div>` : ""}
</div>`).join("\n")}
<div style="text-align:center;margin:22px 0 10px"><a href="${esc(guideUrl)}" style="display:inline-block;background:#F97316;color:#fff;font-weight:800;font-size:15px;padding:13px 22px;border-radius:12px;text-decoration:none">Open the full guide</a></div>
<p style="text-align:center;font-size:14px;margin:0 0 22px"><a href="${esc(homeUrl)}" style="color:#F97316;font-weight:700">See what's good near you right now</a></p>
<p style="font-size:12px;line-height:1.5;color:#888;margin:0">You got this one email because you asked for this guide on gowayfind.com. Reply with "unsubscribe" and we'll take you off the list.</p>
</div></body></html>`;

  return { subject: `Your guide: ${g.title}`, text, html };
}

// Sends it. Production only (a preview or local run never emails a real
// person). Never throws; returns { sent, reason }.
export async function sendGuideEmail({ email, slug }, {
  env = process.env, fetchImpl = fetch,
  report = (reason) => console.error("[guide-email] " + reason),
} = {}) {
  try {
    if (env.VERCEL_ENV !== "production") return { sent: false, reason: "preview" };
    const msg = guideEmailMessage(slug);
    if (!msg) return { sent: false, reason: "unknown_guide" };
    const to = String(email || "").trim().toLowerCase();
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i.test(to) || to.length > 254) return { sent: false, reason: "bad_address" };
    const key = String(env.RESEND_API_KEY || "").trim();
    if (!key) { report("RESEND_API_KEY missing"); return { sent: false, reason: "unconfigured" }; }
    const idem = "guide/" + createHash("sha256").update(to + "|" + slug).digest("hex").slice(0, 40);
    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "Idempotency-Key": idem },
      body: JSON.stringify({ from: GUIDE_EMAIL_FROM, to: [to], reply_to: FEEDBACK_TEAM_EMAIL, subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (r && r.ok) return { sent: true };
    report("send refused: HTTP " + (r ? r.status : "none"));
    return { sent: false, reason: "send_failed" };
  } catch (e) {
    report("send error: " + (e && e.message));
    return { sent: false, reason: "send_failed" };
  }
}
