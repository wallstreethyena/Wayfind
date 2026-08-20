// scripts/check-overscroll-containment.mjs — a horizontal rail may not hand the
// reader's swipe to the browser.
//
// WHY (owner, 2026-08-20): "when I am trying to scroll through the rail it keeps
// catching the edge of the screen on my mobile phone and going back to the
// previous page by sliding the old page back. I don't like that, it makes
// navigation really bad."
//
// app/layout.js has declared overscroll-behavior-x:none on <body> since v5.x and
// it has never once taken effect. overscroll-behavior only applies to a SCROLL
// CONTAINER; in this shell <html> and <body> both carry overflow-x:clip and the
// feed scrolls inside div.wf-scrollarea, so neither is one. A rail that ran out
// of runway chained its leftover delta to the viewport and iOS Safari claimed it
// as the interactive back gesture.
//
// THE RULE, and it is a rule rather than a list of files: anything that scrolls
// horizontally must declare overscroll containment, and the shell's real
// scroller must too. This is the same failure family as
// scripts/check-shell-scroll.mjs — styling or steering the document in an app
// that does not scroll the document.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
let checks = 0, bad = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-overscroll-containment: FAIL — " + m); } };

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" || n === ".vercel" ? [] : walk(p);
  return /\.(js|jsx)$/.test(n) ? [p] : [];
});

// 1. Every INLINE horizontal scroller contains its own overscroll. The style
//    object is one expression, so the declaration has to ride along with it.
let inline = 0, contained = 0;
for (const abs of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const src = readFileSync(abs, "utf8");
  const hits = src.match(/overflowX:\s*"auto"(?:\s*,\s*overscrollBehaviorX:\s*"contain")?/g) || [];
  for (const h of hits) {
    inline++;
    if (/overscrollBehaviorX/.test(h)) contained++;
    else ok(false, `${rel}: an inline overflowX:"auto" scroller has no overscrollBehaviorX:"contain" — its swipe chains out to the browser's back gesture`);
  }
}
ok(inline > 0, "found no inline horizontal scrollers at all — this guard has lost its subject");

// 2. Every CLASS-based horizontal scroller is named in the containment rule.
const cssFiles = walk(join(ROOT, "app")).filter((p) => /css\.js$|Css\.js$|style\.js$/.test(p));
const allCss = cssFiles.map((p) => readFileSync(p, "utf8")).join("\n");
const containedClasses = new Set(
  (allCss.match(/[^{}]+\{[^}]*overscroll-behavior(?:-x|-inline)?\s*:\s*(?:contain|none)[^}]*\}/g) || [])
    .flatMap((block) => (block.slice(0, block.indexOf("{")).match(/\.[a-zA-Z0-9_-]+/g) || []))
);
const scrollerClasses = new Set(
  (allCss.match(/[^{}]+\{[^}]*overflow-x\s*:\s*(?:auto|scroll)[^}]*\}/g) || [])
    .flatMap((block) => (block.slice(0, block.indexOf("{")).match(/\.[a-zA-Z0-9_-]+/g) || []))
);
ok(scrollerClasses.size > 0, "found no class-based horizontal scrollers — this guard has lost its subject");
for (const cls of scrollerClasses) {
  ok(containedClasses.has(cls), `${cls} scrolls horizontally but never declares overscroll containment — its swipe chains out to the browser's back gesture`);
}

// 3. The shell's REAL scroller contains. Declaring this on <body> does nothing:
//    body is not a scroll container here, which is the whole bug.
{
  const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
  const at = home.indexOf('className="wf-scrollarea"');
  ok(at > 0, "app/home.js no longer renders .wf-scrollarea — re-point this guard at whatever owns the scroll now");
  ok(at > 0 && /overscrollBehavior/.test(home.slice(at, at + 400)),
    ".wf-scrollarea is the shell's scroll container and must declare overscrollBehavior — it is the only element on the chain where the declaration can bite");
}

if (bad) { console.error(`check-overscroll-containment: ${bad} failure(s)`); process.exit(1); }
console.log(`check-overscroll-containment: OK — ${checks} assertions (${contained}/${inline} inline scrollers contained, ${scrollerClasses.size} rail classes named)`);
