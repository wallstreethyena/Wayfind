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
// THE PARTNER /go REDIRECTS ARE DISALLOWED (2026-10-22). Every one of them is a
// 302 to an affiliate partner; a crawler that follows one mints a partner click
// with a 0% conversion rate, which networks read as click fraud. Their links
// already carry rel="sponsored nofollow" and every response carries
// X-Robots-Tag: noindex, nofollow (lib/redirectGuard.js) — this tells compliant
// crawlers not to request them at all. Non-compliant ones are handled by the
// request gate itself.
import { SITE_URL } from "../lib/site";
const PARTNER_GO_DISALLOW = Object.freeze([
  "/api/viator/go", "/api/commerce/go", "/api/hotels/go", "/api/ticketmaster/go",
]);
export default function robots() {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/photo", ...PARTNER_GO_DISALLOW] }, sitemap: SITE_URL + "/sitemap.xml" };
}
