#!/usr/bin/env node
// scripts/check-sticky-under-garland.mjs - nothing sticky slides under the
// fixed Christmas garland, and the event section tab rail stays finished.
//
// Owner report 2026-11-27 ("fix it globally"): on event pages the sticky tab
// menu (Overview / Tickets & sharing / Map & directions ...) stuck at top:0,
// under the fixed garland (lib/christmasBackdrop.js, 36px, z-index 35), so the
// bulbs covered the tabs. It was also a black bar on the red page with no
// highlighted tab and no sign that it scrolls sideways.
//
// Contract checked here:
//   1. The garland publishes its height as --wf-fixed-top, equal to the height
//      of the fixed .wf-xmas-lights bar, on the same gate that shows the bar.
//   2. Every position:sticky rule in app/ that pins to the top uses
//      var(--wf-fixed-top ...) (CSS strings, CSS modules and JSX style objects),
//      except the short allowlist of bars inside a modal <dialog> (the top
//      layer is always above the garland).
//   3. The event section rail sits below the garland, under its z-index, takes
//      the Christmas theme colors, highlights the current section and shows the
//      sideways cue (edge fade + arrow) only when more tabs are off screen.
//   4. Negative controls: the scanner flags top:0 sticky rules in all three
//      syntaxes, so this guard cannot pass vacuously.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHRISTMAS_SITE_CSS } from "../lib/christmasBackdrop.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
// EventExperienceStyles.js is JSX; read its CSS template literal as text.
const styleSrc = read("app/components/EventExperienceStyles.js");
const EVENT_EXPERIENCE_CSS = (styleSrc.match(/export const EVENT_EXPERIENCE_CSS = `([\s\S]*?)`;/) || [])[1] || "";
let pass = 0; const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };

// Sticky bars inside a modal <dialog>: the top layer renders above the fixed
// garland, so they pin to the dialog, not the page.
const DIALOG_ALLOW = new Set(["app/components/CreatorVideoAction.js", "app/components/feedbackDialog.js"]);

/** Find sticky declarations that pin to the top without the garland offset. */
export function stickyTopViolations(src) {
  const out = [];
  // CSS rule blocks (CSS files, CSS-in-template-strings).
  for (const m of src.matchAll(/\{([^{}]*?position\s*:\s*sticky[^{}]*)\}/g)) {
    const body = m[1];
    const top = body.match(/(?:^|[;\s])top\s*:\s*([^;}]+)/);
    if (!top) continue; // bottom-only sticky (action bars) cannot meet the garland
    if (!/var\(\s*--wf-fixed-top/.test(top[1])) out.push(`css top:${top[1].trim()}`);
  }
  // JSX style objects: position: "sticky", ... top: <expr>
  for (const m of src.matchAll(/position\s*:\s*["']sticky["']([^}]*)/g)) {
    const top = m[1].match(/\btop\s*:\s*([^,}]+)/);
    if (!top) continue;
    if (!/--wf-fixed-top/.test(top[1])) out.push(`jsx top:${top[1].trim()}`);
  }
  return out;
}

// ---- 4. negative and positive controls for the scanner -----------------------
ok(stickyTopViolations(".a{position:sticky;top:0;z-index:20}").length === 1, "scanner flags a CSS sticky top:0");
ok(stickyTopViolations(".a { position: sticky; top: 20px; }").length === 1, "scanner flags a CSS sticky with a fixed px top");
ok(stickyTopViolations('<div style={{ position: "sticky", top: 0, zIndex: 1 }}>').length === 1, "scanner flags a JSX sticky top:0");
ok(stickyTopViolations(".a{position:sticky;top:var(--wf-fixed-top,0px)}").length === 0, "scanner accepts the garland offset");
ok(stickyTopViolations(".a{position:sticky;top:calc(var(--wf-fixed-top, 0px) + 8px)}").length === 0, "scanner accepts the garland offset inside calc()");
ok(stickyTopViolations(".a{position:sticky;bottom:0}").length === 0, "scanner ignores bottom-only sticky bars");

// ---- 1. the garland publishes its height -----------------------------------
const lightsRule = (CHRISTMAS_SITE_CSS.match(/\.wf-xmas-lights\{display:block;position:fixed;([^}]*)\}/) || [])[1] || "";
const garlandH = Number((lightsRule.match(/height:(\d+)px/) || [])[1]);
const garlandZ = Number((lightsRule.match(/z-index:(\d+)/) || [])[1]);
const fixedTop = Number((CHRISTMAS_SITE_CSS.match(/\{--wf-fixed-top:(\d+)px[;}]/) || [])[1]);
ok(garlandH > 0 && garlandZ > 0, "the fixed garland rule is found (height and z-index)");
ok(fixedTop === garlandH, `--wf-fixed-top (${fixedTop}px) equals the garland height (${garlandH}px)`);
const gate = (CHRISTMAS_SITE_CSS.match(/\n(html\[data-wf-xmas="on"\][^\n{]*) \.wf-xmas-lights\{display:block/) || [])[1];
ok(gate && CHRISTMAS_SITE_CSS.includes(`${gate}{--wf-fixed-top:${garlandH}px;`), "--wf-fixed-top is set on exactly the gate that shows the garland");
ok(/backdrop-filter:blur\(\d+px\)/.test(lightsRule) && /background:linear-gradient/.test(lightsRule), "the band behind the bulbs is frosted, so text scrolling under the lights never shows through sharp");

// ---- 2. every top-pinned sticky rule in app/ uses the offset ---------------
const files = [];
(function walk(dir) {
  for (const name of readdirSync(path.join(REPO, dir))) {
    const rel = path.join(dir, name);
    const st = statSync(path.join(REPO, rel));
    if (st.isDirectory()) walk(rel);
    else if (/\.(m?js|jsx|tsx?|css)$/.test(name)) files.push(rel.split(path.sep).join("/"));
  }
})("app");
ok(EVENT_EXPERIENCE_CSS.length > 1000 && !EVENT_EXPERIENCE_CSS.includes("${"), "the event CSS literal was read whole");
let stickySeen = 0;
for (const rel of files) {
  const src = read(rel);
  if (!/sticky/.test(src)) continue;
  const bad = stickyTopViolations(src);
  if (/position\s*:\s*["']?sticky/.test(src)) stickySeen++;
  if (DIALOG_ALLOW.has(rel)) { ok(/<dialog|wf-feedback-dialog/.test(src), `${rel} is allowlisted because its sticky bar lives in a dialog`); continue; }
  ok(bad.length === 0, `${rel}: sticky bar pins under the garland (${bad.join(", ")}); use top:var(--wf-fixed-top,0px)`);
}
ok(stickySeen >= 5, `the scan actually found the site's sticky rules (${stickySeen} files)`);

// ---- 3. the event section rail ---------------------------------------------
const navRule = (EVENT_EXPERIENCE_CSS.match(/\.wf-event-section-nav\{(--wf-nav-bg[^}]*)\}/) || [])[1] || "";
const navZ = Number((navRule.match(/z-index:(\d+)/) || [])[1]);
ok(/position:sticky/.test(navRule) && /top:calc\(var\(--wf-fixed-top,0px\) \+ var\(--wf-nav-gap,\d+px\)\)/.test(navRule), "the event rail sticks below the garland offset");
ok(navZ > 0 && navZ < garlandZ, `the event rail stacks under the garland (z ${navZ} < ${garlandZ}) and never covers the lights`);
ok(!/background:#080b10/.test(navRule) && /background:var\(--wf-nav-bg\)/.test(navRule), "the rail color comes from theme variables, not a hard black bar");
ok(new RegExp(`${gate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\.wf-event-section-nav\\{--wf-nav-bg:`).test(CHRISTMAS_SITE_CSS), "the Christmas season gives the rail its own on-theme colors");
ok(/\.wf-event-section-rail\{[^}]*overflow-x:auto[^}]*scrollbar-width:none/.test(EVENT_EXPERIENCE_CSS), "the inner rail scrolls sideways without a mid-swipe scrollbar");
ok(/\.wf-event-section-nav\[data-more-right\]::after\{opacity:1\}|\[data-more-right\]::after\{opacity:1\}/.test(EVENT_EXPERIENCE_CSS) && /\[data-more-right\] \.wf-event-section-more\[data-side="right"\]\{display:flex\}/.test(EVENT_EXPERIENCE_CSS), "more tabs off screen show an edge fade and an arrow");
ok(/\.wf-event-section-more\{[^}]*display:none/.test(EVENT_EXPERIENCE_CSS), "the arrow hides when nothing more is off screen");
ok(/a\[aria-current="true"\]\{background:linear-gradient/.test(EVENT_EXPERIENCE_CSS), "the section being read is highlighted");
ok(/scroll-margin-top:calc\(var\(--wf-fixed-top,0px\) \+ \d+px\)/.test(EVENT_EXPERIENCE_CSS), "jumping to a section lands below the garland and the rail");
const nav = read("app/components/EventSectionNav.js");
ok(/aria-current=\{active === section\.id \? "true" : undefined\}/.test(nav), "the nav marks the current section");
ok(/data-more-right=\{more\.right \? "" : undefined\}/.test(nav) && /data-more-left=\{more\.left \? "" : undefined\}/.test(nav), "the nav reports hidden tabs on either edge");
ok(!/scrollIntoView/.test(nav), "keeping the active tab in view moves the rail only, never the page");

if (fail.length) {
  console.error(`check-sticky-under-garland: ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-sticky-under-garland: OK — ${pass} assertions (garland offset, every top sticky bar, event rail look and cue, scanner controls)`);
