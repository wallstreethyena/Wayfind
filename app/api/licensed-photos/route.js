// /api/licensed-photos?place=<id>[,<id>...] — for each place, its active
// Wayfind-owned, creator/business-submitted or licensed free photo
// (wf_place_photo, via lib/freePhoto.js findFreePhoto) WITH the credit that
// licence requires. Read-only. NEVER calls Google.
//
// WHY (owner, 2026-09-30). The blog may not show a Google photo without its
// required credit, and prefers, in order: an owned photo, a creator or
// business photo with permission, a licensed free photo, and only then a
// credited Google photo. wf_place_photo holds the first three (one row per
// place), but its service-role read is not public, so this endpoint hands a
// reader exactly what it may show: the served URL plus attribution text,
// attribution link and licence. A row missing any of those is not returned.
import { NextResponse } from "next/server";
import { findFreePhoto } from "../../../lib/freePhoto";
import { isGooglePhotoSrc } from "../../../lib/googlePhotoSrc.js";

export const dynamic = "force-dynamic";

const PLACE_RX = /^[A-Za-z0-9_-]{10,200}$/;
const MAX_PLACES = 40;

export async function GET(req) {
  const u = new URL(req.url);
  const ids = [...new Set(String(u.searchParams.get("place") || "").split(",").map((x) => x.trim()).filter((x) => PLACE_RX.test(x)))].slice(0, MAX_PLACES);
  const headers = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600" };
  if (!ids.length) return NextResponse.json({ photos: [] }, { headers });
  const found = await Promise.all(ids.map(async (placeId) => {
    try {
      const free = await findFreePhoto({ placeId, width: 800 });
      if (!free || !free.url || isGooglePhotoSrc(free.url) || !free.attributionText || !free.attributionUrl || !free.license) return null;
      return { place_id: placeId, url: free.url, attributionText: free.attributionText, attributionUrl: free.attributionUrl, license: free.license, source: free.source || "wikimedia" };
    } catch {
      return null;
    }
  }));
  return NextResponse.json({ photos: found.filter(Boolean) }, { headers });
}
