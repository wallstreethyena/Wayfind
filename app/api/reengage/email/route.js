// POST /api/reengage/email — "email me this plan" (re-engagement PR 1).
//
// body { email, consent: true, planRef, anonId, page }
//   200 { ok: true }                         saved (or silently skipped, below)
//   400 { ok: false, code: "invalid" }       bad address, plan reference or anonymous id
//   400 { ok: false, code: "consent" }       the box was not ticked
//   404 { ok: false, code: "plan_expired" }  the 7 day plan snapshot is gone
//   429                                      middleware.js (same-origin + per-IP limit)
//   503 { ok: false, code: "unconfigured" }  WF_REENGAGE_ENABLED is not "1", or Supabase/Resend env is missing
//   503 { ok: false, code: "unavailable" }   a store or Resend refused the request
//
// The response NEVER echoes the address. The email is built only from the plan
// snapshot the server stored when it built the itinerary (reengage-plan:<planRef>,
// lib/reengageServer.js), not from anything the browser sent. A contact who is
// unsubscribed, bounced or complained, or whose address is on the suppression
// list, still gets { ok: true } and no email: the answer must not reveal who is
// on a list. Drip rows (+2h, +24h, +72h) are queued only after the first email
// went out, and queueing twice adds nothing.
import { cget } from "../../../../lib/serverCache.js";
import { isSyntheticRequest } from "../../../../lib/productionWriteFirewall.js";
import {
  ANON_ID_RX, PLAN_REF_RX, enqueueDrip, isEmailSuppressed, isValidEmail, normalizeEmail,
  planSnapshotKey, reengageConfigured, sanitizePlan, sendItineraryEmail, upsertContact,
} from "../../../../lib/reengageServer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const MAX_BODY = 4096;
const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

export async function POST(req) {
  if (!reengageConfigured()) return json({ ok: false, code: "unconfigured" }, 503);
  if (isSyntheticRequest(req)) return json({ ok: true });

  let body = null;
  try {
    const raw = await req.text();
    body = raw.length <= MAX_BODY ? JSON.parse(raw) : null;
  } catch { body = null; }
  if (!body || typeof body !== "object") return json({ ok: false, code: "invalid" }, 400);

  const email = normalizeEmail(body.email);
  const planRef = typeof body.planRef === "string" ? body.planRef : "";
  const anonId = typeof body.anonId === "string" ? body.anonId : "";
  if (!isValidEmail(email) || !PLAN_REF_RX.test(planRef) || !ANON_ID_RX.test(anonId)) return json({ ok: false, code: "invalid" }, 400);
  if (body.consent !== true) return json({ ok: false, code: "consent" }, 400);

  const hit = await cget(planSnapshotKey(planRef)).catch(() => null);
  const plan = sanitizePlan(hit && hit.v);
  if (!plan) return json({ ok: false, code: "plan_expired" }, 404);

  const page = typeof body.page === "string" ? body.page : null;
  const saved = await upsertContact({ email, anonId, page });
  if (!saved.ok) return json({ ok: false, code: saved.reason === "unconfigured" ? "unconfigured" : "unavailable" }, 503);
  const contact = saved.contact;

  // Opted out, bounced, complained or suppressed: say yes, send nothing.
  const sup = await isEmailSuppressed(email);
  if (!sup.ok) return json({ ok: false, code: "unavailable" }, 503);
  if (contact.status !== "subscribed" || sup.suppressed) return json({ ok: true });

  const sent = await sendItineraryEmail({ to: email, plan, unsubscribeToken: contact.unsubscribe_token, planRef });
  if (!sent.sent) return json({ ok: false, code: sent.reason === "unconfigured" ? "unconfigured" : "unavailable" }, 503);

  const queued = await enqueueDrip({ anonId, contactId: contact.id, planRef, plan });
  if (!queued.ok) console.error("[reengage] drip not queued:", queued.reason);
  return json({ ok: true });
}
