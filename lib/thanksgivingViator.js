// User-requested, bounded Viator search. Search summaries are kept for less
// than one hour in warm memory only, never ingested or served stale.
import { milesBetween } from "./experiencesData.js";
import { viatorImage } from "./viatorProductCard.js";
import { normalizeProductCode } from "./viatorDenylist.js";
import { credential } from "./envPlaceholder.js";
import { safeUrl } from "./links.js";
import {
  VIATOR_CITY_MARKETS as THANKSGIVING_VIATOR_MARKETS,
  viatorProductArea as thanksgivingProductArea,
  viatorProductBelongs as thanksgivingProductBelongs,
} from "./viatorMarketArea.js";

export { THANKSGIVING_VIATOR_MARKETS, thanksgivingProductArea, thanksgivingProductBelongs };
export const THANKSGIVING_VIATOR_TTL_MS = 60 * 60 * 1000;
export function thanksgivingViatorMarkets(query) {
  return THANKSGIVING_VIATOR_MARKETS
    .filter((m) => milesBetween(query, m) <= query.radiusMi)
    .sort((a, b) => milesBetween(query, a) - milesBetween(query, b))
    .slice(0, 2);
}
function summaryRow(product, market, observed, query) {
  const minutes = product.duration?.fixedDurationInMinutes || product.duration?.variableDurationToMinutes;
  const area = thanksgivingProductArea(product, market, query);
  return {
    product_code: normalizeProductCode(product.productCode), provider: "viator", dest_id: market.destId,
    city: market.city, title: String(product.title).trim(), product_url: safeUrl(product.productUrl),
    area_city: area.city, location_label: area.label, area_distance_mi: area.distanceMi,
    image: viatorImage(product), rating: product.reviews?.combinedAverageRating ?? null,
    reviews: product.reviews?.totalReviews ?? null, from_price: product.pricing?.summary?.fromPrice ?? null,
    duration_min: Number.isFinite(Number(minutes)) && Number(minutes) > 0 ? Number(minutes) : null,
    categories: [], metadata_source: "viator_live_search", summary_observed_at: new Date(observed).toISOString(),
    // Search response does not prove holiday date inventory or exact meeting point.
    market_verified: true,
  };
}

/** Dependencies are injected for no-network tests. Production uses the existing
 * atomic finite ledger immediately before each of at most two provider calls. */
export function createThanksgivingViatorReader(dependencies = {}) {
  const memory = new Map(), inflight = new Map();
  const clock = dependencies.clock || Date.now;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const getKey = dependencies.getKey || (() => credential(process.env.VIATOR_API_KEY));
  const allow = dependencies.allow || (async () => (await import("./providerSpend.js")).providerSpendDecision("viator"));
  const maxEntries = Math.min(64, Math.max(1, dependencies.maxEntries || 32));
  async function joinBeforeDeadline(pending, requestDeadline) {
    const remaining = requestDeadline - clock();
    if (remaining <= 0) return { products: [], error: "timeout" };
    let timer;
    try {
      // Each caller owns its wait deadline. Timing out a short join must not
      // abort another caller's valid shared fetch or prevent it warming cache.
      return await Promise.race([pending, new Promise((resolve) => { timer = setTimeout(() => resolve({ products: [], error: "timeout" }), remaining); })]);
    } finally { clearTimeout(timer); }
  }
  async function readMarket(market, requestDeadline) {
    const key = `${market.destId}|en-US|USD`;
    const stamp = clock(), hit = memory.get(key);
    if (hit && stamp < hit.expires && stamp >= hit.observed) {
      memory.delete(key); memory.set(key, hit);
      return { ...hit, cached: true };
    }
    memory.delete(key);
    if (inflight.has(key)) return joinBeforeDeadline(inflight.get(key), requestDeadline);
    const pending = (async () => {
      const apiKey = getKey();
      if (!apiKey) return { products: [], error: "no_key" };
      const remaining = Math.min(4500, requestDeadline - clock());
      if (remaining <= 0) return { products: [], error: "timeout" };
      const controller = new AbortController();
      let timer;
      try {
        const operation = async () => {
          const decision = await allow();
          if (decision !== true && !decision?.allow) return { products: [], error: decision?.reason || "ledger_denied" };
          if (controller.signal.aborted || clock() >= requestDeadline) return { products: [], error: "timeout" };
          const response = await fetchImpl("https://api.viator.com/partner/products/search", {
            method: "POST", signal: controller.signal, cache: "no-store",
            headers: { "exp-api-key": apiKey, Accept: "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" },
            body: JSON.stringify({ filtering: { destination: market.destId }, sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" }, pagination: { start: 1, count: 50 }, currency: "USD" }),
          });
          if (!response.ok) return { products: [], error: response.status === 429 ? "rate_limited" : "upstream_error" };
          const body = await response.json();
          if (!Array.isArray(body.products) || body.products.length > 50) return { products: [], error: "invalid_response" };
          const observed = clock();
          return { products: body.products, observed, expires: observed + THANKSGIVING_VIATOR_TTL_MS, total: Number.isFinite(body.totalCount) ? body.totalCount : null };
        };
        const result = await Promise.race([operation(), new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve({ products: [], error: "timeout" }); }, remaining); })]);
        if (!result.error) {
          memory.set(key, result);
          while (memory.size > maxEntries) memory.delete(memory.keys().next().value);
        }
        return result;
      } catch (error) { return { products: [], error: error?.name === "AbortError" ? "timeout" : "upstream_error" }; }
      finally { clearTimeout(timer); }
    })();
    inflight.set(key, pending);
    try { return await pending; } finally { inflight.delete(key); }
  }
  return async function readCurrentThanksgivingExperiences(query, _candidates = [], options = {}) {
    const markets = thanksgivingViatorMarkets(query);
    if (!markets.length) return { rows: [], sourceStatus: { status: "ready", limited: true, reason: "no-nearby-market", markets: [] } };
    const deadline = options.deadline || clock() + 5000;
    const reads = await Promise.all(markets.map((market) => readMarket(market, deadline)));
    const byCode = new Map();
    const failures = [];
    const expiries = [];
    let searched = 0;
    reads.forEach((result, index) => {
      const market = markets[index];
      if (result.error) { failures.push({ city: market.city, reason: result.error }); return; }
      expiries.push(result.expires);
      searched += result.products.length;
      for (const product of result.products) if (thanksgivingProductBelongs(product, market, query)) {
        const row = summaryRow(product, market, result.observed, query);
        if (!byCode.has(row.product_code)) byCode.set(row.product_code, row);
      }
    });
    return {
      rows: [...byCode.values()], sourceStatus: {
        status: failures.length === markets.length ? "unavailable" : "partial",
        reason: failures.length ? "some-searches-unavailable" : "bounded-search", limited: true,
        markets: markets.map((m) => m.city), searched, failures,
        ...(expiries.length ? { expiresAt: new Date(Math.min(...expiries)).toISOString() } : {}),
      },
    };
  };
}

export const readCurrentThanksgivingExperiences = createThanksgivingViatorReader();
