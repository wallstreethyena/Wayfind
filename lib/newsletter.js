// lib/newsletter.js — Wayfind's weekly things-to-do email (owner order
// 2026-11-27: "an email signup on the site plus a weekly email of things to
// do"). PURE: no network, no env, safe to import from a guard.
//
// THE PROMISE THE FORM MAKES, AND THIS FILE KEEPS:
//   * one email a week, Thursday, for the region the reader picked;
//   * the picks are real: this weekend's events from wf_events through the
//     same ranking the /events/<city>/this-weekend page uses
//     (lib/regionalWeekend.regionalWeekendPicks), and places from owned
//     inventory ranked by the Wayfind Score. Nothing is invented or padded:
//     a section with nothing real in it is left out;
//   * options, not orders: a few labelled picks per section, never "the best";
//   * every ticket link goes through our own /api/<provider>/go redirects (CLAUDE.md
//     revenue rule 4), so the click is attributed and the partner URL is
//     validated server side;
//   * every email carries a one-click unsubscribe (RFC 8058 header + link),
//     the WAYFIND LLC postal address, and why the reader is getting it.
//
// Copy rule (owner): plain words, no dashes in public copy, no prices.

import { cityWeekendRegionKey, eventInWeekendRegion, weekendRegionByKey, WEEKEND_REGION_KEYS } from "./regionalWeekend.js";

export const NEWSLETTER_FROM = "Wayfind <hello@gowayfind.com>";
export const NEWSLETTER_REPLY_TO = "hello@gowayfind.com";
export const NEWSLETTER_POSTAL = "WAYFIND LLC, 6547 Midnight Pass Rd, PMB 3021, Sarasota, FL 34242";
export const NEWSLETTER_SURFACE = "weekly_email";

// The exact words shown next to the button, stored on every subscriber row so
// we can always show what someone agreed to. Bump the version when the words
// change.
export const CONSENT_VERSION = "2026-11-27";
export const CONSENT_TEXT = "Send me Wayfind's free weekly email with things to do near me. I can unsubscribe anytime.";

export const NEWSLETTER_REGIONS = Object.freeze(
  WEEKEND_REGION_KEYS.map((key) => ({ key, name: weekendRegionByKey(key).name })),
);

// The area a signup form should preselect: the region an event sits in, or
// the region a city page belongs to. Null when we cannot tell (the form then
// asks the reader to pick).
export function regionForEvent(event) {
  if (!event) return null;
  for (const key of WEEKEND_REGION_KEYS) {
    try { if (eventInWeekendRegion(event, weekendRegionByKey(key))) return key; } catch (e) { /* malformed row */ }
  }
  return null;
}

export function regionForCity(citySlug) {
  const s = String(citySlug || "").toLowerCase();
  if (WEEKEND_REGION_KEYS.includes(s)) return s;
  return cityWeekendRegionKey(s);
}

export function normalizeEmail(raw) {
  return String(raw == null ? "" : raw).trim().toLowerCase();
}

// Mirrors the table's CHECK constraint (supabase/migrations/20261127200000).
export function isValidEmail(email) {
  const e = String(email || "");
  return e.length >= 6 && e.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/.test(e);
}

export function normalizeRegion(raw) {
  const k = String(raw == null ? "" : raw).trim().toLowerCase();
  return WEEKEND_REGION_KEYS.includes(k) ? k : null;
}

// A same-site path to return the reader to after the thank-you page. Anything
// that is not a plain absolute path on this site ("//evil.com", "https:",
// backslashes) collapses to "/".
export function safeReturnPath(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\u0000-\u001f]/.test(s) || s.length > 200) return "/";
  return s;
}

export function isUnsubscribeToken(t) {
  return /^[a-f0-9]{64}$/.test(String(t || ""));
}

// ISO 8601 week, e.g. "2026-W48" (same math as the weekend-picks push).
export function isoWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Public copy carries no dashes (owner rule). Source text from venues often
// does, so separators become commas and ranges become "to".
export function noDashes(s) {
  return String(s == null ? "" : s)
    .replace(/(\d)\s*[–—-]\s*(\d)/g, "$1 to $2")
    .replace(/\s+[–—-]+\s+/g, ", ")
    .replace(/[–—]/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function absolute(base, href) {
  const h = String(href || "");
  if (!h) return "";
  if (/^https:\/\//i.test(h)) return h;
  if (h.startsWith("/") && !h.startsWith("//")) return base + h;
  return "";
}

function withUtm(url, campaign, content) {
  if (!url) return "";
  // Only our own pages get UTM tags; our /api/<provider>/go redirects keep their own
  // attribution (surface + content) and are never decorated.
  if (/\/api\/[a-z-]+\/go\?/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=email&utm_medium=weekly_email&utm_campaign=${encodeURIComponent(campaign)}${content ? "&utm_content=" + encodeURIComponent(content) : ""}`;
}

// Ticket links ride only on our own attributed redirects (/api/commerce/go,
// /api/ticketmaster/go, ...); a raw partner URL never reaches an inbox.
function ourRedirect(ticket) {
  return !!(ticket && typeof ticket.href === "string" && /^\/api\/[a-z-]+\/go\?/.test(ticket.href));
}

function fmtDay(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtShortDay(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export const PLACE_SECTIONS = Object.freeze([
  { key: "eat", title: "Eat", cat: "food" },
  { key: "drink", title: "Drinks and nights out", cat: "nightlife" },
  { key: "explore", title: "Get out and explore", cat: "attractions" },
]);
export const PLACES_PER_SECTION = 3;
export const MAX_EVENT_PICKS = 5;

/**
 * Build one week's issue for one region. Every input is server-held data:
 *   region   weekendRegionByKey(key)
 *   window   { start, end } YMD of the weekend
 *   events   [{ label, name, day, where, cost, detailsHref, ticket: {href,label}|null }]
 *   places   { eat: [{ name, where, score, href }], drink: [...], explore: [...] }
 *   unsubscribeUrl, webUrl   absolute URLs (the preview uses placeholders)
 * Returns { subject, preheader, html, text } or null when there is nothing
 * real to send (no events AND no places), so the cron skips the region.
 */
export function buildWeeklyIssue({ region, window, events = [], places = {}, siteUrl, unsubscribeUrl, webUrl, week }) {
  if (!region || !window) return null;
  const base = String(siteUrl || "https://www.gowayfind.com").replace(/\/+$/, "");
  const campaign = `weekly-${week || "preview"}-${region.key}`;
  const evs = events.filter((e) => e && e.name && e.detailsHref).slice(0, MAX_EVENT_PICKS);
  const sections = PLACE_SECTIONS
    .map((s) => ({ ...s, items: (places[s.key] || []).filter((p) => p && p.name && p.href).slice(0, PLACES_PER_SECTION) }))
    .filter((s) => s.items.length);
  if (!evs.length && !sections.length) return null;

  const range = window.start === window.end ? fmtDay(window.start) : `${fmtShortDay(window.start)} to ${fmtShortDay(window.end)}`;
  const moreHref = withUtm(absolute(base, region.eventsHref || region.guide || "/florida-events"), campaign, "more");
  const homeHref = withUtm(base + "/", campaign, "home");
  const lead = evs[0] ? noDashes(evs[0].name) : sections[0].items[0].name;
  const subject = evs.length
    ? `This weekend in ${region.name}: ${lead} and ${evs.length > 1 ? `${evs.length - 1} more` : "places worth the trip"}`
    : `This week in ${region.name}: places worth the trip`;
  const preheader = `${range}. Your Wayfind picks for ${region.cities}.`;

  // ── text ──
  const t = [];
  t.push(`Your weekend in ${region.name}`, range, "");
  if (evs.length) {
    t.push("THIS WEEKEND");
    for (const e of evs) {
      t.push(`${e.label ? e.label.toUpperCase() + ": " : ""}${noDashes(e.name)}`);
      const meta = [e.day ? fmtShortDay(e.day) : "", noDashes(e.where || "")].filter(Boolean).join(", ");
      if (meta) t.push(meta);
      if (e.cost) t.push(noDashes(e.cost));
      if (ourRedirect(e.ticket)) t.push(`${noDashes(e.ticket.label || "Get tickets")}: ${absolute(base, e.ticket.href)}`);
      t.push(`Details: ${withUtm(absolute(base, e.detailsHref), campaign, "event")}`, "");
    }
    t.push(`More this weekend: ${moreHref}`, "");
  }
  for (const s of sections) {
    t.push(s.title.toUpperCase());
    for (const p of s.items) {
      t.push(`${p.name}${p.score ? ` (Wayfind ${p.score})` : ""}${p.where ? ", " + p.where : ""}`);
      t.push(withUtm(absolute(base, p.href), campaign, s.key));
    }
    t.push("");
  }
  t.push(`See what's good near you right now: ${homeHref}`, "");
  t.push(`You're getting this because you signed up for Wayfind's weekly email for ${region.name} on gowayfind.com.`);
  t.push(`Unsubscribe in one click: ${unsubscribeUrl}`);
  if (webUrl) t.push(`View in your browser: ${webUrl}`);
  t.push(NEWSLETTER_POSTAL);
  const text = t.join("\n").replace(/\n{3,}/g, "\n\n");

  // ── html ── white, centered narrow column (the owner's Resend style).
  const btn = (href, label, primary) => `<a href="${esc(href)}" style="display:inline-block;${primary ? "background:#F97316;color:#ffffff;" : "background:#ffffff;color:#111111;border:1px solid #d9dde3;"}font-weight:700;font-size:14px;line-height:1;padding:11px 16px;border-radius:10px;text-decoration:none;margin:10px 8px 0 0">${esc(label)}</a>`;
  const eventCard = (e) => {
    const meta = [e.day ? fmtShortDay(e.day) : "", noDashes(e.where || "")].filter(Boolean).join(" · ");
    const details = withUtm(absolute(base, e.detailsHref), campaign, "event");
    const ticket = ourRedirect(e.ticket) ? absolute(base, e.ticket.href) : "";
    return `<tr><td style="padding:0 0 14px 0"><div style="border:1px solid #e6e8ec;border-radius:14px;padding:16px 18px">
${e.label ? `<div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#F97316">${esc(e.label)}</div>` : ""}
<a href="${esc(details)}" style="display:block;font-size:18px;line-height:1.3;font-weight:800;color:#111111;text-decoration:none;margin-top:4px">${esc(noDashes(e.name))}</a>
${meta ? `<div style="font-size:14px;line-height:1.5;color:#555b66;margin-top:4px">${esc(meta)}</div>` : ""}
${e.cost ? `<div style="font-size:14px;line-height:1.5;color:#555b66">${esc(noDashes(e.cost))}</div>` : ""}
<div>${ticket ? btn(ticket, noDashes(e.ticket.label || "Get tickets"), true) : ""}${btn(details, "See details", !ticket)}</div>
</div></td></tr>`;
  };
  const placeRow = (p, key) => `<tr><td style="padding:10px 0;border-top:1px solid #eef0f3">
<a href="${esc(withUtm(absolute(base, p.href), campaign, key))}" style="font-size:16px;font-weight:700;color:#111111;text-decoration:none">${esc(p.name)}</a>${p.score ? ` <span style="font-size:12px;font-weight:800;color:#F97316;white-space:nowrap">Wayfind ${esc(p.score)}</span>` : ""}
${p.where ? `<div style="font-size:13px;color:#6b7280;margin-top:2px">${esc(p.where)}</div>` : ""}
</td></tr>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ffffff">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:28px 16px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 0 22px 0"><a href="${esc(homeHref)}"><img src="${esc(base)}/brand/wayfind/derived/wayfind-logo-tagline-black-email.png" width="180" height="57" alt="Wayfind" style="display:block;border:0;width:180px;height:auto"></a></td></tr>
<tr><td style="padding:0 0 6px 0"><div style="font-size:13px;font-weight:700;color:#6b7280">${esc(range)}</div>
<h1 style="font-size:26px;line-height:1.2;margin:4px 0 8px;color:#111111">Your weekend in ${esc(region.name)}</h1>
<p style="font-size:15px;line-height:1.55;color:#374151;margin:0 0 22px">A few good options for ${esc(region.cities)}. Pick what fits your weekend.</p></td></tr>
${evs.length ? `<tr><td style="padding:0 0 8px 0"><div style="font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#111111">This weekend</div></td></tr>
${evs.map(eventCard).join("\n")}
<tr><td style="padding:0 0 26px 0"><a href="${esc(moreHref)}" style="font-size:14px;font-weight:700;color:#F97316;text-decoration:none">See everything on this weekend</a></td></tr>` : ""}
${sections.map((s) => `<tr><td style="padding:0 0 22px 0"><div style="font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#111111;margin-bottom:4px">${esc(s.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${s.items.map((p) => placeRow(p, s.key)).join("")}</table></td></tr>`).join("\n")}
<tr><td align="center" style="padding:4px 0 28px 0">${btn(homeHref, "See what's good near you", true)}</td></tr>
<tr><td style="border-top:1px solid #eef0f3;padding:18px 0 0 0;font-size:12px;line-height:1.6;color:#8a9099">
You're getting this because you signed up for Wayfind's weekly email for ${esc(region.name)} on gowayfind.com.<br>
<a href="${esc(unsubscribeUrl)}" style="color:#8a9099">Unsubscribe</a>${webUrl ? ` · <a href="${esc(webUrl)}" style="color:#8a9099">View in your browser</a>` : ""}<br>
Some links are affiliate links. We may earn a commission if you book. It never changes our picks.<br>
${esc(NEWSLETTER_POSTAL)}
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: noDashes(subject), preheader, html, text };
}
