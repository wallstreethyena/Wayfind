// Web push subscribe (POST) and unsubscribe (DELETE) for the opt-in daily
// pick (owner order 2026-11-27). Signed in members only: the pick is built
// from their own activity, so an anonymous subscription would have nothing to
// say. The browser asks permission only after the member taps "Turn on"
// (lib/webPushClient.js). Endpoints are checked against the known push
// services (lib/webPush.js isAllowedPushEndpoint) so a stored endpoint can
// never point the sender at an arbitrary URL. At most five browsers a member.
// Limits and quiet hours: lib/dailyPicks.js.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { tripLogEnv, bearerFrom, verifiedMember } from "../../../../lib/tripLogServer.js";
import { isAllowedPushEndpoint, vapidFromEnv } from "../../../../lib/webPush.js";
import { MAX_SUBS_PER_MEMBER } from "../../../../lib/dailyPicks.js";

const NO_STORE = { "Cache-Control": "no-store" };
const out = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });
const KEY_RX = /^[A-Za-z0-9_-]+=*$/;
const TZ_RX = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;

async function auth(req) {
  const cfg = tripLogEnv();
  if (!cfg) return { err: out({ ok: false, code: "unconfigured", error: "Notifications are not available right now." }, 503) };
  const m = await verifiedMember(cfg, bearerFrom(req));
  if (!m) return { err: out({ ok: false, code: "signed_out", error: "Sign in to get daily picks." }, 401) };
  return { cfg, m };
}
const svc = (cfg, extra = {}) => ({ apikey: cfg.service, Authorization: "Bearer " + cfg.service, ...extra });

export async function POST(req) {
  if (!vapidFromEnv()) return out({ ok: false, code: "unconfigured", error: "Notifications are not available right now." }, 503);
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const a = await auth(req);
  if (a.err) return a.err;
  const sub = body && body.subscription;
  const endpoint = sub && typeof sub.endpoint === "string" ? sub.endpoint.trim() : "";
  const p256dh = sub && sub.keys && typeof sub.keys.p256dh === "string" ? sub.keys.p256dh.trim() : "";
  const authKey = sub && sub.keys && typeof sub.keys.auth === "string" ? sub.keys.auth.trim() : "";
  if (endpoint.length > 1000 || !isAllowedPushEndpoint(endpoint)) return out({ ok: false, code: "invalid", error: "This browser's notifications are not supported." }, 400);
  if (!KEY_RX.test(p256dh) || p256dh.length < 80 || p256dh.length > 120 || !KEY_RX.test(authKey) || authKey.length < 16 || authKey.length > 40) return out({ ok: false, code: "invalid", error: "This browser's notifications are not supported." }, 400);
  const tz = typeof body.tz === "string" && TZ_RX.test(body.tz) && body.tz.length <= 64 ? body.tz : "America/New_York";

  // Cap browsers per member: keep the newest four, then add this one.
  const lr = await fetch(`${a.cfg.url}/rest/v1/wf_web_push_subscriptions?user_id=eq.${a.m.id}&select=id,endpoint&order=updated_at.desc`, { headers: svc(a.cfg), cache: "no-store" });
  if (!lr.ok) return out({ ok: false, code: "server", error: "Please try again." }, 502);
  const mine = (await lr.json()) || [];
  const others = mine.filter((x) => x.endpoint !== endpoint);
  const drop = others.slice(MAX_SUBS_PER_MEMBER - 1).map((x) => x.id);
  if (drop.length) await fetch(`${a.cfg.url}/rest/v1/wf_web_push_subscriptions?id=in.(${drop.join(",")})`, { method: "DELETE", headers: svc(a.cfg, { Prefer: "return=minimal" }), cache: "no-store" });

  const up = await fetch(`${a.cfg.url}/rest/v1/wf_web_push_subscriptions?on_conflict=endpoint`, {
    method: "POST",
    headers: svc(a.cfg, { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ user_id: a.m.id, endpoint, p256dh, auth: authKey, tz, fail_count: 0, updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!up.ok) return out({ ok: false, code: "server", error: "We could not turn on notifications. Please try again." }, 502);
  return out({ ok: true, code: "enabled" });
}

export async function DELETE(req) {
  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const a = await auth(req);
  if (a.err) return a.err;
  const endpoint = body && typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const filter = endpoint && endpoint.length <= 1000 ? `&endpoint=eq.${encodeURIComponent(endpoint)}` : "";
  // No endpoint: the member turned daily picks off everywhere.
  const r = await fetch(`${a.cfg.url}/rest/v1/wf_web_push_subscriptions?user_id=eq.${a.m.id}${filter}`, { method: "DELETE", headers: svc(a.cfg, { Prefer: "return=minimal" }), cache: "no-store" });
  if (!r.ok) return out({ ok: false, code: "server", error: "Please try again." }, 502);
  return out({ ok: true });
}

export async function GET(req) {
  const a = await auth(req);
  if (a.err) return a.err;
  const r = await fetch(`${a.cfg.url}/rest/v1/wf_web_push_subscriptions?user_id=eq.${a.m.id}&select=endpoint`, { headers: svc(a.cfg), cache: "no-store" });
  if (!r.ok) return out({ ok: false, code: "server" }, 502);
  const rows = (await r.json()) || [];
  return out({ ok: true, count: rows.length, endpoints: rows.map((x) => x.endpoint) });
}
