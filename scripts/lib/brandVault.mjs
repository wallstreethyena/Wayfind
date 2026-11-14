// scripts/lib/brandVault.mjs — the Wayfind Brand Asset Vault's integrity rules.
//
// 2026-11-12: the owner supplied official Wayfind logos in a chat, and they kept
// being treated as one-off files: a Reel end card used a logo copied off
// gowayfind.com instead, and nothing in the repo said where the real masters
// lived. The masters now sit, byte for byte as supplied, under
// public/brand/wayfind/ with public/brand/wayfind/manifest.json as the source of
// truth (human guide: docs/brand-assets.md).
//
// What this checks, for CORE assets only (manifest "core": true), so an optional
// marketing file can never break a build:
//   - the manifest parses and every row names a file under public/brand/wayfind/;
//   - the file exists, is not empty, and its sha256 equals the manifest's (a
//     re-saved, re-compressed or truncated master fails);
//   - the image header matches the declared format and dimensions;
//   - no byte-identical copy of a core master sits elsewhere under public/
//     (reference the vault path instead of duplicating it).
// Non-core rows are checked the same way but only produce warnings.

import { createHash } from "node:crypto";

export const VAULT_DIR = "public/brand/wayfind/";
export const MANIFEST = "public/brand/wayfind/manifest.json";

// Width and height from a PNG or JPEG header; null when the bytes are neither.
export function imageInfo(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    return { format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { format: "jpeg", width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
    return { format: "jpeg", width: null, height: null };
  }
  return null;
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * io = { read(path) -> Buffer | null, publicFiles() -> [{ path, size }] }
 * Returns { errors, warnings, checked }.
 */
export function checkBrandVault(io) {
  const errors = [];
  const warnings = [];
  let manifest;
  const raw = io.read(MANIFEST);
  if (!raw) return { errors: [`${MANIFEST} is missing`], warnings, checked: 0 };
  try { manifest = JSON.parse(raw.toString("utf8")); } catch (e) { return { errors: [`${MANIFEST} is not valid JSON (${e.message})`], warnings, checked: 0 }; }
  const assets = Array.isArray(manifest && manifest.assets) ? manifest.assets : null;
  if (!assets || !assets.length) return { errors: [`${MANIFEST} lists no assets`], warnings, checked: 0 };
  const ids = new Set();
  let checked = 0;
  const masters = new Map();
  for (const a of assets) {
    const problems = [];
    const label = (a && a.id) || "(no id)";
    if (!a || typeof a.id !== "string" || !a.id) problems.push("a row has no id");
    else if (ids.has(a.id)) problems.push(`duplicate id ${a.id}`);
    else ids.add(a.id);
    const file = a && typeof a.file === "string" ? a.file : "";
    if (!file.startsWith(VAULT_DIR) || file.includes("..")) problems.push(`${label}: file "${file}" is not inside ${VAULT_DIR}`);
    else if (a.path !== "/" + file.slice("public/".length)) problems.push(`${label}: public path "${a.path}" does not match its file`);
    const buf = problems.length ? null : io.read(file);
    if (!problems.length && !buf) problems.push(`${label}: ${file} is missing`);
    if (buf) {
      checked++;
      if (!buf.length) problems.push(`${label}: ${file} is empty`);
      if (a.bytes !== buf.length) problems.push(`${label}: ${file} is ${buf.length} bytes, the manifest says ${a.bytes}`);
      if (a.sha256 !== sha256(buf)) problems.push(`${label}: ${file} no longer matches its recorded sha256 (re-saved, re-compressed or corrupted?)`);
      const info = imageInfo(buf);
      if (!info) problems.push(`${label}: ${file} is not a readable PNG or JPEG`);
      else if (info.format !== a.format || info.width !== a.width || info.height !== a.height) {
        problems.push(`${label}: ${file} is a ${info.format} ${info.width}x${info.height}, the manifest says ${a.format} ${a.width}x${a.height}`);
      }
      if (a.original === true && a.derivative_of) problems.push(`${label}: an original cannot also be a derivative`);
      if (a.original === false && !a.derivative_of) problems.push(`${label}: a derivative must name the original it came from`);
      if (a.core) masters.set(sha256(buf), { label, size: buf.length, file });
    }
    (a && a.core ? errors : warnings).push(...problems);
  }
  // Byte-identical copies of a core master elsewhere in public/: reference the vault instead.
  const sizes = new Set([...masters.values()].map((m) => m.size));
  for (const f of io.publicFiles()) {
    if (f.path.startsWith(VAULT_DIR) || !sizes.has(f.size)) continue;
    const buf = io.read(f.path);
    const hit = buf && masters.get(sha256(buf));
    if (hit) errors.push(`${f.path} is a copy of the vault master ${hit.file}; reference /${hit.file.slice("public/".length)} instead of duplicating it`);
  }
  return { errors, warnings, checked };
}
