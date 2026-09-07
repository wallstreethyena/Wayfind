// /api/extra-miles?lat=&lng= — the "Worth the Extra Miles" tail for the
// homepage Worth the Drive drop (Lane E). Owned inventory only, zero Google.
//
// Its own route on purpose: the tail must never ride inside /api/rails'
// payload, where a future merge could let it leak into `places.drive`. The
// data boundary is lib/extraMiles.js; this file only does the two reads the
// selector refuses to do itself — the five owned rows, and the proof that
// each has a real /places/<id> page (wf_place_ids) — then hands them over.
//
// Coordinates are snapped to two decimals so the CDN key is a ~1km cell and
// the reader's exact point never becomes a cache key.
import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase.js";
import { getSkeleton } from "../../../lib/placeIndex.js";
import { EXTRA_MILES_PLACE_IDS, EXTRA_MILES_TITLE, EXTRA_MILES_SUB, EXTRA_MILES_BAND, extraMilesFrom } from "../../../lib/extraMiles.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };
const NO_STORE = { "Cache-Control": "no-store" };
const IDS = Object.keys(EXTRA_MILES_PLACE_IDS);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  // Absent is not zero: Number(null) is 0, a point in the Gulf of Guinea, and
  // the preview answered it 200. A missing coordinate is a 400.
  const latRaw = searchParams.get("lat"), lngRaw = searchParams.get("lng");
  const lat = latRaw == null || latRaw === "" ? NaN : Number(latRaw);
  const lng = lngRaw == null || lngRaw === "" ? NaN : Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ ok: false, error: "lat/lng required" }, { status: 400, headers: NO_STORE });
  }
  const origin = { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "inventory unavailable", title: EXTRA_MILES_TITLE, cards: [] }, { status: 503, headers: NO_STORE });
  }
  try {
    const signal = AbortSignal.timeout(6000);
    const [inv, skeletons] = await Promise.all([
      supabase.from("wf_inventory")
        .select("place_id,name,lat,lng,photo_ref,status,excluded")
        .in("place_id", IDS).abortSignal(signal),
      Promise.all(IDS.map((id) => getSkeleton(id).catch(() => null))),
    ]);
    if (inv.error) throw inv.error;
    const pages = new Set(skeletons.filter(Boolean).map((s) => s.place_id));
    const cards = extraMilesFrom(origin, inv.data || [], (id) => pages.has(id));
    return NextResponse.json({
      ok: true,
      title: EXTRA_MILES_TITLE,
      sub: EXTRA_MILES_SUB,
      band: EXTRA_MILES_BAND,
      origin,
      cards,
    }, { headers: CACHE });
  } catch (e) {
    // A failed read is not "nothing is worth the miles". Say so, don't cache it.
    return NextResponse.json({ ok: false, error: "read failed", title: EXTRA_MILES_TITLE, cards: [] }, { status: 503, headers: NO_STORE });
  }
}
