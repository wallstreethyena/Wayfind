// Guardrail: every static share-card asset referenced in code must exist on
// disk (v6.32). The World Cup and coupon share previews serve owner-designed
// PNGs directly as the og:image; if one is renamed or deleted, the link preview
// silently 404s. This fails the build the moment a referenced /cards/*.png|jpg
// asset is missing.
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

const root = new URL("../", import.meta.url);
const fail = (m) => { console.error("check-share-assets: FAIL — " + m); process.exit(1); };

const FILES = ["lib/shareCards.js", "app/c/page.js", "app/l/[key]/page.js"];
const refs = new Set();
for (const f of FILES) {
  const src = readFileSync(new URL(f, root), "utf8")
    .replace(/\/\/[^\n]*/g, "")       // strip line comments (e.g. the "art pending" placeholder)
    .replace(/\/\*[\s\S]*?\*\//g, ""); // strip block comments
  for (const m of src.matchAll(/["'`](\/cards\/[A-Za-z0-9._-]+\.(?:png|jpg|jpeg|webp))["'`]/g)) refs.add(m[1]);
}
if (!refs.size) fail("no /cards/* share assets referenced — expected the owner card art wiring");

// The two owner-designed finished cards must specifically be present.
const REQUIRED = ["/cards/world-cup.png", "/cards/coupon-share.png"];
for (const r of REQUIRED) if (!refs.has(r)) fail(`expected reference to ${r} was not found in code`);

let checked = 0;
for (const rel of refs) {
  const abs = fileURLToPath(new URL("public" + rel, root));
  if (!existsSync(abs)) fail(`referenced share asset ${rel} is missing from public/${rel}`);
  checked++;
}
console.log(`check-share-assets: OK — ${checked} static share-card asset(s) referenced and present on disk`);
