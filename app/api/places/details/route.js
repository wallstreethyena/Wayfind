// app/api/places/details/route.js — server-side Place Details (New) proxy for
// the search box's "pick a suggestion" flow (app/home.js pickSuggestion).
//
// Why: same gap as /api/places/autocomplete (see that file's header) — the
// client called Google directly via the Maps JS library
// (placePrediction.toPlace().fetchFields(...)), fully unguarded. It ALSO built
// photo URLs via place.photos[i].getURI(), which points straight at
// places.googleapis.com WITH the public key — exactly the pattern
// app/api/photo/route.js's header describes fixing for card images, except
// this one path (picking a search suggestion) still did it. This route
// returns photo RESOURCE NAMES only; the client builds photo URLs through the
// existing guarded /api/photo proxy, never Google directly.
//
// `kind` selects one of two FIXED field masks below, NOT an arbitrary
// client-supplied field list — Google's New Places API bills by SKU tier per
// field group (Basic vs Atmosphere), so accepting a free-form field list would
// let any caller upgrade every request to the priciest tier. "place" mirrors
// the old place-kind fetchFields (incl. Atmosphere-tier fields); "area"
// mirrors the old area-kind fetchFields (Basic-tier only) — same cost shape
// as before this route existed, just guarded.
//
// Fail-soft, same contract as /api/places/autocomplete: no
// GOOGLE_MAPS_SERVER_KEY configured -> 501, client falls back to the direct
// SDK path (see pickSuggestionDetails's fallback in app/home.js).
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FIELDS = {
  place: "id,location,displayName,formattedAddress,types,rating,userRatingCount,photos,priceLevel,regularOpeningHours,businessStatus",
  area: "location,formattedAddress,displayName",
};

// Real Google place IDs are alnum/underscore/hyphen only — reject anything else
// before it ever reaches a fetch (defense in depth, matches api/photo's REF_RX).
const PLACE_ID_RX = /^[A-Za-z0-9_-]+$/;

export async function POST(req) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ error: "server key not configured" }, { status: 501 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const placeId = String(body.placeId || "").trim();
  const kind = FIELDS[body.kind] ? body.kind : "place";
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.slice(0, 100) : undefined;
  if (!PLACE_ID_RX.test(placeId)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const qs = sessionToken ? ("?sessionToken=" + encodeURIComponent(sessionToken)) : "";
  try {
    const r = await fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) + qs, {
      headers: { "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": FIELDS[kind] },
    });
    if (!r.ok) return NextResponse.json({ error: "upstream " + r.status }, { status: 502 });
    const place = await r.json();
    // The REST API returns fully-qualified enum strings ("PRICE_LEVEL_MODERATE");
    // the Maps JS SDK this route replaces returned the short form ("MODERATE").
    // Normalize here so client-side price-level matching (unchanged from the
    // pre-proxy client code) keeps working regardless of which path served it.
    if (typeof place.priceLevel === "string" && place.priceLevel.startsWith("PRICE_LEVEL_")) {
      place.priceLevel = place.priceLevel.slice("PRICE_LEVEL_".length);
    }
    return NextResponse.json({ place });
  } catch {
    return NextResponse.json({ error: "upstream failure" }, { status: 502 });
  }
}
