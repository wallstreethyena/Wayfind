// scripts/lib/ownerSigningTestkit.mjs — TEST-ONLY helpers for the owner-approval
// tests. Never imported by production code or by any workflow.
//
// An approval now needs a real SSH signature by a SECURITY-KEY line in
// OWNER_SIGNING_KEYS (scripts/lib/ownerApproval.mjs) whose flags carry user
// presence AND user verification (0x05); the list is empty until the owner adds
// his FIDO key. The tests therefore (1) make throwaway keys: synthetic sk-* keys
// built with node:crypto per PROTOCOL.sshsig + PROTOCOL.u2f for every APPROVAL flow
// (makeSigner(dir, "sk-ed25519" | "sk-ecdsa"), flags 0x05 by default), and plain
// ssh-keygen keys (makeSigner(dir, "ed25519" | "ecdsa")) for the generic verifier
// tests and for proving that a plain key is refused for approval, (2) sign real
// approval messages with them, and (3) where a test
// runs the REAL guard or gate script as a child process (or imports a module that
// reads the constant), substitute the key list into a copy of ownerApproval.mjs
// as it is loaded, through a Node module-loader hook. The rule code is unchanged;
// only the constant's value differs. A test that depends on the substitution
// asserts an approval PASSES, so a hook that silently did nothing shows as a failure.
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { join } from "node:path";

// Deliberately NOT imported from ownerApproval.mjs: this file is an independent
// statement of the message format (so a drift in the rule code is caught), and
// importing the module here would load it before the key-injection hook exists.
const NAMESPACE = "wayfind-owner-approve";
export const approvalMessageLiteral = (sha) => `wayfind-owner-approve v1\nrepo=wallstreethyena/Wayfind\nsha=${sha}`;

let keyN = 0;
const cache = new Map();

// ── synthetic security keys (no hardware): node:crypto per PROTOCOL.sshsig + PROTOCOL.u2f ──
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const S_ = (x) => { const b = Buffer.isBuffer(x) ? x : Buffer.from(x); return Buffer.concat([u32(b.length), b]); };
const sha256 = (b) => createHash("sha256").update(b).digest();
const mpint = (b) => { let v = b; while (v.length > 1 && v[0] === 0) v = v.subarray(1); return v[0] & 0x80 ? Buffer.concat([Buffer.from([0]), v]) : v; };
const SK_APPLICATION = "ssh:";
/** The armored form ssh-keygen writes: base64 wrapped at 70 columns. */
export const armorOf = (buf) => `-----BEGIN SSH SIGNATURE-----\n${buf.toString("base64").match(/.{1,70}/g).join("\n")}\n-----END SSH SIGNATURE-----\n`;
/** Flags of a security-key signature: 0x01 user presence (touch), 0x04 user verification (PIN). Approval needs both. */
export const SK_FLAGS_PRESENCE_AND_PIN = 0x05;

function makeSkSigner(kind) {
  let signer;
  if (kind === "ed25519") {
    const kp = generateKeyPairSync("ed25519");
    const raw = kp.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
    const type = "sk-ssh-ed25519@openssh.com";
    const keyBlob = Buffer.concat([S_(type), S_(raw), S_(SK_APPLICATION)]);
    signer = { type, keyBlob, sigBody: (data) => S_(cryptoSign(null, data, kp.privateKey)) };
  } else {
    const kp = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = kp.publicKey.export({ format: "jwk" });
    const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
    const type = "sk-ecdsa-sha2-nistp256@openssh.com";
    const keyBlob = Buffer.concat([S_(type), S_("nistp256"), S_(point), S_(SK_APPLICATION)]);
    signer = { type, keyBlob, sigBody: (data) => { const rs = cryptoSign("sha256", data, { key: kp.privateKey, dsaEncoding: "ieee-p1363" }); return S_(Buffer.concat([S_(mpint(rs.subarray(0, 32))), S_(mpint(rs.subarray(32)))])); } };
  }
  signer.sk = true;
  signer.publicLine = `${signer.type} ${signer.keyBlob.toString("base64")} test-sk`;
  return signer;
}

/**
 * A security-key signature over `message` by synthetic `signer`. signedFlags are the flags the key signs
 * (default 0x05, touch and PIN); blobFlags are the flags written in the signature blob (default: the
 * same; set it differently to prove the flags are covered by the signature).
 */
export function skSign(signer, { message, namespace = NAMESPACE, hashAlg = "sha512", signedFlags = SK_FLAGS_PRESENCE_AND_PIN, blobFlags = signedFlags, counter = 7 }) {
  const signed = Buffer.concat([Buffer.from("SSHSIG"), S_(namespace), S_(""), S_(hashAlg), S_(createHash(hashAlg).update(message).digest())]);
  const u2f = Buffer.concat([sha256(SK_APPLICATION), Buffer.from([signedFlags]), u32(counter), sha256(signed)]);
  const sigBlob = Buffer.concat([S_(signer.type), signer.sigBody(u2f), Buffer.from([blobFlags]), u32(counter)]);
  return armorOf(Buffer.concat([Buffer.from("SSHSIG"), u32(1), S_(signer.keyBlob), S_(namespace), S_(""), S_(hashAlg), S_(sigBlob)]));
}

/**
 * A fresh throwaway key. type "sk-ed25519" | "sk-ecdsa": a synthetic security key (no files; the key
 * every approval flow uses). type "ed25519" | "ecdsa": a plain key made by ssh-keygen in `dir`
 * ({ keyPath, publicLine }), which the approval policy must REFUSE.
 */
export function makeSigner(dir, type = "sk-ed25519") {
  if (type === "sk-ed25519") return makeSkSigner("ed25519");
  if (type === "sk-ecdsa") return makeSkSigner("ecdsa");
  mkdirSync(dir, { recursive: true });
  const keyPath = join(dir, `signer-${type}-${++keyN}`);
  execFileSync("ssh-keygen", ["-q", "-t", type, ...(type === "ecdsa" ? ["-b", "256"] : []), "-N", "", "-C", "test-signer", "-f", keyPath], { stdio: ["ignore", "pipe", "pipe"] });
  return { keyPath, publicLine: readFileSync(`${keyPath}.pub`, "utf8").trim() };
}

/** Sign the exact bytes of `message` in `namespace` (security keys: flags 0x05 unless `flags` says otherwise; plain keys: ssh-keygen -Y sign). Returns the armored signature. */
export function sshSign(signer, message, namespace = NAMESPACE, flags = SK_FLAGS_PRESENCE_AND_PIN) {
  if (signer.sk) return skSign(signer, { message, namespace, signedFlags: flags });
  const file = `${signer.keyPath}.msg-${++keyN}`;
  writeFileSync(file, message);
  execFileSync("ssh-keygen", ["-Y", "sign", "-q", "-n", namespace, "-f", signer.keyPath, file], { stdio: ["ignore", "pipe", "pipe"] });
  return readFileSync(`${file}.sig`, "utf8");
}

/** The signature block for the real approval message of `sha` (security keys sign flags 0x05 unless `flags` says otherwise). */
export function approvalSignature(signer, sha, flags = SK_FLAGS_PRESENCE_AND_PIN) {
  const k = `${signer.keyPath || signer.publicLine}|${sha}|${flags}`;
  if (!cache.has(k)) cache.set(k, sshSign(signer, approvalMessageLiteral(sha), NAMESPACE, flags));
  return cache.get(k);
}

/** A complete approval comment body: the command line plus the signature block. */
export function signedApprovalBody(signer, sha, flags = SK_FLAGS_PRESENCE_AND_PIN) {
  return `/owner-approve ${sha}\n${approvalSignature(signer, sha, flags)}`;
}

// ── module-loader hook: replace the OWNER_SIGNING_KEYS value as the module loads ──
let injectedKeys = [];
export function initialize(data) { injectedKeys = Array.isArray(data && data.keys) ? data.keys : []; }
export async function load(url, context, nextLoad) {
  const out = await nextLoad(url, context);
  if (url.startsWith("file:") && /\/scripts\/lib\/ownerApproval\.mjs$/.test(url) && out.source != null) {
    const src = String(out.source);
    const rx = /export const OWNER_SIGNING_KEYS = Object\.freeze\(\[[\s\S]*?\]\);/;
    // The pre-fix copies kept as fixtures have no such constant; leave them alone.
    if (!rx.test(src)) return out;
    return { ...out, source: src.replace(rx, `export const OWNER_SIGNING_KEYS = Object.freeze(${JSON.stringify(injectedKeys)});`) };
  }
  return out;
}

/** Substitute `keys` for OWNER_SIGNING_KEYS in every ownerApproval.mjs imported AFTER this call, in this process. */
export function injectKeysInProcess(keys) {
  register(import.meta.url, { data: { keys } });
}

/** Write a preload file for a child process: `node --import <returned path> script.mjs`. */
export function writeKeyInjectionPreload(dir, keys) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `inject-owner-keys-${++keyN}.mjs`);
  writeFileSync(file, `import { register } from "node:module";\nregister(${JSON.stringify(import.meta.url)}, { data: { keys: ${JSON.stringify(keys)} } });\n`);
  return file;
}
