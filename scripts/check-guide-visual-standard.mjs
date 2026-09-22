#!/usr/bin/env node
/**
 * check-guide-visual-standard — enforces docs/design/guide-visual-standard.md
 * (GVS), the owner's written rule for how every Wayfind guide and blog
 * article renders. Read that file first; this guard is its machine-checkable
 * half. Surfaces outside app/guides/** and the two shared Guide* components
 * (the home app shell, city/category landing pages) are explicitly out of
 * scope, by owner instruction — this guard never inspects them.
 *
 * WHAT IT ASSERTS, briefly (each section below carries the red-proof that
 * goes with it — a rule with no red-proof is not trusted, per AGENTS.md §4):
 *   1. GVS-2 — every `aspect-ratio` in guide CSS ships in the SAME rule as
 *      `height:auto`, `object-fit:cover` and `width:100%`. This is the exact
 *      trap that shipped the Pinto's gallery as tall strips on 2026-09-22:
 *      GuidePhoto emits the photo's intrinsic width/height as HTML
 *      attributes, and only `height:auto` stops that definite height from
 *      silently defeating `aspect-ratio`.
 *   2. GVS-1 — only the four declared ratios (16/9, 1/1, 16/10, 4/3) ever
 *      appear on a guide surface. No per-photo heights, no invented shape.
 *   3. GVS-7 — no raw `<img` and no `next/image` anywhere under
 *      app/guides/**, and no file there imports GuidePhoto directly. The
 *      shared GuideFigure (app/components/GuideFigure.js) is the ONLY path.
 *   4. No `column-count` / masonry anywhere in guide CSS.
 *   5. Every guide entry point imports the shared shell (GuideArticleHero)
 *      or the shared figure (GuideFigure).
 *   6. GVS-5 — a pick's photo render is always GATED on real image data
 *      (never unconditional), and GuideFigure itself renders nothing for a
 *      null image — executed, not just read — so "no photo" is a clean
 *      typographic block by construction, never a placeholder graphic.
 *
 * BASELINE: scripts/lib/guide-visual-standard-baseline.json is a SHRINKING
 * allowlist of guide slugs that cannot yet comply (photo sourcing is a
 * separate, later change — see that file's header). A slug may leave it,
 * never join it without the owner's decision recorded in the same commit.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
const abs = (rel) => path.join(REPO, rel);

let pass = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) pass++; else failures.push(msg); };

// ── the four guide entry points this guard covers, by name (task facts:
// 43 guides through [slug], 2 dedicated) ───────────────────────────────────
const ENTRY_POINTS = [
  "app/guides/page.js",
  "app/guides/[slug]/page.js",
  "app/guides/pintos-farm-miami-2026/page.js",
  "app/guides/florida-fall-festivals-2026/page.js",
];

// ── every guide-owned CSS file: app/guides/** *.css, plus the two shared
// Guide* component stylesheets that live outside app/guides/ ─────────────
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".css")) out.push(p);
  }
  return out;
}
const GUIDE_CSS_FILES = [
  ...walk(abs("app/guides"), []),
  abs("app/components/GuideFigure.module.css"),
  abs("app/components/GuideArticleHero.module.css"),
].map((p) => path.relative(REPO, p).replace(/\\/g, "/"));

ok(GUIDE_CSS_FILES.length >= 5, `expected several guide CSS files, found ${GUIDE_CSS_FILES.length} — this guard has lost its subject`);

/**
 * Flatten a CSS source into its LEAF rules (selector + declaration body),
 * skipping @-rule wrappers (@media, @supports…) whose own "body" is other
 * rules, not declarations. Handles arbitrary nesting depth with one pass.
 * Comments are stripped first so an explanatory comment can never itself
 * satisfy — or trip — a declaration check (CLAUDE.md: strip comments before
 * any position/presence check).
 */
function leafRules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const rules = [];
  const stack = [];
  let selectorBuf = "";
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "{") {
      stack.push({ selector: selectorBuf.trim(), bodyStart: i + 1 });
      selectorBuf = "";
    } else if (ch === "}") {
      const top = stack.pop();
      if (top && top.selector && !top.selector.startsWith("@")) {
        rules.push({ selector: top.selector, body: stripped.slice(top.bodyStart, i) });
      }
      selectorBuf = "";
    } else {
      selectorBuf += ch;
    }
  }
  return rules;
}

const ALLOWED_RATIOS = new Set(["16/9", "1/1", "16/10", "4/3"]);
function normalizeRatio(value) {
  return value.replace(/\s+/g, "");
}

/** Applied to every CSS source this guard scans; returns violation strings. */
function gvsCssViolations(css, label) {
  const problems = [];
  for (const { selector, body } of leafRules(css)) {
    const ratioMatch = /aspect-ratio\s*:\s*([0-9.]+\s*\/\s*[0-9.]+)\s*;?/.exec(body);
    if (!ratioMatch) continue;
    if (!/height\s*:\s*auto\b/.test(body)) problems.push(`${label} "${selector}": aspect-ratio without height:auto (GVS-2 — this is the exact Pinto's-gallery trap)`);
    if (!/object-fit\s*:\s*cover\b/.test(body)) problems.push(`${label} "${selector}": aspect-ratio without object-fit:cover (GVS-2)`);
    if (!/width\s*:\s*100%/.test(body)) problems.push(`${label} "${selector}": aspect-ratio without width:100% (GVS-2)`);
    const ratio = normalizeRatio(ratioMatch[1]);
    if (!ALLOWED_RATIOS.has(ratio)) problems.push(`${label} "${selector}": aspect-ratio ${ratio} is not one of the four GVS-1 roles (16/9, 1/1, 16/10, 4/3)`);
  }
  // Comments stripped BEFORE this check too — a doc comment that mentions the
  // forbidden words (this file's own header does, on purpose) must never trip
  // the rule it is explaining (CLAUDE.md: strip comments before any
  // position/presence check).
  const commentless = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (/column-count\s*:/i.test(commentless) || /\bmasonry\b/i.test(commentless)) {
    problems.push(`${label}: column-count or masonry present — GVS-1 forbids per-photo heights and masonry layout`);
  }
  return problems;
}

// ── RED-PROOF, rules 1/2/4 — prove the checker itself can fail before
// trusting a single green file (AGENTS.md §4: "prove the check can fail") ──
{
  const badNoHeightAuto = `.tile .img { aspect-ratio: 1/1; width: 100%; object-fit: cover; display: block; }`;
  const bad = gvsCssViolations(badNoHeightAuto, "red-proof");
  ok(bad.some((p) => p.includes("height:auto")), "red-proof: an aspect-ratio rule missing height:auto must be flagged (the exact Pinto's-gallery shape)");
  const badRatio = `.tile .img { aspect-ratio: 4/5; width: 100%; height: auto; object-fit: cover; display: block; }`;
  ok(gvsCssViolations(badRatio, "red-proof").some((p) => p.includes("4/5")), "red-proof: a disallowed ratio (the old 4/5 pick strip) must be flagged");
  const badColumns = `.gallery { column-count: 3; }`;
  ok(gvsCssViolations(badColumns, "red-proof").some((p) => p.includes("column-count")), "red-proof: column-count must be flagged");
  const goodRule = `.tile .img, .tile .fallback { aspect-ratio: 1 / 1; width: 100%; height: auto; object-fit: cover; display: block; }`;
  ok(gvsCssViolations(goodRule, "red-proof").length === 0, "red-proof positive control: a fully-compliant rule is NOT flagged (proves the checker isn't just failing everything)");
  // negative control: a doc COMMENT that merely mentions the forbidden words
  // (explaining the rule, the way this guard's own CSS files do) must not
  // itself trip the rule — comments are stripped before this check too.
  const commentMentionsMasonry = `/* No masonry, no column-count: allowed. */\n.tile .img, .tile .fallback { aspect-ratio: 1 / 1; width: 100%; height: auto; object-fit: cover; display: block; }`;
  ok(gvsCssViolations(commentMentionsMasonry, "red-proof").length === 0, "red-proof: a comment merely mentioning 'masonry'/'column-count' must NOT be flagged — only real declarations count");
}

// ── RULES 1/2/4, applied to every real guide CSS file ──────────────────────
for (const rel of GUIDE_CSS_FILES) {
  const css = readFileSync(path.join(REPO, rel), "utf8");
  for (const problem of gvsCssViolations(css, rel)) failures.push(problem);
  pass++; // the file was actually scanned
}

// ── RULE 3 — no raw <img>, no next/image, no direct GuidePhoto import,
// anywhere under app/guides/** ──────────────────────────────────────────────
function jsFilesUnder(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) jsFilesUnder(p, out);
    else if (/\.jsx?$/.test(name)) out.push(p);
  }
  return out;
}
const GUIDE_JS_FILES = jsFilesUnder(abs("app/guides"), []).map((p) => path.relative(REPO, p).replace(/\\/g, "/"));
ok(GUIDE_JS_FILES.length >= 8, `expected several files under app/guides/**, found ${GUIDE_JS_FILES.length}`);

const RAW_IMG_RX = /<img\b/;
const NEXT_IMAGE_RX = /from\s+["']next\/image["']/;
const GUIDEPHOTO_IMPORT_RX = /from\s+["'][^"']*\/GuidePhoto(?:\.js)?["']/;
{
  // red-proof: the detector must actually fire on the exact shape it exists to catch.
  ok(RAW_IMG_RX.test('return <img src={x} alt="" />;'), "red-proof: raw <img> detector fires on a synthetic positive");
  ok(NEXT_IMAGE_RX.test('import Image from "next/image";'), "red-proof: next/image detector fires on a synthetic positive");
  ok(GUIDEPHOTO_IMPORT_RX.test('import GuidePhoto from "../../components/GuidePhoto";'), "red-proof: direct-GuidePhoto-import detector fires on a synthetic positive");
}
for (const rel of GUIDE_JS_FILES) {
  const src = readFileSync(path.join(REPO, rel), "utf8");
  ok(!RAW_IMG_RX.test(src), `${rel}: raw <img> found — every guide photo renders through the shared GuideFigure (GVS-7)`);
  ok(!NEXT_IMAGE_RX.test(src), `${rel}: next/image import found — guides use GuideFigure, not next/image`);
  ok(!GUIDEPHOTO_IMPORT_RX.test(src), `${rel}: imports GuidePhoto directly — GuideFigure is the only path a guide may render a photo through`);
}

// ── RULE 5 — every guide entry point imports the shared shell/figure ──────
const SHELL_IMPORT_RX = /from\s+["'][^"']*\/(GuideArticleHero|GuideFigure)(?:\.js)?["']/;
ok(SHELL_IMPORT_RX.test('import GuideArticleHero from "../../components/GuideArticleHero";'), "red-proof: shell-import detector fires on a synthetic positive");
for (const rel of ENTRY_POINTS) {
  const src = read(rel);
  ok(SHELL_IMPORT_RX.test(src), `${rel}: does not import GuideArticleHero or GuideFigure — every guide entry point must render through the shared shell`);
}

// ── RULE 6 — GVS-5, executed: a pick's photo is always GATED, and
// GuideFigure renders nothing for a null image ─────────────────────────────
{
  // Compile the real GuideFigure + GuidePhoto and EXECUTE them, the same
  // pattern check-guide-editorial.mjs uses for GuideArticleHero — a static
  // regex only proves the shape looks right, a call proves it behaves right.
  const cssStub = new Proxy({}, { get: (_t, name) => String(name) });
  const photoCode = ts.transpileModule(readFileSync(abs("app/components/GuidePhoto.js"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const photoModule = { exports: {} };
  vm.runInNewContext(photoCode, { module: photoModule, exports: photoModule.exports, require }, { filename: abs("app/components/GuidePhoto.js") });
  const figureCode = ts.transpileModule(readFileSync(abs("app/components/GuideFigure.js"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const figureModule = { exports: {} };
  const captionModule = await import(abs("lib/guideCaption.js"));
  vm.runInNewContext(figureCode, { module: figureModule, exports: figureModule.exports, require: (name) => {
    if (name === "./GuidePhoto") return photoModule.exports;
    if (name === "../../lib/guideCaption.js") return captionModule;
    if (name.endsWith(".css")) return { __esModule: true, default: cssStub };
    return require(name);
  } }, { filename: abs("app/components/GuideFigure.js") });
  const GuideFigure = figureModule.exports.default;

  const noImageHtml = renderToStaticMarkup(React.createElement(GuideFigure, { role: "pick", image: null }));
  ok(noImageHtml === "", "GuideFigure with no image data renders NOTHING — a pick with no photo is a clean typographic block, never a placeholder graphic (GVS-5)");
  const withImageHtml = renderToStaticMarkup(React.createElement(GuideFigure, { role: "pick", image: { src: "/guides/test.webp", alt: "test", caption: "A test caption.", credit: "Test Credit", creditHref: "https://example.com" } }));
  ok(withImageHtml.includes("<figure") && withImageHtml.includes('src="/guides/test.webp"'), "GuideFigure with real image data DOES render a photo (positive control — the null case above isn't just a broken component)");
  ok(withImageHtml.includes("Photo: Test Credit") || withImageHtml.includes("Photo:"), "GuideFigure renders the GVS-3 caption/credit line under the photo");

  // Structural half: the pick loop must GATE the figure on real data, never
  // render it unconditionally (the exact shape that would defeat GVS-5).
  const pageSrc = read("app/guides/[slug]/page.js").replace(/\/\*[\s\S]*?\*\//g, " ");
  const GATE_RX = /pickImage\s*\?\s*\(\s*<GuideFigure\b/;
  ok(GATE_RX.test(pageSrc), "app/guides/[slug]/page.js: the pick photo is not visibly gated on pickImage — GuideFigure must only render when real image data exists");
  // red-proof: the detector must fire on the exact gated shape it exists to
  // catch, and must NOT fire once the ternary's condition is replaced with an
  // unconditional true — proving the rule distinguishes gated from ungated,
  // rather than matching "<GuideFigure" alone.
  ok(GATE_RX.test('{pickImage ? (\n  <GuideFigure role="pick" image={pickImage} />\n) : null}'), "red-proof: the gate detector fires on the real gated shape");
  ok(!GATE_RX.test('{true ? (\n  <GuideFigure role="pick" image={pickImage} />\n) : null}'), "red-proof: the gate detector does NOT fire once gated on an unconditional true — it actually reads the condition, not just the presence of <GuideFigure");
}

// ── every guide PICK either yields real, well-formed image data or nothing
// (executed against the real registry, not read) ──────────────────────────
{
  const { GUIDES } = await import(path.join(REPO, "lib/guides.js"));
  const editorialCode = ts.transpileModule(read("app/guides/[slug]/GuideEditorial.js"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const editorialModule = { exports: {} };
  vm.runInNewContext(editorialCode, { module: editorialModule, exports: editorialModule.exports, require }, { filename: abs("app/guides/[slug]/GuideEditorial.js") });
  const { guidePickFigureImage } = editorialModule.exports;
  ok(typeof guidePickFigureImage === "function", "GuideEditorial exports guidePickFigureImage");
  let picksChecked = 0;
  let picksWithPhoto = 0;
  for (const [slug, guide] of Object.entries(GUIDES)) {
    for (const pick of guide.picks || []) {
      picksChecked++;
      const media = guidePickFigureImage(slug, pick);
      if (media === null) continue; // honest degrade — the typographic block, GVS-5
      picksWithPhoto++;
      ok(typeof media.src === "string" && media.src.length > 0, `${slug}: pick "${pick.name}" carries image data with no usable src`);
    }
  }
  ok(picksChecked > 100, `expected well over 100 picks across the registry, checked ${picksChecked} — this rule has lost its subject`);
  console.log(`  (${picksChecked} picks checked; ${picksWithPhoto} currently carry a photo — photo sourcing is a separate, later change)`);
}

// ── baseline — a SHRINKING allowlist, never grown without the owner's
// decision recorded in the same commit (see the file's own header) ────────
const baselinePath = "scripts/lib/guide-visual-standard-baseline.json";
let baseline;
try {
  baseline = JSON.parse(read(baselinePath));
} catch (e) {
  failures.push(`${baselinePath}: missing or invalid JSON (${e.message})`);
  baseline = { slugs: [] };
}
ok(Array.isArray(baseline.slugs), `${baselinePath}: "slugs" must be an array`);
{
  const { GUIDES } = await import(path.join(REPO, "lib/guides.js"));
  for (const slug of baseline.slugs) {
    ok(Object.hasOwn(GUIDES, slug) || slug === "florida-fall-festivals-2026" || slug === "pintos-farm-miami-2026", `${baselinePath}: lists "${slug}", which is not a real guide slug — a stale baseline entry hides nothing and should be removed`);
  }
}

// ── GVS-3: a caption sentence never renders twice ─────────────────────────────
// 2026-09-22: 12 reviewed hero records carry their modification notice inside
// `caption`, and GuideFigure appended it again, so the sentence printed twice
// (things-to-do-sarasota). GuideFigure and this guard execute the SAME rule.
{
  const { guideCaptionText } = await import(path.join(REPO, "lib/guideCaption.js"));
  const { GUIDE_HERO_ART } = await import(path.join(REPO, "lib/guideHero.js"));
  const figureSrc = read("app/components/GuideFigure.js");
  ok(/guideCaptionText\(media\.caption, media\.modificationNotice\)/.test(figureSrc) && !/media\.caption\}\{media\.modificationNotice/.test(figureSrc),
    "GuideFigure renders its caption through lib/guideCaption.guideCaptionText, never caption + notice concatenated blindly");
  // Red proof: the old concatenation duplicates; the rule does not.
  const sample = "A canal in Winter Park. Resized and converted to WebP; display may crop the photograph.";
  const notice = "Resized and converted to WebP; display may crop the photograph.";
  ok((sample + " " + notice).split(notice).length - 1 === 2, "red-proof: blind concatenation really does print the notice twice");
  ok(guideCaptionText(sample, notice) === sample, "a caption that already contains its notice is left alone");
  ok(guideCaptionText("A canal.", notice) === "A canal. " + notice, "a caption without its notice gets it appended once");
  ok(guideCaptionText("", notice) === notice && guideCaptionText("A canal.", "") === "A canal.", "empty caption or empty notice degrade cleanly");
  let checked = 0;
  for (const [slug, art] of Object.entries(GUIDE_HERO_ART)) {
    if (!art || !art.caption || !art.modificationNotice) continue;
    checked++;
    const shown = guideCaptionText(art.caption, art.modificationNotice).toLowerCase();
    const n = art.modificationNotice.trim().toLowerCase();
    ok(shown.split(n).length - 1 <= 1, `${slug}: hero caption would print its modification notice twice`);
  }
  ok(checked > 0, "positive control: at least one hero record carries a modification notice");
}

if (failures.length) {
  console.error(`check-guide-visual-standard: ${pass} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-guide-visual-standard: OK — ${pass} assertions; ${GUIDE_CSS_FILES.length} guide CSS files and ${GUIDE_JS_FILES.length} guide JS files scanned; ${baseline.slugs.length} slug(s) on the baseline`);
