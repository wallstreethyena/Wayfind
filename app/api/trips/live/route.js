// Wayfind Live Trips (owner order 2026-11-27): GET my live trips, POST start a
// live copy of a personal trip. Signed-in members only; the session is checked
// with Supabase Auth on every call. Logic and rules: lib/liveTripServer.js.
// Same-origin + per-IP rate limit come from middleware.js.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { liveTripEnv, bearerFrom, handleCreate, handleList } from "../../../../lib/liveTripServer.js";
import { SITE_URL } from "../../../../lib/site";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req) {
  const r = await handleList({ cfg: liveTripEnv(), token: bearerFrom(req) });
  return Response.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function POST(req) {
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const r = await handleCreate({ cfg: liveTripEnv(), token: bearerFrom(req), body, siteUrl: SITE_URL });
  return Response.json(r.body, { status: r.status, headers: NO_STORE });
}
