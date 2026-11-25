// Log your visit (POST) and read your rewards (GET). Owner order 2026-11-25.
// Signed in members only; the session is verified with Supabase Auth on every
// call. Logic and the reasons for each rule: lib/tripLogServer.js and
// lib/rewards.js. Same-origin + per-IP rate limit come from middleware.js.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { tripLogEnv, bearerFrom, handleTripLog, handleRewardsRead } from "../../../lib/tripLogServer.js";
import { siteTodayStr } from "../../../lib/siteTime";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req) {
  const r = await handleRewardsRead({ cfg: tripLogEnv(), token: bearerFrom(req), todayStr: siteTodayStr() });
  return Response.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function POST(req) {
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  if (!body || typeof body !== "object") return Response.json({ ok: false, code: "invalid", error: "Pick a place or event to log." }, { status: 400, headers: NO_STORE });
  const r = await handleTripLog({ cfg: tripLogEnv(), token: bearerFrom(req), body, todayStr: siteTodayStr() });
  return Response.json(r.body, { status: r.status, headers: NO_STORE });
}
