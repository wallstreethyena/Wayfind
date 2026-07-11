// v4.23 — Viator exact-product redirect. Every "Book" click routes through
// here; we resolve the query against the Viator Partner API and 302 the user
// to the exact product page with affiliate attribution. If the API key is
// missing or the lookup fails for any reason, we fall back to the tracked
// search URL, so this can never be worse than the old behavior.
export const runtime = "nodejs";

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

// v4.94 — GEOGRAPHIC VALIDATION (the "Explore Los Angeles" fix). Freetext
// search is keyword-based: a Florida fossil attraction resolved to an LA tour
// literally named "The Fast & The Fossilized". A resolved product now must
// match the user's region tokens (city + metro words, e.g. "ruskin,tampa
// bay") in its title or destination URL; no match → the tracked SEARCH page,
// which shows honest options instead of teleporting the user to LA.
function regionOk(r, tokens) {
  if (!tokens.length) return true;
  const hay = ((r.title || "") + " " + (r.productUrl || "")).toLowerCase().replace(/[-_]/g, " ");
  return tokens.some((t) => hay.includes(t));
}
function regionTokens(region) {
  return String(region || "").toLowerCase().split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.length >= 4);
}
async function resolveProduct(q, tokens) {
  const hit = mem.get(q + "|" + tokens.join("+"));
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
        searchTerm: q,
        currency: "USD",
        searchTypes: [{ searchType: "PRODUCTS", pagination: { start: 1, count: 3 } }],
      }),
    });
    if (!res.ok) {
      try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "go", q, tokens, upstreamStatus: res.status, decision: "upstream_error" })); } catch (e) {}
      return null;
    }
    const data = await res.json();
    const results = data && data.products && Array.isArray(data.products.results) ? data.products.results : [];
    const best = results.find((r) => r && r.productUrl && regionOk(r, tokens));
    // TEMP (BOOKING_INTEGRITY_DIAGNOSIS.md, Phase 0): this picks the FIRST
    // region-token match with zero geo/entity/specificity scoring — logging
    // every candidate + the one chosen so we can see how often "best" is
    // actually a generic area product rather than the named place.
    try {
      console.log(JSON.stringify({
        tag: "booking_integrity_diag",
        route: "go", q, tokens,
        rawCount: results.length,
        candidateTitles: results.filter((r) => r && r.productUrl).map((r) => r.title),
        chosenTitle: best ? best.title : null,
        decision: best ? "redirect_to_product" : "search_fallback",
      }));
    } catch (e) {}
    if (!best) return null;
    // productUrl from the affiliate API carries partner attribution already.
    mem.set(q + "|" + tokens.join("+"), { url: best.productUrl, exp: Date.now() + TTL });
    return best.productUrl;
  } catch (e) {
    try { console.log(JSON.stringify({ tag: "booking_integrity_diag", route: "go", q, tokens, decision: "exception", error: String((e && e.message) || e).slice(0, 200) })); } catch (e2) {}
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
  const tokens = regionTokens(searchParams.get("region") || city);
  const url = (await resolveProduct(term, tokens)) || searchFallback(term);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // Edge-cache the redirect a day per unique query; browsers don't cache it.
      "Cache-Control": "public, s-maxage=86400, max-age=0",
    },
  });
}
