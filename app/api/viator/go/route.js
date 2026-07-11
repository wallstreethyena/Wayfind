// v4.23 — Viator exact-product redirect. Every "Book" click routes through
// here; we resolve the query against the Viator Partner API and 302 the user
// to the exact product page with affiliate attribution. If the API key is
// missing or the lookup fails for any reason, we fall back to the tracked
// search URL, so this can never be worse than the old behavior.
//
// v5.52 (BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 1-3): "first region-token
// match" is replaced with the same scored resolver used by
// /api/viator/tours -- a candidate only redirects to a real product page if
// it clears the hard invariant in lib/verifiedOffers.js. Anything that
// doesn't falls back to the tracked search page (unchanged, and still
// honest about not knowing rather than teleporting to a wrong product).
export const runtime = "nodejs";

import { resolveVerified } from "../../../../lib/bookingResolver.js";
import { getFanoutCount, persistOffer } from "../../../../lib/verifiedOfferStore.js";

// v4.29: bracket-notation env reads inside call time. Next inlines dot-access
// process.env.NEXT_PUBLIC_* at build; bracket access forces a true runtime
// lookup, so a value present in the runtime can never be baked out as "".
const getKey = () => ((process.env["VIATOR_API_KEY"] || "").trim());
const getPid = () => ((process.env["NEXT_PUBLIC_VIATOR_PID"] || "").trim());

// Warm-instance memory cache: query -> { url, exp }
const mem = new Map();
const TTL = 24 * 3600 * 1000;

function searchFallback(q) {
  const t = encodeURIComponent(q);
  const PID = getPid();
  return PID
    ? `https://www.viator.com/searchResults/all?text=${t}&pid=${encodeURIComponent(PID)}&mcid=42383&medium=link`
    : `https://www.viator.com/searchResults/all?text=${t}`;
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
  const ck = searchTerm + "|" + tokens.join("+") + "|" + (kind || "");
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
        searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 3 } }],
      }),
    });
    if (!res.ok) {
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "go", q: searchTerm, tokens, upstreamStatus: res.status, decision: "upstream_error" })); } catch (e) {}
      return null;
    }
    const data = await res.json();
    const results = data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
    const candidates = results.filter((r) => r && r.productUrl && r.title);
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
    if (!offer) return null;
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
  const q = (searchParams.get("q") || "").trim().slice(0, 120);
  const city = (searchParams.get("city") || "").trim().slice(0, 60);
  if (!q) return Response.redirect("https://www.viator.com", 302);
  const term = city && !q.toLowerCase().includes(city.toLowerCase()) ? `${q} ${city}` : q;
  const region = searchParams.get("region") || city;
  const kind = (searchParams.get("kind") || "").trim().slice(0, 40) || null;
  const placeId = (searchParams.get("placeId") || "").trim().slice(0, 200) || ("q:" + q.toLowerCase());
  const url = (await resolveProduct(term, q, region, kind, placeId)) || searchFallback(term);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // Edge-cache the redirect a day per unique query; browsers don't cache it.
      "Cache-Control": "public, s-maxage=86400, max-age=0",
    },
  });
}
