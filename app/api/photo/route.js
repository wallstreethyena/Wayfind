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

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref") || "";
  let w = parseInt(searchParams.get("w") || "640", 10);
  if (!Number.isFinite(w) || w < 64) w = 640;
  if (w > 1600) w = 1600; // cap billable size

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
    const r = await fetch(upstream, { redirect: "follow" });
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
