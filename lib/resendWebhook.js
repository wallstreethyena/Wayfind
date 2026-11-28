// lib/resendWebhook.js — SERVER-ONLY. Resend delivery webhooks (Svix signed) -> the
// suppression list. A hard bounce, a complaint, a Resend side suppression or an unsubscribe
// stops all future email to that address: the suppression row is what the dispatcher
// re-checks at send time, and the contact row and pending queue rows are updated beside it.
//
// SIGNATURE (checked against the example Resend publishes at
// resend.com/docs/webhooks/verify-webhooks-requests, see scripts/test-reengage-edges.mjs):
//   base64( HMAC_SHA256( base64decode(secret minus "whsec_"), id + "." + timestamp + "." + rawBody ) )
// The svix-signature header is space separated "v1,<sig>" entries; any one may match. The
// timestamp must be within 300 seconds. Compared with timingSafeEqual on equal length buffers.
//
// PAYLOADS (read from resend.com/docs/webhooks/emails/bounced and contacts/updated):
//   email.bounced      data.to[], data.bounce.type "Permanent" | "Temporary" (only Permanent acts)
//   email.complained   data.to[]
//   email.suppressed   data.to[]
//   contact.updated    data.email, data.unsubscribed (boolean; only true acts)
// Everything else answers 200 and writes nothing.
//
// PII: the address is hashed with emailHash on arrival. It is never logged, never in a URL
// and never in a response. Only the hash reaches the database.
import { createHmac, timingSafeEqual } from "node:crypto";
import { sbEnv } from "./serverCache.js";
import { cancelPendingFor, emailHash, isValidEmail, normalizeEmail } from "./reengageServer.js";
import { T_CONTACTS, T_SUPPRESS, sbRest } from "./reengageOrchestrate.js";

export const MAX_BODY_BYTES = 65536;
export const MAX_SKEW_S = 300;
export const MAX_ADDRESSES = 5;
const SVIX_ID_RX = /^[A-Za-z0-9_-]{1,80}$/;

/** True only when `signature` (the svix-signature header) holds a v1 entry matching this exact message. */
export function verifySvix({ id, timestamp, signature, raw, secret, now = Date.now() } = {}) {
  try {
    if (!secret || typeof secret !== "string" || !SVIX_ID_RX.test(String(id || "")) || !/^\d{1,12}$/.test(String(timestamp || "")) || typeof signature !== "string" || typeof raw !== "string") return false;
    if (!Number.isFinite(now) || !(Math.abs(Math.floor(now / 1000) - Number(timestamp)) <= MAX_SKEW_S)) return false;
    const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
    if (!key.length) return false;
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest();
    let match = false;
    for (const entry of signature.split(" ")) {
      const [ver, sig] = entry.split(",");
      if (ver !== "v1" || !sig) continue;
      const got = Buffer.from(sig, "base64");
      if (got.length === expected.length && timingSafeEqual(got, expected)) match = true;
    }
    return match;
  } catch { return false; }
}

/** What an event means: { kind, status, source, addresses } or null when it does nothing. */
export function suppressionFor(evt) {
  try {
    const type = evt && evt.type;
    const d = (evt && evt.data) || {};
    const to = () => (Array.isArray(d.to) ? d.to.filter((a) => typeof a === "string") : []);
    if (type === "email.bounced") return d.bounce && d.bounce.type === "Permanent" ? { kind: "hard_bounce", status: "bounced", source: "resend_bounce", addresses: to() } : null;
    if (type === "email.complained") return { kind: "complaint", status: "complained", source: "resend_complaint", addresses: to() };
    if (type === "email.suppressed") return { kind: "hard_bounce", status: "bounced", source: "resend_suppressed", addresses: to() };
    if (type === "contact.updated") return d.unsubscribed === true && typeof d.email === "string" ? { kind: "unsubscribe", status: "unsubscribed", source: "resend_contact", addresses: [d.email] } : null;
    return null;
  } catch { return null; }
}

/**
 * Verify, then apply. `get` reads a header. Returns { status, body }. Failure to verify is a 401
 * with ZERO database calls; a store failure is a 503 so Svix retries.
 */
export async function processResendWebhook({ raw, get, env = process.env, sb = sbEnv(), fetchImpl = fetch, now = Date.now() }) {
  const secret = String(env.WF_RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) return { status: 503, body: { ok: false, code: "unconfigured" } };
  const id = get("svix-id"); const timestamp = get("svix-timestamp"); const signature = get("svix-signature");
  if (!id || !timestamp || !signature || !verifySvix({ id, timestamp, signature, raw, secret, now })) return { status: 401, body: { ok: false, code: "unauthorized" } };
  let evt = null;
  try { evt = JSON.parse(raw); } catch { evt = null; }
  if (!evt || typeof evt !== "object") return { status: 400, body: { ok: false, code: "invalid" } };
  const s = suppressionFor(evt);
  if (!s) return { status: 200, body: { ok: true } };
  if (!sb) return { status: 503, body: { ok: false, code: "unconfigured" } };
  const at = new Date(now).toISOString();
  const seen = new Set();
  let index = 0;
  for (const address of s.addresses.slice(0, MAX_ADDRESSES)) {
    const i = index++;
    const addr = normalizeEmail(address);
    if (!isValidEmail(addr)) continue;
    const hash = emailHash(addr);
    if (seen.has(hash)) continue;
    seen.add(hash);
    try {
      const sup = await sbRest(sb, `${T_SUPPRESS}?on_conflict=provider_event_id`, {
        method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ email_hash: hash, kind: s.kind, source: s.source, provider_event_id: `resend:${id}:${i}` }),
      }, fetchImpl);
      if (!sup.ok) return { status: 503, body: { ok: false, code: "unavailable" } };
      const patch = await sbRest(sb, `${T_CONTACTS}?email_hash=eq.${hash}&status=eq.subscribed&select=id`, {
        method: "PATCH", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: s.status, updated_at: at, ...(s.status === "unsubscribed" ? { unsubscribed_at: at } : {}) }),
      }, fetchImpl);
      if (!patch.ok) return { status: 503, body: { ok: false, code: "unavailable" } };
      const rows = await patch.json().catch(() => null);
      let contactId = Array.isArray(rows) && rows[0] ? Number(rows[0].id) : null;
      if (contactId == null) {
        // Nothing was flipped: either there is no contact, or a first delivery already flipped it and then failed before
        // the cancel. Look the contact up by hash so a Svix retry still cancels its pending rows (the cancel is idempotent).
        const known = await sbRest(sb, `${T_CONTACTS}?email_hash=eq.${hash}&select=id&limit=1`, {}, fetchImpl);
        if (!known.ok) return { status: 503, body: { ok: false, code: "unavailable" } };
        const found = await known.json().catch(() => null);
        if (!Array.isArray(found)) return { status: 503, body: { ok: false, code: "unavailable" } };
        contactId = found[0] ? Number(found[0].id) : null;
      }
      if (contactId != null && Number.isFinite(contactId)) {
        const c = await cancelPendingFor(null, s.kind, { contactId, sb, fetchImpl });
        if (!c.ok) return { status: 503, body: { ok: false, code: "unavailable" } };
      }
    } catch { return { status: 503, body: { ok: false, code: "unavailable" } }; }
  }
  return { status: 200, body: { ok: true } };
}
