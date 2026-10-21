#!/usr/bin/env node
/**
 * check-ticketmaster-static-ctas — a Ticketmaster-family CTA in static
 * content must leave through /api/ticketmaster/go, and that route must
 * answer a browser with an Impact Location (ticketmaster.evyy.net, SID
 * 7475855). A curl user-agent is refused on purpose (lib/crawler.js matches
 * `curl/`) and is not evidence the redirect is broken.
 *
 * Official citations stay raw only on a line marked
 * `wf-affiliate-allow: official`. That marker is for sources, not buttons.
 *
 * The homepage poster and the Events grid already call ticketmasterGoUrl.
 * This guard does not re-test those paths.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RAYS = "https://www.ticketmaster.com/tampa-bay-rays-tickets/artist/806027?home_away=home";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CURL_UA = "curl/8.5.0";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// Literals in lib/affiliates.js are read at import. Delete overrides first so
// this process proves the baked-in Impact ids, not whatever the shell exported.
// The route handler calls captureServer. A direct run of this file must not
// write provider_redirect_* into production analytics (check-guards-emit-no-analytics).
process.env.WF_SUPPRESS_ANALYTICS = "1";
delete process.env.NEXT_PUBLIC_IMPACT_SID;
delete process.env.NEXT_PUBLIC_TM_IMPACT_CAMPAIGN;
delete process.env.NEXT_PUBLIC_TM_IMPACT_AD;
delete process.env.NEXT_PUBLIC_TM_IMPACT_DESTPARAM;

const { isCrawler } = await import("../lib/crawler.js");
const { isTicketmasterFamily } = await import("../lib/affiliates.js");
const { GUIDES } = await import("../lib/guides.js");
const { eventDetailTicketAction, eventWebsiteUrl } = await import("../lib/curatedEvents.js");
const { GET } = await import("../app/api/ticketmaster/go/route.js");

function walk(dir, pred, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (pred(e.name)) out.push(p);
  }
  return out;
}

function familyUrl(raw) {
  const s = String(raw || "").replace(/[),.;]+$/, "");
  if (!/^https?:\/\//i.test(s)) return null;
  let host = "";
  try { host = new URL(s).hostname.toLowerCase(); } catch { return null; }
  if (host === "app.ticketmaster.com" || host === "developer.ticketmaster.com") return null;
  return isTicketmasterFamily(s) ? s : null;
}

// Comment-stripped scan. A URL is tracked when ticketmasterGoUrl( wraps it
// (same line, or the previous code line). A same-line official marker is the
// only other pass. Block comments are blanked before the line walk.
export function bareTicketmasterCtas(src) {
  const blanked = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lines = blanked.split("\n");
  const hits = [];
  const re = /https?:\/\/[^\s"'`<>]+/gi;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("wf-affiliate-allow: official")) continue;
    const code = lines[i].replace(/(^|[^:])\/\/.*$/, "$1");
    const prev = i > 0 ? lines[i - 1] : "";
    if (/ticketmasterGoUrl\s*\(/.test(code) || /ticketmasterGoUrl\s*\(/.test(prev)) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      const url = familyUrl(m[0]);
      if (url) hits.push({ line: i + 1, url });
    }
  }
  return hits;
}

// The probe has to be able to fail, and to stay quiet on the two allowed shapes.
{
  const bare = 'export const x = "https://www.ticketmaster.com/event/plain";\n';
  const wrapped = 'href: ticketmasterGoUrl(\n  "https://www.ticketmaster.com/event/plain",\n);\n';
  const official = '"https://www.livenation.com/event/x", // wf-affiliate-allow: official\n';
  const comment = "// see https://www.ticketmaster.com/event/plain\n";
  const api = 'fetch("https://app.ticketmaster.com/discovery/v2/events.json")\n';
  ok(bareTicketmasterCtas(bare).length === 1, "probe: a bare ticketmaster.com literal is an untracked CTA");
  ok(bareTicketmasterCtas(wrapped).length === 0, "probe: ticketmasterGoUrl( on the previous line is tracked");
  ok(bareTicketmasterCtas(official).length === 0, "probe: wf-affiliate-allow: official exempts a source citation");
  ok(bareTicketmasterCtas(comment).length === 0, "probe: a comment is not a CTA");
  ok(bareTicketmasterCtas(api).length === 0, "probe: the Discovery API host is not a CTA");
}

const guidePath = join(ROOT, "lib/guidesFloridaTrending2026.js");
const guideSrc = readFileSync(guidePath, "utf8");
const unmarked = guideSrc.replace("wf-affiliate-allow: official", "wf-affiliate-allow: removed");
ok(unmarked !== guideSrc, "red-prove: the official marker was present to remove");
ok(bareTicketmasterCtas(unmarked).some((h) => h.url.includes("teddy-swims")),
  "red-prove: without the official marker the Teddy Swims source is an untracked Live Nation URL");
ok(bareTicketmasterCtas(guideSrc).length === 0, "the trending guide has no bare Ticketmaster CTA once the Rays link is wrapped and the Teddy Swims source is marked");

const roots = [join(ROOT, "lib"), join(ROOT, "app")];
const files = roots.flatMap((dir) => walk(dir, (n) => /\.(js|mjs|jsx)$/.test(n)));
ok(files.length > 50, `probe: scanned published source (got ${files.length} files)`);
const stray = [];
for (const file of files) {
  const hits = bareTicketmasterCtas(readFileSync(file, "utf8"));
  for (const h of hits) stray.push(`${file.slice(ROOT.length)}:${h.line} ${h.url}`);
}
ok(stray.length === 0, "no bare Ticketmaster-family CTA in lib/ or app/:\n  " + stray.join("\n  "));

const guide = GUIDES["trending-in-florida-this-week-oct-19-2026"];
const rays = guide && guide.picks && guide.picks[1];
const raysHref = rays && rays.ticketCta && rays.ticketCta.href;
let raysDest = "";
try {
  raysDest = new URL(raysHref, "https://www.gowayfind.com").searchParams.get("url") || "";
} catch { raysDest = ""; }
ok(raysDest === RAYS, `Rays ticket CTA preserves the home-games destination (got ${raysDest})`);
ok(rays && rays.ticketCta && rays.ticketCta.label === "Rays home games on Ticketmaster", "Rays anchor label names Ticketmaster");
ok(!(rays && String(rays.blurb).includes("ticketmaster.com")), "the Rays blurb no longer carries a copyable ticketmaster.com URL");
ok(/Wayfind affiliate link/.test(String(rays && rays.blurb)), "the Rays sentence says the link is a Wayfind affiliate link");

const page = readFileSync(join(ROOT, "app/guides/[slug]/page.js"), "utf8");
ok(/pick\.ticketCta\.href/.test(page) && /rel="sponsored noreferrer"/.test(page),
  "the guide template renders ticketCta with rel=sponsored");

function headersFrom(ua) {
  return { get: (name) => (String(name).toLowerCase() === "user-agent" ? ua : null) };
}
async function locationFor(url, ua, surface = "guide_florida_trending") {
  const res = await GET({
    url: "http://localhost:3000/api/ticketmaster/go?url=" + encodeURIComponent(url) + "&surface=" + encodeURIComponent(surface),
    headers: headersFrom(ua),
  });
  return { status: res.status, location: res.headers.get("location") };
}

ok(isCrawler(CURL_UA) === true, "probe: the curl user-agent is the bot this route refuses");
ok(isCrawler(BROWSER_UA) === false, "probe: the browser user-agent is not a crawler");

const browser = await locationFor(RAYS, BROWSER_UA);
let browserUrl = null;
try { browserUrl = new URL(browser.location); } catch { browserUrl = null; }
ok(browser.status === 302 && browserUrl && browserUrl.hostname === "ticketmaster.evyy.net",
  `browser UA Location is ticketmaster.evyy.net (got ${browser.status} ${browser.location})`);
ok(browserUrl && browserUrl.pathname === "/c/7475855/264167/4272",
  `Impact path is /c/7475855/264167/4272 (got ${browserUrl && browserUrl.pathname})`);
ok(browserUrl && browserUrl.searchParams.get("u") === RAYS,
  `Impact u preserves the Rays destination (got ${browserUrl && browserUrl.searchParams.get("u")})`);
ok(browserUrl && browserUrl.searchParams.get("subId1") === "guide_florida_trending",
  `subId1 is the guide surface (got ${browserUrl && browserUrl.searchParams.get("subId1")})`);

const curl = await locationFor(RAYS, CURL_UA);
let curlUrl = null;
try { curlUrl = new URL(curl.location); } catch { curlUrl = null; }
ok(curl.status === 302 && curlUrl && curlUrl.pathname === "/events",
  `curl UA is refused to /events (got ${curl.status} ${curl.location})`);

const other = await locationFor("https://seatgeek.com/e/x", BROWSER_UA);
let otherUrl = null;
try { otherUrl = new URL(other.location); } catch { otherUrl = null; }
ok(other.status === 302 && otherUrl && otherUrl.pathname === "/events",
  "a non-Ticketmaster URL still fails closed to /events");

// Static JSON ticket URLs are not edited. The detail-page button must wrap
// them. The organiser website button stays the raw URL (founder P0: do not
// hand a Ticketmaster affiliate href to Official site).
const dataFiles = walk(join(ROOT, "data"), (n) => n.endsWith(".json"));
const ticketRows = [];
const siteRows = [];
for (const file of dataFiles) {
  let json;
  try { json = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
  const rows = Array.isArray(json) ? json : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const ticket = familyUrl(row.ticket_url || row.official_ticket_url);
    const site = familyUrl(row.official_url || row.official_event_url);
    if (ticket) ticketRows.push({ id: row.id || row.event_id || file, url: ticket, site });
    else if (site) siteRows.push({ id: row.id || row.event_id || file, url: site });
  }
}
ok(ticketRows.length >= 1, `probe: expected at least the Chris Tomlin Live Nation ticket_url in data/ (got ${ticketRows.length})`);
for (const row of ticketRows) {
  const action = eventDetailTicketAction({
    event_id: row.id,
    official_ticket_url: row.url,
    is_free: false,
  }, { surface: "florida_event_page" });
  const dest = action && action.href && action.href.startsWith("/")
    ? new URL(action.href, "https://www.gowayfind.com").searchParams.get("url")
    : "";
  const registry = action && action.href && action.href.startsWith("/api/commerce/go");
  ok(action && (registry || (action.kind === "affiliate" && dest === row.url && action.href.startsWith("/api/ticketmaster/go?"))),
    `${row.id} ticket CTA is tracked (href ${action && action.href}, dest ${dest})`);
  if (!registry && dest === row.url) {
    const hop = await locationFor(row.url, BROWSER_UA, "florida_event_page");
    let hopUrl = null;
    try { hopUrl = new URL(hop.location); } catch { hopUrl = null; }
    ok(hop.status === 302 && hopUrl && hopUrl.hostname === "ticketmaster.evyy.net" && hopUrl.searchParams.get("u") === row.url,
      `${row.id} browser Location is the Impact redirect for that exact page (got ${hop.status} ${hop.location})`);
  }
  if (row.site) {
    const website = eventWebsiteUrl({ official_event_url: row.site, official_ticket_url: row.url, link_ok: true });
    ok(website === row.site, `${row.id} official site stays the raw citation (${website})`);
  }
}
for (const row of siteRows) {
  const site = eventWebsiteUrl({ official_event_url: row.url, link_ok: true });
  ok(site === row.url, `${row.id} official site stays the raw citation (${site})`);
}

if (fail.length) {
  console.error("check-ticketmaster-static-ctas: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
const wrappedIds = ticketRows.map((r) => r.id).join(", ");
const rawSites = siteRows.length + ticketRows.filter((r) => r.site).length;
console.log(`check-ticketmaster-static-ctas: OK — ${pass} assertions; Rays guide CTA and ${ticketRows.length} static ticket row(s) (${wrappedIds}) resolve through /api/ticketmaster/go to ticketmaster.evyy.net/c/7475855/264167/4272; curl UA still refused to /events; ${rawSites} official-site citation(s) left raw`);
