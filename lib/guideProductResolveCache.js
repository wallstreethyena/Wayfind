// Guide pages are statically generated and revalidated in place. Exact product
// resolution is intentionally skipped during `next build`, then becomes eligible
// on an ISR render. Its spend grant is a current, cache: "no-store" ledger read,
// so keep the complete runtime operation inside a Data Cache boundary. This
// preserves static/ISR rendering without weakening or bypassing the spend gate.
import { unstable_cache } from "next/cache.js";
import { resolveGuideProduct } from "./guideProductResolve.js";

export const GUIDE_PRODUCT_CACHE_KEY = "guide-product-resolve-v1";
// Match the parent guide route. A provider outage, denied grant, or honest miss
// returns null from the fail-soft resolver and is reconsidered on the next ISR
// cadence rather than being retained for a day.
export const GUIDE_PRODUCT_REVALIDATE_SECONDS = 900;

export function createCachedGuideProductResolver({ cache = unstable_cache, load = resolveGuideProduct } = {}) {
  const cachedByIntent = cache(
    async (name, bookQuery, region) => load({ name, bookQuery: bookQuery || null }, region),
    [GUIDE_PRODUCT_CACHE_KEY],
    { revalidate: GUIDE_PRODUCT_REVALIDATE_SECONDS },
  );

  return (pick, region) => {
    if (!pick || !region) return null;
    const name = String(pick.name || "").trim();
    const bookQuery = String(pick.bookQuery || "").trim();
    if (!name && !bookQuery) return null;
    return cachedByIntent(name, bookQuery, String(region).trim());
  };
}

export const cachedGuideProduct = createCachedGuideProductResolver();
