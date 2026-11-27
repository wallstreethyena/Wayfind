// Community guides (owner order 2026-11-27): a member publishes one of their
// own itineraries as a public guide (POST), lists their guides (GET) or
// unpublishes one (DELETE). Signed in members only; the session is verified on
// every call. Rules and the privacy line: lib/communityGuides.js. Same-origin
// and per-IP limits come from middleware.js; the OpenAI call is capped per
// member per day and by the engine's monthly dollar cap (lib/aiEngine.js).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { tripLogEnv, bearerFrom, verifiedMember } from "../../../lib/tripLogServer.js";
import { publishGuide, unpublishGuide, listOwnGuides } from "../../../lib/communityGuides.js";
import { siteTodayStr } from "../../../lib/siteTime";

const NO_STORE = { "Cache-Control": "no-store" };
const out = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

async function member(req) {
  const cfg = tripLogEnv();
  if (!cfg) return { err: out({ ok: false, code: "unconfigured", error: "Guides are not available right now." }, 503) };
  const token = bearerFrom(req);
  const m = await verifiedMember(cfg, token);
  if (!m) return { err: out({ ok: false, code: "sign_in", error: "Sign in to publish a guide." }, 401) };
  return { cfg, token, m };
}

export async function GET(req) {
  const a = await member(req);
  if (a.err) return a.err;
  const rows = await listOwnGuides(a.cfg, a.token);
  if (!rows) return out({ ok: false, code: "unavailable", error: "Please try again." }, 502);
  return out({ ok: true, guides: rows.map((g) => ({ slug: g.slug, localKey: g.itinerary_key, status: g.status, title: g.title, showAuthor: g.show_author })) });
}

export async function POST(req) {
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const a = await member(req);
  if (a.err) return a.err;
  const r = await publishGuide({ cfg: a.cfg, member: a.m, token: a.token, body, todayStr: siteTodayStr() });
  try { console.log(JSON.stringify({ tag: "community_guide_publish", status: r.status, code: r.body.code || null, writer: r.body.writer || null, cached: r.body.cached === true })); } catch {}
  return out(r.body, r.status);
}

export async function DELETE(req) {
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const a = await member(req);
  if (a.err) return a.err;
  const r = await unpublishGuide({ cfg: a.cfg, member: a.m, slug: body && body.slug });
  return out(r.body, r.status);
}
