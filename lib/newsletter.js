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
  // Both looks share one calm, premium frame: near black, crisp white type,
  // real photos doing the work, one accent color. Christmas adds gold and a
  // thin red and gold ribbon under the logo; nothing printed to look festive.
  if (isChristmasIssue(ymd)) {
    return {
      key: "christmas",
      page: "#0B0B0D", bar: "#000000", card: "#16161A", cardLine: "#26262C", line: "#232328",
      title: "#FFFFFF", body: "#D6D6DC", muted: "#A4A4AE", fine: "#7C7C86",
      accent: "#E9C46A", head: "#FFFFFF", link: "#E9C46A",
      btn: "#E9C46A", btnText: "#111111", ghost: "#4A4A52",
      ribbon: ["#B3121F", "#E9C46A", "#B3121F"],
      kicker: "Christmas in Florida",
      subjectPrefix: "",
      eventsHead: "Christmas this weekend",
      headline: (name) => `Your Christmas weekend in ${name}`,
      intro: (cities) => `Lights, parades and a few good plans for ${cities}. Pick what fits your weekend.`,
    };
  }
  return {
    key: "wayfind",
    page: "#0B0B0D", bar: "#000000", card: "#16161A", cardLine: "#26262C", line: "#232328",
    title: "#FFFFFF", body: "#D6D6DC", muted: "#A4A4AE", fine: "#7C7C86",
    accent: "#F97316", head: "#FFFFFF", link: "#FB923C",
    btn: "#F97316", btnText: "#FFFFFF", ghost: "#4A4A52",
    ribbon: [],
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
      if (e.cost && String(e.cost).trim().toLowerCase() !== String(e.label || "").trim().toLowerCase()) t.push(noDashes(e.cost));
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

  // ── html ── a photo led brand email: black header with the owner's white
  // logo (brand vault id wayfind-logo-white, the exact file), a full width
  // hero photo, a bold headline and one button, then photo cards. Every
  // photo is one Wayfind may send (EMAIL_PHOTOS, newsletterServer's
  // eventEmailPhoto / eventVenueEmailPhoto / placeEmailPhoto), 2x for sharp
  // phones. Nothing is shown in a card without its own photo: those picks
  // become a plain, numbered list instead.
  const th = issueTheme(window.start);
  const W = 560;
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const img = (src, alt, h, radius) => `<img src="${esc(absolute(base, src))}" width="${W}" height="${h}" alt="${esc(alt)}" style="display:block;border:0;outline:none;width:100%;max-width:${W}px;height:auto${radius ? `;border-radius:${radius}` : ""}">`;
  const credit = (txt, pad) => txt ? `<div style="font-size:11px;line-height:1.4;color:${th.fine};padding:${pad || "8px 0 0 0"}">Photo: ${esc(noDashes(txt))}</div>` : "";
  const btn = (href, label, primary, big) => `<a href="${esc(href)}" style="display:inline-block;${primary ? `background:${th.btn};color:${th.btnText};border:1px solid ${th.btn};` : `background:transparent;color:${th.title};border:1px solid ${th.ghost};`}font-family:${FONT};font-weight:700;font-size:${big ? 16 : 14}px;line-height:1;padding:${big ? "16px 26px" : "12px 18px"};border-radius:999px;text-decoration:none;margin:${big ? "22px" : "16px"} 8px 0 0">${esc(label)}</a>`;
  const label = (txt) => txt ? `<div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${th.accent}">${esc(txt)}</div>` : "";
  const sameAsLabel = (e) => String(e.cost || "").trim().toLowerCase() === String(e.label || "").trim().toLowerCase();
  const card = (photo, href, inner) => `<tr><td style="padding:0 0 22px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${th.card}" style="background:${th.card};border:1px solid ${th.cardLine};border-radius:18px">
<tr><td style="padding:0"><a href="${esc(href)}" style="display:block">${img(photo.src, photo.alt, 280, "18px 18px 0 0")}</a></td></tr>
<tr><td style="padding:20px 22px 22px 22px">${inner}${credit(photo.credit, "14px 0 0 0")}</td></tr></table></td></tr>`;
  const eventCard = (e) => {
    const meta = [e.day ? fmtShortDay(e.day) : "", noDashes(e.where || "")].filter(Boolean).join(" · ");
    const details = withUtm(absolute(base, e.detailsHref), campaign, "event");
    const ticket = ourRedirect(e.ticket) ? absolute(base, e.ticket.href) : "";
    return card(e.photo, details, `${label(e.label)}
<a href="${esc(details)}" style="display:block;font-size:22px;line-height:1.25;font-weight:800;color:${th.title};text-decoration:none;margin-top:8px">${esc(noDashes(e.name))}</a>
${meta ? `<div style="font-size:15px;line-height:1.5;color:${th.muted};margin-top:6px">${esc(meta)}</div>` : ""}
${e.cost && !sameAsLabel(e) ? `<div style="font-size:15px;line-height:1.5;color:${th.muted}">${esc(noDashes(e.cost))}</div>` : ""}
<div>${ticket ? btn(ticket, noDashes(e.ticket.label || "Get tickets"), true) : ""}${btn(details, "See details", !ticket)}</div>`);
  };
  const placeCard = (p, key) => {
    const href = withUtm(absolute(base, p.href), campaign, key);
    return card({ src: p.photo.wide || p.photo.src, alt: p.photo.alt || p.name, credit: p.photo.credit }, href, `<a href="${esc(href)}" style="display:block;font-size:20px;line-height:1.25;font-weight:800;color:${th.title};text-decoration:none">${esc(p.name)}</a>
<div style="font-size:15px;line-height:1.5;color:${th.muted};margin-top:6px">${p.where ? esc(p.where) : ""}${p.score ? `${p.where ? " · " : ""}<span style="color:${th.accent};font-weight:700">Wayfind ${esc(p.score)}</span>` : ""}</div>
<div>${btn(href, "See the place", false)}</div>`);
  };
  // A pick with no photo of its own: a clean numbered line, never a box.
  const listRow = (i, name, href, sub) => `<tr><td style="padding:14px 0;border-top:1px solid ${th.line}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="34" valign="top" style="width:34px;font-size:20px;line-height:1.2;font-weight:800;color:${th.accent}">${i}</td>
<td valign="top"><a href="${esc(href)}" style="font-size:17px;line-height:1.3;font-weight:700;color:${th.title};text-decoration:none">${esc(name)}</a>${sub ? `<div style="font-size:14px;line-height:1.5;color:${th.muted};margin-top:3px">${sub}</div>` : ""}</td>
<td width="24" align="right" valign="middle" style="width:24px;font-size:20px;color:${th.muted}"><a href="${esc(href)}" style="color:${th.muted};text-decoration:none">&rsaquo;</a></td>
</tr></table></td></tr>`;
  const sectionHead = (txt) => `<div style="font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-.2px;color:${th.head};margin:0 0 16px 0">${esc(txt)}</div>`;
  const spacer = (h) => `<tr><td style="height:${h}px;line-height:${h}px;font-size:1px">&nbsp;</td></tr>`;
  const hero = EMAIL_PHOTOS.hero[th.key] || null;
  const sectionBlock = (s) => {
    const cards = s.items.filter((p) => p.photo && (p.photo.wide || p.photo.src));
    const rest = s.items.filter((p) => !cards.includes(p));
    const ph = EMAIL_PHOTOS.sections[s.key];
    // A section with no place photos leads with its own licensed banner
    // photo, then the picks as a numbered list.
    const banner = !cards.length && ph && (!hero || ph.src !== hero.src)
      ? `<tr><td style="padding:0 0 4px 0">${img(ph.src, ph.alt, 200, "18px")}${credit(ph.credit)}</td></tr>${spacer(8)}` : "";
    const rows = rest.map((p, i) => listRow(i + 1, p.name, withUtm(absolute(base, p.href), campaign, s.key),
      `${p.where ? esc(p.where) : ""}${p.score ? `${p.where ? " · " : ""}<span style="color:${th.accent};font-weight:700">Wayfind ${esc(p.score)}</span>` : ""}`)).join("");
    return `<tr><td style="padding:0">${sectionHead(s.title)}</td></tr>
${cards.map((p) => placeCard(p, s.key)).join("\n")}
${banner}${rows ? `<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : ""}
${spacer(30)}`;
  };
  const evCards = evs.filter((e) => e.photo && e.photo.src);
  const evRest = evs.filter((e) => !evCards.includes(e));
  const evRows = evRest.map((e, i) => {
    const href = withUtm(absolute(base, e.detailsHref), campaign, "event");
    const sub = [e.day ? fmtShortDay(e.day) : "", noDashes(e.where || ""), e.cost && !sameAsLabel(e) ? noDashes(e.cost) : (e.label || "")].filter(Boolean).map(esc).join(" · ");
    const ticket = ourRedirect(e.ticket) ? absolute(base, e.ticket.href) : "";
    return listRow(i + 1, noDashes(e.name), href, sub + (ticket ? `<br><a href="${esc(ticket)}" style="color:${th.link};font-weight:700;text-decoration:none">${esc(noDashes(e.ticket.label || "Get tickets"))} &rsaquo;</a>` : ""));
  }).join("");
  const ribbon = th.ribbon.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${th.ribbon.map((c) => `<td height="3" bgcolor="${c}" style="height:3px;line-height:3px;font-size:1px;background:${c}">&nbsp;</td>`).join("")}</tr></table>` : "";
  const firstHref = evs.length ? moreHref : homeHref;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(subject)}</title>
<style>a{color:inherit}@media (max-width:480px){.wf-h1{font-size:30px!important}}</style></head>
<body bgcolor="${th.page}" style="margin:0;padding:0;background:${th.page};font-family:${FONT};color:${th.title};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${th.page}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${th.page}" style="background:${th.page}"><tr><td align="center" style="padding:0 0 40px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${th.bar}" style="background:${th.bar}"><tr><td align="center" style="padding:0 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${W}px"><tr><td align="left" style="padding:20px 0 18px 0"><a href="${esc(homeHref)}"><img src="${esc(base)}${NEWSLETTER_LOGO.path}" width="${NEWSLETTER_LOGO.width}" height="${NEWSLETTER_LOGO.height}" alt="Wayfind" style="display:block;border:0;width:${NEWSLETTER_LOGO.width}px;height:auto;margin:0 0 0 -10px"></a></td></tr></table>
</td></tr></table>
${ribbon}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${W}px"><tr><td style="padding:0">
${hero ? `<a href="${esc(firstHref)}" style="display:block">${img(hero.src, hero.alt, 320)}</a>` : ""}
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${W + 40}px"><tr><td style="padding:0 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${hero ? `<tr><td style="padding:0">${credit(hero.credit)}</td></tr>` : ""}
<tr><td style="padding:26px 0 0 0">
${th.kicker ? label(th.kicker) : ""}
<h1 class="wf-h1" style="font-family:${FONT};font-size:36px;line-height:1.12;font-weight:800;letter-spacing:-.6px;margin:10px 0 0 0;color:${th.title}">${esc(th.headline(region.name))}</h1>
<div style="font-size:15px;font-weight:600;color:${th.muted};margin:12px 0 0 0">${esc(range)}</div>
<p style="font-size:17px;line-height:1.6;color:${th.body};margin:14px 0 0 0">${esc(th.intro(region.cities))}</p>
${btn(firstHref, evs.length ? "See this weekend's picks" : "See what's good near you", true, true)}
</td></tr>
${spacer(44)}
${evs.length ? `<tr><td style="padding:0">${sectionHead(th.eventsHead)}</td></tr>
${evCards.map(eventCard).join("\n")}
${evRows ? `<tr><td style="padding:${evCards.length ? "4px" : "0"} 0 0 0">${evCards.length ? `<div style="font-size:13px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${th.muted};margin:0 0 4px 0">Also this weekend</div>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${evRows}</table></td></tr>` : ""}
<tr><td style="padding:14px 0 0 0"><a href="${esc(moreHref)}" style="font-size:16px;font-weight:700;color:${th.link};text-decoration:none">See everything on this weekend &rsaquo;</a></td></tr>
${spacer(40)}` : ""}
${sections.map(sectionBlock).join("\n")}
<tr><td align="center" style="padding:6px 0 36px 0;border-top:1px solid ${th.line}">${btn(homeHref, "See what's good near you", true, true)}</td></tr>
<tr><td style="border-top:1px solid ${th.line};padding:22px 0 0 0;font-size:12px;line-height:1.7;color:${th.fine}">
You're getting this because you signed up for Wayfind's weekly email for ${esc(region.name)} on gowayfind.com.<br>
<a href="${esc(unsubscribeUrl)}" style="color:${th.muted}">Unsubscribe</a>${webUrl ? ` · <a href="${esc(webUrl)}" style="color:${th.muted}">View in your browser</a>` : ""}<br>
Some links are affiliate links. We may earn a commission if you book. It never changes our picks.<br>
${esc(NEWSLETTER_POSTAL)}
</td></tr>
</table></td></tr></table>
</td></tr></table></body></html>`;

  return { subject: noDashes(subject), preheader, html, text };
}
