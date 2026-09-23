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

export function isCrawler(ua) {
  return BOT_UA.test(String(ua || ""));
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

export function isSyntheticMonitor(ua) {
  return SYNTHETIC_MONITOR_UA.test(String(ua || "").trim());
}
