// scripts/lib/sshSignature.mjs — verify an armored OpenSSH signature (SSHSIG,
// "-----BEGIN SSH SIGNATURE-----") against an OpenSSH public key line, using
// only node:crypto. Pure: no filesystem, environment, network or child process.
//
// WHY THIS EXISTS (2026-11-18). A GitHub comment cannot prove WHO typed it: a
// comment posted through the owner's `gh` CLI OAuth token carries
// user.login=<owner>, type=User and performed_via_github_app=null, identical to
// one the owner typed by hand (proven on issue #2477, 2026-11-14). The only
// evidence an agent holding the owner's GitHub token cannot produce is a
// signature made by a private key that never leaves the owner's hardware. This
// module is the verifier for that signature; scripts/lib/ownerApproval.mjs
// decides what the signature must cover.
//
// Formats followed exactly (OpenSSH PROTOCOL.sshsig and PROTOCOL.u2f):
//
//   armored = BEGIN line, base64 (any line length), END line; nothing else
//   blob    = "SSHSIG" | u32 version(1) | string publickey | string namespace
//             | string reserved | string hash_algorithm | string signature
//   signed  = "SSHSIG" | string namespace | string reserved | string hash_alg
//             | string H(message)                      (H = sha256 or sha512)
//   plain keys (ssh-ed25519, ecdsa-sha2-nistp256): the key signs `signed`.
//   sk-* keys (security keys): the key signs
//             sha256(application) | byte flags | u32 counter | sha256(signed)
//             and flags MUST include user presence (0x01): a touch on the key.
//             Flag 0x04 is user verification (the key's PIN or biometric).
//
// POLICY (optional argument). With no policy this is a generic verifier. A caller
// that must know a PERSON was present passes { requireSecurityKey: true,
// requireUserVerification: true }: the key must then be an sk-* type (a plain key
// file or a Secure-Enclave/agent key cannot prove presence: anything running as
// the user can ask it to sign) and the signed flags must carry 0x04 as well as
// 0x01. The flags are part of the signed data, so they cannot be edited in the blob.
//
// Supported key types: ssh-ed25519, sk-ssh-ed25519@openssh.com,
// ecdsa-sha2-nistp256, sk-ecdsa-sha2-nistp256@openssh.com. Anything else, a
// wrong namespace, an unknown hash algorithm, a key that is not the one named,
// malformed armor, or any trailing bytes is a rejection, never an exception.
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

export const SSH_SIGNATURE_BEGIN = "-----BEGIN SSH SIGNATURE-----";
export const SSH_SIGNATURE_END = "-----END SSH SIGNATURE-----";
export const SSH_SK_FLAG_USER_PRESENCE = 0x01;
export const SSH_SK_FLAG_USER_VERIFICATION = 0x04;
export const SUPPORTED_KEY_TYPES = Object.freeze([
  "ssh-ed25519",
  "sk-ssh-ed25519@openssh.com",
  "ecdsa-sha2-nistp256",
  "sk-ecdsa-sha2-nistp256@openssh.com",
]);
const HASH_ALGS = Object.freeze(["sha256", "sha512"]);
const MAGIC = Buffer.from("SSHSIG", "latin1");
// DER SubjectPublicKeyInfo prefixes that wrap a raw public key for node:crypto.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const P256_SPKI_PREFIX = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");

class Reader {
  constructor(buf) { this.buf = buf; this.at = 0; }
  u8() {
    if (this.at + 1 > this.buf.length) throw new Error("truncated");
    return this.buf[this.at++];
  }
  u32() {
    if (this.at + 4 > this.buf.length) throw new Error("truncated");
    const v = this.buf.readUInt32BE(this.at);
    this.at += 4;
    return v;
  }
  string() {
    const n = this.u32();
    if (this.at + n > this.buf.length) throw new Error("truncated");
    const out = this.buf.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
  done() { return this.at === this.buf.length; }
}

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const str = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(String(b), "utf8"); return Buffer.concat([u32(buf.length), buf]); };

/**
 * The armored signature blocks inside free text (a GitHub comment body), in
 * order, each as the exact armored text. A comment may hold other text around
 * them. Never throws.
 */
export function extractSshSignatureBlocks(text) {
  if (typeof text !== "string") return [];
  const blocks = [];
  const rx = /-----BEGIN SSH SIGNATURE-----[\s\S]*?-----END SSH SIGNATURE-----/g;
  for (const m of text.matchAll(rx)) blocks.push(m[0]);
  return blocks;
}

function decodeArmor(armored) {
  const lines = String(armored).replace(/\r\n/g, "\n").split("\n").map((l) => l.trim());
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length < 3 || lines[0] !== SSH_SIGNATURE_BEGIN || lines[lines.length - 1] !== SSH_SIGNATURE_END) throw new Error("not an armored SSH signature");
  const body = lines.slice(1, -1);
  if (!body.every((l) => /^[A-Za-z0-9+/=]+$/.test(l))) throw new Error("armor contains a line that is not base64");
  const b64 = body.join("");
  const raw = Buffer.from(b64, "base64");
  if (raw.toString("base64") !== b64) throw new Error("armor is not canonical base64");
  return raw;
}

/** Parse the signature blob. Returns { publicKey, namespace, reserved, hashAlg, signature } as Buffers/strings; throws on any malformation or trailing bytes. */
export function parseSshSignature(armored) {
  const r = new Reader(decodeArmor(armored));
  if (!r.buf.subarray(0, 6).equals(MAGIC)) throw new Error("bad magic");
  r.at = 6;
  if (r.u32() !== 1) throw new Error("unsupported signature version");
  const publicKey = r.string();
  const namespace = r.string().toString("utf8");
  const reserved = r.string();
  const hashAlg = r.string().toString("utf8");
  const signature = r.string();
  if (!r.done()) throw new Error("trailing bytes after the signature");
  return { publicKey, namespace, reserved, hashAlg, signature };
}

function parseKeyBlob(blob) {
  const r = new Reader(blob);
  const type = r.string().toString("utf8");
  if (!SUPPORTED_KEY_TYPES.includes(type)) throw new Error(`unsupported key type ${type}`);
  const sk = type.startsWith("sk-");
  const ecdsa = type.includes("ecdsa");
  let curve = null;
  if (ecdsa) curve = r.string().toString("utf8");
  const pub = r.string();
  const application = sk ? r.string() : null;
  if (!r.done()) throw new Error("trailing bytes in the public key");
  if (ecdsa) {
    if (curve !== "nistp256" || pub.length !== 65 || pub[0] !== 4) throw new Error("not an uncompressed NIST P-256 point");
  } else if (pub.length !== 32) {
    throw new Error("an ed25519 public key is 32 bytes");
  }
  return { type, sk, ecdsa, pub, application };
}

/** Parse one OpenSSH public key line ("<type> <base64> [comment]"). Throws if unsupported or malformed. */
export function parseOpenSshPublicKey(line) {
  const parts = String(line).trim().split(/\s+/);
  if (parts.length < 2) throw new Error("not a public key line");
  const [type, b64] = parts;
  if (!SUPPORTED_KEY_TYPES.includes(type)) throw new Error(`unsupported key type ${type}`);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Error("key is not base64");
  const blob = Buffer.from(b64, "base64");
  if (blob.toString("base64") !== b64) throw new Error("key is not canonical base64");
  const key = parseKeyBlob(blob);
  if (key.type !== type) throw new Error("key type does not match its blob");
  return { ...key, blob };
}

function nodeKey(key) {
  const spki = Buffer.concat([key.ecdsa ? P256_SPKI_PREFIX : ED25519_SPKI_PREFIX, key.pub]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

// An SSH mpint to a fixed 32-byte big-endian value (the P-256 r or s).
function mpint32(b) {
  if (!b.length || b[0] & 0x80) throw new Error("bad mpint");
  let v = b;
  while (v.length && v[0] === 0) v = v.subarray(1);
  if (!v.length || v.length > 32) throw new Error("mpint out of range");
  return Buffer.concat([Buffer.alloc(32 - v.length), v]);
}

function parseSignatureBlob(blob, key) {
  const r = new Reader(blob);
  const type = r.string().toString("utf8");
  if (type !== key.type) throw new Error("signature type does not match the key type");
  let raw;
  if (key.ecdsa) {
    const inner = new Reader(r.string());
    const rr = mpint32(inner.string());
    const ss = mpint32(inner.string());
    if (!inner.done()) throw new Error("trailing bytes in the ECDSA signature");
    raw = Buffer.concat([rr, ss]);
  } else {
    raw = r.string();
    if (raw.length !== 64) throw new Error("an ed25519 signature is 64 bytes");
  }
  let flags = null;
  let counter = null;
  if (key.sk) { flags = r.u8(); counter = r.u32(); }
  if (!r.done()) throw new Error("trailing bytes in the signature blob");
  return { raw, flags, counter };
}

/**
 * Verify `armored` over `message` (string or Buffer, exact bytes) for
 * `namespace` against the OpenSSH public key line `publicKeyLine`.
 * Returns { ok: true } or { ok: false, reason }. Never throws.
 * `policy` (optional): { requireSecurityKey, requireUserVerification }, see the header.
 */
export function checkSshSignature({ armored, message, namespace, publicKeyLine, policy }) {
  try {
    if (typeof namespace !== "string" || !namespace) return { ok: false, reason: "no namespace to verify against" };
    const key = parseOpenSshPublicKey(publicKeyLine);
    const needSecurityKey = !!(policy && policy.requireSecurityKey);
    const needUserVerification = !!(policy && policy.requireUserVerification);
    if ((needSecurityKey || needUserVerification) && !key.sk) return { ok: false, reason: `key type ${key.type} is not a security key: it cannot prove that a person was present` };
    const sig = parseSshSignature(armored);
    if (sig.namespace !== namespace) return { ok: false, reason: "signature is for a different namespace" };
    if (!HASH_ALGS.includes(sig.hashAlg)) return { ok: false, reason: `unsupported hash algorithm ${sig.hashAlg}` };
    if (!sig.publicKey.equals(key.blob)) return { ok: false, reason: "signature was made by a different key" };
    const parsed = parseSignatureBlob(sig.signature, key);
    const messageBytes = Buffer.isBuffer(message) ? message : Buffer.from(String(message), "utf8");
    const signedData = Buffer.concat([MAGIC, str(sig.namespace), str(sig.reserved), str(sig.hashAlg), str(createHash(sig.hashAlg).update(messageBytes).digest())]);
    let toVerify = signedData;
    if (key.sk) {
      if (!(parsed.flags & SSH_SK_FLAG_USER_PRESENCE)) return { ok: false, reason: "security-key signature without user presence (no touch)" };
      if (needUserVerification && !(parsed.flags & SSH_SK_FLAG_USER_VERIFICATION)) return { ok: false, reason: "security-key signature without user verification (no PIN)" };
      toVerify = Buffer.concat([createHash("sha256").update(key.application).digest(), Buffer.from([parsed.flags]), u32(parsed.counter), createHash("sha256").update(signedData).digest()]);
    }
    const pub = nodeKey(key);
    const good = key.ecdsa
      ? cryptoVerify("sha256", toVerify, { key: pub, dsaEncoding: "ieee-p1363" }, parsed.raw)
      : cryptoVerify(null, toVerify, pub, parsed.raw);
    return good ? { ok: true } : { ok: false, reason: "signature does not verify" };
  } catch (e) {
    return { ok: false, reason: `malformed: ${e && e.message ? e.message : "error"}` };
  }
}

/** Boolean form of checkSshSignature. Never throws. */
export function verifySshSignature(args) {
  return checkSshSignature(args).ok === true;
}
