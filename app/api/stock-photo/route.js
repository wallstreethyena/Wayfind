// v1.00 — server-side Pexels image byte proxy.
//
// Same reasoning as app/api/photo/route.js (Google Places), applied to Pexels:
// lib/dealSheet.js's dealArtwork() has a deliberate, guarded rule (see
// scripts/check-clipp-deals.mjs section 4) that a Wayfind card NEVER renders a
// raw third-party image URL — hotlinking hands that third party control of
// what appears inside our card, and leaks the visitor's referer to them on
// every view. This route lets lib/coupons.js's market-level (non-merchant)
// cards use a real Pexels photo in their identity tile while staying same-
// origin: the browser only ever sees a /api/stock-photo?u=... URL, and the
// Pexels photo id is opaque to it.
//
// SSRF guard, same shape as the Places proxy's ref-pattern allowlist: the
// upstream URL must resolve to images.pexels.com over https, nothing else.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_HOST = "images.pexels.com";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("u") || "";

  let upstream;
  try {
    upstream = new URL(raw);
  } catch (e) {
    return NextResponse.json({ error: "bad url" }, { status: 400 });
  }
  if (upstream.protocol !== "https:" || upstream.hostname !== ALLOWED_HOST) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 });
  }

  try {
    const r = await fetch(upstream.toString());
    if (!r.ok || !r.body) {
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
        // Pexels photo bytes at a given URL are immutable — same 30-day
        // treatment as the Places photo proxy.
        "Cache-Control": "public, max-age=" + THIRTY_DAYS + ", s-maxage=" + THIRTY_DAYS + ", immutable",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
