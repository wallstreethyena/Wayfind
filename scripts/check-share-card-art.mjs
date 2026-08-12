// scripts/check-share-card-art.mjs
//
// OWNER, 2026-08-12: "I HATE the text message design. I want every card that we
// have used or image we have used for text share deleted. I want to work on new
// ones."
//
// WHAT THAT ASK ACTUALLY SPLIT INTO, because it matters for what this guard can
// honestly promise:
//
//   • SIX images were share-only and are DELETED from the repo outright:
//     card-art.png, share-card.png, cards/nearby-v1.png, cards/stays-v1.png,
//     cards/shopping-v1.png, cards/world-cup.png.
//
//   • NINE more were used BY the share card but are also the site's own
//     photography — home heroes, intent pages, guides, culture pages, deal
//     sheets, best-beaches. Deleting those would have broken those pages, so
//     they stay on disk. What changed is that the share card no longer
//     references ANY of them.
//
// So the rule this file enforces is not "those files are gone" — it is the
// stronger and more useful one: NO SHARE OR OG RENDERER MAY REFERENCE A PHOTO
// AT ALL. Until the replacement design lands, a text share renders the branded,
// photo-free card. That is a state a guard can actually hold; "don't use these
// nine specific files" would rot the moment someone added a tenth.
//
// The logo is not a photo and is explicitly allowed — a card with no wordmark
// is not on brand, it is unbranded.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-share-card-art: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. THE DELETED SIX MAY NOT COME BACK ──────────────────────────────────
const DELETED = [
  "public/card-art.png",
  "public/share-card.png",
  "public/cards/nearby-v1.png",
  "public/cards/stays-v1.png",
  "public/cards/shopping-v1.png",
  "public/cards/world-cup.png",
];
for (const f of DELETED) {
  ok(!existsSync(path.join(REPO, f)), `${f} is back in the tree — the owner asked for it deleted`);
}

// ── 2. NO SHARE / OG RENDERER MAY REFERENCE A PHOTO ───────────────────────
// This is the real rule. Adding a NEW image to the share card is exactly what
// the owner does not want until the redesign, and a per-filename blocklist
// would not catch it.
const FILES = [];
const walkOg = (d) => {
  if (!existsSync(d)) return;
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walkOg(p);
    else if (/\.(jsx?|mjs)$/.test(p)) FILES.push(p);
  }
};
walkOg(path.join(REPO, "app/api/og"));
for (const rel of ["lib/shareCards.js", "lib/shareCardV2.js", "lib/socialMeta.js"]) {
  const p = path.join(REPO, rel);
  if (existsSync(p)) FILES.push(p);
}
ok(FILES.length >= 4, `found the share/OG renderers (got ${FILES.length})`);

// A logo/wordmark is branding, not photography.
const LOGO_OK = /wordmark|wayfind-official|logo/i;
for (const f of FILES) {
  const src = strip(readFileSync(f, "utf8"));
  const rel = path.relative(REPO, f);
  for (const m of src.matchAll(/["'`](\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp))["'`]/g)) {
    const asset = m[1];
    if (LOGO_OK.test(asset)) continue;
    fail(`${rel} references the image ${asset} — share cards render photo-free until the new design lands (owner, 2026-08-12)`);
  }
  pass += 1;
}

// ── 3. NO ART FIELD MAY HOLD AN IMAGE PATH ────────────────────
// Assert on the VALUE SHAPE, not on a count. An earlier draft counted `art:`
// occurrences and matched RUNTIME code (`{ art: derived }`) alongside the
// table, which is how a guard starts failing for reasons unrelated to its own
// claim. The real property is simpler and unambiguous: nowhere in the
// share-card table may an art slot hold a quoted asset path.
{
  const sc = readFileSync(path.join(REPO, "lib/shareCards.js"), "utf8");
  const codeLines = sc.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
  const withPaths = codeLines.filter((l) => /\b(static)?[Aa]rt:\s*["'`]\//.test(l));
  ok(withPaths.length === 0,
     `a share card still points at an image: ${withPaths.map((l) => l.trim().slice(0, 70)).join(" | ")}`);
  ok(/\bart:\s*null/.test(sc),
     "the share-card table must still DECLARE its art slots as null — deleting the field entirely would hide the decision rather than record it");
}

// ── 4. THE SITE'S OG IMAGE MUST STILL RESOLVE TO SOMETHING ───────────────
// Deleting share-card.png without repointing would leave every link preview
// pointing at a 404, which is worse than the design the owner disliked.
const layout = strip(readFileSync(path.join(REPO, "app/layout.js"), "utf8"));
ok(!/share-card\.png/.test(layout), "app/layout.js still points at the deleted share-card.png");
ok(/["']\/api\/og["']/.test(layout), "app/layout.js must point the OG image at the dynamic branded card, or link previews have no image at all");
const meta = strip(readFileSync(path.join(REPO, "lib/socialMeta.js"), "utf8"));
ok(!/share-card\.png/.test(meta), "lib/socialMeta.js still points at the deleted share-card.png");

console.log(`check-share-card-art: OK — ${pass} assertions; 6 share-only images deleted and blocked from returning, and NO share/OG renderer references a photo`);
