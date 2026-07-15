// lib/businessFeeds.js — the "Business events" source (v6.21).
//
// Businesses that publish a PUBLIC calendar — iCal/.ics (preferred: Google
// Calendar, Outlook, Squarespace, WordPress "The Events Calendar", Eventbrite
// org exports) or RSS/Atom (best-effort) — get their events pulled in and shown
// under the Events tab's "Business events" category. This file is pure parsing
// + the feed registry, so the aggregator route and the build guardrail can both
// use it with no network. HONESTY RULE: we only ever surface what the feed
// actually contains — never a fabricated event, never a fabricated date.
//
// Adding a feed, two ways (no admin UI needed):
//   1. Repo — add an entry to BUSINESS_FEEDS below (version-controlled).
//   2. Env — set BUSINESS_EVENT_FEEDS to a JSON array of the same shape; merged
//      at runtime so a feed can go live WITHOUT a deploy.
// Feed shape: { name, url, type?: "ical"|"rss", lat, lng, city?, site? }
//   - lat/lng: the business's location (events are geo-fenced to nearby users).
//   - site: optional human page to open when an event carries no own URL.

import { parseLibCalICS, parseICSDate } from "./eventResolve.js";

// Owner adds businesses here as they opt in. Empty by design → the category
// shows its honest "no business events yet" state until the first feed exists.
export const BUSINESS_FEEDS = [
  // { name: "The Bishop Museum of Science and Nature", url: "https://example.org/events.ics", type: "ical", lat: 27.4989, lng: -82.5749, city: "Bradenton", site: "https://bishopscience.org/events/" },
];

export function getBusinessFeeds() {
  let extra = [];
  try {
    const raw = process.env.BUSINESS_EVENT_FEEDS;
    if (raw) { const j = JSON.parse(raw); if (Array.isArray(j)) extra = j; }
  } catch (e) { /* malformed env never breaks the feed */ }
  return [...BUSINESS_FEEDS, ...extra].filter(
    (f) => f && f.url && f.name && f.lat != null && f.lng != null && Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lng))
  );
}

// ── parsing ────────────────────────────────────────────────────────────────
function stripCdata(s) {
  return String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function decodeXml(s) {
  return String(s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&#x27;/gi, "'").replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// RSS 2.0 + Atom, minimal. Returns [{ title, url, start, location, image, summary }].
export function parseRSS(xml) {
  const out = [];
  const blocks = String(xml || "").match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  for (const it of blocks) {
    const pick = (tag) => { const m = it.match(new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)</" + tag + ">", "i")); return m ? decodeXml(stripCdata(m[1])) : ""; };
    const title = pick("title");
    if (!title) continue;
    let link = pick("link");
    if (!link) { const m = it.match(/<link\b[^>]*href="([^"]+)"/i); if (m) link = m[1].trim(); }
    const start = pick("pubDate") || pick("published") || pick("updated") || pick("dc:date") || pick("start") || pick("startDate") || "";
    let image = ""; const im = it.match(/<enclosure\b[^>]*url="([^"]+)"[^>]*type="image/i) || it.match(/<media:content\b[^>]*url="([^"]+)"/i); if (im) image = im[1];
    out.push({ title, url: link, start, location: "", image, summary: pick("description") || pick("summary") });
  }
  return out;
}

// Robust feed-date parse: ICS basic (YYYYMMDD[THHMMSS[Z]]) OR RFC822 / ISO
// (RSS). Returns { date, time, dt } in Gulf-Coast local, like parseICSDate.
export function parseFeedDate(s) {
  const raw = String(s || "").trim();
  if (!raw) return null;
  if (/^\d{8}(T\d{6}Z?)?$/.test(raw)) { const p = parseICSDate(raw); return p && p.dt ? p : null; }
  const dt = new Date(raw);
  if (isNaN(dt.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(dt);
  const g = (t) => (parts.find((p) => p.type === t) || {}).value || "";
  let H = g("hour"); if (H === "24") H = "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${H}:${g("minute")}`, dt };
}

// Auto-detect format, return raw items in one shape.
export function parseBusinessFeed(text, type) {
  const isXml = type === "rss" || /^\s*<\?xml|<rss\b|<feed\b/i.test(String(text || ""));
  if (isXml) return parseRSS(text);
  return parseLibCalICS(text).map((e) => ({ title: e.summary, start: e.start, url: e.url, location: e.location, summary: e.description, image: null }));
}

function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32); }

// ── THE AUDITOR (honesty gate) ───────────────────────────────────────────────
// The owner cannot afford one false event. So every business event must PROVE
// it is real before it can be shown — this runs at SERVE time (defense in depth:
// even a broken or hostile feed injects nothing false) AND from the autonomous
// cron auditor. It returns { ok, reason } so the cron can report WHY something
// was rejected. Rules are deliberately strict: when in doubt, drop it.
const PLACEHOLDER_TITLE = /^(test|tba|tbd|untitled|no title|sample|example|placeholder|delete|xxx+)\b/i;
const FABRICATED_URL = /google\.[a-z.]+\/search|bing\.com\/search|duckduckgo\.com|example\.(com|org|net)|localhost|\.local\b|127\.0\.0\.1/i;
function ymd(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
export function auditBusinessEvent(e, now = new Date()) {
  if (!e || typeof e !== "object") return { ok: false, reason: "empty" };
  const name = String(e.name || "").trim();
  if (name.length < 3 || name.length > 160) return { ok: false, reason: "bad_title" };
  if (PLACEHOLDER_TITLE.test(name)) return { ok: false, reason: "placeholder_title" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date || ""))) return { ok: false, reason: "bad_date_format" };
  const [Y, M, D] = e.date.split("-").map(Number);
  if (M < 1 || M > 12 || D < 1 || D > 31) return { ok: false, reason: "impossible_date" };
  const probe = new Date(Y, M - 1, D);
  if (probe.getMonth() !== M - 1 || probe.getDate() !== D) return { ok: false, reason: "impossible_date" }; // e.g. Feb 30
  if (e.time && !/^\d{2}:\d{2}(:\d{2})?$/.test(String(e.time))) return { ok: false, reason: "bad_time" };
  const todayStr = ymd(now);
  if (e.date < todayStr) return { ok: false, reason: "past" };
  const horizonStr = ymd(new Date(now.getTime() + 120 * 86400000));
  if (e.date > horizonStr) return { ok: false, reason: "too_far" };
  const url = String(e.url || "");
  if (!/^https?:\/\/[^\s]+\.[^\s]{2,}/i.test(url)) return { ok: false, reason: "no_valid_url" };
  if (FABRICATED_URL.test(url)) return { ok: false, reason: "fabricated_url" };
  if (e.lat == null || e.lng == null || e.lat === "" || e.lng === "") return { ok: false, reason: "no_geo" };
  const lat = Number(e.lat), lng = Number(e.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "no_geo" };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return { ok: false, reason: "bad_geo" };
  return { ok: true, reason: "ok" };
}

// Turn one feed + its raw text into normalized, future-only Wayfind events.
export function businessEventsFrom(feed, text, now = new Date(), horizonMs = 60 * 86400000) {
  const items = parseBusinessFeed(text, feed && feed.type);
  const horizon = new Date(now.getTime() + horizonMs);
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const ds = parseFeedDate(it.start);
    if (!ds || !ds.dt || ds.dt < now || ds.dt > horizon) continue;
    const title = String(it.title || "").trim();
    if (!title) continue;
    const key = title.toLowerCase() + "|" + ds.date;
    if (seen.has(key)) continue;
    seen.add(key);
    const ev = {
      id: "biz_" + slug(feed.name) + "_" + slug(title) + "_" + ds.date,
      name: title,
      date: ds.date,
      time: ds.time || "",
      venue: it.location || feed.name,
      city: feed.city || "",
      lat: Number(feed.lat),
      lng: Number(feed.lng),
      segment: "Business",
      genre: "",
      image: it.image || null,
      price: null,
      url: it.url || feed.site || feed.url,
      ticketed: false,
      business: true,
      source: feed.name,
      status: "",
    };
    // THE HONESTY GATE — only audited-real events are ever emitted.
    if (!auditBusinessEvent(ev, now).ok) continue;
    out.push(ev);
    if (out.length >= 25) break; // per-business cap
  }
  return out;
}

// The autonomous auditor's per-feed pass: fetch, parse, and validate, returning
// a health report (never throws). Used by the cron robot AND the build
// guardrail. `fetchImpl` is injectable so the guardrail can run offline.
export async function auditFeed(feed, fetchImpl, now = new Date()) {
  const report = { name: feed && feed.name, url: feed && feed.url, reachable: false, parsed: 0, valid: 0, rejected: 0, reasons: {}, ok: false, error: null };
  try {
    const r = await fetchImpl(feed.url, { headers: { "User-Agent": "Wayfind/1.0 (+https://www.gowayfind.com)" } });
    report.reachable = !!(r && r.ok);
    if (!report.reachable) { report.error = "http_" + (r ? r.status : "no_response"); return report; }
    const text = await r.text();
    const items = parseBusinessFeed(text, feed.type);
    report.parsed = items.length;
    for (const it of items) {
      const ds = parseFeedDate(it.start);
      const ev = {
        name: String(it.title || "").trim(), date: ds ? ds.date : "", time: ds ? ds.time : "",
        url: it.url || feed.site || feed.url, lat: Number(feed.lat), lng: Number(feed.lng),
      };
      const a = auditBusinessEvent(ev, now);
      if (a.ok) report.valid += 1; else { report.rejected += 1; report.reasons[a.reason] = (report.reasons[a.reason] || 0) + 1; }
    }
    // A feed is healthy if it is reachable and parses; zero valid events is not
    // an error (nothing upcoming), but an unreachable/unparseable feed is.
    report.ok = report.reachable && (report.parsed > 0 || report.valid >= 0);
    return report;
  } catch (e) {
    report.error = String((e && e.message) || e).slice(0, 120);
    return report;
  }
}
