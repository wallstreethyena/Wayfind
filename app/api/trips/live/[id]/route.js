// Wayfind Live Trips: GET a member snapshot (?since=<revision> answers 304 when
// nothing changed, so the polling fallback costs almost nothing); POST
// preview / join / leave / remove_member / rotate_link / end.
// Rules: lib/liveTripServer.js. Same-origin + per-IP limits: middleware.js.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { liveTripEnv, bearerFrom, handleGet, handlePreview, handleJoin, handleAdmin } from "../../../../../lib/liveTripServer.js";
import { SITE_URL } from "../../../../../lib/site";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req, { params }) {
  const { id } = await params;
  const since = new URL(req.url).searchParams.get("since");
  const r = await handleGet({ cfg: liveTripEnv(), token: bearerFrom(req), id, since: since != null && /^\d{1,9}$/.test(since) ? Number(since) : null, siteUrl: SITE_URL });
  if (r.status === 304) return new Response(null, { status: 304, headers: NO_STORE });
  return Response.json(r.body, { status: r.status, headers: NO_STORE });
}

export async function POST(req, { params }) {
  const { id } = await params;
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const action = body && body.action;
  const cfg = liveTripEnv();
  const token = bearerFrom(req);
  let r;
  if (action === "preview") r = await handlePreview({ cfg, id, code: body.code });
  else if (action === "join") r = await handleJoin({ cfg, token, id, code: body.code, siteUrl: SITE_URL });
  else r = await handleAdmin({ cfg, token, id, body, siteUrl: SITE_URL });
  return Response.json(r.body, { status: r.status, headers: NO_STORE });
}
