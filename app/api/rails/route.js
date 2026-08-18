// app/api/rails/route.js — the rail menu's places, for a location.
//
// WHY THIS EXISTS. The homepage is ONE prerendered document, so its rails are
// server-ranked for the flagship metro. That is a real answer at first paint
// and the wrong answer for a reader in Orlando — and it breaks a rule the owner
// set explicitly (2026-07-28, beach hero): "we dont show a beach hero card for
// someone who is currently not within 23 miles from a beach OR SEARCH FOR A
// PLACE that is not 23 miles from a beach". scripts/test-beach-geo.mjs pins it.
// So the rail follows `center` — the one piece of state both geolocation and
// the search box write — by asking this route for the nearest covered metro.
//
// COST. Every ranked pool behind railMenuData() is Supabase-cached for 30 days
// (lib/landing.js) and this response is CDN-cached for an hour, so a metro that
// has been asked for once costs nothing to ask for again. There is no metered
// upstream on the hot path: this is not the shape lib/apiGuard.js exists for,
// and it is not in the middleware matcher for the same reason /api/events is
// not. It also takes no free-text — only two numbers, snapped to a fixed list
// of ~21 cities — so there is no novel-parameter space to iterate over.
import { NextResponse } from "next/server";
import { LANDING_CITIES } from "../../../lib/landing";
import { railMenuData } from "../../../lib/railsData";

export const revalidate = 3600;

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
function miBetween(aLat, aLng, bLat, bLng) {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

// Past this, the reader is not in a market Wayfind has ranked inventory for and
// the honest answer is the flagship, not the nearest-by-arithmetic town 400
// miles away. Same spirit as the beach rule: near means near.
const COVERAGE_MI = 90;

/** Nearest LANDING_CITIES slug to a point, or null when nothing is close. */
export function nearestCity(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  let best = null, bestMi = Infinity;
  for (const [slug, c] of Object.entries(LANDING_CITIES)) {
    const mi = miBetween(la, ln, c.lat, c.lng);
    if (mi < bestMi) { bestMi = mi; best = slug; }
  }
  return bestMi <= COVERAGE_MI ? best : null;
}

export async function GET(req) {
  const sp = req.nextUrl.searchParams;
  const asked = String(sp.get("city") || "");
  const slug = LANDING_CITIES[asked] ? asked : nearestCity(sp.get("lat"), sp.get("lng"));
  if (!slug) {
    // Out of coverage. 200 with a null payload, not a 404: the client keeps the
    // server-rendered flagship rails, which is a real answer, and a 404 in the
    // console reads as a broken page when nothing is broken.
    return NextResponse.json({ covered: false, data: null }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  }
  try {
    const data = await railMenuData(slug);
    return NextResponse.json({ covered: true, data }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    // Fail-soft, always: the client falls back to what the server already gave
    // it. A rail that cannot re-rank must not become an empty rail.
    return NextResponse.json({ covered: false, data: null }, { status: 200 });
  }
}
