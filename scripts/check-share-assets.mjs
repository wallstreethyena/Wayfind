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

// THE SHARE-CARD STANDARD (docs/share-card-standard.md) — v6.57 locks.
{
  const og = readFileSync(new URL("../app/api/og/intent/route.js", import.meta.url), "utf8");
  if (!og.includes('searchParams.get("img")') || !og.includes("REF_RX.test(ref)")) fail("og/intent lost the real-photo (?img=) lane — cards fall back to generic art");
  if (!og.includes("SEE THE RANKING") || !og.includes("#E8C97A")) fail("og/intent lost its single gold CTA pill");
  if (!og.includes("wayfind-logo-header.png")) fail("og/intent lost the canonical brand row");
  const ic = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
  if (!ic.includes('u.searchParams.set("img", heroRef)')) fail("shared intent URLs no longer carry the hero photo — recipients unfurl generic art");
  const std = readFileSync(new URL("../docs/share-card-standard.md", import.meta.url), "utf8");
  if (!std.includes("IMAGE-LED, REAL")) fail("the share-card standard doc drifted");
}
