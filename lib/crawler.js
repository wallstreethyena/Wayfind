// lib/crawler.js — is this request a self-identified crawler?
//
// IN lib/, NOT IN THE ROUTE. A Next.js route module may only export its handler
// and a few known config keys; an extra export breaks the build. Putting it here
// also means scripts/check-ut-crawler-clicks.mjs can CALL it against real
// user-agent strings instead of grepping the route's source.
//
// Crawlers do not get redirected to a partner, ever.
//
// THE INCIDENT (2026-07-30). The deals rail rendered the CJ deep link straight
// into an <a href>. CJ reporting showed ~144 clicks/day, every single day, against
// ~50 human visitors — 1,146 clicks over the window with ZERO sales. A sustained
// 0% conversion rate on automated clicks is what a network flags as click fraud,
// so this is account risk, not wasted crawl budget.
//
// Getting the URL out of the DOM (lib/dealsData.js) removes the direct path, and
// rel="sponsored nofollow" tells well-behaved crawlers not to follow the redirect
// either. This is the layer for the ones that follow anyway: a bot that reaches
// this route bounces to our own site and never touches the partner, so it cannot
// mint a click.
//
// UA matching is a blunt instrument and deliberately conservative — it is the LAST
// line, not the only one, and a false positive costs a real user a redirect. So it
// matches self-identified crawlers only, never "unknown UA", because an empty or
// odd UA is far more often a privacy-hardened human than a bot.
const BOT_UA = /bot\b|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|outbrain|pinterest|whatsapp|telegram|discord|vkshare|preview|scrapy|curl\/|wget|python-requests|headless|lighthouse|gtmetrix|pingdom|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|applebot|duckduckbot|yandex|baidu/i;

// 2026-10-28: people browsing INSIDE an app whose UA carries a crawler-looking
// word are not crawlers here either. BOT_UA's bare "pinterest" token matched
// the Pinterest in-app browser ("[Pinterest/iOS]") and "CUBOT" phones end in
// "bot", so a real person tapping Book inside Pinterest was bounced to our own
// fallback by every /go route. Same carve-out /api/photo already makes
// (IN_APP_HUMAN_UA below); "Pinterestbot/1.0" itself still matches — it has no
// "[Pinterest/" bracket.
export function isCrawler(ua) {
  const s = String(ua || "");
  return BOT_UA.test(s) && !IN_APP_HUMAN_UA.test(s);
}

// OUR OWN synthetic monitor (scripts/run-synthetic-monitor.mjs), self-identified
// via a fixed UA on every request/page context it opens. Deliberately a SEPARATE
// pattern from BOT_UA, and NEVER folded into isCrawler(): the monitor's own
// "book-links" scenario (scripts/lib/synthetic/scenarios.mjs) fetches a real
// /api/{viator,commerce,ticketmaster}/go link with `redirect: "manual"` and
// asserts the Location resolves to an ATTRIBUTED PARTNER HOST — if isCrawler()
// ever matched this UA, that assertion would fail on every scheduled run,
// because a crawler-refused hit fails closed to our own site, never a partner.
//
// So the monitor's hits must keep getting a REAL redirect. What they must NOT
// do is count as a human visitor: it fires from CI on a fixed schedule
// (.github/workflows/synthetic-monitor.yml, every 30 minutes), not from a
// person, so any provider_redirect_started/failed it produces would inflate
// the money funnel exactly the way scripts/check-viator-redirect-layer.mjs's
// own header documents happened before (2026-08-26 audit: ~70 synthetic
// provider_redirect_started events from an unguarded direct route call).
// lib/serverEvents.js's captureServer() reads this to skip emission for the
// monitor's own requests, without touching the redirect decision at all.
const SYNTHETIC_MONITOR_UA = /^WayfindSyntheticMonitor\//i;

// OUR OWN verification scripts (2026-10-28, PostHog: 65 rows UA "Mozilla/5.0
// WayfindVerify" and 58 rows UA "node" tagged traffic_class=human on
// provider_redirect_started). NOT part of isCrawler(); the go routes stamp
// traffic_class "automation", and since 2026-10-31 lib/redirectTrafficClass.js
// refuses them as qa/verifier-ua (302 back to Wayfind, X-Wayfind-Refused header):
// a script that followed the real redirect was itself a visit to the partner,
// which inflated Wayfind's own affiliate traffic (owner rule 2026-10-28). A check
// that must read the real partner Location uses the synthetic monitor UA below
// with redirect "manual" (scripts/watchdog-affiliate-links.mjs), never following.
// "node" is undici's default User-Agent; no browser ever sends exactly that.
export function isInternalVerifier(ua) {
  const s = String(ua || "").trim();
  return /^Mozilla\/5\.0 WayfindVerify\b/i.test(s) || /^node$/i.test(s);
}

export function isSyntheticMonitor(ua) {
  return SYNTHETIC_MONITOR_UA.test(String(ua || "").trim());
}

// THE "2023 ROTATION" SCRAPER (2026-11-10). PostHog, 14 days to 11-10,
// $pageview: exactly ten desktop identities, 216-259 pageviews each (near-equal
// shares), 2,344 of 2,345 at a 1280x720 viewport (a browser-driver default),
// 33-48 countries per identity, ~6 s per page, a new visitor on almost every
// page:
//   Windows  Chrome/118.0.0.0, Chrome/119.0.0.0, Chrome/120.0.0.0,
//            Edg/119.0.0.0, Edg/120.0.0.0, Firefox/120.0, Firefox/121.0
//   macOS    Chrome/119.0.0.0, Chrome/120.0.0.0, Firefox/121.0
// 30 days: 4,318 such "visitors" against 5 people on those versions at any
// other viewport. On the go routes, 7 days: 281 provider_redirect_started, 272
// of them click_proof "none", none with a cookie this site sets.
// It drives a real browser (runs JS, sends complete Fetch Metadata), so neither
// isCrawler() nor spoofedBrowserReason() can see it. Desktop Chrome, Edge and
// Firefox update themselves, so a late-2023 build three years on is rare in
// people and a staple of scraper UA lists.
//
// This matches those ten identities EXACTLY (OS + browser + major version) and
// nothing wider. NEVER a phone or tablet: Android 7 is stuck on Chrome 119 for
// good, and a real Android Chrome/120 tap sits in the same 7-day sample. Never
// an in-app browser, never another Chromium brand (Opera, Vivaldi, Yandex,
// Samsung) whose Chrome/ token is not its own version.
// NOT covered, on purpose: the other no-proof go-route readers (desktop Chrome
// 134/135 with a same-site Referer, Chrome 148-150 with none). Those versions
// are too close to what people run; the owner rule (2026-10-31) is to LABEL
// them with click_proof, not to stop them.
// MIRRORED in lib/browserAnalytics.js (which cannot import); the two are held
// equal by scripts/check-redirect-suspect-gate.mjs.
const STALE_ROTATION_OS = [
  [/\(Windows NT [\d.]+[;)]/, { chrome: [118, 119, 120], edge: [119, 120], firefox: [120, 121] }],
  [/\(Macintosh; Intel Mac OS X [\d_.]+[;)]/, { chrome: [119, 120], edge: [], firefox: [121] }],
];
const NOT_PLAIN_DESKTOP_UA = /\bMobile\b|Android|iPhone|iPad|iPod|\bOPR\/|\bVivaldi\/|YaBrowser\/|SamsungBrowser\/|\bwv\)|\[Pinterest\/|\bFBAN\/|\bFBAV\/|\bInstagram\b/i;
export function isStaleRotationUa(ua) {
  const s = String(ua || "");
  if (NOT_PLAIN_DESKTOP_UA.test(s)) return false;
  const os = STALE_ROTATION_OS.find(([rx]) => rx.test(s));
  if (!os) return false;
  const edge = s.match(/\bEdg\/(\d+)\./);
  if (edge) return os[1].edge.includes(Number(edge[1]));
  const chrome = s.match(/\bChrome\/(\d+)\./);
  if (chrome) return os[1].chrome.includes(Number(chrome[1]));
  const firefox = s.match(/\bFirefox\/(\d+)\./);
  return !!firefox && os[1].firefox.includes(Number(firefox[1]));
}

// PHOTO SPEND (owner, 2026-10-08). /api/photo withholds the PAID Google photo call
// from automated readers (headless QA browsers, page-rendering crawlers, our own
// monitor). BOT_UA is tuned for the partner redirect routes, where a false positive
// costs one redirect; here it would cost a real person their photos AND hide the
// miss from the repair queue, so people browsing inside an app whose UA carries a
// crawler-looking word are carved back out: the Pinterest in-app browser
// ("[Pinterest/iOS]"), Meta's in-app browsers (FBAN/FBAV/Instagram), and CUBOT
// phones ("CUBOT" ends in "bot"). Narrow on purpose: isCrawler() is unchanged.
const IN_APP_HUMAN_UA = /\[Pinterest\/|\bFBAN\/|\bFBAV\/|\bInstagram\b|\bCUBOT\b/i;
export function isAutomatedPhotoReader(ua) {
  const s = String(ua || "");
  if (isSyntheticMonitor(s)) return true;
  if (!isCrawler(s)) return false;
  return !IN_APP_HUMAN_UA.test(s);
}
