// POST /api/reengage/push: save this browser's push subscription for re-engagement
// reminders (re-engagement PR 2). Called only by the Yes button of the soft ask
// (lib/reengagePushClient.js enableReengagePush), after the browser's own
// permission dialog said yes.
//
// body (4,096 bytes max) { subscription: { endpoint, keys: { p256dh, auth } }, tz, platform }
//   200 { ok: true }                        saved, or skipped with NO write (below)
//   400 { ok: false, code: "invalid" }      endpoint too long or not an allowed push service,
//                                           or key shapes wrong (same checks as /api/push/web)
//   429                                     middleware.js (same-origin + this route's per-IP limit)
//   503 { ok: false, code: "unconfigured" } re-engagement is off, or the VAPID pair or the
//                                           sealing key is missing. Zero network calls.
//   503 { ok: false, code: "unavailable" }  the store refused the write
//
// The anonymous id comes from the wf_anon_id COOKIE only, never the body. A visitor
// who opted out (Global Privacy Control, analytics suppression) has no cookie and is
// refused here too: they still get { ok: true } and nothing is written. So do
// synthetic requests (bots, verifiers). The answer never reveals which case it was.
// The endpoint exists in the request body only: never a URL, a log line or a response.
// There is no DELETE: turning reminders off is the browser's notification setting; the
// next send gets 404 or 410 and the row is revoked by the dispatcher.
import { isSyntheticRequest } from "../../../../lib/productionWriteFirewall.js";
import { gpcFromHeaders } from "../../../../lib/adConsentRegion.js";
import { isAllowedPushEndpoint, vapidFromEnv } from "../../../../lib/webPush.js";
import { ANON_ID_RX, reengageConfigured } from "../../../../lib/reengageServer.js";
import { pushSubKey } from "../../../../lib/reengagePushCrypto.js";
import { PLATFORMS, savePushSubscription } from "../../../../lib/reengagePushStore.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const MAX_BODY = 4096;
const KEY_RX = /^[A-Za-z0-9_-]+=*$/;
const TZ_RX = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;
const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

// The 4,096 byte limit is enforced BEFORE and WHILE the body is read: a declared
// content-length over the limit is refused without reading anything, and a body
// with no (or a false) length is read chunk by chunk and abandoned at the limit.
async function readCapped(req, max) {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch { /* already closed */ } return null; }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts).toString("utf8");
}

function validTimeZone(tz) {
  if (typeof tz !== "string" || tz.length > 64 || !TZ_RX.test(tz)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

function anonIdFromCookie(req) {
  try {
    const m = String(req.headers.get("cookie") || "").match(/(?:^|;\s*)wf_anon_id=([^;]*)/);
    return m && ANON_ID_RX.test(m[1]) ? m[1] : null;
  } catch { return null; }
}

export async function POST(req) {
  if (!reengageConfigured() || !vapidFromEnv() || !pushSubKey()) return json({ ok: false, code: "unconfigured" }, 503);
  if (isSyntheticRequest(req)) return json({ ok: true });
  const anonId = anonIdFromCookie(req);
  if (!anonId || gpcFromHeaders(req.headers)) return json({ ok: true });

  let body = null;
  try {
    const raw = await readCapped(req, MAX_BODY);
    body = raw === null ? null : JSON.parse(raw);
  } catch { body = null; }
  if (!body || typeof body !== "object") return json({ ok: false, code: "invalid" }, 400);

  const sub = body.subscription;
  const endpoint = sub && typeof sub.endpoint === "string" ? sub.endpoint.trim() : "";
  const p256dh = sub && sub.keys && typeof sub.keys.p256dh === "string" ? sub.keys.p256dh.trim() : "";
  const auth = sub && sub.keys && typeof sub.keys.auth === "string" ? sub.keys.auth.trim() : "";
  if (endpoint.length > 1000 || !isAllowedPushEndpoint(endpoint)) return json({ ok: false, code: "invalid" }, 400);
  if (!KEY_RX.test(p256dh) || p256dh.length < 80 || p256dh.length > 120 || !KEY_RX.test(auth) || auth.length < 16 || auth.length > 40) {
    return json({ ok: false, code: "invalid" }, 400);
  }
  const tz = validTimeZone(body.tz) ? body.tz : "America/New_York";
  const platform = PLATFORMS.includes(body.platform) ? body.platform : null;

  const saved = await savePushSubscription({ anonId, endpoint, p256dh, auth, platform, tz });
  if (!saved.ok) return json({ ok: false, code: "unavailable" }, 503);
  return json({ ok: true });
}
