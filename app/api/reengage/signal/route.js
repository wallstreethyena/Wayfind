// POST /api/reengage/signal — one client signal for re-engagement (PR 2).
//
// body (1,024 bytes max) { kind, path?, planRef? }
//   kind     itinerary_generated | hub_view | return_visit. Anything else, out_click
//            included (only the server's own redirect seam writes that), is 400.
//   path     must match ^/[A-Za-z0-9/_-]{0,119}$ or it is stored null
//   planRef  must match PLAN_REF_RX; read only for itinerary_generated
//   503 { ok:false, code:"unconfigured" }  re-engagement is not switched on (zero calls)
//   200 { ok:true } and ZERO writes        synthetic request, no wf_anon_id cookie, or Global Privacy Control
//   400 { ok:false, code:"invalid" }
//   200 { ok:true }                        otherwise, ALWAYS: the answer never reveals what was queued
//
// The anonymous id comes from the wf_anon_id COOKIE only, never the body, and an opted out
// visitor has no cookie, so they are refused here as well as in the browser. Rate limits and
// the same-origin gate live in middleware.js.
import { isSyntheticRequest } from "../../../../lib/productionWriteFirewall.js";
import { gpcFromHeaders } from "../../../../lib/adConsentRegion.js";
import { PLAN_REF_RX, reengageConfigured } from "../../../../lib/reengageServer.js";
import { PATH_RX, SIGNAL_KINDS, anonIdFromCookieHeader, handleSignal } from "../../../../lib/reengageOrchestrate.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const MAX_BODY = 1024;
const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

export async function POST(req) {
  if (!reengageConfigured()) return json({ ok: false, code: "unconfigured" }, 503);
  if (isSyntheticRequest(req)) return json({ ok: true });
  if (gpcFromHeaders(req.headers)) return json({ ok: true });
  const anonId = anonIdFromCookieHeader(req.headers.get("cookie"));
  if (!anonId) return json({ ok: true });

  let body = null;
  try {
    const raw = await req.text();
    body = raw.length <= MAX_BODY ? JSON.parse(raw) : null;
  } catch { body = null; }
  if (!body || typeof body !== "object" || !SIGNAL_KINDS.includes(body.kind)) return json({ ok: false, code: "invalid" }, 400);

  const path = typeof body.path === "string" && PATH_RX.test(body.path) ? body.path : null;
  const planRef = body.kind === "itinerary_generated" && typeof body.planRef === "string" && PLAN_REF_RX.test(body.planRef) ? body.planRef : null;
  await handleSignal({ anonId, kind: body.kind, path, planRef });
  return json({ ok: true });
}
