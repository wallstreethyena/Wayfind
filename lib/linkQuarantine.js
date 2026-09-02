// lib/linkQuarantine.js — the outbound-link TRUST gate and the page-content
// classifier behind it.
//
// WHY THIS EXISTS (2026-09-02 hijacked-domain incident). The Fruitville Grove
// Pumpkin Festival card's "Event details ↗" opened fruitvillegrove.com — a
// domain the grove had dropped, since re-registered by an Indonesian togel /
// slot operator ("Togel Singapore, Data Pengeluaran SGP…", DAFTAR / LOGIN
// buttons). The URL came from a third-party festival calendar (tier-3 source)
// and nothing ever FETCHED it: every link check this repo had asked "does the
// destination answer 200?" — and a hijacked domain answers 200 all day. The
// same audit found O'Leary's Tiki Bar's real site with online-casino copy
// injected mid-page (a compromised install, not a dropped domain). Both are
// invisible to a status-code probe. CLAUDE.md already says it: "a 200 is not
// evidence a page exists." This module is the content-aware answer.
//
// Two layers, both here so they cannot drift apart:
//
//   1. QUARANTINE (synchronous, runs everywhere — client bundle included).
//      A short list of hosts we have SEEN serving hijacked / injected content.
//      lib/links.safeUrl() refuses them, so every href / window.open in the app
//      dies at the chokepoint. The list is small on purpose: it is the
//      incident ledger, not a blocklist of the internet. Entries carry the
//      date and what was seen; they are removed only after the owner re-verifies
//      the destination by content.
//
//   2. CLASSIFY (server-side, fed by a real fetch). classifyOutboundPage()
//      turns a fetched page into one verdict a serving path can act on —
//      "alive" | "hijacked" | "parked" | "dead" | "soft404" | "offsite". The
//      events-link-health cron and /api/outbound/verdict call it and persist
//      the verdict (wf_events.link_ok, wf_link_verdicts). Pure function: the
//      guard suite red-proves it on fixtures shaped like the two real
//      incidents.
//
// No fetching happens in this file. It never imports anything that does.

// ── 1. Quarantine ledger ───────────────────────────────────────────────────
// host (no www.) -> { since, why }. Suffix-matched: a quarantined apex also
// quarantines its subdomains.
export const QUARANTINED_HOSTS = Object.freeze({
  "fruitvillegrove.com": {
    since: "2026-09-02",
    why: "dropped domain re-registered by an Indonesian togel/slot operator; the grove's real site is fruitvillegrovefarm.com",
  },
  "olearystikibar.com": {
    since: "2026-09-02",
    why: "live venue site with online-casino copy (Fair Go / Desert Nights) injected mid-page — compromised install",
  },
});

export function hostOfUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  return u.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

/** The ledger entry for a host (or one of its parents), else null. */
export function quarantineEntry(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!h) return null;
  for (const key of Object.keys(QUARANTINED_HOSTS)) {
    if (h === key || h.endsWith("." + key)) return { host: key, ...QUARANTINED_HOSTS[key] };
  }
  return null;
}

export function isQuarantinedHost(host) { return quarantineEntry(host) != null; }
export function isQuarantinedUrl(url) { return quarantineEntry(hostOfUrl(url)) != null; }

// ── 2. Content classifier ──────────────────────────────────────────────────
// Lexicons are deliberately narrow: each term is one that has no business on
// a Florida venue's page. Scoring, not a single hit, decides — one stray
// "casino" in a Hard Rock Tampa listing must not quarantine Hard Rock.
const GAMBLING_STRONG = [
  "togel", "gacor", "judi", "pengeluaran sgp", "keluaran hk", "data sgp", "data hk",
  "slot online", "situs slot", "slot gacor", "bandar", "sbobet", "agen judi",
  "pokies", "online casino", "casino online", "fair go casino", "desert nights casino",
  "bonus code", "no deposit bonus", "free spins", "deposit pulsa", "rtp slot",
];
const GAMBLING_WEAK = ["slot", "casino", "daftar", "login", "poker", "betting", "jackpot", "lottery"];

const PARKED = [
  "this domain is for sale", "domain is for sale", "buy this domain", "domain for sale",
  "hugedomains", "afternic", "sedo.com", "dan.com", "godaddy.com/domainsearch", "parkingcrew",
  "this domain has expired", "domain expired", "renew this domain", "account suspended",
  "website expired", "this site can't be reached", "related searches", "sponsored listings",
  "is parked free", "parked domain", "coming soon", "under construction", "site not published",
  "this store is unavailable", "site is currently unavailable",
];

const SOFT404 = [
  "page not found", "404 not found", "404 error", "no such page", "this page doesn't exist",
  "this page does not exist", "nothing here", "page you requested could not be found",
  "page you are looking for cannot be found", "page you're looking for doesn't exist",
  "we couldn't find that page", "could not find the page", "something went wrong!",
];

// Languages with no plausible reason to host a Florida venue's official page.
// (Spanish / Portuguese / French / Haitian Creole are all plausible here; they
// are NOT in this list.)
const FOREIGN_LANG = /^(id|in|ms|vi|th|tr|ru|uk|zh|ja|ko|ar|fa|hi|bn|ur)\b/i;

const KNOWN_TICKETING = [
  "eventbrite.com", "tixr.com", "etix.com", "showclix.com", "feverup.com", "ticketmaster.com",
  "axs.com", "seetickets.us", "universe.com", "simpletix.com", "brownpapertickets.com",
  "prekindle.com", "tickettailor.com", "hometownticketing.com", "gofan.co", "ticketleap.com",
  "square.site", "squareup.com", "shopify.com", "linktr.ee", "facebook.com", "instagram.com",
];

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function titleOf(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ""));
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function langOf(html) {
  const m = /<html[^>]*\blang\s*=\s*["']?([a-zA-Z-]{2,10})/i.exec(String(html || ""));
  return m ? m[1].toLowerCase() : "";
}

function count(text, needle) {
  if (!needle) return 0;
  let n = 0, i = 0;
  while ((i = text.indexOf(needle, i)) !== -1) { n++; i += needle.length; if (n > 50) break; }
  return n;
}

/** Tokens of an expected name worth matching (>=4 chars, not stop-words). */
function nameTokens(names) {
  const STOP = new Set(["the", "and", "with", "from", "park", "beach", "bar", "grill", "restaurant", "festival", "fest", "annual", "2026", "2025", "florida", "sarasota", "tampa", "orlando", "miami"]);
  const out = new Set();
  for (const n of Array.isArray(names) ? names : [names]) {
    for (const t of String(n || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/)) {
      const tok = t.replace(/'s$/, "");
      if (tok.length >= 4 && !STOP.has(tok)) out.add(tok);
    }
  }
  return [...out];
}

function sameOrg(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const strip = (h) => h.split(".").filter((p) => !/^(www|m|shop|store|tickets|events|corporate|app|go|book|order)$/.test(p));
  const A = strip(a), B = strip(b);
  const apexA = A.slice(-2).join("."), apexB = B.slice(-2).join(".");
  return apexA === apexB;
}

/**
 * Classify one fetched page.
 * @param {object} p
 * @param {string}  p.requestedUrl  the URL we asked for
 * @param {number}  p.status        HTTP status (0 = network/DNS failure)
 * @param {string}  [p.finalUrl]    URL after redirects, if known
 * @param {string}  [p.html]        response body (first ~200KB is plenty)
 * @param {string[]|string} [p.expectedNames]  the venue/event names this link was published for
 * @returns {{verdict:string, reason:string, title:string, lang:string, finalHost:string|null, nameMatch:boolean|null, score:number}}
 */
export function classifyOutboundPage({ requestedUrl, status, finalUrl, html, expectedNames } = {}) {
  const reqHost = hostOfUrl(requestedUrl);
  const finalHost = hostOfUrl(finalUrl || requestedUrl);
  const title = titleOf(html);
  const lang = langOf(html);
  const text = stripTags(html);
  const head = (title + " " + text.slice(0, 4000)).toLowerCase();
  const base = { title: title.slice(0, 160), lang, finalHost, nameMatch: null, score: 0 };

  // Hard failures first. DNS/connection (status 0) and 404/410 are "dead".
  if (!status || status === 404 || status === 410) return { ...base, verdict: "dead", reason: `http-${status || "network"}` };
  // 5xx / 429 / 403 are OUR problem or a bot wall — never the venue's. Unknown.
  if (status >= 500 || status === 429 || status === 403 || status === 401) return { ...base, verdict: "unknown", reason: `http-${status}` };

  // Gambling / injected-spam scoring over title + body.
  let score = 0;
  for (const t of GAMBLING_STRONG) { const c = count(text, t); if (c) score += 3 * Math.min(c, 4); if (count(head, t)) score += 4; }
  for (const t of GAMBLING_WEAK) { const c = count(text, t); if (c >= 2) score += Math.min(c, 6); }
  const foreign = FOREIGN_LANG.test(lang) || /\b(pengeluaran|keluaran|hari ini|terbaru|terpercaya|resmi)\b/.test(head);
  if (foreign) score += 4;
  base.score = score;

  const tokens = nameTokens(expectedNames);
  // Whole-word match: "island" must not be found inside "innsontheisland.com"
  // on a parking page, or the parked verdict is rescued by the domain name.
  const hay = title.toLowerCase() + " " + text;
  const nameMatch = tokens.length ? tokens.some((t) => new RegExp("(^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(hay)) : null;
  base.nameMatch = nameMatch;

  // Injected spam on a legitimate page (O'Leary's) still names the venue, so
  // nameMatch does NOT rescue a strong gambling score. A weak score with a
  // name match is the Hard-Rock-mentions-its-casino case: alive.
  if (score >= 8) return { ...base, verdict: "hijacked", reason: `gambling-score-${score}${foreign ? "-foreign" : ""}` };
  if (score >= 5 && nameMatch === false) return { ...base, verdict: "hijacked", reason: `gambling-score-${score}-no-name` };

  if (PARKED.some((t) => head.includes(t)) && nameMatch !== true) return { ...base, verdict: "parked", reason: "parked-marker" };
  if (text.length < 40 && !title) return { ...base, verdict: "soft404", reason: "empty-body" };
  if (SOFT404.some((t) => head.includes(t)) && nameMatch !== true) return { ...base, verdict: "soft404", reason: "not-found-marker" };

  if (reqHost && finalHost && !sameOrg(reqHost, finalHost)) {
    const vendor = KNOWN_TICKETING.some((k) => finalHost === k || finalHost.endsWith("." + k));
    if (!vendor && nameMatch !== true) return { ...base, verdict: "offsite", reason: `redirect-${finalHost}` };
  }

  if (foreign && nameMatch === false) return { ...base, verdict: "hijacked", reason: "foreign-lang-no-name" };

  return { ...base, verdict: "alive", reason: nameMatch === true ? "name-match" : "no-markers" };
}

/** Verdicts that must remove the link from every surface. */
export const BAD_VERDICTS = Object.freeze(["hijacked", "parked", "dead", "soft404", "offsite"]);
export function isBadVerdict(v) { return BAD_VERDICTS.includes(v); }
