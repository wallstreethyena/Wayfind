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
