// POST /api/nearby-picks — springs and sweet spots near the reader, on request.
//
// OWNER INTENT (Gabe, 2026-11-27): opt-in nearby picks that work on the website
// today, without the phone app. The reader taps "Show picks near me" on /nearby,
// the browser asks for location once, and app/components/NearbyAlerts.js sends
// the point here ROUNDED TO 2 DECIMALS (about 1.1 km).
//
// PRIVACY, ENFORCED HERE:
//   · POST body, not a query string, so the point never lands in a URL, a CDN
//     cache key or a request log line.
//   · Rounded again on arrival; finer input is never used.
//   · Nothing is written anywhere: no table, no log, no analytics. The response
//     is private, no-store.
//
// FREE, OWNED INVENTORY ONLY: two PostgREST reads of wf_inventory with the
// public anon key, the same rows lib/nearbyPool.js reads. No Google, no
// SerpApi, no Foursquare (scripts/test-nearby-picks.mjs walks the imports).
// Same-origin + per-IP rate limit via middleware.js's matcher.
import { NextResponse } from "next/server";
import { parseBody, serveNearbyPicks, NEARBY_PICKS_CACHE_CONTROL } from "../../../lib/nearbyPicksServe.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const origin = await parseBody(request);
  const { status, body } = origin
    ? await serveNearbyPicks(origin)
    : { status: 400, body: { error: "A valid location is required." } };
  return NextResponse.json(body, { status, headers: { "Cache-Control": NEARBY_PICKS_CACHE_CONTROL } });
}
