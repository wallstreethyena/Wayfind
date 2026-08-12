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

// ─── 7. THE IDLE JUMP (v6.43) ────────────────────────────────────────────────
// A SECOND, unrelated incident on the same page. Owner report: "you're
// stopped, and all of a sudden, it jumps." Production web-vitals CLS
// attribution confirmed it: shifts with cls_load_state="complete" landing
// 17s to 8180s after load, almost all on route "/" with cls_target inside
// #wf-main>…>div.wf-col-main — i.e. the feed moving while nobody touched it.
//
// The only timer-driven layout mutation on the homepage is the "Make a day of
// it" bookable card. Three separate defects stacked:
//   a) todBucket was a COUNTER, so its every tick (and every visibilitychange)
//      re-ran the fetch and re-set the card — ~72×/day plus once per tab focus
//      — even though lib/homeExpPick only rotates on the HOUR.
//   b) the fetch nulled the pick on a thrown request or an empty response,
//      deleting a live card out of the middle of the feed.
//   c) the card's title is clamped to two lines but reserved none, so a short
//      pick and a long pick were different heights.
// Section 5 above bans geometry from isDesktop; this section bans the jump from
// coming back through the refresh path.
const HOME_EXP_NOTE = "\n  This is the v6.43 idle-jump fix — see the comments at each site in app/home.js.";

// a) The hour bucket holds the HOUR, so React bails out when it has not changed.
//
// v6.72: these two asserted the literal string `new Date().getHours()`. They
// went red when the hour moved to its single source (lib/nowContext) even
// though the invariant they exist for — "this value is an HOUR, so it changes
// at most 24x/day" — was untouched. That is the "assert the invariant, not the
// string" trap from CLAUDE.md, and the dangerous half is the inverse: the old
// regex would have gone GREEN on any useState seeded from getHours() even if
// the ticker had been switched back to a counter.
//
// So: accept EITHER hour source by name, and lean on the anti-counter assertion
// below, which is the one that actually encodes the defect.
const HOUR_SOURCE = "(?:new Date\\(\\)\\.getHours\\(\\)|siteHourFloat\\(\\))";
ok(new RegExp("const \\[todBucket, setTodBucket\\] = useState\\(\\(\\) => \\{[^\\n]*" + HOUR_SOURCE).test(src),
  "todBucket must be initialised to the current HOUR (new Date().getHours() or siteHourFloat()), not a counter seed." + HOME_EXP_NOTE);
ok(new RegExp("setTodBucket\\((?:Math\\.floor\\()?" + HOUR_SOURCE).test(src),
  "the todBucket ticker must set the current HOUR." + HOME_EXP_NOTE);
ok(!/setTodBucket\(\s*\(\s*\w+\s*\)\s*=>/.test(src),
  "todBucket must not be an incrementing counter again — every tick would produce a new value and re-run the /api/experiences fetch, re-setting the card ~72×/day for a pick that can only change 24×/day." + HOME_EXP_NOTE);

// b) A refresh may replace the pick; only a center move may clear it.
const expEffect = src.match(/const q = new URLSearchParams\(\{ lat: String\(center\.lat\), lng: String\(center\.lng\), mi: "60"[\s\S]{0,700}?\}, \[screen, center, todBucket\]\);/);
ok(!!expEffect, "the homeExp fetch effect moved or changed shape — re-point this assertion before shipping");
ok(!/setHomeExp\(null\)/.test(expEffect[0]),
  "the homeExp refresh must not null the pick — a thrown fetch or a momentarily empty inventory would delete a live card out of the middle of the feed. Clear it at the center-move check instead." + HOME_EXP_NOTE);
ok(/if \(!cancelled && next\) setHomeExp\(next\)/.test(expEffect[0]),
  "the homeExp refresh must only apply a real replacement pick." + HOME_EXP_NOTE);
ok(/homeExpCenter\.current !== key\) \{ homeExpCenter\.current = key; setHomeExp\(null\); \}/.test(src),
  "the homeExp pick must be cleared when the search center moves — otherwise the previous city's tour survives the move." + HOME_EXP_NOTE);

// c) The clamped title reserves exactly the lines it clamps to.
ok(/const HOME_EXP_TITLE_MIN_H = HOME_EXP_TITLE_FS \* HOME_EXP_TITLE_LH \* 2;/.test(src),
  "HOME_EXP_TITLE_MIN_H must stay DERIVED from the font size and line height — a hardcoded pixel value silently stops matching when the type changes." + HOME_EXP_NOTE);
const titleLine = src.split("\n").find((l) => l.includes("HOME_EXP_TITLE_MIN_H") && l.includes("minHeight"));
ok(!!titleLine, "no JSX element applies HOME_EXP_TITLE_MIN_H as a minHeight — the bookable card's title is unreserved again." + HOME_EXP_NOTE);
ok(/WebkitLineClamp: 2\b/.test(titleLine),
  "the reserved title must still clamp to exactly 2 lines — the reservation and the clamp have to agree or the card can outgrow its reserved box." + HOME_EXP_NOTE);
ok(/fontSize: HOME_EXP_TITLE_FS/.test(titleLine) && /lineHeight: HOME_EXP_TITLE_LH/.test(titleLine),
  "the reserved title must read its font size and line height from the same constants the reservation is derived from." + HOME_EXP_NOTE);

console.log(`test-layout-shift: OK — ${passed} assertions (responsive layout is CSS-driven at the 900px breakpoint; isDesktop never sets geometry; the hourly bookable-card refresh cannot move the feed)`);
