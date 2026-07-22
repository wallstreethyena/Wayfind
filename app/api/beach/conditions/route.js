// app/api/beach/conditions/route.js
// Beach Intelligence — server proxy assembling live, KEYLESS marine + weather + NWS-alert
// conditions into a show/hide decision for the homepage Beach section. Same-origin XHR, so
// add "/api/beach/conditions" to the middleware matcher (anti-scrape; no metered upstream).
// Fails soft: any error → {show:false}, so the section simply hides and never errors the page.
export const runtime = "nodejs";

import { getBeachConditions, getBeachLiteConditions } from "../../../../lib/marine";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat"));
    const lng = parseFloat(searchParams.get("lng"));
    const distRaw = searchParams.get("dist"); // miles to nearest beach (geo/client supplies)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return j({ show: false });
    const dist = distRaw != null && distRaw !== "" ? parseFloat(distRaw) : null;
    // v6.54 lite mode: per-beach ranking chips — temp/waves/wind only, two
    // keyless upstreams instead of four. Same edge cache.
    if (searchParams.get("mode") === "lite") {
      const lite = await getBeachLiteConditions(lat, lng);
      return j(lite || { none: true }, 900);
    }
    const out = await getBeachConditions(lat, lng, Number.isFinite(dist) ? dist : null);
    return j(out, 900);
  } catch {
    return j({ show: false });
  }
}

function j(obj, sMax = 0) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": sMax ? `public, max-age=${sMax}, s-maxage=${sMax}` : "no-store",
    },
  });
}
