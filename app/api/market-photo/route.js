// v1.00 — market-level (non-merchant) coupon card photo.
//
// WHY THIS EXISTS: lib/coupons.js's CLIPP_COUPONS (city-market Clipp cards,
// ~36 merchants behind one card) and CITYPASS_COUPONS (bundled-ticket cards)
// represent a whole market, not one venue — there is no single Google
// photo_ref to show (see lib/coupons.js's "the merchant-photo rule cannot
// reach it" comment). Today those rows render NO identity tile at all in
// app/components/screens/Coupons.js's CouponCard (no venuePhotoRef, no
// icon) — this route lets them show a real, city+category-matched Pexels
// photo instead, same source and same cache (lib/stockPhoto.js) as the SSR
// landing pages, without the client ever seeing a raw Pexels URL or key
// (routed through /api/stock-photo — see that file for why).
//
// lib/coupons.js's own `c.image` field is UNTOUCHED by this route — that
// field is a separate, guarded (scripts/check-clipp-deals.mjs), LOCAL-ONLY
// asset contract for a different, currently-unrendered "poster band" system
// (dealArtwork()). This route only ever feeds CouponCard's small 52px
// identity tile, the one thing actually on screen today.
//
// Server-only: this is the one place allowed to call stockPhotoPool()
// (reads PEXELS_API_KEY + the shared Supabase cache) — lib/coupons.js
// itself is imported by several "use client" screens and must stay free of
// server secrets and async module-load work.
import { NextResponse } from "next/server";
import { stockPhotoPool, fromPool } from "../../../lib/stockPhoto.js";

export const dynamic = "force-dynamic";

// Not a general-purpose search proxy: the query always originates from
// lib/coupons.js's own fixed, small set of markets, never raw user input.
// This allowlist-by-shape (short, plain text) is a sanity guard against the
// public route being pointed at arbitrary strings to burn Pexels quota —
// same spirit as the /api/photo ref-pattern guard, adapted to free text.
const Q_RX = /^[A-Za-z0-9 ,.'-]{3,60}$/;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (!Q_RX.test(q)) {
    return NextResponse.json({ url: null }, { status: 400 });
  }

  try {
    const pool = await stockPhotoPool(q);
    const photo = fromPool(pool, 0);
    const url = photo ? "/api/stock-photo?u=" + encodeURIComponent(photo.url) : null;
    return NextResponse.json(
      { url },
      // Same 21-day rhythm as the pool itself (lib/stockPhoto.js TTL) — this
      // route is a thin wrapper around that already-cached pool, so a long
      // CDN cache here costs nothing extra and saves the round trip.
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=1814400" } }
    );
  } catch (e) {
    // Fail-soft: no key, quota, or network failure -> null -> caller keeps
    // rendering its pre-existing no-tile state. Never a broken card.
    return NextResponse.json({ url: null });
  }
}
