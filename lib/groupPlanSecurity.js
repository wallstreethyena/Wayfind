// Server-only capabilities. Never import this module in a client component.
import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

export const GROUP_PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET = /^[a-f0-9]{64}$/;
const MAC = /^[A-Za-z0-9_-]{43}$/;

export function newGroupPlanSecret() { return randomBytes(32).toString("hex"); }
function sign(secret, value) {
  if (!SECRET.test(String(secret || ""))) throw new Error("Invalid group plan signing secret");
  return createHmac("sha256", Buffer.from(secret, "hex")).update(value).digest("base64url");
}
function equal(a, b) {
  return MAC.test(String(a || "")) && MAC.test(String(b || ""))
    && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function inviteCapability(plan, slot, secret) {
  return `${slot.id}.${sign(secret, `group-plan/v1/invite/${plan.id}/${slot.id}/${slot.inviteVersion}`)}`;
}
export function verifyInviteCapability(plan, token, secret, now = Date.now()) {
  if (!plan || ["draft", "cancelled"].includes(plan.status)
      || !Number.isFinite(Date.parse(plan.createdAt)) || now > Date.parse(plan.createdAt) + 120 * 86400000) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !GROUP_PLAN_ID.test(parts[0])) return null;
  const slot = plan.invitees?.find((s) => s.id === parts[0]);
  if (!slot) return null;
  const expected = inviteCapability(plan, slot, secret).split(".")[1];
  return equal(parts[1], expected) ? slot.id : null;
}
export function finalCapability(plan, secret) {
  if (plan.status !== "finalized" || !plan.finalPlan) return null;
  return sign(secret, `group-plan/v1/final/${plan.id}/${plan.revision}`);
}
export function verifyFinalCapability(plan, token, secret, now = Date.now()) {
  if (!plan || plan.status !== "finalized" || now > Date.parse(plan.createdAt) + 120 * 86400000) return false;
  return equal(token, finalCapability(plan, secret));
}
export function groupRateKey(scope, value) {
  return createHash("sha256").update(`group-plan/v1/${scope}/${String(value)}`).digest("hex");
}

/** Require the browser's exact same-origin POST, never a forwarded Host guess. */
export function sameOriginGroupRequest(req) {
  try {
    const own = new URL(req.url).origin;
    return req.headers.get("origin") === own
      && !["cross-site", "none"].includes(req.headers.get("sec-fetch-site"))
      && /^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "");
  } catch { return false; }
}

export async function readGroupJson(req, maxBytes = 16000) {
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw Object.assign(new Error("Request is too large"), { code: "BODY_TOO_LARGE", status: 413 });
  // Read the stream with an actual byte ceiling; a missing length cannot bypass it.
  const reader = req.body?.getReader();
  if (!reader) throw Object.assign(new Error("A JSON request is required"), { code: "INVALID_JSON", status: 400 });
  let size = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw Object.assign(new Error("Request is too large"), { code: "BODY_TOO_LARGE", status: 413 }); }
      chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value;
  } catch (e) {
    if (e.code === "BODY_TOO_LARGE") throw e;
    throw Object.assign(new Error("The request could not be read"), { code: "INVALID_JSON", status: 400 });
  }
}
