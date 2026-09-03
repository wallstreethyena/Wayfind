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
import { shellSrc } from "./lib/shellSrc.mjs";

let passed = 0;
const fail = (m) => { console.error("test-layout-shift: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const src = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// The CSS itself was lifted into app/components/css.js (July 2026 decomposition,
// wave 1) — same shell, same single server-rendered <style> tag, just not the
// same file. The CONTRACT this test enforces is unchanged, so the CSS-literal
// assertions read the whole shell while the JSX assertions below stay pinned to
// home.js, where the markup and the isDesktop scan actually live.
const shell = shellSrc();

// 1. The CSS exists and is server-rendered inline (not a client-only injection).
ok(shell.includes("WF_LAYOUT_CSS"), "WF_LAYOUT_CSS is gone — the responsive layout must ship as CSS");
const cssM = shell.match(/const WF_LAYOUT_CSS = `([^`]*)`/);
ok(!!cssM, "WF_LAYOUT_CSS must be a plain template literal so it is server-rendered");
// The literal contains ${WF_DESKTOP_BP}; resolve it so we assert the real breakpoint.
const bpM = shell.match(/const WF_DESKTOP_BP = (\d+)/);
ok(!!bpM, "WF_DESKTOP_BP is missing");
const css = cssM[1].replaceAll("${WF_DESKTOP_BP}", bpM[1]);
// RE-POINTED (commit 3d95dd7 "fix(hydration): search/map/all interactivity
// dead — style-tag quote trap (HOTFIX) (#355)"). The inline <style>{`...`}`
// form broke React SSR escaping once the CSS itself contained double quotes
// (content:"", url("...")), which killed site interactivity — that HOTFIX
// correctly switched to <style dangerouslySetInnerHTML={{ __html: `...` }} />.
// The guarantee this assertion protects — WF_LAYOUT_CSS is concatenated into
// a SERVER-RENDERED <style> tag, not injected by a client-side effect — still
// holds under the new form, so we just recognize the new syntax.
ok(/<style dangerouslySetInnerHTML=\{\{ __html: `[^`]*\$\{WF_LAYOUT_CSS\}/.test(src), "WF_LAYOUT_CSS must be rendered into the inline <style dangerouslySetInnerHTML> block");

// 2. The breakpoint must stay in lockstep with the old JS threshold (900).
ok(shell.includes("const WF_DESKTOP_BP = 900"), "WF_DESKTOP_BP must be 900 to match the previous vw >= 900 behaviour");
ok(css.includes("@media(min-width:900px)"), "the media query must use the 900px breakpoint");

// 3. Every layout class the JSX references must be defined in the CSS, and vice
//    versa — a class that exists in only one place is a silently-broken layout.
const classes = ["wf-shell", "wf-col-main", "wf-hooks", "wf-hook-card", "wf-explore", "wf-cols", "wf-col-side"];
// v7.29: the USAGE half reads the whole shell, not home.js alone. .wf-col-side
// is applied by app/components/HomeAside.js, which is registered shell content
// (scripts/lib/shellSrc.mjs) — the same decomposition contract that already let
// the CSS literal move to app/components/css.js. The pairing this asserts is
// "every layout class is both defined and applied somewhere in the shell", and
// that is unchanged. The isDesktop scan in §5 stays pinned to home.js.
for (const c of classes) {
  ok(css.includes("." + c + "{"), `CSS rule for .${c} is missing`);
  ok(shell.includes(`className="${c}"`), `no JSX element in the home shell uses .${c} — dead layout class`);
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

// ─── 6b. THE DESKTOP RAIL DEFAULT IS ALSO A MEDIA QUERY (v7.29) ─────────────
// lib/railCollapse.js has to name the desktop breakpoint as a media-query
// STRING, because app/components/css.js already imports RAIL_IDS from it and
// importing WF_DESKTOP_BP back would close the cycle. A restated number is a
// number that drifts, so assert the two agree — and that the choice is made by
// matchMedia before paint rather than by state after mount, which is §5's rule
// applied to content instead of geometry.
const collapseSrc = readFileSync(new URL("../lib/railCollapse.js", import.meta.url), "utf8");
const mqM = collapseSrc.match(/RAILS_DESKTOP_MQ = "\(min-width:(\d+)px\)"/);
ok(!!mqM, "RAILS_DESKTOP_MQ must stay a (min-width:Npx) literal so this assertion can read it");
ok(mqM[1] === bpM[1], `RAILS_DESKTOP_MQ is ${mqM[1]}px but WF_DESKTOP_BP is ${bpM[1]}px — the rails would open at a different width than the desktop layout arrives at`);
const layoutSrc = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
ok(/window\.matchMedia\('\$\{RAILS_DESKTOP_MQ\}'\)\.matches/.test(layoutSrc),
  "the desktop rail default must be chosen by matchMedia in the pre-paint script, at the true width, before anything paints");
ok(!/isDesktop[^\n]*DEFAULT_COLLAPSED_RAILS/.test(src),
  "the collapsed default must never be selected from JS state — same rule as §5, one layer up: it decides how tall the feed is on first paint");

// ─── 7. THE AFFILIATE RAIL CANNOT IDLE-JUMP ───────────────────────────────
// The former hourly singleton mutated the middle of the feed on a timer. The
// replacement is a stable ranked window: it fetches only when screen/center
// changes, retains a live rail across transient refresh failures, and every card
// inherits the fixed .wf-place-card geometry.
ok(!/todBucket|setInterval\(tick, 5 \* 60 \* 1000\)|pickHomeExp/.test(src),
  "the removed rotating singleton must not leave a timer-driven layout mutation behind");

const affiliateEffect = src.match(/const key = String\(center\.lat\)[\s\S]{0,1200}?\}, \[screen, center\]\);/);
ok(!!affiliateEffect, "the home affiliate fetch remains scoped to screen and center");
ok(/homeAffiliateCenter\.current !== key[\s\S]{0,160}?setHomeAffiliateItems\(\[\]\)/.test(affiliateEffect[0]),
  "a real center move clears the old city's affiliate rail");
ok(!/catch[^}]*setHomeAffiliateItems\(\[\]\)/.test(affiliateEffect[0]),
  "a transient refresh failure cannot collapse an already-visible rail");
ok(/if \(!cancelled && next\.length\) setHomeAffiliateItems\(next\)/.test(affiliateEffect[0]),
  "only a non-empty validated replacement may update the rail");

const affiliateComponent = readFileSync(new URL("../app/components/HomeAffiliateActivityRail.js", import.meta.url), "utf8");
ok(/className="wf-place-card wf-rail-card is-no-take"/.test(affiliateComponent),
  "every affiliate activity inherits the fixed iconic place-card geometry");
ok(!/minHeight|fit-content|height:\s*["']?auto/.test(affiliateComponent),
  "the activity rail does not reintroduce content-driven card geometry");
{
  const cssSrc = readFileSync(new URL("../app/components/css.js", import.meta.url), "utf8").replace(/\s*\n\s*/g, "");
  const rule = (cssSrc.match(/\.wf-place-card\{[^}]*\}/) || [""])[0];
  ok(/--wf-card-h:\d+px/.test(rule) && /height:var\(--wf-card-h\)/.test(rule),
    ".wf-place-card still owns a fixed height");
}


console.log(`test-layout-shift: OK — ${passed} assertions (responsive layout is CSS-driven at the 900px breakpoint; isDesktop never sets geometry; the affiliate rail cannot idle-jump)`);
