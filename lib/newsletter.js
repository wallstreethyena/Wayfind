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

// The owner's logo, from the brand vault (id wayfind-logo-white): white
// wordmark, orange dot, orange pin, transparent. Used as the exact supplied
// file, never redrawn or recolored; it needs a dark background to read.
export const NEWSLETTER_LOGO = Object.freeze({
  path: "/brand/wayfind/logo/wayfind-logo-white-orange-transparent-a.png",
  width: 222,
  height: 74,
});

// Photos the email may carry that are not tied to one listing: licensed
// Unsplash photos (Unsplash licence, free for commercial use; the photographer
// is credited under each, as Unsplash asks), hotlinked from Unsplash's image
// host as its API guidelines require, at 2x the shown width. None of these is
// ever shown on an event or a place as if it pictured that venue.
const UNSPLASH = (id, w, h) => `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&crop=entropy&q=72&fm=jpg&auto=format`;
export const EMAIL_PHOTOS = Object.freeze({
  hero: Object.freeze({
    christmas: Object.freeze({ src: UNSPLASH("photo-1608047912959-620ac252bb3d", 1120, 640), alt: "Palm trees wrapped in red, green and white Christmas lights beside a lit Ferris wheel at night in Orlando", credit: "Mick Haupt on Unsplash", unsplash: "KJZKL3iyorA" }),
    wayfind: Object.freeze({ src: UNSPLASH("photo-1643398090340-b2bc623e51f1", 1120, 640), alt: "Mangroves around calm blue water at Weedon Island near St. Petersburg", credit: "Tampa Bay Estuary Program on Unsplash", unsplash: "p3dKBy6iYO0" }),
  }),
  sections: Object.freeze({
    eat: Object.freeze({ src: UNSPLASH("photo-1746586860685-a804ac6e3f9c", 1120, 400), alt: "Shrimp cocktail, seafood and drinks on a restaurant table", credit: "Kevin Torres on Unsplash", unsplash: "gX3Hs8kqZyU" }),
    drink: Object.freeze({ src: UNSPLASH("photo-1566417713940-fe7c737a9ef2", 1120, 400), alt: "A bartender pouring a drink into a glass at a bar", credit: "Louis Hansel on Unsplash", unsplash: "yLUvnCFI500" }),
    explore: Object.freeze({ src: UNSPLASH("photo-1643398090340-b2bc623e51f1", 1120, 400), alt: "Mangroves around calm blue water at Weedon Island near St. Petersburg", credit: "Tampa Bay Estuary Program on Unsplash", unsplash: "p3dKBy6iYO0" }),
  }),
});

// Christmas runs on the site from mid November through New Year's Eve; an
// issue whose weekend starts in that window wears the Christmas look (the
// site's deep red, gold and cream). Any other week gets Wayfind's own dark.
export function isChristmasIssue(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return false;
  const md = Number(m[2]) * 100 + Number(m[3]);
  return md >= 1115 && md <= 1231;
}

export function issueTheme(ymd) {
  if (isChristmasIssue(ymd)) {
    return {
      key: "christmas",
      page: "#2A0409", bar: "#160204", hero: "#4A0610", tagBg: "#F5C451", tagText: "#2A0409", card: "#5A0712", cardLine: "#7A1D26", line: "#6E1820",
      title: "#FFF6F0", body: "#F7DCCB", muted: "#E9C3B0", fine: "#C9A49A",
      accent: "#F5C451", head: "#FFE9C8", link: "#F5C451",
      btn: "#F97316", btnText: "#FFFFFF", ghost: "#E8B48A",
      lights: ["#F5C451", "#E5484D", "#3FB950", "#FFE9C8"],
      kicker: "Christmas in Florida",
      subjectPrefix: "🎄 ",
      eventsHead: "Christmas this weekend",
      headline: (name) => `Your Christmas weekend in ${name}`,
      intro: (cities) => `Lights, parades and a few good plans for ${cities}. Pick what fits your weekend.`,
    };
  }
  return {
    key: "wayfind",
    page: "#0B0F15", bar: "#05070A", hero: "#121821", tagBg: "#F97316", tagText: "#FFFFFF", card: "#161D27", cardLine: "#263142", line: "#222B38",
    title: "#F1F5F9", body: "#C9D1D9", muted: "#9AA6B6", fine: "#7D8796",
    accent: "#F97316", head: "#E6EDF3", link: "#FB923C",
    btn: "#F97316", btnText: "#FFFFFF", ghost: "#3A4658",
    lights: [],
    kicker: "",
    subjectPrefix: "",
    eventsHead: "This weekend",
    headline: (name) => `Your weekend in ${name}`,
    intro: (cities) => `A few good options for ${cities}. Pick what fits your weekend.`,
  };
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
  const th0 = issueTheme(window.start);
  const subject = `${th0.subjectPrefix}${evs.length
    ? `This weekend in ${region.name}: ${lead} and ${evs.length > 1 ? `${evs.length - 1} more` : "places worth the trip"}`
    : `This week in ${region.name}: places worth the trip`}`;
  const preheader = `${range}. Your Wayfind picks for ${region.cities}.`;

  // ── text ──
  const t = [];
  t.push(th0.headline(region.name), range, "");
  if (evs.length) {
    t.push(th0.eventsHead.toUpperCase());
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

  // ── html ── a branded, photo led layout: a dark header bar with the
  // owner's white logo (brand vault id wayfind-logo-white, the exact file),
  // a big hero photo, a bold headline and one strong button, then photo cards.
  // In the Christmas season it wears the site's Christmas colors (deep red,
  // gold, cream). Every photo is one Wayfind may send (see EMAIL_PHOTOS and
  // newsletterServer.eventEmailPhoto), sized 2x for sharp phones.
  const th = issueTheme(window.start);
  const W = 560;
  const img = (src, alt, h) => `<img src="${esc(absolute(base, src))}" width="${W}" height="${h}" alt="${esc(alt)}" style="display:block;border:0;width:100%;max-width:${W}px;height:auto">`;
  const credit = (txt) => txt ? `<div style="font-size:11px;line-height:1.4;color:${th.fine};padding:6px 2px 0 2px">Photo: ${esc(noDashes(txt))}</div>` : "";
  const btn = (href, label, primary, big) => `<a href="${esc(href)}" style="display:inline-block;${primary ? `background:${th.btn};color:${th.btnText};border:1px solid ${th.btn};` : `background:transparent;color:${th.title};border:1px solid ${th.ghost};`}font-weight:800;font-size:${big ? 16 : 14}px;line-height:1;padding:${big ? "15px 22px" : "12px 16px"};border-radius:10px;text-decoration:none;margin:12px 8px 0 0">${esc(label)}${big ? " &rsaquo;" : ""}</a>`;
  const eventCard = (e) => {
    const meta = [e.day ? fmtShortDay(e.day) : "", noDashes(e.where || "")].filter(Boolean).join(" · ");
    const details = withUtm(absolute(base, e.detailsHref), campaign, "event");
    const ticket = ourRedirect(e.ticket) ? absolute(base, e.ticket.href) : "";
    const ph = e.photo && e.photo.src ? e.photo : null;
    return `<tr><td style="padding:0 0 18px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${th.card}" style="background:${th.card};border:1px solid ${th.cardLine};border-radius:16px;overflow:hidden">
${ph ? `<tr><td style="padding:0;border-radius:16px 16px 0 0;overflow:hidden"><a href="${esc(details)}">${img(ph.src, ph.alt, 300)}</a></td></tr>` : ""}
<tr><td style="padding:18px 20px 20px 20px">
${e.label ? `<div style="font-size:11px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:${th.accent}">${esc(e.label)}</div>` : ""}
<a href="${esc(details)}" style="display:block;font-size:20px;line-height:1.25;font-weight:800;color:${th.title};text-decoration:none;margin-top:6px">${esc(noDashes(e.name))}</a>
${meta ? `<div style="font-size:14px;line-height:1.5;color:${th.muted};margin-top:6px">${esc(meta)}</div>` : ""}
${e.cost ? `<div style="font-size:14px;line-height:1.5;color:${th.muted}">${esc(noDashes(e.cost))}</div>` : ""}
<div>${ticket ? btn(ticket, noDashes(e.ticket.label || "Get tickets"), true) : ""}${btn(details, "See details", !ticket)}</div>
${ph ? credit(ph.credit) : ""}
</td></tr></table></td></tr>`;
  };
  const placeRow = (p, key) => `<tr><td style="padding:12px 0;border-top:1px solid ${th.line}">
<a href="${esc(withUtm(absolute(base, p.href), campaign, key))}" style="font-size:16px;font-weight:700;color:${th.title};text-decoration:none">${esc(p.name)}</a>${p.score ? ` <span style="font-size:12px;font-weight:800;color:${th.accent};white-space:nowrap">Wayfind ${esc(p.score)}</span>` : ""}
${p.where ? `<div style="font-size:13px;color:${th.muted};margin-top:2px">${esc(p.where)}</div>` : ""}
</td></tr>`;
  const sectionHead = (label) => `<div style="font-size:13px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${th.head};margin:0 0 10px 0">${esc(label)}</div>`;
  const hero = EMAIL_PHOTOS.hero[th.key] || null;
  const sectionBlock = (s) => {
    const ph = EMAIL_PHOTOS.sections[s.key];
    const banner = ph && (!hero || ph.src !== hero.src) ? `<div style="border-radius:14px;overflow:hidden;margin:0 0 4px 0">${img(ph.src, ph.alt, 200)}</div>${credit(ph.credit)}<div style="height:12px;line-height:12px;font-size:1px">&nbsp;</div>` : "";
    return `<tr><td style="padding:8px 0 26px 0">${sectionHead(s.title)}${banner}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${s.items.map((p) => placeRow(p, s.key)).join("")}</table></td></tr>`;
  };
  // A string of lights: plain text dots in the theme's colors, so it shows in
  // every mail app with images off and needs no picture of its own.
  const lights = th.lights.length ? `<div style="font-size:13px;line-height:1;letter-spacing:7px;text-align:center;padding:12px 0 0 0" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<span style="color:${th.lights[i % th.lights.length]}">&#9679;</span>`).join("")}</div>` : "";
  const firstHref = evs.length ? moreHref : homeHref;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(subject)}</title></head>
<body bgcolor="${th.page}" style="margin:0;padding:0;background:${th.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${th.title}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${th.page}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${th.page}" style="background:${th.page}"><tr><td align="center" style="padding:0 0 36px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${th.bar}" style="background:${th.bar}"><tr><td align="center" style="padding:0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${W}px"><tr><td style="padding:18px 0 ${th.lights.length ? 4 : 16}px 0"><a href="${esc(homeHref)}"><img src="${esc(base)}${NEWSLETTER_LOGO.path}" width="${NEWSLETTER_LOGO.width}" height="${NEWSLETTER_LOGO.height}" alt="Wayfind" style="display:block;border:0;width:${NEWSLETTER_LOGO.width}px;height:auto;margin:0 0 0 -10px"></a>${lights}</td></tr></table>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${W + 32}px"><tr><td style="padding:0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${hero ? `<tr><td style="padding:22px 0 0 0"><a href="${esc(firstHref)}" style="display:block;border-radius:16px;overflow:hidden">${img(hero.src, hero.alt, 320)}</a>${credit(hero.credit)}</td></tr>` : ""}
<tr><td style="padding:24px 0 8px 0">
${th.kicker ? `<span style="display:inline-block;background:${th.tagBg};color:${th.tagText};font-size:13px;font-weight:800;letter-spacing:.4px;padding:7px 12px;border-radius:4px">${esc(th.kicker)}</span>` : ""}
<div style="font-size:14px;font-weight:700;color:${th.muted};margin:14px 0 0 0">${esc(range)}</div>
<h1 style="font-size:32px;line-height:1.15;font-weight:800;letter-spacing:-.4px;margin:6px 0 12px;color:${th.title}">${esc(th.headline(region.name))}</h1>
<p style="font-size:17px;line-height:1.55;color:${th.body};margin:0">${esc(th.intro(region.cities))}</p>
${btn(firstHref, evs.length ? "See this weekend's picks" : "See what's good near you", true, true)}
</td></tr>
<tr><td style="height:26px;line-height:26px;font-size:1px">&nbsp;</td></tr>
${evs.length ? `<tr><td style="padding:0 0 4px 0">${sectionHead(th.eventsHead)}</td></tr>
${evs.map(eventCard).join("\n")}
<tr><td style="padding:0 0 28px 0"><a href="${esc(moreHref)}" style="font-size:15px;font-weight:800;color:${th.link};text-decoration:none">See everything on this weekend &rsaquo;</a></td></tr>` : ""}
${sections.map(sectionBlock).join("\n")}
<tr><td align="center" style="padding:4px 0 30px 0">${btn(homeHref, "See what's good near you", true, true)}</td></tr>
<tr><td style="border-top:1px solid ${th.line};padding:18px 0 0 0;font-size:12px;line-height:1.6;color:${th.fine}">
You're getting this because you signed up for Wayfind's weekly email for ${esc(region.name)} on gowayfind.com.<br>
<a href="${esc(unsubscribeUrl)}" style="color:${th.fine}">Unsubscribe</a>${webUrl ? ` · <a href="${esc(webUrl)}" style="color:${th.fine}">View in your browser</a>` : ""}<br>
Some links are affiliate links. We may earn a commission if you book. It never changes our picks.<br>
${esc(NEWSLETTER_POSTAL)}
</td></tr>
</table></td></tr></table>
</td></tr></table></body></html>`;

  return { subject: noDashes(subject), preheader, html, text };
}
