// v6.11 — "Stay Tonight" hotel source. Serves Wayfind's OWNED lodging-only list
// (lib/hotels -> lib/ownedHotels.json), ranked by distance from the user so thin
// markets (Parrish) still get real nearby hotels. No external key, no Google, no
// 55+/residential noise (stripped at ingest). Booking is monetized downstream by
// the app's existing Stay22 link path.
import { NextResponse } from "next/server";
import { searchHotels, hotelsConfigured } from "../../../lib/hotels";

export const dynamic = "force-dynamic";
const EDGE_HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };

export async function GET(req) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const city = (u.searchParams.get("city") || "").slice(0, 80).trim();
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 20, 1), 50);
  if (!hotelsConfigured()) return NextResponse.json({ hotels: [], configured: false });
  try {
    const hotels = await searchHotels({
      lat: isFinite(lat) ? lat : undefined,
      lng: isFinite(lng) ? lng : undefined,
      city, limit,
    });
    return NextResponse.json({ hotels, configured: true, source: "owned" }, { headers: EDGE_HEADERS });
  } catch (e) {
    return NextResponse.json({ hotels: [], configured: true, error: String((e && e.message) || e) }, { status: 502 });
  }
}
