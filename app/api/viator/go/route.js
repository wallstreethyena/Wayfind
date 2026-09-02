// v4.23 — Viator exact-product redirect. Every "Book" click routes through
// here; we resolve the query against the Viator Partner API and 302 the user
// to the exact product page with affiliate attribution.
//
// v5.52 (BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 1-3): "first region-token
// match" is replaced with the same scored resolver used by
// /api/viator/tours -- a candidate only redirects to a real product page if
// it clears the hard invariant in lib/verifiedOffers.js.
//
// 2026-08-25 integrity lock: a failed Book resolve NEVER becomes
// searchResults or the Viator homepage. Those pages are not Book. Honest
// Search Viator is an explicit intent=search from experienceGoUrl. Book
// fails closed to our own site.
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { resolveVerified } from "../../../../lib/bookingResolver.js";
import { getFanoutCount, persistOffer } from "../../../../lib/verifiedOfferStore.js";
import { captureServer, distinctIdFromCookies } from "../../../../lib/serverEvents.js";
import { commercePayload, sanitizeClientClickId } from "../../../../lib/commerce.js";
import { withViatorTracking } from "../../../../lib/affiliates.js";
import { FALLBACK } from "../../../../lib/commerceProviders.js";
import {
  chooseViatorGoLocation,
  isDeniedViatorSku,
  isViatorSearchOrHomeUrl,
} from "../../../../lib/viatorIntegrity.js";

export { sanitizeClientClickId };
import { credential } from "../../../../lib/envPlaceholder.js";

// v4.29: bracket-notation env reads inside call time. Next inlines dot-access
// process.env.NEXT_PUBLIC_* at build; bracket access forces a true runtime
// lookup, so a value present in the runtime can never be baked out as "".
const getKey = () => credential(process.env["VIATOR_API_KEY"]);
const getPid = () => credential(process.env["NEXT_PUBLIC_VIATOR_PID"]);

// Warm-instance memory cache: query -> { url, exp }. v2: the key is prefixed with
// RESOLVER_VERSION so a resolver change (like this geo-whitelist) invalidates every
// stale resolution instead of serving a 24h-old wrong product; TTL dropped to 1h.
const mem = new Map();
const RESOLVER_VERSION = "v2-geo-whitelist";
const TTL = 3600 * 1000;

function searchFallback(q) {
  const t = encodeURIComponent(q);
  const PID = getPid();
  return PID
    ? `https://www.viator.com/searchResults/all?text=${t}&pid=${encodeURIComponent(PID)}&mcid=42383&medium=link`
    : `https://www.viator.com/searchResults/all?text=${t}`;
}

// Response.redirect requires an absolute URL. Book fail-closed is our own
// origin, never a partner guess.
function siteLocation(req, location) {
  const loc = String(location || FALLBACK || "/");
  try {
    return new URL(loc, req.url).toString();
  } catch {
    return new URL("/", req.url).toString();
  }
}

// EXACT-PRODUCT PASSTHROUGH (2026-07-31).
//
// /culture/[metro] shipped its curated picks as BARE viator.com hrefs via
// viatorDirectUrl() — a live monetized link straight in the DOM, bypassing this
// route entirely. That meant no provider_redirect_started, no server-side
// record, and no way to join a click to its outcome. The same class of problem
// as the CJ deals rail: a partner URL in the DOM is also a click for every
// crawler that renders JS.
//
// Those links now come here with ?product=<exact url>. The destination is
// PRESERVED (it is the same URL the page would have linked to) and attribution
// is re-applied by the same withViatorTracking() viatorDirectUrl used.
//
// THE SECURITY PROPERTY. Accepting a destination from the request is exactly
// what lib/commerceProviders refuses to do, because it is an open redirect. The
// difference here is that the value is not trusted: it must match a viator.com
// product URL literally, or it is REFUSED and reported as
// provider_redirect_failed. Anything else — another host, a protocol-relative
// URL, a javascript: URI, a userinfo trick like https://www.viator.com@evil.tld
// — never reaches Location.
const VIATOR_PRODUCT_RE = /^https:\/\/www\.viator\.com\/[^\s"'<>\\]*$/i;

export function isValidViatorProduct(url) {
  const s = String(url || "");
  if (!s || s.length > 500) return false;
  if (!VIATOR_PRODUCT_RE.test(s)) return false;
  // Parse as a second gate: the regex proves the prefix, URL proves the HOST.
  // "https://www.viator.com@evil.tld/x" passes a naive prefix check and resolves
  // to evil.tld, because everything before @ is userinfo.
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname.toLowerCase() === "www.viator.com";
  } catch (e) { return false; }
}

function regionTokens(region) {
  return String(region || "").toLowerCase().split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.length >= 4);
}

// searchTerm: what's sent to Viator's freetext search (name + city, for
// recall). name: the bare place/query name, used to score candidates
// against (see lib/bookingResolver.js — distinctive-token extraction needs
// the name isolated from the city, not the combined search string).
async function resolveProduct(searchTerm, name, region, kind, placeId) {
  const tokens = regionTokens(region);
  const ck = RESOLVER_VERSION + "|" + searchTerm + "|" + tokens.join("+") + "|" + (kind || "");
  const hit = mem.get(ck);
  if (hit && hit.exp > Date.now()) return hit.url;
  const KEY = getKey();
  if (!KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch("https://api.viator.com/partner/search/freetext", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "exp-api-key": KEY,
        "Accept": "application/json;version=2.0",
        "Accept-Language": "en-US",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchTerm,
        currency: "USD",
        // Phase 2a: pool 3 -> 10. The geo-gated resolver (#196) only redirects to
        // a product that clears the hard invariant; with a top-3 pool the real
        // venue product for Mote/Selby/Ca' d'Zan sits below Viator's generic city
        // tours, so it never entered the candidate set and every CTA fell back to
        // search. A wider pool lets the venue product surface; the resolver still
        // default-denies, so a bigger pool can only add correct hits, never wrong ones.
        searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 10 } }],
      }),
    });
    if (!res.ok) {
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "go", q: searchTerm, tokens, upstreamStatus: res.status, decision: "upstream_error" })); } catch (e) {}
      return null;
    }
    const data = await res.json();
    const results = data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
    const candidates = results.filter((r) => r && r.productUrl && r.title
      && !isDeniedViatorSku(r.productCode || r.productUrl)
      && !isViatorSearchOrHomeUrl(r.productUrl));
    const fanoutByCode = {};
    await Promise.all(candidates.map(async (r) => {
      const key = r.productCode || r.productUrl;
      fanoutByCode[key] = await getFanoutCount("viator", r.productCode || r.productUrl);
    }));
    // v5.52 (BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 1-3): "first region-token
    // match" -> the scored resolver. A candidate only wins if it clears the
    // hard invariant in lib/verifiedOffers.js — a bare city mention is no
    // longer sufficient on its own.
    const offer = resolveVerified({ id: placeId, name }, candidates, { region, kind, fanoutByCode, placeId });
    try {
      console.log(JSON.stringify({
        tag: "booking_integrity_diag",
        route: "go", q: searchTerm, name, tokens,
        rawCount: results.length,
        candidateTitles: candidates.map((r) => r.title),
        chosenTitle: offer ? candidates.find((r) => (r.productCode || r.productUrl) === (offer.productCode || offer.productUrl))?.title : null,
        confidence: offer ? offer.confidence : null,
        decision: offer ? "redirect_to_product" : "search_fallback",
      }));
    } catch (e) {}
    if (!offer || isDeniedViatorSku(offer.productCode || offer.productUrl) || isViatorSearchOrHomeUrl(offer.productUrl)) return null;
    await persistOffer(offer);
    // productUrl from the affiliate API carries partner attribution already.
    mem.set(ck, { url: offer.productUrl, exp: Date.now() + TTL });
    return offer.productUrl;
  } catch (e) {
    try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "go", q: searchTerm, tokens, decision: "exception", error: String((e && e.message) || e).slice(0, 200) })); } catch (e2) {}
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 120);
  const city = (searchParams.get("city") || "").trim().slice(0, 60);
  const region = searchParams.get("region") || city;
  const kind = (searchParams.get("kind") || "").trim().slice(0, 40) || null;
  const placeId = (searchParams.get("placeId") || "").trim().slice(0, 200) || (q ? "q:" + q.toLowerCase() : null);
  // CONFLICT RESOLUTION (rebase onto main, 2026-07-31). Both sides were right
  // about different things; this keeps main's PUBLIC CONTRACT and the hub's
  // VALIDATION.
  //
  //   param name  -> main's `click_id`. The hub sent `cid`. The parameter is
  //                  public API: analytics, the documented contract and any
  //                  in-flight link all say click_id, and renaming it silently
  //                  orphans every join between commerce_cta_clicked and
  //                  provider_redirect_started.
  //   surface cap -> main's 60. The hub's 40 truncated longer surface names,
  //                  which silently merges two surfaces into one bucket.
  //   validation  -> the HUB's sanitizer, not main's UUID_LIKE. main only
  //                  accepted a bare UUID, so the DOCUMENTED fallback from
  //                  lib/commerce.mintClickId ("wf-<base36>-<base36>", used
  //                  whenever the browser has no crypto.randomUUID) was
  //                  rejected and silently replaced server-side — the client
  //                  event and the redirect event then carried DIFFERENT ids
  //                  and could never be joined. [A-Za-z0-9_-]{8,64} accepts a
  //                  UUID and a wf- id and still rejects anything injectable.
  const surface = (searchParams.get("surface") || "").trim().slice(0, 60) || "viator_legacy";
  const contentId = (searchParams.get("content") || "").trim().slice(0, 120) || null;
  const rawProduct = (searchParams.get("product") || "").trim();
  const clientClickId = sanitizeClientClickId(searchParams.get("click_id"));
  const clickId = clientClickId || randomUUID();
  const distinctId = distinctIdFromCookies(req.headers.get("cookie")) || clickId;

  const baseProps = {
    provider: "viator",
    offer_id: placeId || q || "unknown",
    // main's fields win: `surface` already defaults above, and content_id
    // prefers the explicit ?content= that main added for attribution.
    surface,
    content_id: contentId || q || placeId || "unknown",
    city_id: city || null,
    category: kind || null,
    click_id: clickId,
  };

  const emit = (event, extra) => {
    try {
      const props = commercePayload(event, { ...baseProps, ...(extra || {}) });
      captureServer(event, { distinctId, properties: props, headers: req.headers });
    } catch {}
  };

  const failAndRedirect = (reason, url) => {
    emit("provider_redirect_failed", { failure_reason: reason });
    return Response.redirect(url, 302);
  };

  // Diagnostic probe: booleans + upstream status only. Never echoes values.
  if (searchParams.get("probe") === "1") {
    const KEY = getKey();
    let upstream = null;
    if (KEY) {
      try {
        const r = await fetch("https://api.viator.com/partner/search/freetext", { method: "POST", headers: { "exp-api-key": KEY, "Accept": "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" }, body: JSON.stringify({ searchTerm: "orlando tour", currency: "USD", searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 1 } }] }) });
        upstream = r.status;
      } catch (e) { upstream = "network_error"; }
    }
    return Response.json({ hasKey: !!KEY, keyLooksValid: KEY.length >= 20, hasPid: !!getPid(), upstreamStatus: upstream });
  }

  const intent = (searchParams.get("intent") || "").trim();

  // EXACT PRODUCT. A curated pick already knows its destination, so there is
  // nothing to resolve: re-apply attribution and hand off — unless the SKU
  // is denylisted or the URL is a search/homepage pretending to be Book.
  if (rawProduct) {
    if (isValidViatorProduct(rawProduct)) {
      const chosen = chooseViatorGoLocation({
        rawProduct: withViatorTracking(rawProduct) || rawProduct,
        siteFallback: FALLBACK,
      });
      if (chosen.ok) {
        emit("provider_redirect_started", { offer_id: "product:" + rawProduct.slice(0, 120), resolver_path: chosen.resolver_path });
        return new Response(null, {
          status: 302,
          headers: {
            Location: chosen.location,
            "Cache-Control": "public, s-maxage=3600, max-age=0",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      emit("provider_redirect_failed", { failure_reason: chosen.reason, resolver_path: chosen.resolver_path });
      return Response.redirect(siteLocation(req, chosen.location), 302);
    }
    emit("provider_redirect_failed", { failure_reason: "invalid-product-url", resolver_path: "fail-closed" });
    return Response.redirect(siteLocation(req, FALLBACK), 302);
  }

  // Honest Search Viator (intent=search). Book never uses this rung.
  if (intent === "search") {
    const term = q
      ? (city && !q.toLowerCase().includes(city.toLowerCase()) ? `${q} ${city}` : q)
      : (city ? "things to do in " + city : "");
    const chosen = chooseViatorGoLocation({
      intent: "search",
      searchUrl: () => (term ? searchFallback(term) : null),
      siteFallback: FALLBACK,
    });
    emit(chosen.ok ? "provider_redirect_started" : "provider_redirect_failed", {
      failure_reason: chosen.ok ? undefined : chosen.reason,
      resolver_path: chosen.resolver_path,
    });
    return Response.redirect(siteLocation(req, chosen.location), 302);
  }

  // BOOK. Missing query or a failed resolve used to 302 to searchResults /
  // the Viator homepage and look like a product handoff. That is forbidden.
  if (!q) {
    const chosen = chooseViatorGoLocation({ siteFallback: FALLBACK });
    emit("provider_redirect_failed", { failure_reason: "missing-query", resolver_path: chosen.resolver_path });
    return Response.redirect(siteLocation(req, chosen.location), 302);
  }

  const term = city && !q.toLowerCase().includes(city.toLowerCase()) ? `${q} ${city}` : q;
  const resolved = await resolveProduct(term, q, region, kind, placeId);
  const chosen = chooseViatorGoLocation({
    resolvedProductUrl: resolved,
    siteFallback: FALLBACK,
  });

  emit(chosen.ok ? "provider_redirect_started" : "provider_redirect_failed", {
    failure_reason: chosen.ok ? undefined : chosen.reason,
    resolver_path: chosen.resolver_path,
  });

  const cache = chosen.ok ? "public, s-maxage=3600, max-age=0" : "public, s-maxage=60, max-age=0";
  return new Response(null, { status: 302, headers: { Location: chosen.ok ? chosen.location : siteLocation(req, chosen.location), "Cache-Control": cache, "Referrer-Policy": "no-referrer" } });
}
