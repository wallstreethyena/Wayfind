// v4.51 — Real Viator tour listings for a place. The detail page calls this
// with the place name + city and renders actual bookable products (title,
// price, rating, image) instead of a bare "search on Viator" link. Uses the
// same Basic-access freetext search as the exact-product resolver; productUrl
// from the affiliate API carries partner attribution already. Falls back to
// an empty list on any failure, so the page never breaks on this module.
export const runtime = "nodejs";

const getKey = () => ((process.env["VIATOR_API_KEY"] || "").trim());

// Warm-instance memory cache: query -> { items, exp }
const mem = new Map();
const TTL = 6 * 3600 * 1000;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 120);
  // v4.94: optional region tokens — when a place's tour list is fetched, only
  // products whose title/URL mention the user's city or metro survive, so a
  // Florida place can never show Los Angeles tours. The vibe rails query by
  // metro name and pass no region (the query itself is the region).
  const regionTokens = String(searchParams.get("region") || "").toLowerCase().split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.length >= 4);
  // v4.84: cap raised 6 -> 20 so the vibe rails can rank top-rated and
  // hidden-gem products client-side from a real pool, not a 6-item sliver.
  const count = Math.min(Math.max(parseInt(searchParams.get("count") || "3", 10) || 3, 1), 20);
  if (!q) return Response.json({ items: [] });

  const ck = q.toLowerCase() + "|" + count + "|" + regionTokens.join("+");
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
        searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count } }],
      }),
    });
    if (!res.ok) {
      // TEMP (BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 0): log upstream failures
      // too — a 401/429/5xx here silently degrades to "no tours" today, which
      // looks identical to "genuinely no product exists" from the outside.
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", q, regionTokens, upstreamStatus: res.status, decision: "upstream_error" })); } catch (e) {}
      return Response.json({ items: [] });
    }
    const data = await res.json();
    const results = data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
    const regionFiltered = results.filter((r) => r && r.productUrl && r.title);
    const rejectedByRegion = regionTokens.length ? regionFiltered.filter((r) => { const hay = (r.title + " " + r.productUrl).toLowerCase().replace(/[-_]/g, " "); return !regionTokens.some((t) => hay.includes(t)); }) : [];
    const items = regionFiltered
      .filter((r) => { if (!regionTokens.length) return true; const hay = (r.title + " " + r.productUrl).toLowerCase().replace(/[-_]/g, " "); return regionTokens.some((t) => hay.includes(t)); })
      .map((r) => ({
        code: r.productCode || "",
        title: String(r.title).slice(0, 140),
        url: r.productUrl,
        image: (() => { try { const v = r.images && r.images[0] && r.images[0].variants; if (!Array.isArray(v) || !v.length) return null; const pick = v.find((x) => x && x.width >= 300 && x.width <= 600) || v[Math.min(2, v.length - 1)]; return pick && pick.url ? pick.url : null; } catch { return null; } })(),
        rating: r.reviews && typeof r.reviews.combinedAverageRating === "number" ? Math.round(r.reviews.combinedAverageRating * 10) / 10 : null,
        reviews: r.reviews && typeof r.reviews.totalReviews === "number" ? r.reviews.totalReviews : null,
        fromPrice: (() => { try { const p = r.pricing && r.pricing.summary && r.pricing.summary.fromPrice; return typeof p === "number" ? Math.round(p) : null; } catch { return null; } })(),
        duration: (() => { try { const d = r.duration && (r.duration.fixedDurationInMinutes || r.duration.variableDurationToMinutes); if (!d) return null; return d >= 60 ? Math.round(d / 60) + "h" : d + "m"; } catch { return null; } })(),
      }));
    // TEMP (BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 0): one structured line per
    // query so we can measure, from real Vercel function logs, how often a
    // "kept" product is actually specific to the place vs. just a
    // region-name substring match (the Bradenton Riverwalk failure mode) and
    // how often the same product wins for many different queries (fan-out /
    // genericness). No per-item confidence score exists yet — that's exactly
    // the gap this diagnosis is measuring. Remove once Phase 1+ lands.
    try {
      console.log(JSON.stringify({
        tag: "booking_integrity_diag",
        q, regionTokens,
        rawCount: results.length,
        keptTitles: items.map((x) => x.title),
        keptCodes: items.map((x) => x.code),
        rejectedByRegionTitles: rejectedByRegion.map((x) => x.title),
        decision: items.length > 0 ? "cta_would_render" : "no_cta",
      }));
    } catch (e) {}
    mem.set(ck, { items, exp: Date.now() + TTL });
    return Response.json({ items }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    try { console.log(JSON.stringify({ tag: "booking_integrity_diag", q, regionTokens, decision: "exception", error: String((e && e.message) || e).slice(0, 200) })); } catch (e2) {}
    return Response.json({ items: [] });
  } finally {
    clearTimeout(timer);
  }
}
