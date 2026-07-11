// v5.04 — Server-side Viator exact-product resolution for SSR pages.
// The culture pages' "Book this experience" links used /api/viator/go, whose
// last-resort fallback is a Viator SEARCH page — the exact trust-breaker the
// app's detail button already eliminated. SSR pages can do better: resolve
// the product AT RENDER TIME (ISR, cached a day) and bake the direct,
// affiliate-attributed product URL into the HTML. Region validation reuses
// the same token rule as /api/viator/go (the "Explore Los Angeles" fix): a
// resolved product must mention the region in its title or URL, or it does
// not resolve — the caller then falls back to /go, never silently wrong.
import { withViatorTracking } from "./affiliates";

const getKey = () => ((process.env["VIATOR_API_KEY"] || "").trim());
const getPid = () => ((process.env["NEXT_PUBLIC_VIATOR_PID"] || "").trim());

const tokensOf = (region) => String(region || "").toLowerCase().split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.length >= 4);
const regionOk = (r, tokens) => {
  if (!tokens.length) return true;
  const hay = ((r.title || "") + " " + (r.productUrl || "")).toLowerCase().replace(/[-_]/g, " ");
  return tokens.some((t) => hay.includes(t));
};

export async function resolveViatorProduct(query, region) {
  const KEY = getKey();
  if (!KEY || !query) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const res = await fetch("https://api.viator.com/partner/search/freetext", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "exp-api-key": KEY, "Accept": "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" },
      body: JSON.stringify({ searchTerm: query, currency: "USD", searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 3 } }] }),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const results = (d && d.products && Array.isArray(d.products.results)) ? d.products.results : [];
    const tokens = tokensOf(region);
    const hit = results.find((r) => r && r.productUrl && regionOk(r, tokens));
    if (!hit) return null;
    const PID = getPid();
    // v5.40: API product URLs can already carry tracking params — the
    // shared builder sets pid/mcid/medium exactly once, never twice.
    return PID ? withViatorTracking(hit.productUrl, PID) : hit.productUrl;
  } catch (e) { return null; } finally { clearTimeout(timer); }
}
