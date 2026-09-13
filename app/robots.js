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
import { SITE_URL } from "../lib/site";
export default function robots() {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/photo" }, sitemap: SITE_URL + "/sitemap.xml" };
}
