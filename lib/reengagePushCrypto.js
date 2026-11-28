// lib/reengagePushCrypto.js — SERVER-ONLY. Seals the push endpoint and keys stored in
// wf_reengage_push_subs. Key: HKDF-SHA256 of the VAPID private key with its own info
// label, so it is never the VAPID key itself. AES-256-GCM, random 12 byte IV, the
// column name as AAD (a sealed endpoint cannot be read back as keys).
// Format: v1.<iv>.<ciphertext>.<tag>, each base64url. Never logs anything.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

export const PUSH_SUB_INFO = "wf-reengage-push-sub-v1";
const FIELDS = new Set(["endpoint", "keys"]);

export function pushSubKey(env = process.env) {
  const raw = String(env.WF_VAPID_PRIVATE_KEY || "").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const ikm = Buffer.from(raw, "base64url");
  if (ikm.length !== 32) return null;
  return Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), PUSH_SUB_INFO, 32));
}

export function sealField(plain, field, { env = process.env, iv = randomBytes(12) } = {}) {
  const key = pushSubKey(env);
  if (!key || typeof plain !== "string" || !plain || !FIELDS.has(field) || iv.length !== 12) return null;
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from("wf-reengage:" + field));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), ct.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
}

export function openField(sealed, field, { env = process.env } = {}) {
  try {
    const key = pushSubKey(env);
    const p = String(sealed || "").split(".");
    if (!key || p.length !== 4 || p[0] !== "v1" || !FIELDS.has(field)) return null;
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(p[1], "base64url"));
    d.setAAD(Buffer.from("wf-reengage:" + field));
    d.setAuthTag(Buffer.from(p[3], "base64url"));
    return Buffer.concat([d.update(Buffer.from(p[2], "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}

export function endpointHash(endpoint) {
  return createHash("sha256").update(String(endpoint)).digest("hex");
}
