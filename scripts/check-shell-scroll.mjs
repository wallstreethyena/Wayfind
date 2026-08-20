// scripts/check-shell-scroll.mjs — the app shell does not scroll the document.
//
// WHY THIS EXISTS (owner, 2026-08-20, for at least the fourth time: "when I
// click on any of the amazon rail cards the place cards expand but the view
// remains on the amazon rail cards ... the user might think that nothing
// happened. I asked you multiple times").
//
// app/home.js renders the whole feed inside
//     <div className="wf-scrollarea" style={{flex:1,minHeight:0,overflowY:"auto"}}>
// so THAT div is the scrolling box, not the document. On every screen the shell
// owns, `window.scrollY` is permanently 0 and `window.scrollTo(...)` moves
// nothing at all. Code written against the window reads as correct, type-checks,
// renders, and silently does nothing — which is exactly how a "scroll to the
// picks" feature survived three attempted fixes while never once working.
//
// THE RULE: inside the shell, in-page positioning goes through
// Element.scrollIntoView() (which scrolls every scrollable ancestor, so it is
// right whichever box ends up owning the scroll) or through an explicit
// element scroller such as scrollRef.current.scrollTo(). Never through window.
//
// This guard is a RULE, not a snapshot: it does not care which selector or
// offset anyone uses, only that nothing new steers the viewport through an API
// that cannot move it. The KNOWN list below is the debt that already existed
// when the rule was written — every entry is a real no-op. It is capped and may
// only shrink. Nothing may be added to it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
let checks = 0, bad = 0;
const ok = (cond, msg) => { checks++; if (!cond) { bad++; console.error("check-shell-scroll: FAIL — " + msg); } };

// Files that already steer the window and are therefore already dead code paths.
// Dated 2026-08-20. SHRINK ONLY — a new entry here means shipping a no-op.
const KNOWN = new Map([
  ["app/home.js", 9],
  ["app/components/screens/Experience.js", 1],
  ["app/components/screens/Itinerary.js", 1],
  ["app/components/screens/Surprise.js", 1],
]);
const KNOWN_TOTAL = [...KNOWN.values()].reduce((a, b) => a + b, 0);

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" || n === ".vercel" ? [] : walk(p);
  return /\.(js|jsx)$/.test(n) ? [p] : [];
});
// Full-line comments are prose about the bug, not the bug.
const codeOnly = (src) => src.split("\n").filter((l) => {
  const t = l.trimStart();
  return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
}).join("\n");

const WINDOW_STEER = /window\s*\.\s*scroll(To|By|Y)\b/g;
const steers = (src) => /window\s*\.\s*scroll(To|By|Y)\b/.test(src);   // non-global: .test() on a /g regex is stateful
let live = 0;
for (const abs of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const hits = (codeOnly(readFileSync(abs, "utf8")).match(WINDOW_STEER) || []).length;
  if (!hits) continue;
  live += hits;
  const allowed = KNOWN.get(rel) || 0;
  ok(hits <= allowed,
    `${rel} steers the viewport through window.scroll* ${hits}x (allowed ${allowed}). ` +
    `The shell scrolls .wf-scrollarea, so window.scrollTo is a no-op — use el.scrollIntoView() ` +
    `or the shell's own scrollRef.`);
}
ok(live <= KNOWN_TOTAL, `window.scroll* call sites grew to ${live} (cap ${KNOWN_TOTAL}) — the debt list may only shrink`);

// The rail drop is the surface the owner reported. It must take the reader to
// the picks, and it must do it with an API that works in a nested scroller.
{
  const rel = "app/components/DaypartRail.js";
  const src = codeOnly(readFileSync(join(ROOT, rel), "utf8"));
  ok(/scrollIntoView\s*\(/.test(src), `${rel} must land the open drop with scrollIntoView (window.scrollTo cannot move the shell)`);
  ok(!steers(src), `${rel} must not steer the viewport through window.scroll*`);
  ok(/requestAnimationFrame/.test(src), `${rel} must wait a frame before landing: the drop flips display:none -> block in the same commit and wf8MenuIn starts mid-transform`);
  const css = readFileSync(join(ROOT, "app/components/railMenuCss.js"), "utf8");
  ok(/\.wf8-menusec\{[^}]*scroll-margin-top:/.test(css), "railMenuCss.js: .wf8-menusec needs scroll-margin-top so the landing offset lives with the layout, not as a magic number in JS");
}

if (bad) { console.error(`check-shell-scroll: ${bad} failure(s)`); process.exit(1); }
console.log(`check-shell-scroll: OK — ${checks} assertions (${live} known window.scroll* call sites, cap ${KNOWN_TOTAL})`);
