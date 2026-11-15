#!/usr/bin/env node
// scripts/check-brand-vault.mjs — the official Wayfind logos stay in the vault,
// intact. Rules: scripts/lib/brandVault.mjs. Guide: docs/brand-assets.md.
// Only core assets (manifest "core": true) can fail this; the rest warn.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBrandVault } from "./lib/brandVault.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => { try { return readFileSync(join(ROOT, p)); } catch { return null; } };
function publicFiles() {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      const p = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.push({ path: p, size: statSync(join(ROOT, p)).size });
    }
  };
  walk("public");
  return out;
}

const { errors, warnings, checked } = checkBrandVault({ read, publicFiles });
for (const w of warnings) console.warn(`check-brand-vault: WARN — ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`check-brand-vault: FAIL — ${e}`);
  console.error("  The official logos live in public/brand/wayfind/ (docs/brand-assets.md). Restore the master exactly as supplied, or update its manifest row in the same commit when the owner supplies a new version.");
  process.exit(1);
}
console.log(`check-brand-vault: OK — ${checked} vault asset(s) intact and listed in public/brand/wayfind/manifest.json, no duplicated masters under public/`);
