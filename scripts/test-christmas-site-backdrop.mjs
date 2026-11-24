#!/usr/bin/env node
// The Christmas field and garland from /christmas-in-florida, shown site-wide
// until 2026-12-25 23:59:59 America/New_York and gone at 2026-12-26 00:00 ET.
//
// CLASS: CALL. christmasBackdropActive() and installChristmasBackdropClock()
// are invoked. The rendered backdrop is the real component (jsxLoad), so the
// bulb count and the shared gradient are what the page emits, not a regex
// over a comment.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  CHRISTMAS_BG_ENDS_AT,
  CHRISTMAS_BG_ENDS_AT_MS,
  CHRISTMAS_BG_GRADIENT,
  CHRISTMAS_BG_MAX_STALE_MS,
  CHRISTMAS_DOODLE_SVG,
  CHRISTMAS_GARLAND_H,
  CHRISTMAS_SITE_BG_GRADIENT,
  christmasBackdropActive,
  christmasBackdropBootScript,
  installChristmasBackdropClock,
} from "../lib/christmasBackdrop.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.equal(!!cond, true, msg); checks += 1; };

ok(CHRISTMAS_BG_ENDS_AT === "2026-12-26T00:00:00-05:00", "the single end constant is 2026-12-26 00:00 America/New_York");
ok(CHRISTMAS_BG_ENDS_AT_MS === Date.parse("2026-12-26T00:00:00-05:00"), "the millisecond value is derived from that constant");
ok(CHRISTMAS_BG_MAX_STALE_MS === 180000, "the stale ceiling is three minutes");
ok((read("lib/christmasBackdrop.js").match(/CHRISTMAS_BG_ENDS_AT = /g) || []).length === 1, "one end-date constant, not a second copy");

const on = [
  new Date("2026-11-23T19:30:00Z"),
  new Date("2026-12-25T23:59:59-05:00"),
  new Date("2026-12-26T04:59:59Z"),
];
const off = [
  new Date("2026-12-26T00:00:00-05:00"),
  new Date("2026-12-26T05:00:00Z"),
  new Date("2026-12-26T00:00:01-05:00"),
  new Date("2027-01-01T00:00:00-05:00"),
];
for (const d of on) ok(christmasBackdropActive(d) === true, d.toISOString() + " is still on");
for (const d of off) ok(christmasBackdropActive(d) === false, d.toISOString() + " is off");
ok(christmasBackdropActive(new Date(CHRISTMAS_BG_ENDS_AT_MS - 1)) === true, "the millisecond before the end is on");
ok(christmasBackdropActive(new Date(CHRISTMAS_BG_ENDS_AT_MS)) === false, "the end instant itself is off");

const attrs = {};
const fake = { setAttribute: (k, v) => { attrs[k] = v; } };
const stopOn = installChristmasBackdropClock(fake, () => Date.parse("2026-12-25T23:59:59-05:00"));
ok(attrs["data-wf-xmas"] === "on", "the clock sets data-wf-xmas=on before the end");
stopOn();
const stopOff = installChristmasBackdropClock(fake, () => Date.parse("2026-12-26T00:00:00-05:00"));
ok(attrs["data-wf-xmas"] === "off", "the clock sets data-wf-xmas=off at the end");
stopOff();

const boot = christmasBackdropBootScript();
ok(boot.includes(String(CHRISTMAS_BG_ENDS_AT_MS)), "the head script carries the same end instant");
ok(boot.includes("2147483647"), "the head script re-arms under the setTimeout ceiling");
ok(boot.includes("visibilitychange"), "a tab that was hidden rechecks the clock when it returns");
ok(!boot.includes("</"), "the head script cannot close the script tag early");
ok(boot.startsWith("(function(){") && boot.endsWith("})();"), "the head script runs immediately, not on a timer of its own");

const layout = read("app/layout.js");
const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
ok(head.includes("christmasBackdropBootScript()"), "the clock script is in <head>, before the body can paint");
ok(!/christmasBackdropBootScript\(\)[\s\S]{0,80}(async|defer)/.test(head), "the clock script is blocking");
ok(layout.includes('background: "#040810"'), "the body keeps the master black as the off-season color");
ok(layout.includes("christmasBackdropActive()"), "the server attribute is the no-JS fallback");
ok(layout.includes("<ChristmasSiteBackdrop />"), "the backdrop mounts from the root layout");
ok(!/export const revalidate/.test(layout), "the root layout does not shorten every route's ISR to force the cutoff");

const siteCss = read("lib/christmasBackdrop.js");
// Owner 2026-11-24 ("the color in the back is not fitting"): the site field is
// midnight navy with a warm gold glow; the red stays on the Christmas page.
ok(/CHRISTMAS_SITE_BG_GRADIENT = "[^"]*#0B1220/.test(siteCss) && !/#7A0F22|#4A0816/.test(CHRISTMAS_SITE_BG_GRADIENT), "the site field is midnight navy, not the wine red");
ok(/\.wf-xmas-bg\{[^}]*background:\$\{CHRISTMAS_SITE_BG_GRADIENT\}/.test(siteCss), "the site field paints the navy gradient");
ok(siteCss.includes(":not(:has(.xm-page))") && siteCss.includes(":not(:has(.boo-page))") && siteCss.includes(":not(:has([data-seasonal-search]))") && siteCss.includes(":not(:has([data-wf-own-theme]))"), "themed pages are outside the backdrop");
ok(/prefers-reduced-motion:reduce\)\{\.xm-glow\{animation:none/.test(siteCss), "the garland still honors reduced motion");
ok(CHRISTMAS_DOODLE_SVG.includes("M26 6v48") && CHRISTMAS_DOODLE_SVG.includes("translate(120 290)") && CHRISTMAS_DOODLE_SVG.includes("translate(400 250)"), "the doodle tile is the existing gift, cane and tree drawing");

const tickets = read("app/components/ChristmasTickets.js");
ok(tickets.includes("CHRISTMAS_BG_GRADIENT") && tickets.includes("CHRISTMAS_DOODLE_CSS") && tickets.includes("CHRISTMAS_LIGHTS_CSS"), "the Christmas page paints the shared field, doodles and lights");
ok(tickets.includes('from "./ChristmasDecor.js"'), "the Christmas page uses the shared garland component");
ok(!/const DOODLE_SVG/.test(tickets) && !/function FestivalLights/.test(tickets), "the art is not copied back into the Christmas page");

ok(read("app/home.js").includes('className="wf-shell" style={{ ...wrap, maxWidth: undefined }} data-wf-own-theme={screen === "map" ? "map" : undefined}'), "the map screen opts out while it is open, without putting a width back on the shell");
ok(read("app/command-center/ui.js").includes('data-wf-own-theme="command-center"'), "command center keeps its own theme");
ok(read("app/go/florida/page.js").includes('data-wf-own-theme="florida-landing"'), "the Florida marketing landing keeps its own theme");
ok(read("app/components/PaidLanding.js").includes('data-wf-own-theme="paid-landing"'), "paid city landings keep their own theme");
ok(read("app/oauth/consent/OAuthConsentClient.js").includes('data-wf-own-theme="oauth"'), "the OAuth consent screen keeps its own theme");
ok(read("app/guides/guides.module.css").includes('html[data-wf-xmas="on"]'), "the guides hub canvas clears while the season is on");
ok(read("app/components/css.js").includes("/brand/wayfind-wordmark-original-v3.png"), "the wordmark asset is unchanged");

const { default: ChristmasSiteBackdrop } = await loadComponent(
  path.join(root, "app/components/ChristmasSiteBackdrop.js"),
  root,
);
const html = renderToStaticMarkup(createElement(ChristmasSiteBackdrop));
// Premium header (owner 2026-11-24, "the lights at the top are not looking
// premium"): one thin gold wire with small warm white lights. No cartoon
// bulbs, bows, doodles or sparkles on the site header.
ok((html.match(/class="xm-glow"/g) || []).length === 16, "the site garland renders 16 small warm lights");
ok(!/class="xm-bulb"|class="xm-bow|class="xm-sway"|class="xm-doodles"|class="xm-sparkles"/.test(html), "no cartoon bulbs, bows, doodles or sparkles on the site header");
ok(html.includes('class="xm-garland-wire"') && html.includes('stop-color="#F1D592"'), "the wire is a gold gradient line");
ok(html.includes('class="wf-xmas-bg"') && html.includes('class="wf-xmas-lights"'), "the navy field and the garland both render");
ok(html.includes(CHRISTMAS_SITE_BG_GRADIENT) && !html.includes(CHRISTMAS_BG_GRADIENT), "the rendered stylesheet uses the navy field, not the Christmas page red");
ok(CHRISTMAS_GARLAND_H === 22 && html.includes("padding-top:calc(22px + max(6px, env(safe-area-inset-top)))"), "the garland is 22px and the header pads by that, not the old 36px");
ok(!/#FF4458|#3DDC84|#4DA3FF|#FF7AC8/.test(html), "no multicolor bulb colors reach the site header");

console.log("test-christmas-site-backdrop: " + checks + " checks ok");
