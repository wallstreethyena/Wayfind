// v4.23 — Viator exact-product redirect. Every "Book" click routes through
// here; we resolve the query against the Viator Partner API and 302 the user
// to the exact product page with affiliate attribution. If the API key is
// missing or the lookup fails for any reason, we fall back to the tracked
// search URL, so this can never be worse than the old behavior.
export const runtime = "nodejs";

const KEY = (process.env.VIATOR_API_KEY || "").trim();
const PID = (process.env.NEXT_PUBLIC_VIATOR_PID || "").trim();

// Warm-instance memory cache: query -> { url, exp }
const mem = new Map();
const TTL = 24 * 3600 * 1000;

function searchFallback(q) {
  const t = encodeURIComponent(q);
  return PID
    ? `https://www.viator.com/searchResults/all?text=${t}&pid=${encodeURIComponent(PID)}&mcid=42383&medium=link`
    : `https://www.viator.com/searchResults/all?text=${t}`;
}

async function resolveProduct(q) {
  const hit = mem.get(q);
  if (hit && hit.exp > Date.now()) return hit.url;
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
        searchTerm: q,
        currency: "USD",
        searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 3 } }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
    const best = results.find((r) => r && r.productUrl);
    if (!best) return null;
    // productUrl from the affiliate API carries partner attribution already.
    mem.set(q, { url: best.productUrl, exp: Date.now() + TTL });
    return best.productUrl;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 120);
  const city = (searchParams.get("city") || "").trim().slice(0, 60);
  if (!q) return Response.redirect("https://www.viator.com", 302);
  const term = city && !q.toLowerCase().includes(city.toLowerCase()) ? `${q} ${city}` : q;
  const url = (await resolveProduct(term)) || searchFallback(term);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // Edge-cache the redirect a day per unique query; browsers don't cache it.
      "Cache-Control": "public, s-maxage=86400, max-age=0",
    },
  });
}
