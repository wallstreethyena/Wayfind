// v4.17 — robots directives; everything public, sitemap declared.
//
// /api/photo IS DISALLOWED (2026-09-09). It is a metered Google Places photo
// proxy (see app/api/photo/route.js) — every crawler hit on an uncached ref
// is a real billable Google request, and a compliant crawler (Googlebot,
// Bingbot, GPTBot, PerplexityBot, ClaudeBot) walking every card's photo URL
// on a full site crawl costs real money for a byte stream no search result
// ever surfaces on its own. Photos still get indexed normally — this only
// keeps crawlers off the metered proxy endpoint itself, never off the pages
// that reference it.
//
// THE PARTNER "GO" ROUTES ARE DISALLOWED (2026-11-10). /api/{commerce,hotels,
// stubhub,ticketmaster,viator}/go are affiliate redirects, not pages: nothing there is
// ever a search result. Each route already refuses a named crawler
// (lib/crawler.js isCrawler), so this only saves the wasted request and keeps
// crawler noise out of the redirect counts. It does nothing against a scraper
// that ignores robots.txt; that is lib/redirectTrafficClass.js's job.
// scripts/check-redirect-suspect-gate.mjs fails when a go route exists that is
// not listed here.
import { SITE_URL } from "../lib/site";
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/photo", "/api/commerce/go", "/api/hotels/go", "/api/reserve/go", "/api/stubhub/go", "/api/ticketmaster/go", "/api/viator/go"],
    },
    sitemap: SITE_URL + "/sitemap.xml",
  };
}
