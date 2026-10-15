#!/usr/bin/env node
// scripts/anchor-events/watch.mjs — the daily watcher for MAJOR Florida events.
//
// WHY. A marquee event (a festival that fills a city for a weekend) can go
// wrong quietly: next year's edition never gets added, the date moves, the
// organizer cancels, or the row we do have loses its photo. Nothing breaks
// in the code; the world changes underneath it. This script reads the anchor
// list (data/florida-anchor-events.json), compares it with what wf_events
// really holds, politely looks at each organizer's own page, and writes a
// plain-language report. A person decides what to do; the script changes
// NOTHING.
//
// READ-ONLY. The only database traffic is GET via PostgREST. The only write
// anywhere is the usual wf_job_pulse heartbeat (lib/jobPulse.recordPulse),
// skipped with --dry. No Google or paid API is called.
//
// EXIT CODE IS NOT THE FINDING. Exit 0 even when findings exist; non-zero
// means the instrument could not run (bad flags, no credentials, DB read
// failed). Same contract as scripts/photo-monitor.mjs.
//
// UNKNOWN IS NOT DEAD. A 403, 429, 5xx, bot challenge, timeout or 404 on an
// organizer page says "we could not read it", never "it is gone" (the same
// rule app/api/cron/events-link-health applies). Those go in the "could not
// check" list, not in the findings.
//
// FINDING KINDS
//   missing_edition       window opens within 120 days, no live future wf_events row
//   row_health            issue = no_coordinates | no_photo | link_not_ok |
//                                 no_category | page_not_200 | page_soft_404
//   cancel_signal         organizer page says cancelled/postponed/rescheduled
//                         near the event name AND the edition year
//   date_drift            organizer page shows ONE clear date for the edition
//                         year and it disagrees with our row
//   new_announcement      an expected_undated anchor's page now shows dates
//   stale_verification    lib/curatedEvents.needsRecheck says the row is due
// NOT IMPLEMENTED: expired_live. wf_events has no pinned/featured/spotlight
// column (checked supabase/migrations), and rows past end_date are already
// hidden by curatedEvents.isEligible, so there is no reliable "still pinned"
// signal to read. The report says so on every run.
//
// Usage:
//   node scripts/anchor-events/watch.mjs [--anchors <path>] [--out report.md]
//        [--json] [--dry] [--today YYYY-MM-DD]
// --dry: no pulse, no network. DB reads and page probes are stubbed (empty
// DB, every page "unknown"), so findings in a dry run are NOT meaningful; it
// only proves the file loads and the report renders.
// --json: print the machine-readable result to stdout instead of markdown
// (--out still receives the markdown report).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (read via lib/serverCache.sbEnv).
// With GITHUB_OUTPUT set, writes findings=<n> for the workflow.

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { siteTodayStr } from "../../lib/siteTime.js";
import { needsRecheck } from "../../lib/curatedEvents.js";
import { isBadVerdict } from "../../lib/linkQuarantine.js";
import { probeAndClassify } from "../../lib/linkProbe.js";
import { isDeniedHost } from "../../lib/nightlifeRail.js";
import { sbEnv } from "../../lib/serverCache.js";
import { recordPulse } from "../../lib/jobPulse.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_ANCHORS = path.join(REPO, "data/florida-anchor-events.json");
export const UA = "WayfindAnchorWatch/1.0 (+https://gowayfind.com)";
export const SITE = "https://gowayfind.com";
const LOOKAHEAD_DAYS = 120;
const PAGE_TIMEOUT_MS = 10000;
const MAX_BODY = 600 * 1024;
// AGENTS.md section 8 (standing product constraints): "No scraping, polling,
// or automated requests against disneyworld.disney.go.com". Hosts named there
// are never fetched, nor are their subdomains. isDeniedHost (the repo's
// entity-level Disney rule) is applied on top, so any *disney* host is also
// skipped. An anchor may also opt out with `probe: false`.
export const NO_PROBE_HOSTS = Object.freeze(["disneyworld.disney.go.com"]);
export function hostOf(u) { try { return new URL(/^[a-z]+:\/\//i.test(u) ? u : "https://" + u).hostname.toLowerCase(); } catch { return ""; } }
export function isNoProbeHost(host) {
  if (!host) return false;
  return NO_PROBE_HOSTS.some((d) => host === d || host.endsWith("." + d)) || isDeniedHost(host);
}
/** Why this anchor's official page must not be fetched, or null. */
export function noProbeReason(a) {
  if (a.probe === false) return "anchor-opted-out";
  const ed = a.expected_edition || {};
  if ([a.official_domain, ed.source_url].some((x) => x && isNoProbeHost(hostOf(String(x))))) return "policy-no-probe";
  return null;
}
const LIVE_STATUS = new Set(["scheduled", "sold_out"]);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const KIND_LABEL = {
  missing_edition: "Next edition missing",
  row_health: "Event row problem",
  cancel_signal: "Possible cancellation or move",
  date_drift: "Date may have changed",
  new_announcement: "New dates announced",
  stale_verification: "Needs a fresh check",
};

/* ------------------------------------------------------------ pure helpers */

const ymdToUtc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const pad = (n) => String(n).padStart(2, "0");

/** Days from `today` (YYYY-MM-DD) until the anchor's typical window opens; 0 if
 *  the window is open right now. Handles windows that wrap a year end. */
// The anchor file (#1751) stores the series id under expected_edition; a
// top-level event_series_id is honored too.
export function anchorSeriesId(a) {
  return (a && (a.event_series_id || (a.expected_edition && a.expected_edition.event_series_id))) || null;
}

export function daysUntilWindow(today, startMonth, endMonth) {
  const t = ymdToUtc(today);
  const y0 = Number(today.slice(0, 4));
  let best = Infinity;
  for (let y = y0 - 1; y <= y0 + 1; y++) {
    const start = Date.UTC(y, startMonth - 1, 1);
    const endY = endMonth < startMonth ? y + 1 : y;
    const end = Date.UTC(endY, endMonth, 0); // last day of end month
    if (t >= start && t <= end) return 0;
    if (start > t) best = Math.min(best, Math.round((start - t) / 86400000));
  }
  return best;
}

export function stripTags(html) {
  return String(html || "")
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&(?:rsquo|lsquo|#8217|#8216|#39|apos);/gi, "'")
    .replace(/&(?:ndash|mdash|#8211|#8212);/gi, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const norm = (s) => stripTags(s).toLowerCase();

function nameVariants(name) {
  const n = norm(name);
  const out = new Set([n]);
  const noThe = n.replace(/^the\s+/, "");
  if (noThe.length >= 6) out.add(noThe);
  return [...out].filter(Boolean);
}

function nameIndexes(textLower, name) {
  const idx = [];
  for (const v of nameVariants(name)) {
    let from = 0;
    for (;;) {
      const i = textLower.indexOf(v, from);
      if (i < 0) break;
      idx.push(i);
      from = i + v.length;
    }
  }
  return idx;
}

/** Conservative cancellation detector. Needs the keyword within 120 chars of
 *  the event name AND the edition year as the nearest year (within 80 chars) to the keyword, and
 *  skips conditional wording ("if it rains the event will be rescheduled"). */
export function detectCancellation(text, name, year) {
  const t = norm(text);
  const names = nameIndexes(t, name);
  if (!names.length) return null;
  const re = /\b(cancell?ed|postponed|rescheduled)\b/g;
  let m;
  while ((m = re.exec(t))) {
    const at = m.index;
    if (!names.some((i) => Math.abs(i - at) <= 120)) continue;
    // The NEAREST year to the keyword (within 80 chars) must be the edition
    // year: "Fest 2019 was cancelled ... January 23, 2027" is the old year.
    let nearest = null;
    for (const y of t.matchAll(/\b(?:19|20)\d{2}\b/g)) {
      const dist = Math.abs(y.index - at);
      if (dist <= 80 && (!nearest || dist < nearest.dist)) nearest = { dist, year: y[0] };
    }
    if (!nearest || nearest.year !== String(year)) continue;
    const before = t.slice(Math.max(0, at - 70), at);
    if (/\b(if|in case|in the event|should|may be|might be|could be|weather|rain|storm|lightning)\b/.test(before)) continue;
    if (/\b(refunds?|refundable|policy|policies|terms)\b/.test(t.slice(Math.max(0, at - 100), at + 100))) continue; // refund/policy boilerplate
    return t.slice(Math.max(0, at - 80), at + 80).trim();
  }
  return null;
}

/** "Month D[-D], YYYY" starts for one year, found within 300 chars of the name. */
export function datesNearName(text, name, year) {
  const t = norm(text);
  const names = nameIndexes(t, name);
  if (!names.length) return [];
  const re = new RegExp(
    "\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?"
    + "(?:\\s*(?:-|to|&)\\s*(?:[a-z]+\\.?\\s+)?\\d{1,2}(?:st|nd|rd|th)?)?,?\\s+(\\d{4})\\b", "g");
  const found = new Set();
  let m;
  while ((m = re.exec(t))) {
    if (Number(m[3]) !== Number(year)) continue;
    if (!names.some((i) => Math.abs(i - m.index) <= 300)) continue;
    // "tickets on sale March 1, 2027" / "deadline", "updated" etc. are not event dates
    if (/\b(on sale|tickets?|presale|pre-sale|deadline|posted|updated)\b[^.]{0,60}$/.test(t.slice(Math.max(0, m.index - 60), m.index))) continue;
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    if (mi < 0) continue;
    found.add(`${m[3]}-${pad(mi + 1)}-${pad(Number(m[2]))}`);
  }
  return [...found].sort();
}

function looksLikeChallenge(text) {
  const t = norm(text).slice(0, 1500);
  return t.length < 1500 && /(just a moment|attention required|verify you are human|enable javascript and cookies|access denied|captcha)/.test(t);
}

const rowIsLive = (r, today) =>
  LIVE_STATUS.has(r.event_status) && String(r.end_date || r.start_date || "") >= today;

/* ------------------------------------------------------------- the engine */

/**
 * @param {object} o
 * @param {object[]} o.anchors
 * @param {string} o.today                 YYYY-MM-DD (siteTodayStr)
 * @param {function} o.fetchImpl           fetch-compatible
 * @param {{url:string,key:string}} o.sb   Supabase REST env
 * @param {number} [o.paceMs=1000]         gap between outside-world requests
 * @param {function} [o.sleep]
 * @param {function} [o.probeLink]         (url, names) => {verdict,...}
 * @param {Date} [o.now]
 */
export async function runWatch({ anchors, today, fetchImpl, sb, paceMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), probeLink, now = new Date() }) {
  const findings = [];
  const unknown = [];
  const add = (anchor, kind, detail, url, extra = {}) =>
    findings.push({ anchor_id: anchor.anchor_id, kind, detail, url: url || null, ...extra });

  // ---- outside-world pacing: one request per paceMs, ever.
  let lastAt = 0;
  const paced = async () => {
    const wait = lastAt + paceMs - Date.now();
    if (lastAt && wait > 0) await sleep(wait);
    lastAt = Date.now();
  };
  // Returns {ok:true,status,text} or {ok:false,reason}. Never throws.
  const getPage = async (url) => {
    if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "not-http-url" };
    await paced();
    try {
      const r = await fetchImpl(url, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*;q=0.5" },
        redirect: "follow",
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
      const status = r.status;
      if (status < 200 || status >= 300) return { ok: false, status, reason: `http-${status}` };
      const text = String((await r.text()) || "").slice(0, MAX_BODY);
      if (looksLikeChallenge(text)) return { ok: false, status, reason: "bot-challenge" };
      return { ok: true, status, text };
    } catch (e) {
      return { ok: false, reason: /timeout|abort/i.test(String(e && (e.name || e.message))) ? "timeout" : "network-error" };
    }
  };

  // ---- database reads (GET only)
  const dbHeaders = { apikey: sb.key, Authorization: `Bearer ${sb.key}` };
  const dbGet = async (pathAndQuery) => {
    const r = await fetchImpl(`${sb.url}/rest/v1/${pathAndQuery}`, { headers: dbHeaders, cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`database read failed: ${pathAndQuery.split("?")[0]} HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error(`database read returned a non-list: ${pathAndQuery.split("?")[0]}`);
    return j;
  };
  const q = (v) => `"${String(v).replace(/"/g, "")}"`;
  const inList = (xs) => `(${xs.map(q).join(",")})`;

  const active = anchors.filter((a) => a && a.expected_edition && a.expected_edition.state !== "cancelled" && a.expected_edition.state !== "skipped");
  const ids = new Set();
  for (const a of active) { ids.add(a.anchor_id); if (anchorSeriesId(a)) ids.add(anchorSeriesId(a)); if (a.expected_edition.event_id) ids.add(a.expected_edition.event_id); }
  const COLS = "event_id,event_series_id,event_name,year,slug,start_date,end_date,event_status,state,lat,lng,place_id,category,hero_image,link_ok,link_verdict,link_checked_at,official_event_url,event_page_url,last_verified_at";
  let rows = [];
  if (ids.size) {
    const list = inList([...ids]);
    rows = await dbGet(`wf_events?select=${COLS}&or=(event_id.in.${encodeURIComponent(list)},event_series_id.in.${encodeURIComponent(list)})&limit=1000`);
  }
  const rowsFor = (a) => rows.filter((r) =>
    (a.expected_edition.event_id && r.event_id === a.expected_edition.event_id) || r.event_series_id === (anchorSeriesId(a) || a.anchor_id));
  const liveFor = (a) => rowsFor(a).filter((r) => rowIsLive(r, today));

  // places with a free permanent photo
  const placeIds = [...new Set(active.flatMap((a) => liveFor(a)).map((r) => r.place_id).filter(Boolean))];
  const photoPlaces = new Set();
  if (placeIds.length) {
    const ph = await dbGet(`wf_place_photo?select=place_id&status=eq.active&place_id=in.${encodeURIComponent(inList(placeIds))}`);
    for (const p of ph) photoPlaces.add(p.place_id);
  }

  for (const a of active) {
    const ed = a.expected_edition;
    const live = liveFor(a);
    const win = a.typical_window || {};

    // 1. missing_edition
    if (win.start_month && win.end_month) {
      const d = daysUntilWindow(today, win.start_month, win.end_month);
      if (d <= LOOKAHEAD_DAYS && !live.length) {
        add(a, "missing_edition",
          `${a.name} normally runs in month ${win.start_month}${win.end_month !== win.start_month ? `-${win.end_month}` : ""} (${d === 0 ? "window is open now" : `opens in ${d} days`}) but no live upcoming row is in wf_events` +
          (ed.event_id ? ` (expected event_id ${ed.event_id}; state ${ed.state})` : ` (state ${ed.state})`),
          ed.source_url || (a.official_domain ? `https://${a.official_domain}` : null));
      }
    }

    // 2. row health + 6. stale verification (per live row)
    for (const r of live) {
      if (r.lat == null || r.lng == null || !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)))
        add(a, "row_health", `${r.event_id} has no map coordinates`, null, { issue: "no_coordinates" });
      if (!r.hero_image && !(r.place_id && photoPlaces.has(r.place_id)))
        add(a, "row_health", `${r.event_id} has no hero image and no free place photo on file`, null, { issue: "no_photo" });
      if (!r.category) add(a, "row_health", `${r.event_id} has no category`, null, { issue: "no_category" });

      // link: trust the nightly link-health verdict; probe only if it never ran
      if (r.link_ok === false || (r.link_verdict && isBadVerdict(String(r.link_verdict))))
        add(a, "row_health", `${r.event_id} outbound link is marked bad (${r.link_verdict || "link_ok=false"})`, r.official_event_url || r.event_page_url || null, { issue: "link_not_ok" });
      else if (r.link_ok == null && !r.link_checked_at && (r.official_event_url || r.event_page_url) && probeLink) {
        const u = r.official_event_url || r.event_page_url;
        await paced();
        let v = null;
        try { v = await probeLink(u, [r.event_name, a.name]); } catch { v = null; }
        if (v && isBadVerdict(v.verdict)) add(a, "row_health", `${r.event_id} link never health-checked; probe says ${v.verdict} (${v.reason})`, u, { issue: "link_not_ok" });
        else if (!v || v.verdict === "unknown") unknown.push({ anchor_id: a.anchor_id, what: "event link probe", url: u, reason: v ? v.reason : "probe-error" });
      }

      // public page
      if (r.slug) {
        const url = `${SITE}/florida-events/${r.slug}`;
        const p = await getPage(url);
        if (p.ok) {
          const hay = norm(p.text);
          if (!nameVariants(r.event_name || a.name).some((v) => hay.includes(v)))
            add(a, "row_health", `public page returns 200 but never mentions "${r.event_name}" (soft 404)`, url, { issue: "page_soft_404" });
        } else if (p.status === 404 || p.status === 410 || (p.status >= 300 && p.status < 400)) {
          add(a, "row_health", `public page returned HTTP ${p.status}`, url, { issue: "page_not_200" });
        } else if (p.status && p.status >= 500) {
          add(a, "row_health", `public page returned HTTP ${p.status}`, url, { issue: "page_not_200" });
        } else {
          unknown.push({ anchor_id: a.anchor_id, what: "public page", url, reason: p.reason });
        }
      } else {
        add(a, "row_health", `${r.event_id} has no slug, so it has no public page`, null, { issue: "page_not_200" });
      }

      if (needsRecheck(r, now))
        add(a, "stale_verification", `${r.event_id} last verified ${r.last_verified_at || "never"}; due for a re-check`, null);
    }

    // 3. official page probe
    const url = ed.source_url || (a.official_domain ? `https://${a.official_domain}` : null);
    const blocked = noProbeReason(a);
    if (blocked) { unknown.push({ anchor_id: a.anchor_id, what: "official page", url: null, reason: blocked }); continue; }
    if (!url) { unknown.push({ anchor_id: a.anchor_id, what: "official page", url: null, reason: "no-url" }); continue; }
    const p = await getPage(url);
    if (!p.ok) { unknown.push({ anchor_id: a.anchor_id, what: "official page", url, reason: p.reason }); continue; }

    const year = ed.year;
    const cancel = detectCancellation(p.text, a.name, year);
    if (cancel) add(a, "cancel_signal", `official page wording near "${a.name}" and ${year}: "${cancel}"`, url);

    if (ed.state === "confirmed_dated" && live.length) {
      const seen = datesNearName(p.text, a.name, year);
      const mine = live.find((r) => r.start_date && String(r.start_date).slice(0, 4) === String(year)) || null;
      if (mine && seen.length === 1 && seen[0] !== mine.start_date && seen[0] !== mine.end_date)
        add(a, "date_drift", `official page shows ${seen[0]} for ${year}; our row ${mine.event_id} says ${mine.start_date}`, url);
    }
    if (ed.state === "expected_undated") {
      const seen = datesNearName(p.text, a.name, year);
      if (seen.length) add(a, "new_announcement", `official page now shows ${year} date(s) near "${a.name}": ${seen.join(", ")}; anchor is still marked expected_undated`, url);
    }
  }

  return { today, anchors_total: anchors.length, anchors_checked: active.length, findings, unknown };
}

/* ------------------------------------------------------------------ report */

const esc = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderReport(res, { dry = false, anchorsPath = "" } = {}) {
  const L = [];
  L.push(`# Anchor watch ${res.today}`);
  L.push("");
  if (dry) L.push("> DRY RUN: no network and no database. Reads and page checks were stubbed, so nothing below is a real finding.", "");
  L.push(`Checked ${res.anchors_checked} of ${res.anchors_total} anchors${anchorsPath ? ` from \`${anchorsPath}\`` : ""}. Findings: **${res.findings.length}**. Could not check: ${res.unknown.length}.`);
  L.push("");
  if (res.findings.length) {
    L.push("| Anchor | What | Details | Link |", "|---|---|---|---|");
    for (const f of res.findings)
      L.push(`| ${esc(f.anchor_id)} | ${esc(KIND_LABEL[f.kind] || f.kind)}${f.issue ? ` (${esc(f.issue)})` : ""} | ${esc(f.detail)} | ${f.url ? esc(f.url) : ""} |`);
  } else {
    L.push("Nothing needs attention.");
  }
  L.push("");
  if (res.unknown.length) {
    L.push("## Could not check (not a problem by itself)", "",
      "A blocked page, timeout or 404 on an organizer site means we could not read it. We never call that dead.", "",
      "| Anchor | What | Why | Link |", "|---|---|---|---|");
    for (const u of res.unknown) L.push(`| ${esc(u.anchor_id)} | ${esc(u.what)} | ${esc(u.reason)} | ${u.url ? esc(u.url) : ""} |`);
    L.push("");
  }
  L.push("## Not covered", "",
    "- Expired but still pinned or featured rows: not checked. wf_events has no pinned or featured field, and ended rows are already hidden by the site, so there is no reliable signal to read.",
    "- This report only reads. Nothing was changed in the database.");
  return L.join("\n") + "\n";
}

export function summaryNote(res) {
  const by = {};
  for (const f of res.findings) by[f.kind] = (by[f.kind] || 0) + 1;
  const kinds = Object.entries(by).map(([k, n]) => `${k}=${n}`).join(" ");
  return `${res.anchors_checked}/${res.anchors_total} anchors; ${res.findings.length} findings${kinds ? ` (${kinds})` : ""}; ${res.unknown.length} unreadable`;
}

/* --------------------------------------------------------------------- CLI */

function parseArgs(argv) {
  const o = { anchors: DEFAULT_ANCHORS, out: null, json: false, dry: false, today: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); return v; };
    if (a === "--anchors") o.anchors = path.resolve(val());
    else if (a.startsWith("--anchors=")) o.anchors = path.resolve(a.slice(10));
    else if (a === "--out") o.out = val();
    else if (a.startsWith("--out=")) o.out = a.slice(6);
    else if (a === "--json") o.json = true;
    else if (a === "--dry") o.dry = true;
    else if (a === "--today") o.today = val();
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error("anchor-watch: " + e.message); process.exit(2); }
  const today = o.today || siteTodayStr();
  const emit = (md, json) => {
    if (o.out) writeFileSync(o.out, md);
    process.stdout.write(o.json ? JSON.stringify(json, null, 2) + "\n" : md);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `findings=${json.findings.length}\n`);
  };

  if (!existsSync(o.anchors)) {
    const note = `no anchor file yet (${path.relative(REPO, o.anchors) || o.anchors} missing); nothing checked`;
    console.error("anchor-watch: " + note);
    const res = { today, anchors_total: 0, anchors_checked: 0, findings: [], unknown: [], note };
    emit(`# Anchor watch ${today}\n\n${note}.\n`, res);
    if (!o.dry) { try { await recordPulse("anchor-watch", { attempted: 0, succeeded: 0, note }); } catch { /* fail-soft */ } }
    return;
  }

  let anchors;
  try {
    const j = JSON.parse(readFileSync(o.anchors, "utf8"));
    anchors = j.anchors;
    if (!Array.isArray(anchors)) throw new Error("`anchors` is not a list");
  } catch (e) { console.error("anchor-watch: cannot read anchor file: " + e.message); process.exit(1); }

  let fetchImpl = globalThis.fetch;
  let sb = sbEnv();
  let probeLink = probeAndClassify;
  let paceMs = 1000;
  if (o.dry) {
    sb = { url: "https://dry.invalid", key: "dry" };
    paceMs = 0;
    probeLink = async () => ({ verdict: "unknown", reason: "dry-run" });
    fetchImpl = async (u) => {
      if (String(u).includes("/rest/v1/")) return { ok: true, status: 200, json: async () => [] };
      throw new Error("dry-run: no network");
    };
  } else if (!sb) {
    console.error("anchor-watch: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (use --dry to skip)");
    process.exit(2);
  }

  let res;
  try { res = await runWatch({ anchors, today, fetchImpl, sb, paceMs, probeLink }); }
  catch (e) {
    const note = `unavailable: cannot run: ${String(e && e.message || e).slice(0, 150)}`; // "unavailable:" is a deterministic-failure prefix (lib/jobPulse): job-watch pages on ONE such run, not after two days
    console.error("anchor-watch: " + note);
    if (!o.dry) { try { await recordPulse("anchor-watch", { attempted: anchors.length, succeeded: 0, failed: anchors.length, note }); } catch { /* fail-soft */ } }
    process.exit(1);
  }

  emit(renderReport(res, { dry: o.dry, anchorsPath: path.relative(REPO, o.anchors) }), res);
  if (!o.dry) {
    try { await recordPulse("anchor-watch", { attempted: res.anchors_total, succeeded: res.anchors_checked, note: summaryNote(res) }); } catch { /* fail-soft */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error("anchor-watch: " + (e && e.stack || e)); process.exit(1); });
}
