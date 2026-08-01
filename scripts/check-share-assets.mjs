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

// THE MERGED SHARE-CARD STANDARD (docs/share-card-standard.md) — v2 locks.
//
// The doc is now v2-merged (owner rulings, 2026-08-01). The v1 locks below still
// apply to app/api/og/intent/route.js, which has NOT been migrated to v2 yet and
// keeps its own gold CTA and brand row. The v2 system in app/api/og/route.js is
// asserted in full by scripts/test-share-card-v2.mjs.
{
  // Asserted against the PROPOSAL, not the canonical doc: check-doc-ownership
  // makes docs/share-card-standard.md owner-only and this lane may not write it.
  // Repoint to the canonical path once the owner applies the proposal.
  const doc = readFileSync(new URL("../docs/proposals/claude-exe-share-card-v2.md", import.meta.url), "utf8");
  if (!/Share-Card Standard — v2 \(merged\)/.test(doc)) fail("docs/share-card-standard.md is not the merged v2 standard");
  if (!doc.includes("#E8C97A")) fail("the merged standard lost rule 3 — the gold CTA the owner conceded back");
  if (!doc.includes("wayfind-official-white.png")) fail("the merged standard lost the composite-logo rule");
  if (!/REQUIRED per-image field with no default/i.test(doc)) fail("the merged standard lost the required-vertical-focus rule");
  if (!doc.includes("Blur-behind, not a flat rectangle")) fail("the merged standard lost the blur-behind panel rule");
  if (/This is the only share-card standard/.test(doc) === false) fail("the merged standard must state that it is the ONLY one — a second file is what this merge existed to prevent");
  // The v2 system must exist and be wired.
  const v2 = readFileSync(new URL("../lib/shareCardV2.js", import.meta.url), "utf8");
  if (!v2.includes("VERTICAL_FOCUS")) fail("lib/shareCardV2.js lost the vertical-focus registry");
  const og = readFileSync(new URL("../app/api/og/route.js", import.meta.url), "utf8");
  if (!og.includes('searchParams.get("v") === "2"')) fail("app/api/og/route.js lost the v2 renderer");
}

// THE SHARE-CARD STANDARD (docs/share-card-standard.md) — v6.57 locks.
{
  const og = readFileSync(new URL("../app/api/og/intent/route.js", import.meta.url), "utf8");
  if (!og.includes('searchParams.get("img")') || !og.includes("REF_RX.test(ref)")) fail("og/intent lost the real-photo (?img=) lane — cards fall back to generic art");
  if (!og.includes("SEE THE RANKING") || !og.includes("#E8C97A")) fail("og/intent lost its single gold CTA pill");
  if (!og.includes("wayfind-wordmark-transparent-v2.png")) fail("og/intent lost the canonical transparent brand row");
  const ic = readFileSync(new URL("../app/components/IntentPageClient.js", import.meta.url), "utf8");
  if (!ic.includes('u.searchParams.set("img", heroRef)')) fail("shared intent URLs no longer carry the hero photo — recipients unfurl generic art");
  const std = readFileSync(new URL("../docs/share-card-standard.md", import.meta.url), "utf8");
  // v2 merge: the numbered ALL-CAPS rule headings became prose sections. Assert
  // the RULE still exists, not the exact heading it was once typed in — the
  // heading is a formatting detail, the rule is the standard.
  if (!std.includes("IMAGE-LED, REAL")) fail("the share-card standard doc drifted");
}
