#!/usr/bin/env node
// scripts/check-css-comment-bytes.mjs — PROSE DOES NOT SHIP.
//
// v8.63, measured: 15,522 bytes of /* rationale */ comments were living
// INSIDE the CSS template literals of app/components/css.js. A template
// literal's contents are not touched by the JS minifier, so every one of
// those bytes rode the homepage bundle to every visitor — and the 496KB
// ratchet was being fought 19 bytes at a time while 15KB of prose shipped.
// The rationale belongs in JS comments (minified away), in the guards, or
// in git history — never inside the shipped string.
//
// This guard runs the same string-aware pass the cleanup used: it walks the
// file, tracks backtick template literals, and counts /* ... */ bytes only
// INSIDE them. A small allowance (200 bytes) permits a stray marker; a
// paragraph fails the build.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["app/components/css.js"];
const ALLOW = 200;

let fail = false;
for (const rel of FILES) {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  let i = 0, inTpl = false, bytes = 0, blocks = 0;
  while (i < src.length) {
    if (!inTpl) {
      if (src.startsWith("//", i)) { const j = src.indexOf("\n", i); i = j === -1 ? src.length : j; continue; }
      if (src.startsWith("/*", i)) { const j = src.indexOf("*/", i); i = j === -1 ? src.length : j + 2; continue; }
      if (src[i] === "`") inTpl = true;
      i++;
    } else {
      if (src.startsWith("/*", i)) { const j = src.indexOf("*/", i); const end = j === -1 ? src.length : j + 2; bytes += end - i; blocks++; i = end; continue; }
      if (src[i] === "`") inTpl = false;
      i++;
    }
  }
  // positive control: the file really contains template CSS to scan
  if (!/`[\s\S]*\.wf-/.test(src)) { console.error(`check-css-comment-bytes: FAIL — ${rel} no longer looks like template CSS; re-anchor this guard`); fail = true; continue; }
  if (bytes > ALLOW) { console.error(`check-css-comment-bytes: FAIL — ${rel} ships ${bytes} bytes of /* */ comments (${blocks} blocks) inside its CSS template strings (allowance ${ALLOW}). Prose does not ship: move it to a JS comment, a guard, or the commit message.`); fail = true; }
  else console.log(`check-css-comment-bytes: ${rel} — ${bytes} in-template comment bytes (allowance ${ALLOW})`);
}
if (fail) process.exit(1);
console.log("check-css-comment-bytes: OK — shipped CSS strings carry rules, not rationale");
