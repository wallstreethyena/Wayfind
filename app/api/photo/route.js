import { gateShut, spendAllow } from "../../../lib/spendGate";
// v6.18 — server-side Google Places photo proxy.
//
// Why this exists: the browser was loading place photos directly from
// places.googleapis.com/v1/{ref}/media?key={PUBLIC_KEY}. That URL is
// referrer-restricted (the public key is locked to gowayfind.com), and the
// Places (New) media endpoint's redirect drops the referrer — so the image
// often failed to load. It also put an API key in every <img> src.
//
// This route fetches the photo bytes SERVER-side with GOOGLE_MAPS_SERVER_KEY
// (no referrer restriction), streams them back from our own origin, and caches
// them at the CDN for 30 days — the Google ToS maximum for cached place
// content. No key ever reaches the browser, and images load reliably.
import { NextResponse } from "next/server";
import { FALLBACK_PATH, PHOTO_REF_RX, resolvePlacePhoto } from "../../../lib/placePhotoServe";

export const dynamic = "force-dynamic";

// Only a real Google photo resource name may be proxied — never an arbitrary
// URL. Shape: places/{placeId}/photos/{photoId}. This is the SSRF guard: the
// proxy can reach exactly one host, one endpoint, nothing else.
const REF_RX = PHOTO_REF_RX;

const THIRTY_DAYS = 60 * 60 * 24 * 30;

// v8.19 — ?place=<placeId> mode: the CURRENT first photo of a place, no
// stored ref needed. Deal cards key their artwork on the venue's placeId
// (stable forever) instead of a photo ref (expires); the details lookup is
// the same cached call the self-heal below already makes.
const PLACE_RX = /^[A-Za-z0-9_-]{10,}$/;

export async function GET(req) {
  // COST GUARD (2026-08-25 / 2026-08-26): photo media is metered. #956
  // deleted the category+metro Pexels pool (one manatee on three Family
  // cards) and then 302'd EVERY gated miss to /wf-photo-fallback.svg — so
  // distinct inventory photo_refs still painted one teal compass. Empty /
  // branded is allowed ONLY when that placeId has no photo. Another place's
  // photo is not. A shared stock pool is not.
  //
  // Order: cache → inventory photo_url → spendAllow("photos") → Google.
  // Cache / inventory hits never spend. shut: never pay. The branded SVG
  // is no-store so it cannot poison the 30-day photo cache.
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref") || "";
  const place = searchParams.get("place") || "";
  const w = searchParams.get("w") || "640";
  if (ref && !REF_RX.test(ref) && !place) {
    return NextResponse.json({ error: "bad ref" }, { status: 400 });
  }
  if (!ref && place && !PLACE_RX.test(place)) {
    return NextResponse.json({ error: "bad place" }, { status: 400 });
  }

  const shut = gateShut();
  const spendAllowed = !shut && (await spendAllow("photos"));
  const result = await resolvePlacePhoto({
    ref,
    place,
    w,
    gateShut: shut,
    spendAllowed,
    serverKey: process.env.GOOGLE_MAPS_SERVER_KEY || "",
  });

  if (result.type === "redirect" && result.location) {
    const dest = /^https?:\/\//i.test(result.location)
      ? result.location
      : new URL(result.location, req.url);
    return NextResponse.redirect(dest, {
      status: 302,
      headers: { "Cache-Control": result.cacheControl || ("public, max-age=" + THIRTY_DAYS + ", s-maxage=" + THIRTY_DAYS + ", immutable") },
    });
  }

  if (result.type === "empty") {
    return NextResponse.redirect(new URL(FALLBACK_PATH, req.url), {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  // Owned ref whose bytes we could not fetch (stale, no key, upstream).
  // 404 — not a shared SVG. Distinct refs stay distinct finals.
  return NextResponse.json(
    { error: "no photo" },
    { status: 404, headers: { "Cache-Control": "private, no-store" } }
  );
}
