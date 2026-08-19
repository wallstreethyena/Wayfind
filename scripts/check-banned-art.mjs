// check-banned-art.mjs — v8.24 (owner, on the AI neon-concert composite that
// was serving as the nightlife/culture/deal fallback and the Gulf Coast
// Brunch & Date Night guide hero: "I never want to see this image ever
// again — that was the ones I asked to be deleted").
//
// The ban is on the ASSET, not one call site: the file had six independent
// render paths (guideHero, culture tampa, worthTheDrive culture, dealSheet,
// landing nightlife, dealCardImage drinks), so removing one reference while
// the file survives just waits for the next fallback to pick it up. This
// guard asserts both halves, comments stripped first (repo doctrine — a
// comment EXPLAINING the ban must not satisfy or trip it):
//   1. no banned file exists under public/
//   2. no non-comment source line references a banned filename
// Positive control: a known-good art file must exist and be referenced, so
// an empty scan can never read as clean.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

// Owner-banned art. Add the filename here when the owner bans an image;
// never remove entries — a ban is permanent unless the owner reverses it in
// writing (date the reversal here if that ever happens).
const BANNED = ["night-out.jpg"];

// 1. the bytes are gone
for (const f of BANNED) {
  ok(!existsSync(path.join(ROOT, "public/cards", f)), `public/cards/${f} still exists — the owner ordered it deleted`);
}

// 2. nothing references it (comments stripped)
const exts = new Set([".js", ".mjs", ".json", ".css"]);
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = path.join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (exts.has(path.extname(e))) files.push(p);
  }
})(path.join(ROOT, "app"));
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (exts.has(path.extname(e))) files.push(p);
  }
})(path.join(ROOT, "lib"));

// Block + full-line comments only. Trailing same-line comments are NOT
// stripped (no cheap regex does that safely around strings), so the repo
// convention is: never name a banned asset in a trailing comment — put the
// ban note on its own line.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
let controlHits = 0;
for (const f of files) {
  const code = stripComments(readFileSync(f, "utf8"));
  for (const b of BANNED) {
    ok(!code.includes(b), `${path.relative(ROOT, f)} still references banned art "${b}" outside a comment`);
  }
  if (code.includes("tonight-alfonso-scarpa-unsplash.jpg")) controlHits++;
}

// Positive controls: the replacement is real and referenced — if either
// fails, the scan above proved nothing.
ok(existsSync(path.join(ROOT, "public/cards/tonight-alfonso-scarpa-unsplash.jpg")), "positive control: the replacement art exists on disk");
ok(controlHits >= 3, `positive control: the replacement art is referenced by the swapped call sites (found ${controlHits}, want >=3)`);

if (fails) { console.error(`check-banned-art: ${fails} FAILED`); process.exit(1); }
console.log(`check-banned-art: OK — ${files.length} files swept, ${BANNED.length} banned asset(s) absent and unreferenced, replacement present and live`);
