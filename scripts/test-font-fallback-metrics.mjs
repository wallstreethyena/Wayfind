#!/usr/bin/env node
/**
 * test-font-fallback-metrics — Fraunces has a metric-matched fallback on
 * Android too, so its late swap does not reflow the page (2026-10-01).
 *
 * Why: next/font gives Fraunces one adjusted fallback face, local("Times New
 * Roman"). Android has no Times New Roman, so it painted the unadjusted system
 * serif (Noto Serif) and every Fraunces block reflowed when Fraunces landed:
 * "Right now" / pick 1 moved 42-103px on production. app/fontFallbacks.css adds
 * the Noto Serif equivalent of next/font's face; app/fonts.js names it.
 *
 * Asserts:
 *   1. CONTROL: our replica of next/font's formula, run on Fraunces vs Times New
 *      Roman, equals what next's own calculateSizeAdjustValues("Fraunces")
 *      returns (CALLED, not read), so the replica is the real formula.
 *   2. The @font-face "Fraunces Fallback Noto" in app/fontFallbacks.css carries
 *      exactly the four numbers that formula gives for Fraunces vs Noto Serif
 *      (next's own capsize metrics), and only local() sources (no download).
 *   3. app/fontsDisplay.js: the ONE Fraunces({...}) call is preload:true, swap,
 *      normal style only, --wf-display, and its `fallback` starts with
 *      "Fraunces Fallback Noto" then Georgia, Times New Roman, serif; it imports
 *      ./fontFallbacks.css; app/fonts.js (root layout) declares no Fraunces.
 *   4. Scope: fontsDisplay.js is imported by exactly the eight route layouts, each
 *      wraps {children} in <DisplayFontScope>, and EVERY file that sets
 *      var(--wf-display) renders only under one of them (importers walked up to
 *      the route files) — so no route sets Fraunces without it being in scope
 *      and preloaded, and no other route pays for it.
 *   5. Census: next/font is called only in app/fonts.js + app/fontsDisplay.js,
 *      and no source file names Fraunces in a font-family directly.
 * (3-5 read source; the next/font call cannot execute outside Next. The built
 *  HTML/CSS is checked by tests/e2e/font-fallback-swap.spec.js.)
 *
 * The real-build swap is measured by tests/e2e/font-fallback-swap.spec.js.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const stripJsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const FACE = "Fraunces Fallback Noto";

// ── 1 + 2. the numbers ──────────────────────────────────────────────────────
const metrics = require("next/dist/server/capsize-font-metrics.json");
const { calculateSizeAdjustValues } = require("next/dist/server/font-utils.js");
const pct = (v) => Math.abs(v * 100).toFixed(2);
function replica(main, fallback) {
  const a = metrics[main], b = metrics[fallback];
  if (!a || !b) return null;
  const size = (a.xWidthAvg / a.unitsPerEm) / (b.xWidthAvg / b.unitsPerEm);
  return { ascent: pct(a.ascent / (a.unitsPerEm * size)), descent: pct(a.descent / (a.unitsPerEm * size)), lineGap: pct(a.lineGap / (a.unitsPerEm * size)), sizeAdjust: pct(size) };
}
const nextTimes = calculateSizeAdjustValues("Fraunces");
const ourTimes = replica("fraunces", "timesNewRoman");
ok(nextTimes.fallbackFont === "Times New Roman", `control: next/font's Fraunces fallback is "${nextTimes.fallbackFont}", expected Times New Roman`);
for (const k of ["ascent", "descent", "lineGap", "sizeAdjust"]) ok(ourTimes && ourTimes[k] === nextTimes[k], `control: replica ${k}=${ourTimes && ourTimes[k]} != next/font ${nextTimes[k]} — the formula changed; recompute app/fontFallbacks.css`);

const want = replica("fraunces", "notoSerif");
ok(!!want, "next's capsize table has no fraunces/notoSerif entry");
const css = read("app/fontFallbacks.css").replace(/\/\*[\s\S]*?\*\//g, "");
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
const ours = faces.filter((f) => new RegExp(`font-family:\\s*["']?${FACE}["']?\\s*;`).test(f));
ok(ours.length === 1, `expected exactly 1 @font-face "${FACE}" in app/fontFallbacks.css, found ${ours.length}`);
const face = ours[0] || "";
const desc = (name) => (face.match(new RegExp(`${name}:\\s*([0-9.]+)%`)) || [])[1];
if (want) {
  ok(desc("ascent-override") === want.ascent, `ascent-override ${desc("ascent-override")}% != computed ${want.ascent}%`);
  ok(desc("descent-override") === want.descent, `descent-override ${desc("descent-override")}% != computed ${want.descent}%`);
  ok(desc("line-gap-override") === want.lineGap, `line-gap-override ${desc("line-gap-override")}% != computed ${want.lineGap}%`);
  ok(desc("size-adjust") === want.sizeAdjust, `size-adjust ${desc("size-adjust")}% != computed ${want.sizeAdjust}%`);
}
const src = (face.match(/src:\s*([^;]+);/) || [])[1] || "";
const srcs = src.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
ok(srcs.length >= 1 && srcs.every((s) => /^local\(/.test(s)), `"${FACE}" src must be local() only (no download): ${src}`);
ok(srcs.some((s) => /local\(["']Noto Serif["']\)/.test(s)), `"${FACE}" must name local("Noto Serif")`);

// ── 3. the font declaration ─────────────────────────────────────────────────
const displaySrc = stripJsComments(read("app/fontsDisplay.js"));
const call = displaySrc.match(/=\s*Fraunces\(\{([\s\S]*?)\}\);/);
ok(!!call, "app/fontsDisplay.js: no `= Fraunces({ ... });` call found");
const opts = call ? call[1] : "";
const fb = opts.match(/\bfallback:\s*\[([^\]]*)\]/);
const chain = fb ? [...fb[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
ok(chain[0] === FACE, `Fraunces fallback must START with "${FACE}" (right after next/font's Times face), got ${JSON.stringify(chain)}`);
ok(JSON.stringify(chain.slice(1)) === JSON.stringify(["Georgia", "Times New Roman", "serif"]), `the rest of the chain must stay Georgia, Times New Roman, serif; got ${JSON.stringify(chain.slice(1))}`);
ok(/\bpreload:\s*true\b/.test(opts), "Fraunces must be preload:true in app/fontsDisplay.js (it is only imported by the routes that set it)");
ok(/\bdisplay:\s*"swap"/.test(opts), 'Fraunces display must stay "swap"');
ok(/\bvariable:\s*"--wf-display"/.test(opts), 'Fraunces variable must stay "--wf-display"');
ok(/\bstyle:\s*\[\s*"normal"\s*\]/.test(opts), 'Fraunces style must stay ["normal"] (no italic download)');
ok(/^\s*import\s+["']\.\/fontFallbacks\.css["'];?\s*$/m.test(displaySrc), "app/fontsDisplay.js must `import \"./fontFallbacks.css\"`");
ok(/export function DisplayFontScope\(\{\s*children\s*\}\)\s*\{\s*return\s*<div className=\{displayFont\.variable\} style=\{\{\s*display:\s*"contents"\s*\}\}>\{children\}<\/div>;/.test(displaySrc),
  "DisplayFontScope must render <div className={displayFont.variable} style={{ display: \"contents\" }}>{children}</div> (no box, no layout change)");
const rootFonts = stripJsComments(read("app/fonts.js"));
ok(!/\bFraunces\s*\(/.test(rootFonts), "app/fonts.js (root layout) must not declare Fraunces: it would be in scope, and with preload fetched, on every route");
ok(/export const fontVariables\s*=\s*textFont\.variable;/.test(rootFonts), "root fontVariables must be the text face only");

// ── 3b. EXECUTED: the real modules, and the real layouts rendered ───────────
// scripts/lib/jsxLoad.mjs stubs next/font/google with a loader that RECORDS
// each call's options and returns next/font's { className, variable } shape.
globalThis.__wfNextFontCalls = [];
const dispMod = await loadComponent(path.join(ROOT, "app/fontsDisplay.js"), ROOT);
const rootMod = await loadComponent(path.join(ROOT, "app/fonts.js"), ROOT);
const frCalls = globalThis.__wfNextFontCalls.filter((c) => c.family === "Fraunces");
ok(frCalls.length === 1, `executing app/fonts.js + app/fontsDisplay.js must call Fraunces() exactly once, got ${frCalls.length}`);
const fo = (frCalls[0] && frCalls[0].options) || {};
ok(fo.preload === true && fo.display === "swap" && fo.variable === "--wf-display", `executed Fraunces options: preload=${fo.preload} display=${fo.display} variable=${fo.variable}`);
ok(JSON.stringify(fo.fallback) === JSON.stringify([FACE, "Georgia", "Times New Roman", "serif"]), `executed Fraunces fallback: ${JSON.stringify(fo.fallback)}`);
ok(JSON.stringify(fo.style) === JSON.stringify(["normal"]) && JSON.stringify(fo.axes) === JSON.stringify(["opsz"]), `executed Fraunces style/axes: ${JSON.stringify(fo.style)} ${JSON.stringify(fo.axes)}`);
ok(rootMod.fontVariables === "__variable_inter", `root fontVariables must be Inter's class only, got ${JSON.stringify(rootMod.fontVariables)}`);
const WRAP = '<div class="__variable_fraunces" style="display:contents">';
const probe = () => React.createElement("p", { id: "wf-font-probe" }, "probe");
const scoped = renderToStaticMarkup(React.createElement(dispMod.DisplayFontScope, null, probe()));
ok(scoped === WRAP + '<p id="wf-font-probe">probe</p></div>', `DisplayFontScope renders ${JSON.stringify(scoped)}`);
for (const l of ["app/guides/layout.js", "app/culture/layout.js", "app/go/florida/layout.js", "app/command-center/layout.js", "app/fall-in-florida/layout.js", "app/halloween-in-florida/layout.js", "app/christmas-in-florida/layout.js", "app/new-years-in-florida/layout.js"]) {
  let html = "";
  try { const m = await loadComponent(path.join(ROOT, l), ROOT); html = renderToStaticMarkup(React.createElement(m.default, null, probe())); }
  catch (e) { html = "THREW " + e.message; }
  const at = html.indexOf(WRAP), p = html.indexOf('id="wf-font-probe"');
  ok(at >= 0 && p > at, `${l}: rendered children must sit inside the --wf-display scope: ${html.slice(0, 160)}`);
}
// negative control: the root layout's own module never applies the scope
ok(!String(rootMod.fontVariables).includes("fraunces"), "negative control: root fontVariables carries no Fraunces class");

// ── 4. scope: who imports fontsDisplay, and who sets --wf-display ───────────
const files = [];
(function walk(d) {
  for (const n of readdirSync(path.join(ROOT, d))) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const rel = path.join(d, n);
    if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
    else if (/\.(m?js|jsx|css)$/.test(n)) files.push(rel);
  }
})("app");
for (const d of ["lib", "components"]) { try { statSync(path.join(ROOT, d)); (function walk(dd) { for (const n of readdirSync(path.join(ROOT, dd))) { const rel = path.join(dd, n); if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel); else if (/\.(m?js|jsx|css)$/.test(n)) files.push(rel); } })(d); } catch {} }
const code = new Map(files.map((f) => [f, f.endsWith(".css") ? read(f).replace(/\/\*[\s\S]*?\*\//g, "") : stripJsComments(read(f))]));

const SCOPED_LAYOUTS = ["app/guides/layout.js", "app/culture/layout.js", "app/go/florida/layout.js", "app/command-center/layout.js", "app/fall-in-florida/layout.js", "app/halloween-in-florida/layout.js", "app/christmas-in-florida/layout.js", "app/new-years-in-florida/layout.js"];
const importsOf = (f) => [...code.get(f).matchAll(/^\s*import\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/gm)].map((m) => {
  const base = path.normalize(path.join(path.dirname(f), m[1]));
  for (const c of [base, base + ".js", base + ".mjs", path.join(base, "index.js")]) if (code.has(c)) return c;
  return base;
});
const importers = new Map();
for (const f of files) if (!f.endsWith(".css")) for (const t of importsOf(f)) { if (!importers.has(t)) importers.set(t, new Set()); importers.get(t).add(f); }

const displayImporters = [...(importers.get("app/fontsDisplay.js") || [])].sort();
ok(JSON.stringify(displayImporters) === JSON.stringify([...SCOPED_LAYOUTS].sort()), `app/fontsDisplay.js must be imported by exactly ${JSON.stringify(SCOPED_LAYOUTS)}; got ${JSON.stringify(displayImporters)}`);
for (const l of SCOPED_LAYOUTS) {
  const src = code.get(l) || "";
  ok(/<DisplayFontScope[\s>]/.test(src) && /\{\s*children\s*\}/.test(src), `${l} must wrap {children} in <DisplayFontScope>`);
}
// Every file that SETS --wf-display (var(--wf-display) in code) must render only
// under a scoped layout: walk importers up to route files (page/layout) and
// require each to sit in a scoped segment.
const SCOPED_DIRS = SCOPED_LAYOUTS.map((l) => path.dirname(l) + path.sep);
const inScope = (f) => SCOPED_DIRS.some((d) => f.startsWith(d));
const users = files.filter((f) => /var\(\s*--wf-display\b/.test(code.get(f)));
ok(users.length >= 5, `census probe: expected the known --wf-display users (guides, culture, florida, command-center, ExploreBridge), found ${users.length}`);
const orphans = [];
for (const u of users) {
  const seen = new Set(), stack = [u];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    if (inScope(f)) continue;
    const up = importers.get(f);
    if (/(^|\/)(page|layout)\.js$/.test(f) || !up || !up.size) { orphans.push(`${u} <- ${f}`); continue; }
    for (const i of up) stack.push(i);
  }
}
ok(orphans.length === 0, `--wf-display is set on a route that does not wrap it in <DisplayFontScope> (no Fraunces, no preload): ${JSON.stringify(orphans)}`);
ok(users.includes("app/components/ExploreBridge.js"), "census positive control: ExploreBridge.js sets --wf-display and must be found");

// ── 5. census: no other font instance or literal Fraunces stack ─────────────
const loaders = [], literal = [];
for (const f of files) {
  const s = code.get(f);
  if (/from\s+["']next\/font\/(google|local)["']/.test(s)) loaders.push(f);
  if (f !== "app/fontFallbacks.css" && /font-?family["']?\s*:\s*[^;\n}]*\bFraunces\b/i.test(s)) literal.push(f);
}
ok(JSON.stringify(loaders.sort()) === JSON.stringify(["app/fonts.js", "app/fontsDisplay.js"]), `next/font call sites must be exactly app/fonts.js (Inter) + app/fontsDisplay.js (Fraunces); found ${JSON.stringify(loaders)} — a second Fraunces instance gets a different file URL (a duplicate download) and misses "${FACE}"`);
ok(literal.length === 0, `font-family naming Fraunces directly (bypasses --wf-display and its fallback): ${JSON.stringify(literal)}`);

if (fail.length) {
  console.error(`✗ test-font-fallback-metrics: ${fail.length} failure(s)`);
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ test-font-fallback-metrics: ${pass} assertions (face ${want.sizeAdjust}%/${want.ascent}%/${want.descent}%/${want.lineGap}%; ${files.length} app/lib files censused; ${users.length} --wf-display files all under ${SCOPED_LAYOUTS.length} scoped layouts)`);
