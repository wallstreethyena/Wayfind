// app/api/badge/[id]/route.js — the "Top rated on Wayfind" badge IMAGE that
// businesses embed on their own websites (lib/topRatedBadge.js has the rules).
//
// This URL lives inside other people's websites for years, so it must NEVER
// break: it always answers 200 with a valid SVG. A bad id, an unknown place, a
// database hiccup or a place that has since dropped below the bar all render
// the plain "Top rated on Wayfind" badge (no name) instead of a broken image
// on someone's homepage. Eligibility is enforced where the embed code is
// HANDED OUT (app/badge/[id]/page.js), not here.
//
// Cost: never spends Google. loadPlaceNoSpend only reads our own tables and
// the existing details cache. The response is CDN cached for a day (and
// served stale for a week while it refreshes), so a busy site showing the
// badge on every page view costs us almost nothing. Deliberately NOT in the
// middleware same-origin matcher: the whole point is that other origins load it.
import { loadPlaceNoSpend } from "../../../../lib/placeData";
import { badgeSvg, badgeTheme, validBadgeId } from "../../../../lib/topRatedBadge";

const HEADERS = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  // An SVG opened directly in a tab is a document. It carries no script, and
  // this makes sure nothing in it could ever run or load anything.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
};

export async function GET(req, ctx) {
  const params = await ctx.params;
  const id = params && typeof params.id === "string" ? params.id : "";
  let theme = "dark";
  try { theme = badgeTheme(new URL(req.url).searchParams.get("theme")); } catch { /* keep dark */ }
  let name = "";
  if (validBadgeId(id)) {
    try {
      const p = await loadPlaceNoSpend(id);
      if (p && p.name) name = p.name;
    } catch { /* plain badge below */ }
  }
  return new Response(badgeSvg({ name, theme }), { status: 200, headers: HEADERS });
}
