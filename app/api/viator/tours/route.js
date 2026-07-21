// v4.51 — Real Viator tour listings for a place. The detail page calls this
// with the place name + city and renders actual bookable products (title,
// price, rating, image) instead of a bare "search on Viator" link. Uses the
// same Basic-access freetext search as the exact-product resolver; productUrl
// from the affiliate API carries partner attribution already. Falls back to
// an empty list on any failure, so the page never breaks on this module.
//
// v5.52 (BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 1-3): the old gate here was a
// bare city-name substring match, which let any Viator product that merely
// mentioned the region render as a definitive, place-specific booking CTA
// (the "Bradenton Riverwalk -> generic tour" failure). Every candidate is
// now scored by lib/bookingResolver.js and must individually clear the hard
// invariant in lib/verifiedOffers.js -- no proof, no card. Default-deny:
// this route can return FEWER (or zero) items than before for the same
// query; it will never again return a loosely-related one.
export const runtime = "nodejs";

import { resolveVerifiedMany } from "../../../../lib/bookingResolver.js";
import { getFanoutCount, persistOffer } from "../../../../lib/verifiedOfferStore.js";

const getKey = () => ((process.env["VIATOR_API_KEY"] || "").trim());

// Warm-instance memory cache: query -> { items, exp }
const mem = new Map();
const TTL = 6 * 3600 * 1000;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 120);
  // v5.52: the place's own name, separate from the city-appended search
  // query above -- the resolver needs this to know which tokens are
  // "distinctive to the place" vs. just the region. Falls back to q for
  // any caller that hasn't been updated yet, so this ships without a
  // required client change.
  const name = (searchParams.get("name") || q).trim().slice(0, 120);
  const kind = (searchParams.get("kind") || "").trim().slice(0, 40) || null;
  const placeId = (searchParams.get("placeId") || "").trim().slice(0, 200) || ("q:" + name.toLowerCase());
  // v4.94/v5.83: the place's region (city + metro) is passed to the resolver,
  // which (a) excludes region tokens from the place's "distinctive" name tokens
  // and (b) applies the region gate in lib/bookingResolver.js — a product whose
  // title names a foreign destination absent from this region is hard-rejected,
  // so a Siesta Key place can never show a Key West tour. The vibe rails query by
  // metro name and pass no region (the query itself is the region).
  const region = (searchParams.get("region") || "").trim();
  const regionTokens = region.toLowerCase().split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.length >= 4);
  // v4.84: cap raised 6 -> 20 so the vibe rails can rank top-rated and
  // hidden-gem products client-side from a real pool, not a 6-item sliver.
  // v6.44 (owner): the Events tab wants the FULL local inventory, not a
  // 20-item sliver. City mode may request up to 60 (paginated upstream);
  // per-place resolution keeps the old 20 ceiling.
  const modePeek = (searchParams.get("mode") || "").trim();
  const count = Math.min(Math.max(parseInt(searchParams.get("count") || "3", 10) || 3, 1), modePeek === "city" ? 60 : 20);
  // v6.34 — CITY MODE for the rails. The old rails passed no region at all and
  // trusted freetext relevance ("the query itself is the region") — Viator's
  // freetext returned Hanoi/Naxos/Antigua products into a Florida feed. City
  // mode verifies by the market's Viator destination id (lib/destinations)
  // and/or region tokens instead of the per-place entity resolver (whose
  // entity floor rejects city-generic queries by design).
  const mode = (searchParams.get("mode") || "").trim();
  const destId = (searchParams.get("destId") || "").trim().replace(/^d/i, "");
  if (!q) return Response.json({ items: [] });

  const ck = q.toLowerCase() + "|" + name.toLowerCase() + "|" + (kind || "") + "|" + count + "|" + regionTokens.join("+") + "|" + mode + "|" + destId;
  const hit = mem.get(ck);
  if (hit && hit.exp > Date.now()) {
    return Response.json({ items: hit.items }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  }

  const KEY = getKey();
  if (!KEY) return Response.json({ items: [] });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
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
        searchTerm: q,
        currency: "USD",
        // Phase 2a: decouple the SEARCH fanout from the DISPLAY count. Fetch at
        // least 10 candidates so a real venue product below Viator's generic
        // city tours can still be resolved; the display slice below stays
        // verified.slice(0, count) so the caller's requested count is unchanged.
        searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: Math.min(Math.max(count, 10), 50) } }],
      }),
    });
    if (!res.ok) {
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", q, name, regionTokens, upstreamStatus: res.status, decision: "upstream_error" })); } catch (e) {}
      return Response.json({ items: [] });
    }
    const data = await res.json();
    let results = data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
    // v6.44: freetext pages cap at 50 — when the caller wants more (city mode
    // 60), pull one follow-up page. Fail-soft: a bad second page just means
    // fewer items, never an error.
    if (count > 50 && results.length === 50) {
      try {
        const res2 = await fetch("https://api.viator.com/partner/search/freetext", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "exp-api-key": KEY, "Accept": "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" },
          body: JSON.stringify({ searchTerm: q, currency: "USD", searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 51, count: 50 } }] }),
        });
        if (res2.ok) {
          const d2 = await res2.json();
          const more = d2 && d2.products && Array.isArray(d2.products.results) ? d2.products.results : [];
          const seen = new Set(results.map((r) => r && (r.productCode || r.productUrl)));
          results = results.concat(more.filter((r) => r && !seen.has(r.productCode || r.productUrl)));
        }
      } catch (e) {}
    }
    const candidates = results.filter((r) => r && r.productUrl && r.title);

    // Per-candidate fan-out: how many OTHER distinct places has each product
    // already matched? A generic bundled tour that wins for many queries
    // must not borrow eligibility from a place-specific product sitting
    // next to it in the same result set (see lib/bookingResolver.js).
    const fanoutByCode = {};
    await Promise.all(candidates.map(async (r) => {
      const key = r.productCode || r.productUrl;
      fanoutByCode[key] = await getFanoutCount("viator", r.productCode || r.productUrl);
    }));

    const verified = mode === "city"
      ? candidates.filter((r) => {
          // A product survives city mode only on POSITIVE regional evidence:
          // its Viator destination refs include the market's verified id, or
          // its title names the region. No evidence -> not in the feed.
          const title = String(r.title || "").toLowerCase();
          const destOk = !!destId && Array.isArray(r.destinations) && r.destinations.some((d) => d && String(d.ref || d.destinationId || "").replace(/^d/i, "").toLowerCase() === destId.toLowerCase());
          const nameOk = regionTokens.length > 0 && regionTokens.some((t) => title.includes(t));
          return destOk || nameOk;
        })
      : resolveVerifiedMany({ id: placeId, name }, candidates, { region, kind, fanoutByCode, placeId });
    const byCode = {};
    for (const r of candidates) byCode[r.productCode || r.productUrl] = r;

    const items = verified.slice(0, count).map((offer) => {
      const r = byCode[offer.productCode || offer.productUrl] || {};
      return {
        code: offer.productCode || "",
        title: String(r.title || "").slice(0, 140),
        url: offer.productUrl,
        image: (() => { try { const v = r.images && r.images[0] && r.images[0].variants; if (!Array.isArray(v) || !v.length) return null; const pick = v.find((x) => x && x.width >= 300 && x.width <= 600) || v[Math.min(2, v.length - 1)]; return pick && pick.url ? pick.url : null; } catch { return null; } })(),
        rating: r.reviews && typeof r.reviews.combinedAverageRating === "number" ? Math.round(r.reviews.combinedAverageRating * 10) / 10 : null,
        reviews: r.reviews && typeof r.reviews.totalReviews === "number" ? r.reviews.totalReviews : null,
        fromPrice: (() => { try { const p = r.pricing && r.pricing.summary && r.pricing.summary.fromPrice; return typeof p === "number" ? Math.round(p) : null; } catch { return null; } })(),
        duration: (() => { try { const d = r.duration && (r.duration.fixedDurationInMinutes || r.duration.variableDurationToMinutes); if (!d) return null; return d >= 60 ? Math.round(d / 60) + "h" : d + "m"; } catch { return null; } })(),
        // v6.44: Viator's OWN demand flag, passed through verbatim — the
        // "Selling fast" badge and sort boost ride ONLY on this. We never
        // compute or guess demand (ticket demand is on the no-source list).
        sellingFast: Array.isArray(r.flags) && r.flags.includes("LIKELY_TO_SELL_OUT"),
        confidence: offer.confidence,
      };
    });

    // Persist every verified (live) offer -- feeds fan-out scoring for
    // future queries and gives Phase 5 a durable record of what actually
    // rendered. Best-effort: persistOffer no-ops without a service key.
    await Promise.all(verified.map((offer) => persistOffer(offer)));

    try {
      console.log(JSON.stringify({
        tag: "booking_integrity_diag",
        q, name, regionTokens,
        rawCount: results.length,
        candidateTitles: candidates.map((x) => x.title),
        keptTitles: items.map((x) => x.title),
        keptCodes: items.map((x) => x.code),
        confidences: verified.map((o) => o.confidence),
        decision: items.length > 0 ? "cta_would_render" : "no_cta",
      }));
    } catch (e) {}
    mem.set(ck, { items, exp: Date.now() + TTL });
    return Response.json({ items }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    try { console.log(JSON.stringify({ tag: "booking_integrity_diag", q, name, regionTokens, decision: "exception", error: String((e && e.message) || e).slice(0, 200) })); } catch (e2) {}
    return Response.json({ items: [] });
  } finally {
    clearTimeout(timer);
  }
}
