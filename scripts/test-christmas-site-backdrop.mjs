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
  CHRISTMAS_LIGHTS_CSS,
  CHRISTMAS_BG_ENDS_AT,
  CHRISTMAS_BG_ENDS_AT_MS,
  CHRISTMAS_BG_GRADIENT,
  CHRISTMAS_BG_MAX_STALE_MS,
  CHRISTMAS_DOODLE_SVG,
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
ok(siteCss.includes(CHRISTMAS_BG_GRADIENT), "the site field uses the Christmas page gradient");
ok(siteCss.includes(":not(:has(.xm-page))") && siteCss.includes(":not(:has(.boo-page))") && siteCss.includes(":not(:has([data-seasonal-search]))") && siteCss.includes(":not(:has([data-wf-own-theme]))"), "themed pages are outside the backdrop");
ok(siteCss.includes("prefers-reduced-motion"), "the garland still honors reduced motion");
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
ok((html.match(/class="xm-bulb"/g) || []).length === 18, "the site garland renders the same 18 bulbs");
ok((html.match(/class="xm-sway"/g) || []).length === 18, "each bulb still hangs and sways");
ok(html.includes('class="xm-doodles"') && html.includes('class="xm-sparkles"') && html.includes('class="wf-xmas-bg"') && html.includes('class="wf-xmas-lights"'), "the red field, doodles and garland all render");
ok(html.includes(CHRISTMAS_BG_GRADIENT), "the rendered stylesheet uses the shared gradient");
ok(html.includes("xm-doodles{background-image:"), "the doodle tile is the same CSS background, not a new image");
ok(html.includes('data-pattern="twinkle"'), "the lights start on the same twinkle pattern");

// 2026-11-24 (owner: "the light bulbs look off"): each bulb hangs from the
// bottom of a wire dip. Read the rendered wire paths and the bulb CSS and
// prove the lowest wire point lands on the bulb cap, on desktop and phone.
{
  const decor = await loadComponent(path.join(root, "app/components/ChristmasDecor.js"), root);
  const swayTop = Number((CHRISTMAS_LIGHTS_CSS.match(/\.xm-sway\{position:absolute;top:(\d+)px/) || [])[1]);
  const bulbTop = Number((CHRISTMAS_LIGHTS_CSS.match(/\.xm-bulb\{\s*position:absolute;left:-8px;top:(\d+)px/) || [])[1]);
  const capTop = (CHRISTMAS_LIGHTS_CSS.match(/\.xm-bulb::before\{[^}]*top:(-?\d+)px;[^}]*height:(\d+)px/) || []);
  const capFrom = swayTop + bulbTop + Number(capTop[1]);
  const capTo = capFrom + Number(capTop[2]);
  ok(Number.isFinite(capFrom) && Number.isFinite(capTo), "bulb cap position is readable from the shared CSS");
  const lowOf = (cls) => {
    const svg = (html.match(new RegExp('<svg class="xm-wire ' + cls + '"[\\s\\S]*?</svg>')) || [])[0] || "";
    const d = (svg.match(/ d="([^"]+)"/) || [])[1] || "";
    const q = d.match(/M0 ([\d.]+) Q[\d.]+ ([\d.]+) [\d.]+ ([\d.]+)/);
    return q ? (Number(q[1]) + 2 * Number(q[2]) + Number(q[3])) / 4 : NaN;
  };
  for (const [cls, expected] of [["xm-wire-desk", decor.WIRE_LOW_DESK], ["xm-wire-phone", decor.WIRE_LOW_PHONE]]) {
    const low = lowOf(cls);
    ok(low === expected, cls + ": the rendered wire matches its documented low point (" + low + ")");
    ok(low >= capFrom && low <= capTo, cls + ": the wire's lowest point (" + low + "px) lands on the bulb cap (" + capFrom + " to " + capTo + "px), not through the glass");
  }
}

console.log("test-christmas-site-backdrop: " + checks + " checks ok");
