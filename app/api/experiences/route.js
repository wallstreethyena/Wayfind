// app/api/experiences/route.js — client-facing read of the cached Viator
// experiences (wf_experiences). Same-origin guarded (see middleware.js) purely
// as ANTI-SCRAPING — this is a Supabase read, NOT a metered upstream, so there
// is no per-call cost; the guard just keeps the rail from being harvested off
// our origin. Fail-soft: returns { dark: true } (never 500) until the migration
// + cron have populated the table.
import { serveExperiences } from "../../../lib/experiencesServe.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const num = (k) => { const v = parseFloat(sp.get(k)); return Number.isFinite(v) ? v : undefined; };
  const browseCat = sp.get("browseCat") || undefined;
  const browseSub = sp.get("browseSub") || undefined;
  let res;
  try {
    res = await serveExperiences({
      metro: sp.get("metro") || undefined,
      city: sp.get("city") || undefined,
      lat: num("lat"), lng: num("lng"), mi: num("mi"),
      cat: sp.get("cat") || "all", browseCat, browseSub,
      page: num("page"), limit: num("limit"),
    });
  } catch (e) {
    // Only the new complete browse read throws. Its failure must be visibly
    // unavailable, never cached or confused with a real market containing 0.
    if (browseCat || browseSub) {
      const message = String(e && e.message);
      const reason = /ceiling/i.test(message) ? "browse-read-incomplete"
        : /deadline|abort/i.test(message) ? "browse-read-timeout" : "browse-read-error";
      return Response.json({ dark: true, unavailable: true, reason, items: [], total: 0, chipCounts: {}, markets: [] }, {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }
    throw e;
  }
  const cache = res.dark ? "no-store" : "public, s-maxage=300, stale-while-revalidate=1800";
  return Response.json(res, { headers: { "Cache-Control": cache } });
}
