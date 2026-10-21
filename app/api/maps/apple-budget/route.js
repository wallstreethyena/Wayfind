// POST /api/maps/apple-budget  { units, capability }
// -> { granted, ledger, reason }
//
// The browser asks here BEFORE spending Apple Maps service calls on map pins
// (MapKit JS PlaceLookup for stored Place IDs, Search for unmatched places).
// One atomic daily ceiling (public.wf_source_registry 'apple_maps', reserved
// through wf_reserve_free_provider_call) keeps Wayfind inside Apple's free
// "25,000 service calls per day per team between Apple Maps Server API and
// MapKit JS". No Apple or Google call is made here. Same-origin + per-IP
// guarded in middleware.js.
import { NextResponse } from "next/server";
import { reserveAppleServiceCalls } from "../../../../lib/applePlaceIds.js";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
const CAPABILITIES = new Set(["map_place_lookup", "map_search"]);

export async function POST(req) {
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const capability = body && CAPABILITIES.has(body.capability) ? body.capability : "map_place_lookup";
  const result = await reserveAppleServiceCalls(body && body.units, { capability });
  return NextResponse.json({ granted: result.granted, ledger: result.ledger, reason: result.reason }, { headers: NO_STORE });
}
