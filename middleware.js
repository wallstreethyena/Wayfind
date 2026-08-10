import { NextResponse } from "next/server";
import { guardPaidRoute } from "./lib/apiGuard";

// Cost-leak fix (the $735 Google Places incident): these routes are public,
// unauthenticated proxies to METERED third-party APIs — Google Places
// (/api/places/search), Foursquare (/api/fsq/search), and Anthropic
// (/api/list/generate, /api/moment/picks, /api/insight, /api/blurbs,
// /api/hooks, /api/events/story). A scraper iterating novel params bills real money on every
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
    // Search box autocomplete + suggestion-detail proxies (2026-07-25 audit):
    // these used to be direct client->Google calls via the Maps JS library —
    // the one metered Places surface that bypassed this guard entirely. See
    // each route's header for the full story.
    "/api/places/autocomplete",
    "/api/places/details",
    "/api/fsq/search",
    "/api/list/generate",
    "/api/moment/picks",
    "/api/insight",
    "/api/blurbs",
    // Event detail editorial upgrade: provider-resolved evidence enters a
    // metered Anthropic call. Full same-origin + per-IP protection applies.
    "/api/events/story",
    "/api/local/report",
    // Buzz hero (v6.56): metered Anthropic proxy for the trending why-line.
    "/api/buzz/why",
    // Vision card-photo scoring: metered Anthropic proxy — same-origin guarded.
    "/api/image-score",
    // Metered proxies that shipped OPEN (audit 2026-07-23): YouTube Data API
    // (100 quota units/call — quota-DoS) and TripAdvisor Terra (metered + a
    // service-role census under ?probe). Both are same-origin XHRs → full guard.
    "/api/youtube",
    "/api/ta/place",
    // Google Places media proxy (metered on cache-miss). Loaded via <img> incl.
    // cross-origin OG/share-preview crawlers, so it's rate-limit-only (below) —
    // a same-origin 403 would break shared-link images. Still needs a matcher
    // entry to get the per-IP rate limit (the actual cost guard).
    "/api/photo",
    // Verified booking products: /api/place-products is a same-origin POST (the
    // place-card booking gate, usePlaceProduct in app/home.js) reading
    // wf_place_products via the service role. ANTI-SCRAPING — keeps the verified
    // affiliate product catalog from being harvested off-origin.
    "/api/place-products",
    "/api/hooks",
    "/api/eats/check",
    "/api/eats/go",
    "/api/viator/tours",
    // Intent-sheet curated enrichment: exact product artwork and commercial
    // metadata come from the metered Viator Partner API on cache misses.
    // Browser-only same-origin XHR, so apply the full request guard.
    "/api/viator/curated",
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
    // Place suggestions (v6.53): /api/place-suggestions is a same-origin POST
    // that writes wf_place_suggestions via the service role — the "suggest a
    // place for this list" flow in HookDetail.js. ANTI-SPAM, not a cost gate
    // (no metered upstream, just a Supabase insert) — same-origin + the per-IP
    // rate limit stop a script from queuing junk rows cross-origin; the
    // per-device daily cap in the route itself is the second layer.
    "/api/place-suggestions",
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
    // Exploding Near You reads a commercially licensed, service-role-only
    // snapshot and returns a narrow controlled view. Browser-only same-origin
    // access keeps that derived catalogue from becoming a public bulk-export
    // endpoint while the ordinary homepage request continues unchanged.
    "/api/trends/nearby",
    // Commerce redirect (#469's missing half): /api/commerce/go is the GET-302
    // every schema-approved money link resolves through. It is matched to get the
    // per-IP rate limit — it mints a click_id and reads wf_experiences via the
    // service role, so an unmetered script should not be able to spin it. It is a
    // NAVIGATION, so it is rateLimitOnly below, never same-origin blocked.
    "/api/commerce/go",
    // Social Media Find creator avatar proxy (v6.93): each cache-miss makes a
    // real outbound fetch to TikTok's profile page + CDN — not dollar-metered
    // like Google Places, but a script hammering random handles could get our
    // server IP rate-limited or blocked by TikTok, breaking the feature for
    // everyone. Loaded via <img>, same shape as /api/photo, so it joins
    // IMAGE_ROUTES below (rate-limit only, never same-origin blocked).
    "/api/creator-avatar",
  ],
};

// GET-302 navigations the browser follows in a new tab: a same-origin 403 would
// break a legitimate click-through (some browsers strip both Sec-Fetch-Site and
// Referer on a fresh nav), so these get the per-IP rate limit WITHOUT the
// same-origin block. All other matched routes get the full guard.
// /api/commerce/go added 2026-07-30. #477 matched it above and its comment states
// "It is a NAVIGATION, so it is rateLimitOnly below" — but the path was never
// added to THIS Set, so it was getting the full same-origin guard. apiGuard.js:76
// then 403s any request lacking Sec-Fetch-Site AND Referer, which is exactly what
// a top-level click-through navigation can look like. Every schema-approved money
// link resolves through this route, so the comment described the intent and the
// code did the opposite. check-clipp-deals.mjs asserts membership in this Set, not
// merely that the path appears somewhere in this file.
const NAV_302_ROUTES = new Set(["/api/eats/go", "/api/viator/go", "/api/commerce/go"]);
// Image proxies loaded via <img> — including cross-origin OG/share-preview
// crawlers (Facebook, Twitter, iMessage). A same-origin 403 would break every
// shared-link image, so keep the per-IP rate limit (the real cost guard) but
// skip the same-origin block.
const IMAGE_ROUTES = new Set(["/api/photo", "/api/creator-avatar"]);

export function middleware(req) {
  const path = req.nextUrl && req.nextUrl.pathname;
  const rateLimitOnly = NAV_302_ROUTES.has(path) || IMAGE_ROUTES.has(path);
  return guardPaidRoute(req, { rateLimitOnly }) || NextResponse.next();
}
