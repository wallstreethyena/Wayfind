import { NextResponse } from "next/server";
import { guardPaidRoute } from "./lib/apiGuard";

// Cost-leak fix (the $735 Google Places incident): these routes are public,
// unauthenticated proxies to METERED third-party APIs — Google Places
// (/api/places/search), Foursquare (/api/fsq/search), and Anthropic
// (/api/list/generate, /api/moment/picks, /api/insight, /api/blurbs,
// /api/hooks). A scraper iterating novel params bills real money on every
// cache miss. This middleware runs BEFORE the route and applies one guard
// (same-origin + best-effort per-IP rate limit — see lib/apiGuard.js) so only
// legitimate same-origin browser calls reach the paid upstream. It never blocks
// a real user; the hard backstop remains the owner's provider quota caps.
//
// B2: /api/eats/check + /api/eats/go proxy a live Uber Eats scrape. /check is a
// same-origin XHR that fans out up to 24 outbound scrapes per POST — the exact
// amplification shape this guard exists for — so it gets the full same-origin +
// rate-limit guard. /api/eats/go is a GET 302 the browser NAVIGATES to (new tab);
// a same-origin 403 would break a legitimate click-through in browsers that strip
// both Sec-Fetch-Site and Referer, so it gets rate-limit only (rateLimitOnly).
//
// DELIBERATELY EXCLUDED: /api/events — it has a legitimate server-side (SSR)
// caller (app/events/[city]/[slug]/page.js) with no browser headers; gating it
// needs an internal-secret exemption (tracked follow-up), so it stays open here
// rather than risk breaking the event detail pages.
export const config = {
  matcher: [
    "/api/places/search",
    "/api/fsq/search",
    "/api/list/generate",
    "/api/moment/picks",
    "/api/insight",
    "/api/blurbs",
    "/api/hooks",
    "/api/eats/check",
    "/api/eats/go",
  ],
};

export function middleware(req) {
  const rateLimitOnly = req.nextUrl && req.nextUrl.pathname === "/api/eats/go";
  return guardPaidRoute(req, { rateLimitOnly }) || NextResponse.next();
}
