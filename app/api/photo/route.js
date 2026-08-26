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

export const dynamic = "force-dynamic";

// Only a real Google photo resource name may be proxied — never an arbitrary
// URL. Shape: places/{placeId}/photos/{photoId}. This is the SSRF guard: the
// proxy can reach exactly one host, one endpoint, nothing else.
const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

const THIRTY_DAYS = 60 * 60 * 24 * 30;

// v8.19 — ?place=<placeId> mode: the CURRENT first photo of a place, no
// stored ref needed. Deal cards key their artwork on the venue's placeId
// (stable forever) instead of a photo ref (expires); the details lookup is
// the same cached call the self-heal below already makes.
const PLACE_RX = /^[A-Za-z0-9_-]{10,}$/;

export async function GET(req) {
  // COST GUARD (2026-08-25): photo media is metered ($7/1k, 22,759 fetches on
  // the August bill). Gate shut / free-tier exhausted -> branded fallback
  // art, NEVER a category+metro Pexels pool. That pool is what painted the
  // same manatee on River Walk, Nathan Benderson Park and Bishop Museum
  // (Family → Toddlers, Parrish, 2026-08-25 11:51 PM ET) and the same beach
  // sunset on Kids Empire + Intense Escape earlier the same night. Empty /
  // branded is allowed. Another place's photo is not. Spend stays gated.
  // shut: never pay. free: one monthly photos ledger grant per lambda-reached
  // miss. Edge-cached Google photos are free forever and unaffected.
  if (gateShut() || !(await spendAllow("photos"))) {
    return NextResponse.redirect(new URL("/wf-photo-fallback.svg", req.url), {
      status: 302,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    });
  }
  const { searchParams } = new URL(req.url);
  let ref = searchParams.get("ref") || "";
  const place = searchParams.get("place") || "";
  let w = parseInt(searchParams.get("w") || "640", 10);
  if (!Number.isFinite(w) || w < 64) w = 640;
  if (w > 1600) w = 1600; // cap billable size

  if (!ref && PLACE_RX.test(place)) {
    const key0 = process.env.GOOGLE_MAPS_SERVER_KEY;
    if (!key0) return NextResponse.json({ error: "no server key" }, { status: 502 });
    try {
      const d = await fetch(
        "https://places.googleapis.com/v1/places/" + place + "?fields=photos&key=" + key0,
        { next: { revalidate: 86400 } }
      );
      if (d.ok) {
        const j = await d.json();
        const fresh = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
        if (fresh && REF_RX.test(fresh)) ref = fresh;
      }
    } catch (e) {}
    if (!ref) return NextResponse.json({ error: "no photo" }, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  }

  if (!REF_RX.test(ref)) {
    return NextResponse.json({ error: "bad ref" }, { status: 400 });
  }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    // No server key configured — fall back to the direct public-key URL so
    // nothing breaks before the env is set (public key is already client-side).
    const pub = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
    return NextResponse.redirect(
      "https://places.googleapis.com/v1/" + ref + "/media?maxWidthPx=" + w + "&key=" + pub,
      302
    );
  }

  const upstream =
    "https://places.googleapis.com/v1/" + ref + "/media?maxWidthPx=" + w + "&key=" + key;

  try {
    let r = await fetch(upstream, { redirect: "follow" });
    // v8.17 SELF-HEAL (owner, live screenshots 2026-08-19: broken images on
    // the guide cards AND the beaches pages). Google Places photo resource
    // names EXPIRE — a ref harvested weeks ago answers 400 forever, and every
    // surface that stored it (wf_inventory photo_ref, cached rows) renders a
    // broken image. The placeId is INSIDE the ref (places/{id}/photos/...),
    // so a stale ref is recoverable right here: one Place Details call for
    // the CURRENT photo name, then fetch that. Cost is bounded — one details
    // lookup per stale ref per 30-day cache window, and only on the 400 path.
    if (!r.ok && (r.status === 400 || r.status === 403 || r.status === 404)) {
      try {
        const placeId = ref.split("/")[1];
        const d = await fetch(
          "https://places.googleapis.com/v1/places/" + placeId + "?fields=photos&key=" + key,
          { next: { revalidate: 86400 } }
        );
        if (d.ok) {
          const j = await d.json();
          const fresh = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
          if (fresh && REF_RX.test(fresh) && fresh !== ref) {
            r = await fetch(
              "https://places.googleapis.com/v1/" + fresh + "/media?maxWidthPx=" + w + "&key=" + key,
              { redirect: "follow" }
            );
          }
        }
      } catch (e) {}
    }
    if (!r.ok || !r.body) {
      // Cache the miss briefly so a transient upstream error doesn't hammer us.
      return NextResponse.json(
        { error: "upstream " + r.status },
        { status: r.status === 404 ? 404 : 502, headers: { "Cache-Control": "public, max-age=300" } }
      );
    }
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": r.headers.get("content-type") || "image/jpeg",
        // 30-day CDN + browser cache; immutable — a photo ref's bytes never change.
        "Cache-Control": "public, max-age=" + THIRTY_DAYS + ", s-maxage=" + THIRTY_DAYS + ", immutable",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
