// Guardrail: the responsive layout must stay in CSS, never in JS state.
//
// THE INCIDENT (measured on production 2026-07-21, mobile+desktop lab runs,
// reproduced identically across runs): desktop field CLS p75 was 0.263 and a
// lab run showed 0.4947 total — of which ONE shift was 0.4938 (99.8%).
//
// The cause was `const [vw, setVw] = useState(0)` + `const isDesktop = vw >= 900`.
// vw starts at 0, so `isDesktop` is false on the server AND on the first client
// paint. The page rendered MOBILE, then an effect measured the real width and
// re-rendered DESKTOP at ~514ms:
//     shell     x=480 w=480   ->  x=80 w=1280
//     "Sign in" x=405         ->  x=1205        (800px sideways)
// distance 800/1440 = 0.555 x impact ~0.89 = 0.4938. The math is exact.
//
// Media queries are resolved by the browser before first paint, at the true
// width, against server-rendered HTML — there is no wrong frame to correct, so
// the shift cannot occur. Any future `isDesktop ? A : B` that decides a WIDTH,
// MAX-WIDTH, MARGIN or DISPLAY re-creates the bug, so this test fails the build.
import { readFileSync } from "node:fs";

let passed = 0;
const fail = (m) => { console.error("test-layout-shift: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const src = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// 1. The CSS exists and is server-rendered inline (not a client-only injection).
ok(src.includes("WF_LAYOUT_CSS"), "WF_LAYOUT_CSS is gone — the responsive layout must ship as CSS");
const cssM = src.match(/const WF_LAYOUT_CSS = `([^`]*)`/);
ok(!!cssM, "WF_LAYOUT_CSS must be a plain template literal so it is server-rendered");
// The literal contains ${WF_DESKTOP_BP}; resolve it so we assert the real breakpoint.
const bpM = src.match(/const WF_DESKTOP_BP = (\d+)/);
ok(!!bpM, "WF_DESKTOP_BP is missing");
const css = cssM[1].replaceAll("${WF_DESKTOP_BP}", bpM[1]);
ok(/<style>\{`[^`]*\$\{WF_LAYOUT_CSS\}/.test(src), "WF_LAYOUT_CSS must be rendered into the inline <style> block");

// 2. The breakpoint must stay in lockstep with the old JS threshold (900).
ok(src.includes("const WF_DESKTOP_BP = 900"), "WF_DESKTOP_BP must be 900 to match the previous vw >= 900 behaviour");
ok(css.includes("@media(min-width:900px)"), "the media query must use the 900px breakpoint");

// 3. Every layout class the JSX references must be defined in the CSS, and vice
//    versa — a class that exists in only one place is a silently-broken layout.
const classes = ["wf-shell", "wf-col-main", "wf-hooks", "wf-hook-card", "wf-explore", "wf-cols"];
for (const c of classes) {
  ok(css.includes("." + c + "{"), `CSS rule for .${c} is missing`);
  ok(src.includes(`className="${c}"`), `no JSX element uses .${c} — dead layout class`);
}

// 4. Both sides of the breakpoint must be specified for the size-critical
//    containers: a mobile default AND a desktop override. One without the other
//    means an unstyled first paint, which is the same shift by another route.
const [base, desktop] = css.split("@media(min-width:900px){");
ok(/\.wf-shell\{max-width:480px\}/.test(base), "mobile default max-width for .wf-shell missing");
ok(/\.wf-shell\{max-width:1280px\}/.test(desktop), "desktop max-width for .wf-shell missing");
ok(/\.wf-hook-card\{width:100%/.test(base), "mobile default width for .wf-hook-card missing");
ok(/\.wf-hook-card\{width:290px/.test(desktop), "desktop width for .wf-hook-card missing");

// 5. THE CORE RULE: isDesktop must never again drive a layout dimension.
//    Content decisions (which blocks to render) are still allowed; geometry is not.
//    Both orderings must be caught:
//      A)  maxWidth: isDesktop ? 780 : undefined      <- property first (the original bug)
//      B)  style={isDesktop ? { display: "flex" } : {}}  <- ternary first
const GEO = "maxWidth|max-width|minWidth|min-width|width|height|margin|padding|display|flex|gap|top|left|right|bottom|inset";
const bannedA = new RegExp(`(${GEO})\\s*:\\s*[^,;\\n]{0,60}?isDesktop\\s*\\?`);
const bannedB = new RegExp(`isDesktop\\s*\\?[^\\n]{0,200}?(${GEO})\\s*:`);
const lines = src.split("\n");
lines.forEach((line, i) => {
  if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return; // the explanatory comments name these on purpose
  if (bannedA.test(line) || bannedB.test(line)) fail(`app/home.js:${i + 1} — isDesktop drives a layout dimension again:\n    ${line.trim().slice(0, 160)}\n  Put it in WF_LAYOUT_CSS behind @media(min-width:${bpM[1]}px) instead. This is the exact pattern that produced the 0.4938 shift.`);
});
passed++;

// 6. The inline style on the shell must NOT re-introduce a hardcoded max-width,
//    which would beat the CSS class (inline styles win over stylesheets).
ok(/className="wf-shell" style=\{\{ \.\.\.wrap, maxWidth: undefined \}\}/.test(src),
  "the shell must spread wrap with maxWidth explicitly cleared — an inline max-width overrides the media query");

console.log(`test-layout-shift: OK — ${passed} assertions (responsive layout is CSS-driven at the 900px breakpoint; isDesktop never sets geometry)`);
