// POST /api/reengage/email — "email me this plan" (re-engagement PR 1).
//
// body { email, consent: true, planRef, anonId, page }
//   200 { ok: true }                         saved (or silently skipped, below)
//   400 { ok: false, code: "invalid" }       bad address, plan reference or anonymous id
//   400 { ok: false, code: "consent" }       the box was not ticked
//   404 { ok: false, code: "plan_expired" }  the 7 day plan snapshot is gone
//   429                                      middleware.js (same-origin + this route's own per-IP limit)
//   503 { ok: false, code: "unconfigured" }  WF_REENGAGE_ENABLED is not "1", or Supabase/Resend env is missing
//   503 { ok: false, code: "unavailable" }   a store or Resend refused the request
//
// The response NEVER echoes the address. The email is built only from the plan
// snapshot the server stored when it built the itinerary (reengage-plan:<planRef>,
// lib/reengageServer.js), not from anything the browser sent. A contact who is
// unsubscribed, bounced or complained, or whose address is on the suppression
// list, still gets { ok: true } and no email: the answer must not reveal who is
// on a list. The same {ok:true} answers a recipient who already got 3 itinerary
// emails in the last 24 hours (nothing sent, nothing queued). An existing
// contact's record is never rewritten, and the address is never in a URL. The
// cap is RESERVE-THEN-COUNT: every request first inserts its own queue row
// (itinerary_email, status sending, a unique dedupe_key), then counts the
// contact's sending+sent rows from the last 24 hours (its own included); over 3
// it marks its row skipped_cap and sends nothing, otherwise it sends and marks
// the row sent or failed. So the same planRef sent again still counts, and
// concurrent requests cannot all slip under the cap. Drip rows (+2h, +24h, +72h)
// are queued only after the first email went out, once per contact and plan;
// the PR 2 dispatcher sends them only to CONFIRMED contacts (confirmed_at, set
// by POST /api/reengage/confirm after the recipient opens "Open my plan").
import { randomUUID } from "node:crypto";
import { cget } from "../../../../lib/serverCache.js";
import { isSyntheticRequest } from "../../../../lib/productionWriteFirewall.js";
import {
  ANON_ID_RX, PLAN_REF_RX, enqueueDrip, isEmailSuppressed, isValidEmail, normalizeEmail,
  planSnapshotKey, countItineraryReservations, finishItinerarySend, reengageConfigured, reserveItinerarySend,
  sanitizePlan, sendItineraryEmail, upsertContact,
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
  // A visitor with Global Privacy Control (or analytics opt out) has no wf_anon_id
  // cookie, but asking for their own plan by email is their explicit choice, not
  // tracking. Absent id -> a fresh server UUID that only keys this request's rows
  // (it is never returned or linked to any browser). A present but malformed id is rejected.
  const rawAnon = typeof body.anonId === "string" ? body.anonId : "";
  if (rawAnon && !ANON_ID_RX.test(rawAnon)) return json({ ok: false, code: "invalid" }, 400);
  const anonId = rawAnon || randomUUID();
  if (!isValidEmail(email) || !PLAN_REF_RX.test(planRef)) return json({ ok: false, code: "invalid" }, 400);
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

  // At most 3 immediate emails per recipient per day: reserve a row, then count
  // (see the header). A failed reservation or count means "do not send".
  const held = await reserveItinerarySend({ anonId, contactId: contact.id, planRef });
  if (!held.ok) return json({ ok: false, code: "unavailable" }, 503);
  const cap = await countItineraryReservations(contact.id);
  if (!cap.ok) {
    await finishItinerarySend(held.id, "failed");
    return json({ ok: false, code: "unavailable" }, 503);
  }
  if (!cap.allowed) {
    await finishItinerarySend(held.id, "skipped_cap");
    return json({ ok: true });
  }

  const sent = await sendItineraryEmail({ to: email, plan, unsubscribeToken: contact.unsubscribe_token, planRef });
  if (!sent.sent) {
    await finishItinerarySend(held.id, "failed");
    return json({ ok: false, code: sent.reason === "unconfigured" ? "unconfigured" : "unavailable" }, 503);
  }
  const settled = await finishItinerarySend(held.id, "sent", { resendId: sent.id });
  if (!settled.ok) console.error("[reengage] send row not settled");
  const queued = await enqueueDrip({ anonId, contactId: contact.id, planRef, plan });
  if (!queued.ok) console.error("[reengage] drip not queued:", queued.reason);
  return json({ ok: true });
}
