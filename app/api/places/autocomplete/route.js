// app/api/places/autocomplete/route.js — server-side Places Autocomplete (New)
// proxy for the search box (app/home.js fetchSuggestions).
//
// Why: the client called Google DIRECTLY from the browser via the Maps JS
// library (AutocompleteSuggestion.fetchAutocompleteSuggestions). Unlike every
// other metered Google Places call in this app (/api/places/search,
// /api/places/refresh, /api/photo, ...), that call never passed through
// middleware.js/apiGuard.js — no same-origin check, no per-IP rate limit. A
// scraper (or anyone) could hammer Google's paid Autocomplete SKU directly
// through the public referrer-restricted key with zero guard on our side. This
// route closes that gap: same shape as /api/places/search, guarded in
// middleware.js, GOOGLE_MAPS_SERVER_KEY (no referrer restriction) server-side.
//
// Fail-soft, same contract as /api/places/search: no GOOGLE_MAPS_SERVER_KEY
// configured -> 501, and the client falls back to the original direct-to-Google
// client path (see fetchSuggestionsDirect in app/home.js) so nothing breaks in
// an environment where the server key isn't set.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Geographic types — anything else is treated as an establishment/place. Kept
// in sync with the client's former local copy of this same set.
const AREA_TYPES = new Set([
  "locality", "administrative_area_level_1", "administrative_area_level_2",
  "administrative_area_level_3", "administrative_area_level_4",
  "postal_code", "country", "colloquial_area", "neighborhood",
  "sublocality", "sublocality_level_1", "route", "geocode",
]);

export async function POST(req) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ error: "server key not configured" }, { status: 501 });

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const input = String(body.input || "").slice(0, 120).trim();
  if (!input) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.slice(0, 100) : undefined;
  const lat = Number(body.lat), lng = Number(body.lng);
  const hasCenter = Number.isFinite(lat) && Number.isFinite(lng);

  const payload = {
    input,
    ...(sessionToken ? { sessionToken } : {}),
    // Location bias keeps establishment results close to the current center —
    // mirrors the client's former locationBias exactly (same 50km radius).
    ...(hasCenter ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } } } : {}),
  };

  try {
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": serverKey },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return NextResponse.json({ error: "upstream " + r.status }, { status: 502 });
    const data = await r.json();
    const suggestions = (data.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((pp) => {
        const text = (pp.text && pp.text.text) || "";
        const types = pp.types || [];
        const kind = types.some((t) => AREA_TYPES.has(t)) ? "area" : "place";
        return { placeId: pp.placeId, text, kind };
      })
      .filter((s) => s.text && s.placeId)
      .slice(0, 6);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: "upstream failure" }, { status: 502 });
  }
}
