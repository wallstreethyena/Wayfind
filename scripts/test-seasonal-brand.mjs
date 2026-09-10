#!/usr/bin/env node
// scripts/test-seasonal-brand.mjs — guard for the reusable seasonal-wordmark
// switch (lib/seasonalBrand.js) and its real call sites.
//
// WHAT THIS PROTECTS. A Halloween wordmark ships live today and must revert
// to the normal mark automatically on Nov 1, every year, with no code change
// — and every place the wordmark renders (five <img> components, the
// command-center header, and the two-slice header sprite split across
// app/components/css.js + app/home.js) must show the SAME answer at the SAME
// moment. Two ways this silently rots:
//   1. the date math drifts (a hardcoded year, an off-by-one on the
//      boundary, UTC instead of venue-local ET — CLAUDE.md's standing
//      gotcha for every date cutoff in this app);
//   2. a call site stops asking the resolver — either by never having asked
//      (a NEW call site added later that hardcodes the old PNG) or by
//      regressing (someone "simplifies" an existing one back to the literal
//      path). THE TRAP: the header sprite uses `image-set(avif, webp)` with
//      the PNG only as a `background-image` FALLBACK — browsers prefer
//      avif/webp, so a seasonal rule that swaps only the PNG paints the OLD
//      logo in virtually every real browser while looking correct in a
//      naive "does the CSS mention the halloween file" check.
//
// CLASS: CALL. This file imports lib/seasonalBrand.js and asserts on values
// it actually RETURNS (activeSeasonalMark(...) results, HALLOWEEN_MARK /
// NORMAL_MARK fields) — not just on source text. The "does every call site
// route through the resolver" checks below ARE source-text checks (see next
// paragraph for why), so they are named as weaker where they are weaker.
//
// WHY THE CALL-SITE CHECKS ARE STRUCTURAL, NOT RENDERED. app/components/
// css.js and app/home.js both use extension-less relative imports
// (`from "../../lib/railCollapse"`, `from "../lib/siteTime"`) that only
// Next.js's bundler resolves — plain `node --experimental` ESM cannot import
// them directly (confirmed: importing app/components/css.js under plain node
// throws ERR_MODULE_NOT_FOUND on lib/railCollapse). scripts/check-brand-
// derivatives.mjs already treats these two files as TEXT for exactly this
// reason (readFileSync, not import). This guard does the same for all seven
// call-site files, and is honest about it: every assertion below that reads
// source text says so in its failure message rather than reading as proof
// of runtime behaviour it did not observe.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot } from "./lib/guardWiring.mjs";
import { stripComments } from "./lib/guardHonestyAnalysis.mjs";
import { activeSeasonalMark, SEASONAL_WINDOWS, HALLOWEEN_MARK, NORMAL_MARK } from "../lib/seasonalBrand.js";

const ROOT = repoRoot(import.meta.url);
const p = (rel) => path.join(ROOT, rel);
const read = (rel) => readFileSync(p(rel), "utf8");

let failures = 0;
const fail = (m) => { console.error("test-seasonal-brand: FAIL — " + m); failures++; };
const ok = (cond, msg) => { if (!cond) fail(msg); };
const eq = (got, want, label) => { if (got !== want) fail(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };

// ─────────────────────────────────────────────────────────────────────────
// 1. CALL activeSeasonalMark() with injected dates and assert the RESULT.
//    Every date below is anchored with an explicit UTC offset so the test
//    does not depend on the machine's local timezone — see the comment on
//    each pair for why that offset is the correct one for that exact
//    instant (US Eastern, DST-aware).
// ─────────────────────────────────────────────────────────────────────────
const oct15_2026 = new Date("2026-10-15T12:00:00-04:00"); // Oct = EDT
const nov1_2026_noon = new Date("2026-11-01T12:00:00-05:00"); // past 2am -> EST
const oct31_2359 = new Date("2026-10-31T23:59:00-04:00"); // pre-2am -> still EDT
const nov1_0000 = new Date("2026-11-01T00:00:00-04:00"); // 00:00, pre-2am -> still EDT
const oct15_2027 = new Date("2027-10-15T12:00:00-04:00"); // a different YEAR entirely

const rOct15 = activeSeasonalMark(oct15_2026);
ok(rOct15 !== null && rOct15.id === "halloween", `Oct 15 2026 (ET) must resolve to the halloween mark, got ${JSON.stringify(rOct15)}`);

const rNov1 = activeSeasonalMark(nov1_2026_noon);
eq(rNov1, null, "Nov 1 2026 noon (ET) must resolve to null (normal mark)");

const rOct31 = activeSeasonalMark(oct31_2359);
ok(rOct31 !== null && rOct31.id === "halloween", `Oct 31 2026 23:59 ET must still resolve to halloween (inclusive end), got ${JSON.stringify(rOct31)}`);

const rNov1Midnight = activeSeasonalMark(nov1_0000);
eq(rNov1Midnight, null, "Nov 1 2026 00:00 ET must resolve to null — the Oct 31 23:59 -> Nov 1 00:00 boundary is the whole window edge");

const r2027 = activeSeasonalMark(oct15_2027);
ok(r2027 !== null && r2027.id === "halloween", `Oct 15 2027 (a different year) must ALSO resolve to halloween — the window is month/day only, proving no hardcoded year. Got ${JSON.stringify(r2027)}`);

// The wrap-the-new-year shape (Dec 20 -> Jan 2 style). No such row exists in
// the real SEASONAL_WINDOWS table yet, so this injects a SYNTHETIC table —
// activeSeasonalMark's second argument exists for exactly this — to prove
// the matcher itself supports start > end (wrapping across Dec 31 -> Jan 1)
// before a real December row ever depends on it.
const WRAP_TABLE = [{ id: "wraptest", label: "wrap test fixture", start: { m: 12, d: 20 }, end: { m: 1, d: 2 }, mark: { id: "wraptest" } }];
const wrapDec19 = activeSeasonalMark(new Date("2026-12-19T12:00:00-05:00"), WRAP_TABLE); // just before the window
const wrapDec25 = activeSeasonalMark(new Date("2026-12-25T12:00:00-05:00"), WRAP_TABLE); // inside, pre-New-Year side
const wrapJan1 = activeSeasonalMark(new Date("2027-01-01T12:00:00-05:00"), WRAP_TABLE); // inside, post-New-Year side (wrapped)
const wrapJan3 = activeSeasonalMark(new Date("2027-01-03T12:00:00-05:00"), WRAP_TABLE); // just after the window
const wrapJune = activeSeasonalMark(new Date("2026-06-15T12:00:00-04:00"), WRAP_TABLE); // nowhere near it
eq(wrapDec19, null, "wrap window: Dec 19 (just before Dec 20 start) must be null");
ok(wrapDec25 !== null && wrapDec25.id === "wraptest", "wrap window: Dec 25 (inside, pre-New-Year side) must match");
ok(wrapJan1 !== null && wrapJan1.id === "wraptest", "wrap window: Jan 1 (inside, wrapped past New Year) must match — this is the branch that proves start>end wraps rather than matching nothing");
eq(wrapJan3, null, "wrap window: Jan 3 (just after Jan 2 end) must be null");
eq(wrapJune, null, "wrap window: June 15 (nowhere near either boundary) must be null");

// ─────────────────────────────────────────────────────────────────────────
// 2. The three Halloween asset files: EXIST, and their real dimensions (read
//    from the file's own binary header, never trusted from the filename)
//    match what the task's already-built assets are. Minimal PNG/WebP
//    header parsers — good enough to read the header this repo's own build
//    pipeline actually emits (WebP VP8X, confirmed against both real
//    wordmark webps below), not a general-purpose decoder.
// ─────────────────────────────────────────────────────────────────────────
function pngDimensions(buf) {
  if (buf.length < 24 || buf.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null; // not a PNG signature
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null; // first chunk must be IHDR
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
function webpDimensions(buf) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8X") return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  if (fourcc === "VP8L") {
    const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
    return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
  }
  if (fourcc === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null; // unrecognized RIFF/WEBP chunk type
}

const HALLOWEEN_PNG_REL = "public" + HALLOWEEN_MARK.png;
const HALLOWEEN_AVIF_REL = "public" + HALLOWEEN_MARK.avif;
const HALLOWEEN_WEBP_REL = "public" + HALLOWEEN_MARK.webp;

for (const rel of [HALLOWEEN_PNG_REL, HALLOWEEN_AVIF_REL, HALLOWEEN_WEBP_REL]) {
  ok(existsSync(p(rel)), `${rel} must exist — it is one of the three committed Halloween brand assets`);
}

if (existsSync(p(HALLOWEEN_PNG_REL))) {
  const buf = readFileSync(p(HALLOWEEN_PNG_REL));
  eq(buf.length, 165880, `${HALLOWEEN_PNG_REL} byte size (must match the committed asset, not a regenerated one)`);
  const dim = pngDimensions(buf);
  ok(dim !== null, `${HALLOWEEN_PNG_REL}: could not read a PNG IHDR header from the real file bytes`);
  if (dim) { eq(dim.width, 1000, `${HALLOWEEN_PNG_REL} width (from IHDR, not the filename)`); eq(dim.height, 333, `${HALLOWEEN_PNG_REL} height (from IHDR, not the filename)`); }
}
if (existsSync(p(HALLOWEEN_WEBP_REL))) {
  const buf = readFileSync(p(HALLOWEEN_WEBP_REL));
  eq(buf.length, 21944, `${HALLOWEEN_WEBP_REL} byte size (must match the committed asset, not a regenerated one)`);
  const dim = webpDimensions(buf);
  ok(dim !== null, `${HALLOWEEN_WEBP_REL}: could not read a WebP RIFF header from the real file bytes`);
  if (dim) { eq(dim.width, 400, `${HALLOWEEN_WEBP_REL} width (from the RIFF/VP8X header, not the filename)`); eq(dim.height, 133, `${HALLOWEEN_WEBP_REL} height (from the RIFF/VP8X header, not the filename)`); }
}
if (existsSync(p(HALLOWEEN_AVIF_REL))) {
  // AVIF (ISOBMFF/HEIF) box parsing for width/height is real work this guard
  // does not need to take on — the task only requires reading PNG/WebP
  // headers. Existence + real byte size is still a genuine, non-filename
  // check (a truncated or swapped-in placeholder file would fail this).
  eq(statSync(p(HALLOWEEN_AVIF_REL)).size, 12418, `${HALLOWEEN_AVIF_REL} byte size (must match the committed asset, not a regenerated one)`);
}

// ─────────────────────────────────────────────────────────────────────────
// 3. DISCOVER every real call site, then assert each one goes through the
//    resolver. Discovery scans comment-stripped app/ source for EITHER the
//    raw normal-mark path (a call site that still hardcodes it, bypassing
//    the resolver entirely) OR an actual call to activeSeasonalMark( /
//    a reference to HALLOWEEN_MARK. — so a call site that correctly adopted
//    the resolver is not invisible to its own regression guard, and a NEW
//    call site that hardcodes the raw path instead of adopting the resolver
//    is still caught. lib/seasonalBrand.js itself (the resolver's own
//    definition, which legitimately contains the raw path once, as
//    NORMAL_MARK.png) lives outside app/ and is never walked.
// ─────────────────────────────────────────────────────────────────────────
const RAW_NORMAL_PATH = "/brand/wayfind-wordmark-transparent-v2.png";
const RESOLVER_CALL_RX = /\bactiveSeasonalMark\s*\(/;
const HALLOWEEN_REF_RX = /\bHALLOWEEN_MARK\b/;

function walkJsFiles(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walkJsFiles(abs, out);
    else if (/\.js$/.test(name)) out.push(abs);
  }
  return out;
}

const allAppFiles = walkJsFiles(p("app"), []);
const discovered = new Set();
for (const abs of allAppFiles) {
  const src = stripComments(readFileSync(abs, "utf8"));
  const hasRawPath = src.includes(RAW_NORMAL_PATH);
  const hasResolverCall = RESOLVER_CALL_RX.test(src);
  const hasHalloweenRef = HALLOWEEN_REF_RX.test(src);
  if (hasRawPath || hasResolverCall || hasHalloweenRef) discovered.add(path.relative(ROOT, abs).split(path.sep).join("/"));
}

const EXPECTED_CALL_SITE_FILES = [
  "app/components/PremiumIntentHero.js",
  "app/components/EditorialLandingHero.js",
  "app/components/CollectionHero.js",
  "app/components/sheets/Intro.js",
  "app/command-center/ui.js",
  "app/components/css.js",
  "app/home.js",
].sort();
const discoveredSorted = [...discovered].sort();
const missing = EXPECTED_CALL_SITE_FILES.filter((f) => !discovered.has(f));
const extra = discoveredSorted.filter((f) => !EXPECTED_CALL_SITE_FILES.includes(f));
eq(missing.length, 0, `discovery scan found ${discovered.size} wordmark call-site file(s) but is MISSING expected ones: ${missing.join(", ")} (full discovered set: ${discoveredSorted.join(", ")})`);
eq(extra.length, 0, `discovery scan found UNEXPECTED wordmark call-site file(s) not in the known list of ${EXPECTED_CALL_SITE_FILES.length}: ${extra.join(", ")} — a new call site must be added to the seasonal resolver AND to EXPECTED_CALL_SITE_FILES here, or it silently ships the wrong logo for the season`);

// "Goes through the resolver" — per file, the syntactic import position AND
// a real call/reference, not just the identifier appearing anywhere (e.g. in
// this guard's own strings, which is exactly why this scan is confined to
// app/ and the check below is per named file, not a repo-wide grep).
const IMG_RESOLVER_IMPORT_RX = /import\s*\{[^}]*\bactiveSeasonalMark\b[^}]*\}\s*from\s*["'][^"']*seasonalBrand(?:\.js)?["']/;
const CSS_HALLOWEEN_IMPORT_RX = /import\s*\{[^}]*\bHALLOWEEN_MARK\b[^}]*\}\s*from\s*["'][^"']*seasonalBrand(?:\.js)?["']/;

for (const rel of ["app/components/PremiumIntentHero.js", "app/components/EditorialLandingHero.js", "app/components/CollectionHero.js", "app/components/sheets/Intro.js", "app/command-center/ui.js", "app/home.js"]) {
  const src = stripComments(read(rel));
  const hasImport = IMG_RESOLVER_IMPORT_RX.test(src);
  const hasCall = RESOLVER_CALL_RX.test(src);
  ok(hasImport, `${rel}: does not import activeSeasonalMark from lib/seasonalBrand — the wordmark here cannot be seasonal`);
  ok(hasCall, `${rel}: imports activeSeasonalMark but never CALLS it — imported-but-unused does not route the render through the resolver`);
}

const cssSrc = stripComments(read("app/components/css.js"));
ok(CSS_HALLOWEEN_IMPORT_RX.test(cssSrc), "app/components/css.js: does not import HALLOWEEN_MARK from lib/seasonalBrand — the header sprite's seasonal rule cannot be sourcing real asset paths");

// home.js must additionally apply the class CONDITIONALLY on the resolver's
// result — proven by the two tokens appearing together inside one
// className expression on the wordmark wrapper, not just each appearing
// somewhere in the file.
const homeSrc = stripComments(read("app/home.js"));
const wordmarkClassNameMatch = homeSrc.match(/className=\{`wf-wordmark\$\{activeSeasonalMark\(\)[^`]*is-seasonal[^`]*`\}/);
ok(wordmarkClassNameMatch !== null, "app/home.js: the wf-wordmark wrapper's className must conditionally add \"is-seasonal\" based on activeSeasonalMark() — found the identifiers elsewhere but not wired together on the element that needs the class");

// ─────────────────────────────────────────────────────────────────────────
// 4. THE TRAP: the seasonal CSS must switch avif, webp AND png TOGETHER,
//    counted — not just "the halloween file is mentioned somewhere". image-
//    set() is what real browsers prefer over the plain background-image
//    fallback, so if only the PNG changed, virtually every visitor would
//    keep seeing the OLD logo while this file "looks" updated.
// ─────────────────────────────────────────────────────────────────────────
const avifRefs = (cssSrc.match(/\$\{HALLOWEEN_MARK\.avif\}/g) || []).length;
const webpRefs = (cssSrc.match(/\$\{HALLOWEEN_MARK\.webp\}/g) || []).length;
const pngRefs = (cssSrc.match(/\$\{HALLOWEEN_MARK\.png\}/g) || []).length;
eq(avifRefs, 1, "app/components/css.js: seasonal rule must reference HALLOWEEN_MARK.avif exactly once");
eq(webpRefs, 1, "app/components/css.js: seasonal rule must reference HALLOWEEN_MARK.webp exactly once — a rule that swaps only avif+png (or avif alone) still shows the old logo to every webp-preferring browser without avif support");
eq(pngRefs, 1, "app/components/css.js: seasonal rule must reference HALLOWEEN_MARK.png exactly once — the plain background-image FALLBACK browsers use when they support neither avif nor webp");
// And the resolver's own real values (a genuine CALL, not string reading)
// must be the actual committed asset paths — closing the loop between "the
// CSS references HALLOWEEN_MARK.avif" and "HALLOWEEN_MARK.avif is really
// the halloween webp/avif/png this repo shipped".
eq(HALLOWEEN_MARK.avif, "/brand/opt/wordmark-halloween-400.avif", "HALLOWEEN_MARK.avif must be the real committed asset path");
eq(HALLOWEEN_MARK.webp, "/brand/opt/wordmark-halloween-400.webp", "HALLOWEEN_MARK.webp must be the real committed asset path");
eq(HALLOWEEN_MARK.png, "/brand/wayfind-wordmark-halloween-v1.png", "HALLOWEEN_MARK.png must be the real committed asset path");

// ─────────────────────────────────────────────────────────────────────────
// 5. The NON-seasonal geometry is pinned to today's four real numbers, so a
//    future edit to the seasonal rule (or anything else in this CSS blob)
//    cannot quietly resize the normal, year-round wordmark.
// ─────────────────────────────────────────────────────────────────────────
const PINNED_NORMAL_RULES = [
  '.wf-wordmark-text{width:117.4px;height:39.06px;background-size:151.2px 39.06px;background-position:left center}',
  '.wf-wordmark-pin{width:31.65px;height:36.54px;background-size:141.45px 36.54px;background-position:right center}',
  '.wf-wordmark-text{width:139.77px;height:46.5px;background-size:179.99px 46.5px}',
  '.wf-wordmark-pin{width:37.68px;height:43.5px;background-size:168.38px 43.5px}',
];
for (const rule of PINNED_NORMAL_RULES) {
  const count = cssSrc.split(rule).length - 1;
  eq(count, 1, `app/components/css.js: the pinned non-seasonal rule ${JSON.stringify(rule)} must appear exactly once, unchanged`);
}

// ─────────────────────────────────────────────────────────────────────────
// 6. The declarative table itself: month/day only (no 4-digit year literal
//    anywhere in a window boundary), and at least one row exists.
// ─────────────────────────────────────────────────────────────────────────
ok(Array.isArray(SEASONAL_WINDOWS) && SEASONAL_WINDOWS.length >= 1, "SEASONAL_WINDOWS must be a non-empty array");
for (const w of SEASONAL_WINDOWS) {
  ok(Number.isInteger(w.start?.m) && Number.isInteger(w.start?.d) && Number.isInteger(w.end?.m) && Number.isInteger(w.end?.d),
    `SEASONAL_WINDOWS row ${JSON.stringify(w.id)} must have integer {m,d} start/end`);
}

if (failures) process.exit(1);
console.log(
  `test-seasonal-brand: OK — ${5} date-window assertions on real activeSeasonalMark() calls (incl. the 2027 no-hardcoded-year case and an injected wrap-the-new-year table), ` +
  `3 committed asset files verified by real header bytes (not filename), ${EXPECTED_CALL_SITE_FILES.length} call-site files discovered and confirmed routed through the resolver, ` +
  `avif+webp+png counted together in the seasonal CSS rule, and the 4 non-seasonal geometry rules pinned unchanged.`
);
