// scripts/lib/ownerSigningTestkit.mjs — TEST-ONLY helpers for the owner-approval
// tests. Never imported by production code or by any workflow.
//
// An approval now needs a real SSH signature by a key in OWNER_SIGNING_KEYS
// (scripts/lib/ownerApproval.mjs), which is empty until the owner adds his
// hardware key. The tests therefore (1) generate throwaway keys with the real
// `ssh-keygen`, (2) sign real approval messages with them, and (3) where a test
// runs the REAL guard or gate script as a child process (or imports a module that
// reads the constant), substitute the key list into a copy of ownerApproval.mjs
// as it is loaded, through a Node module-loader hook. The rule code is unchanged;
// only the constant's value differs. A test that depends on the substitution
// asserts an approval PASSES, so a hook that silently did nothing shows as a failure.
import { execFileSync } from "node:child_process";
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

/** A fresh keypair made by ssh-keygen in `dir` (type: "ed25519" | "ecdsa"). { keyPath, publicLine } */
export function makeSigner(dir, type = "ed25519") {
  mkdirSync(dir, { recursive: true });
  const keyPath = join(dir, `signer-${type}-${++keyN}`);
  execFileSync("ssh-keygen", ["-q", "-t", type, ...(type === "ecdsa" ? ["-b", "256"] : []), "-N", "", "-C", "test-signer", "-f", keyPath], { stdio: ["ignore", "pipe", "pipe"] });
  return { keyPath, publicLine: readFileSync(`${keyPath}.pub`, "utf8").trim() };
}

/** ssh-keygen -Y sign over the exact bytes of `message` in `namespace`. Returns the armored signature. */
export function sshSign(signer, message, namespace = NAMESPACE) {
  const file = `${signer.keyPath}.msg-${++keyN}`;
  writeFileSync(file, message);
  execFileSync("ssh-keygen", ["-Y", "sign", "-q", "-n", namespace, "-f", signer.keyPath, file], { stdio: ["ignore", "pipe", "pipe"] });
  return readFileSync(`${file}.sig`, "utf8");
}

/** The signature block for the real approval message of `sha`. */
export function approvalSignature(signer, sha) {
  const k = `${signer.keyPath}|${sha}`;
  if (!cache.has(k)) cache.set(k, sshSign(signer, approvalMessageLiteral(sha)));
  return cache.get(k);
}

/** A complete approval comment body: the command line plus the signature block. */
export function signedApprovalBody(signer, sha) {
  return `/owner-approve ${sha}\n${approvalSignature(signer, sha)}`;
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
