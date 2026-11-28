// POST /api/reengage/webhook/resend — Resend delivery events (Svix signed) -> suppression list.
//
//   503 { ok:false, code:"unconfigured" }  WF_RESEND_WEBHOOK_SECRET is not set. Answered BEFORE the body is read.
//                                          No default, no fallback: an unset secret never accepts an event.
//   413                                    body over 65,536 bytes
//   401                                    a missing header or a signature that does not verify (zero database calls)
//   200 { ok:true }                        applied, or an event that does nothing (Temporary bounce, delivered, ...)
//   503 { ok:false, code:"unavailable" }   a store failure: Svix retries
//
// Not behind the same-origin gate or the IP rate limit (middleware.js): the signature IS the
// gate here, and it is checked before any store is touched. All logic lives in lib/resendWebhook.js.
import { MAX_BODY_BYTES, processResendWebhook } from "../../../../../lib/resendWebhook.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

export async function POST(req) {
  if (!String(process.env.WF_RESEND_WEBHOOK_SECRET || "").trim()) return json({ ok: false, code: "unconfigured" }, 503);
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ ok: false, code: "too_large" }, 413);
  let raw = "";
  try { raw = await req.text(); } catch { return json({ ok: false, code: "invalid" }, 400); }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ ok: false, code: "too_large" }, 413);
  const r = await processResendWebhook({ raw, get: (n) => req.headers.get(n) });
  return json(r.body, r.status);
}
