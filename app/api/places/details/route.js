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
// the old place-kind fetchFields and "area" mirrors the old area-kind fields.
// When either terminates an Autocomplete session, Google bills the terminal
// Details request at Atmosphere; the "detail" mask also reaches that tier via
// editorialSummary/reviews. Accounting below preserves the former ledger debit
// as a transition ceiling while recording the real billed class.
//
// Fail-soft, same contract as /api/places/autocomplete: no
// GOOGLE_MAPS_SERVER_KEY configured -> 501, client falls back to the direct
// SDK path (see pickSuggestionDetails's fallback in app/home.js).
import { NextResponse } from "next/server";
import { gateShut, spendAllow, spendAllowSkuTransition } from "../../../../lib/spendGate";
import { getInventoryIdentity } from "../../../../lib/inventoryIdentity.js";

export const dynamic = "force-dynamic";

const FIELDS = {
  place: "id,location,displayName,formattedAddress,types,primaryType,rating,userRatingCount,photos,priceLevel,regularOpeningHours,businessStatus",
  area: "location,formattedAddress,displayName",
  detail: "editorialSummary,reviews,regularOpeningHours,nationalPhoneNumber,websiteUri,photos",
};

// Real Google place IDs are alnum/underscore/hyphen only — reject anything else
// before it ever reaches a fetch (defense in depth, matches api/photo's REF_RX).
const PLACE_ID_RX = /^[A-Za-z0-9_-]+$/;

async function inventoryPlace(placeId) {
  const row = await getInventoryIdentity(placeId);
  if (!row || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return null;
  const signals = row.signals || {};
  return {
    id: row.place_id,
    displayName: { text: row.name },
    location: { latitude: row.lat, longitude: row.lng },
    rating: typeof signals.rating === "number" ? signals.rating : null,
    userRatingCount: Number(signals.reviews) || 0,
    types: Array.isArray(row.google_types) && row.google_types.length
      ? row.google_types
      : (row.primary_type ? [row.primary_type] : (row.category ? [row.category] : [])),
    primaryType: row.primary_type || null,
    businessStatus: row.status || null,
    photos: [{ _directUri: `/api/photo?place=${encodeURIComponent(row.place_id)}&w=640` }],
  };
}

export async function POST(req) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const placeId = String(body.placeId || "").trim();
  const kind = FIELDS[body.kind] ? body.kind : "place";
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.slice(0, 100) : undefined;
  if (!PLACE_ID_RX.test(placeId)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  // Card navigation needs identity, not paid enrichment. Open owned places
  // before the spending gate so a closed budget cannot strand /p links.
  if (kind === "place") {
    const owned = await inventoryPlace(placeId);
    if (owned) return NextResponse.json({ place: owned, source: "inventory" });
  }
  if (!serverKey) {
    const fallback = await inventoryPlace(placeId);
    return fallback
      ? NextResponse.json({ place: fallback, source: "inventory" })
      : NextResponse.json({ error: "server key not configured" }, { status: 501 });
  }

  const qs = sessionToken ? ("?sessionToken=" + encodeURIComponent(sessionToken)) : "";
  try {
    // COST GUARD (2026-09-04): this route reached Google with NO gate and NO
    // ledger. FIELDS.place carries rating/userRatingCount/priceLevel — the
    // ENTERPRISE tier whose editorialSummary sibling cost $1,198 in August.
    // FIELDS.area is Pro by fields alone. A session-token terminal request is
    // Atmosphere regardless, as is FIELDS.detail by its field selection.
    if (gateShut()) return NextResponse.json({ error: "gate shut" }, { status: 200 });
    const legacySku = kind === "area" ? "details_pro" : "details_enterprise";
    const actualSku = sessionToken || kind === "detail" ? "details_enterprise_atmosphere" : legacySku;
    const allowed = actualSku === legacySku
      ? await spendAllow(legacySku)
      : await spendAllowSkuTransition(legacySku, actualSku);
    if (!allowed) {
      return NextResponse.json({ error: "budget" }, { status: 200 });
    }
    const r = await fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) + qs, {
      headers: { "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": FIELDS[kind] },
    });
    if (!r.ok) {
      const fallback = await inventoryPlace(placeId);
      return fallback
        ? NextResponse.json({ place: fallback, source: "inventory" })
        : NextResponse.json({ error: "upstream " + r.status }, { status: 502 });
    }
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
    const fallback = await inventoryPlace(placeId);
    return fallback
      ? NextResponse.json({ place: fallback, source: "inventory" })
      : NextResponse.json({ error: "upstream failure" }, { status: 502 });
  }
}
