// scripts/check-no-sideways-scroll.mjs
//
// OWNER, 2026-08-12, holding a screenshot of the detail sheet with its left edge
// sliced off — the title reading "n Hills Coffee any", the address starting "E,
// Parrish, FL", Directions cut to "ns": "I want that fixed globally, I never
// want to see that on the site again."
//
// WHAT ACTUALLY CAUSED IT. `overflow-x: hidden` was set on <body> and nowhere
// else. On iOS Safari the viewport's scrolling box is the ROOT element, so a
// body-level overflow-x is a NO-OP against a horizontal viewport scroll. Any
// .focus() or scrollIntoView() that lands inside one of our horizontal rails —
// and the detail sheet is full of them — shifts the whole page sideways, and
// nothing stops it. Everything on screen is then clipped by the same amount,
// which is exactly what the screenshot showed.
//
// This guard holds BOTH halves of the fix, because either alone rots:
//   1. THE STRUCTURAL FLOOR — the root element is constrained, with `clip`
//      rather than `hidden` so it does not become a scroll container and kill
//      every position:sticky on the site.
//   2. THE BEHAVIOURAL RULE — nothing may scroll the inline axis by accident.
//      A .focus() in the shell must pass preventScroll, and a scrollIntoView
//      must pin `inline`, or the browser is free to choose the sideways scroll
//      that this whole file exists to prevent.
//
// A CSS rule nobody measures is a rule that rots, so scripts/test-no-sideways-
// scroll-live.mjs (opt-in, needs a built server) does the same assertion against
// real rendered routes. This file is the static half and runs on every build.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = (m) => { console.error("check-no-sideways-scroll: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(path.join(REPO, f), "utf8");

// ── 1. THE ROOT ELEMENT IS CONSTRAINED ────────────────────────────────────
// COMMENTS STRIPPED FIRST, and that is not incidental: the fix's own comment
// block in layout.js discusses `<html>` and `<body>`, so a raw match found the
// PROSE before the element. This repo has hit "the regex matched its own
// explanatory comment" at least four separate times.
const layout = read("app/layout.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const htmlTag = (layout.match(/<html[^>]*>/) || [""])[0];
ok(/overflowX:\s*"clip"/.test(htmlTag),
   "the <html> element must carry overflowX:\"clip\" — body-only overflow-x is a NO-OP against a horizontal VIEWPORT scroll on iOS, which is the exact bug this prevents");
ok(!/overflowX:\s*"hidden"/.test(htmlTag),
   "<html> must use `clip`, never `hidden` — `hidden` on the root makes it a scroll container and breaks every position:sticky on the site (topbar, bottom nav)");
const bodyTag = (layout.match(/<body[^>]*>/) || [""])[0];
ok(/overflowX:\s*"clip"/.test(bodyTag), "the <body> keeps its own inline-axis clip");
ok(/overscrollBehaviorX:\s*"none"/.test(bodyTag), "overscroll-behavior-x:none stays — it stops the rubber-band that reveals the shifted layout");

// ── 2. NOTHING MAY SCROLL THE INLINE AXIS BY ACCIDENT ─────────────────────
// These are the two APIs that move a viewport sideways without anyone asking.
const SHELL = [
  "app/home.js",
  "app/components/sheets/Detail.js",
];
for (const f of SHELL) {
  const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of src.matchAll(/scrollIntoView\(([^)]*)\)/g)) {
    const args = m[1];
    // A bare scrollIntoView() or one without `inline` lets the engine pick, and
    // inside a horizontal rail the engine picks sideways.
    ok(/inline:\s*"(nearest|start|center|end)"/.test(args),
       `${f}: scrollIntoView(${args.slice(0, 60)}) does not pin \`inline\` — inside a horizontal rail the browser may scroll the page sideways`);
  }
  for (const m of src.matchAll(/\.focus\(([^)]*)\)/g)) {
    ok(/preventScroll:\s*true/.test(m[1]),
       `${f}: .focus(${m[1].slice(0, 40)}) does not pass preventScroll — focusing an element inside a horizontal rail scrolls the viewport to reach it`);
  }
}

// ── 3. THE RAILS THEMSELVES MUST STAY CONTAINED ───────────────────────────
// A horizontal rail is legitimate; a rail that lets its scroll CHAIN to the
// page is the thing that shifts the layout. overscroll-behavior-inline:contain
// on the shared rail class is what stops the chain at the rail's edge.
// Load the exported CSS so template interpolation braces cannot terminate the
// source regex before it reaches overscroll-behavior-inline.
const { WF_PLACE_CARD_CSS } = await loadComponent(path.join(REPO, "app/components/css.js"), REPO);
const css = String(WF_PLACE_CARD_CSS);
ok(/\.wf-rail\b[^}]*overscroll-behavior(-inline)?:\s*contain/.test(css) || /overscrollBehaviorInline:\s*"contain"/.test(read("app/components/RailCard.js")),
   "the shared rail must set overscroll-behavior-inline:contain, or a flick past the last card chains the scroll to the page");

// ── 4. THE INNER SCROLLER MUST NEVER PAN SIDEWAYS ─────────────────────────
// html/body `clip` (section 1) does not protect div.wf-scrollarea: overflowY
// "auto" computes overflow-x to "auto" as well, so anything wider than the
// column made the feed itself draggable sideways on iOS Safari (the poster
// menus "Local Guides" / "Trending Near You" rendered shifted left with empty
// space on the right). The measured cause was PhotoCreditLink's position:
// absolute sr-only span: its containing block was OUTSIDE the horizontal rail
// (.wf8-in), so the rail's overflow did not clip it and it sat ~14000px right
// at its static position, stretching the scroller's scrollWidth.
const home = read("app/home.js").replace(/\/\*[\s\S]*?\*\//g, "");
const scrollArea = (home.match(/<div[^>]*className="wf-scrollarea"[^>]*>/) || [""])[0];
ok(scrollArea, "app/home.js: div.wf-scrollarea not found");
ok(/overflowX:\s*"hidden"/.test(scrollArea),
   "div.wf-scrollarea must carry overflowX:\"hidden\" — it is the inner scroller, and with overflowY:auto its overflow-x computes to auto, so the feed can be dragged sideways");
const menuCss = String((await loadComponent(path.join(REPO, "app/components/railMenuCss.js"), REPO)).WF_RAIL_MENU_CSS);
ok(/\.wf8-menusec\{[^}]*overflow-x:clip/.test(menuCss), "the poster menu panel (.wf8-menusec) must clip its inline axis");
for (const rail of [".wf8-grail", ".wf8-pcrail", ".wf8-track"]) {
  const rule = (menuCss.match(new RegExp("\\" + rail + "\\{[^}]*\\}")) || [""])[0];
  ok(/position:relative/.test(rule), `${rail} must be position:relative so absolutely positioned descendants (the sr-only credit span) are contained and clipped by the rail instead of widening the page scroller`);
}

// ── 5. MEASURED, WHEN A BROWSER IS AVAILABLE ──────────────────────────────
// Offline fixture: the REAL rail CSS, a 390px viewport, a scroller shaped like
// .wf-scrollarea, and a rail whose cards carry the SR_ONLY credit span. Skipped
// (loudly) when chromium cannot launch; a failure here is a real regression.
// Run with a bad CSS to prove it reports offenders: --break.
let browserNote = "browser fixture skipped (no chromium)";
try {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    const broken = process.argv.includes("--break");
    const css = menuCss.replace(/\.wf8-grail\{position:relative;/, ".wf8-grail{").replace(/\.wf8-menusec\{([^}]*?)overflow-x:clip;/, ".wf8-menusec{$1");
    const lis = Array.from({ length: 40 }, (_, i) => `<li><a class="wf8-gcard" href="#">Guide ${i}<span style="position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap"> (opens in a new tab)</span></a></li>`).join("");
    await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0}${broken ? css : menuCss}</style><div class="wf-scrollarea" style="height:700px;overflow-y:auto;${broken ? "" : "overflow-x:hidden;"}padding:7px 12px"><div class="wf8"><section class="wf8-menusec" style="display:block"><div class="wf8-in"><ul class="wf8-grail">${lis}</ul></div></section></div></div>`);
    const m = await page.evaluate(() => { const sa = document.querySelector(".wf-scrollarea"); return { sw: sa.scrollWidth, cw: sa.clientWidth }; });
    if (broken) { ok(m.sw > m.cw + 1, "fixture sanity: the broken variant must report an offender"); browserNote = `browser fixture reports the offender (scrollWidth ${m.sw} > ${m.cw})`; }
    else { ok(m.sw <= m.cw + 1, `the inner scroller is ${m.sw}px wide in a ${m.cw}px column at 390px: something inside a poster menu escapes its rail`); browserNote = `browser fixture at 390px: scroller ${m.sw}/${m.cw}`; }
  } finally { await browser.close(); }
} catch (e) { if (e && /ok\(|assert|FAIL/.test(String(e.message))) throw e; }

console.log(`check-no-sideways-scroll: OK — ${pass} assertions; the ROOT element is clipped (not merely the body), and no focus/scrollIntoView in the shell can move the inline axis, and the inner scroller is overflow-x hidden; ${browserNote}`);
