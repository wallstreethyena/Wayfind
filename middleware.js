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
// Viator (2026-07-17 audit): /api/viator/tours is a same-origin XHR (app/home.js)
// that hits the metered Viator Partner API AND writes Supabase via service-role
// (persistOffer) — same amplification shape, so full guard. /api/viator/go is a
// GET 302 the browser navigates to (culture "Book this experience" links, card
// CTAs), so rate-limit only, exactly like /api/eats/go. Neither has a server-side
// (SSR) caller — home.js fetches /tours client-side, and /go is only ever a link
// the browser follows — so guarding them cannot break an SSR page.
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
    "/api/local/report",
    // Buzz hero (v6.56): metered Anthropic proxy for the trending why-line.
    "/api/buzz/why",
    // Vision card-photo scoring: metered Anthropic proxy — same-origin guarded.
    "/api/image-score",
    "/api/hooks",
    "/api/eats/check",
    "/api/eats/go",
    "/api/viator/tours",
    "/api/viator/go",
    // Curator Boost: /api/signals/likes is a same-origin XHR (fetchMemberSignals
    // in app/home.js) that reads likes/events via the service role. No SSR caller,
    // so full same-origin guard — stops cross-site scraping of the aggregate.
    "/api/signals/likes",
    // Experiences v3: /api/experiences is a same-origin XHR (the Things-to-Do
    // rail in app/home.js) reading cached wf_experiences via the service role.
    // This is ANTI-SCRAPING, not a cost gate (no metered upstream — it's a
    // Supabase read); full same-origin guard keeps the affiliate catalog from
    // being harvested off our origin.
    "/api/experiences",
    // UT deal rails: /api/deals is a same-origin XHR (the UTDealsRail in
    // app/home.js) reading wf_deals_ranked via the service role. ANTI-SCRAPING,
    // not a cost gate — keeps the affiliate deal catalog from being harvested.
    "/api/deals",
    // City unlock: /api/city/unlock is a same-origin POST that queues an
    // uncovered city for population (writes wf_city_requests). Same-origin
    // guarded so the demand/pull queue can't be poked cross-origin.
    "/api/city/unlock",
    // Beach Intelligence (§0): /api/beach/conditions is a same-origin XHR that
    // assembles keyless marine + UV + NWS-alert + tide data. ANTI-SCRAPING, not a
    // cost gate — every upstream is free — but the assembled view is ours.
    "/api/beach/conditions",
    // Live Picks v2: /api/events/demand is a same-origin XHR reading aggregated
    // first-party demand (event_open / tickets_out) from public.events via the
    // service role. ANTI-SCRAPING, not a cost gate — no metered upstream, it is
    // a Supabase read. Full same-origin guard keeps our own demand signal, the
    // one popularity number we actually own, from being harvested off-origin.
    "/api/events/demand",
  ],
};

// GET-302 navigations the browser follows in a new tab: a same-origin 403 would
// break a legitimate click-through (some browsers strip both Sec-Fetch-Site and
// Referer on a fresh nav), so these get the per-IP rate limit WITHOUT the
// same-origin block. All other matched routes get the full guard.
const NAV_302_ROUTES = new Set(["/api/eats/go", "/api/viator/go"]);

export function middleware(req) {
  const path = req.nextUrl && req.nextUrl.pathname;
  const rateLimitOnly = NAV_302_ROUTES.has(path);
  return guardPaidRoute(req, { rateLimitOnly }) || NextResponse.next();
}
