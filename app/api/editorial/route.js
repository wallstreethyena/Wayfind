// app/api/editorial/route.js — v6.37 EDITORIAL NOTES. Serves the owner's
// three-part editorial voice (Vibe Check / Why Go / Best Move) for a place
// by name. The 288-place data module (lib/editorial.js, ~160 KB) stays
// SERVER-ONLY behind this route so the client bundle gains zero bytes —
// the Detail sheet fetches one tiny JSON per opened place instead (same
// pattern as /api/insider). Cached at the edge for a day: editorial copy
// only changes on deploy.
import { NextResponse } from "next/server";
import { editorialFor, EDITORIAL_COUNT } from "../../../lib/editorial";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" };

export async function GET(req) {
  const u = new URL(req.url);
  const name = String(u.searchParams.get("name") || "").slice(0, 140).trim();
  if (!name) return NextResponse.json({ none: true, count: EDITORIAL_COUNT }, { headers: HEADERS });
  const e = editorialFor(name);
  return NextResponse.json(e ? { editorial: e } : { none: true }, { headers: HEADERS });
}
