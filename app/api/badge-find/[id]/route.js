// app/api/badge-find/[id]/route.js — the "Find us on Wayfind" badge image.
//
// Unlike /api/badge (always 200), this answers only while badge_find_us is on
// and only for a place with an indexable page and a name. Otherwise 404.
// Never spends Google: loadPlaceNoSpend reads our tables and the details cache.
// Left out of the middleware same-origin matcher on purpose, same as /api/badge,
// because other sites load the image.
import { loadPlaceNoSpend, isIndexable } from "../../../../lib/placeData";
import { seoFlagOn } from "../../../../lib/seoFlags";
import { SEO_FLAGS } from "../../../../lib/seoFlagNames";
import { findUsBadgeResponse, findUsIdOk } from "../../../../lib/findUsBadge";

const HEADERS_OK = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
};

const HEADERS_MISS = {
  "content-type": "text/plain; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export async function GET(req, ctx) {
  const params = await ctx.params;
  const id = params && typeof params.id === "string" ? params.id : "";
  let theme = "dark";
  try { theme = new URL(req.url).searchParams.get("theme") || "dark"; } catch { /* keep dark */ }
  const flagOn = await seoFlagOn(SEO_FLAGS.badgeFindUs);
  let place = null;
  if (flagOn === true && findUsIdOk(id)) {
    try {
      const p = await loadPlaceNoSpend(id);
      if (p) place = { name: p.name, indexable: isIndexable(p) === true };
    } catch { /* 404 below */ }
  }
  const decision = findUsBadgeResponse({ flagOn, id, place, theme });
  if (decision.status !== 200) return new Response(decision.body, { status: decision.status, headers: HEADERS_MISS });
  return new Response(decision.body, { status: 200, headers: HEADERS_OK });
}
