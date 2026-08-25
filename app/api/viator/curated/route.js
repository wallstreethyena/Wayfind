// Enrich the exact Viator products selected by Wayfind's city+intent catalogue.
// Fast path: the verified wf_experiences cache. Fallback: Viator's official
// single-product endpoint. The response contains presentation data only—never
// a raw partner URL—so booking still goes through /api/commerce/go.
export const runtime = "nodejs";

import { intentPartnerPicks } from "../../../../lib/intentPartnerPicks.js";
import { sbEnv } from "../../../../lib/serverCache.js";
import { cachedExperienceCard, viatorProductCard } from "../../../../lib/viatorProductCard.js";
import { isDeniedViatorSku } from "../../../../lib/viatorIntegrity.js";

const TTL = 6 * 3600 * 1000;
const mem = new Map();
const getKey = () => String(process.env.VIATOR_API_KEY || "").trim();

async function cachedCards(codes) {
  const s = sbEnv();
  if (!s || !codes.length) return [];
  try {
    const values = codes.map((code) => `"${code.replace(/["\\]/g, "")}"`).join(",");
    const url = `${s.url}/rest/v1/wf_experiences?select=product_code,title,image,rating,reviews,from_price,duration_min&product_code=in.(${encodeURIComponent(values)})`;
    const res = await fetch(url, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map(cachedExperienceCard).filter(Boolean);
  } catch {
    return [];
  }
}

async function liveCard(code, key) {
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(`https://api.viator.com/partner/products/${encodeURIComponent(code)}`, {
      signal: controller.signal,
      headers: {
        "exp-api-key": key,
        Accept: "application/json;version=2.0",
        "Accept-Language": "en-US",
      },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const card = viatorProductCard(await res.json());
    return card && card.code === code ? card : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const city = String(sp.get("city") || "").trim().slice(0, 80);
  const intent = String(sp.get("intent") || "").trim().slice(0, 40);
  const codes = intentPartnerPicks(city, intent)
    .filter((pick) => pick.provider === "viator" && /^\d+P\d+$/i.test(pick.offerId) && !isDeniedViatorSku(pick.offerId))
    .map((pick) => pick.offerId)
    .slice(0, 8);
  if (!codes.length) return Response.json({ items: [] });

  const cacheKey = codes.join(",");
  const hit = mem.get(cacheKey);
  if (hit && hit.exp > Date.now()) {
    return Response.json({ items: hit.items }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  }

  const cached = await cachedCards(codes);
  const byCode = new Map(cached.map((card) => [card.code, card]));
  const missing = codes.filter((code) => !byCode.get(code)?.image);
  const live = await Promise.all(missing.map((code) => liveCard(code, getKey())));
  for (const card of live) if (card) byCode.set(card.code, { ...(byCode.get(card.code) || {}), ...card });
  const items = codes.map((code) => byCode.get(code)).filter(Boolean);
  mem.set(cacheKey, { items, exp: Date.now() + TTL });
  return Response.json({ items }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
