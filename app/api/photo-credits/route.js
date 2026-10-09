// /api/photo-credits?place=<id>[,<id>...] — returns { credits: [] } always.
//
// COMPLIANCE (2026-10-08). Google Maps Platform Terms 3.2.3 forbid storing
// Google Maps Content, and Google's Place Photos page says "You cannot cache a
// photo name". The credits table (wf_photo_credit) and the photo| cache rows
// this route used to join are no longer written or read. The response shape
// is kept so consumers (the blog) keep working; they get an empty list.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ credits: [] }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600" } });
}
