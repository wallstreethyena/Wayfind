// lib/reservePhone/relayAuth.js - shared secret for the ConversationRelay outcome post.
// The secret is compared in constant time and is never logged. Missing config is off, not open.
import { timingSafeEqual } from "node:crypto";

export function relayAuth(env = {}, header) {
  const secret = String(env.RESERVE_PHONE_RELAY_SECRET || "");
  if (secret.length < 16) return { ok: false, code: "DISABLED" };
  const got = String(header || "");
  const a = Buffer.from(secret);
  const b = Buffer.from(got);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: "BAD_SECRET" };
  return { ok: true };
}
