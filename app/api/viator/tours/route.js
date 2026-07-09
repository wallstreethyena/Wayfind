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
  // v4.84: cap raised 6 -> 20 so the vibe rails can rank top-rated and
  // hidden-gem products client-side from a real pool, not a 6-item sliver.
  const count = Math.min(Math.max(parseInt(searchParams.get("count") || "3", 10) || 3, 1), 20);
  if (!q) return Response.json({ items: [] });

  const ck = q.toLowerCase() + "|" + count;
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
    if (!res.ok) return Response.json({ items: [] });
    const data = await res.json();
    const results = data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
    const items = results
      .filter((r) => r && r.productUrl && r.title)
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
    mem.set(ck, { items, exp: Date.now() + TTL });
    return Response.json({ items }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return Response.json({ items: [] });
  } finally {
    clearTimeout(timer);
  }
}
