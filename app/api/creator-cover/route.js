// /api/creator-cover?place=<placeId> — the cover picture for a creator video
// tile shown in the in-app sheet (app/components/sheets/SocialFind.js), which
// is a client component and cannot read the database itself. Server pages
// call lib/creatorCovers.creatorCoversFor directly instead of this route.
//
// Returns { cover: { src, credit } } or { cover: null }. Only our own credited
// /place-photos/ assets are ever returned (lib/creatorCovers.pickOwnedCover),
// so this route can never hand out a Google photo or a hotlink. One cheap
// read of one row; cached at the edge for a day.
import { NextResponse } from "next/server";
import { creatorCoversFor } from "../../../lib/creatorCovers.js";

export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };

export async function GET(request) {
  const place = String(new URL(request.url).searchParams.get("place") || "").trim();
  if (!/^[\w:.-]{3,120}$/.test(place)) return NextResponse.json({ cover: null }, { status: 400 });
  const covers = await creatorCoversFor([place]);
  return NextResponse.json({ cover: covers[place] || null }, { headers: CACHE });
}
