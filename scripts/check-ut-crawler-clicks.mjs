#!/usr/bin/env node
/**
 * check-ut-crawler-clicks — no partner URL in crawlable DOM, and no crawler
 * reaches a partner through our redirect.
 *
 * THE INCIDENT (CJ reporting, 2026-07-30)
 * Undercover Tourist links took ~144 clicks/day, EVERY day — 1,146 over the
 * window — against ~50 human visitors/day, with ZERO sales and 0% conversion.
 * The deals rail rendered `wf_deals.affiliate_url` straight into an `<a href>`,
 * so a crawler that renders JS saw a live anrdoezrs.net URL, and following it is
 * a billable CJ click. A sustained 0% conversion rate on automated clicks is the
 * pattern affiliate networks flag as click fraud: this was ACCOUNT RISK, not
 * wasted crawl budget.
 *
 * THREE LAYERS, ASSERTED SEPARATELY, BECAUSE EACH FAILS DIFFERENTLY
 *   1. the DOM carries our own path, so there is no partner link to follow
 *   2. rel="sponsored nofollow" so well-behaved crawlers do not follow even that
 *   3. the redirect refuses self-identified crawlers, for the ones that ignore 2
 * Layer 1 alone would be enough if every renderer were honest; layer 3 alone
 * would still leak the URL to anything that scrapes HTML without following it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. the rail's href is OURS, not the partner's ────────────────────────── */
const dd = readFileSync(path.resolve("lib/dealsData.js"), "utf8");
ok(/commerceHref\(/.test(dd), "lib/dealsData.js builds the rail href through commerceHref");
ok(!/href:\s*row\.affiliate_url/.test(dd),
  "the rail no longer emits row.affiliate_url as the href — that raw CJ link in crawlable DOM is what took ~144 bot clicks/day");
ok(/provider:\s*"undercover_tourist"/.test(dd), "it routes under the undercover_tourist provider");

const { buildRails } = await import(path.resolve("lib/dealsData.js"));
const rails = buildRails(
  [{ id: 42, subcategory: "theme_parks", title: "T", affiliate_url: "https://www.anrdoezrs.net/links/101643573/type/dlg/sid/x/https://www.undercovertourist.com/x", provider: "undercover_tourist" }],
  {}
);
const item = rails[0] && rails[0].items[0];
ok(!!item, "buildRails produced an item to inspect (an empty result would make the next checks vacuous)");
ok(item && typeof item.href === "string" && item.href.startsWith("/api/commerce/go?"),
  `THE FIX, asserted by CALLING it: the shaped href is our own redirect path (got ${item && item.href})`);
ok(item && !/anrdoezrs|dpbolvw|tkqlhce|jdoqocy|kqzyfj|emjcd|dotomi|qksrv/.test(item.href),
  "NO CJ DOMAIN survives into the rendered item — even though the input row carried one");

/* ── 2. every affiliate anchor is rel="sponsored nofollow" ────────────────── */
const home = readFileSync(path.resolve("app/home.js"), "utf8");
const railAnchor = /<a key=\{d\.id\} href=\{d\.href\}[^>]*rel="([^"]*)"/.exec(home);
ok(!!railAnchor, "found the deals-rail anchor to check its rel");
if (railAnchor) {
  ok(/\bsponsored\b/.test(railAnchor[1]), `the rail anchor is rel sponsored (got "${railAnchor[1]}")`);
  ok(/\bnofollow\b/.test(railAnchor[1]),
    `…and NOFOLLOW (got "${railAnchor[1]}") — sponsored alone was what shipped, and non-Google crawlers ignore it entirely`);
}

/* ── 3. the redirect refuses self-identified crawlers ─────────────────────── */
const { isCrawler } = await import(path.resolve("lib/crawler.js"));
const BOTS = [
  ["Googlebot/2.1 (+http://www.google.com/bot.html)", "Googlebot"],
  ["Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", "bingbot"],
  ["facebookexternalhit/1.1", "Facebook unfurler"],
  ["Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", "AhrefsBot"],
  ["Mozilla/5.0 (compatible; SemrushBot/7~bl)", "SemrushBot"],
  ["Bytespider", "Bytespider"],
  ["curl/8.4.0", "curl"],
  ["python-requests/2.31.0", "python-requests"],
  ["Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0.0.0", "headless Chrome"],
];
for (const [ua, label] of BOTS) ok(isCrawler(ua) === true, `${label} is refused`);

// The other direction matters more than the first: a false positive costs a REAL
// user their redirect and their click earns nothing, which is the same revenue
// hole from the opposite side.
const HUMANS = [
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "iOS Safari — the device the owner reported from"],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "desktop Chrome"],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0", "Firefox"],
  ["Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36", "Android Chrome"],
  ["", "an EMPTY user-agent — far more often a privacy-hardened human than a bot, so it must pass"],
  [null, "a missing user-agent"],
];
for (const [ua, label] of HUMANS) ok(isCrawler(ua) === false, `${label} passes through`);

/* ── the route actually applies it, before resolving anything ─────────────── */
const route = readFileSync(path.resolve("app/api/commerce/go/route.js"), "utf8");
ok(/isCrawler\(req\.headers\.get\("user-agent"\)\)/.test(route), "the route calls isCrawler on the request UA");
const gateAt = route.indexOf("isCrawler(");
const resolveAt = route.indexOf("resolveOffer(");
ok(gateAt > 0 && resolveAt > 0 && gateAt < resolveAt,
  "the crawler gate runs BEFORE resolveOffer — a refused bot must not even cause a partner URL to be looked up");
ok(!/export function isCrawler/.test(route),
  "isCrawler is NOT exported from the route — a Next route module may only export its handler, and an extra export breaks the build");

/* ── the provider still refuses an unattributed row ───────────────────────── */
const { PROVIDERS } = await import(path.resolve("lib/commerceProviders.js"));
const ut = PROVIDERS.undercover_tourist;
ok(!!ut, "undercover_tourist is a registered provider");
ok(ut && ut.requireTracking === true, "it requires tracking — a row that lost its PID errors rather than redirecting for free");
ok(ut && typeof ut.track === "function" && ut.track("https://www.anrdoezrs.net/links/999/x") === null,
  "its track() refuses a URL without our PID");
ok(ut && ut.track("https://www.anrdoezrs.net/links/101643573/type/dlg/sid/x/https://www.undercovertourist.com/y") !== null,
  "…and passes one that carries it");

if (fail.length) {
  console.error("check-ut-crawler-clicks: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-ut-crawler-clicks: OK — ${pass} assertions (no CJ domain in the rendered item, rel=sponsored nofollow, ${BOTS.length} crawlers refused before resolve, ${HUMANS.length} real UAs pass, unattributed rows still error)`);
