// Guardrail: the open rail drop must reserve a viewport of height on desktop.
//
// THE INCIDENT (2026-11-16, field alert "CLS is failing on desktop", p75 0.118):
// PostHog web_vitals attribution named #wf-main ... .wf-scrollarea > .wf-cols as
// the largest shift target. Lab repro at 1440x900 on production: total CLS
// 0.38-0.44 = 0.107 + 0.272 (+0.057), every one of them .wf-cols. The default
// poster ("season", Christmas) opens its drop on load and scrolls the reader to
// it (landOnResults). The drop's composer (SummerIntentRails) renders nothing
// but the 88px "Showing ..." bar until its fetches land, then grows in stages
// (parks, events, guides, bookable activities). .wf-cols sits directly below the
// drop and, after the landing scroll, is INSIDE the viewport, so every stage
// pushed it down: 0.107, then 0.272 when it was shoved out of view.
//
// Fix: a drop whose composer owns its answer gets `is-composed`, and on desktop
// min-height:100vh. .wf-cols then starts at least one viewport below the drop
// top, never visible while the drop fills in. Same lab run with the rule: 0.000.
// Mobile is untouched (rule is inside the 900px media query), and plain place
// drops (SSR list, no async growth) are not padded.
import { readFileSync } from "node:fs";
import { WF_RAIL_MENU_CSS } from "../app/components/railMenuCss.js";

let passed = 0;
const fail = (m) => { console.error("test-rail-menu-reserve: FAIL: " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const css = WF_RAIL_MENU_CSS; // the real exported stylesheet, not a source grep
const rail = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");

// 1. The reservation rule exists, on desktop only, on the composed drop only.
const m = css.match(/@media\(min-width:(\d+)px\)\{\.wf8\.is-open \.wf8-menusec\.is-composed\{min-height:(\d+)vh\}\}/);
ok(!!m, "railMenuCss.js lost the desktop min-height rule for .wf8-menusec.is-composed");
ok(m[1] === "900", "the reservation must sit in the 900px desktop media query (mobile must not change)");
ok(Number(m[2]) >= 100, "the reserve must be at least 100vh or .wf-cols stays visible while the drop grows");
// Exactly one rule, and it is the one inside the media query (an unscoped copy would pad mobile drops).
const count = (str) => str.split("is-composed{min-height").length - 1;
ok(count(css) === 1, "exactly one is-composed min-height rule expected, found " + count(css));
ok(count(css.replace(m[0], "")) === 0, "the only is-composed min-height rule must be the media-scoped one");

// 2. The class is driven by railOwnsItsOwnAnswer (async composers), nothing else.
ok(/className=\{"wf8-menusec" \+ \(railOwnsItsOwnAnswer \? " is-composed" : ""\)\}/.test(rail),
  "DaypartRail must tag the drop section with is-composed when railOwnsItsOwnAnswer");

console.log(`test-rail-menu-reserve: ${passed} assertions passed`);
