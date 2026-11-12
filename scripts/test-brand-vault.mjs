#!/usr/bin/env node
// scripts/test-brand-vault.mjs — proves scripts/lib/brandVault.mjs catches a
// damaged or duplicated official logo, and lets optional assets only warn.
// Hermetic: the real manifest and masters are read from disk; every failure
// case is an in-memory copy with one thing broken.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBrandVault, imageInfo, sha256, MANIFEST } from "./lib/brandVault.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const disk = new Map();
const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), "utf8"));
disk.set(MANIFEST, readFileSync(join(ROOT, MANIFEST)));
for (const a of manifest.assets) disk.set(a.file, readFileSync(join(ROOT, a.file)));
const io = (files, extra = []) => ({
  read: (p) => files.get(p) || null,
  publicFiles: () => [...[...files].filter(([p]) => p.startsWith("public/")).map(([p, b]) => ({ path: p, size: b.length })), ...extra],
});
const withManifest = (mutate) => {
  const m = JSON.parse(JSON.stringify(manifest));
  mutate(m);
  const files = new Map(disk);
  files.set(MANIFEST, Buffer.from(JSON.stringify(m)));
  return files;
};

// The real vault.
let r = checkBrandVault(io(disk));
ok(r.errors.length === 0 && r.checked === manifest.assets.length, `the committed vault passes (${r.errors.join("; ")})`);
const core = manifest.assets.filter((a) => a.core);
ok(core.length >= 6 && core.some((a) => a.type === "mark") && core.some((a) => a.background === "light") && core.some((a) => a.background === "dark"),
  "core assets include the pin mark and logos for light and dark backgrounds");
ok(manifest.assets.every((a) => a.original === true && a.sha256 && a.date_added && a.source && a.usage_notes && typeof a.approved_for_production === "boolean"
  && typeof a.transparent === "boolean" && a.width > 0 && a.height > 0), "every row records type, size, transparency, origin, source, date, notes, production approval and a checksum");
for (const a of manifest.assets) {
  const info = imageInfo(disk.get(a.file));
  ok(info && info.format === a.format && info.width === a.width && info.height === a.height, `${a.id}: header really is ${a.format} ${a.width}x${a.height}`);
}

// Red cases, each one change.
const first = core[0];
let files = new Map(disk); files.delete(first.file);
r = checkBrandVault(io(files));
ok(r.errors.some((e) => e.includes("missing")), "red: a missing core logo fails");
files = new Map(disk); files.set(first.file, Buffer.alloc(0));
r = checkBrandVault(io(files));
ok(r.errors.some((e) => e.includes("empty")), "red: an emptied core logo fails");
files = new Map(disk); const b = Buffer.from(disk.get(first.file)); b[b.length - 10] ^= 0xff; files.set(first.file, b);
r = checkBrandVault(io(files));
ok(r.errors.some((e) => e.includes("sha256")), "red: a re-saved or corrupted master (one byte changed) fails");
files = withManifest((m) => { m.assets[0].file = "public/brand/wayfind/../x.png"; });
r = checkBrandVault(io(files));
ok(r.errors.some((e) => e.includes("not inside")), "red: a manifest path outside the vault fails");
files = withManifest((m) => { m.assets[0].width += 1; });
r = checkBrandVault(io(files));
ok(r.errors.some((e) => e.includes("the manifest says")), "red: wrong recorded dimensions fail");
files = new Map(disk); files.set("public/images/logo-copy.png", disk.get(first.file));
r = checkBrandVault(io(files));
ok(r.errors.some((e) => e.includes("logo-copy.png") && e.includes("reference")), "red: a byte-identical copy of a master elsewhere under public/ fails");
files = new Map(disk); files.delete(MANIFEST);
r = checkBrandVault(io(files));
ok(r.errors.some((e) => e.includes("missing")), "red: a missing manifest fails");

// Optional (non-core) assets never break the build.
const optional = manifest.assets.find((a) => !a.core);
files = new Map(disk); files.delete(optional.file);
r = checkBrandVault(io(files));
ok(r.errors.length === 0 && r.warnings.some((w) => w.includes(optional.id)), "an optional asset that goes missing only warns");

// Discoverability: the agent rules point at the vault.
const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
ok(/Wayfind Brand Assets/.test(claude) && claude.includes("public/brand/wayfind/manifest.json"), "CLAUDE.md points every agent at the vault and its manifest");
ok(readFileSync(join(ROOT, "docs/brand-assets.md"), "utf8").includes("public/brand/wayfind/manifest.json"), "docs/brand-assets.md exists and names the manifest");
ok(readFileSync(join(ROOT, "public/brand/README.md"), "utf8").includes("wayfind/manifest.json"), "the existing brand README points at the vault, so there is one brand system");
ok(sha256(Buffer.from("x")).length === 64, "sha256 helper");

console.log(`test-brand-vault: OK — ${n} assertions (${manifest.assets.length} official assets intact with true headers; missing, emptied, re-saved, mis-sized, out-of-vault and duplicated masters all fail; optional assets only warn; CLAUDE.md, docs and the brand README point at the vault)`);
