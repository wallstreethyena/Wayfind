#!/usr/bin/env node
// scripts/ci-monitor.mjs — COMPETITOR WATCH. What our Florida competitors put out
// that Wayfind does not have yet: new seasonal guides, ticket discounts of 10% or
// more, affiliate offer shifts, calendar changes, and events listed by two or more
// competitors that Wayfind has zero of (a "gap").
//
// Zero dependencies: built-in fetch, node:crypto, node:zlib. Sources live in
// lib/competitorSources.js. Tests: scripts/test-ci-monitor.mjs (fixtures only, no
// network). Schedule: .github/workflows/ci-monitor.yml.
//
// THE RULES (each one is locked by a test):
//   - robots.txt is fetched for every host FIRST. A path disallowed for WayfindBot
//     OR for * is skipped. A robots.txt that answers 401/403/429 marks the host
//     blocked; one that cannot be read (5xx, timeout) means fetch nothing there.
//   - User-Agent is exactly `WayfindBot/1.0 (https://gowayfind.com)`. No personal
//     email, ever.
//   - At most one request per host per 3 seconds, a 10 second timeout per request,
//     and at most MAX_PAGES_PER_SOURCE content pages per source.
//   - Never a login: login, account, cart and checkout paths are never fetched, and
//     a redirect to one (or to another site) is not followed.
//   - Never past a wall: 401, 403, 429 or a bot check / CAPTCHA page is recorded as
//     `blocked` and the source is dropped for this run. Nothing tries to get past it.
//   - Never a page body in storage: only sha256 hashes of URLs and promo blocks,
//     short titles (<= 160 chars) and a short structured summary (<= 400 chars).
//   - Never an invented number: a discount is stored only when the page states it
//     ("25% off", "save 30%", "save $X off $Y", "was $Y now $X", a "-20%" badge).
//
// MODES
//   node scripts/ci-monitor.mjs                       live fetch, upserts to Supabase
//   node scripts/ci-monitor.mjs --dry-run             live fetch, no writes
//   node scripts/ci-monitor.mjs --dry-run --fixtures <dir> [--today YYYY-MM-DD]
//                                                    saved files only, no network
// Any mode that is not --fixtures reads Wayfind's wf_events and needs
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; missing values stop the run loudly
// (AGENTS.md section 5). Every mode writes ci-monitor-brief.md and
// ci-monitor-brief.json to the working directory.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { enabledSources, disabledSources, METRO_WORDS, COUNTY_METRO } from "../lib/competitorSources.js";

export const USER_AGENT = "WayfindBot/1.0 (https://gowayfind.com)";
export const ROBOTS_AGENT = "wayfindbot";
export const MIN_HOST_INTERVAL_MS = 3000;
export const REQUEST_TIMEOUT_MS = 10000;
export const MAX_PAGES_PER_SOURCE = 6;
export const MAX_SITEMAP_CHILDREN = 2;
export const MAX_ITEMS_PER_DOCUMENT = 400;
export const MAX_BODY_BYTES = 3 * 1024 * 1024;
export const DISCOUNT_THRESHOLD_PCT = 10;
export const MATCH_THRESHOLD = 0.6;
export const GAP_MIN_COMPETITORS = 2;
export const GUIDE_MAX_AGE_DAYS = 45;
export const SIGNAL_TYPES = Object.freeze(["new_guide", "new_event", "sale_banner", "discount", "affiliate_shift", "calendar_change"]);

export const sha256Hex = (s) => createHash("sha256").update(String(s)).digest("hex");
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (day, n) => { const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ── text helpers ─────────────────────────────────────────────────────────────
export function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { const n = parseInt(h, 16); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; })
    .replace(/&#(\d+);/g, (_, d) => { const n = Number(d); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; })
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Visible text of an HTML page as one short line per block (scripts, styles dropped). */
export function htmlToBlocks(html) {
  const cleaned = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|aside|header|footer|h[1-6]|tr|td|th|dd|dt|figcaption|button|option|blockquote|ul|ol|table|form|nav|main)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(cleaned).split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// ── robots.txt ───────────────────────────────────────────────────────────────
export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!cur) continue;
      cur.rules.push({ allow: key === "allow", path: val });
    } else if (key === "sitemap") {
      if (/^https?:\/\//i.test(val)) sitemaps.push(val);
    } else {
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps };
}

function ruleMatches(pattern, target) {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp("^" + body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(target);
}

function groupVerdict(group, target) {
  let best = null;
  for (const r of group.rules) {
    if (!ruleMatches(r.path, target)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

/**
 * True only when robots.txt allows `urlOrPath` for WayfindBot AND for *. Stricter
 * than the standard on purpose: a site that tells every crawler to stay out of a
 * path is not overridden by naming us. Longest match wins inside a group; a tie
 * goes to Allow; an empty Disallow allows everything.
 */
export function robotsAllows(robots, urlOrPath, agent = ROBOTS_AGENT) {
  if (!robots) return false;
  let target = String(urlOrPath || "/");
  if (/^https?:\/\//i.test(target)) { const u = new URL(target); target = u.pathname + u.search; }
  if (!target.startsWith("/")) target = "/" + target;
  try { target = decodeURI(target); } catch (e) { /* keep the raw path */ }
  const pick = (name) => robots.groups.filter((g) => g.agents.includes(name));
  for (const name of [agent, "*"]) {
    const gs = pick(name);
    if (!gs.length) continue;
    if (!groupVerdict({ rules: gs.flatMap((g) => g.rules) }, target)) return false;
  }
  return true;
}

// ── feeds and sitemaps ───────────────────────────────────────────────────────
const tag = (xml, name) => { const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(xml); return m ? decodeEntities(m[1]).trim() : ""; };

export function parseFeed(xml) {
  const out = [];
  const src = String(xml || "");
  for (const m of src.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const url = tag(it, "link") || tag(it, "guid");
    if (/^https?:\/\//i.test(url)) out.push({ url, title: clip(tag(it, "title"), 160), published: tag(it, "pubDate") || tag(it, "dc:date") || null });
  }
  for (const m of src.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const it = m[0];
    const links = [...it.matchAll(/<link\b([^>]*)\/?>/gi)].map((l) => ({ href: (/href\s*=\s*"([^"]+)"/i.exec(l[1]) || [])[1], rel: (/rel\s*=\s*"([^"]+)"/i.exec(l[1]) || [])[1] || "alternate" }));
    const link = (links.find((l) => l.rel === "alternate" && l.href) || links.find((l) => l.href) || {}).href;
    const url = decodeEntities(link || "");
    if (/^https?:\/\//i.test(url)) out.push({ url, title: clip(tag(it, "title"), 160), published: tag(it, "updated") || tag(it, "published") || null });
  }
  return out.slice(0, MAX_ITEMS_PER_DOCUMENT);
}

export function parseSitemap(xml) {
  const src = String(xml || "");
  if (/<sitemapindex\b/i.test(src)) {
    const entries = [...src.matchAll(/<sitemap\b[\s\S]*?<\/sitemap>/gi)].map((m) => ({ loc: tag(m[0], "loc"), lastmod: tag(m[0], "lastmod") || null })).filter((e) => /^https?:\/\//i.test(e.loc));
    return { type: "index", entries };
  }
  const entries = [...src.matchAll(/<url\b[\s\S]*?<\/url>/gi)].map((m) => ({
    loc: tag(m[0], "loc"),
    lastmod: tag(m[0], "lastmod") || null,
    title: clip(tag(m[0], "news:title"), 160) || null,
  })).filter((e) => /^https?:\/\//i.test(e.loc));
  // Most recent first when lastmod is present; the cap keeps a 50k-URL sitemap small.
  entries.sort((a, b) => String(b.lastmod || "").localeCompare(String(a.lastmod || "")));
  return { type: "urlset", entries: entries.slice(0, MAX_ITEMS_PER_DOCUMENT) };
}

/** Child sitemaps worth reading: recent first, post/event/guide style names preferred. */
export function pickSitemapChildren(entries, max = MAX_SITEMAP_CHILDREN) {
  const score = (e) => (/(event|post|news|article|guide|blog|things-to-do)/i.test(e.loc) ? 1 : 0);
  return [...entries].sort((a, b) => score(b) - score(a) || String(b.lastmod || "").localeCompare(String(a.lastmod || "")) || b.loc.localeCompare(a.loc)).slice(0, max);
}

/** A short readable title from a URL path, for sitemaps that carry no title. */
export function titleFromUrl(url) {
  let segs;
  try { segs = new URL(url).pathname.split("/").filter(Boolean); } catch (e) { return ""; }
  let seg = segs.pop() || "";
  while (seg && /^\d+$/.test(seg) && segs.length) seg = segs.pop();
  try { seg = decodeURIComponent(seg); } catch (e) { /* keep raw */ }
  seg = seg.replace(/\.(html?|php|aspx?)$/i, "").replace(/[-_]\d{5,}$/, "").replace(/[-_]+/g, " ");
  return clip(seg, 160);
}

// ── classification ───────────────────────────────────────────────────────────
const GUIDE_RE = /\b(holiday|holidays|christmas|xmas|lights?|new[\s-]+years?|nye|guide|guides)\b/i;
export function isSeasonalGuide(title, url) {
  let p = "";
  try { p = new URL(url).pathname.replace(/[-_/]+/g, " "); } catch (e) { /* no path */ }
  return GUIDE_RE.test(String(title || "")) || GUIDE_RE.test(p);
}

export function isEventUrl(url) {
  try { return /\/(events?|e)\/[^/?#]+/i.test(new URL(url).pathname); } catch (e) { return false; }
}

const LOGIN_RE = /\/(log[-_]?in|sign[-_]?in|sign[-_]?up|register|account|my-account|auth|oauth|sso|session|cart|checkout|basket|wp-admin|wp-login\.php)(\/|$|\?|\.)/i;
export function isLoginUrl(url) {
  try { const u = new URL(url); return LOGIN_RE.test(u.pathname + (u.pathname.endsWith("/") ? "" : "/")) || /[?&](returnurl|redirect_to|next)=/i.test(u.search); } catch (e) { return true; }
}

/** Chain venues and MLM style "opportunity" listings are never a Wayfind gap. */
export const CHAIN_MLM_PATTERNS = Object.freeze([
  /\bm\.?l\.?m\b/i,
  /\bmulti[\s-]?level[\s-]?marketing\b/i,
  /\bnetwork[\s-]marketing\b/i,
  /\bbusiness[\s-]opportunit(y|ies)\b/i,
  /\bbe your own boss\b/i,
  /\bfinancial freedom\b/i,
  /\bpassive income\b/i,
  /\bmake money (online|from home)\b/i,
  /\bwork from home (opportunity|income)\b/i,
  /\b(forex|crypto(currency)?)\s+(trading|summit|seminar|masterclass|workshop)\b/i,
  /\bwealth[\s-](building\s+)?(seminar|workshop|summit|masterclass)\b/i,
  /\breal estate investing (seminar|workshop|masterclass|bootcamp)\b/i,
  /\bget rich\b/i,
  /\bside hustle\b/i,
  /\b(applebee'?s|chuck e\.? cheese'?s?|dave (&|and) buster'?s|olive garden|red lobster|starbucks|walmart|costco|mcdonald'?s|ihop|denny'?s|cheesecake factory|topgolf|main event|round ?1 bowling)\b/i,
]);
export function isChainOrMlm(title) {
  const t = String(title || "");
  return CHAIN_MLM_PATTERNS.some((re) => re.test(t));
}

const CLOSED_RE = /\b(cancell?ed|postponed|permanently closed|closed permanently|eventcancell?ed|eventpostponed)\b/i;
export function isClearlyClosed(ev, today) {
  if (!ev) return true;
  if (CLOSED_RE.test(String(ev.status || "")) || CLOSED_RE.test(String(ev.title || ""))) return true;
  const end = String(ev.endDate || ev.startDate || "").slice(0, 10);
  return Boolean(today && ISO_DAY.test(end) && end < today);
}

/** The Wayfind metro a title or path names, or null. Longest city word wins. */
export function metroFromText(text) {
  const t = " " + String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  let best = null;
  for (const [metro, words] of Object.entries(METRO_WORDS)) {
    for (const w of words) {
      const k = " " + w.replace(/[^a-z0-9]+/g, " ") + " ";
      if (t.includes(k) && (!best || k.length > best.len)) best = { metro, len: k.length };
    }
  }
  return best ? best.metro : null;
}

export function metrosCompatible(a, b) {
  return a === b || a === "florida" || b === "florida";
}

// ── discounts ────────────────────────────────────────────────────────────────
const NUM = "(\\d[\\d,]*(?:\\.\\d{1,2})?)";
const money = (s) => Number(String(s).replace(/,/g, ""));
const pct2 = (n) => Math.round(n * 100) / 100;

/**
 * The discount a line of listing text STATES, or null. Never a guessed number:
 * "$20 off" with no base price gives null, "100% fun" gives null.
 * Returns { pct, price, basis }.
 */
export function extractDiscount(text) {
  const t = String(text || "");
  let m;
  if ((m = new RegExp(`\\bsave\\s+\\$\\s?${NUM}\\s+(?:off|on)\\s+(?:an?\\s+|the\\s+|your\\s+)?\\$\\s?${NUM}`, "i").exec(t))) {
    const off = money(m[1]), base = money(m[2]);
    if (base > 0 && off > 0 && off < base) return { pct: pct2((off / base) * 100), price: null, basis: "save-amount-off-base" };
  }
  if ((m = new RegExp(`\\bwas\\s+\\$\\s?${NUM}\\s*[,;]?\\s*(?:now|only)\\s+\\$\\s?${NUM}`, "i").exec(t))) {
    const was = money(m[1]), now = money(m[2]);
    if (was > 0 && now >= 0 && now < was) return { pct: pct2(((was - now) / was) * 100), price: now, basis: "was-now" };
  }
  if ((m = /(\d{1,3}(?:\.\d{1,2})?)\s?%\s*off\b/i.exec(t))) {
    const p = Number(m[1]);
    if (p > 0 && p <= 100) return { pct: pct2(p), price: null, basis: "percent-off" };
  }
  if ((m = /\bsave\s+(up\s+to\s+)?(\d{1,3}(?:\.\d{1,2})?)\s?%/i.exec(t))) {
    const p = Number(m[2]);
    if (p > 0 && p <= 100) return { pct: pct2(p), price: null, basis: m[1] ? "save-up-to-percent" : "save-percent" };
  }
  if ((m = /(?:^|\s)-(\d{1,2})%(?=$|[\s),.!])/.exec(t))) {
    const p = Number(m[1]);
    if (p > 0) return { pct: p, price: null, basis: "badge" };
  }
  return null;
}

export function qualifiesAsPromo(discount) {
  return Boolean(discount && Number.isFinite(discount.pct) && discount.pct >= DISCOUNT_THRESHOLD_PCT && discount.pct <= 100);
}

const PROMO_WORD_RE = /(\bwas\s+\$\s?\d[\d,]*(?:\.\d{1,2})?\s*[,;]?\s*(?:now|only)\s+\$|%\s*off|\bsave\b|\bsale\b|\bdeal(s)?\b|\bdiscount|\bpromo(\s+code)?\b|\bcoupon\b|\bblack friday\b|\bcyber monday\b|(?:^|\s)-\d{1,2}%)/i;
const BANNER_RE = /\b(sale|promo code|black friday|cyber monday|flash sale|holiday sale)\b/i;
const AFFILIATE_PARAM_RE = /^(aff|affid|affiliate|aff_id|ref|refid|partner|partnerid|pid|irclickid|clickref|subid|sub_id|utm_source|utm_campaign|cjevent|awc|ranmid|ransiteid)$/i;

/** Promo blocks on a page: { hash, line, discount, banner } (the line stays in memory only). */
export function extractPromoBlocks(html) {
  return htmlToBlocks(html).filter((l) => l.length <= 400 && PROMO_WORD_RE.test(l)).map((line) => ({
    hash: sha256Hex(line.toLowerCase()),
    line,
    discount: extractDiscount(line),
    banner: BANNER_RE.test(line),
  }));
}

/** Affiliate style links on a page, as "host?param=value" keys (no full URLs kept). */
export function extractAffiliateKeys(html, baseUrl) {
  const keys = new Set();
  for (const m of String(html || "").matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"/gi)) {
    let u;
    try { u = new URL(decodeEntities(m[1]), baseUrl); } catch (e) { continue; }
    const params = [...u.searchParams.entries()].filter(([k]) => AFFILIATE_PARAM_RE.test(k)).map(([k, v]) => `${k.toLowerCase()}=${v}`).sort();
    if (params.length) keys.add(`${u.hostname}?${params.join("&")}`);
  }
  return [...keys].sort();
}

// A small FIXED vocabulary for what a promo is on. The stored subject is built from
// the stated percentage plus one of these words, never from the competitor's sentence.
export const PROMO_CATEGORIES = Object.freeze([
  ["parking", /\bparking\b/i],
  ["hotel stays", /\b(hotel|resort|stay|stays|lodging)\b/i],
  ["dining", /\b(dinner|brunch|lunch|dining|food|drinks?)\b/i],
  ["tours", /\b(tours?|cruises?|boat|kayak|trolley)\b/i],
  ["theme park tickets", /\b(theme park|park tickets?|disney|universal|seaworld|legoland|busch gardens)\b/i],
  ["show tickets", /\b(shows?|concerts?|theater|theatre|musical|nutcracker)\b/i],
  ["holiday lights tickets", /\b(lights?|light show)\b/i],
  ["passes", /\b(pass|passes|annual|membership)\b/i],
]);
export function promoCategory(line) {
  const hit = PROMO_CATEGORIES.find(([, re]) => re.test(String(line || "")));
  return hit ? hit[0] : "tickets";
}
/** "25% off holiday lights tickets": structured fields only, no copied words. */
export function promoSubject(discount, category, banner) {
  return clip(`${discount.pct}% off ${category}${banner ? " (sale banner)" : ""}`, 160);
}
/**
 * The identity of a promo block, from structured fields only (page, stated %, basis,
 * category, banner). Reworded marketing copy for the same offer is the same row;
 * a different stated number is a new row.
 */
export function promoBlockHash(pageUrl, discount, category, banner) {
  return sha256Hex([pageUrl, discount.pct, discount.basis, discount.price == null ? "" : discount.price, category, banner ? 1 : 0].join("|"));
}

/** One hash for the watched promo state of a page: promo block hashes + affiliate keys. */
export function promoStateHash(blocks, affiliateKeys) {
  return sha256Hex([...blocks.map((b) => b.hash)].sort().join("|") + "#" + affiliateKeys.join("|"));
}

// ── JSON-LD events ───────────────────────────────────────────────────────────
export function extractJsonLdEvents(html) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const types = [].concat(node["@type"] || []).map(String);
    if (types.some((t) => /Event$/.test(t)) && typeof node.name === "string") {
      const loc = Array.isArray(node.location) ? node.location[0] : node.location;
      const addr = loc && typeof loc === "object" ? loc.address : null;
      out.push({
        title: clip(decodeEntities(node.name), 160),
        startDate: typeof node.startDate === "string" ? node.startDate : null,
        endDate: typeof node.endDate === "string" ? node.endDate : null,
        status: typeof node.eventStatus === "string" ? node.eventStatus.replace(/^https?:\/\/schema\.org\//i, "") : null,
        url: typeof node.url === "string" ? node.url : null,
        city: addr && typeof addr === "object" && typeof addr.addressLocality === "string" ? addr.addressLocality : null,
      });
    }
    for (const k of ["@graph", "itemListElement", "item", "subEvent"]) if (node[k]) visit(node[k]);
  };
  for (const m of String(html || "").matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1].trim())); } catch (e) { /* malformed JSON-LD is skipped, never repaired */ }
  }
  return out;
}

// ── title matching and gaps ──────────────────────────────────────────────────
const STOP = new Set(["the", "a", "an", "of", "at", "in", "on", "and", "or", "for", "with", "to", "by", "from", "fl", "florida", "tickets", "ticket", "presented", "presents", "featuring", "feat", "ft", "annual"]);
export function titleTokens(title) {
  const t = String(title || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ");
  return new Set(t.split(" ").filter((w) => w && !STOP.has(w) && !/^(19|20)\d{2}$/.test(w) && !/^\d{5,}$/.test(w)));
}
export const normalizeTitle = (title) => [...titleTokens(title)].join(" ");

export function jaccard(a, b) {
  const A = a instanceof Set ? a : titleTokens(a);
  const B = b instanceof Set ? b : titleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
export const titlesMatch = (a, b) => jaccard(a, b) >= MATCH_THRESHOLD;

/** Wayfind's events, shaped for matching. Metro comes from the county. */
export function shapeWayfindEvents(rows) {
  return (rows || []).map((r) => {
    const title = r.event_name || r.short_title || "";
    const county = String(r.county || "").toLowerCase().replace(/\s+county$/, "").trim();
    const metro = COUNTY_METRO[county] || metroFromText(r.city) || (county ? "other-" + county.replace(/[^a-z]+/g, "-") : "other");
    return { title, tokens: titleTokens(title), metro, ref: String(r.slug || r.event_id || "") };
  }).filter((w) => w.tokens.size);
}

export function matchWayfind(title, metro, wayfind) {
  const tokens = titleTokens(title);
  let best = null;
  for (const w of wayfind) {
    if (!metrosCompatible(w.metro, metro)) continue;
    const s = jaccard(tokens, w.tokens);
    if (s >= MATCH_THRESHOLD && (!best || s > best.score)) best = { ref: w.ref, score: s };
  }
  return best;
}

/**
 * Cluster events discovered on competitors by fuzzy title (token Jaccard >= 0.6)
 * and compatible metro. A cluster is a GAP when >= 2 distinct competitors list it
 * and Wayfind has 0 matching events. Chain/MLM listings and anything clearly
 * closed never enter a cluster.
 */
export function computeGaps(discoveries, wayfind, { today = null } = {}) {
  const usable = (discoveries || [])
    .filter((d) => d && d.title && !isChainOrMlm(d.title) && !isClearlyClosed(d, today))
    .sort((a, b) => a.competitor.localeCompare(b.competitor) || a.title.localeCompare(b.title));
  const clusters = [];
  for (const d of usable) {
    const tokens = titleTokens(d.title);
    if (!tokens.size) continue;
    let c = clusters.find((x) => metrosCompatible(x.metro, d.metro) && jaccard(x.tokens, tokens) >= MATCH_THRESHOLD);
    if (!c) { c = { title: d.title, fromSlug: Boolean(d.fromSlug), tokens, metro: d.metro, competitors: new Set(), members: [] }; clusters.push(c); }
    else if (c.fromSlug && !d.fromSlug) { c.title = d.title; c.fromSlug = false; } // show a real title over a URL slug
    if (c.metro === "florida" && d.metro !== "florida") c.metro = d.metro;
    c.competitors.add(d.competitor);
    c.members.push(d);
  }
  const out = clusters.map((c) => {
    const matches = wayfind.filter((w) => metrosCompatible(w.metro, c.metro) && jaccard(c.tokens, w.tokens) >= MATCH_THRESHOLD);
    return {
      title: c.title, metro: c.metro, competitors: [...c.competitors].sort(),
      wayfindMatches: matches.map((w) => w.ref),
      gap: c.competitors.size >= GAP_MIN_COMPETITORS && matches.length === 0,
    };
  });
  return { clusters: out, gaps: out.filter((c) => c.gap).sort((a, b) => b.competitors.length - a.competitors.length || a.title.localeCompare(b.title)) };
}

// ── polite fetching ──────────────────────────────────────────────────────────
export function createRateLimiter({ minIntervalMs = MIN_HOST_INTERVAL_MS, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const last = new Map();
  const log = [];
  return {
    log,
    async wait(host) {
      const prev = last.get(host);
      const t = now();
      const waitMs = prev == null ? 0 : Math.max(0, prev + minIntervalMs - t);
      if (waitMs > 0) await sleep(waitMs);
      const at = now();
      last.set(host, at);
      log.push({ host, at, waitMs });
    },
  };
}

/** A fake clock for fixture runs: sleeping advances time instead of waiting. */
export function virtualClock(start = 0) {
  let t = start;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

const BOT_WALL_RE = /<title>\s*(just a moment|attention required|access denied|are you a robot|pardon our interruption|security check|verify you are human)|cf-chl-|px-captcha|captcha-delivery\.com|geo\.captcha/i;
export function isBotWall(status, text) {
  if (status === 401 || status === 403 || status === 429) return true;
  if (status === 503 && /captcha|cf-chl-|just a moment/i.test(String(text || ""))) return true;
  return BOT_WALL_RE.test(String(text || "").slice(0, 200000));
}

const siteOf = (host) => String(host || "").toLowerCase().replace(/^www\./, "");
const sameSite = (a, b) => { const x = siteOf(a), y = siteOf(b); return x === y || x.endsWith("." + y) || y.endsWith("." + x); };

/**
 * get(url) -> { status: "ok"|"blocked"|"disallowed"|"skipped"|"error", ... }.
 * robots.txt first, rate limit per host, 10 s timeout, manual redirects that never
 * leave the site or enter a login, and a bot wall is "blocked", never retried.
 */
export function createFetcher({ fetchImpl = globalThis.fetch, limiter = createRateLimiter(), timeoutMs = REQUEST_TIMEOUT_MS, maxBytes = MAX_BODY_BYTES } = {}) {
  const robotsCache = new Map();
  const pageCache = new Map(); // one fetch per URL per run, even when two sources share a sitemap
  const requests = [];
  const bodyCaps = []; // URLs whose body hit maxBytes and was cut off (reported, never silent)
  const raw = async (url) => {
    const host = new URL(url).host;
    await limiter.wait(host);
    requests.push(url);
    const res = await fetchImpl(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml,text/xml;q=0.9,*/*;q=0.5" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res;
  };
  // Streams the body and CANCELS it once maxBytes is reached, so an endless or huge
  // page never sits in memory whole. A read error (timeout, abort, reset) throws to
  // the caller, which records it as that source's error and moves on.
  const readBody = async (res, url) => {
    const chunks = [];
    let total = 0;
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const room = maxBytes - total;
        if (value.length >= room) {
          chunks.push(Buffer.from(value.subarray(0, room)));
          total += room;
          bodyCaps.push(url);
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(Buffer.from(value));
        total += value.length;
      }
    }
    let body = Buffer.concat(chunks, total);
    if (/\.gz($|\?)/i.test(url) && body[0] === 0x1f && body[1] === 0x8b) {
      try { body = gunzipSync(body, { maxOutputLength: maxBytes }); } catch (e) { return ""; }
    }
    return body.toString("utf8");
  };
  async function robotsFor(host) {
    if (robotsCache.has(host)) return robotsCache.get(host);
    let entry;
    try {
      const res = await raw(`https://${host}/robots.txt`);
      if (res.status === 200) {
        const text = await readBody(res, "robots.txt");
        entry = isBotWall(200, text) ? { blocked: "robots.txt answered with a bot check" } : { robots: parseRobots(text) };
      } else if (res.status === 404 || res.status === 410) {
        entry = { robots: { groups: [], sitemaps: [] } };
      } else if (res.status === 401 || res.status === 403 || res.status === 429) {
        entry = { blocked: `robots.txt answered ${res.status}` };
      } else {
        entry = { unreachable: `robots.txt answered ${res.status}` };
      }
    } catch (e) {
      entry = { unreachable: `robots.txt fetch failed (${e.name === "TimeoutError" ? "timeout" : "network"})` };
    }
    robotsCache.set(host, entry);
    return entry;
  }
  async function get(startUrl) {
    if (pageCache.has(startUrl)) return pageCache.get(startUrl);
    const result = await getUncached(startUrl);
    pageCache.set(startUrl, result);
    return result;
  }
  async function getUncached(startUrl) {
    let url = startUrl;
    for (let hop = 0; hop < 4; hop++) {
      let u;
      try { u = new URL(url); } catch (e) { return { status: "skipped", reason: "bad url" }; }
      if (u.protocol !== "https:") return { status: "skipped", reason: "not https" };
      if (isLoginUrl(url)) return { status: "skipped", reason: "login or account path" };
      const r = await robotsFor(u.host);
      if (r.blocked) return { status: "blocked", reason: r.blocked };
      if (r.unreachable) return { status: "error", reason: r.unreachable };
      if (!robotsAllows(r.robots, u.pathname + u.search)) return { status: "disallowed", reason: "robots.txt disallows " + u.pathname };
      let res;
      try { res = await raw(url); } catch (e) { return { status: "error", reason: e.name === "TimeoutError" ? "timeout" : "network error" }; }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { status: "error", reason: `redirect ${res.status} with no location` };
        const next = new URL(loc, url).href;
        if (!sameSite(new URL(next).host, u.host)) return { status: "skipped", reason: "redirect leaves the site" };
        if (isLoginUrl(next)) return { status: "skipped", reason: "redirect to a login" };
        url = next;
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status === 429) return { status: "blocked", reason: `HTTP ${res.status}` };
      let text;
      try { text = await readBody(res, url); } catch (e) { return { status: "error", reason: e && e.name === "TimeoutError" ? "body read timeout" : "body read failed" }; }
      if (isBotWall(res.status, text)) return { status: "blocked", reason: "bot check or CAPTCHA page" };
      if (res.status !== 200) return { status: "error", reason: `HTTP ${res.status}` };
      return { status: "ok", url, text };
    }
    return { status: "error", reason: "too many redirects" };
  }
  return { get, robotsFor, requests, limiter, bodyCaps };
}

/** Fixture transport: URL -> file from <dir>/manifest.json. Unknown URLs answer 404. */
export function fixtureFetch(dir) {
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  return async (url, init = {}) => {
    const ua = init.headers && init.headers["user-agent"];
    if (ua !== USER_AGENT) throw new Error("fixture fetch: wrong User-Agent " + JSON.stringify(ua));
    const e = manifest[url];
    if (!e) return new Response("not found", { status: 404 });
    const body = e.file ? readFileSync(path.join(dir, e.file)) : null;
    return new Response(e.status >= 300 && e.status < 400 ? null : body, { status: e.status || 200, headers: e.headers || {} });
  };
}

// ── the run ──────────────────────────────────────────────────────────────────
/**
 * state: { seen: Map(competitor -> Set(urlHash)), blocks: Map(pageKey -> hash16) }.
 * A competitor with no history yet is a BASELINE run: rows are written so the
 * next run can tell new from old, but nothing is reported as "new".
 */
export async function runMonitor({ sources, fetcher, state, wayfind, today, maxPagesPerSource = MAX_PAGES_PER_SOURCE }) {
  const seenOf = (c) => state.seen.get(c) || new Set();
  const signals = [];
  const promos = [];
  const discoveries = [];
  const perSource = [];
  const blocked = [];
  const guideCutoff = addDays(today, -GUIDE_MAX_AGE_DAYS);

  for (const src of sources) {
    const stat = { id: src.id, competitor: src.competitor, metro: src.metro, pages: 0, items: 0, events: 0, promos: 0, status: "ok", notes: [] };
    perSource.push(stat);
    const queue = src.urls.map((u) => ({ ...u }));
    const seen = seenOf(src.competitor);
    const baseline = !state.seen.has(src.competitor);
    let stop = false;

    if (src.discover === "robots-sitemaps") {
      const r = await fetcher.robotsFor(src.host);
      if (r.blocked) { stat.status = "blocked"; blocked.push({ id: src.id, host: src.host, reason: r.blocked }); continue; }
      if (r.unreachable) { stat.status = "error"; stat.notes.push(r.unreachable); continue; }
      const maps = r.robots.sitemaps.filter((s) => { try { return sameSite(new URL(s).host, src.host); } catch (e) { return false; } });
      if (!maps.length) stat.notes.push("robots.txt declares no sitemap");
      for (const s of maps.slice(0, MAX_SITEMAP_CHILDREN)) queue.push({ kind: "sitemap", url: s });
    }

    const addItem = (url, title, lastmod) => {
      let host;
      try { host = new URL(url).host; } catch (e) { return; }
      if (!sameSite(host, src.host || new URL(src.urls[0]?.url || url).host)) return;
      const fromSlug = !title;
      const t = clip(title || titleFromUrl(url), 160);
      let metro = src.metro;
      if (src.metroFilter) {
        const m = metroFromText(t + " " + new URL(url).pathname.replace(/[-_/]+/g, " "));
        if (m !== src.metro) return;
        metro = m;
      }
      stat.items++;
      const urlHash = sha256Hex(url);
      const isNew = !seen.has(urlHash);
      if (isEventUrl(url)) {
        discoveries.push({ competitor: src.competitor, tier: src.tier, metro, title: t, fromSlug, url, urlHash, host, isNew, baseline });
        stat.events++;
      } else if (isSeasonalGuide(t, url)) {
        // Every seasonal guide URL gets a row, so last_seen_at stays fresh and a known
        // URL is never re-flagged; only an unseen, recently updated one is REPORTED.
        const fresh = !lastmod || String(lastmod).slice(0, 10) >= guideCutoff;
        signals.push({ type: "new_guide", competitor: src.competitor, tier: src.tier, metro, title: t, host, urlHash, baseline, report: isNew && fresh && !baseline, summary: `Seasonal guide URL on ${siteOf(host)}${lastmod ? ", updated " + String(lastmod).slice(0, 10) : ""}` });
      }
    };

    while (queue.length && !stop) {
      const job = queue.shift();
      if (stat.pages >= maxPagesPerSource) { stat.notes.push(`page cap ${maxPagesPerSource} reached`); break; }
      let res;
      try { res = await fetcher.get(job.url); } catch (e) { res = { status: "error", reason: "fetch threw (" + (e && e.name ? e.name : "error") + ")" }; }
      if (res.status === "blocked") { stat.status = "blocked"; blocked.push({ id: src.id, host: new URL(job.url).host, reason: res.reason }); stop = true; break; }
      if (res.status !== "ok") { stat.notes.push(`${res.status}: ${res.reason}`); continue; }
      stat.pages++;
      const pageUrl = res.url;
      if (job.kind === "feed") {
        for (const it of parseFeed(res.text)) addItem(it.url, it.title, it.published && !Number.isNaN(Date.parse(it.published)) ? new Date(it.published).toISOString() : null);
      } else if (job.kind === "sitemap") {
        const sm = parseSitemap(res.text);
        if (sm.type === "index") for (const c of pickSitemapChildren(sm.entries)) queue.push({ kind: "sitemap", url: c.loc });
        else for (const e of sm.entries) addItem(e.loc, e.title, e.lastmod);
      } else {
        // listing, promo, calendar: JSON-LD events, promo blocks, page state hash.
        const events = extractJsonLdEvents(res.text);
        for (const ev of events) {
          const url = ev.url && /^https?:\/\//i.test(ev.url) ? ev.url : pageUrl + "#" + sha256Hex(ev.title).slice(0, 12);
          const urlHash = sha256Hex(url);
          discoveries.push({ competitor: src.competitor, tier: src.tier, metro: src.metro, title: ev.title, url, urlHash, host: new URL(pageUrl).host, startDate: ev.startDate, endDate: ev.endDate, status: ev.status, isNew: !seen.has(urlHash), baseline });
          stat.events++;
        }
        const blocks = extractPromoBlocks(res.text);
        const pageHash = sha256Hex(pageUrl);
        for (const b of blocks) {
          if (!qualifiesAsPromo(b.discount)) continue;
          const category = promoCategory(b.line);
          const subject = promoSubject(b.discount, category, b.banner);
          const blockHash = promoBlockHash(pageUrl, b.discount, category, b.banner);
          // b.line stays in memory (Wayfind match only); it is never put in a row.
          promos.push({ competitor: src.competitor, metro: src.metro, subject, category, discount: b.discount, sourceUrl: pageUrl, sourceUrlHash: pageHash, blockHash, banner: b.banner, line: b.line });
          signals.push({ type: b.banner ? "sale_banner" : "discount", competitor: src.competitor, tier: src.tier, metro: src.metro, title: subject, host: new URL(pageUrl).host, urlHash: blockHash, baseline: false, report: true, summary: `${b.banner ? "Sale banner" : "Ticket discount"} of ${b.discount.pct}% (${b.discount.basis}) on ${category}, ${siteOf(new URL(pageUrl).host)}` });
          stat.promos++;
        }
        if (job.kind === "promo" || job.kind === "calendar") {
          const pageKey = pageHash.slice(0, 16);
          const isPromo = job.kind === "promo";
          const affiliate = isPromo ? extractAffiliateKeys(res.text, pageUrl) : [];
          const full = isPromo ? promoStateHash(blocks, affiliate) : sha256Hex(events.map((e) => normalizeTitle(e.title)).sort().join("|"));
          const h16 = full.slice(0, 16);
          const prev = state.blocks.get(pageKey) || null;
          const changed = Boolean(prev) && prev !== h16;
          const what = isPromo
            ? `Promo block set ${!prev ? "first seen" : changed ? "changed" : "unchanged"} (${blocks.length} promo blocks, ${affiliate.length} affiliate links)`
            : `Calendar event list ${!prev ? "first seen" : changed ? "changed" : "unchanged"} (${events.length} events)`;
          // Emitted every run (an unchanged state refreshes last_seen_at on its row);
          // reported only when a known state changed.
          signals.push({
            type: isPromo ? "affiliate_shift" : "calendar_change", competitor: src.competitor, tier: src.tier, metro: src.metro,
            title: clip(`${src.competitorName} ${isPromo ? "deals page" : "calendar"}`, 160), host: new URL(pageUrl).host,
            urlHash: sha256Hex(pageUrl + "|" + (isPromo ? "affiliate" : "calendar") + "|" + full),
            baseline: !prev, report: changed, pageKey, stateHash: h16,
            summary: `page=${pageKey} state=${h16} prev=${changed ? prev : !prev ? "none" : h16} | ${what}`,
          });
        }
      }
    }
  }

  // Gap engine over everything seen this run (new or not).
  const gapResult = computeGaps(discoveries, wayfind || [], { today });
  const gapKeys = new Set();
  for (const g of gapResult.gaps) gapKeys.add(g.metro + "|" + normalizeTitle(g.title));
  // Every usable event gets a row (refreshes last_seen_at); only unseen ones are REPORTED.
  for (const d of discoveries) {
    if (isChainOrMlm(d.title) || isClearlyClosed(d, today)) continue;
    const m = wayfind ? matchWayfind(d.title, d.metro, wayfind) : null;
    const cluster = gapResult.clusters.find((c) => metrosCompatible(c.metro, d.metro) && jaccard(c.title, d.title) >= MATCH_THRESHOLD);
    const n = cluster ? cluster.competitors.length : 1;
    signals.push({
      type: "new_event", competitor: d.competitor, tier: d.tier, metro: d.metro, title: d.title, host: d.host, urlHash: d.urlHash, baseline: d.baseline, report: d.isNew && !d.baseline,
      matched: Boolean(m), matchRef: m ? m.ref : null,
      summary: `Event listed on ${n} competitor${n === 1 ? "" : "s"}; ${m ? "Wayfind has it" : "Wayfind has 0 matches"}${cluster && cluster.gap ? "; GAP" : ""}`,
    });
  }
  for (const p of promos) {
    const m = wayfind ? matchWayfind(p.line, p.metro, wayfind) : null;
    p.matchRef = m ? m.ref : null;
  }
  return { perSource, signals, promos, discoveries, gaps: gapResult.gaps, clusters: gapResult.clusters, blocked };
}

// ── rows and brief ───────────────────────────────────────────────────────────
export function impactLevel(pct, matchedWayfind) {
  const base = pct >= 40 ? "high" : pct >= 20 ? "medium" : "low";
  return matchedWayfind && base === "low" ? "medium" : base;
}

/**
 * Rows for the two tables. last_seen_at is sent on every upsert so a row still on
 * the competitor's page stays fresh; detected_at is never sent, so the database
 * keeps the FIRST sighting (detected_at = first seen).
 */
export function buildRows(result, { seenAt = new Date().toISOString() } = {}) {
  const intel = new Map();
  for (const s of result.signals) {
    const row = {
      competitor: s.competitor, tier: s.tier, source_url_hash: s.urlHash, source_host: String(s.host).toLowerCase(),
      title: clip(s.title, 160), metro: s.metro, signal_type: s.type, diff_summary: clip(s.summary, 400),
      matched_wayfind: Boolean(s.matched), match_ref: s.matchRef ? clip(s.matchRef, 120) : null,
      last_seen_at: seenAt,
    };
    intel.set(`${row.competitor}|${row.source_url_hash}|${row.signal_type}`, row);
  }
  const promos = new Map();
  for (const p of result.promos) {
    const row = {
      competitor: p.competitor, metro: p.metro, subject: clip(p.subject, 160),
      observed_price: p.discount.price == null ? null : p.discount.price,
      discount_pct: p.discount.pct, impact_level: impactLevel(p.discount.pct, Boolean(p.matchRef)),
      source_url: p.sourceUrl, source_url_hash: p.sourceUrlHash, block_hash: p.blockHash,
      last_seen_at: seenAt,
    };
    promos.set(`${row.competitor}|${row.source_url_hash}|${row.block_hash}`, row);
  }
  return { intel: [...intel.values()], promos: [...promos.values()] };
}

export function buildBrief(result, { mode, today, disabled = [], wayfindCount = null, gapsTrusted = true }) {
  const byComp = {};
  for (const s of result.perSource) {
    const c = byComp[s.competitor] || (byComp[s.competitor] = { sources: 0, pages: 0, items: 0, events: 0, promos: 0, blocked: 0, newGuides: 0, newEvents: 0, baseline: false });
    c.sources++; c.pages += s.pages; c.items += s.items; c.events += s.events; c.promos += s.promos; if (s.status === "blocked") c.blocked++;
  }
  const reported = result.signals.filter((s) => s.report);
  for (const s of result.signals) {
    const c = byComp[s.competitor];
    if (!c) continue;
    if (s.baseline && (s.type === "new_guide" || s.type === "new_event")) c.baseline = true;
    if (!s.report) continue;
    if (s.type === "new_guide") c.newGuides++;
    else if (s.type === "new_event") c.newEvents++;
  }
  const json = {
    generatedFor: today, mode, wayfindEvents: wayfindCount, gapsTrusted,
    competitors: byComp,
    newGuides: reported.filter((s) => s.type === "new_guide").map((s) => ({ competitor: s.competitor, metro: s.metro, title: s.title, host: s.host })),
    promos: result.promos.map((p) => ({ competitor: p.competitor, metro: p.metro, subject: p.subject, discountPct: p.discount.pct, basis: p.discount.basis })).sort((a, b) => b.discountPct - a.discountPct),
    affiliateShifts: reported.filter((s) => s.type === "affiliate_shift").map((s) => ({ competitor: s.competitor, title: s.title, summary: s.summary })),
    calendarChanges: reported.filter((s) => s.type === "calendar_change").map((s) => ({ competitor: s.competitor, title: s.title, summary: s.summary })),
    topGaps: gapsTrusted ? result.gaps.slice(0, 15).map((g) => ({ title: g.title, metro: g.metro, competitors: g.competitors })) : [],
    blocked: result.blocked,
    disabled,
  };
  const L = [];
  L.push(`# Competitor watch, ${today}`, "", `Mode: ${mode}. Wayfind upcoming events read: ${wayfindCount == null ? "n/a" : wayfindCount}.`, "");
  L.push("## Per competitor", "", "| Competitor | Sources | Pages | Items | Events | Promos | New guides | New events | Blocked |", "|---|---|---|---|---|---|---|---|---|");
  for (const [k, c] of Object.entries(byComp).sort()) L.push(`| ${k}${c.baseline ? " (baseline)" : ""} | ${c.sources} | ${c.pages} | ${c.items} | ${c.events} | ${c.promos} | ${c.newGuides} | ${c.newEvents} | ${c.blocked} |`);
  L.push("", "## New seasonal guides", "");
  json.newGuides.length ? json.newGuides.forEach((g) => L.push(`- ${g.competitor} (${g.metro}): ${g.title}`)) : L.push("None this run.");
  L.push("", "## Promos of 10% or more", "");
  json.promos.length ? json.promos.forEach((p) => L.push(`- ${p.competitor} (${p.metro}): ${p.discountPct}% off, ${p.basis}`)) : L.push("None this run.");
  L.push("", "## Affiliate offer shifts and calendar changes", "");
  const shifts = [...json.affiliateShifts, ...json.calendarChanges];
  shifts.length ? shifts.forEach((s) => L.push(`- ${s.competitor}: ${s.title}`)) : L.push("None this run.");
  L.push("", "## Top gaps (on 2 or more competitors, 0 on Wayfind)", "");
  if (!gapsTrusted) L.push("NOT COMPUTED: Wayfind's events could not be read, so no gap is claimed.");
  else json.topGaps.length ? json.topGaps.forEach((g) => L.push(`- ${g.title} (${g.metro}): ${g.competitors.join(", ")}`)) : L.push("None this run.");
  L.push("", "## Blocked sources", "");
  json.blocked.length ? json.blocked.forEach((b) => L.push(`- ${b.id} (${b.host}): ${b.reason}`)) : L.push("None.");
  if (disabled.length) { L.push("", "## Disabled sources", ""); disabled.forEach((d) => L.push(`- ${d.id}: ${d.reason}`)); }
  return { json, md: L.join("\n") + "\n" };
}

// ── Supabase (service role, REST) ────────────────────────────────────────────
export function supabaseConfig(env) {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !String(env[k] || "").trim());
  if (missing.length) throw new Error(`ci-monitor: missing required environment variable(s): ${missing.join(", ")}. Refusing to run without them (AGENTS.md section 5).`);
  const url = String(env.SUPABASE_URL).trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(url)) throw new Error("ci-monitor: SUPABASE_URL must be an https URL");
  return { url, key: String(env.SUPABASE_SERVICE_ROLE_KEY).trim() };
}

async function sbFetch(sb, pathAndQuery, init = {}) {
  const res = await fetch(`${sb.url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: sb.key, authorization: `Bearer ${sb.key}`, "content-type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`ci-monitor: Supabase ${init.method || "GET"} ${pathAndQuery.split("?")[0]} answered ${res.status}: ${clip(await res.text(), 200)}`);
  return res;
}

export async function loadWayfindEvents(sb, today) {
  const until = addDays(today, 120);
  const rows = [];
  for (let page = 0; page < 3; page++) {
    const q = `wf_events?select=event_id,slug,event_name,short_title,city,county,start_date,end_date,event_status&state=eq.FL&event_status=in.(scheduled,sold_out)&or=(end_date.gte.${today},and(end_date.is.null,start_date.gte.${today}))&start_date=lte.${until}&order=start_date.asc,event_id.asc&limit=1000&offset=${page * 1000}`;
    const data = await (await sbFetch(sb, q)).json();
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

export const STATE_PAGE_ROWS = 1000;
export const MAX_STATE_ROWS_PER_COMPETITOR = 200000;
export const RETENTION_DAYS = 180;

/**
 * What the database already knows, per competitor, with KEYSET paging on id (no
 * date window, no offset cap), so a known URL is never re-flagged as new however
 * old or numerous. Retention (RETENTION_DAYS on last_seen_at) is what bounds the
 * table; a competitor over MAX_STATE_ROWS_PER_COMPETITOR stops the run loudly
 * rather than silently forgetting rows.
 */
export async function loadState(sb, competitors) {
  const seen = new Map();
  const blocks = new Map();
  const blockSeenAt = new Map();
  for (const competitor of [...new Set(competitors)].sort()) {
    let lastId = 0;
    let total = 0;
    for (;;) {
      const q = `wf_competitor_intel?select=id,source_url_hash,signal_type,diff_summary,last_seen_at&competitor=eq.${encodeURIComponent(competitor)}&id=gt.${lastId}&order=id.asc&limit=${STATE_PAGE_ROWS}`;
      const data = await (await sbFetch(sb, q)).json();
      if (!Array.isArray(data)) throw new Error(`ci-monitor: state read for ${competitor} did not return rows`);
      for (const r of data) {
        if (!seen.has(competitor)) seen.set(competitor, new Set()); // any row = this competitor has history
        if (r.signal_type === "new_guide" || r.signal_type === "new_event") seen.get(competitor).add(r.source_url_hash);
        else if (r.signal_type === "affiliate_shift" || r.signal_type === "calendar_change") {
          const m = /page=([a-f0-9]{16}) state=([a-f0-9]{16})/.exec(r.diff_summary || "");
          const at = String(r.last_seen_at || "");
          if (m && (!blockSeenAt.has(m[1]) || at >= blockSeenAt.get(m[1]))) { blocks.set(m[1], m[2]); blockSeenAt.set(m[1], at); }
        }
      }
      total += data.length;
      if (total > MAX_STATE_ROWS_PER_COMPETITOR) throw new Error(`ci-monitor: FAIL — ${competitor} has more than ${MAX_STATE_ROWS_PER_COMPETITOR} intel rows; refusing to run on a partial state (it would re-flag known URLs as new).`);
      if (data.length < STATE_PAGE_ROWS) break;
      lastId = data[data.length - 1].id;
    }
  }
  return { seen, blocks };
}

/** Bounded retention: rows not seen for RETENTION_DAYS are deleted (service role). */
export async function pruneOldRows(sb, now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400000).toISOString();
  for (const table of ["wf_competitor_intel", "wf_competitor_promos"]) {
    await sbFetch(sb, `${table}?last_seen_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
  }
  return cutoff;
}

export async function upsertRows(sb, table, rows, onConflict, resolution) {
  for (let i = 0; i < rows.length; i += 200) {
    await sbFetch(sb, `${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: { prefer: `resolution=${resolution},return=minimal` },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
  }
}

export function stateFromJson(obj) {
  const seen = new Map(Object.entries((obj && obj.seen) || {}).map(([k, v]) => [k, new Set(v)]));
  const blocks = new Map(Object.entries((obj && obj.blocks) || {}));
  return { seen, blocks };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const a = { dryRun: false, fixtures: null, today: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") a.dryRun = true;
    else if (argv[i] === "--fixtures") a.fixtures = argv[++i];
    else if (argv[i] === "--today") a.today = argv[++i];
    else throw new Error(`ci-monitor: unknown argument ${argv[i]}`);
  }
  if (a.fixtures && !a.dryRun) throw new Error("ci-monitor: --fixtures only runs with --dry-run (fixtures never write to the database)");
  if (a.fixtures && !existsSync(path.join(a.fixtures, "manifest.json"))) throw new Error(`ci-monitor: no manifest.json in ${a.fixtures}`);
  if (a.today && !ISO_DAY.test(a.today)) throw new Error("ci-monitor: --today must be YYYY-MM-DD");
  return a;
}

function easternToday(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export async function main(argv, env) {
  const args = parseArgs(argv);
  const today = args.today || easternToday();
  let sb = null, fetcher, state, wayfindRows;
  if (args.fixtures) {
    const clock = virtualClock();
    fetcher = createFetcher({ fetchImpl: fixtureFetch(args.fixtures), limiter: createRateLimiter({ now: clock.now, sleep: clock.sleep }) });
    const sp = path.join(args.fixtures, "state.json");
    state = stateFromJson(existsSync(sp) ? JSON.parse(readFileSync(sp, "utf8")) : {});
    const wp = path.join(args.fixtures, "wayfind-events.json");
    wayfindRows = existsSync(wp) ? JSON.parse(readFileSync(wp, "utf8")) : [];
  } else {
    sb = supabaseConfig(env);
    fetcher = createFetcher();
    wayfindRows = await loadWayfindEvents(sb, today);
  }
  const wayfind = shapeWayfindEvents(wayfindRows);
  const gapsTrusted = wayfind.length > 0;
  const fixtureSources = args.fixtures && existsSync(path.join(args.fixtures, "sources.json")) ? JSON.parse(readFileSync(path.join(args.fixtures, "sources.json"), "utf8")) : null;
  const sources = fixtureSources ? enabledSources(fixtureSources) : enabledSources();
  const disabled = fixtureSources ? disabledSources(fixtureSources) : disabledSources();
  if (!state) state = await loadState(sb, sources.map((s) => s.competitor));
  const seenAt = new Date().toISOString();
  const result = await runMonitor({ sources, fetcher, state, wayfind: gapsTrusted ? wayfind : [], today });
  if (!gapsTrusted) { result.gaps = []; }
  const rows = buildRows(result, { seenAt });
  const mode = args.fixtures ? "dry-run (fixtures)" : args.dryRun ? "dry-run (live, no writes)" : "live (writes)";
  const brief = buildBrief(result, { mode, today, disabled, wayfindCount: wayfind.length, gapsTrusted });
  brief.json.rows = { intel: rows.intel.length, promos: rows.promos.length, written: false };
  brief.json.bodyCapped = fetcher.bodyCaps.length; // pages cut off at MAX_BODY_BYTES this run
  // The brief is written BEFORE the upserts, so a failed write still leaves it for the artifact.
  const saveBrief = () => { writeFileSync("ci-monitor-brief.json", JSON.stringify(brief.json, null, 2) + "\n"); writeFileSync("ci-monitor-brief.md", brief.md); };
  saveBrief();
  if (sb && !args.dryRun) {
    await upsertRows(sb, "wf_competitor_intel", rows.intel, "competitor,source_url_hash,signal_type", "merge-duplicates");
    // merge-duplicates updates only the columns sent: last_seen_at refreshes, while
    // detected_at (first seen) and the owner's review status are never sent.
    await upsertRows(sb, "wf_competitor_promos", rows.promos, "competitor,source_url_hash,block_hash", "merge-duplicates");
    brief.json.rows.prunedBefore = await pruneOldRows(sb);
    brief.json.rows.written = true;
    saveBrief();
  }
  console.log(`ci-monitor: ${mode}; ${result.perSource.length} sources, ${result.blocked.length} blocked, ${rows.intel.length} intel rows, ${rows.promos.length} promo rows, ${result.gaps.length} gaps; requests ${fetcher.requests.length}.`);
  if (!gapsTrusted && !args.fixtures) {
    console.error("ci-monitor: FAIL — Wayfind's wf_events read returned 0 upcoming events, so no gap can be trusted. Check SUPABASE_URL and the events table.");
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2), process.env).then((code) => { process.exitCode = code; }, (e) => { console.error(e && e.message ? e.message : e); process.exitCode = 1; });
}
