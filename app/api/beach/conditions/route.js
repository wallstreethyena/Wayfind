// app/api/beach/conditions/route.js
// Beach Intelligence — server proxy assembling live, KEYLESS marine + weather + NWS-alert
// conditions into a show/hide decision for the homepage Beach section. Same-origin XHR, so
// add "/api/beach/conditions" to the middleware matcher (anti-scrape; no metered upstream).
// Fails soft: any error → {show:false}, so the section simply hides and never errors the page.
export const runtime = "nodejs";

import { getBeachConditions, getBeachLiteConditions } from "../../../../lib/marine";
import { getRedTide } from "../../../../lib/redTide";
import { nearestWater } from "../../../../lib/waterStations";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat"));
    const lng = parseFloat(searchParams.get("lng"));
    const distRaw = searchParams.get("dist"); // miles to nearest beach (geo/client supplies)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return j({ show: false }, 900);
    const dist = distRaw != null && distRaw !== "" ? parseFloat(distRaw) : null;
    // v6.54 lite mode: per-beach ranking chips — temp/waves/wind only, two
    // keyless upstreams instead of four. Same edge cache.
    if (searchParams.get("mode") === "lite") {
      // v6.55: FWC red tide rides along (keyless, 6h-revalidated upstream).
      // null = no sample within the cap → the chip simply doesn't render.
      const placeId = String(searchParams.get("place_id") || "").trim();
      const [lite, redTide, water] = await Promise.all([
        getBeachLiteConditions(lat, lng),
        getRedTide(lat, lng),
        // v8.19 — exact place_id row first, else the NEAREST sampled station
        // within 1.5mi (wf_beach_water_geo). One physical beach carries many
        // Google place_ids; an id-only join left most beach cards waterless
        // (the owner's fifth report). See lib/waterStations.js.
        beachWaterFor(placeId, lat, lng),
      ]);
      return j({ ...(lite || { none: true }), redTide: redTide || null, water: water || null }, 900);
    }
    const out = await getBeachConditions(lat, lng, Number.isFinite(dist) ? dist : null);
    return j(out, 900);
  } catch {
    return j({ show: false }, 120); // brief shield — upstream blips must not stampede the function
  }
}

async function beachWaterFor(placeId, lat, lng) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) return null;
  const H = { headers: { apikey: anon, Authorization: "Bearer " + anon } };
  try {
    if (placeId) {
      const r = await fetch(
        url + "/rest/v1/wf_beach_water?select=result,advisory,sampled_at&beach_place_id=eq." + encodeURIComponent(placeId),
        H,
      );
      if (r.ok) {
        const rows = await r.json();
        if (rows && rows[0]) return rows[0];
      }
    }
    // Nearest sampled station within NEAR_STATION_MI — a DOH station speaks
    // for its stretch of sand, never for the next town's beach.
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const pad = 0.05;
    const q = `lat=gte.${(lat - pad).toFixed(4)}&lat=lte.${(lat + pad).toFixed(4)}&lng=gte.${(lng - pad).toFixed(4)}&lng=lte.${(lng + pad).toFixed(4)}`;
    const r2 = await fetch(url + "/rest/v1/wf_beach_water_geo?select=beach_place_id,result,advisory,sampled_at,lat,lng&" + q, H);
    if (!r2.ok) return null;
    const rows2 = await r2.json();
    return nearestWater(Array.isArray(rows2) ? rows2 : [], lat, lng);
  } catch {
    return null;
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
