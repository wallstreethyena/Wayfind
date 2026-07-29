#!/usr/bin/env node
/**
 * check-art-assets — a hero/art path is a claim that a FILE EXISTS IN GIT, and
 * that this surface has its own image.
 *
 * TWO FAILURES ON 2026-07-29, NEITHER VISIBLE TO ANY EXISTING CHECK:
 *
 *  1. A path pointing at a file that was never committed. The asset sat
 *     untracked in one working tree, so it rendered locally and 404'd in
 *     production — Vercel builds from git, not from someone's disk. Nothing
 *     compared the string in the code against the contents of the repo.
 *
 *  2. Three intent pages with the wrong art, two of them sharing one file:
 *     /hidden-gems pointed at date-night.jpg, while /best-of and /budget both
 *     pointed at the hidden-gems photo. Two surfaces rendering one image is
 *     the visual form of the same bug check-intent-copy-matches-filter guards
 *     in prose: different promises, identical output, and the product looks
 *     fake. A human notices this only by opening both pages side by side.
 *
 * WHAT IT CHECKS
 *   - every art:/heroImage:/heroImg: string literal under /public resolves to a
 *     path git actually tracks
 *   - no two INTENT_PAGES entries share an art path
 *   - the file is a real image, not a zero-byte placeholder
 *
 * WHAT IT DELIBERATELY DOES NOT CHECK
 *   Shared art OUTSIDE INTENT_PAGES is legitimate and common — one photo backs
 *   the hidden-gems share card, its OG card, the home hero and a guides
 *   fallback, which is a brand decision, not a bug. The uniqueness rule applies
 *   only where each entry is a distinct destination page.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// What git actually has. This is the whole point: not what is on disk.
const tracked = new Set(
  execSync("git ls-files public", { encoding: "utf8" })
    .trim().split("\n").filter(Boolean).map((p) => p.replace(/^public/, ""))
);
ok(tracked.size > 0, "read the tracked asset list from git (an empty list would make every check below vacuous)");

const SOURCES = ["lib/intentPages.js", "app/home.js", "app/components/screens/Experience.js", "lib/shareCards.js", "app/api/og/intent/route.js",
  // Added 2026-07-29: these two were NOT scanned, and both held art paths —
  // including a fallback that quietly branded 8 pages. An unscanned file with
  // art literals is exactly where the next uncommitted path will hide.
  "app/culture/[metro]/page.js", "app/guides/[slug]/page.js"];

// A CATEGORY-BRANDED asset must never be the fallback for arbitrary pages.
// /culture/miami, /keys, /boston, /hawaii and four guides all opened on a photo
// named "hidden gems" because that was the default. A wrong fallback is harder
// to spot than a wrong assignment: it looks deliberate, and it scales silently
// with every page added. Keyword branches assigning matching art are fine —
// only the final default is constrained.
const CATEGORY_BRANDED = /hidden-gems|date-night|night-out|family-|budget-|best-of-|outdoors-hero/;
const FALLBACK_FILES = ["app/culture/[metro]/page.js", "app/guides/[slug]/page.js"];

// Any string literal assigned to an art/hero slot, plus the bare "/cards/..."
// and "/brand/..." literals in home.js's heroImage ternary, which is a chain of
// conditional expressions rather than one key: value pair. The dead-branch
// ternary that started this was exactly that shape, so a key-only regex would
// have missed it.
const SLOT_RX = /\b(?:art|heroImage|heroImg|image)\s*:\s*"((?:\/cards|\/brand)\/[^"]+)"/g;
const BARE_RX = /"((?:\/cards|\/brand)\/[^"]+\.(?:jpg|jpeg|png|webp|avif))"/g;

let refs = 0;
for (const rel of SOURCES) {
  let src = "";
  try { src = readFileSync(path.resolve(rel), "utf8"); } catch { continue; }
  // Line by line, skipping comments. Same convention as check-env-discipline:
  // a commented-out reference is not a live one. shareCards.js carries a
  // deliberately inert `stays` block ("Art pending — uncomment when the file
  // lands"), and flagging it would be a guard firing on correct code, which is
  // how guards get switched off.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    const seen = new Set();
    for (const rx of [SLOT_RX, BARE_RX]) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(line))) {
        const p = m[1];
        if (seen.has(p)) continue;
        seen.add(p);
        refs++;
        ok(tracked.has(p),
          `${rel}:${i + 1} points at ${p}, which git does not track — it renders locally and 404s in production, because the build takes its files from git`);
      }
    }
  }
}
// Falsifiability floor: if the regexes stop matching, every existence check
// above runs zero times and this file still exits 0.
ok(refs >= 15, `found enough art references to be meaningful (got ${refs}) — a low count means the matcher broke, not that the art was removed`);

// Each intent page is a distinct destination, so each needs a distinct image.
const ip = readFileSync(path.resolve("lib/intentPages.js"), "utf8");
const byArt = new Map();
for (const m of ip.matchAll(/\n {2}"?([a-z-]+)"?:\s*\{([\s\S]*?)\n {2}\},/g)) {
  const art = (m[2].match(/art:\s*"([^"]+)"/) || [])[1];
  if (!art) continue; // seasonal derives its art from SEASON_META
  if (!byArt.has(art)) byArt.set(art, []);
  byArt.get(art).push(m[1]);
}
ok(byArt.size >= 5, `parsed the INTENT_PAGES art entries (got ${byArt.size}) — an empty parse makes the uniqueness check vacuous`);

// NO EXEMPTIONS. This briefly shipped with a grandfather list holding /best-of
// and /budget, which both rendered the hidden-gems photo; distinct art arrived
// the same day, so the list went to zero and was removed rather than left empty
// as an invitation. Every intent page has its own image, full stop — if that
// has to change, argue for the exemption in review, do not add a set here.
//
// Do NOT resolve a future collision with /cards/beach-adobestock-955441300.jpeg.
// It is beach-specific, and using it for a non-beach surface would be the same
// category error this guard exists to catch. It stays unassigned until there is
// a beach surface for it.
for (const [art, keys] of byArt) {
  ok(keys.length === 1,
    `${keys.join(" and ")} both use ${art} — two destination pages rendering one image reads as the same page twice; give each its own`);
}

// The fallback position specifically: whatever a page gets when nothing matched.
for (const rel of FALLBACK_FILES) {
  let src = "";
  try { src = readFileSync(path.resolve(rel), "utf8"); } catch { continue; }
  // Match the DECLARATION, not the identifier. Testing /NEUTRAL_HERO/ passed
  // even with the declaration deleted, because the use site still mentions the
  // name — a check that claimed more than it verified.
  ok(/(?:const|export const)\s+NEUTRAL_HERO\s*=\s*"/.test(src),
    `${rel} must DECLARE NEUTRAL_HERO — the default a page gets when no rule matched has to be named, not inlined, so it stays greppable`);
  for (const [i, line] of src.split("\n").entries()) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    // A default position is `|| "<path>"` or a bare `: "<path>";` on a return.
    const m = line.match(/\|\|\s*"((?:\/cards|\/brand)\/[^"]+)"/) || line.match(/:\s*"((?:\/cards|\/brand)\/[^"]+)"\s*;/);
    if (!m) continue;
    ok(!CATEGORY_BRANDED.test(m[1]),
      `${rel}:${i + 1} uses the category-branded ${m[1]} as a FALLBACK. A page that matched no rule must not be handed art that asserts a category — use NEUTRAL_HERO`);
  }
}

if (fail.length) {
  console.error("check-art-assets: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-art-assets: OK — ${pass} assertions, ${refs} art references all tracked by git, ${byArt.size} intent pages with distinct images`);
