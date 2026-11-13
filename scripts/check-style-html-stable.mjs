// scripts/check-style-html-stable.mjs: every <style dangerouslySetInnerHTML> in app/ and lib/
// takes its { __html } object from lib/styleHtml.js, so an unchanged sheet is never rewritten.
//
// WHY (2026-11-13, production, 4x-throttled phone, Chrome trace). The React bundled with
// Next's app router sets `element.innerHTML = value.__html` whenever the
// dangerouslySetInnerHTML OBJECT differs from the previous render's (it does not compare the
// strings; section 3 reads that from the installed bundle). `{{ __html: CSS }}` is a new
// object per render, so each re-render of the home page rewrote its 110 KB and 61 KB sheets
// with identical text and the browser re-styled the whole document: about 15,700 elements,
// 450 to 560 ms, five times after one card tap, about 75 times in a load-and-scroll.
// Skipping the identical rewrites in the test browser: blocked time 8.3 s -> 5.2 s on the
// home page, 4.2 s -> 2.1 s after a card tap.
//
// What this guard cannot do: run React against a real layout engine. It locks the call
// (same text -> same object), the whole-tree usage, and that the reason still exists.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { styleHtml } from "../lib/styleHtml.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let checks = 0;
function ok(cond, msg) {
  checks += 1;
  if (!cond) { console.error("check-style-html-stable FAIL: " + msg); process.exit(1); }
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// 1. By call: same text, same object; the markup React gets is the text itself.
{
  const css = ".a{color:red}@media(max-width:5px){.b{content:\"x\"}}";
  const a = styleHtml(css); const b = styleHtml(".a{color:red}" + "@media(max-width:5px){.b{content:\"x\"}}");
  ok(a === b, "the same CSS text built twice returns the SAME object (identity is what React compares)");
  ok(a.__html === css && Object.keys(a).join() === "__html", "the object is exactly { __html: text }");
  ok(styleHtml(css + " ") !== a && styleHtml(css + " ").__html === css + " ", "different text gets a different object with its own text");
  ok(styleHtml(null).__html === "" && styleHtml(undefined) === styleHtml(""), "null / undefined are an empty sheet, not the string 'null'");
  ok(Object.isFrozen(a), "the shared object cannot be mutated by one caller under another");
  // the cache is bounded and stays correct across an eviction
  for (let i = 0; i < 1200; i += 1) ok(styleHtml(".n" + i + "{}").__html === ".n" + i + "{}", "sheet " + i + " keeps its own text");
  const again = styleHtml(css);
  ok(again.__html === css && again === styleHtml(css), "after the cache turned over, the text is still right and identity is stable again");
}

// 2. The whole tree: a <style ... dangerouslySetInnerHTML={ must continue with styleHtml(
const INLINE = /<style\b(?:[^<>{}]|\{[^{}]*\})*?dangerouslySetInnerHTML=\{(?!styleHtml\()/g;
const STABLE = /<style\b(?:[^<>{}]|\{[^{}]*\})*?dangerouslySetInnerHTML=\{styleHtml\(/g;
{
  const bad = ['<style dangerouslySetInnerHTML={{ __html: CSS }} />', '<style\n  dangerouslySetInnerHTML={{ __html: `a${b}` }} />', '<style key="k" dangerouslySetInnerHTML={{__html:CSS}} />', '<style dangerouslySetInnerHTML={html} />', '<style id={id} dangerouslySetInnerHTML={{ __html: x }} />'];
  for (const src of bad) ok((src.match(INLINE) || []).length === 1, "positive control: the probe must flag `" + src.replace(/\n/g, " ") + "`");
  const good = ['<style dangerouslySetInnerHTML={styleHtml(CSS)} />', '<style\n  dangerouslySetInnerHTML={styleHtml(`a${b}`)} />', '<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />', '<div dangerouslySetInnerHTML={{ __html: html }} />', '<style id="x" dangerouslySetInnerHTML={styleHtml(a + b)} />'];
  for (const src of good) ok((src.match(INLINE) || []).length === 0, "negative control: the probe must NOT flag `" + src.replace(/\n/g, " ") + "`");
}
const files = [];
for (const top of ["app", "lib"]) (function walk(dir) {
  for (const name of readdirSync(path.join(root, dir))) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const rel = dir + "/" + name;
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel);
    else if (/\.(?:js|jsx|mjs)$/.test(name)) files.push(rel);
  }
})(top);
ok(files.length > 400, "the scan saw the tree (" + files.length + " files)");
let stable = 0; let holders = 0;
for (const rel of files) {
  const src = strip(readFileSync(path.join(root, rel), "utf8"));
  if (!src.includes("<style")) continue;
  const inline = src.match(INLINE) || [];
  ok(inline.length === 0, rel + " renders a <style> with an inline dangerouslySetInnerHTML object (" + inline.length + "x). A new object per render makes React rewrite the sheet and the browser re-style the whole page. Use dangerouslySetInnerHTML={styleHtml(css)} from lib/styleHtml.js.");
  const n = (src.match(STABLE) || []).length;
  if (n) {
    holders += 1; stable += n;
    ok(/import\s*\{[^}]*\bstyleHtml\b[^}]*\}\s*from\s*["'](?:[^"']*\/)?styleHtml(?:\.js)?["']/.test(src), rel + " calls styleHtml( and imports it from lib/styleHtml.js");
  }
}
ok(stable >= 60 && holders >= 50, "positive control: the scan found the style tags it protects (" + stable + " in " + holders + " files), so zero inline objects is a real zero");

// 3. The reason still exists in the React this app ships. If this assertion goes red after a
// Next upgrade, React may have gone back to comparing the strings: read the new bundle before
// touching anything, and keep styleHtml either way (it is free).
{
  let bundle = "";
  try { bundle = readFileSync(path.join(root, "node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js"), "utf8"); } catch { bundle = ""; }
  if (!bundle) {
    console.log("check-style-html-stable: note, Next's compiled react-dom was not found at the known path; section 3 (reading React's own behaviour) did not run.");
  } else {
    const at = bundle.indexOf('case "dangerouslySetInnerHTML":');
    ok(at > 0, "React's property setter has a dangerouslySetInnerHTML case");
    const body = bundle.slice(at, at + 520).replace(/\s+/g, " ");
    ok(/domElement\.innerHTML = \w+;/.test(body), "that case assigns innerHTML");
    ok(!/lastProp|prevValue|!==\s*\w+\.__html/.test(body.slice(0, body.indexOf("break;"))), "and it does not compare against the previous __html, so only a stable object prevents the rewrite");
  }
}

console.log("check-style-html-stable: OK, " + checks + " assertions (" + files.length + " app/lib files scanned; " + stable + " <style> tags in " + holders + " files all take their object from lib/styleHtml.js; identity proven by call). False-positive surface: a <style> whose object comes from a memoised variable would be flagged; wrap it in styleHtml instead.");
