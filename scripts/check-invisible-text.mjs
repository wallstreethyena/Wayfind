// scripts/check-invisible-text.mjs — v8.17
//
// THE BUG THIS LOCKS: lib/landing.js's Wayfind Score chip shipped with
// `background: "#1C2230", color: "#1C2230"` — the score was RENDERED and
// painted invisible, so every landing row showed an empty pill and the owner
// read it as "no wayfind score, what is going on." Nothing failed: valid CSS,
// valid JSX, every guard green.
//
// THE INVARIANT: no inline style object may set `color` to the same literal
// it sets `background`/`backgroundColor` to. Scans every app/lib source file;
// the pair must appear within the same style literal (300-char window), which
// is exactly the shape of the bug and tight enough that legitimate
// same-color-different-element uses (a page palette constant) never match.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith(".js")) files.push(p);
  }
};
walk("app");
walk("lib");

let bad = 0;
const RX = /background(?:Color)?:\s*"(#[0-9A-Fa-f]{3,8})"[^}]{0,300}?color:\s*"(\1)"|color:\s*"(#[0-9A-Fa-f]{3,8})"[^}]{0,300}?background(?:Color)?:\s*"(\3)"/g;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  let m;
  while ((m = RX.exec(src)) !== null) {
    const hex = m[1] || m[3];
    const line = src.slice(0, m.index).split("\n").length;
    console.error(`check-invisible-text: ${f}:${line} — text color ${hex} equals its own background: the content renders invisible (the landing score-chip bug)`);
    bad++;
  }
}

// Positive control: the regex must FIND the known bug shape when planted.
const control = 'style={{ background: "#1C2230", color: "#1C2230" }}';
RX.lastIndex = 0;
if (!RX.test(control)) {
  console.error("check-invisible-text: positive control failed — the probe no longer matches the known bug shape; the sweep above proved nothing");
  process.exit(1);
}

if (bad) process.exit(1);
console.log(`check-invisible-text: OK — ${files.length} files swept, no inline style paints text in its own background color (probe verified against the known bug shape)`);
