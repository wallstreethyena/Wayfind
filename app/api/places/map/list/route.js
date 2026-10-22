// POST /api/places/map/list  { ids: [...place_id], originLat, originLng }
// -> { places, appleIds, requested, source }
//
// LIST-TO-MAP (owner, 2026-10-22). The map opened from a list, search,
// category or rail draws THAT result set: every id with a permitted
// coordinate (lib/mapAreaData.readMapPlacesByIds, same row gate and same
// lib/coordProvenance.js rule as the area read), no 9.2 floor, no viewport.
// For ids with no drawable coordinate it also returns the stored Apple Place
// ID (wf_apple_place_ids), read FRESH here, so a Place ID the daily backfill
// stored today reaches the map today instead of waiting out the inv=1 list's
// day-long edge cache. DB reads only: no Google call, no Apple call.
// Same-origin + per-IP guarded in middleware.js; never cached.
import { NextResponse } from "next/server";
import { sbEnv } from "../../../../../lib/serverCache.js";
import { fetchDeadline, DB_DEADLINE_MS } from "../../../../../lib/fetchDeadline.js";
import { loadOwnerPickIds } from "../../../../../lib/curatorPicksServer.js";
import { readMapPlacesByIds, mapListIds } from "../../../../../lib/mapAreaData.js";
import { readApplePlaceIds } from "../../../../../lib/applePlaceIds.js";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request) {
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const origin = { lat: Number(body && body.originLat), lng: Number(body && body.originLng) };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || Math.abs(origin.lat) > 90 || Math.abs(origin.lng) > 180) return NextResponse.json({ error: "Choose a search location." }, { status: 400, headers: NO_STORE });
  const ids = mapListIds(body && body.ids);
  if (!ids.length) return NextResponse.json({ places: [], appleIds: {}, requested: 0, source: "wayfind-inventory" }, { headers: NO_STORE });
  try {
    const config = sbEnv();
    if (!config) throw new Error("Map inventory configuration is unavailable");
    const fetcher = (url, init) => fetchDeadline(url, init, DB_DEADLINE_MS);
    const owner = await loadOwnerPickIds({ fresh: true, fetchImpl: fetcher }).catch(() => null);
    const result = await readMapPlacesByIds({ ids, origin, config, fetcher, ownerPickIds: owner ? new Set(owner.map(String)) : null });
    const drawn = new Set(result.places.map((p) => p.id));
    const apple = await readApplePlaceIds(ids.filter((id) => !drawn.has(id)), { env: config });
    return NextResponse.json({ ...result, appleIds: Object.fromEntries(apple) }, { headers: NO_STORE });
  } catch (error) {
    console.error("[places/map/list]", error.message);
    return NextResponse.json({ error: "The place library is unavailable. Retry the map." }, { status: 503, headers: NO_STORE });
  }
}
