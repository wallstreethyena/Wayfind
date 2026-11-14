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
// client-supplied field list — a free-form list would let any caller upgrade
// requests to the priciest tier. "place" reaches Enterprise by fields, "area"
// reaches Pro, and "detail" reaches Atmosphere. A terminal Autocomplete
// session request is also billed at Atmosphere, regardless of those masks.
//
// Fail-soft, same contract as /api/places/autocomplete: no
// GOOGLE_MAPS_SERVER_KEY configured -> 501, client falls back to the direct
// SDK path (see pickSuggestionDetails's fallback in app/home.js).
import { NextResponse } from "next/server";
import { gateShut, spendAllow, spendAllowDetailsAtmosphere, runWithTraffic, TRAFFIC } from "../../../../lib/spendGate";
import { placeDiscoveryRef } from "../../../../lib/discoveryRef.js";
import { getInventoryIdentity } from "../../../../lib/inventoryIdentity.js";
import { getCachedPlaceIdentity } from "../../../../lib/cachedPlaceIdentity.js";
import { loadPlaceDetailPhotos } from "../../../../lib/placeDetailGallery.js";
import { resolveOwnedDetailBeforeSpend, persistLiveDetailEnrichment, resolveGracefulDetailFallback } from "../../../../lib/placeDetailSpine.js";
import { floridaTimezoneForCoords, utcOffsetMinutesForTimezone } from "../../../../lib/ownedHours.js";
import { recordDetailMetric } from "../../../../lib/detailTelemetry.js";
import { isSyntheticRequest } from "../../../../lib/productionWriteFirewall.js";

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
  const coverSrc = typeof signals.photo_url === "string" ? signals.photo_url : (typeof signals.photoUrl === "string" ? signals.photoUrl : "");
  let gallery = [];
  try {
    gallery = await loadPlaceDetailPhotos(row.place_id, { name: row.name, signals, coverSrc });
  } catch { gallery = []; }
  const photos = gallery.length
    ? gallery.map((photo) => ({ _directUri: photo.src }))
    : [
      ...(Array.isArray(signals.photos) ? signals.photos.filter((u) => typeof u === "string" && u).map((u) => ({ _directUri: u })) : []),
      { _directUri: `/api/photo?place=${encodeURIComponent(row.place_id)}&g=2&w=640` },
    ];
  return {
    id: row.place_id,
    displayName: { text: row.name },
    // Curator-owned street address keeps non-Google place links geographically exact.
    ...(typeof signals.official_address === "string" && signals.official_address.trim() ? { formattedAddress: signals.official_address.trim() } : {}),
    location: { latitude: row.lat, longitude: row.lng },
    rating: typeof signals.rating === "number" ? signals.rating : null,
    userRatingCount: Number(signals.reviews) || 0,
    types: Array.isArray(row.google_types) && row.google_types.length
      ? row.google_types
      : (row.primary_type ? [row.primary_type] : (row.category ? [row.category] : [])),
    primaryType: row.primary_type || null,
    businessStatus: row.status || null,
    // Stored city. The coverage metro is not a city and is not sent here.
    ...(typeof row.locality === "string" && row.locality.trim() ? { locality: row.locality.trim() } : {}),
    // Verified mailing/public city (wf_inventory.postal_city); shown ahead of locality.
    ...(typeof row.postal_city === "string" && row.postal_city.trim() ? { postalCity: row.postal_city.trim() } : {}),
    ...(typeof signals.state === "string" && /^[A-Za-z]{2}$/.test(signals.state.trim()) ? { state: signals.state.trim().toUpperCase() } : {}),
    ...(signals.regularOpeningHours && typeof signals.regularOpeningHours === "object" ? { regularOpeningHours: signals.regularOpeningHours } : {}),
    ...(signals.regularOpeningHours && typeof signals.regularOpeningHours === "object"
      ? { utcOffsetMinutes: typeof signals.utcOffsetMinutes === "number" ? signals.utcOffsetMinutes : utcOffsetMinutesForTimezone(floridaTimezoneForCoords(row.lat, row.lng)) }
      : {}),
    ...(typeof signals.website === "string" && signals.website.trim() ? { websiteUri: signals.website.trim() } : {}),
    ...(typeof signals.phone === "string" && signals.phone.trim() ? { nationalPhoneNumber: signals.phone.trim() } : {}),
    photos,
  };
}

export async function POST(req) {
  if (typeof isSyntheticRequest === "function" && typeof runWithTraffic === "function" && typeof TRAFFIC === "object" && isSyntheticRequest(req)) {
    return runWithTraffic(TRAFFIC.SYNTHETIC_QA, () => handleDetailsPost(req));
  }
  return handleDetailsPost(req);
}

async function handleDetailsPost(req) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const placeId = String(body.placeId || "").trim();
  const kind = FIELDS[body.kind] ? body.kind : "place";
  const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken.slice(0, 100) : undefined;
  let allowPartial = Boolean(body.allowPartial);
  if (!allowPartial) {
    try { allowPartial = new URL(req.url).searchParams.get("allowPartial") === "1"; } catch {}
  }
  const forceLive = Boolean(body.forceLive);
  if (!PLACE_ID_RX.test(placeId)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  // The wf_inventory identity for this id, read AT MOST ONCE per request.
  // kind "place" resolves it below before the gate; the budget refusals near
  // the bottom reuse that same answer instead of issuing a second Supabase
  // read for a row we already know is absent.
  let ownedRow = null;
  let ownedRead = false;
  const ownedIdentity = async () => {
    if (!ownedRead) { ownedRead = true; ownedRow = await inventoryPlace(placeId); }
    return ownedRow;
  };
  // Card navigation needs identity, not paid enrichment. Open owned places
  // before the spending gate so a closed budget cannot strand /p links.
  if (kind === "place") {
    const owned = await ownedIdentity();
    if (owned) return NextResponse.json({ place: owned, source: "inventory" });
    // Reuse only a recorded, still-fresh identity. This cache-only read cannot
    // buy enrichment, renew the record, or return a legacy photo resource.
    try {
      const cached = await getCachedPlaceIdentity(placeId);
      if (cached) return NextResponse.json({ place: cached, source: "cached" });
    } catch { /* a cache outage keeps the original guarded live path */ }
  }
  // Layered Place Detail Spine (Missions 9 & 22): serve rich owned/cached detail
  // before consuming paid Google Atmosphere quota.
  if (kind === "detail" && typeof resolveOwnedDetailBeforeSpend === "function") {
    try {
      const ownedDetail = await resolveOwnedDetailBeforeSpend(placeId, { forceLive });
      if (ownedDetail) return NextResponse.json(ownedDetail);
    } catch {}
  }
  if (!serverKey) {
    if (kind === "detail" && typeof resolveGracefulDetailFallback === "function") {
      try {
        const graceful = await resolveGracefulDetailFallback(placeId, { reason: "server key not configured", allowPartial, isUpstreamError: false });
        if (graceful) return NextResponse.json(graceful);
      } catch {}
    }
    const fallback = kind === "detail" ? null : await inventoryPlace(placeId);
    return fallback
      ? NextResponse.json({ place: fallback, source: "inventory" })
      : NextResponse.json({ error: "server key not configured" }, { status: 501 });
  }

  const qs = sessionToken ? ("?sessionToken=" + encodeURIComponent(sessionToken)) : "";
  try {
    // COST GUARD (2026-09-04): this route reached Google with NO gate and NO
    // ledger. FIELDS.place carries rating/userRatingCount/priceLevel — the
    // ENTERPRISE tier whose editorialSummary sibling cost $1,198 in August.
    // Area fields alone bill Pro. A terminal Autocomplete session request,
    // or the fixed editorialSummary/reviews detail mask, bills Atmosphere.
    // https://developers.google.com/maps/documentation/places/web-service/session-pricing
    // WE CHOSE NOT TO SPEND — that is not the same as "this place is empty",
    // and it must not reach a caller looking like one. Both refusals below
    // used to answer 200 with a bare {error}, so every caller landed on its
    // `!payload.place` branch: lib/google.js#fetchPlaceDetail logged the
    // generic "[wf] fetchPlaceDetail FAILED … details unavailable" with no way
    // to tell a shut gate from a broken upstream. Observed on prod 2026-10-30.
    //
    // A 200 from this route now ALWAYS carries `place`. No Google call happens
    // on either branch (the whole point of the gate), and the SKU/ledger
    // accounting below is untouched — scripts/test-google-details-accounting.mjs
    // still reads `.error` off the body, which both shapes keep.
    const budgetRefusal = async (reason) => {
      if (kind === "detail" && typeof resolveGracefulDetailFallback === "function") {
        try {
          const graceful = await resolveGracefulDetailFallback(placeId, { reason, allowPartial, isUpstreamError: false });
          if (graceful) return NextResponse.json(graceful);
        } catch {}
      }
      // NEVER borrow a bare identity row for kind "detail" unless allowPartial
      // or substantive owned enrichment was explicitly resolved above.
      const fallback = kind === "detail" ? null : await ownedIdentity();
      if (fallback) return NextResponse.json({ place: fallback, source: "inventory", degraded: reason });
      if (typeof recordDetailMetric === "function") recordDetailMetric("detail_503_returned", reason);
      // Nothing held. Say so with a STATUS, so the caller's transport branch
      // handles it instead of its empty-payload branch.
      return NextResponse.json({ error: reason, degraded: reason }, { status: 503 });
    };
    if (gateShut()) return budgetRefusal("gate shut");
    const legacySku = kind === "area" ? "details_pro" : "details_enterprise";
    const atmosphere = !!sessionToken || kind === "detail";
    const allowed = atmosphere ? await spendAllowDetailsAtmosphere(legacySku) : await spendAllow(legacySku);
    if (!allowed) {
      return budgetRefusal("budget");
    }
    if (typeof recordDetailMetric === "function") recordDetailMetric("paid_lookup_attempted", kind);
    const r = await fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) + qs, {
      headers: { "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": FIELDS[kind] },
    });
    if (!r.ok) {
      if (kind === "detail" && typeof resolveGracefulDetailFallback === "function") {
        try {
          const graceful = await resolveGracefulDetailFallback(placeId, { reason: "upstream " + r.status, allowPartial, isUpstreamError: true });
          if (graceful) return NextResponse.json(graceful);
        } catch {}
      }
      const fallback = kind === "detail" ? null : await inventoryPlace(placeId);
      return fallback
        ? NextResponse.json({ place: fallback, source: "inventory" })
        : NextResponse.json({ error: "upstream " + r.status }, { status: 502 });
    }
    const place = await r.json();
    // Self-healing writeback (Mission 22): persist structured owned_hours + rich cache
    // BEFORE photo discovery-ref stripping so owned gallery/hours survive 30 days.
    if (typeof persistLiveDetailEnrichment === "function") {
      try { await persistLiveDetailEnrichment(placeId, place, { kind }); } catch {}
    }
    // The REST API returns fully-qualified enum strings ("PRICE_LEVEL_MODERATE");
    // the Maps JS SDK this route replaces returned the short form ("MODERATE").
    // Normalize here so client-side price-level matching (unchanged from the
    // pre-proxy client code) keeps working regardless of which path served it.
    if (typeof place.priceLevel === "string" && place.priceLevel.startsWith("PRICE_LEVEL_")) {
      place.priceLevel = place.priceLevel.slice("PRICE_LEVEL_".length);
    }
    // COMPLIANCE (2026-10-08): Google forbids caching a photo name, and this
    // body is cached by clients. Reduce photos to one place-only pseudo-ref
    // (or none): no real names, no author attributions.
    if ("photos" in place) place.photos = Array.isArray(place.photos) && place.photos.length ? [{ name: placeDiscoveryRef(placeId) }] : [];
    return NextResponse.json({ place });
  } catch {
    if (kind === "detail" && typeof resolveGracefulDetailFallback === "function") {
      try {
        const graceful = await resolveGracefulDetailFallback(placeId, { reason: "upstream failure", allowPartial, isUpstreamError: true });
        if (graceful) return NextResponse.json(graceful);
      } catch {}
    }
    const fallback = kind === "detail" ? null : await inventoryPlace(placeId);
    return fallback
      ? NextResponse.json({ place: fallback, source: "inventory" })
      : NextResponse.json({ error: "upstream failure" }, { status: 502 });
  }
}
