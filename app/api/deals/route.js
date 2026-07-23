// app/api/deals/route.js — serves ranked wf_deals for a category to the client
// deal rails (UTDealsRail), mirroring /api/experiences. Service-role read via
// serveDeals(); same-origin guarded in middleware.js (anti-scraping). Fail-soft:
// { dark:true } never a 500. The wf_deals_ranked view already applies the quality
// gate + the 3h link guardian, so the rows are safe to render verbatim.
import { serveDeals } from "../../../lib/dealsData.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const category = new URL(req.url).searchParams.get("category") || "";
  const out = await serveDeals(category);
  return Response.json(out, {
    headers: { "Cache-Control": out.dark ? "no-store" : "public, s-maxage=300, stale-while-revalidate=1800" },
  });
}
