// Community leaderboard (owner order 2026-11-27). GET is public: this month's
// top opted in members by public name only, cached five minutes. POST lets a
// signed in member join or leave and set their public name (checked and
// moderated in lib/leaderboard.js). GET with a bearer also returns that
// member's own settings.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { tripLogEnv, bearerFrom, verifiedMember } from "../../../lib/tripLogServer.js";
import { readLeaderboard, readOwnSettings, saveSettings } from "../../../lib/leaderboard.js";
import { siteTodayStr } from "../../../lib/siteTime";

export async function GET(req) {
  const cfg = tripLogEnv();
  if (!cfg) return Response.json({ ok: false, code: "unconfigured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const today = siteTodayStr();
  const rows = await readLeaderboard(cfg, today);
  if (!rows) return Response.json({ ok: false, code: "unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  const token = bearerFrom(req);
  if (token) {
    const m = await verifiedMember(cfg, token);
    const mine = m ? await readOwnSettings(cfg, token) : null;
    return Response.json({ ok: true, month: today.slice(0, 7), leaders: rows, me: mine }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true, month: today.slice(0, 7), leaders: rows }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}

export async function POST(req) {
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const r = await saveSettings({ cfg: tripLogEnv(), token: bearerFrom(req), body });
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
