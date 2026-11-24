// app/api/badge/[id]/route.js — the "Top rated on Wayfind" badge IMAGE that
// businesses embed on their own websites (lib/topRatedBadge.js has the rules).
//
// This URL lives inside other people's websites for years, so it must NEVER
// break: it always answers 200 with a valid SVG. A bad id, an unknown place, a
// database hiccup or a place that has since dropped below the bar all render
// a neutral "Badge unavailable" image instead of a false award or a broken
// image on someone's homepage. Eligibility is rechecked here with the SAME
// merit and indexability gate used by the owner page.
//
// Cost: never spends Google. loadPlaceNoSpend only reads our own tables and
// the existing details cache. The response is CDN cached for a day, with no
// week-long stale award window, so a busy site showing the
// badge on every page view costs us almost nothing. Deliberately NOT in the
// middleware same-origin matcher: the whole point is that other origins load it.
import { loadPlaceNoSpend, isIndexable } from "../../../../lib/placeData";
import { badgeSvg, badgeTheme, validBadgeId, badgeEligible } from "../../../../lib/topRatedBadge";

const HEADERS = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=86400",
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
  let eligible = false;
  let badgeStatus = "invalid";
  if (validBadgeId(id)) {
    try {
      const p = await loadPlaceNoSpend(id);
      badgeStatus = "unknown";
      if (p && p.name) {
        name = p.name;
        eligible = badgeEligible({ indexable: isIndexable(p), rating: p.rating, reviews: p.reviews });
        badgeStatus = eligible ? "eligible" : "ineligible";
      }
    } catch {
      badgeStatus = "error";
      console.warn("[badge] Place lookup failed; badge unavailable");
    }
  }
  return new Response(badgeSvg({ name, theme, eligible }), {
    status: 200,
    headers: {
      ...HEADERS,
      "x-wayfind-badge-status": badgeStatus,
      // A transient failure must not become a day-long cached badge state.
      ...(badgeStatus === "error" ? { "cache-control": "no-store" } : {}),
    },
  });
}
