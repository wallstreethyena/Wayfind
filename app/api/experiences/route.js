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
  const res = await serveExperiences({
    metro: sp.get("metro") || undefined,
    city: sp.get("city") || undefined,
    lat: num("lat"), lng: num("lng"), mi: num("mi"),
    cat: sp.get("cat") || "all",
    page: num("page"), limit: num("limit"),
  });
  const cache = res.dark ? "no-store" : "public, s-maxage=300, stale-while-revalidate=1800";
  return Response.json(res, { headers: { "Cache-Control": cache } });
}
