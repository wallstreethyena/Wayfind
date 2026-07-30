// scripts/check-price-badge.mjs — PriceBadge draws price; it never decides it.
//
// The defect this exists to prevent is already on the record. The 2026-07-09
// audit caught a Tampa card showing "$$$$" and "Moderate" at the same time, and
// the cause was not rendering: THREE maps in three files disagreed about one
// input. lib/price is now the single qualitative source, and
// check-one-price-source.mjs fails the build if a second map appears.
//
// A badge is the natural place for the fourth to appear, because glyphs are one
// line of code. `"$".repeat(n)` inside PriceBadge would be a second glyph source
// (lib/dining.priceGlyphs owns those) and would be free to drift from the word
// beside it — reproducing the exact contradiction with a nicer border radius.
// So: the label arrives whole from lib/price, or this fails.
//
// ── THE #430 TRAP, and why stripComments below is load-bearing ───────────────
// #430's ordering check first failed on a COMMENT: route.js explained the
// billing rationale and contained the word "Anthropic" above the early return,
// and a text search cannot tell prose that NAMES the forbidden thing from the
// thing. The same trap is live here and sharper: PriceBadge's own header comment
// contains the literal string "$".repeat(n) while explaining why it must never
// do that. An unstripped search would fail on the explanation.
//
// Every source read below goes through stripComments first. The self-test at the
// bottom proves it: it asserts the raw source DOES contain the forbidden pattern
// (in prose) and the stripped source does NOT — so if stripping ever breaks,
// this guard says so instead of quietly passing or quietly failing.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-price-badge: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => { try { return readFileSync(new URL("../" + rel, import.meta.url), "utf8"); } catch (e) { fail(`${rel} is missing — this guard is anchored to a file that no longer exists`); return ""; } };

// Block comments, then line comments. Mirrors check-one-price-source's helper on
// purpose: two guards protecting one invariant should strip the same way.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const kitRaw = read("app/components/kit.js");
const kit = stripComments(kitRaw);

// ------------------------------------------------------------- it exists
ok(/export function PriceBadge\(/.test(kit), "kit.js still exports PriceBadge — the ONE price badge, so a place cannot read differently on two surfaces");
const start = kit.indexOf("export function PriceBadge(");
const body = kit.slice(start, kit.indexOf("\n}", start) + 2);
ok(body.length > 200, `PriceBadge's body parsed to ${body.length} chars — the slice is wrong and every assertion below would be vacuous`);

// -------------------------------------------------- it derives NOTHING
ok(/priceLabel\(/.test(body), "PriceBadge takes its text from lib/price.priceLabel — the only qualitative price source");
ok(/from "\.\.\/\.\.\/lib\/price"/.test(kit), "kit.js imports from lib/price rather than re-deriving a label");
// The fourth glyph source, in all the shapes it would plausibly take.
for (const [re, what] of [
  [/["']\$["']\s*\.repeat\(/, "a `\"$\".repeat(...)` glyph builder"],
  [/\$\$\$\$/, "a hardcoded $$$$ ladder"],
  [/priceGlyphs/, "a call into lib/dining's glyph function (the badge takes the combined label instead)"],
]) {
  ok(!re.test(body), `PriceBadge contains ${what}. Glyphs live in lib/dining.priceGlyphs and the combined "$$ · Moderate" form lives in lib/price; a third copy here is free to drift from the word beside it, which IS the $$$$/Moderate bug.`);
}
// A price WORD map anywhere in the badge would be the same violation in words.
ok(!/(Inexpensive|Moderate|Expensive)/.test(body), "PriceBadge hardcodes no price WORD — lib/price owns the word list, and it deliberately chose 'Very expensive' over 'High-end' because the latter reads as a compliment");

// ------------------------------------------- price is not a rating
ok(!/BAND_COLOR|getScoreBand|bandColor/.test(body), "PriceBadge carries no score-band coloring. Score has quality bands so color means something there; tinting $$$$ red or green editorialises a fact.");

// -------------------------------------- callers pass the NUMBER
// detail.price is a PRE-RENDERED glyph string ("$$"). Handing that to the badge
// would put a glyph with no word back on the page — the half-signal the audit
// found — and priceLabel would reject it anyway, so the price would vanish.
const detailRaw = read("app/components/sheets/Detail.js");
const detail = stripComments(detailRaw);
ok(/<PriceBadge\b/.test(detail), "the detail sheet renders PriceBadge");
ok(/priceLevelOf\(/.test(detail), "the detail sheet normalises through lib/price.priceLevelOf — priceNum carries a legacy 0 'Free' band that must fold into 1");
ok(!/<PriceBadge[^>]*level=\{detail\.price\}/.test(detail), "the detail sheet must not pass detail.price (a pre-rendered \"$$\" glyph string) as `level` — pass the NUMBER");
ok(/costForTwo/.test(detail), "the dining cost-for-two line still takes precedence — a real dollar range for two is more specific than a 1-4 band, and the badge is the fallback, not a replacement");

// ------------------------------------------------------------------ self-test
// Prove stripComments is doing the work. If the raw source stops containing the
// forbidden pattern in prose, the trap is no longer being exercised and this
// self-test should be re-read rather than deleted.
{
  const RE = /["']\$["']\s*\.repeat\(/;
  if (!RE.test(kitRaw)) fail("self-test: kit.js's raw source no longer mentions `\"$\".repeat(` in prose, so this guard is no longer proving that comment-stripping works. Re-read the #430 note at the top before touching this.");
  if (RE.test(kit)) fail("self-test: stripComments did NOT remove the commented `\"$\".repeat(` — the strip is broken, and every assertion above is being run against prose as well as code");
  // And prove the positive check would actually catch real code.
  const fixture = stripComments('function PriceBadge(){ const g = "$".repeat(n); return g; }');
  if (!RE.test(fixture)) fail("self-test: the glyph-builder pattern failed to match real (uncommented) code — the assertion is not load-bearing");
  pass += 3;
}

console.log(`check-price-badge: OK — ${pass} assertions (PriceBadge renders lib/price's label and derives nothing: no glyph builder, no word map, no quality coloring; callers pass the number, not the pre-rendered glyph; comment-stripping proven against the #430 prose-vs-code trap this file's own header sets)`);
